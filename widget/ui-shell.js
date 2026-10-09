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
