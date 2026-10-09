/**
 * AI Support Widget — commercial support widget, theme "Onyx".
 * ───────────────────────────────────────────────────────────────────────
 * One installable <script> per theme: no framework, no build step, no extra
 * request at runtime. All eleven bundles share the same markup, states and
 * design system, inlined from static/widget/design-core.css + themes/*.css and
 * scripts/widget_source/widget-shell.js by scripts/sync_widget_design.py.
 *
 * Behaviour contract (identical in every theme):
 *   · AI chat — JSON fallback and SSE streaming, with citations and feedback
 *   · live human support — request, wait, agent replies, close, back to AI
 *   · conversation memory — server token plus a short local transcript
 *   · lead capture / contact channels, voice input, business rules, analytics
 *   · admin live preview over postMessage
 *
 * The API contract is unchanged: /api/chat/, /api/chat/stream/, /api/history/,
 * /api/messages/, /api/feedback/, /api/leads/, /api/events/, /api/handoff/ and
 * /api/handoff/stream/ keep their exact request and response shapes.
 */

(function () {
  "use strict";

  if (window.AISupportWidget) return;

  var scriptElement = document.currentScript;
  var scriptConfig = scriptElement && scriptElement.dataset ? scriptElement.dataset : {};

  /* == BEGIN live-handoff (generated from static/widget/live-handoff.js) == */
/**
 * AI Support — live human-handoff client (shared by all 11 widget bundles and
 * the operator panel's live conversation view).
 *
 * Why a shared file instead of 11 copies: the widget ships as eleven
 * self-contained theme bundles (classic, onyx, linen, …) that intentionally
 * duplicate their *skin* but must never drift in *behaviour*. Every bundle
 * therefore loads this one file on demand (only when the installation has
 * `SiteProfile.enable_human_handoff` enabled) and hands it a small adapter —
 * the theme keeps owning its look, this file owns the protocol.
 *
 * What it implements (one place, no per-theme logic):
 *   · request → POST /api/handoff/ (channel=live_agent, token-bound)
 *   · receive → SSE on /api/handoff/stream/ read with fetch + ReadableStream
 *     (EventSource cannot send X-Widget-Key / X-Conversation-Token)
 *   · fallback → short polling of /api/messages/ if the body is not streamable
 *   · idempotent rendering → every event carries a monotonic message id; the
 *     client keeps a cursor + a seen-set so a reconnect, a duplicated frame or
 *     an out-of-order delivery can never double-paint a message
 *   · lifecycle → bounded reconnect with backoff, tab-visibility awareness,
 *     abort on destroy, no timers left behind
 *   · mode → AI / waiting / human, mirrored into the theme header
 *
 * Exports (window.AISupportLive):
 *   STATE, TEXT, openStream(opts), liveSession(opts), createWidgetClient(adapter)
 */
(function (global) {
  "use strict";

  if (global.AISupportLive) return;

  var STATE = { AI: "ai", WAITING: "waiting", HUMAN: "human" };

  var TEXT = {
    cta: "اتصال به پشتیبانی انسانی",
    requested: "درخواست شما ثبت شد ✅ — کارشناس انسانی همین‌جا در گفتگو پاسخ می‌دهد.",
    waiting: "در انتظار پاسخ کارشناس…",
    waitingSla: function (minutes) { return "یک کارشناس در حال بررسی درخواست شماست (حدود " + minutes + " دقیقه)."; },
    claimed: "یک کارشناس به گفتگو پیوست.",
    closed: "پشتیبانی انسانی پایان یافت. دستیار هوشمند دوباره فعال شد.",
    delivered: "پیام شما برای کارشناس ارسال شد.",
    failed: "ثبت درخواست پشتیبانی ناموفق بود. لطفاً دوباره تلاش کنید.",
    disabled: "پشتیبانی انسانی برای این سایت فعال نیست.",
    needConversation: "برای اتصال به کارشناس، ابتدا یک پیام در گفتگو ارسال کنید."
  };

  /** Timing knobs. Overridable (tests use tight values); never a hardcoded
   *  infinite loop — every delay is bounded and every timer is cleared on
   *  stop/destroy. */
  var SETTINGS = {
    reconnectDelay: 400,
    maxBackoff: 15000,
    pollInterval: 2000,
  };

  var CLOSED_NOTICE_MARKERS = ["واگذار", "پایان"];
  var CLAIM_NOTICE_MARKERS = ["کارشناس انسانی گفتگو", "پیوست"];
  var WAITING_NOTICE_MARKERS = ["در انتظار", "بررسی درخواست"];

  function isClosedNotice(text) {
    if (typeof text !== "string") return false;
    return CLOSED_NOTICE_MARKERS.some(function (m) { return text.indexOf(m) !== -1; });
  }

  function isClaimNotice(text) {
    if (typeof text !== "string") return false;
    return CLAIM_NOTICE_MARKERS.some(function (m) { return text.indexOf(m) !== -1; });
  }

  function isWaitingNotice(text) {
    if (typeof text !== "string") return false;
    return WAITING_NOTICE_MARKERS.some(function (m) { return text.indexOf(m) !== -1; });
  }

  /** Is the given transcript tail already the notice for this human state? */
  function hasStateNotice(text, status) {
    return status === "claimed" ? isClaimNotice(text) : isWaitingNotice(text);
  }

  function noop() {}

  /* ───────────────────────── SSE over fetch ───────────────────────── */

  /**
   * Read one SSE response body and hand every frame to `onEvent`.
   * Returns a handle with `close()` and the live cursor.
   */
  function openStream(opts) {
    var headers = opts.headers || {};
    var onEvent = opts.onEvent || noop;
    var onError = opts.onError || noop;
    var onEnd = opts.onEnd || noop;
    var cursor = Math.max(0, Number(opts.afterId) || 0);
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var cancelled = false;
    var closedByServer = false;
    // Distinguishes "the server streamed and finished" from "this response was
    // not streamable at all" — the latter must fall back to polling at once.
    var readable = false;

    function emit(name, data) {
      if (name === "message" && data && typeof data.id === "number") {
        if (data.id <= cursor) return; // duplicate frame → never re-paint
        cursor = data.id;
      }
      if (name === "connected" && data && typeof data.after_id === "number") {
        cursor = Math.max(cursor, data.after_id);
      }
      if (name === "closed") closedByServer = true;
      onEvent(name, data || {}, cursor);
    }

    function parseFrames(raw) {
      var name = "message";
      var lines = raw.split("\n");
      var dataLines = [];
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.indexOf("event:") === 0) name = line.slice(6).trim();
        else if (line.indexOf("data:") === 0) dataLines.push(line.slice(5).trim());
      }
      if (!dataLines.length) return;
      var data;
      try { data = JSON.parse(dataLines.join("\n")); } catch (_) { return; }
      emit(name, data);
    }

    var promise = (function () {
      if (typeof fetch !== "function") return Promise.resolve(null);
      var url = opts.streamUrl
        + (opts.streamUrl.indexOf("?") === -1 ? "?" : "&")
        + "conversation_id=" + encodeURIComponent(opts.conversationId || "")
        + "&token=" + encodeURIComponent(opts.token || "")
        + "&after_id=" + cursor;
      return fetch(url, {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        headers: headers,
        signal: controller ? controller.signal : undefined,
      }).then(function (res) {
        if (!res.ok) {
          var error = new Error("stream_failed_" + res.status);
          error.status = res.status;
          throw error;
        }
        if (!res.body || !res.body.getReader) return null; // → polling fallback
        readable = true;
        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var buffer = "";
        function pump() {
          return reader.read().then(function (chunk) {
            if (cancelled) return null;
            if (chunk.done) return null;
            buffer += decoder.decode(chunk.value, { stream: true });
            var frames = buffer.split("\n\n");
            buffer = frames.pop();
            frames.forEach(parseFrames);
            return pump();
          });
        }
        return pump();
      });
    })();

    promise.then(function () {
      if (cancelled) return;
      onEnd({ streamed: readable, closed: closedByServer });
    }).catch(function (error) {
      if (cancelled) return;
      if (error && error.name === "AbortError") return;
      onError(error);
    });

    return {
      close: function () {
        cancelled = true;
        if (controller) {
          try { controller.abort(); } catch (_) {}
        }
      },
      getCursor: function () { return cursor; },
      closedByServer: function () { return closedByServer; },
    };
  }

  /* ───────────────────── session (retry + fallback) ───────────────── */

  /**
   * A resilient conversation feed: keeps an SSE stream open while the page is
   * visible, reconnects after the server-side bounded stream ends, backs off
   * on failures and falls back to short polling when streaming is impossible.
   */
  function liveSession(opts) {
    var onEvent = opts.onEvent || noop;
    var onStateChange = opts.onStateChange || noop;
    var pollInterval = Number(opts.pollInterval) || SETTINGS.pollInterval;
    var maxBackoff = Number(opts.maxBackoff) || SETTINGS.maxBackoff;
    var reconnectDelay = Number(opts.reconnectDelay) || SETTINGS.reconnectDelay;
    var cursor = Math.max(0, Number(opts.afterId) || 0);
    var handle = null;
    var pollTimer = null;
    var retryTimer = null;
    var failures = 0;
    var stopped = false;
    var polling = false;
    var seen = {};
    var loggedSeen = 0;

    function remember(id) {
      if (typeof id !== "number") return false;
      if (seen[id]) return true;
      seen[id] = true;
      loggedSeen++;
      if (loggedSeen > 500) {
        // Keep memory bounded: drop the oldest half once the window is huge.
        var keys = Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
        keys.slice(0, 250).forEach(function (k) { delete seen[k]; });
        loggedSeen = keys.length - 250;
      }
      return false;
    }

    /**
     * Single gate for everything that reaches the UI.
     *
     * Message ids are monotonic per conversation, so this one function gives us
     * ordering *and* idempotency: anything at or below the cursor is a replay
     * (reconnect, duplicated frame, overlapping poll) and is dropped, and the
     * seen-set covers the remaining case of an id that arrives after the cursor
     * was already advanced by a `connected`/`status` frame.
     */
    function deliver(name, data) {
      if (name === "message" && data && typeof data.id === "number") {
        if (data.id <= cursor) return;
        if (remember(data.id)) return;
        cursor = data.id;
      }
      onEvent(name, data || {}, cursor);
    }

    function schedule(delay) {
      if (stopped) return;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(function () {
        retryTimer = null;
        start();
      }, delay);
    }

    function startPolling() {
      if (stopped || polling) return;
      polling = true;
      onStateChange({ transport: "polling" });
      function tick() {
        if (stopped) return;
        var url = opts.pollUrl
          + (opts.pollUrl.indexOf("?") === -1 ? "?" : "&")
          + "conversation_id=" + encodeURIComponent(opts.conversationId || "")
          + "&token=" + encodeURIComponent(opts.token || "")
          + "&after_id=" + cursor;
        fetch(url, {
          method: "GET",
          mode: "cors",
          credentials: "omit",
          headers: opts.headers || {},
        }).then(function (res) {
          if (!res.ok) throw new Error("poll_" + res.status);
          return res.json();
        }).then(function (data) {
          failures = 0;
          (data.messages || []).forEach(function (m) {
            deliver("message", m);
          });
          if (data.human) onEvent("status", data.human, cursor);
          if (!data.live_agent) deliver("closed", data.human || {});
          pollTimer = setTimeout(tick, pollInterval);
        }).catch(function () {
          failures++;
          pollTimer = setTimeout(tick, Math.min(maxBackoff, pollInterval * (1 + failures)));
        });
      }
      tick();
    }

    function start() {
      if (stopped) return;
      if (global.document && global.document.visibilityState === "hidden") return;
      if (typeof fetch !== "function" || !opts.streamUrl) {
        startPolling();
        return;
      }
      handle = openStream({
        streamUrl: opts.streamUrl,
        headers: opts.headers || {},
        conversationId: opts.conversationId,
        token: opts.token,
        afterId: cursor,
        onEvent: function (name, data) {
          failures = 0;
          deliver(name, data);
        },
        onEnd: function (info) {
          if (stopped) return;
          if (handle) {
            cursor = Math.max(cursor, handle.getCursor());
            handle = null;
          }
          if (info && info.closed) {
            // Server ended the stream after a `closed` event: the client is
            // going back to AI mode, so stop instead of hammering it.
            if (opts.stopOnClosed !== false) { stop(); return; }
          }
          if (!info || !info.streamed) {
            // This response had no readable body (proxy buffering, a polyfill,
            // an old browser): stop retrying and use the short-poll fallback.
            startPolling();
            return;
          }
          // A bounded server stream always ends; reconnect instantly, the
          // cursor makes it lossless. Failures fall back to polling.
          if (failures >= 2) startPolling();
          else schedule(reconnectDelay);
        },
        onError: function () {
          failures++;
          if (failures >= 2) startPolling();
          else schedule(Math.min(maxBackoff, 800 * failures));
        },
      });
    }

    function onVisibility() {
      if (stopped) return;
      if (global.document.visibilityState === "hidden") {
        if (handle) { handle.close(); handle = null; }
        if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      } else if (!handle && !polling) {
        failures = 0;
        start();
      }
    }

    function stop() {
      stopped = true;
      if (handle) { handle.close(); handle = null; }
      if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      if (global.document && global.document.addEventListener) {
        global.document.removeEventListener("visibilitychange", onVisibility);
      }
    }

    if (global.document && global.document.addEventListener) {
      global.document.addEventListener("visibilitychange", onVisibility);
    }
    start();

    return {
      stop: stop,
      start: function () { if (!stopped) onVisibility(); },
      getCursor: function () { return cursor; },
      isPolling: function () { return polling; },
    };
  }

  /* ─────────────────── widget (theme-agnostic) client ─────────────── */

  /**
   * Build the human-support client for one widget instance.
   *
   * `adapter` is the only theme-specific surface (≈10 tiny functions), so the
   * protocol, dedupe, state machine and lifecycle are identical in all themes:
   *
   *   getEndpoints()   -> {handoff, stream, messages}
   *   getConversation()-> {id, token}
   *   getHeaders()     -> request headers (widget key, token)
   *   isEnabled()      -> live handoff available for this installation?
   *   slaMinutes()     -> number
   *   lastMessageId()  -> numeric cursor of the last rendered message
   *   appendAgent(text)-> render an operator bubble
   *   appendSystem(text, kind) -> render a system notice
   *   setMode(mode, info)      -> header chip / subtitle
   *   toast(text), notify(), isOpen()
   */
  function createWidgetClient(adapter) {
    var session = null;
    var state = STATE.AI;
    var human = {};
    var lastRenderedText = "";
    var requested = false;
    var cursor = Math.max(0, Number(adapter.lastMessageId && adapter.lastMessageId()) || 0);

    function currentConversation() {
      var conv = adapter.getConversation() || {};
      return { id: conv.id || "", token: conv.token || "" };
    }

    function setMode() {
      state = !human.active ? STATE.AI : human.status === "claimed" ? STATE.HUMAN : STATE.WAITING;
      adapter.setMode(state, human);
    }

    /**
     * Render a system line once. Repeats are suppressed only while nothing
     * else was painted in between, so a stream of user messages while the
     * operator is away produces a single "delivered" acknowledgement, but the
     * next acknowledgement after an operator reply still shows up.
     */
    function appendSystemOnce(text, kind) {
      if (!text) return false;
      if (lastRenderedText === text) return false;
      lastRenderedText = text;
      adapter.appendSystem(text, kind || "system");
      return true;
    }

    function startSession() {
      var conv = currentConversation();
      if (!conv.id || !conv.token) return;
      if (session) return;
      var endpoints = adapter.getEndpoints() || {};
      if (!endpoints.stream && !endpoints.messages) return;
      session = liveSession({
        streamUrl: endpoints.stream,
        pollUrl: endpoints.messages,
        headers: adapter.getHeaders() || {},
        conversationId: conv.id,
        token: conv.token,
        afterId: cursor,
        onEvent: handleEvent,
      });
    }

    function stopSession() {
      if (session) { session.stop(); session = null; }
    }

    function handleEvent(name, data) {
      if (name === "connected" || name === "status" || name === "claimed" || name === "closed") {
        if (data && typeof data === "object" && "active" in data) {
          var wasHuman = state !== STATE.AI;
          human = data;
          setMode();
          if (name === "claimed" && !isClaimNotice(lastRenderedText)) {
            appendSystemOnce(TEXT.claimed, "claimed");
          }
          if (name === "closed") {
            // Only announce a hand-off ending to a visitor who was actually in
            // one; a stray frame on an idle conversation must stay silent.
            if (wasHuman && !isClosedNotice(lastRenderedText)) {
              appendSystemOnce(TEXT.closed, "closed");
            }
            adapter.setMode(STATE.AI, {});
          }
        }
        if (name === "closed") stopSession();
        return;
      }
      if (name === "message" && data) {
        if (typeof data.id === "number" && data.id > cursor) cursor = data.id;
        if (data.sender === "agent") {
          lastRenderedText = data.content;
          adapter.appendAgent(data.content, data);
          if (!adapter.isOpen || !adapter.isOpen()) adapter.notify();
        } else if (data.sender === "system") {
          appendSystemOnce(data.content, "system");
          lastRenderedText = data.content;
        }
        return;
      }
      if (name === "error") {
        // Transport problems are handled by the session (backoff/polling).
      }
    }

    return {
      STATE: STATE,

      TEXT: TEXT,

      mode: function () { return state; },

      state: function () { return human; },

      isActive: function () { return state !== STATE.AI; },

      /** Called after config/history load to re-attach a live conversation.
       *
       *  ``tailText`` is the last agent/system line already present in the
       *  restored transcript: a refreshed page must not repeat the notice for
       *  the state it is already showing.
       */
      restore: function (incoming, atCursor, tailText) {
        if (typeof atCursor === "number" && atCursor > cursor) cursor = atCursor;
        if (!incoming || typeof incoming !== "object") return false;
        if (typeof tailText === "string" && tailText) lastRenderedText = tailText;
        human = incoming;
        setMode();
        if (human.active) {
          startSession();
          var alreadyShown = hasStateNotice(tailText, human.status);
          if (human.status === "claimed") {
            if (!alreadyShown) appendSystemOnce(TEXT.claimed, "claimed");
          } else if (!alreadyShown) {
            appendSystemOnce(
              human.sla_minutes ? TEXT.waitingSla(human.sla_minutes) : TEXT.waiting,
              "waiting"
            );
          }
          return true;
        }
        return false;
      },

      /** CTA / fallback-bar button: ask for a human inside the widget. */
      request: function (question) {
        var conv = currentConversation();
        var endpoints = adapter.getEndpoints() || {};
        if (!adapter.isEnabled()) {
          adapter.toast(TEXT.disabled);
          return Promise.resolve(false);
        }
        if (!conv.id || !conv.token) {
          adapter.toast(TEXT.needConversation);
          return Promise.resolve(false);
        }
        if (requested) return Promise.resolve(state !== STATE.AI);
        requested = true;
        appendSystemOnce(TEXT.requested, "requested");
        return fetch(endpoints.handoff, {
          method: "POST",
          mode: "cors",
          credentials: "omit",
          headers: adapter.getHeaders() || {},
          body: JSON.stringify({
            channel: "live_agent",
            message: (question || "").substring(0, 2000),
            conversation_id: conv.id,
            conversation_token: conv.token,
          }),
        }).then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            if (!res.ok) {
              var error = new Error(data.error || "handoff_failed");
              error.status = res.status;
              error.payload = data;
              throw error;
            }
            return data;
          });
        }).then(function (data) {
          requested = false;
          if (data.human) {
            human = data.human;
          } else {
            human = { active: true, status: "waiting", sla_minutes: adapter.slaMinutes() };
          }
          setMode();
          startSession();
          adapter.toast(human.status === "claimed" ? TEXT.claimed : TEXT.waiting);
          return true;
        }).catch(function (error) {
          requested = false;
          var payload = (error && error.payload) || {};
          if (payload.error === "live_handoff_disabled") {
            adapter.toast(TEXT.disabled);
            return false;
          }
          if (payload.error === "invalid_conversation") {
            adapter.toast(TEXT.needConversation);
            return false;
          }
          adapter.toast(TEXT.failed);
          return false;
        });
      },

      /** Background worker state (handoff active but not yet requested by CTA). */
      adopt: function (incoming) {
        if (incoming && incoming.active) {
          human = incoming;
          setMode();
          startSession();
        }
      },

      /**
       * Every chat response (JSON or SSE `done`) flows through here: while a
       * human owns the conversation the widget must not paint an AI bubble —
       * the server did not call the model and only acknowledged delivery.
       */
      handleMeta: function (meta) {
        meta = meta || {};
        if (!meta.live_agent) return false;
        if (meta.human && typeof meta.human === "object") human = meta.human;
        else human = { active: true, status: human.status || "waiting", sla_minutes: adapter.slaMinutes() };
        setMode();
        var note = meta.delivery_note || TEXT.delivered;
        appendSystemOnce(note, "delivered");
        startSession();
        return true;
      },

      destroy: function () {
        stopSession();
      },
    };
  }

  /* ───────────────── theme-facing installation layer ──────────────── */

  /** Highest message id in a history/messages payload (cursor seeding). */
  function maxMessageId(messages) {
    var max = 0;
    (messages || []).forEach(function (m) {
      var id = m && Number(m.id);
      if (id && id > max) max = id;
    });
    return max;
  }

  /** Build the generic adapter every theme shares (no per-theme logic). */
  function widgetAdapter(widget) {
    function addLiveBubble(text, kind, badge) {
      var opts = { skipFeedback: true, noAnim: false };
      var els = widget.addMessage(text, "bot", false, opts);
      var row = els && els.row ? els.row : widget.messages.lastElementChild;
      if (!row) return els;
      row.classList.add(kind === "agent" ? "asw-live-row-agent" : "asw-live-row-note");
      if (badge) {
        var badgeEl = document.createElement("div");
        badgeEl.className = "asw-live-badge";
        badgeEl.textContent = badge;
        var col = els && els.col ? els.col : row;
        col.insertBefore(badgeEl, col.firstChild);
      }
      if (els && els.bubble) {
        els.bubble.classList.add(kind === "agent" ? "asw-live-bubble-agent" : "asw-live-bubble-note");
      }
      if (widget.scrollToBottom) widget.scrollToBottom();
      return els;
    }

    return {
      getEndpoints: function () {
        return {
          handoff: widget.options.handoffEndpoint,
          stream: widget.options.handoffStreamEndpoint,
          messages: widget.options.messagesEndpoint,
        };
      },
      getConversation: function () {
        return { id: widget.conversationId || "", token: widget.conversationToken || "" };
      },
      getHeaders: function () {
        return widget.getHeaders ? widget.getHeaders() : { "Content-Type": "application/json" };
      },
      isEnabled: function () { return !!widget.options.liveHandoffEnabled; },
      slaMinutes: function () { return Number(widget.options.liveHandoffSlaMinutes) || 5; },
      lastMessageId: function () { return 0; },
      appendAgent: function (text) { addLiveBubble(text, "agent", "👤 پشتیبان انسانی"); },
      appendSystem: function (text, kind) {
        var badges = { claimed: "👤 کارشناس", closed: "🔁 بازگشت به دستیار" };
        addLiveBubble(text, "note", badges[kind] || "");
      },
      setMode: function (mode, human) { applyMode(widget, mode, human); },
      toast: function (text) { if (widget.showToast) widget.showToast(text, 3200); },
      notify: function () {
        try { if (widget.playSound) widget.playSound("receive"); } catch (_) {}
        if (widget.isOpen === false && widget._markUnread) widget._markUnread();
      },
      isOpen: function () { return !!widget.isOpen; },
    };
  }

  /** Header chip + root attribute describing who is answering right now. */
  function applyMode(widget, mode, human) {
    var root = widget.root;
    if (root) {
      root.setAttribute("data-live-mode", mode || STATE.AI);
      if (root.classList) root.classList.toggle("asw-live-active", mode !== STATE.AI);
    }
    var titleRow = widget.shadow ? widget.shadow.querySelector(".asw-title-row") : null;
    if (titleRow) {
      var chip = titleRow.querySelector("#asw-live-chip");
      if (!chip) {
        chip = document.createElement("span");
        chip.id = "asw-live-chip";
        chip.className = "asw-live-chip";
        var anchor = titleRow.querySelector(".asw-ai-chip");
        if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(chip, anchor.nextSibling);
        else titleRow.appendChild(chip);
      }
      chip.textContent = mode === STATE.HUMAN ? "پشتیبانی انسانی" : mode === STATE.WAITING ? "در انتظار کارشناس" : "";
      chip.hidden = mode === STATE.AI;
    }
    if (widget.subtitleEl) {
      if (mode === STATE.HUMAN) widget.subtitleEl.textContent = "در حال گفتگو با پشتیبانی انسانی";
      else if (mode === STATE.WAITING) widget.subtitleEl.textContent = "در انتظار پاسخ کارشناس…";
      else widget.subtitleEl.textContent = widget.options.subtitle;
    }
  }

  /**
   * "Not helpful" feedback is the strongest signal a visitor wants a human:
   * offer the live CTA right under the rated answer.
   */
  function offerFromFeedback(widget, messageId) {
    if (!widget || !widget.live || !widget.options.liveHandoffEnabled) return;
    var row = null;
    if (widget.messages) {
      if (messageId !== null && messageId !== undefined && messageId !== "") {
        var fb = widget.messages.querySelector('.asw-feedback[data-message-id="' + messageId + '"]');
        if (fb && fb.closest) row = fb.closest(".asw-row");
      }
      if (!row) row = widget.messages.lastElementChild;
    }
    injectCta(widget, widget._lastUserMessage || "", row);
  }

  /** Inject the live CTA into the handoff bar the theme just built. */
  function injectCta(widget, answerText, targetRow) {
    if (widget.live && widget.live.isActive()) return; // already in human mode
    if (widget.messages && widget.messages.querySelector(".asw-live-cta")) return;
    var row = targetRow || (widget.messages ? widget.messages.lastElementChild : null);
    var bar = row ? row.querySelector(".asw-handoff") : null;
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "asw-handoff asw-live-bar";
      var label = document.createElement("span");
      label.className = "asw-handoff-label";
      label.textContent = widget.options.handoffMessage || TEXT.waiting;
      bar.appendChild(label);
      if (row) row.appendChild(bar);
    }
    if (bar.querySelector(".asw-live-cta")) return;
    var label = bar.querySelector(".asw-handoff-label");
    if (label && !label.textContent) {
      label.textContent = widget.options.handoffMessage || TEXT.waiting;
    }
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "asw-handoff-btn asw-live-cta";
    btn.textContent = TEXT.cta;
    btn.addEventListener("click", function () {
      if (btn.disabled) return;
      btn.disabled = true;
      widget.live.request(answerText || widget._lastUserMessage || "");
    });
    bar.appendChild(btn);
    if (widget.scrollToBottom) widget.scrollToBottom();
  }

  /**
   * Attach the client to one widget instance and neutralise the AI path while
   * a human owns the conversation. Method wrapping is deliberate: it keeps the
   * eleven theme bundles down to three tiny call sites instead of eleven
   * hand-maintained copies of the protocol.
   */
  function install(widget) {
    if (!widget || widget._liveInstalled) return widget && widget.live;
    widget._liveInstalled = true;
    var client = createWidgetClient(widgetAdapter(widget));
    widget.live = client;

    var originalHandoffBar = widget.maybeShowHandoff;
    if (typeof originalHandoffBar === "function") {
      widget.maybeShowHandoff = function (answerText) {
        var result = originalHandoffBar.apply(this, arguments);
        try { injectCta(this, answerText); } catch (_) {}
        return result;
      };
    }

    // Negative feedback → the human CTA (the product promise of the feature).
    var originalFeedback = widget.sendFeedback;
    if (typeof originalFeedback === "function") {
      widget.sendFeedback = function (helpful) {
        var result = originalFeedback.apply(this, arguments);
        try {
          if (helpful === false) offerFromFeedback(this, arguments[3]);
        } catch (_) {}
        return result;
      };
    }

    /**
     * A human-mode response is never an AI answer: drop whatever the theme
     * painted (the "handed over" placeholder) and show the delivery notice
     * exactly once instead. Returns true when the call was consumed.
     */
    function intercept(meta) {
      if (!meta || !meta.live_agent) return false;
      client.handleMeta(meta);
      widget.messageCount = Math.max(1, (widget.messageCount || 1) - 1);
      if (widget.saveLocalHistory) widget.saveLocalHistory();
      return true;
    }

    var originalResultEl = widget.handleAnswerResultFromEl;
    if (typeof originalResultEl === "function") {
      widget.handleAnswerResultFromEl = function (els, answer, meta) {
        if (meta && meta.live_agent) {
          if (els && els.row && els.row.parentNode) els.row.parentNode.removeChild(els.row);
          intercept(meta);
          return;
        }
        return originalResultEl.apply(this, arguments);
      };
    }
    var originalResult = widget.handleAnswerResult;
    if (typeof originalResult === "function") {
      widget.handleAnswerResult = function (answer, meta) {
        if (meta && meta.live_agent) {
          intercept(meta);
          return null;
        }
        return originalResult.apply(this, arguments);
      };
    }

    if (widget._liveRestore) {
      client.restore(widget._liveRestore.human, widget._liveRestore.cursor, widget._liveRestore.tail);
      widget._liveRestore = null;
    }
    applyMode(widget, client.mode(), client.state());
    return client;
  }

  /**
   * Called by every bundle right after the remote config is applied:
   * stores the installation switches and attaches the client when enabled.
   * When the feature flag is off nothing is rendered and no request is made.
   */
  function applyConfig(widget, liveConfig) {
    var cfg = liveConfig || (widget && widget.options && widget.options.liveHandoff) || {};
    if (widget && widget.options) {
      widget.options.liveHandoffEnabled = !!cfg.enabled;
      widget.options.liveHandoffSlaMinutes = Number(cfg.sla_minutes) || 5;
      widget.options.liveHandoffText = cfg;
    }
    if (!widget || !cfg.enabled || widget.previewMode) return null;
    if (!widget.options.handoffEndpoint || !widget.options.handoffStreamEndpoint) return null;
    return install(widget);
  }

  /**
   * Re-label restored transcript rows (operator bubbles / system notices) so a
   * refreshed page shows the same transcript the visitor is looking at.
   * Rows map 1:1 to the history payload in order; when the counts disagree we
   * decorate nothing rather than mislabel someone.
   */
  function decorateHistory(widget, messages) {
    if (!widget || !widget.messages || !messages || !messages.length) return;
    var rows = widget.messages.querySelectorAll(".asw-row");
    if (rows.length < messages.length) return;
    var offset = rows.length - messages.length;
    for (var i = 0; i < messages.length; i++) {
      var row = rows[offset + i];
      var sender = messages[i] && messages[i].sender;
      if (!row || !row.classList) continue;
      if (sender === "agent") {
        row.classList.add("asw-live-row-agent");
        var bubble = row.querySelector(".asw-bubble");
        if (bubble) {
          bubble.classList.add("asw-live-bubble-agent");
          var badge = document.createElement("div");
          badge.className = "asw-live-badge";
          badge.textContent = "👤 پشتیبان انسانی";
          var col = bubble.parentNode;
          if (col) col.insertBefore(badge, bubble);
        }
      } else if (sender === "system") {
        row.classList.add("asw-live-row-note");
        var noteBubble = row.querySelector(".asw-bubble");
        if (noteBubble) noteBubble.classList.add("asw-live-bubble-note");
      }
    }
  }

  /**
   * History restore hook: adopts human mode after a page refresh and seeds the
   * stream cursor so transcripts are never re-painted.
   */
  function queueRestore(widget, human, messages) {
    if (!widget) return;
    var cursor = maxMessageId(messages);
    var tail = "";
    (messages || []).forEach(function (m) {
      if (m && (m.sender === "agent" || m.sender === "system") && typeof m.content === "string") {
        tail = m.content;
      }
    });
    decorateHistory(widget, messages);
    if (widget.live) {
      widget.live.restore(human, cursor, tail);
      return;
    }
    widget._liveRestore = { human: human || null, cursor: cursor, tail: tail };
  }



  global.AISupportLive = {
    STATE: STATE,
    TEXT: TEXT,
    SETTINGS: SETTINGS,
    openStream: openStream,
    liveSession: liveSession,
    createWidgetClient: createWidgetClient,
    widgetAdapter: widgetAdapter,
    install: install,
    applyConfig: applyConfig,
    applyMode: applyMode,
    injectCta: injectCta,
    offerFromFeedback: offerFromFeedback,
    queueRestore: queueRestore,
    decorateHistory: decorateHistory,
    maxMessageId: maxMessageId,
    v: "1.0.0",
  };
})(typeof window !== "undefined" ? window : this);
  /* == END live-handoff == */
  /* == BEGIN ui-shell (generated from static/widget/ui-shell.js) == */
/**
 * Shared widget UI shell — state, status copy, composer meaning and screen
 * reader announcements, implemented once for all eleven theme bundles.
 *
 * The eleven bundles ship as standalone files (a customer installs exactly one
 * `<script>`), so anything that must behave identically everywhere is written
 * here and embedded verbatim by scripts/sync_widget_design.py — the same
 * pattern the live human-handoff client already uses.
 *
 * What it owns:
 *   · a deterministic UI state (`data-ui-state`) with a documented priority:
 *       locked > human_active > human_waiting > offline > thinking > online
 *   · the service banner (#asw-banner): waiting for an operator, or locked
 *   · status line (#asw-subtitle) and composer placeholder per state, so the
 *     visitor always knows who will read what they type
 *   · throttled, de-duplicated announcements to a polite live region — a
 *     screen reader hears state changes, never the typing indicator
 *   · aria-busy on the transcript while an answer is being produced
 *
 * It deliberately owns no network code and no markup structure: the bundles
 * keep their own API layer, history, leads, voice and preview channel.
 */
(function (global) {
  "use strict";

  var VERSION = "1.0.0";

  var TEXT = {
    /* status lines */
    waitingSub: "در انتظار پاسخ کارشناس…",
    humanSub: "در حال گفتگو با پشتیبانی انسانی",
    thinkingSub: "در حال نوشتن پاسخ…",
    lockedSub: "خدمت در دسترس نیست",
    /* placeholders — the composer states who will read the message */
    humanPlaceholder: "پیام خود را برای کارشناس بنویسید…",
    thinkingPlaceholder: "در حال پاسخ‌دهی…",
    lockedPlaceholder: "ارسال پیام در حال حاضر ممکن نیست",
    /* banner */
    waiting: function (minutes) {
      var base = "درخواست شما ثبت شد و کارشناس انسانی همین‌جا پاسخ می‌دهد.";
      return minutes > 0 ? base + " (میانگین پاسخ‌دهی: حدود " + minutes + " دقیقه)" : base;
    },
    locked: "این سرویس در حال حاضر برای این سایت در دسترس نیست.",
    /* announcements (state transitions only) */
    announceWaiting: "درخواست شما برای پشتیبانی انسانی ثبت شد. در انتظار پاسخ کارشناس هستید.",
    announceHuman: "کارشناس پشتیبانی به گفتگو پیوست.",
    announceBackToAI: "گفت‌وگوی انسانی پایان یافت. دستیار هوشمند دوباره فعال شد.",
    announceOffline: "اتصال اینترنت قطع است.",
    announceOnline: "اتصال اینترنت برقرار شد.",
    announceLocked: "ارسال پیام برای این سایت غیرفعال است."
  };

  var ANNOUNCE_MIN_MS = 2500;

  /* Transitions a visitor must not miss are announced even inside the window
   * that keeps ordinary state chatter out of the screen reader. */
  var ANNOUNCE_PRIORITY = { human_active: true, locked: true };

  function liveMode(widget) {
    var root = widget && widget.root;
    return (root && root.getAttribute("data-live-mode")) || "ai";
  }

  function slaMinutes(widget) {
    var value = Number(widget && widget.options && widget.options.liveHandoffSlaMinutes);
    return value > 0 ? value : 0;
  }

  /** First match wins, so two contradictory states can never be shown at once.
   *
   * Presence semantics (colours in design-core.css) and the priority from the
   * style guide: locked > human_active > human_waiting > offline > thinking >
   * online, with `init` (neutral) reserved for the window in which nothing has
   * been verified yet.
   *
   *   green  — the config handshake produced an HTTP reply, so the widget is
   *            known to be able to talk to the backend.
   *   gray   — the first contact is still in flight, so the state is unknown.
   *   red    — confirmed unreachable: the browser reports no connection, or the
   *            config request died at the network layer (DNS/TLS/CORS).
   *
   * A bare `init` is never a terminal state: it is only ever the honest answer
   * "not verified yet". A single failed chat request is request-level and never
   * moves the dot, and browser-offline always outranks a pending handshake. */
  function computeState(widget) {
    if (widget && widget._blocked) return "locked";
    var mode = liveMode(widget);
    if (mode === "human") return "human_active";
    if (mode === "waiting") return "human_waiting";
    if (global.navigator && global.navigator.onLine === false) return "offline";
    if (widget && widget.isLoading) return "thinking";
    if (widget && widget._configUnreachable) return "offline";
    if (widget && widget._configPending) return "init";
    return "online";
  }

  function subtitleFor(widget, state) {
    var options = (widget && widget.options) || {};
    if (state === "locked") return TEXT.lockedSub;
    var mode = liveMode(widget);
    if (mode === "waiting") return TEXT.waitingSub;
    if (mode === "human") return TEXT.humanSub;
    if (widget && widget.isLoading) return TEXT.thinkingSub;
    return options.subtitle || "";
  }

  function placeholderFor(widget, state) {
    var options = (widget && widget.options) || {};
    if (state === "locked") return TEXT.lockedPlaceholder;
    if (liveMode(widget) !== "ai") return TEXT.humanPlaceholder;
    if (widget && widget.isLoading) return TEXT.thinkingPlaceholder;
    return options.inputPlaceholder || "";
  }

  /** The banner is only for states the transcript cannot express by itself. */
  function bannerFor(widget, state) {
    if (state === "locked") {
      return { text: widget._blockedMessage || TEXT.locked, tone: "locked" };
    }
    if (state === "human_waiting") {
      return { text: TEXT.waiting(slaMinutes(widget)), tone: "info" };
    }
    return null;
  }

  function announcementFor(previous, state) {
    if (state === previous) return "";
    if (state === "human_waiting") return TEXT.announceWaiting;
    if (state === "human_active") return TEXT.announceHuman;
    if (state === "locked") return TEXT.announceLocked;
    if (state === "offline") return TEXT.announceOffline;
    if (previous === "offline" && state !== "offline") return TEXT.announceOnline;
    if (previous === "human_active" && (state === "online" || state === "thinking")) return TEXT.announceBackToAI;
    return "";
  }

  function sync(widget) {
    if (!widget || !widget.root) return "";
    var state = computeState(widget);
    var root = widget.root;

    if (root.getAttribute("data-ui-state") !== state) root.setAttribute("data-ui-state", state);
    if (widget.messages) {
      var busy = state === "thinking" || state === "human_waiting";
      if ((widget.messages.getAttribute("aria-busy") === "true") !== busy) {
        widget.messages.setAttribute("aria-busy", busy ? "true" : "false");
      }
    }

    if (widget.subtitleEl) {
      var subtitle = subtitleFor(widget, state);
      if (widget.subtitleEl.textContent !== subtitle) widget.subtitleEl.textContent = subtitle;
    }

    if (widget.input) {
      var placeholder = placeholderFor(widget, state);
      if (placeholder && widget.input.placeholder !== placeholder) widget.input.placeholder = placeholder;
    }

    if (widget.banner) {
      var banner = bannerFor(widget, state);
      if (banner) {
        widget.banner.textContent = banner.text;
        widget.banner.setAttribute("data-tone", banner.tone);
        widget.banner.hidden = false;
      } else {
        widget.banner.hidden = true;
        widget.banner.textContent = "";
      }
    }

    var previous = widget._uiState || "";
    widget._uiState = state;
    var message = announcementFor(previous, state);
    if (message && widget.liveRegion) {
      var now = Date.now();
      var ready = ANNOUNCE_PRIORITY[state] || now - (widget._uiAnnouncedAt || 0) >= ANNOUNCE_MIN_MS;
      if (ready && widget.liveRegion.textContent !== message) {
        widget._uiAnnouncedAt = now;
        widget.liveRegion.textContent = message;
      }
    }
    return state;
  }

  function install(widget) {
    if (!widget || widget._uiInstalled) return widget && widget.ui;
    widget._uiInstalled = true;

    var api = {
      version: VERSION,
      text: TEXT,
      state: function () { return computeState(widget); },
      sync: function () { return sync(widget); }
    };
    widget.ui = api;

    /* The bundles never reload the config, so one handshake decides the dot for
     * the lifetime of the page. loadConfig() writes the raw fields itself
     * (_configPending / _configReady / _configUnreachable) so it keeps working
     * even if this shell is not installed; this helper is the equivalent entry
     * point for anything that prefers to report through the API. */
    widget._markConfigReady = function (ok) {
      widget._configPending = false;
      widget._configReady = !!ok;
      if (ok) widget._configUnreachable = false;
      try { sync(widget); } catch (_) {}
    };

    /* Keep the state honest whatever the bundle decides to do internally. */
    var originalSetLoading = widget.setLoading;
    if (typeof originalSetLoading === "function") {
      widget.setLoading = function () {
        var result = originalSetLoading.apply(this, arguments);
        try { sync(this); } catch (_) {}
        return result;
      };
    }

    var originalBlocked = widget._setBlocked;
    if (typeof originalBlocked === "function") {
      widget._setBlocked = function (blocked, message) {
        this._blockedMessage = blocked ? (message || "") : "";
        var result = originalBlocked.apply(this, arguments);
        try { sync(this); } catch (_) {}
        return result;
      };
    }

    var originalClearBlocked = widget._clearBlocked;
    if (typeof originalClearBlocked === "function") {
      widget._clearBlocked = function () {
        var result = originalClearBlocked.apply(this, arguments);
        try { sync(this); } catch (_) {}
        return result;
      };
    }

    /* Network changes and human-mode changes both move the state. */
    if (global.addEventListener) {
      /* Reconnecting clears a confirmed outage. It does not by itself prove the
       * backend answers, so the dot returns to its default rather than
       * claiming a verified session it has not re-established. */
      global.addEventListener("online", function () { try { widget._configUnreachable = false; sync(widget); } catch (_) {} });
      global.addEventListener("offline", function () { sync(widget); });
    }
    if (widget.root && global.MutationObserver) {
      var observer = new global.MutationObserver(function () { sync(widget); });
      observer.observe(widget.root, { attributes: true, attributeFilter: ["data-live-mode"] });
      widget._uiObserver = observer;
    }

    /* The bundle never removes the widget from the page, but if a host app
     * does, drop the observer with it instead of leaking it. */
    widget.destroyUI = function () {
      if (widget._uiObserver) { widget._uiObserver.disconnect(); widget._uiObserver = null; }
    };

    sync(widget);
    return api;
  }

  global.AISupportUI = {
    install: install,
    sync: sync,
    computeState: computeState,
    TEXT: TEXT,
    v: VERSION
  };
})(typeof window !== "undefined" ? window : this);
  /* == END ui-shell == */
  /* ─────────────── DEFAULTS ─────────────── */
  var DEFAULTS = {
    apiEndpoint: "/api/chat/",
    configEndpoint: "",
    eventsEndpoint: "",
    feedbackEndpoint: "",
    widgetPublicKey: "",
    title: "دستیار هوش مصنوعی",
    subtitle: "ONLINE",
    greeting: "سلام! 👋 چطور می‌توانم کمکتان کنم؟",
    timeoutMs: 120000,
    primaryColor: "#22d3ee",
    secondaryColor: "#0ea5b7",
    accentColor: "#67e8f9",
    headerBadge: "آنلاین",
    botAvatarText: "▸",
    inputPlaceholder: "پیام خود را بنویسید...",
    themeMode: "solid",
    darkMode: "dark",
    panelWidth: 400,
    panelHeight: 640,
    borderRadius: 18,
    mobileFullscreen: true,
    logoUrl: "",
    fontFamily: "'Vazirmatn', 'Inter', 'IRANSansX', ui-sans-serif, system-ui, sans-serif",
    fontSize: "normal",
    showPoweredBy: true,
    showTimestamp: true,
    showAvatar: true,
    showFeedback: true,
    enableSounds: false,
    enableAnimations: true,
    bubbleStyle: "rounded",
    position: "bottom-right",
    positionVerticalOffset: 24,
    positionHorizontalOffset: 24,
    iconType: "default",
    defaultIconChoice: "chat-bubble",
    customIconUrl: "",
    suggestions: [],
    faqUrl: "",
    privacyUrl: "",
    supportEmail: "",
    sessionId: "",
    enableStreaming: true,
    showCitations: true,
    enableLeadCapture: true,
    leadFormTitle: "تماس با کارشناسان ما",
    leadFormDescription: "راه دلخواه‌تان را انتخاب کنید یا فرم را پر کنید؛ در اسرع وقت پاسخ می‌دهیم.",
    enableHandoff: true,
    /* Live in-widget human support (superuser flag; see SiteProfile) */
    liveHandoffEnabled: false,
    liveHandoffSlaMinutes: 5,
    handoffTrigger: "low_confidence",
    handoffMessage: "پاسخ این سؤال در دانش دستیار نبود؛ یک کارشناس انسانی بررسی می‌کند.",
    handoffUrls: {},
    handoffLabel: "گفتگو با کارشناس",
    showTeaser: true,
    teaserText: "معمولاً در کمتر از یک دقیقه پاسخ می‌دهیم.",
    enableVoiceInput: true,
    fabLabel: "سوالی دارید؟ همین حالا بپرسید",
    supportPhone: "",
  };

  /* ─────────────── SVG ICONS ─────────────── */
  var FAB_ICONS = {
    "chat-bubble": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>',
    "message-circle": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
    "robot": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="9" cy="16" r="1"/><circle cx="15" cy="16" r="1"/><path d="M12 11V7"/><path d="M8 7h8"/><path d="M8 3l2 4M16 3l-2 4"/></svg>',
    "headset": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>',
    "sparkle": '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z"/></svg>',
    "lightning": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  };

  var ICONS = {
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>',
    arrowUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    thumbUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>',
    thumbDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>',
    thumbUpFilled: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>',
    thumbDownFilled: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="m2 7 10 7L22 7"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 2.64-6.36L3 8"/><path d="M3 3v5h5"/></svg>',
    chevronDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
    chevronLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
    sparkles: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c.9 4.6 2.4 6.1 7 7-4.6.9-6.1 2.4-7 7-.9-4.6-2.4-6.1-7-7 4.6-.9 6.1-2.4 7-7z"/></svg>',
    headset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1"/><path d="M12 18v4"/></svg>',
    wifiOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h.01"/><path d="M8.5 16.4a5 5 0 0 1 7 0"/><path d="M5 12.9a10 10 0 0 1 5.17-2.69"/><path d="M19 12.9a10 10 0 0 0-2.007-1.523"/><path d="M2 8.82a15 15 0 0 1 4.177-2.643"/><path d="M22 8.82a15 15 0 0 0-11.288-3.764"/><path d="m2 2 20 20"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>'
  };

  var THINKING_STATUSES = [
    "در حال نوشتن پاسخ…",
  ];

  /* ─────────────── CSS — Onyx carbon skin ─────────────── */
  var CSS = `
  /* == BEGIN design (generated by scripts/sync_widget_design.py) == */
/*
 * Widget design core — the single canonical stylesheet shared by all eleven
 * theme bundles (classic, onyx, linen, clay, atomic, fluen, glassmo, md3,
 * minimal, neu, skuermo).
 *
 * scripts/sync_widget_design.py inlines this file plus the theme's own
 * themes/<name>.css (tokens + personality) into every bundle. Structure,
 * hierarchy, states, motion and accessibility are written once here; identity
 * (palette, radius, depth, typography) belongs to the theme.
 *
 * Rules this file enforces:
 *   · calm premium SaaS: hierarchy over decoration, no ambient effects
 *   · motion only where it explains something (150-280ms, never decorative loops)
 *   · colour is semantic: one meaning per token, per state
 *   · logical CSS properties only, so RTL and LTR are both first class
 *   · everything keyboard reachable, screen-reader friendly
 *   · prefers-reduced-motion is a first-class mode, not an afterthought
 *
 * NOTE: this text is inlined into a JavaScript template literal, so it must
 * never contain a backtick or a dollar-brace sequence (asserted by the script).
 */

@import url('https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css');

:host{all:initial;--asw-font:'Vazirmatn','Vazir','IRANSans','Segoe UI',ui-sans-serif,system-ui,sans-serif;--asw-mono:ui-monospace,'SF Mono','JetBrains Mono','Fira Code',Menlo,Consolas,monospace}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

/* ─────────────── 1. TOKENS ─────────────── */
.asw{
  /* spacing scale (4pt) */
  --asw-sp-1:4px;--asw-sp-2:8px;--asw-sp-3:12px;--asw-sp-4:16px;--asw-sp-5:20px;--asw-sp-6:24px;--asw-sp-7:32px;
  /* radius scale */
  --asw-r-sm:8px;--asw-r-md:12px;--asw-r-lg:16px;--asw-r-xl:20px;--asw-r-pill:999px;
  /* motion */
  --asw-dur-fast:150ms;--asw-dur:200ms;--asw-dur-slow:280ms;--asw-ease:cubic-bezier(.2,.8,.2,1);
  /* type */
  --asw-fs-xs:11.5px;--asw-fs-sm:12.5px;--asw-fs-body:var(--asw-font-size,14px);--asw-fs-lg:15.5px;
  --asw-lh:1.75;--asw-lh-tight:1.5;--asw-w-normal:400;--asw-w-medium:500;--asw-w-bold:700;
  /* elevation */
  --asw-shadow-subtle:0 1px 2px rgba(16,24,40,.06);
  --asw-shadow-elevated:0 1px 2px rgba(16,24,40,.05),0 14px 32px -12px rgba(16,24,40,.2);
  --asw-shadow-modal:0 24px 60px -18px rgba(16,24,40,.35);
  /* surfaces + text */
  --asw-bg:#ffffff;--asw-surface:#f7f8fa;--asw-surface-2:#eef0f4;--asw-surface-3:#e4e7ec;
  --asw-border:#e6e8ee;--asw-border-strong:#d3d7e0;
  --asw-text:#14161f;--asw-text-secondary:#5b6172;--asw-text-muted:#8b92a4;
  /* brand + status */
  --asw-primary-hover:color-mix(in srgb,var(--asw-primary) 88%,#000);
  /* Ink for anything filled with the brand colour. The runtime measures the
   * configured colour and decides between dark and white (applyHeaderContrast),
   * so a light brand colour can never leave white-on-white behind. */
  --asw-on-brand:var(--asw-header-text,var(--asw-on-primary));
  --asw-primary-soft:color-mix(in srgb,var(--asw-primary) 12%,transparent);
  --asw-on-primary:#ffffff;
  --asw-success:#0e9f6e;--asw-warning:#d97706;--asw-error:#dc2f37;
  --asw-success-soft:color-mix(in srgb,var(--asw-success) 12%,transparent);
  --asw-warning-soft:color-mix(in srgb,var(--asw-warning) 14%,transparent);
  --asw-error-soft:color-mix(in srgb,var(--asw-error) 12%,transparent);
  /* messages */
  --asw-bot-bg:#f7f8fa;--asw-bot-text:#14161f;
  --asw-user-bg:var(--asw-primary);--asw-user-text:var(--asw-on-primary);
  --asw-input-bg:#f7f8fa;--asw-input-focus-bg:#ffffff;
  /* header (background comes from the widget config at runtime) */
  --asw-header-text:#ffffff;--asw-header-bg-solid:var(--asw-bg);
  --asw-header-btn-bg:rgba(255,255,255,.14);--asw-header-btn-border:rgba(255,255,255,.22);
  /* ── component recipes ──
   * Every theme redefines the ones it has an opinion about; the values here are
   * the neutral baseline, not a design. Theme sheets are inlined after the core,
   * so a theme wins by simply declaring the variable again. */
  /* panel */
  --asw-panel-border-w:1px;--asw-panel-border-color:var(--asw-border);
  --asw-panel-shadow:var(--asw-shadow-modal);
  --asw-panel-ring:0 0 0 0 transparent;--asw-panel-bg-image:none;
  /* header */
  --asw-header-pad:var(--asw-sp-3);--asw-header-gap:var(--asw-sp-3);
  --asw-header-min-h:0px;--asw-header-radius:0px;--asw-header-shadow:none;
  --asw-header-sep:none;--asw-header-ink:var(--asw-header-text,#ffffff);
  --asw-header-rail:none;--asw-header-rail-h:0px;
  --asw-ornament:none;--asw-ornament-h:0px;
  /* avatar */
  --asw-avatar-size:38px;--asw-avatar-bg:var(--asw-header-btn-bg);
  --asw-avatar-ink:var(--asw-header-ink);--asw-avatar-ring:none;
  /* transcript */
  --asw-msgs-pad:var(--asw-sp-4) var(--asw-sp-3) var(--asw-sp-2);
  --asw-msgs-gap:var(--asw-sp-3);--asw-row-max:88%;
  /* bubbles */
  --asw-bubble-r:var(--asw-r-lg);--asw-bubble-notch:var(--asw-r-sm);
  --asw-bubble-px:var(--asw-sp-3);--asw-bubble-py:10px;
  /* composer */
  --asw-composer-bg:var(--asw-input-bg);--asw-composer-border:1px solid var(--asw-border-strong);
  --asw-composer-shadow:none;--asw-composer-pad:6px;
  --asw-composer-pad-start:6px;--asw-composer-pad-end:var(--asw-sp-4);
  --asw-composer-gap:7px;
  --asw-send-size:36px;--asw-send-bg:var(--asw-primary);--asw-send-ink:var(--asw-on-brand);
  --asw-send-hover:var(--asw-primary-hover);--asw-send-shadow:none;
  /* chips, citations, feedback */
  --asw-chip-radius:var(--asw-r-pill);--asw-chip-bg:var(--asw-bg);
  --asw-chip-border:1px solid var(--asw-border);--asw-chip-ink:var(--asw-text-secondary);
  --asw-chip-hover-bg:var(--asw-surface);--asw-chip-hover-border:var(--asw-border-strong);
  --asw-chip-hover-ink:var(--asw-text);
  --asw-cite-radius:var(--asw-r-sm);--asw-cite-bg:var(--asw-bg);
  --asw-cite-border:1px solid var(--asw-border);
  --asw-fb-size:28px;--asw-state-hover:var(--asw-surface);
  /* fab + typing */
  --asw-fab-size:56px;--asw-fab-border:0;--asw-fab-ring:0 0 0 0 transparent;
  --asw-typing-dot-r:50%;
  /* focus ring colour — themes with a dark or low-contrast accent retune it */
  --asw-focus:var(--asw-primary);
  /* legacy aliases still consumed by the unchanged bundle JS */
  --asw-radius-sm:var(--asw-r-md);--asw-radius-xs:var(--asw-r-sm);
  --asw-shadow:var(--asw-shadow-elevated);
  --asw-out:var(--asw-ease);--asw-spring:var(--asw-ease);
  --asw-glass:var(--asw-bg);--asw-text-2:var(--asw-text-secondary);--asw-muted:var(--asw-text-muted);
}
.asw.dark{
  --asw-bg:#12141b;--asw-surface:#1a1d26;--asw-surface-2:#22262f;--asw-surface-3:#2a2f3a;
  --asw-border:#282d39;--asw-border-strong:#3a4152;
  --asw-text:#eef0f6;--asw-text-secondary:#a6adbe;--asw-text-muted:#767e91;
  --asw-bot-bg:#1a1d26;--asw-bot-text:#eef0f6;
  --asw-input-bg:#1a1d26;--asw-input-focus-bg:#12141b;
  --asw-shadow-subtle:0 1px 2px rgba(0,0,0,.4);
  --asw-shadow-elevated:0 2px 6px rgba(0,0,0,.4),0 18px 40px -14px rgba(0,0,0,.6);
  --asw-shadow-modal:0 28px 70px -18px rgba(0,0,0,.7);
  --asw-success:#34d399;--asw-warning:#fbbf24;--asw-error:#f87171;
}

/* ─────────────── 2. ROOT ─────────────── */
.asw{font-family:var(--asw-font);font-size:var(--asw-fs-body);direction:rtl;line-height:var(--asw-lh);color:var(--asw-text);-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
.asw-root{position:fixed;z-index:2147483647;width:0;height:0;pointer-events:none}
.asw-root>*{pointer-events:auto}
.asw [hidden]{display:none!important}
.asw-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}

/* ─────────────── 3. FAB ─────────────── */
.asw-fab{position:fixed;width:var(--asw-fab-size);height:var(--asw-fab-size);border:var(--asw-fab-border);border-radius:var(--asw-fab-sq,var(--asw-r-lg));background:var(--asw-fab-bg,var(--asw-primary));color:var(--asw-fab-color,var(--asw-on-brand));display:grid;place-items:center;cursor:pointer;z-index:2;box-shadow:var(--asw-fab-ring),var(--asw-fab-shadow,0 6px 20px -6px color-mix(in srgb,var(--asw-primary) 55%,transparent)),var(--asw-shadow-subtle);transition:transform var(--asw-dur) var(--asw-ease),box-shadow var(--asw-dur) var(--asw-ease),background-color var(--asw-dur) var(--asw-ease),color var(--asw-dur) var(--asw-ease)}
.asw-fab:hover{background:var(--asw-fab-hover,var(--asw-primary-hover))}
.asw-fab:active{transform:translateY(0) scale(.97)}
.asw-fab.active{background:var(--asw-surface);color:var(--asw-text);box-shadow:var(--asw-shadow-elevated)}
.asw-fab svg{width:22px;height:22px}
.asw-fab-custom-icon{width:26px;height:26px;object-fit:contain;border-radius:6px}
.asw-fab-icon-main,.asw-fab-icon-close{position:absolute;inset:0;display:grid;place-items:center;transition:opacity var(--asw-dur-fast) var(--asw-ease),transform var(--asw-dur) var(--asw-ease)}
.asw-fab-icon-close{opacity:0;transform:rotate(-45deg)}
.asw-fab.active .asw-fab-icon-main{opacity:0;transform:rotate(45deg)}
.asw-fab.active .asw-fab-icon-close{opacity:1;transform:rotate(0)}
.asw-fab-label{position:absolute;inset-inline-end:calc(100% + 12px);top:50%;transform:translateY(-50%);white-space:nowrap;padding:8px 12px;border-radius:var(--asw-r-sm);background:var(--asw-bg);border:1px solid var(--asw-border);color:var(--asw-text);font-family:inherit;font-size:var(--asw-fs-sm);font-weight:var(--asw-w-medium);box-shadow:var(--asw-shadow-subtle);opacity:0;pointer-events:none;transition:opacity var(--asw-dur-fast) var(--asw-ease)}
.asw-fab:hover .asw-fab-label,.asw-fab:focus-visible .asw-fab-label{opacity:1}
.asw-fab-badge{position:absolute;top:-4px;inset-inline-start:-4px;min-width:18px;height:18px;padding:0 5px;border-radius:var(--asw-r-pill);background:var(--asw-error);color:#fff;font-family:inherit;font-size:10px;font-weight:var(--asw-w-bold);line-height:18px;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.25)}
@keyframes asw-pop{0%{transform:scale(.6);opacity:0}100%{transform:scale(1);opacity:1}}
.asw-fab-badge.asw-pop{animation:asw-pop var(--asw-dur) var(--asw-ease)}

/* ─────────────── 4. TEASER ─────────────── */
.asw-teaser{position:fixed;z-index:1;max-width:264px;display:flex;align-items:flex-start;gap:var(--asw-sp-3);padding:var(--asw-sp-3);border-radius:var(--asw-r-lg);background:var(--asw-bg);border:1px solid var(--asw-border);box-shadow:var(--asw-shadow-elevated);cursor:pointer;opacity:0;transform:translateY(6px);transition:opacity var(--asw-dur) var(--asw-ease),transform var(--asw-dur) var(--asw-ease);pointer-events:none;text-align:start}
.asw-teaser.show{opacity:1;transform:none;pointer-events:auto}
.asw-teaser-orb{width:32px;height:32px;flex:none;border-radius:var(--asw-r-sm);background:var(--asw-primary-soft);color:var(--asw-primary);display:grid;place-items:center}
.asw-teaser-orb svg{width:16px;height:16px}
.asw-teaser-body{min-width:0}
.asw-teaser-title{font-size:var(--asw-fs-sm);font-weight:var(--asw-w-bold);color:var(--asw-text)}
.asw-teaser-text{font-size:var(--asw-fs-xs);color:var(--asw-text-secondary);line-height:var(--asw-lh-tight);margin-top:2px}
.asw-teaser-close{position:absolute;top:6px;inset-inline-start:6px;width:20px;height:20px;border:0;border-radius:var(--asw-r-sm);background:transparent;color:var(--asw-text-muted);display:grid;place-items:center;cursor:pointer;padding:0;opacity:0;transition:opacity var(--asw-dur-fast),background-color var(--asw-dur-fast),color var(--asw-dur-fast)}
.asw-teaser:hover .asw-teaser-close,.asw-teaser-close:focus-visible{opacity:1}
.asw-teaser-close:hover{background:var(--asw-surface-2);color:var(--asw-text)}
.asw-teaser-close svg{width:12px;height:12px}

/* ─────────────── 5. PANEL ─────────────── */
.asw-panel{position:fixed;z-index:3;width:var(--asw-panel-w);height:var(--asw-panel-h);max-width:calc(100vw - 24px);max-height:calc(100vh - 112px);max-height:calc(100dvh - 112px);display:flex;flex-direction:column;overflow:hidden;background-color:var(--asw-bg);background-image:var(--asw-panel-bg-image);border:var(--asw-panel-border-w) solid var(--asw-panel-border-color);border-radius:var(--asw-radius);box-shadow:var(--asw-panel-ring),var(--asw-panel-shadow);opacity:0;visibility:hidden;pointer-events:none;transform:translateY(8px) scale(.99);transition:opacity var(--asw-dur) var(--asw-ease),transform var(--asw-dur-slow) var(--asw-ease),visibility var(--asw-dur)}
.asw-panel.open{opacity:1;visibility:visible;pointer-events:auto;transform:none}

/* ─────────────── 6. HEADER ─────────────── */
/* Identity hooks (theme sheets may override every one of them):
 *   --asw-header-bg            header treatment (theme default wins; --asw-header-bg-cfg is the customer-config fallback)
 *   --asw-header-text          header text color (falls back to --asw-header-text-cfg, then #fff)
 *   --asw-header-fs            title font size
 *   --asw-header-fs-sub        subtitle font size
 *   --asw-w-header             title weight
 *   --asw-header-btn-bg/-border  header action buttons
 *   --asw-avatar-sq            header avatar geometry (50% = round avatar)
 *   --asw-user-avatar-bg/-color  visitor avatar tones
 *   --asw-bot-bubble-bg/-border/-shadow  bot bubble treatment (transparent border disables it)
 *   --asw-user-bubble-bg/-text   user bubble tones
 *   --asw-fab-bg/-color/-shadow/-hover/-sq  FAB treatment
 *   --asw-input-sq / --asw-btn-sq  composer geometry
 *   --asw-font-display         display face for titles (falls back to --asw-font)
 *   --asw-ornament             one decorative accent (header rail / dot), decorative only
 *
 * Beyond identity, every component exposes a recipe variable (declared with the
 * neutral core default in section 1): --asw-panel-*, --asw-header-*,
 * --asw-avatar-*, --asw-msgs-*, --asw-bubble-*, --asw-composer-*, --asw-send-*,
 * --asw-chip-*, --asw-cite-*, --asw-fab-*, --asw-fb-size, --asw-focus.
 * A theme redesigns a component by redeclaring the variable; it only needs a
 * selector when it wants to change the composition itself. */
.asw-header{position:relative;z-index:3;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:var(--asw-header-gap);padding:var(--asw-header-pad);min-height:var(--asw-header-min-h);background:var(--asw-header-bg,var(--asw-header-bg-cfg,var(--asw-primary)));color:var(--asw-header-ink);border-radius:var(--asw-header-radius);border-bottom:var(--asw-header-sep);box-shadow:var(--asw-header-shadow)}
/* Two decorative layers the core never fills in by itself: a top rail and a
 * bottom rule (both zero-height until a theme gives them a height + paint).
 * Purely ornamental — no text, no state, no pointer events. */
.asw-header::before{content:"";position:absolute;inset-inline:0;top:0;height:var(--asw-header-rail-h);background:var(--asw-header-rail);pointer-events:none}
.asw-header::after{content:"";position:absolute;inset-inline:0;bottom:0;height:var(--asw-ornament-h);background:var(--asw-ornament);pointer-events:none}
.asw-heading{display:flex;align-items:center;gap:var(--asw-sp-3);min-width:0}
.asw-avatar-wrap{position:relative;flex:none}
.asw-avatar{width:var(--asw-avatar-size);height:var(--asw-avatar-size);border-radius:var(--asw-avatar-sq,var(--asw-r-md));display:grid;place-items:center;background:var(--asw-avatar-bg);color:var(--asw-avatar-ink);font-size:15px;font-weight:var(--asw-w-bold);overflow:hidden;box-shadow:var(--asw-avatar-ring)}
.asw-avatar img{width:100%;height:100%;object-fit:cover}
.asw-status{position:absolute;bottom:-1px;inset-inline-start:-1px;width:11px;height:11px;border-radius:50%;background:var(--asw-presence,var(--asw-text-muted));border:2px solid var(--asw-header-bg-solid)}
.asw-info{min-width:0;display:flex;flex-direction:column;gap:1px}
.asw-title-row{display:flex;align-items:center;gap:var(--asw-sp-2);min-width:0}
.asw-title{font-family:var(--asw-font-display,var(--asw-font));font-size:var(--asw-header-fs,var(--asw-fs-body));font-weight:var(--asw-w-header,var(--asw-w-bold));line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.asw-subtitle{font-size:var(--asw-header-fs-sub,var(--asw-fs-xs));line-height:1.5;color:var(--asw-header-sub-ink,var(--asw-header-ink));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.asw-identity,.asw-ai-chip,.asw-badge,.asw-live-chip{flex:none;display:inline-flex;align-items:center;gap:4px;height:18px;padding:0 7px;border-radius:var(--asw-r-pill);font-size:10px;font-weight:var(--asw-w-bold);line-height:1;letter-spacing:0;background:var(--asw-header-btn-bg);color:inherit}
.asw-identity svg,.asw-ai-chip svg{width:10px;height:10px}
.asw-badge-dot{width:5px;height:5px;border-radius:50%;background:var(--asw-presence,var(--asw-text-muted))}
.asw-actions{display:flex;align-items:center;gap:var(--asw-sp-1);flex:none}
.asw-header-btn{width:32px;height:32px;border:1px solid var(--asw-header-btn-border);border-radius:var(--asw-r-sm);background:var(--asw-header-btn-bg);color:inherit;display:grid;place-items:center;cursor:pointer;padding:0;transition:background-color var(--asw-dur-fast) var(--asw-ease)}
.asw-header-btn:hover{background:color-mix(in srgb,var(--asw-header-btn-bg) 55%,rgba(255,255,255,.3))}
.asw-header-btn:active{transform:scale(.96)}
.asw-header-btn svg{width:16px;height:16px}

/* ─────────────── 7. STATUS BANNERS ─────────────── */
.asw-netstatus,.asw-banner{position:relative;z-index:3;flex:none;display:flex;align-items:center;justify-content:center;gap:var(--asw-sp-2);padding:7px var(--asw-sp-3);font-size:var(--asw-fs-xs);font-weight:var(--asw-w-medium);text-align:center}
.asw-netstatus{background:var(--asw-warning-soft);border-bottom:1px solid color-mix(in srgb,var(--asw-warning) 30%,transparent);color:color-mix(in srgb,var(--asw-warning) 80%,var(--asw-text))}
.asw-netstatus svg{width:14px;height:14px;flex:none}
.asw-banner{background:var(--asw-primary-soft);color:color-mix(in srgb,var(--asw-primary) 78%,var(--asw-text))}
.asw-banner[data-tone="locked"]{background:var(--asw-error-soft);color:color-mix(in srgb,var(--asw-error) 74%,var(--asw-text))}

/* ─────────────── 8. MESSAGES ─────────────── */
.asw-messages{position:relative;z-index:1;flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;padding:var(--asw-msgs-pad);display:flex;flex-direction:column;direction:rtl;gap:var(--asw-msgs-gap);scrollbar-width:thin;scrollbar-color:var(--asw-border-strong) transparent}
.asw-messages::-webkit-scrollbar{width:8px}
.asw-messages::-webkit-scrollbar-thumb{background:var(--asw-border-strong);border-radius:var(--asw-r-pill);border:2px solid transparent;background-clip:padding-box}
/* The transcript is a column flex container, so its cross axis follows the
 * writing direction: in RTL flex-start is the physical RIGHT and flex-end the
 * physical LEFT. align-self alone therefore flips the sides silently — the
 * alignment regression.
 *
 * The transcript pins its own direction (below) and expresses the law of the
 * message list with auto margins, so the visual result is PHYSICAL and cannot
 * be flipped by whatever a theme sets on the panel:
 *   VISITOR → right   (free space absorbed on the inline-end side)
 *   ASSISTANT/AGENT → left
 *   SYSTEM → centered
 * align-self stays off "stretch" so a row is never full-width and the auto
 * margin always has space to absorb. */
.asw-row{position:relative;z-index:1;display:flex;flex-wrap:wrap;align-items:flex-end;align-self:flex-start;gap:var(--asw-sp-2);max-width:var(--asw-row-max);animation:asw-msg-in var(--asw-dur-slow) var(--asw-ease) both}
.asw-row.user{margin-inline-start:0;margin-inline-end:auto;flex-direction:row-reverse}
.asw-row.bot{margin-inline-start:auto;margin-inline-end:0}
.asw-row.bot+.asw-row.bot,.asw-row.user+.asw-row.user{margin-top:-7px}
.asw-row.no-anim{animation:none}
.asw-row.asw-cont .asw-msg-avatar{visibility:hidden}
.asw-msg-avatar{width:30px;height:30px;flex:0 0 30px;border-radius:var(--asw-r-sm);display:grid;place-items:center;font-size:var(--asw-fs-xs);font-weight:var(--asw-w-bold);overflow:hidden;background:var(--asw-surface-2);color:var(--asw-text-secondary)}
.asw-msg-avatar img{width:100%;height:100%;object-fit:cover}
.asw-row.bot .asw-msg-avatar{background:var(--asw-primary-soft);color:var(--asw-primary)}
/* Visitor avatar: identity tone from the theme (theme hook --asw-user-avatar-*). */
.asw-row.user .asw-msg-avatar{background:var(--asw-user-avatar-bg,var(--asw-primary));color:var(--asw-user-avatar-color,var(--asw-on-primary))}
.asw-no-avatar .asw-msg-avatar{display:none}
/* The message column declares its own writing direction so the bubble hugs the
 * physical edge of its row no matter what direction a theme sets on the panel:
 * with direction:rtl a flex-end column aligns to the physical left (assistant)
 * and flex-start to the physical right (visitor). Bubble text stays Persian
 * (text-align:start inside an rtl box = right-aligned). */
.asw-col{max-width:100%;min-width:0;direction:rtl;display:flex;flex-direction:column;align-items:flex-end}
.asw-row.user .asw-col{align-items:flex-start}
.asw-bubble{position:relative;max-width:100%;padding:var(--asw-bubble-py) var(--asw-bubble-px);font-size:var(--asw-fs-body);line-height:var(--asw-lh);word-break:break-word;white-space:pre-wrap;overflow-wrap:anywhere;text-align:start}
/* Bubble treatments are theme-hooks (see themes/*.css); core only defaults them.
 * Geometry lives in --asw-bubble-r / --asw-bubble-notch so a theme can restyle
 * the silhouette with a token, and so the customer's bubble_style choice (the
 * data-bubble variants below) still wins when it is not the default. */
.asw-row.bot .asw-bubble{background:var(--asw-bot-bubble-bg,var(--asw-bot-bg));color:var(--asw-bot-text);border:1px solid var(--asw-bot-bubble-border,var(--asw-border));border-radius:var(--asw-bubble-r);border-end-start-radius:var(--asw-bubble-notch);box-shadow:var(--asw-bot-bubble-shadow,var(--asw-shadow-subtle))}
.asw-row.user .asw-bubble{background:var(--asw-user-bubble-bg,var(--asw-primary));color:var(--asw-user-bubble-text,var(--asw-on-brand));border-radius:var(--asw-bubble-r);border-end-end-radius:var(--asw-bubble-notch)}
.asw-bubble>*+*{margin-top:var(--asw-sp-2)}
.asw-bubble p{margin:4px 0}
.asw-bubble p:first-child{margin-top:0}
.asw-bubble p:last-child{margin-bottom:0}
.asw-bubble strong{font-weight:var(--asw-w-bold)}
.asw-bubble em{font-style:italic}
.asw-bubble a{color:inherit;text-decoration:underline;text-underline-offset:2px;text-decoration-thickness:1px;text-decoration-color:color-mix(in srgb,currentColor 45%,transparent)}
.asw-row.bot .asw-bubble a{color:var(--asw-primary);text-decoration-color:color-mix(in srgb,var(--asw-primary) 45%,transparent)}
.asw-bubble a:hover{text-decoration-color:currentColor}
.asw-bubble ul,.asw-bubble ol{margin:8px 0 4px;padding-inline-start:22px}
.asw-bubble li{margin:4px 0}
.asw-bubble li::marker{color:var(--asw-primary)}
.asw-bubble img,.asw-bubble video,.asw-bubble iframe{max-width:100%;height:auto;border-radius:var(--asw-r-sm)}
.asw-bubble .asw-suggestion{margin-top:var(--asw-sp-2)}
.asw-bubble.streaming::after{content:"";display:inline-block;width:7px;height:14px;margin-inline-start:3px;border-radius:2px;background:currentColor;opacity:.5;vertical-align:-2px;animation:asw-caret 1s steps(1) infinite}
.asw-time{padding:5px 4px 0;font-size:10px;font-weight:var(--asw-w-medium);color:var(--asw-text-muted)}
.asw-row.user .asw-time{text-align:end}
.asw-divider{margin-inline:auto;margin-block:var(--asw-sp-1);display:flex;align-items:center;gap:var(--asw-sp-2);color:var(--asw-text-muted);font-size:var(--asw-fs-xs);font-weight:var(--asw-w-medium)}
.asw-divider::before,.asw-divider::after{content:"";width:26px;height:1px;background:var(--asw-border)}
.asw-rule-hint{flex:1 1 100%;margin-top:2px;font-size:var(--asw-fs-xs);color:var(--asw-text-muted)}

/* who is answering — the visitor must never have to guess */
.asw-bubble.asw-live-bubble-agent{border-color:color-mix(in srgb,var(--asw-success) 34%,var(--asw-border))}
.asw-row.asw-live-row-agent .asw-msg-avatar{background:var(--asw-success-soft);color:var(--asw-success)}
.asw-bubble.asw-live-bubble-note{background:transparent;border:1px dashed var(--asw-border-strong);color:var(--asw-text-secondary);font-size:var(--asw-fs-sm);padding:7px var(--asw-sp-3);box-shadow:none}
.asw-row.asw-live-row-note{margin-inline:auto;max-width:92%}
.asw-row.asw-live-row-note .asw-msg-avatar{display:none}
.asw-live-badge{font-size:var(--asw-fs-xs);font-weight:var(--asw-w-bold);color:var(--asw-success);margin-bottom:2px}
/* System notices (claim/close): centered, quiet — centring is direction-proof. */
.asw-row.note{margin-inline:auto;flex-direction:column;align-items:center;max-width:92%}
.asw-row.note .asw-msg-avatar{display:none}

/* ─────────────── 9. ERROR / RETRY ─────────────── */
.asw-bubble.asw-error-bubble{border-color:color-mix(in srgb,var(--asw-error) 34%,transparent);background:color-mix(in srgb,var(--asw-error) 6%,var(--asw-bot-bg));color:var(--asw-text)}
.asw-retry{display:inline-flex;align-items:center;gap:6px;margin-top:var(--asw-sp-2);padding:6px var(--asw-sp-3);border:1px solid var(--asw-border-strong);border-radius:var(--asw-r-sm);background:var(--asw-bg);color:var(--asw-text);font-family:inherit;font-size:var(--asw-fs-xs);font-weight:var(--asw-w-medium);cursor:pointer;transition:background-color var(--asw-dur-fast),border-color var(--asw-dur-fast)}
.asw-retry:hover{background:var(--asw-surface)}
.asw-retry svg{width:13px;height:13px}

/* ─────────────── 10. TYPING ─────────────── */
.asw-typing{position:relative;z-index:1;flex:none;display:flex;align-items:center;gap:var(--asw-sp-2);padding:2px var(--asw-sp-4) 10px;margin-top:-6px}
.asw-typing-ava{width:26px;height:26px;flex:none;border-radius:var(--asw-r-sm);background:var(--asw-primary-soft);color:var(--asw-primary);display:grid;place-items:center}
.asw-typing-ava svg{width:12px;height:12px}
.asw-typing-bubble{display:flex;align-items:center;gap:5px;padding:10px var(--asw-sp-3);border-radius:var(--asw-r-lg);border-end-start-radius:var(--asw-r-sm);background:var(--asw-bot-bg);border:1px solid var(--asw-border)}
.asw-typing-dot{width:6px;height:6px;border-radius:var(--asw-typing-dot-r);background:var(--asw-text-muted);animation:asw-blink 1.2s var(--asw-ease) infinite}
.asw-typing-dot:nth-child(2){animation-delay:.14s}
.asw-typing-dot:nth-child(3){animation-delay:.28s}
.asw-typing-label{margin-inline-start:3px;font-size:var(--asw-fs-xs);font-weight:var(--asw-w-medium);color:var(--asw-text-muted)}

/* ─────────────── 11. WELCOME ─────────────── */
.asw-hero{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;text-align:center;gap:var(--asw-sp-3);padding:var(--asw-sp-6) var(--asw-sp-3) var(--asw-sp-3);animation:asw-msg-in var(--asw-dur-slow) var(--asw-ease) both;transition:opacity var(--asw-dur),transform var(--asw-dur)}
.asw-hero-out{opacity:0!important;transform:translateY(-8px)!important;pointer-events:none}
.asw-hero-orb-wrap{width:48px;height:48px;border-radius:var(--asw-r-lg);background:var(--asw-primary-soft);color:var(--asw-primary);display:grid;place-items:center}
.asw-hero-orb{width:100%;height:100%;display:grid;place-items:center;font-size:20px;font-weight:var(--asw-w-bold);overflow:hidden}
.asw-hero-orb img{width:100%;height:100%;object-fit:cover;border-radius:inherit}
.asw-hero-orb svg{width:22px;height:22px}
.asw-hero-text{font-size:var(--asw-fs-lg);font-weight:var(--asw-w-bold);color:var(--asw-text);line-height:var(--asw-lh-tight);max-width:300px}
.asw-hero-sub{font-size:var(--asw-fs-sm);color:var(--asw-text-secondary);line-height:var(--asw-lh);max-width:300px;margin-top:-6px}
.asw-hero-grid{display:grid;grid-template-columns:1fr 1fr;gap:var(--asw-sp-2);width:100%;max-width:342px}
.asw-hero-grid .asw-suggestion{justify-content:flex-start;text-align:start;white-space:normal;border-radius:var(--asw-r-md);padding:10px var(--asw-sp-3);line-height:var(--asw-lh-tight);font-size:var(--asw-fs-sm);gap:var(--asw-sp-2);background:var(--asw-surface);border-radius:var(--asw-r-md)}
.asw-hero-grid .asw-suggestion>span:first-child{-webkit-line-clamp:2;-webkit-box-orient:vertical;display:-webkit-box;overflow:hidden}
.asw-card-arrow{display:grid;place-items:center;color:var(--asw-text-muted)}
.asw-card-arrow svg{width:14px;height:14px}
@media(max-width:400px){.asw-hero-grid{grid-template-columns:1fr}}

/* ─────────────── 12. SUGGESTIONS ─────────────── */
.asw-suggestions{position:relative;z-index:2;flex:none;display:flex;gap:var(--asw-sp-2);align-items:center;overflow-x:auto;padding:var(--asw-sp-2) var(--asw-sp-3) 6px;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.asw-suggestions::-webkit-scrollbar{display:none}
.asw-suggestion{display:inline-flex;align-items:center;gap:6px;flex:none;max-width:100%;padding:7px var(--asw-sp-3);border:var(--asw-chip-border);border-radius:var(--asw-chip-radius);background:var(--asw-chip-bg);color:var(--asw-chip-ink);font-family:inherit;font-size:var(--asw-fs-sm);font-weight:var(--asw-w-medium);cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:background-color var(--asw-dur-fast),border-color var(--asw-dur-fast),color var(--asw-dur-fast)}
.asw-suggestion:hover{background:var(--asw-chip-hover-bg);border-color:var(--asw-chip-hover-border);color:var(--asw-chip-hover-ink)}
.asw-idx{font-variant-numeric:tabular-nums;font-size:var(--asw-fs-xs);color:var(--asw-text-muted)}

/* ─────────────── 13. HANDOFF + FEEDBACK + CITATIONS ─────────────── */
.asw-handoff{flex:1 1 100%;display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin-top:2px;padding:var(--asw-sp-3);border-radius:var(--asw-r-md);border:1px solid var(--asw-border);background:var(--asw-surface)}
.asw-messages:not(.asw-no-avatar) .asw-row>.asw-handoff,.asw-messages:not(.asw-no-avatar) .asw-row>.asw-leadform{margin-inline-start:38px}
.asw-handoff-label{width:100%;font-size:var(--asw-fs-sm);line-height:var(--asw-lh-tight);color:var(--asw-text-secondary)}
.asw-handoff-btn{display:inline-flex;align-items:center;gap:6px;padding:7px var(--asw-sp-3);border-radius:var(--asw-r-sm);border:1px solid var(--asw-border);background:var(--asw-bg);color:var(--asw-text);font-family:inherit;font-size:var(--asw-fs-xs);font-weight:var(--asw-w-bold);cursor:pointer;transition:border-color var(--asw-dur-fast),color var(--asw-dur-fast),background-color var(--asw-dur-fast)}
.asw-handoff-btn:hover{border-color:var(--asw-primary);color:var(--asw-primary)}
.asw-handoff-btn:disabled{opacity:.6;cursor:default}
.asw-handoff-btn svg{width:13px;height:13px}
.asw-feedback{display:flex;align-items:center;gap:2px;padding-top:2px;opacity:0;transform:translateY(-2px);transition:opacity var(--asw-dur-fast),transform var(--asw-dur-fast)}
.asw-row:hover .asw-feedback,.asw-feedback:focus-within,.asw-feedback[data-sent],.asw-row.asw-last .asw-feedback{opacity:1;transform:none}
.asw-fb-btn{width:var(--asw-fb-size);height:var(--asw-fb-size);border:0;border-radius:var(--asw-r-sm);background:transparent;color:var(--asw-text-muted);display:grid;place-items:center;cursor:pointer;padding:0;transition:background-color var(--asw-dur-fast),color var(--asw-dur-fast)}
.asw-fb-btn:hover{background:var(--asw-state-hover);color:var(--asw-text)}
.asw-fb-btn.active{background:var(--asw-primary-soft);color:var(--asw-primary)}
.asw-fb-btn svg{width:14px;height:14px}
.asw-fb-btn.fb-copy.copied{color:var(--asw-success)}
.asw-citations{flex:1 1 100%;display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:var(--asw-sp-2);font-size:var(--asw-fs-xs)}
.asw-citations-label{color:var(--asw-text-muted)}
.asw-citation{display:inline-flex;align-items:center;gap:4px;max-width:100%;padding:3px 8px;border:var(--asw-cite-border);border-radius:var(--asw-cite-radius);background:var(--asw-cite-bg);color:var(--asw-text-secondary);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
a.asw-citation:hover{border-color:var(--asw-border-strong);color:var(--asw-text)}
.asw-citation svg{width:11px;height:11px;flex:none}

/* ─────────────── 14. MARKDOWN: CODE / TABLE ─────────────── */
.asw-bubble code{padding:2px 6px;border-radius:6px;background:var(--asw-surface-2);font-family:var(--asw-mono);font-size:.86em;border:1px solid var(--asw-border);white-space:pre-wrap}
.asw-code-wrap{position:relative;flex:1 1 100%;width:100%;margin-top:var(--asw-sp-2);border:1px solid var(--asw-border);border-radius:var(--asw-r-md);background:var(--asw-surface);overflow:hidden}
.asw-code-header{display:flex;align-items:center;justify-content:space-between;gap:var(--asw-sp-2);padding:6px 10px;border-bottom:1px solid var(--asw-border);background:var(--asw-surface-2)}
.asw-code-lang{font-family:var(--asw-mono);font-size:var(--asw-fs-xs);color:var(--asw-text-muted);text-transform:lowercase}
.asw-code-copy{display:inline-flex;align-items:center;gap:4px;border:0;border-radius:6px;background:transparent;color:var(--asw-text-secondary);font-family:inherit;font-size:var(--asw-fs-xs);cursor:pointer;padding:3px 6px}
.asw-code-copy:hover{background:var(--asw-bg);color:var(--asw-text)}
.asw-code-copy svg{width:12px;height:12px}
.asw-code-block{display:block;margin:0;padding:10px var(--asw-sp-3);overflow-x:auto;font-family:var(--asw-mono);font-size:12.5px;line-height:1.7;direction:ltr;text-align:left;color:var(--asw-text);background:transparent}
.asw-code-block code{padding:0;border:0;background:none;font-size:inherit}
.asw-table-wrap{flex:1 1 100%;width:100%;margin-top:var(--asw-sp-2);overflow-x:auto;border:1px solid var(--asw-border);border-radius:var(--asw-r-md)}
.asw-table-wrap table{border-collapse:collapse;width:100%;font-size:var(--asw-fs-sm)}
.asw-table-wrap th,.asw-table-wrap td{padding:7px 10px;border-bottom:1px solid var(--asw-border);text-align:start;white-space:nowrap}
.asw-table-wrap th{background:var(--asw-surface);font-weight:var(--asw-w-bold)}
.asw-table-wrap tr:last-child td{border-bottom:0}
.asw-heading{font-weight:var(--asw-w-bold);margin-top:var(--asw-sp-2)!important}
.asw-ltr{direction:ltr;unicode-bidi:embed;text-align:left}
.asw-ell{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}

/* ─────────────── 15. COMPOSER ─────────────── */
.asw-footer{position:relative;z-index:2;flex:none;padding:var(--asw-sp-2) var(--asw-sp-3) calc(10px + env(safe-area-inset-bottom,0px));background:var(--asw-bg);border-top:1px solid var(--asw-border)}
.asw-input-wrap{display:flex;align-items:flex-end;gap:var(--asw-composer-gap);padding-block:var(--asw-composer-pad);padding-inline:var(--asw-composer-pad-start,6px) var(--asw-composer-pad-end,var(--asw-sp-4));border:var(--asw-composer-border);border-radius:var(--asw-input-sq,var(--asw-r-lg));background:var(--asw-composer-bg);box-shadow:var(--asw-composer-shadow);transition:border-color var(--asw-dur-fast),background-color var(--asw-dur-fast),box-shadow var(--asw-dur-fast)}
.asw-input-wrap:focus-within{border-color:var(--asw-primary);background:var(--asw-input-focus-bg);box-shadow:0 0 0 3px var(--asw-primary-soft)}
.asw-input-wrap.asw-listening{border-color:var(--asw-error);box-shadow:0 0 0 3px var(--asw-error-soft)}
.asw-input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:var(--asw-text);font-family:inherit;font-size:var(--asw-font-size,14px);line-height:1.6;resize:none;padding:7px 0;max-height:132px;overflow-y:auto;scrollbar-width:none}
.asw-input::-webkit-scrollbar{display:none}
.asw-input::placeholder{color:var(--asw-text-muted)}
.asw-input:disabled{opacity:.65;cursor:not-allowed}
.asw-wave{display:flex;align-items:center;gap:2px;padding-inline-end:4px}
.asw-wave span{width:2px;height:10px;border-radius:1px;background:var(--asw-error);animation:asw-wave 900ms var(--asw-ease) infinite}
.asw-wave span:nth-child(2){animation-delay:.1s}
.asw-wave span:nth-child(3){animation-delay:.2s}
.asw-wave span:nth-child(4){animation-delay:.3s}
.asw-wave span:nth-child(5){animation-delay:.4s}
.asw-mic{width:34px;height:34px;flex:none;border:0;border-radius:var(--asw-r-sm);background:transparent;color:var(--asw-text-muted);display:grid;place-items:center;cursor:pointer;padding:0;transition:background-color var(--asw-dur-fast),color var(--asw-dur-fast)}
.asw-mic:hover{background:var(--asw-surface);color:var(--asw-primary)}
.asw-mic:active{transform:scale(.94)}
.asw-mic svg{width:16px;height:16px}
.asw-input-wrap.asw-listening .asw-mic{color:var(--asw-error)}
.asw-send{width:var(--asw-send-size);height:var(--asw-send-size);flex:none;border:0;border-radius:var(--asw-btn-sq,var(--asw-r-sm));display:grid;place-items:center;background:var(--asw-send-bg);color:var(--asw-send-ink);box-shadow:var(--asw-send-shadow);cursor:pointer;padding:0;transition:background-color var(--asw-dur-fast),opacity var(--asw-dur-fast),box-shadow var(--asw-dur-fast)}
.asw-send:not(:disabled):hover{background:var(--asw-send-hover)}
.asw-send:not(:disabled):active{transform:scale(.94)}
.asw-send:disabled{cursor:default;opacity:.4}
.asw-send svg{width:17px;height:17px}
.asw-send.asw-stop{background:var(--asw-error);color:#fff}
.asw-foot-meta{display:flex;align-items:center;justify-content:space-between;gap:var(--asw-sp-3);flex-wrap:wrap;padding-top:6px}
.asw-disclaim{font-size:10.5px;color:var(--asw-text-muted);line-height:1.5}
.asw-powered{font-size:10.5px;color:var(--asw-text-muted);display:flex;align-items:center;gap:var(--asw-sp-2);margin-inline-start:auto}
.asw-powered a{color:var(--asw-text-secondary);text-decoration:none}
.asw-powered a:hover{text-decoration:underline}
.asw-resource-links{display:flex;align-items:center;gap:var(--asw-sp-2);border-inline-start:1px solid var(--asw-border);padding-inline-start:var(--asw-sp-2)}
.asw-resource-links a{color:var(--asw-text-muted)}
.asw-scrollbtn{position:absolute;top:-46px;inset-inline-end:14px;z-index:5;width:34px;height:34px;border:1px solid var(--asw-border);border-radius:var(--asw-r-pill);background:var(--asw-bg);color:var(--asw-text-secondary);display:grid;place-items:center;cursor:pointer;padding:0;box-shadow:var(--asw-shadow-elevated);opacity:0;transform:translateY(6px);pointer-events:none;transition:opacity var(--asw-dur-fast),transform var(--asw-dur) var(--asw-ease),color var(--asw-dur-fast),border-color var(--asw-dur-fast)}
.asw-scrollbtn.show{opacity:1;transform:none;pointer-events:auto}
.asw-scrollbtn:hover{color:var(--asw-primary);border-color:var(--asw-primary)}
.asw-scrollbtn svg{width:16px;height:16px}
.asw-toast{position:absolute;top:var(--asw-sp-3);inset-inline:14px;z-index:50;display:flex;align-items:center;justify-content:center;gap:var(--asw-sp-2);padding:10px var(--asw-sp-4);border-radius:var(--asw-r-md);background:color-mix(in srgb,var(--asw-text) 94%,transparent);color:var(--asw-bg);font-size:var(--asw-fs-sm);font-weight:var(--asw-w-medium);box-shadow:var(--asw-shadow-elevated);opacity:0;transform:translateY(-6px);pointer-events:none;transition:opacity var(--asw-dur),transform var(--asw-dur)}
.asw-toast.show{opacity:1;transform:none}
.asw-toast svg{width:15px;height:15px;flex:none}
.asw-spinner{width:14px;height:14px;border:2px solid color-mix(in srgb,var(--asw-text-muted) 40%,transparent);border-top-color:var(--asw-primary);border-radius:50%;animation:asw-spin 700ms linear infinite;display:inline-block}

/* ─────────────── 16. CONTACT SHEET ─────────────── */
.asw-sheet{position:absolute;inset:0;z-index:40;display:flex;align-items:flex-end;opacity:0;pointer-events:none;transition:opacity var(--asw-dur) var(--asw-ease)}
.asw-sheet::before{content:"";position:absolute;inset:0;background:color-mix(in srgb,#0a0c18 44%,transparent)}
.asw-sheet.open{opacity:1;pointer-events:auto}
.asw-sheet-card{position:relative;width:100%;max-height:88%;overflow-y:auto;overscroll-behavior:contain;padding:var(--asw-sp-4);background:var(--asw-bg);border-top:1px solid var(--asw-border);border-radius:var(--asw-radius) var(--asw-radius) 0 0;box-shadow:0 -18px 50px -18px rgba(15,18,40,.4);transform:translateY(14px);transition:transform var(--asw-dur-slow) var(--asw-ease)}
.asw-sheet.open .asw-sheet-card{transform:none}
.asw-sheet-grip{width:40px;height:4px;border-radius:var(--asw-r-pill);background:var(--asw-border-strong);margin:0 auto var(--asw-sp-4)}
.asw-sheet-close{position:absolute;top:var(--asw-sp-3);inset-inline-end:var(--asw-sp-3);width:30px;height:30px;border:1px solid var(--asw-border);border-radius:var(--asw-r-sm);background:var(--asw-surface);color:var(--asw-text-secondary);display:grid;place-items:center;cursor:pointer;padding:0;transition:background-color var(--asw-dur-fast),color var(--asw-dur-fast)}
.asw-sheet-close:hover{background:var(--asw-surface-2);color:var(--asw-text)}
.asw-sheet-close svg{width:14px;height:14px}
.asw-sheet-kicker{font-size:10.5px;font-weight:var(--asw-w-bold);color:var(--asw-text-muted);letter-spacing:0}
.asw-sheet-title,.asw-leadform-title{font-size:var(--asw-fs-lg);font-weight:var(--asw-w-bold);color:var(--asw-text)}
.asw-sheet-desc,.asw-leadform-desc{font-size:var(--asw-fs-sm);color:var(--asw-text-secondary);line-height:var(--asw-lh);margin:4px 0 var(--asw-sp-3)}
.asw-chans{display:grid;gap:var(--asw-sp-2)}
.asw-chan{display:flex;align-items:center;gap:var(--asw-sp-3);width:100%;padding:10px var(--asw-sp-3);border:1px solid var(--asw-border);border-radius:var(--asw-r-md);background:var(--asw-bg);color:var(--asw-text);font-family:inherit;font-size:var(--asw-fs-sm);font-weight:var(--asw-w-medium);cursor:pointer;text-align:start;text-decoration:none;transition:border-color var(--asw-dur-fast),background-color var(--asw-dur-fast)}
.asw-chan:hover{border-color:var(--asw-border-strong);background:var(--asw-surface)}
.asw-chan-ic{width:30px;height:30px;flex:none;border-radius:var(--asw-r-sm);display:grid;place-items:center;background:color-mix(in srgb,var(--chan,var(--asw-primary)) 12%,transparent);color:var(--chan,var(--asw-primary))}
.asw-chan-ic svg{width:15px;height:15px}
.asw-chan-tx{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.asw-chan-go{display:grid;place-items:center;color:var(--asw-text-muted)}
.asw-chan-go svg{width:14px;height:14px}

/* ─────────────── 17. FORMS / LEAD ─────────────── */
.asw-form,.asw-sheet-form{display:flex;flex-direction:column;gap:var(--asw-sp-3);margin-top:var(--asw-sp-3)}
.asw-leadform{flex:1 1 100%;margin:2px 0;padding:var(--asw-sp-4);border-radius:var(--asw-r-lg);border:1px solid var(--asw-border);background:var(--asw-surface);animation:asw-msg-in var(--asw-dur-slow) var(--asw-ease) both}
.asw-leadform-wrap{animation:asw-msg-in var(--asw-dur-slow) var(--asw-ease) both}
.asw-field{display:flex;flex-direction:column;gap:5px}
.asw-field-row{display:grid;gap:var(--asw-sp-3);grid-template-columns:1fr 1fr}
.asw-flabel{font-size:var(--asw-fs-xs);font-weight:var(--asw-w-medium);color:var(--asw-text-secondary)}
.asw-form input,.asw-form textarea{width:100%;padding:9px var(--asw-sp-3);border:1px solid var(--asw-border-strong);border-radius:var(--asw-r-sm);background:var(--asw-input-bg);color:var(--asw-text);font-family:inherit;font-size:var(--asw-fs-sm);outline:none;transition:border-color var(--asw-dur-fast),box-shadow var(--asw-dur-fast)}
.asw-form textarea{min-height:78px;resize:vertical}
.asw-form input:focus,.asw-form textarea:focus{border-color:var(--asw-primary);box-shadow:0 0 0 3px var(--asw-primary-soft)}
/* Validation is driven by the classes the form script already sets
 * (invalid / ok). A message only exists once its field is invalid, so nothing
 * shouts at a visitor who has not typed yet; the message itself is text, so
 * colour is never the only signal. */
.asw-field .asw-ferr{display:none}
.asw-field.invalid .asw-ferr{display:block}
.asw-field.invalid input,.asw-field.invalid textarea{border-color:var(--asw-error)}
.asw-field.invalid input:focus,.asw-field.invalid textarea:focus{border-color:var(--asw-error);box-shadow:0 0 0 3px var(--asw-error-soft)}
.asw-field.ok input,.asw-field.ok textarea{border-color:color-mix(in srgb,var(--asw-success) 55%,var(--asw-border-strong))}
.asw-ferr{font-size:var(--asw-fs-xs);color:var(--asw-error)}
.asw-form-err{display:none;padding:8px var(--asw-sp-3);border-radius:var(--asw-r-sm);background:var(--asw-error-soft);color:color-mix(in srgb,var(--asw-error) 76%,var(--asw-text));font-size:var(--asw-fs-xs)}
.asw-form-err.show{display:block}
.asw-form-submit{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:10px var(--asw-sp-4);border:0;border-radius:var(--asw-r-sm);background:var(--asw-primary);color:var(--asw-on-brand);font-family:inherit;font-size:var(--asw-fs-sm);font-weight:var(--asw-w-bold);cursor:pointer;transition:background-color var(--asw-dur-fast),opacity var(--asw-dur-fast)}
.asw-form-submit:not(:disabled):hover{background:var(--asw-primary-hover)}
.asw-form-submit:disabled{opacity:.65;cursor:default}
.asw-form-submit svg{width:15px;height:15px}
.asw-btn-txt{white-space:nowrap}
.asw-form-note{font-size:10.5px;color:var(--asw-text-muted);line-height:1.6}
.asw-checkmark{width:56px;height:56px;stroke:var(--asw-success);stroke-width:3;fill:none;stroke-linecap:round;stroke-linejoin:round}
.asw-checkmark circle{stroke-dasharray:170;stroke-dashoffset:170;animation:asw-draw .7s var(--asw-ease) .05s forwards}
.asw-checkmark path{stroke-dasharray:44;stroke-dashoffset:44;animation:asw-draw .45s var(--asw-ease) .55s forwards}
.asw-form-success{display:flex;flex-direction:column;align-items:center;text-align:center;gap:var(--asw-sp-2);padding:var(--asw-sp-5) var(--asw-sp-3)}
.asw-fs-title{font-size:var(--asw-fs-body);font-weight:var(--asw-w-bold);color:var(--asw-text);margin-top:6px}
.asw-fs-desc{font-size:var(--asw-fs-sm);color:var(--asw-text-secondary);line-height:var(--asw-lh);max-width:280px}
.asw-fs-close{margin-top:var(--asw-sp-2);padding:9px var(--asw-sp-5);border-radius:var(--asw-r-sm);border:1px solid var(--asw-border);background:var(--asw-surface);color:var(--asw-text);font-family:inherit;font-size:var(--asw-fs-sm);font-weight:var(--asw-w-bold);cursor:pointer;transition:border-color var(--asw-dur-fast),color var(--asw-dur-fast)}
.asw-fs-close:hover{border-color:var(--asw-primary);color:var(--asw-primary)}

/* ─────────────── 18. STATE MATRIX ─────────────── */
/* Presence semantics: green = verified-healthy session, gray = unknown /
 * initializing / network down (never a false alarm for red), red = confirmed
 * service lock. A single AI-request failure never turns the dot red. */
.asw-root[data-ui-state="init"]{--asw-presence:var(--asw-text-muted)}
.asw-root[data-ui-state="online"]{--asw-presence:var(--asw-success)}
.asw-root[data-ui-state="thinking"]{--asw-presence:var(--asw-warning)}
.asw-root[data-ui-state="human_waiting"]{--asw-presence:var(--asw-warning)}
.asw-root[data-ui-state="human_active"]{--asw-presence:var(--asw-success)}
/* Confirmed unreachable is red — the same family as a service lock — while
   the "init" state stays neutral so "not verified yet" is never mistaken for
   an outage. */
.asw-root[data-ui-state="offline"]{--asw-presence:var(--asw-error)}
.asw-root[data-ui-state="locked"]{--asw-presence:var(--asw-error)}
.asw-root[data-ui-state="human_waiting"] .asw-status,.asw-root[data-ui-state="thinking"] .asw-status{animation:asw-presence 2.4s var(--asw-ease) infinite}
/* exactly one identity pill at a time: the live chip replaces the online badge */
.asw-root[data-live-mode="human"] .asw-badge,.asw-root[data-live-mode="waiting"] .asw-badge{display:none}
.asw-root[data-ui-state="human_active"] .asw-live-chip{background:color-mix(in srgb,var(--asw-success) 20%,transparent);color:color-mix(in srgb,var(--asw-success) 82%,var(--asw-header-text))}
.asw-root[data-ui-state="locked"] .asw-input-wrap{background:var(--asw-surface);opacity:.8}
.asw-root[data-ui-state="locked"] .asw-suggestions,.asw-root[data-ui-state="locked"] .asw-foot-meta{display:none}

/* ─────────────── 19. RESPONSIVE ─────────────── */
/* 320 → 430 → 768 → desktop. The layout is not a scaled-down desktop: the
 * panel stops growing, the header gives the title priority over the actions
 * (the title truncates, the buttons never collide with it) and the composer
 * keeps a single row at every width. */
@media (max-width:768px){
  .asw-panel{max-width:min(var(--asw-panel-w),calc(100vw - 32px))}
}
@media (max-width:480px){
  .asw-root.mobile-fullscreen .asw-panel{inset:0!important;width:100%;height:100vh;height:100dvh;max-width:100%;max-height:100dvh;border-radius:0;border:0;transform:translateY(12px)}
  .asw-root.mobile-fullscreen .asw-panel.open{transform:none}
  .asw-root.mobile-fullscreen .asw-header{padding-top:max(var(--asw-sp-3),env(safe-area-inset-top))}
  .asw-root.mobile-fullscreen .asw-sheet-card{border-radius:0}
  .asw-row{max-width:94%}
}
/* Phone widths: the panel hugs the viewport, the transcript gains the pixels
 * back from the gutters, and the row width follows so long Persian sentences
 * get the full column. */
@media (max-width:430px){
  .asw-panel{max-width:calc(100vw - 16px)}
  .asw-row{max-width:96%}
  .asw-title{max-width:150px}
  .asw-footer{padding-inline:var(--asw-sp-2)}
  .asw-suggestions{padding-inline:var(--asw-sp-2)}
  .asw-hero-grid{grid-template-columns:1fr}
}
@media (hover:none){.asw-fab-label{display:none}.asw-feedback{opacity:1;transform:none}}
@media (max-width:360px){
  .asw-field-row{grid-template-columns:1fr}
  .asw-header-btn{width:30px;height:30px}
  .asw-title{max-width:120px}
}
/* 320px: the tightest supported width. The header must never wrap or scroll,
 * so avatar, gaps and actions all shrink a step before the title does — the
 * title keeps an ellipsis instead of pushing the buttons off the panel. */
@media (max-width:340px){
  .asw.asw-root{--asw-avatar-size:32px;--asw-header-gap:var(--asw-sp-2);--asw-bubble-px:var(--asw-sp-2);--asw-msgs-pad:var(--asw-sp-3) var(--asw-sp-2) var(--asw-sp-2)}
  .asw-heading{gap:var(--asw-sp-2)}
  .asw-title{max-width:96px}
  .asw-header-btn{width:28px;height:28px}
  .asw-actions{gap:2px}
  .asw-foot-meta{gap:var(--asw-sp-1)}
}

/* ─────────────── 20. CONFIG VARIANTS ─────────────── */
/* bubble_style: "rounded" is the default and is deliberately NOT re-declared
 * here — it means "use the theme silhouette". A customer who picks sharp or
 * pill overrides the theme, which is the whole point of the setting. */
.asw[data-bubble="sharp"]{--asw-bubble-r:4px;--asw-bubble-notch:2px}
.asw[data-bubble="pill"]{--asw-bubble-r:var(--asw-r-pill);--asw-bubble-notch:var(--asw-r-pill);--asw-bubble-py:9px}
.asw[data-font="small"]{--asw-fs-body:12px;--asw-fs-sm:11.5px;--asw-fs-xs:10.5px;--asw-fs-lg:13.5px}
.asw[data-font="large"]{--asw-fs-body:16px;--asw-fs-sm:14.5px;--asw-fs-xs:13px;--asw-fs-lg:17.5px}
.asw[data-anim="off"] *,.asw[data-anim="off"] *::before,.asw[data-anim="off"] *::after{animation:none!important;transition:none!important}

/* ─────────────── 21. ACCESSIBILITY & MOTION ─────────────── */
.asw :focus-visible{outline:2px solid var(--asw-focus);outline-offset:2px}
.asw ::selection{background:var(--asw-primary-soft)}
@keyframes asw-msg-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes asw-msg-out{to{opacity:0;transform:translateY(-4px)}}
@keyframes asw-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes asw-blink{0%,60%,100%{opacity:.35}30%{opacity:1}}
@keyframes asw-caret{0%,49%{opacity:.5}50%,100%{opacity:0}}
@keyframes asw-draw{to{stroke-dashoffset:0}}
@keyframes asw-spin{to{transform:rotate(360deg)}}
@keyframes asw-presence{0%,100%{opacity:1}50%{opacity:.45}}
@keyframes asw-wave{0%,100%{transform:scaleY(.5)}50%{transform:scaleY(1)}}
@media (prefers-reduced-motion:reduce){
  .asw,.asw *,.asw *::before,.asw *::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;scroll-behavior:auto!important}
  .asw-checkmark circle,.asw-checkmark path{stroke-dashoffset:0}
}

    /* ─── Live human handoff (shared client — generated block) ───
       Only accents: the real look still comes from each theme's own tokens,
       so all eleven themes keep their design language. */
    .asw-live-chip{display:inline-flex;align-items:center;height:18px;padding:0 7px;border-radius:999px;font-size:9.5px;font-weight:800;line-height:1;background:color-mix(in srgb,var(--asw-primary,currentColor) 16%,transparent);color:var(--asw-primary,currentColor)}
    .asw-live-chip[hidden]{display:none}
    .asw-live-cta{font-weight:800;border-style:dashed}
    .asw-live-bubble-agent{border-inline-start:3px solid var(--asw-primary,currentColor)}
    .asw-live-bubble-note{font-size:.92em;opacity:.92;border:1px dashed color-mix(in srgb,currentColor 30%,transparent);background:transparent}
    .asw-live-badge{font-size:9.5px;font-weight:800;opacity:.75;margin-bottom:3px;letter-spacing:.02em}
    @media (prefers-reduced-motion: reduce){.asw-live-chip{animation:none}}

/* onyx — premium dark developer tooling.
 * Concept: an expensive console. Deep charcoal planes separated by 1px
 * hairlines, one electric accent used as an edge light, sharp 6-14px corners,
 * tabular micro-type. Depth comes from borders and value steps, not shadows.
 * Silhouette: squared panel with a hairline, square avatar, squared bubbles,
 * dark-on-dark visitor bubble with a bright accent fill, cyan focus ring.
 */
.asw{
  --asw-primary:#22d3ee;--asw-secondary:#0ea5b7;--asw-accent:#67e8f9;
  --asw-primary-hover:color-mix(in srgb,var(--asw-primary) 86%,#000);
  --asw-on-primary:#04252b;
  /* geometry: precise, slightly sharp */
  --asw-r-sm:6px;--asw-r-md:10px;--asw-r-lg:14px;--asw-r-xl:18px;
  /* surfaces: three steps of charcoal, borders do the separating */
  --asw-bg:#0e1117;--asw-surface:#151a22;--asw-surface-2:#1b2130;--asw-surface-3:#222a3a;
  --asw-border:#242b38;--asw-border-strong:#39424f;
  --asw-text:#eaf0f8;--asw-text-secondary:#a3b0c2;--asw-text-muted:#8b98ad;
  --asw-bot-bg:#151a22;--asw-bot-text:#eaf0f8;
  --asw-user-bg:var(--asw-primary);--asw-user-text:#04252b;
  --asw-input-bg:#151a22;--asw-input-focus-bg:#0e1117;
  --asw-shadow-subtle:0 1px 2px rgba(0,0,0,.5);
  --asw-shadow-elevated:0 2px 6px rgba(0,0,0,.45),0 18px 40px -14px rgba(0,0,0,.7);
  --asw-shadow-modal:0 30px 70px -18px rgba(0,0,0,.85);
  --asw-success:#34d399;--asw-warning:#fbbf24;--asw-error:#f87171;

  /* ── panel: hairline shell + a 1px inner top highlight ── */
  --asw-panel-border-w:1px;--asw-panel-border-color:#2a3242;
  --asw-panel-shadow:0 30px 70px -18px rgba(0,0,0,.85);
  --asw-panel-ring:inset 0 1px 0 rgba(255,255,255,.06);

  /* ── header: charcoal plane, accent rail on top, hairline under ──
   * The header is deliberately not the brand colour: the accent is a rail and
   * a text colour, so a customer brand colour still reads as theirs. */
  --asw-header-bg:#0b0e14;
  --asw-header-ink:#eaf0f8;
  --asw-header-pad:var(--asw-sp-3) var(--asw-sp-3);
  --asw-header-min-h:60px;
  --asw-header-sep:1px solid #242b38;
  --asw-header-rail:linear-gradient(90deg,transparent,color-mix(in srgb,var(--asw-primary) 75%,transparent) 22%,color-mix(in srgb,var(--asw-primary) 75%,transparent) 78%,transparent);
  --asw-header-rail-h:2px;
  --asw-w-header:var(--asw-w-bold);
  --asw-avatar-sq:var(--asw-r-md);--asw-avatar-size:36px;
  --asw-avatar-bg:color-mix(in srgb,var(--asw-primary) 10%,#0b0e14);
  --asw-avatar-ink:var(--asw-primary);
  --asw-avatar-ring:inset 0 0 0 1px color-mix(in srgb,var(--asw-primary) 34%,transparent);
  --asw-user-avatar-bg:color-mix(in srgb,var(--asw-primary) 12%,#0b0e14);
  --asw-user-avatar-color:var(--asw-primary);

  /* ── bubbles: dark plane with a hairline; visitor gets the accent fill ── */
  --asw-msgs-pad:var(--asw-sp-4) var(--asw-sp-3) var(--asw-sp-2);
  --asw-msgs-gap:var(--asw-sp-3);--asw-row-max:88%;
  --asw-bubble-r:var(--asw-r-lg);--asw-bubble-notch:4px;
  --asw-bubble-px:var(--asw-sp-3);--asw-bubble-py:10px;
  --asw-bot-bubble-bg:var(--asw-surface);--asw-bot-bubble-border:var(--asw-border);
  --asw-bot-bubble-shadow:inset 0 1px 0 rgba(255,255,255,.04);
  --asw-user-bubble-bg:var(--asw-primary);--asw-user-bubble-text:var(--asw-on-brand);

  /* ── composer: inset dark field, focus glows once ── */
  --asw-composer-bg:var(--asw-input-bg);--asw-composer-border:1px solid var(--asw-border-strong);
  --asw-input-sq:var(--asw-r-md);--asw-composer-pad:5px;
  --asw-composer-pad-start:6px;--asw-composer-pad-end:6px;
  --asw-send-size:36px;--asw-send-bg:var(--asw-primary);--asw-send-ink:var(--asw-on-brand);
  --asw-send-shadow:0 0 0 1px color-mix(in srgb,var(--asw-primary) 40%,transparent),0 6px 18px -8px color-mix(in srgb,var(--asw-primary) 70%,transparent);
  --asw-btn-sq:var(--asw-r-sm);

  /* ── chips: rectangular, hairline, accent on hover ── */
  --asw-chip-radius:var(--asw-r-sm);--asw-chip-bg:var(--asw-surface);
  --asw-chip-border:1px solid var(--asw-border);--asw-chip-ink:var(--asw-text-secondary);
  --asw-chip-hover-bg:color-mix(in srgb,var(--asw-primary) 10%,var(--asw-surface));
  --asw-chip-hover-border:color-mix(in srgb,var(--asw-primary) 45%,transparent);
  --asw-chip-hover-ink:var(--asw-text);
  --asw-cite-radius:var(--asw-r-sm);--asw-cite-bg:transparent;
  --asw-cite-border:1px solid var(--asw-border);
  --asw-fb-size:28px;--asw-state-hover:var(--asw-surface-2);
  --asw-focus:var(--asw-primary);
  --asw-typing-dot-r:50%;

  /* ── fab: the one element allowed to glow ── */
  --asw-fab-bg:linear-gradient(140deg,color-mix(in srgb,var(--asw-primary) 92%,#fff),var(--asw-secondary));
  --asw-fab-color:var(--asw-on-brand);--asw-fab-sq:var(--asw-r-lg);--asw-fab-border:0;
  --asw-fab-shadow:0 8px 26px -8px color-mix(in srgb,var(--asw-primary) 55%,transparent);
  --asw-fab-ring:inset 0 1px 0 rgba(255,255,255,.28);
  --asw-ornament:none;
}
.asw.dark{
  /* Same personality, one stop deeper: the planes separate more, the accent
   * is the only thing that gets brighter. */
  --asw-bg:#080a0f;--asw-surface:#0f131b;--asw-surface-2:#151b25;--asw-surface-3:#1c2431;
  --asw-border:#1f2733;--asw-border-strong:#333d4d;
  --asw-text:#e6edf7;--asw-text-secondary:#98a5b8;--asw-text-muted:#7f8ca1;
  --asw-bot-bg:#0f131b;--asw-bot-text:#e6edf7;
  --asw-input-bg:#0f131b;--asw-input-focus-bg:#080a0f;
  --asw-header-bg:#05070b;--asw-header-sep:1px solid #1f2733;
  --asw-bot-bubble-bg:var(--asw-surface);
  --asw-bot-bubble-bg:var(--asw-surface);
  --asw-panel-border-color:#232b38;
}
/* Micro-type is tabular and monospaced where the content is Latin/digits
 * (timestamps, status pills); body text stays on the Persian face. */
.asw .asw-subtitle{letter-spacing:.06em;font-size:10.5px}
.asw .asw-time,.asw .asw-badge,.asw .asw-identity,.asw .asw-live-chip{font-family:var(--asw-mono);letter-spacing:.02em}
.asw .asw-status{box-shadow:0 0 0 2px var(--asw-header-bg,#0b0e14)}
/* Header controls: hairline squares instead of translucent plates. */
.asw .asw-header-btn{background:transparent;border-color:var(--asw-border);color:var(--asw-text-secondary)}
.asw .asw-header-btn:hover{background:var(--asw-surface-2);border-color:var(--asw-border-strong);color:var(--asw-text)}
/* Visitor rows read as "the sent packet": accent fill, dark ink, no shadow. */
.asw .asw-row.user .asw-bubble{font-weight:var(--asw-w-medium)}
.asw .asw-footer{background:var(--asw-bg);border-top-color:var(--asw-border)}
.asw .asw-typing-dot{background:var(--asw-primary);opacity:.85}

/* Transcript avatar: a hairline square — the operator marker. */
.asw .asw-row.bot .asw-msg-avatar{
  border-radius:var(--asw-r-sm);
  background:color-mix(in srgb,var(--asw-primary) 12%,#0b0e14);
  color:var(--asw-primary);
  box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--asw-primary) 32%,transparent);
}
.asw .asw-typing-bubble{background:var(--asw-surface);border-color:var(--asw-border);border-radius:var(--asw-r-lg);border-end-start-radius:4px}
    /* == END design == */
  `;

  /* ─────────────── HELPERS ─────────────── */
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>\"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c];
    });
  }

  function formatTime() {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function dayLabel(ts) {
    try {
      var d = new Date(ts);
      var now = new Date();
      var diff = new Date(now.getFullYear(), now.getMonth(), now.getDate()) -
                 new Date(d.getFullYear(), d.getMonth(), d.getDate());
      if (diff === 0) return "امروز";
      if (diff === 86400000) return "دیروز";
      return d.toLocaleDateString("fa-IR", { day: "numeric", month: "long" });
    } catch (_) { return ""; }
  }

  function getDefaultEndpoint() {
    if (scriptElement && scriptElement.src) return new URL("/api/chat/", scriptElement.src).toString();
    return new URL("/api/chat/", window.location.href).toString();
  }

  function getSiblingEndpoint(apiEndpoint, name) {
    return new URL(apiEndpoint.replace(/chat\/?$/, name + "/"), window.location.href).toString();
  }

  function isSafeUrl(value) {
    try {
      var url = new URL(String(value), window.location.href);
      return url.protocol === "https:" || url.protocol === "http:" || url.protocol === "mailto:" || url.protocol === "tel:";
    } catch (_) { return false; }
  }

  function detectDarkMode(mode) {
    if (mode === "dark") return true;
    if (mode === "light") return false;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function clamp(val, min, max) {
    var n = Number(val);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function generateSessionId() {
    return "asw-" + Math.random().toString(36).substr(2, 12) + "-" + Date.now().toString(36);
  }

  /* ─────────────── MARKDOWN RENDERER ─────────────── */
  var TABLE_ROW = /^\s*\|(.*)\|\s*$/;
  var TABLE_SEP = /^\s*\|[\s:\-|]+\|\s*$/;

  function renderMarkdown(text) {
    var src = String(text == null ? "" : text);
    var lines = src.split(/\r?\n/);
    var parts = [];
    var inList = false;
    var inOl = false;
    var codeBlock = false;
    var codeLines = [];
    var codeLang = "";

    /* Block markup (lists, code, tables) carries its own margins, so it is
       tracked as a block: line breaks are only inserted between inline runs.
       Joining every part with <br> produced empty lines inside lists. */
    function push(html, block) { parts.push({ h: html, block: !!block }); }

    function closeLists() {
      if (inList) { push("</ul>", true); inList = false; }
      if (inOl) { push("</ol>", true); inOl = false; }
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      if (line.match(/^```/)) {
        if (codeBlock) {
          push(renderCodeBlock(codeLines.join("\n"), codeLang), true);
          codeLines = [];
          codeLang = "";
          codeBlock = false;
        } else {
          closeLists();
          codeBlock = true;
          codeLang = line.replace(/^```/, "").trim();
        }
        continue;
      }
      if (codeBlock) { codeLines.push(line); continue; }

      /* Tables — consecutive |rows| whose second line is a separator */
      if (TABLE_ROW.test(line)) {
        var rows = [];
        var j = i;
        while (j < lines.length && TABLE_ROW.test(lines[j])) { rows.push(lines[j]); j++; }
        if (rows.length >= 2 && TABLE_SEP.test(rows[1])) {
          closeLists();
          push(renderTable(rows), true);
          i = j - 1;
          continue;
        }
      }

      var isUl = line.match(/^\s*[-*•]\s+(.+)/);
      var isOl = line.match(/^\s*\d+\.\s+(.+)/);
      if (!isUl && inList) { push("</ul>", true); inList = false; }
      if (!isOl && inOl) { push("</ol>", true); inOl = false; }

      if (isUl) {
        if (!inList) { push("<ul>", true); inList = true; }
        push("<li>" + renderInline(isUl[1]) + "</li>", true);
      } else if (isOl) {
        if (!inOl) { push("<ol>", true); inOl = true; }
        push("<li>" + renderInline(isOl[1]) + "</li>", true);
      } else {
        push(renderInline(line));
      }
    }

    if (codeBlock) push(renderCodeBlock(codeLines.join("\n"), codeLang), true);
    if (inList) push("</ul>", true);
    if (inOl) push("</ol>", true);

    var html = "";
    for (var k = 0; k < parts.length; k++) {
      if (k > 0 && !parts[k].block && !parts[k - 1].block) html += "<br>";
      html += parts[k].h;
    }
    return html;
  }

  function renderTable(rows) {
    function cells(row) {
      return row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(function (c) { return c.trim(); });
    }
    var aligns = cells(rows[1]).map(function (c) {
      return (c.length > 1 && c.indexOf(":") === 0 && c.lastIndexOf(":") === c.length - 1) ? ' style="text-align:center"' : "";
    });
    var html = '<div class="asw-table-wrap"><table><thead><tr>';
    cells(rows[0]).forEach(function (c, idx) {
      html += "<th" + (aligns[idx] || "") + ">" + renderInline(c) + "</th>";
    });
    html += "</tr></thead><tbody>";
    rows.slice(2).forEach(function (row) {
      html += "<tr>";
      cells(row).forEach(function (c, idx) {
        html += "<td" + (aligns[idx] || "") + ">" + renderInline(c) + "</td>";
      });
      html += "</tr>";
    });
    html += "</tbody></table></div>";
    return html;
  }

  function renderInline(text) {
    var links = [];
    var s = String(text).replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_, label, url) {
      if (!isSafeUrl(url)) return label;
      var token = "ASWL" + links.length;
      links.push({ token: token, html: '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(label) + "</a>" });
      return token;
    });
    var html = escapeHtml(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/__(.+?)__/g, "<strong>$1</strong>")
      .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>")
      .replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
    links.forEach(function (l) { html = html.replace(l.token, l.html); });
    return html;
  }

  function renderCodeBlock(code, lang) {
    var escapedCode = escapeHtml(code);
    var langLabel = lang || "code";
    var id = "asw-code-" + Math.random().toString(36).substr(2, 8);
    return '<div class="asw-code-wrap">' +
      '<div class="asw-code-header"><span class="asw-code-lang">' + escapeHtml(langLabel) + '</span>' +
      '<button class="asw-code-copy" data-code-id="' + id + '" type="button" aria-label="کپی کد">' + ICONS.copy + '<span>کپی</span></button></div>' +
      '<pre class="asw-code-block"><code id="' + id + '">' + escapedCode + '</code></pre></div>';
  }

  /* ─────────────── WIDGET CLASS ─────────────── */
  class AISupportWidget {
    constructor(options) {
      this.options = Object.assign({}, DEFAULTS, options || {});
      this.explicitOptions = options || {};
      this.options.sessionId = this.options.sessionId || generateSessionId();
      if (!this.options.apiEndpoint || this.options.apiEndpoint === "/api/chat/") {
        this.options.apiEndpoint = getDefaultEndpoint();
      }
      this.options.configEndpoint = this.options.configEndpoint || getSiblingEndpoint(this.options.apiEndpoint, "widget-config");
      this.options.eventsEndpoint = this.options.eventsEndpoint || getSiblingEndpoint(this.options.apiEndpoint, "events");
      this.options.feedbackEndpoint = this.options.feedbackEndpoint || getSiblingEndpoint(this.options.apiEndpoint, "feedback");
      this.options.historyEndpoint = this.options.historyEndpoint || getSiblingEndpoint(this.options.apiEndpoint, "history");
      this.options.leadsEndpoint = this.options.leadsEndpoint || getSiblingEndpoint(this.options.apiEndpoint, "leads");
      this.options.handoffEndpoint = this.options.handoffEndpoint || getSiblingEndpoint(this.options.apiEndpoint, "handoff");
      this.options.handoffStreamEndpoint = this.options.handoffStreamEndpoint || (this.options.handoffEndpoint + "stream/");
      this.options.messagesEndpoint = this.options.messagesEndpoint || getSiblingEndpoint(this.options.apiEndpoint, "messages");
      this.live = null;
      this.options.streamEndpoint = this.options.streamEndpoint || (this.options.apiEndpoint.replace(/\/$/, "") + "/stream/");
      this.conversationId = "";
      this.conversationToken = "";
      this.lastMessageId = null;
      this.abortStream = null;
      this.previewMode = this.options.previewMode === true || /asw-preview/.test(
        (window.location.search || "") + (window.location.hash || "")
      );
      this.isOpen = false;
      this.isLoading = false;
      this.sheetOpen = false;
      this.messageCount = 0;
      this._unread = 0;
      this._stick = true;
      this._chatStarted = false;
      this._suggestionItems = [];
      this._listening = false;
      this._uid = 0;
      this.mount();
      this.initialize();
    }

    /* ─── Mount ─── */
    mount() {
      if (document.getElementById("ai-support-widget-host")) return;

      this.host = document.createElement("div");
      this.host.id = "ai-support-widget-host";
      document.body.appendChild(this.host);
      this.shadow = this.host.attachShadow({ mode: "open" });

      var style = document.createElement("style");
      style.textContent = CSS;
      this.shadow.appendChild(style);

      var root = document.createElement("div");
      root.className = "asw asw-root";
      root.setAttribute("data-bubble", this.options.bubbleStyle);
      root.setAttribute("data-font", this.options.fontSize);
      root.setAttribute("data-ui-state", "online");
      this.applyThemeVars(root);

      var fabIconHtml = this.getFabIconHtml();
      var o = this.options;

      root.innerHTML =
        /* Panel */
        '<section class="asw-panel" role="dialog" aria-modal="false" aria-label="' + escapeHtml(o.title) + '" aria-hidden="true">' +
          /* Header: identity + presence on one line, actions on the other side */
          '<header class="asw-header">' +
            '<div class="asw-heading">' +
              '<div class="asw-avatar-wrap">' +
                '<div class="asw-avatar" id="asw-avatar"></div>' +
                '<span class="asw-status" aria-hidden="true"></span>' +
              '</div>' +
              '<div class="asw-info">' +
                '<div class="asw-title-row"><span class="asw-title" id="asw-title"></span><span class="asw-badge" id="asw-badge" hidden><span class="asw-badge-dot" aria-hidden="true"></span><span id="asw-badge-text"></span></span></div>' +
                '<div class="asw-subtitle" id="asw-subtitle"></div>' +
              '</div>' +
            '</div>' +
            '<div class="asw-actions">' +
              '<button class="asw-header-btn" id="asw-clear-history" type="button" aria-label="شروع گفتگوی جدید" title="گفتگوی جدید">' + ICONS.refresh + '</button>' +
              '<button class="asw-header-btn" id="asw-contact" type="button" aria-label="تماس با کارشناس" title="تماس با کارشناس">' + ICONS.phone + '</button>' +
              '<button class="asw-header-btn" id="asw-theme-toggle" type="button" aria-label="تغییر تم" title="تغییر تم"></button>' +
              '<button class="asw-header-btn asw-close" id="asw-close" type="button" aria-label="بستن چت" title="بستن">' + ICONS.close + '</button>' +
            '</div>' +
          '</header>' +
          /* Service notice (waiting for an operator, locked, unavailable) */
          '<div class="asw-banner" id="asw-banner" hidden role="status"></div>' +
          /* Offline banner */
          '<div class="asw-netstatus" id="asw-netstatus" hidden role="status">' + ICONS.wifiOff + '<span>اتصال اینترنت قطع است — پاسخ‌ها ارسال نمی‌شوند</span></div>' +
          /* Messages */
          '<div class="asw-messages" id="asw-messages" role="log" aria-live="polite" aria-relevant="additions text"></div>' +
          /* Typing */
          '<div class="asw-typing" id="asw-typing" hidden aria-hidden="true">' +
            '<div class="asw-typing-bubble"><span class="asw-typing-dot"></span><span class="asw-typing-dot"></span><span class="asw-typing-dot"></span></div>' +
            '<span class="asw-typing-label" id="asw-typing-label">' + THINKING_STATUSES[0] + '</span>' +
          '</div>' +
          /* Suggestions */
          '<div class="asw-suggestions" id="asw-suggestions"></div>' +
          /* Footer */
          '<footer class="asw-footer">' +
            '<button class="asw-scrollbtn" id="asw-scrollbtn" type="button" aria-label="رفتن به آخرین پیام">' + ICONS.chevronDown + '</button>' +
            '<div class="asw-input-wrap" id="asw-input-wrap">' +
              '<textarea class="asw-input" id="asw-input" rows="1" autocomplete="off" enterkeyhint="send" placeholder="' + escapeHtml(o.inputPlaceholder) + '" aria-label="پیام" style="height:auto;min-height:24px;max-height:132px"></textarea>' +
              '<div class="asw-wave" id="asw-wave" hidden aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>' +
              '<button class="asw-mic" id="asw-mic" type="button" aria-label="ورودی صوتی" title="ورودی صوتی" hidden>' + ICONS.mic + '</button>' +
              '<button class="asw-send" id="asw-send" type="button" aria-label="ارسال پیام" disabled>' + ICONS.arrowUp + '</button>' +
            '</div>' +
            '<div class="asw-foot-meta">' +
              '<div class="asw-disclaim">پاسخ‌های این دستیار از دانش همین سایت ساخته می‌شوند و ممکن است ناقص باشند.</div>' +
              '<div class="asw-powered" id="asw-powered">توسعه‌ی <a href="https://ai-support.ir" target="_blank" rel="noopener">AI Support</a><span class="asw-resource-links" id="asw-resources"></span></div>' +
            '</div>' +
          '</footer>' +
          /* Contact bottom-sheet */
          '<div class="asw-sheet" id="asw-sheet" hidden aria-hidden="true" role="dialog" aria-label="تماس با ما">' +
            '<div class="asw-sheet-card">' +
              '<div class="asw-sheet-grip" aria-hidden="true"></div>' +
              '<button class="asw-sheet-close" id="asw-sheet-close" type="button" aria-label="بستن">' + ICONS.close + '</button>' +
              '<div class="asw-sheet-title">' + escapeHtml(o.leadFormTitle) + '</div>' +
              '<div class="asw-sheet-desc">' + escapeHtml(o.leadFormDescription) + '</div>' +
              '<div class="asw-chans" id="asw-chans"></div>' +
              '<div id="asw-sheet-form"></div>' +
            '</div>' +
          '</div>' +
          /* Toast */
          '<div class="asw-toast" id="asw-toast" role="status"></div>' +
        '</section>' +
        /* FAB */
        '<button class="asw-fab" id="asw-fab" type="button" aria-label="باز کردن چت" aria-expanded="false">' +
          '<span class="asw-fab-label" aria-hidden="true">' + escapeHtml(o.fabLabel) + '</span>' +
          '<span class="asw-fab-icon-main">' + fabIconHtml + '</span>' +
          '<span class="asw-fab-icon-close" aria-hidden="true">' + ICONS.close + '</span>' +
          '<span class="asw-fab-badge" id="asw-fab-badge" hidden aria-hidden="true"></span>' +
        '</button>' +
        /* Teaser */
        '<div class="asw-teaser" id="asw-teaser" role="button" tabindex="0" aria-label="گفتگو با پشتیبان" hidden>' +
          '<button class="asw-teaser-close" id="asw-teaser-close" type="button" aria-label="بستن">' + ICONS.close + '</button>' +
          '<div class="asw-teaser-orb" aria-hidden="true">' + ICONS.sparkles + '</div>' +
          '<div class="asw-teaser-body"><div class="asw-teaser-title">سوالی دارید؟</div><div class="asw-teaser-text">' + escapeHtml(o.teaserText) + '</div></div>' +
        '</div>' +
        /* State announcements for screen readers (never spam: ui-shell throttles) */
        '<div class="asw-sr-only" id="asw-live-region" role="status" aria-live="polite" aria-atomic="true"></div>';

      this.shadow.appendChild(root);
      this.root = root;
      this.panel = root.querySelector(".asw-panel");
      this.fab = root.querySelector("#asw-fab");
      this.fabBadge = root.querySelector("#asw-fab-badge");
      this.teaser = root.querySelector("#asw-teaser");
      this.teaserClose = root.querySelector("#asw-teaser-close");
      this.closeBtn = root.querySelector("#asw-close");
      this.themeToggle = root.querySelector("#asw-theme-toggle");
      this.contactBtn = root.querySelector("#asw-contact");
      this.titleEl = root.querySelector("#asw-title");
      this.badgeEl = root.querySelector("#asw-badge");
      this.badgeText = root.querySelector("#asw-badge-text");
      this.subtitleEl = root.querySelector("#asw-subtitle");
      this.avatarEl = root.querySelector("#asw-avatar");
      this.banner = root.querySelector("#asw-banner");
      this.netstatus = root.querySelector("#asw-netstatus");
      this.messages = root.querySelector("#asw-messages");
      this.typing = root.querySelector("#asw-typing");
      this.typingLabel = root.querySelector("#asw-typing-label");
      this.suggestions = root.querySelector("#asw-suggestions");
      this.input = root.querySelector("#asw-input");
      this.inputWrap = root.querySelector("#asw-input-wrap");
      this.wave = root.querySelector("#asw-wave");
      this.micBtn = root.querySelector("#asw-mic");
      this.sendBtn = root.querySelector("#asw-send");
      this.scrollBtn = root.querySelector("#asw-scrollbtn");
      this.powered = root.querySelector("#asw-powered");
      this.resources = root.querySelector("#asw-resources");
      this.toast = root.querySelector("#asw-toast");
      this.liveRegion = root.querySelector("#asw-live-region");
      this.sheet = root.querySelector("#asw-sheet");
      this.sheetCard = root.querySelector(".asw-sheet-card");
      this.sheetClose = root.querySelector("#asw-sheet-close");
      this.chansEl = root.querySelector("#asw-chans");
      this.sheetFormEl = root.querySelector("#asw-sheet-form");

      this.applyVisuals();
      this.renderSuggestions();
      this.renderResources();
      this.renderChannels();
      this.bindEvents();
      this.updateSendState();
    }

    getFabIconHtml() {
      var o = this.options;
      if (o.iconType === "custom" && o.customIconUrl && isSafeUrl(o.customIconUrl)) {
        return '<img class="asw-fab-custom-icon" src="' + escapeHtml(o.customIconUrl) + '" alt="چت" referrerpolicy="no-referrer">';
      }
      return FAB_ICONS[o.defaultIconChoice] || FAB_ICONS["chat-bubble"];
    }

    /* ─── Initialize ─── */
    async initialize() {
      await this.loadConfig();
      if (window.AISupportUI) window.AISupportUI.install(this);
      this.sendEvent("widget_loaded");
      this.restoreConversation();
      var restored = this.restoreLocalHistory();
      if (!restored) await this.restoreHistory();
      if (this.messageCount === 0) {
        this.addMessage(this.options.greeting, "bot", true);
      }
      if (this.options.darkMode === "auto" && window.matchMedia) {
        var mq = window.matchMedia("(prefers-color-scheme: dark)");
        mq.addEventListener("change", () => this.applyTheme());
      }
      if (this.previewMode) {
        this.bindPreviewChannel();
      }
      this._maybeShowTeaser();
    }

    /* ─── Light conversation memory (localStorage, 7 days) ─── */
    _localKey() { return "asw_history_" + (location.hostname || "local"); }
    restoreLocalHistory() {
      try {
        var raw = localStorage.getItem(this._localKey());
        if (!raw) return false;
        var data = JSON.parse(raw);
        if (!data || !Array.isArray(data.items) || !data.items.length) return false;
        if (data.ts && (Date.now() - data.ts) > 7 * 24 * 3600 * 1000) {
          localStorage.removeItem(this._localKey());
          return false;
        }
        this.messages.innerHTML = "";
        this.messageCount = 0;
        var self = this;
        var prevDay = null;
        data.items.slice(-22).forEach(function (m) {
          if (m.t) {
            var dk = new Date(m.t).toDateString();
            if (dk !== prevDay) {
              prevDay = dk;
              var div = document.createElement("div");
              div.className = "asw-divider";
              div.textContent = dayLabel(m.t);
              self.messages.appendChild(div);
            }
          }
          self.addMessage(m.content, m.role === "assistant" ? "bot" : "user", false, {
            citations: m.citations || [],
            skipFeedback: m.role !== "assistant",
            noAnim: false,
          });
        });
        var hint = document.createElement("div");
        hint.className = "asw-rule-hint";
        hint.textContent = "ادامه گفتگوی قبلی — این تاریخچه فقط روی همین مرورگر ذخیره شده است.";
        this.messages.prepend(hint);
        this.scrollToBottom();
        this._updateScrollBtn();
        return true;
      } catch (_) { return false; }
    }
    saveLocalHistory() {
      try {
        var items = [];
        this.messages.querySelectorAll(".asw-row").forEach(function (row) {
          var bubble = row.querySelector(".asw-bubble");
          if (!bubble) return;
          var isUser = row.classList.contains("user");
          items.push({
            role: isUser ? "user" : "assistant",
            content: bubble.textContent.slice(0, 800),
            citations: [],
            t: Date.now(),
          });
        });
        if (items.length > 22) items = items.slice(-22);
        localStorage.setItem(this._localKey(), JSON.stringify({ ts: Date.now(), items: items }));
      } catch (_) {}
    }
    clearLocalHistory() {
      /* "گفتگوی جدید": the transcript cache AND the persisted conversation
       * identity both die here, so the next message starts a fresh server
       * conversation instead of silently continuing the old one. */
      try { localStorage.removeItem(this._localKey()); localStorage.removeItem(this._convKey()); } catch (_) {}
    }

    /* ─── Conversation persistence (server token) ───
     * The conversation identity lives in localStorage (hostname-scoped) so a
     * closed tab does NOT orphan the transcript: the local history cache keeps
     * rendering after 7 days, and the server Conversation must match it or the
     * model loses memory while the UI pretends continuity. sessionStorage is
     * still written for backward compatibility. Server history stays
     * authoritative — identity persistence changes nothing about trust. */
    _convKey() { return "asw_conversation_" + (location.hostname || "local"); }
    restoreConversation() {
      try {
        var saved = null;
        try { saved = JSON.parse(localStorage.getItem(this._convKey()) || "null"); } catch (_) { saved = null; }
        if (saved && saved.id && saved.token) {
          this.conversationId = String(saved.id);
          this.conversationToken = String(saved.token);
        } else {
          this.conversationId = sessionStorage.getItem("asw_conversation_id") || "";
          this.conversationToken = sessionStorage.getItem("asw_conversation_token") || "";
        }
        this._blocked = sessionStorage.getItem("asw_blocked") === "1";
        if (this._blocked) {
          // Defer UI until shell exists; also set flag so sendText refuses early.
          var self = this;
          setTimeout(function () { self._setBlocked(true); }, 0);
        }
      } catch (_) {}
    }

    saveConversation() {
      try {
        if (this.conversationId) {
          localStorage.setItem(this._convKey(), JSON.stringify({
            id: this.conversationId,
            token: this.conversationToken,
            ts: Date.now(),
          }));
          sessionStorage.setItem("asw_conversation_id", this.conversationId);
        }
        if (this.conversationToken) sessionStorage.setItem("asw_conversation_token", this.conversationToken);
      } catch (_) {}
    }

    async restoreHistory() {
      if (!this.conversationId || !this.conversationToken) return;
      if (this.messageCount > 1) return;
      try {
        var url = this.options.historyEndpoint + "?conversation_id=" + encodeURIComponent(this.conversationId);
        var res = await fetch(url, { method: "GET", mode: "cors", credentials: "omit", headers: this.getHeaders() });
        if (!res.ok) return;
        var data = await res.json();
        var msgs = Array.isArray(data.messages) ? data.messages : [];
        // Re-attach human mode after a refresh + seed the stream cursor.
        if (window.AISupportLive) window.AISupportLive.queueRestore(this, data.live_handoff, msgs);
        if (!msgs.length) return;
        this.messages.innerHTML = "";
        this.messageCount = 0;
        this.addMessage(this.options.greeting, "bot", true);
        msgs.forEach((m) => {
          this.addMessage(m.content, m.role === "assistant" ? "bot" : "user", false, {
            citations: m.role === "assistant" ? (m.citations || []) : [],
            skipFeedback: true,
          });
        });
      } catch (_) {}
    }

    /* ─── Live preview channel (admin customizer) ─── */
    bindPreviewChannel() {
      window.addEventListener("message", (e) => {
        var data = e.data || {};
        if (data.type === "aiss:config" && data.config) {
          this.applyConfig(data.config);
        }
        if (data.type === "aiss:open") this.open();
        if (data.type === "aiss:close") this.close();
      });
      try { parent.postMessage({ type: "aiss:preview-ready" }, "*"); } catch (_) {}
    }

    applyConfig(cfg) {
      var self = this;
      var strKeys = ["title", "subtitle", "greeting", "primaryColor", "secondaryColor", "accentColor",
        "headerBadge", "botAvatarText", "inputPlaceholder", "themeMode", "darkMode", "fontFamily",
        "fontSize", "bubbleStyle", "position", "logoUrl", "leadFormTitle", "leadFormDescription", "handoffMessage",
        "teaserText", "fabLabel", "supportPhone"];
      strKeys.forEach(function (k) {
        if (cfg[k] !== undefined && cfg[k] !== null) self.options[k] = String(cfg[k]);
      });
      ["panelWidth", "panelHeight", "borderRadius", "positionVerticalOffset", "positionHorizontalOffset"].forEach(function (k) {
        var v = Number(cfg[k]);
        if (!isNaN(v)) self.options[k] = v;
      });
      ["mobileFullscreen", "showPoweredBy", "showTimestamp", "showAvatar", "showFeedback",
        "enableSounds", "enableAnimations", "showCitations", "enableLeadCapture", "enableHandoff",
        "showTeaser", "enableVoiceInput"].forEach(function (k) {
        if (cfg[k] !== undefined && cfg[k] !== null) self.options[k] = Boolean(cfg[k]);
      });
      if (Array.isArray(cfg.suggestions)) self.options.suggestions = cfg.suggestions;
      if (cfg.iconType) self.options.iconType = cfg.iconType;
      if (cfg.defaultIconChoice) self.options.defaultIconChoice = cfg.defaultIconChoice;
      if (cfg.customIconUrl !== undefined) self.options.customIconUrl = cfg.customIconUrl;
      this.applyVisuals();
      this.renderSuggestions();
      this.renderResources();
      this.renderChannels();
      if (this.sheet) {
        var st = this.sheet.querySelector(".asw-sheet-title");
        var sd = this.sheet.querySelector(".asw-sheet-desc");
        if (st) st.textContent = this.options.leadFormTitle;
        if (sd) sd.textContent = this.options.leadFormDescription;
      }
      if (this.teaser) {
        var t = this.teaser.querySelector(".asw-teaser-text");
        if (t) t.textContent = this.options.teaserText;
      }
      var label = this.fab.querySelector(".asw-fab-label");
      if (label) label.textContent = this.options.fabLabel;
      var fabMain = this.fab.querySelector(".asw-fab-icon-main");
      if (fabMain) fabMain.innerHTML = this.getFabIconHtml();
    }

    async loadConfig() {
      if (!this.options.configEndpoint) return;
      /* Presence handshake bookkeeping, read by the shared UI shell: until an
       * HTTP reply proves the backend is reachable the session is "unknown"
       * (neutral dot), never a green one. */
      this._configPending = true;
      this._configReady = undefined;
      try {
        var res = await fetch(this.options.configEndpoint, { method: "GET", mode: "cors", credentials: "omit", headers: this.getHeaders() });
        /* Any HTTP reply — including a refusal by plan or permission — proves
         * the backend is reachable. Only a server fault (5xx) leaves the
         * session unverified, and this is not a request-level error. */
        this._configPending = false;
        this._configReady = res.status < 500;
        if (!res.ok) return;
        var raw = await res.json();
        var map = {
          title: "title", subtitle: "subtitle", greeting: "greeting",
          primaryColor: "primary_color", secondaryColor: "secondary_color",
          accentColor: "accent_color", headerBadge: "header_badge",
          botAvatarText: "bot_avatar_text", inputPlaceholder: "input_placeholder",
          themeMode: "theme_mode", darkMode: "dark_mode",
          panelWidth: "panel_width", panelHeight: "panel_height",
          borderRadius: "border_radius", mobileFullscreen: "mobile_fullscreen",
          logoUrl: "logo_url", fontFamily: "font_family", fontSize: "font_size",
          position: "position", showPoweredBy: "show_powered_by",
          showTimestamp: "show_timestamp", showAvatar: "show_avatar",
          showFeedback: "show_feedback",
          enableSounds: "enable_sounds", enableAnimations: "enable_animations",
          bubbleStyle: "bubble_style",
          positionVerticalOffset: "positionVerticalOffset",
          positionHorizontalOffset: "positionHorizontalOffset",
          iconType: "iconType",
          defaultIconChoice: "defaultIconChoice",
          customIconUrl: "customIconUrl",
          suggestions: "suggestions", faqUrl: "faq_url", privacyUrl: "privacy_url",
          supportEmail: "support_email",
          enableStreaming: "enable_streaming",
          showCitations: "show_citations",
          enableLeadCapture: "enable_lead_capture",
          leadFormTitle: "lead_form_title",
          leadFormDescription: "lead_form_description",
          enableHandoff: "enable_handoff",
          handoffTrigger: "handoff_trigger",
          handoffMessage: "handoff_message",
          handoffUrls: "handoff_urls",
          enableVoiceInput: "enable_voice_input",
          fabLabel: "fab_label",
          supportPhone: "support_phone",
        };
        // Live human handoff: attach the shared client when the
        // installation-level feature flag is on (otherwise nothing is
        // rendered and no request is made).
        if (window.AISupportLive) window.AISupportLive.applyConfig(this, raw.live_handoff);
        var self = this;
        Object.keys(map).forEach(function (key) {
          var apiVal = raw[map[key]];
          if (apiVal !== undefined && apiVal !== null && !self.explicitOptions.hasOwnProperty(key)) {
            self.options[key] = apiVal;
          }
        });
        this.titleEl.textContent = this.options.title;
        this.badgeText.textContent = this.options.headerBadge;
        this.subtitleEl.textContent = this.options.subtitle;
        this.applyVisuals();
        this.renderSuggestions();
        this.renderResources();
        this.renderChannels();
        this.contactBtn.hidden = !this.options.enableLeadCapture;
        var sheetTitle = this.sheet.querySelector(".asw-sheet-title");
        var sheetDesc = this.sheet.querySelector(".asw-sheet-desc");
        if (sheetTitle) sheetTitle.textContent = this.options.leadFormTitle;
        if (sheetDesc) sheetDesc.textContent = this.options.leadFormDescription;
        var label = this.fab.querySelector(".asw-fab-label");
        if (label) label.textContent = this.options.fabLabel;
        var fabMain = this.fab.querySelector(".asw-fab-icon-main");
        if (fabMain) fabMain.innerHTML = this.getFabIconHtml();
        this._configReady = true;
      } catch (_) {
        /* Network-level failure only (DNS, TLS, CORS, dead socket): the single
         * case allowed to turn the presence dot red. Defaults remain in force,
         * and an error thrown by res.json() must not be mistaken for it. */
        this._configPending = false;
        if (this._configReady === undefined) {
          this._configReady = false;
          this._configUnreachable = true;
        }
      }
    }

    /* ─── Apply Theme Variables ───
       The runtime configuration lands on custom properties here, in exactly one
       place, so all eleven themes are configurable in the same way:
         · --asw-primary/-secondary/-accent  brand colours
         · --asw-header-bg-cfg               the configured header treatment
         · --asw-panel-w/-h, --asw-radius    geometry
         · --asw-font / --asw-font-size      typography
       Header colours deliberately go to the *-cfg fallback so a theme's own
       --asw-header-bg (its identity) still wins; the customizer keeps working
       because the theme builds its treatment out of --asw-primary.
       Title weight and size are NOT set here — they are theme identity and
    /* ─── Apply Theme Variables ───
       The runtime configuration lands on custom properties here, in exactly one
       place, so all eleven themes are configurable the same way:
         · --asw-primary/-secondary/-accent  brand colours
         · --asw-header-bg-cfg               the configured header treatment
         · --asw-panel-w/-h, --asw-radius    geometry
         · --asw-font / --asw-font-size      typography
       Header colours deliberately go to the *-cfg fallback so a theme's own
       --asw-header-bg (its identity) still wins; the customizer keeps working
       because each theme builds its treatment out of --asw-primary.
       Title weight and size are NOT set here — they are theme identity and
       live in themes/*.css. */
    applyThemeVars(el) {
      var o = this.options;
      var s = el || this.root;
      s.style.setProperty("--asw-primary", o.primaryColor);
      s.style.setProperty("--asw-secondary", o.secondaryColor);
      s.style.setProperty("--asw-accent", o.accentColor || o.secondaryColor);
      s.style.setProperty("--asw-header-bg-cfg", this.getHeaderBg());
      s.style.setProperty("--asw-panel-w", clamp(o.panelWidth, 300, 520) + "px");
      s.style.setProperty("--asw-panel-h", clamp(o.panelHeight, 400, 800) + "px");
      s.style.setProperty("--asw-radius", clamp(o.borderRadius, 4, 36) + "px");
      s.style.setProperty("--asw-font", o.fontFamily);
      s.style.setProperty("--asw-font-size", o.fontSize === "small" ? "12px" : o.fontSize === "large" ? "16px" : "14px");
      s.setAttribute("data-bubble", o.bubbleStyle || "rounded");
      s.setAttribute("data-font", o.fontSize || "normal");
      s.setAttribute("data-anim", o.enableAnimations === false ? "off" : "on");
      /* The configured family also drives display type; everything else about
       * header typography is the theme's. */
      s.style.setProperty("--asw-font-display", o.fontFamily);
    }
    /* The header treatment the customer configured, as a CSS value. It lands on
       --asw-header-bg-cfg (a fallback), never on --asw-header-bg: themes own
       the header, and they build it out of --asw-primary. */
    getHeaderBg() {
      var o = this.options;
      if (o.themeMode === "solid") return o.primaryColor;
      if (o.themeMode === "glass") return "linear-gradient(135deg, " + o.primaryColor + "dd, " + o.secondaryColor + "cc)";
      return "linear-gradient(135deg, " + o.primaryColor + ", " + o.secondaryColor + ")";
    }
    /* Quota / site lock. Ten of the eleven bundles never carried this
     * method, so a locked installation threw a TypeError the moment the
     * config reported it; it belongs to the shared shell. */
    _setBlocked(blocked, msg) {
      this._blocked = !!blocked;
      if (blocked) this._persistBlocked();
      else try { sessionStorage.removeItem("asw_blocked"); } catch (_) {}
      var placeholder = blocked ? (msg || "دسترسی به چت مسدود شده است.") : (this.options.inputPlaceholder || "پیام خود را بنویسید...");
      if (this.input) {
        this.input.disabled = blocked;
        this.input.placeholder = placeholder;
      }
      if (this.sendBtn) this.sendBtn.disabled = blocked || !this.input.value.trim();
      if (this.micBtn) this.micBtn.hidden = blocked || this.micBtn.hidden;
      if (!blocked) {
        try { this.updateSendState(); if (this.input) this.input.focus(); } catch (_) {}
      }
    }
    _persistBlocked() {
      try { sessionStorage.setItem("asw_blocked", "1"); } catch (_) {}
    }
    _clearBlocked() {
      this._setBlocked(false);
    }

    applyTheme() {
      var isDark = detectDarkMode(this.options.darkMode);
      this.root.classList.toggle("dark", isDark);
      this.root.classList.toggle("light", !isDark);
      if (this.themeToggle) {
        this.themeToggle.innerHTML = isDark
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
      }
    }

    applyVisuals() {
      this.applyThemeVars();
      this.applyTheme();
      var o = this.options;

      // Rigid 4-corner positioning: FAB anchored to extreme corner, panel adjacent
      var pos = o.position || "bottom-right";
      var cornerMap = { "bottom-right": "br", "bottom-left": "bl", "top-right": "tr", "top-left": "tl" };
      var vertPx = clamp(o.positionVerticalOffset, 8, 200);
      var horizPx = clamp(o.positionHorizontalOffset, 8, 200);
      var isBottom = pos.indexOf("bottom") !== -1;
      var isLeft = pos.indexOf("left") !== -1;
      var corner = cornerMap[pos] || "br";

      /* The class list is rebuilt for the corner preset, so the dark-mode
       * flag has to be carried across it — otherwise every visual apply
       * (mount, config load, customizer preview) silently switched the
       * widget back to light. */
      this.root.className = "asw asw-root corner-" + corner
        + (detectDarkMode(o.darkMode) ? " dark" : "");
      this.root.setAttribute("data-ui-state", this.root.getAttribute("data-ui-state") || "online");
      this.root.style.top = isBottom ? "auto" : "0";
      this.root.style.bottom = isBottom ? "0" : "auto";
      this.root.style.left = isLeft ? "0" : "auto";
      this.root.style.right = isLeft ? "auto" : "0";

      // FAB: fixed at the extreme corner with exact offsets
      this.fab.style.position = "fixed";
      this.fab.style.top = isBottom ? "auto" : vertPx + "px";
      this.fab.style.bottom = isBottom ? vertPx + "px" : "auto";
      this.fab.style.left = isLeft ? horizPx + "px" : "auto";
      this.fab.style.right = isLeft ? "auto" : horizPx + "px";

      // Teaser: floats right next to the FAB
      if (this.teaser) {
        this.teaser.style.position = "fixed";
        this.teaser.style.top = isBottom ? "auto" : (vertPx + 72) + "px";
        this.teaser.style.bottom = isBottom ? (vertPx + 72) + "px" : "auto";
        this.teaser.style.left = isLeft ? horizPx + "px" : "auto";
        this.teaser.style.right = isLeft ? "auto" : horizPx + "px";
      }

      // Panel: fixed, positioned directly adjacent to FAB
      this.panel.style.position = "fixed";
      var fabSize = 56;
      var panelGap = 12;
      if (isBottom) {
        this.panel.style.bottom = (vertPx + fabSize + panelGap) + "px";
        this.panel.style.top = "auto";
      } else {
        this.panel.style.top = (vertPx + fabSize + panelGap) + "px";
        this.panel.style.bottom = "auto";
      }
      if (isLeft) {
        this.panel.style.left = horizPx + "px";
        this.panel.style.right = "auto";
      } else {
        this.panel.style.right = horizPx + "px";
        this.panel.style.left = "auto";
      }

      this.root.classList.toggle("mobile-fullscreen", o.mobileFullscreen !== false);
      this.applyHeaderContrast();

      // Avatar
      if (o.logoUrl && isSafeUrl(o.logoUrl)) {
        this.avatarEl.innerHTML = "";
        var img = document.createElement("img");
        img.src = o.logoUrl;
        img.alt = "";
        img.referrerPolicy = "no-referrer";
        this.avatarEl.appendChild(img);
      } else {
        this.avatarEl.textContent = o.botAvatarText || "✦";
      }

      this.titleEl.textContent = o.title;
      if (this.badgeText) this.badgeText.textContent = o.headerBadge;
      if (this.badgeEl) this.badgeEl.hidden = !o.headerBadge;
      var liveMode = this.root.getAttribute("data-live-mode") || "ai";
      if (!this.isLoading && liveMode === "ai") this.subtitleEl.textContent = o.subtitle;
      this.input.placeholder = o.inputPlaceholder;
      this.powered.hidden = o.showPoweredBy === false;
      this.messages.classList.toggle("asw-no-avatar", o.showAvatar === false);
    }

    /**
     * A branded header keeps the customer's colour; when that colour is light
     * the default white text becomes unreadable, so pick ink instead. Done in
     * JS because contrast cannot be measured in CSS.
     */
    applyHeaderContrast() {
      var color = String(this.options.primaryColor || "#6366f1").trim();
      var r = 99, g = 102, b = 241;
      var hex = color.replace("#", "");
      if (/^[0-9a-f]{3}$/i.test(hex)) {
        r = parseInt(hex[0] + hex[0], 16); g = parseInt(hex[1] + hex[1], 16); b = parseInt(hex[2] + hex[2], 16);
      } else if (/^[0-9a-f]{6}$/i.test(hex)) {
        r = parseInt(hex.slice(0, 2), 16); g = parseInt(hex.slice(2, 4), 16); b = parseInt(hex.slice(4, 6), 16);
      }
      var light = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.68;
      var s = this.root.style;
      s.setProperty("--asw-header-text", light ? "rgba(20,22,31,.92)" : "#ffffff");
      s.setProperty("--asw-header-btn-bg", light ? "rgba(20,22,31,.06)" : "rgba(255,255,255,.14)");
      s.setProperty("--asw-header-btn-border", light ? "rgba(20,22,31,.14)" : "rgba(255,255,255,.22)");
      s.setProperty("--asw-header-bg-solid", light ? "rgba(255,255,255,.95)" : color);
    }

    /* ─── Suggestions (chips strip + welcome cards) ─── */
    renderSuggestions() {
      var items = Array.isArray(this.options.suggestions) ? this.options.suggestions.filter(Boolean).slice(0, 6) : [];
      this._suggestionItems = items;
      this.suggestions.innerHTML = items.map(function (item) {
        return '<button class="asw-suggestion" type="button" data-msg="' + escapeHtml(item) + '"><span>' + escapeHtml(item) + "</span></button>";
      }).join("");
      this.syncSuggestions();
    }

    syncSuggestions() {
      var heroExists = !!(this.messages && this.messages.querySelector(".asw-hero"));
      this.suggestions.hidden = !this._suggestionItems.length || heroExists || this._chatStarted;
    }

    /* ─── Resource Links ─── */
    renderResources() {
      if (!this.resources) return;
      this.resources.textContent = "";
      var links = [];
      var o = this.options;
      if (o.faqUrl && isSafeUrl(o.faqUrl)) links.push({ label: "FAQ", url: o.faqUrl });
      if (o.privacyUrl && isSafeUrl(o.privacyUrl)) links.push({ label: "Privacy", url: o.privacyUrl });
      if (o.supportEmail) links.push({ label: "Support", url: "mailto:" + o.supportEmail });
      if (o.supportPhone) links.push({ label: "تماس", url: "tel:" + o.supportPhone });
      var sep = document.createTextNode(" · ");
      links.forEach(function (link, i) {
        if (i > 0) this.resources.appendChild(sep.cloneNode(true));
        var a = document.createElement("a");
        a.href = link.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = link.label;
        this.resources.appendChild(a);
      }, this);
    }

    /* ─── Contact channels (list rows) ─── */
    getContactChannels() {
      var o = this.options;
      var chans = [];
      if (o.supportPhone) {
        chans.push({ key: "phone", label: "تماس تلفنی", cap: o.supportPhone, url: "tel:" + o.supportPhone, tint: "#34d399", icon: ICONS.phone });
      }
      if (o.supportEmail) {
        chans.push({ key: "email", label: "ایمیل", cap: o.supportEmail, url: "mailto:" + o.supportEmail, tint: null, icon: ICONS.mail });
      }
      var urls = o.handoffUrls || {};
      if (urls.telegram && isSafeUrl(urls.telegram)) {
        chans.push({ key: "telegram", label: "تلگرام", cap: "پیام در تلگرام", url: urls.telegram, tint: "#229ED9", icon: ICONS.send });
      }
      if (urls.whatsapp && isSafeUrl(urls.whatsapp)) {
        chans.push({ key: "whatsapp", label: "واتساپ", cap: "چت در واتساپ", url: urls.whatsapp, tint: "#25D366", icon: ICONS.phone });
      }
      if (urls.contact_form && isSafeUrl(urls.contact_form)) {
        chans.push({ key: "contact_form", label: "فرم تماس", cap: "فرم کامل سایت", url: urls.contact_form, tint: null, icon: ICONS.user });
      }
      return chans;
    }

    renderChannels() {
      if (!this.chansEl) return;
      var self = this;
      var chans = this.getContactChannels();
      this.chansEl.textContent = "";
      chans.forEach(function (ch, i) {
        var a = document.createElement("a");
        a.className = "asw-chan";
        if (ch.tint) a.style.setProperty("--chan", ch.tint);
        a.href = ch.url;
        if (ch.url.indexOf("http") === 0) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
        a.innerHTML = '<span class="asw-chan-ic" aria-hidden="true">' + ch.icon + '</span>' +
          '<span class="asw-chan-tx"><b>' + escapeHtml(ch.label) + '</b><i>' + escapeHtml(ch.cap) + '</i></span>' +
          '<span class="asw-chan-go" aria-hidden="true">' + ICONS.chevronLeft + '</span>';
        a.addEventListener("click", function () { self.logHandoff(ch.key, self._lastUserMessage || ""); });
        self.chansEl.appendChild(a);
      });
      this.chansEl.hidden = chans.length === 0;
    }

    /* ─── Bind Events ─── */
    bindEvents() {
      var self = this;

      this.fab.addEventListener("click", function () { self.toggle(); });
      this.closeBtn.addEventListener("click", function () { self.close(); });

      this.themeToggle.addEventListener("click", function () {
        var current = self.options.darkMode;
        if (current === "auto") {
          self.options.darkMode = detectDarkMode("auto") ? "light" : "dark";
        } else if (current === "dark") {
          self.options.darkMode = "light";
        } else {
          self.options.darkMode = "dark";
        }
        self.applyTheme();
      });

      this.input.addEventListener("input", function () {
        self.autoGrowInput();
        self.updateSendState();
      });

      this.input.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          self.send();
        }
      });

      this.sendBtn.addEventListener("click", function () {
        if (self.isLoading && self.abortStream) {
          self.abortStream.abort();
          return;
        }
        self.send();
      });

      this.contactBtn.addEventListener("click", function () {
        if (self.options.enableLeadCapture === false) return;
        self.openSheet();
      });

      if (this.sheetClose) {
        this.sheetClose.addEventListener("click", function () { self.closeSheet(); });
      }
      this.sheet.addEventListener("click", function (e) {
        if (e.target === self.sheet) self.closeSheet();
      });

      this.shadow.addEventListener("click", function (e) {
        var chip = e.target.closest("[data-msg]");
        if (!chip) return;
        self.sendText(chip.dataset.msg);
      });

      var clearBtn = this.shadow.querySelector("#asw-clear-history");
      if (clearBtn) {
        clearBtn.addEventListener("click", function (e) {
          e.preventDefault();
          self.clearLocalHistory();
          try { sessionStorage.removeItem("asw_conversation_id"); sessionStorage.removeItem("asw_conversation_token"); } catch(_){}
          self.conversationId = "";
          self.conversationToken = "";
          self.messages.innerHTML = "";
          self.messageCount = 0;
          self._chatStarted = false;
          self._handoffShown = false;
          self.addMessage(self.options.greeting, "bot", true);
          self.renderSuggestions();
          self.showToast("گفتگوی جدید شروع شد.", 2200);
        });
      }

      if (this.teaser) {
        this.teaser.addEventListener("click", function () { self.open(); });
        this.teaser.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); self.open(); }
        });
      }
      if (this.teaserClose) {
        this.teaserClose.addEventListener("click", function (e) {
          e.stopPropagation();
          self._dismissTeaser(true);
        });
      }

      this.messages.addEventListener("scroll", function () { self._updateScrollBtn(); }, { passive: true });
      if (this.scrollBtn) {
        this.scrollBtn.addEventListener("click", function () { self.scrollToBottom(true); });
      }

      function updateNet() {
        if (!self.netstatus) return;
        self.netstatus.hidden = navigator.onLine !== false;
      }
      window.addEventListener("online", function () {
        updateNet();
        self.showToast("اتصال اینترنت برقرار شد.", 2200);
      });
      window.addEventListener("offline", updateNet);
      updateNet();

      document.addEventListener("visibilitychange", function () {
        if (!document.hidden) self._stopTitleFlash();
      });

      this.shadow.addEventListener("click", function (e) {
        var copyBtn = e.target.closest(".asw-code-copy");
        if (!copyBtn) return;
        var codeId = copyBtn.dataset.codeId;
        var codeEl = self.shadow.getElementById(codeId);
        if (!codeEl) return;
        navigator.clipboard.writeText(codeEl.textContent).then(function () {
          copyBtn.classList.add("copied");
          copyBtn.querySelector("span").textContent = "کپی شد ✓";
          setTimeout(function () {
            copyBtn.classList.remove("copied");
            copyBtn.querySelector("span").textContent = "کپی";
          }, 2000);
        }).catch(function () {});
      });

      this.shadow.addEventListener("click", function (e) {
        var fbBtn = e.target.closest(".asw-fb-btn");
        if (!fbBtn) return;
        self.handleFeedback(fbBtn);
      });

      document.addEventListener("keydown", function (e) {
        if (e.key !== "Escape") return;
        if (self.sheetOpen) { self.closeSheet(); return; }
        if (self.isOpen) self.close();
      });

      this.initVoice();
    }

    /* ─── Contact bottom-sheet ─── */
    openSheet() {
      if (!this.sheet) return;
      this._uid++;
      this.sheetFormEl.innerHTML = "";
      var selfS = this;
      this.sheetFormEl.appendChild(this.buildContactForm("widget_form", {
        onDone: function () { selfS.closeSheet(); },
      }));
      this.sheet.hidden = false;
      this.sheet.setAttribute("aria-hidden", "false");
      var self = this;
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { self.sheet.classList.add("open"); });
      });
      this.sheetOpen = true;
    }

    closeSheet() {
      if (!this.sheet || !this.sheetOpen) return;
      this.sheet.classList.remove("open");
      this.sheet.setAttribute("aria-hidden", "true");
      var s = this.sheet;
      this.sheetOpen = false;
      setTimeout(function () { s.hidden = true; }, 340);
    }

    /* ─── Professional contact form (shared) ─── */
    buildContactForm(source, opts) {
      opts = opts || {};
      var self = this;
      var uid = "f" + (++this._uid) + source;
      var wrap = document.createElement("div");
      wrap.className = "asw-form" + (opts.compact ? " asw-leadform" : "");
      wrap.innerHTML =
        (opts.compact ? '<div class="asw-sheet-kicker">CONTACT / تماس</div><div class="asw-sheet-title">' + escapeHtml(this.options.leadFormTitle) + '</div><div class="asw-sheet-desc">' + escapeHtml(this.options.leadFormDescription) + '</div>' : "") +
        '<div class="asw-field" id="' + uid + '-nf">' +
          '<label class="asw-flabel" for="' + uid + '-name">نام و نام خانوادگی <b>*</b></label>' +
          '<input type="text" id="' + uid + '-name" name="name" placeholder="مثلاً: سارا محمدی" maxlength="200" autocomplete="name">' +
          '<div class="asw-ferr">لطفاً نام خود را وارد کنید (حداقل ۲ حرف).</div>' +
        '</div>' +
        '<div class="asw-field-row">' +
          '<div class="asw-field" id="' + uid + '-ef">' +
            '<label class="asw-flabel" for="' + uid + '-email">ایمیل</label>' +
            '<input type="email" id="' + uid + '-email" name="email" placeholder="you@mail.com" maxlength="254" autocomplete="email" dir="ltr" style="text-align:left">' +
            '<div class="asw-ferr">ایمیل واردشده معتبر نیست.</div>' +
          '</div>' +
          '<div class="asw-field" id="' + uid + '-pf">' +
            '<label class="asw-flabel" for="' + uid + '-phone">شماره تماس</label>' +
            '<input type="tel" id="' + uid + '-phone" name="phone" placeholder="0912···" maxlength="30" autocomplete="tel" dir="ltr" style="text-align:left">' +
            '<div class="asw-ferr">شماره تماس معتبر نیست.</div>' +
          '</div>' +
        '</div>' +
        '<div class="asw-field">' +
          '<label class="asw-flabel" for="' + uid + '-note">توضیحات (اختیاری)</label>' +
          '<textarea id="' + uid + '-note" name="note" rows="3" maxlength="2000" placeholder="خلاصه‌ی سؤال یا درخواست‌تان را بنویسید…"></textarea>' +
        '</div>' +
        '<input type="text" name="website" value="" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;height:0;width:0">' +
        '<button type="button" class="asw-form-submit">' +
          '<span class="asw-spinner" hidden></span>' + ICONS.send + '<span class="asw-btn-txt">ثبت درخواست تماس</span>' +
        '</button>' +
        '<div class="asw-form-err"></div>' +
        '<div class="asw-form-note">' + ICONS.info + '<span>اطلاعات شما فقط برای تماس کارشناس استفاده می‌شود و محرمانه می‌ماند.</span></div>';

      var nameField = wrap.querySelector("#" + uid + "-nf");
      var emailField = wrap.querySelector("#" + uid + "-ef");
      var phoneField = wrap.querySelector("#" + uid + "-pf");
      var nameInput = wrap.querySelector('[name="name"]');
      var emailInput = wrap.querySelector('[name="email"]');
      var phoneInput = wrap.querySelector('[name="phone"]');
      var noteInput = wrap.querySelector('[name="note"]');
      var honeypot = wrap.querySelector('[name="website"]');
      var submitBtn = wrap.querySelector(".asw-form-submit");
      var globalErr = wrap.querySelector(".asw-form-err");
      noteInput.value = (opts.question || this._lastUserMessage || "");

      function setFieldState(field, input, state) {
        field.classList.remove("invalid", "ok");
        if (state) field.classList.add(state);
      }

      function validate() {
        var ok = true;
        var name = nameInput.value.trim();
        var email = emailInput.value.trim();
        var phone = phoneInput.value.trim();
        setFieldState(nameField, nameInput, null);
        setFieldState(emailField, emailInput, null);
        setFieldState(phoneField, phoneInput, null);
        globalErr.classList.remove("show");

        if (name.length < 2) { setFieldState(nameField, nameInput, "invalid"); ok = false; }
        else { setFieldState(nameField, nameInput, "ok"); }
        if (!email && !phone) {
          setFieldState(emailField, emailInput, "invalid");
          setFieldState(phoneField, phoneInput, "invalid");
          globalErr.textContent = "برای تماس، حداقل ایمیل یا شماره تماس را وارد کنید.";
          globalErr.classList.add("show");
          ok = false;
        }
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setFieldState(emailField, emailInput, "invalid"); ok = false; }
        else if (email) { setFieldState(emailField, emailInput, "ok"); }
        if (phone && !/^[+0-9][0-9\s\-()]{6,24}$/.test(phone.replace(/\s/g, ""))) { setFieldState(phoneField, phoneInput, "invalid"); ok = false; }
        else if (phone) { setFieldState(phoneField, phoneInput, "ok"); }
        return ok;
      }

      [nameInput, emailInput, phoneInput].forEach(function (inp) {
        inp.addEventListener("input", function () {
          var f = inp.closest(".asw-field");
          if (f.classList.contains("invalid")) validate();
        });
      });

      submitBtn.addEventListener("click", function () {
        if (!validate()) return;

        var spinner = submitBtn.querySelector(".asw-spinner");
        var icon = submitBtn.querySelector("svg");
        var txt = submitBtn.querySelector(".asw-btn-txt");
        submitBtn.disabled = true;
        if (spinner) spinner.hidden = false;
        if (icon) icon.style.display = "none";
        txt.textContent = "در حال ارسال…";

        fetch(self.options.leadsEndpoint, {
          method: "POST",
          mode: "cors",
          credentials: "omit",
          headers: self.getHeaders(),
          body: JSON.stringify({
            name: nameInput.value.trim(),
            email: emailInput.value.trim(),
            phone: phoneInput.value.trim(),
            note: (noteInput.value || "").substring(0, 2000),
            conversation_id: self.conversationId,
            conversation_token: self.conversationToken,
            website: honeypot ? honeypot.value : "",
          }),
        }).then(function (res) { return res.json().catch(function () { return {}; }); })
          .then(function (data) {
            if (data && data.ok !== false) {
              wrap.innerHTML =
                '<div class="asw-form-success">' +
                  '<svg class="asw-checkmark" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M15 27l7.5 7.5L37 20"/></svg>' +
                  '<div class="asw-fs-title">درخواست شما با موفقیت ثبت شد</div>' +
                  '<div class="asw-fs-desc">کارشناسان ما در اسرع وقت با شما تماس می‌گیرند. زمان پاسخ‌گویی معمولاً کمتر از یک روز کاری است.</div>' +
                  (opts.onDone ? '<button type="button" class="asw-fs-close">متوجه شدم</button>' : '') +
                '</div>';
              self.showToast("درخواست تماس شما ثبت شد. ✓", 3000);
              if (opts.onDone) wrap.querySelector(".asw-fs-close").addEventListener("click", opts.onDone);
            } else {
              fail((data && data.message) || "ثبت اطلاعات ناموفق بود. لطفاً دوباره تلاش کنید.");
            }
          })
          .catch(function () {
            fail("خطای شبکه. لطفاً اتصال اینترنت را بررسی و دوباره تلاش کنید.");
          });

        function fail(message) {
          globalErr.textContent = message;
          globalErr.classList.add("show");
          submitBtn.disabled = false;
          if (spinner) spinner.hidden = true;
          if (icon) icon.style.display = "";
          txt.textContent = "ثبت درخواست تماس";
        }
      });
      return wrap;
    }

    /* ─── Voice input (Web Speech API) ─── */
    initVoice() {
      var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR || this.options.enableVoiceInput === false || !this.micBtn) return;
      var self = this;
      var rec;
      try { rec = new SR(); } catch (_) { return; }
      rec.lang = "fa-IR";
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;

      rec.onresult = function (e) {
        var txt = "";
        for (var i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
        self.input.value = txt;
        self.autoGrowInput();
        self.updateSendState();
      };
      rec.onend = function () {
        self._listening = false;
        self.inputWrap.classList.remove("asw-listening");
        self.wave.hidden = true;
        if (!self.input.value) self.input.placeholder = self.options.inputPlaceholder;
      };
      rec.onerror = function (ev) {
        self._listening = false;
        self.inputWrap.classList.remove("asw-listening");
        self.wave.hidden = true;
        if (ev && ev.error === "not-allowed") self.showToast("دسترسی به میکروفون داده نشد.");
        else if (ev && ev.error === "network") self.showToast("سرویس تشخیص گفتار در دسترس نیست.");
      };

      this.micBtn.hidden = false;
      this.micBtn.addEventListener("click", function () {
        if (self._listening) { try { rec.stop(); } catch (_) {} return; }
        if (self.isLoading) return;
        try {
          rec.start();
          self._listening = true;
          self.inputWrap.classList.add("asw-listening");
          self.wave.hidden = false;
          self.input.placeholder = "در حال شنیدن…";
          self.input.focus();
        } catch (_) {}
      });
    }

    /* ─── Teaser ─── */
    _maybeShowTeaser() {
      if (this.options.showTeaser === false || this.previewMode) return;
      if (this.isOpen) return;
      try { if (sessionStorage.getItem("asw_teaser_dismissed")) return; } catch (_) {}
      if (window.innerWidth <= 520) return;
      var self = this;
      this._teaserTimer = setTimeout(function () {
        if (self.isOpen || !self.teaser) return;
        self.teaser.hidden = false;
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { self.teaser.classList.add("show"); });
        });
      }, 3800);
    }

    _dismissTeaser(permanent) {
      if (this._teaserTimer) { clearTimeout(this._teaserTimer); this._teaserTimer = null; }
      if (!this.teaser) return;
      this.teaser.classList.remove("show");
      var t = this.teaser;
      setTimeout(function () { t.hidden = true; }, 280);
      if (permanent) { try { sessionStorage.setItem("asw_teaser_dismissed", "1"); } catch (_) {} }
    }

    /* ─── Unread badge + tab-title flash ─── */
    _markUnread() {
      this._unread = (this._unread || 0) + 1;
      if (this.fabBadge) {
        this.fabBadge.textContent = this._unread > 9 ? "9+" : String(this._unread);
        this.fabBadge.hidden = false;
        this.fabBadge.classList.remove("asw-pop");
        void this.fabBadge.offsetWidth;
        this.fabBadge.classList.add("asw-pop");
      }
      if (document.hidden) this._startTitleFlash();
    }

    _startTitleFlash() {
      if (this._titleTimer) return;
      var self = this;
      var original = document.title;
      this._origTitle = original;
      var flip = false;
      this._titleTimer = setInterval(function () {
        flip = !flip;
        document.title = flip ? "💬 پیام جدید — " + self.options.title : original;
      }, 1300);
    }

    _stopTitleFlash() {
      if (this._titleTimer) {
        clearInterval(this._titleTimer);
        this._titleTimer = null;
        if (this._origTitle) document.title = this._origTitle;
      }
    }

    /* ─── Auto-grow Textarea ─── */
    autoGrowInput() {
      var el = this.input;
      el.style.height = "auto";
      var newHeight = Math.min(el.scrollHeight, 132);
      el.style.height = newHeight + "px";
    }

    /* ─── Open / Close ─── */
    open() {
      this.isOpen = true;
      this._unread = 0;
      this._stopTitleFlash();
      if (this.fabBadge) this.fabBadge.hidden = true;
      this._dismissTeaser(true);
      this.panel.classList.add("open");
      this.panel.setAttribute("aria-hidden", "false");
      this.fab.classList.add("active");
      this.fab.setAttribute("aria-expanded", "true");
      var self = this;
      setTimeout(function () { self.input.focus(); }, 300);
      this._updateScrollBtn();
    }

    close() {
      this.isOpen = false;
      this.panel.classList.remove("open");
      this.panel.setAttribute("aria-hidden", "true");
      this.fab.classList.remove("active");
      this.fab.setAttribute("aria-expanded", "false");
      this.fab.focus();
    }

    toggle() { this.isOpen ? this.close() : this.open(); }

    /* ─── Send State ─── */
    updateSendState() {
      this.sendBtn.disabled = this.isLoading || !this.input.value.trim();
    }

    scrollToBottom(force, instant) {
      if (!force && this._stick === false) return;
      var m = this.messages;
      var dist = m.scrollHeight - m.scrollTop - m.clientHeight;
      /* A long jump (history restore, re-attaching after refresh) reads as a
         glitch when animated, so only animate the short distances produced by
         streaming and new messages. */
      var behaviour = instant || dist > m.clientHeight * 1.5 ? "auto" : "smooth";
      m.scrollTo({ top: m.scrollHeight, behavior: behaviour });
    }

    _updateScrollBtn() {
      if (!this.scrollBtn) return;
      var m = this.messages;
      var dist = m.scrollHeight - m.scrollTop - m.clientHeight;
      this.scrollBtn.classList.toggle("show", dist > 160);
      this._stick = dist < 120;
    }

    /* ─── Toast ─── */
    showToast(msg, duration) {
      var t = this.toast;
      t.innerHTML = ICONS.info + "<span>" + escapeHtml(msg) + "</span>";
      t.classList.add("show");
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(function () { t.classList.remove("show"); }, duration || 4000);
    }

    /* ─── Hero (welcome) ─── */
    addHero(text) {
      var el = document.createElement("div");
      el.className = "asw-hero";
      var orbContent = (this.options.logoUrl && isSafeUrl(this.options.logoUrl))
        ? '<img src="' + escapeHtml(this.options.logoUrl) + '" alt="" referrerpolicy="no-referrer">'
        : ICONS.sparkles;
      var cards = "";
      var items = (this._suggestionItems || []).slice(0, 4);
      if (items.length) {
        cards = '<div class="asw-hero-grid">' + items.map(function (item) {
          return '<button class="asw-suggestion" type="button" data-msg="' + escapeHtml(item) + '">' +
            "<span>" + escapeHtml(item) + "</span>" +
            '<span class="asw-card-arrow" aria-hidden="true">' + ICONS.chevronLeft + "</span>" +
            "</button>";
        }).join("") + "</div>";
      }
      el.innerHTML =
        '<div class="asw-hero-orb-wrap" aria-hidden="true"><div class="asw-hero-orb">' + orbContent + "</div></div>" +
        '<div class="asw-hero-text">' + escapeHtml(text) + "</div>" +
        '<div class="asw-hero-sub">سؤال‌تان را از دانش همین سایت پاسخ می‌دهم.</div>' +
        cards;
      this.messages.appendChild(el);
      this.messageCount++;
      this.syncSuggestions();
      this._updateScrollBtn();
      this.scrollToBottom();
      return { row: el, col: el, bubble: el.querySelector(".asw-hero-text"), feedback: null, timeEl: null };
    }

    collapseHero() {
      var hero = this.messages.querySelector(".asw-hero");
      if (!hero) return;
      hero.classList.add("asw-hero-out");
      setTimeout(function () { if (hero.parentNode) hero.parentNode.removeChild(hero); }, 360);
    }

    /* ─── Add Message ─── */
    addMessage(text, sender, isGreeting, opts) {
      opts = opts || {};
      if (isGreeting && sender === "bot") return this.addHero(text);

      var prev = this.messages.lastElementChild;
      var isCont = !!(prev && prev.classList && prev.classList.contains("asw-row") && prev.classList.contains(sender));
      var row = document.createElement("div");
      row.className = "asw-row " + sender + (isCont ? " asw-cont" : "") + (opts.noAnim ? " no-anim" : "");

      var oldLast = this.messages.querySelector(".asw-row.asw-last");
      if (oldLast) oldLast.classList.remove("asw-last");
      row.classList.add("asw-last");

      if (this.options.showAvatar !== false) {
        var avatar = document.createElement("div");
        avatar.className = "asw-msg-avatar";
        if (sender === "bot") {
          if (this.options.logoUrl && isSafeUrl(this.options.logoUrl)) {
            var img = document.createElement("img");
            img.src = this.options.logoUrl;
            img.alt = "";
            img.referrerPolicy = "no-referrer";
            avatar.appendChild(img);
          } else {
            avatar.textContent = this.options.botAvatarText || "▸";
          }
        } else {
          avatar.textContent = "شما";
        }
        row.appendChild(avatar);
      }

      var col = document.createElement("div");
      col.className = "asw-col";

      var bubble = document.createElement("div");
      bubble.className = "asw-bubble" + (opts.streaming ? " streaming" : "") + (opts.isError ? " asw-error-bubble" : "");
      bubble.innerHTML = sender === "bot" ? renderMarkdown(text) : escapeHtml(text);

      col.appendChild(bubble);

      if (opts.isError && opts.retry !== false && this._lastUserMessage) {
        var selfR = this;
        var retryMsg = this._lastUserMessage;
        var retry = document.createElement("button");
        retry.className = "asw-retry";
        retry.type = "button";
        retry.innerHTML = ICONS.refresh + "<span>تلاش دوباره</span>";
        retry.addEventListener("click", function () {
          if (row.parentNode) row.parentNode.removeChild(row);
          selfR.sendText(retryMsg);
        });
        col.appendChild(retry);
      }

      var feedback = null;
      var wantFb = sender === "bot" && !isGreeting && this.options.showFeedback !== false;
      if (wantFb) {
        feedback = this.buildFeedbackEl(text);
        if (!opts.skipFeedback) col.appendChild(feedback);
      }

      var timeEl = null;
      if (this.options.showTimestamp !== false && !opts.streaming) {
        timeEl = document.createElement("div");
        timeEl.className = "asw-time";
        timeEl.textContent = formatTime();
        col.appendChild(timeEl);
      }

      if (sender === "bot" && this.options.showCitations && Array.isArray(opts.citations) && opts.citations.length) {
        col.appendChild(this.buildCitations(opts.citations));
      }

      row.appendChild(col);
      this.messages.appendChild(row);
      this.messageCount++;

      if (sender === "bot" && !isGreeting && !opts.streaming && !this.isOpen) this._markUnread();

      this.syncSuggestions();
      this._updateScrollBtn();
      this.scrollToBottom();
      if (!opts.streaming) this.saveLocalHistory();
      return { row: row, col: col, bubble: bubble, feedback: feedback, timeEl: timeEl };
    }

    buildFeedbackEl(answerPreview) {
      var el = document.createElement("div");
      el.className = "asw-feedback";
      el.setAttribute("role", "group");
      el.setAttribute("aria-label", "ارزیابی پاسخ");
      el.innerHTML =
        '<button class="asw-fb-btn fb-copy" type="button" data-action="copy" aria-label="کپی پاسخ" title="کپی پاسخ">' + ICONS.copy + '</button>' +
        '<button class="asw-fb-btn thumbs-up" type="button" data-action="helpful" aria-pressed="false" aria-label="مفید بود" title="مفید بود">' + ICONS.thumbUp + '</button>' +
        '<button class="asw-fb-btn thumbs-down" type="button" data-action="not_helpful" aria-pressed="false" aria-label="مفید نبود" title="مفید نبود">' + ICONS.thumbDown + '</button>';
      el.setAttribute("data-question", (this._lastUserMessage || "").substring(0, 200));
      el.setAttribute("data-answer", answerPreview.substring(0, 300));
      return el;
    }

    buildCitations(citations) {
      var wrap = document.createElement("div");
      wrap.className = "asw-citations";
      var label = document.createElement("span");
      label.className = "asw-citations-label";
      label.textContent = "منابع:";
      wrap.appendChild(label);
      citations.slice(0, 4).forEach((c) => {
        var title = (c.title || "منبع").substring(0, 60);
        var chip = document.createElement(c.url && isSafeUrl(c.url) ? "a" : "span");
        chip.className = "asw-citation";
        chip.title = c.page_number ? title + " — صفحه " + c.page_number : title;
        chip.innerHTML = ICONS.link + '<span>' + escapeHtml(title) + (c.page_number ? " · ص" + escapeHtml(String(c.page_number)) : "") + '</span>';
        if (c.url && isSafeUrl(c.url)) {
          chip.href = c.url;
          chip.target = "_blank";
          chip.rel = "noopener noreferrer";
        }
        wrap.appendChild(chip);
      });
      return wrap;
    }

    /* ─── Feedback Handler ─── */
    handleFeedback(btn) {
      var feedbackDiv = btn.closest(".asw-feedback");
      if (!feedbackDiv) return;

      // Copy is a repeatable local action — never sent as feedback.
      if (btn.dataset.action === "copy") {
        var col = btn.closest(".asw-col");
        var bubble = col ? col.querySelector(".asw-bubble") : null;
        var text = bubble ? bubble.textContent.trim() : "";
        navigator.clipboard.writeText(text).then(function () {
          btn.classList.add("copied");
          btn.innerHTML = ICONS.check;
          setTimeout(function () {
            btn.classList.remove("copied");
            btn.innerHTML = ICONS.copy;
          }, 1600);
        }).catch(function () {});
        return;
      }

      if (feedbackDiv.dataset.sent) return;

      var action = btn.dataset.action;
      var isHelpful = action === "helpful";

      // Visual feedback: one answer can be rated once, and the state is
      // exposed to assistive tech instead of being colour-only.
      feedbackDiv.querySelectorAll(".asw-fb-btn").forEach(function (b) {
        if (b.dataset.action === "copy") return;
        b.classList.remove("active");
        b.setAttribute("aria-pressed", "false");
        b.disabled = true;
      });
      btn.classList.add("active");
      btn.setAttribute("aria-pressed", "true");

      if (isHelpful) {
        btn.innerHTML = ICONS.thumbUpFilled;
      } else {
        btn.innerHTML = ICONS.thumbDownFilled;
      }

      feedbackDiv.dataset.sent = "true";

      this.sendFeedback(isHelpful, feedbackDiv.dataset.question || "", feedbackDiv.dataset.answer || "", feedbackDiv.dataset.messageId || null);
    }

    sendFeedback(helpful, question, answerPreview, messageId) {
      if (!this.options.feedbackEndpoint) return;
      var body = {
        helpful: helpful,
        question: question,
        answer_preview: answerPreview,
        session_id: this.options.sessionId,
      };
      if (messageId) {
        body.message_id = Number(messageId);
        body.conversation_id = this.conversationId;
        body.conversation_token = this.conversationToken;
      }
      fetch(this.options.feedbackEndpoint, {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      }).catch(function () {});
    }

    /* ─── Events ─── */
    sendEvent(type, meta) {
      if (!this.options.eventsEndpoint) return;
      fetch(this.options.eventsEndpoint, {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        headers: this.getHeaders(),
        body: JSON.stringify({ event_type: type, metadata: meta || {} }),
      }).catch(function () {});
    }

    /* ─── Loading State ───
       One honest status, no staged marketing copy: the visitor sees a typing
       bubble and their own composer (or the operator's) keeps its meaning. */
    setLoading(loading) {
      this.isLoading = loading;
      this.typing.hidden = !loading;
      this.input.disabled = loading;
      if (loading) {
        if (this.typingLabel) this.typingLabel.textContent = THINKING_STATUSES[0];
        this.sendBtn.classList.add("asw-stop");
        this.sendBtn.innerHTML = ICONS.stop;
        this.sendBtn.setAttribute("aria-label", "توقف پاسخ");
      } else {
        this.sendBtn.classList.remove("asw-stop");
        this.sendBtn.innerHTML = ICONS.arrowUp;
        this.sendBtn.setAttribute("aria-label", "ارسال پیام");
      }
      if (window.AISupportUI && window.AISupportUI.sync) window.AISupportUI.sync(this);
      this.updateSendState();
      if (loading) this.scrollToBottom();
    }

    /* ─── Play Sound ─── */
    playSound(type) {
      if (!this.options.enableSounds) return;
      try {
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.value = 0.1;
        if (type === "send") { osc.frequency.value = 880; osc.type = "sine"; }
        else { osc.frequency.value = 660; osc.type = "sine"; }
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.stop(ctx.currentTime + 0.15);
      } catch (_) {}
    }

    /* ─── Send Message ─── */
    send() {
      var msg = this.input.value.trim();
      if (!msg || this.isLoading) return;
      this.input.value = "";
      this.autoGrowInput();
      this.sendText(msg);
    }

    sendText(msg) {
      if (!msg || this.isLoading) return;

      var self = this;
      this._lastUserMessage = msg;
      this._chatStarted = true;
      this.addMessage(msg, "user");
      this.collapseHero();
      this.syncSuggestions();
      this.suggestions.hidden = true;
      this.setLoading(true);
      this.playSound("send");
      this.scrollToBottom(true);

      if (navigator.onLine === false) {
        var offMsg = "اتصال اینترنت قطع است. بعد از وصل شدن دوباره تلاش کنید.";
        this.addMessage(offMsg, "bot", false, { isError: true, skipFeedback: true });
        this.showToast(offMsg, 4000);
        this.setLoading(false);
        return;
      }

      var p = (function () {
        if (self.options.enableStreaming && !self.previewMode) {
          return self.streamChat(msg);
        }
        return self.callBackend(msg).then(function (result) {
          self.handleAnswerResult(result.answer, result);
          return null;
        });
      })();

      p.then(function () {
        self.playSound("receive");
      }).catch(function (err) {
        self.sendEvent("fallback_triggered", { message: err && err.message || "unknown" });
        var errMsg = err && err.userMessage ? err.userMessage : "متأسفانه در حال حاضر قادر به پاسخگویی نیستم. لطفاً دوباره تلاش کنید.";
        self.addMessage(errMsg, "bot", false, { isError: true, skipFeedback: true });
        self.showToast(errMsg, 5000);
      }).finally(function () {
        self.setLoading(false);
        self.input.focus();
      });
    }

    handleAnswerResult(answer, meta) {
      meta = meta || {};
      var els = this.addMessage(answer, "bot", false, {
        citations: meta.citations || [],
        skipFeedback: false,
      });
      if (els.feedback && meta.message_id) {
        els.feedback.setAttribute("data-message-id", String(meta.message_id));
      }
      if (Array.isArray(meta.rule_actions) && meta.rule_actions.length) {
        this.applyRuleActions(meta.rule_actions, answer);
      } else if (meta.fallback) {
        this.maybeShowHandoff(answer);
      }
      return els;
    }

    applyRuleActions(actions, answerText) {
      var self = this;
      var lastRow = this.messages.lastElementChild;
      if (!lastRow || !lastRow.classList.contains("asw-row")) return;
      actions.forEach(function (a) {
        var type = a.action_type || a.type || "";
        var payload = a.payload || a.url || "";
        var label = a.label || a.name || "مشاهده";
        if (type === "suggest_link" && payload) {
          var chip = document.createElement("a");
          chip.className = "asw-suggestion";
          chip.href = payload;
          chip.target = "_blank";
          chip.rel = "noopener noreferrer";
          chip.textContent = label;
          chip.style.display = "inline-flex";
          chip.style.marginTop = "8px";
          lastRow.querySelector(".asw-bubble").appendChild(chip);
        } else if (type === "suggest_text" && payload) {
          var hint = document.createElement("div");
          hint.className = "asw-rule-hint";
          hint.textContent = payload;
          lastRow.querySelector(".asw-bubble").appendChild(hint);
        } else if (type === "handoff") {
          self.maybeShowHandoff(answerText || payload);
        }
      });
      this.saveLocalHistory();
      this.scrollToBottom();
    }

    /* ─── Streaming (SSE) with smooth rAF typewriter ─── */
    async streamChat(message) {
      var self = this;
      this.abortStream = new AbortController();
      var timeout = setTimeout(function () { self.abortStream.abort(); }, Number(this.options.timeoutMs) || 120000);

      var els = null;
      var streamedText = "";
      var shownCount = 0;
      var streamClosed = false;
      var finished = false;
      var firstTokenSeen = false;
      var finishMeta = null;
      var rafId = 0;

      function paintStep() {
        rafId = 0;
        if (!els || finished) return;
        if (shownCount < streamedText.length) {
          var gap = streamedText.length - shownCount;
          shownCount = Math.min(streamedText.length, shownCount + Math.max(2, Math.ceil(gap / 12)));
          els.bubble.innerHTML = renderMarkdown(streamedText.slice(0, shownCount));
          self.scrollToBottom();
          rafId = requestAnimationFrame(paintStep);
        } else if (streamClosed) {
          finishUp();
        }
      }

      function ensurePaint() {
        if (!rafId && !finished) rafId = requestAnimationFrame(paintStep);
      }

      function finishUp() {
        if (finished) return;
        finished = true;
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
        if (els) {
          els.bubble.classList.remove("streaming");
          self.handleAnswerResultFromEl(els, streamedText, finishMeta || {});
        }
      }

      try {
        await new Promise(function (resolve, reject) {
          fetch(self.options.streamEndpoint, {
            method: "POST",
            mode: "cors",
            credentials: "omit",
            headers: self.getHeaders(),
            body: JSON.stringify({
              message: message,
              conversation_id: self.conversationId,
              conversation_token: self.conversationToken,
              page_url: (window.location && window.location.href || "").substring(0, 1000),
            }),
            signal: self.abortStream.signal,
          }).then(function (res) {
            if (!res.ok) {
              res.json().catch(function () { return {}; }).then(function (data) {
                var e = new Error(data.message || data.error || "Stream failed");
                e.userMessage = data.message || (res.status >= 500
                  ? "سرویس موقتاً در دسترس نیست. لطفاً لحظاتی بعد دوباره تلاش کنید."
                  : "لطفاً پیام خود را بررسی و دوباره ارسال کنید.");
                reject(e);
              });
              return;
            }
            if (!res.body || !res.body.getReader) {
              resolve(null);
              return;
            }
            var reader = res.body.getReader();
            var decoder = new TextDecoder();
            var buffer = "";
            function pump() {
              reader.read().then(function (chunk) {
                if (chunk.done) { resolve(null); return; }
                buffer += decoder.decode(chunk.value, { stream: true });
                var events = buffer.split("\n\n");
                buffer = events.pop();
                events.forEach(function (raw) {
                  var name = "message";
                  var dataLines = [];
                  raw.split("\n").forEach(function (line) {
                    if (line.indexOf("event:") === 0) name = line.slice(6).trim();
                    else if (line.indexOf("data:") === 0) dataLines.push(line.slice(5).trim());
                  });
                  if (!dataLines.length) return;
                  var data;
                  try { data = JSON.parse(dataLines.join("\n")); } catch (_) { return; }
                  if (name === "meta") {
                    if (data.conversation_id) self.conversationId = data.conversation_id;
                    if (data.conversation_token) self.conversationToken = data.conversation_token;
                    self.saveConversation();
                  } else if (name === "token") {
                    streamedText += (data.t || "");
                    if (!firstTokenSeen) {
                      firstTokenSeen = true;
                      els = self.addMessage("", "bot", false, { streaming: true, skipFeedback: true });
                      self.typing.hidden = true;
                    }
                    ensurePaint();
                  } else if (name === "done") {
                    finishMeta = data;
                    streamClosed = true;
                    ensurePaint();
                  } else if (name === "error") {
                    var ee = new Error(data.message || "stream error");
                    ee.userMessage = data.message || "خطا در دریافت پاسخ.";
                    reject(ee);
                  }
                });
                pump();
              }).catch(function (e) { reject(e); });
            }
            pump();
          }).catch(reject);
        });

        if (els && streamedText) {
          streamClosed = true;
          ensurePaint();
        } else if (!streamedText) {
          var result = await this.callBackend(message);
          this.handleAnswerResult(result.answer, result);
        }
      } catch (err) {
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
        if (err.name === "AbortError") {
          if (streamedText && els) {
            els.bubble.classList.remove("streaming");
            this.handleAnswerResultFromEl(els, streamedText + " …", finishMeta || {});
          } else {
            var te = new Error("Timeout");
            te.userMessage = "پاسخ‌دهی بیش از حد طول کشید. لطفاً دوباره تلاش کنید.";
            throw te;
          }
        } else {
          throw err;
        }
      } finally {
        clearTimeout(timeout);
        this.abortStream = null;
      }
    }

    handleAnswerResultFromEl(els, answer, meta) {
      els.bubble.innerHTML = renderMarkdown(answer);
      if (this.options.showCitations && Array.isArray(meta.citations) && meta.citations.length) {
        els.col.appendChild(this.buildCitations(meta.citations));
      }
      if (els.timeEl === null && this.options.showTimestamp !== false) {
        var t = document.createElement("div");
        t.className = "asw-time";
        t.textContent = formatTime();
        els.col.appendChild(t);
      }
      if (this.options.showFeedback !== false && els.feedback) {
        els.feedback.setAttribute("data-question", (this._lastUserMessage || "").substring(0, 200));
        els.feedback.setAttribute("data-answer", answer.substring(0, 300));
        if (meta.message_id) els.feedback.setAttribute("data-message-id", String(meta.message_id));
        els.col.appendChild(els.feedback);
      }
      if (Array.isArray(meta.rule_actions) && meta.rule_actions.length) {
        this.applyRuleActions(meta.rule_actions, answer);
      } else if (meta.fallback) this.maybeShowHandoff(answer);
      this.saveLocalHistory();
      this.scrollToBottom();
      this._updateScrollBtn();
    }

    /* ─── Human Handoff ─── */
    maybeShowHandoff(answerText) {
      var trigger = this.options.handoffTrigger || "low_confidence";
      if (!this.options.enableHandoff || trigger === "off" || this.previewMode) return;
      if (this._handoffShown) return;
      this._handoffShown = true;

      var self = this;
      var lastRow = this.messages.lastElementChild;
      if (!lastRow) return;
      var bar = document.createElement("div");
      bar.className = "asw-handoff";
      var label = document.createElement("span");
      label.className = "asw-handoff-label";
      label.textContent = this.options.handoffMessage;
      bar.appendChild(label);

      var urls = this.options.handoffUrls || {};
      var channels = [
        { key: "contact_form", url: urls.contact_form, label: "فرم تماس", icon: ICONS.user },
        { key: "telegram", url: urls.telegram, label: "تلگرام", icon: ICONS.link },
        { key: "whatsapp", url: urls.whatsapp, label: "واتساپ", icon: ICONS.phone },
      ];
      var anyChannel = false;
      channels.forEach(function (ch) {
        if (!ch.url || !isSafeUrl(ch.url)) return;
        anyChannel = true;
        var a = document.createElement("a");
        a.className = "asw-handoff-btn";
        a.href = ch.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.innerHTML = ch.icon + escapeHtml(ch.label);
        a.addEventListener("click", function () { self.logHandoff(ch.key, answerText); });
        bar.appendChild(a);
      });
      if (anyChannel) {
        lastRow.appendChild(bar);
        this.scrollToBottom();
      }
      if (this.options.enableLeadCapture) {
        var formHolder = document.createElement("div");
        formHolder.className = "asw-leadform-wrap";
        formHolder.appendChild(this.buildContactForm("handoff_email", {
          compact: true,
          question: answerText,
        }));
        lastRow.appendChild(formHolder);
        this.scrollToBottom();
      }
    }

    logHandoff(channel, question) {
      if (!this.options.handoffEndpoint) return;
      fetch(this.options.handoffEndpoint, {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        headers: this.getHeaders(),
        body: JSON.stringify({
          channel: channel,
          message: (question || this._lastUserMessage || "").substring(0, 2000),
          conversation_id: this.conversationId,
          conversation_token: this.conversationToken,
        }),
      }).catch(function () {});
    }

    /* ─── API Call ─── */
    async callBackend(message) {
      var controller = new AbortController();
      var timeout = setTimeout(function () { controller.abort(); }, Number(this.options.timeoutMs) || 120000);
      try {
        var res = await fetch(this.options.apiEndpoint, {
          method: "POST", mode: "cors", credentials: "omit",
          headers: this.getHeaders(),
          body: JSON.stringify({
            message: message,
            conversation_id: this.conversationId,
            conversation_token: this.conversationToken,
            page_url: (window.location && window.location.href || "").substring(0, 1000),
          }),
          signal: controller.signal,
        });
        var data = {};
        try { data = await res.json(); } catch (_) { data = {}; }
        if (!res.ok) {
          var e = new Error(data.message || data.error || "Request failed");
          e.userMessage = res.status >= 500
            ? "سرویس موقتاً در دسترس نیست. لطفاً لحظاتی بعد دوباره تلاش کنید."
            : data.message || "لطفاً پیام خود را بررسی و دوباره ارسال کنید.";
          throw e;
        }
        var answer = data.answer || data.reply || data.response || data.message;
        if (typeof answer !== "string" || !answer.trim()) throw new Error("Empty answer");
        if (data.conversation_id) {
          this.conversationId = data.conversation_id;
          this.conversationToken = data.conversation_token || this.conversationToken;
          this.saveConversation();
        }
        return {
          answer: answer.trim(),
          citations: data.citations || [],
          message_id: data.message_id,
          fallback: data.fallback || false,
          rule_actions: data.rule_actions || [],
        };
      } catch (err) {
        if (err.name === "AbortError") {
          var te = new Error("Timeout");
          te.userMessage = "پاسخ‌دهی بیش از حد طول کشید. لطفاً دوباره تلاش کنید.";
          throw te;
        }
        throw err;
      } finally {
        clearTimeout(timeout);
      }
    }

    /* ─── Headers ─── */
    getHeaders() {
      var h = { "Content-Type": "application/json" };
      if (this.options.widgetPublicKey) h["X-Widget-Key"] = this.options.widgetPublicKey;
      if (this.conversationToken) h["X-Conversation-Token"] = this.conversationToken;
      return h;
    }
  }

  AISupportWidget.version = "6.0.0";

  /* ─────────────── BOOT ─────────────── */
  function boot() {
    var globalConfig = window.AI_WIDGET_CONFIG || {};
    var options = Object.assign({}, globalConfig);
    if (scriptConfig.api) options.apiEndpoint = scriptConfig.api;
    if (scriptConfig.widgetKey) options.widgetPublicKey = scriptConfig.widgetKey;
    if (scriptConfig.title) options.title = scriptConfig.title;
    if (scriptConfig.primaryColor) options.primaryColor = scriptConfig.primaryColor;
    if (scriptConfig.preview === "1" || scriptConfig.preview === "true") options.previewMode = true;
    window._aiWidget = new AISupportWidget(options);
  }

  window.AISupportWidget = AISupportWidget;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
