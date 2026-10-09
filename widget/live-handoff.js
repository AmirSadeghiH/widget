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
