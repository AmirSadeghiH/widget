/**
 * Theme-independent UI state. Description, service status and draft are separate
 * concerns: a state transition must never replace the customer's subtitle or
 * discard what a visitor is writing. Embedded in every installable bundle.
 */
(function (global) {
  "use strict";

  var VERSION = "2.0.0";
  var TEXT = {
    init: "در حال آماده‌سازی…",
    online: "آمادهٔ پاسخ‌گویی",
    unavailable: "سرویس موقتاً در دسترس نیست",
    thinking: "در حال نوشتن پاسخ…",
    offline: "اتصال برقرار نیست",
    locked: "ارسال پیام غیرفعال است",
    waitingSub: "در انتظار کارشناس",
    humanSub: "پشتیبانی انسانی",
    humanPlaceholder: "پیام خود را برای کارشناس بنویسید…",
    lockedPlaceholder: "ارسال پیام در حال حاضر ممکن نیست",
    announceWaiting: "درخواست پشتیبانی انسانی ثبت شد. در انتظار پاسخ کارشناس هستید.",
    announceHuman: "کارشناس پشتیبانی به گفتگو پیوست.",
    announceBackToAI: "گفتگوی انسانی پایان یافت. دستیار هوشمند دوباره فعال شد.",
    announceOffline: "اتصال اینترنت قطع است. پیش‌نویس شما حفظ شده است.",
    announceOnline: "اتصال دوباره برقرار شد.",
    announceLocked: "ارسال پیام برای این سایت غیرفعال است.",
    waiting: function (minutes) {
      return "درخواست شما ثبت شده؛ کارشناس همین‌جا پاسخ می‌دهد." +
        (minutes > 0 ? " زمان تقریبی انتظار: " + minutes.toLocaleString("fa-IR") + " دقیقه." : "");
    }
  };

  function liveMode(widget) {
    return widget && widget.root && widget.root.getAttribute("data-live-mode") || "ai";
  }

  // A lost connection outranks human presence; never claim an operator is
  // reachable while the browser knows it is offline. A lock always wins.
  function computeState(widget) {
    if (widget && widget._blocked) return "locked";
    if (global.navigator && global.navigator.onLine === false) return "offline";
    var mode = liveMode(widget);
    if (mode === "human") return "human_active";
    if (mode === "waiting") return "human_waiting";
    if (widget && widget.isLoading) return "thinking";
    if (widget && widget._configUnreachable) return "offline";
    if (widget && (widget._initializing || widget._configPending)) return "init";
    if (widget && widget._configReady === false) return "unavailable";
    return "online";
  }

  function subtitleFor(widget) { return widget && widget.options && widget.options.subtitle || ""; }

  function placeholderFor(widget, state) {
    if (state === "locked") return TEXT.lockedPlaceholder;
    if (liveMode(widget) !== "ai") return TEXT.humanPlaceholder;
    // Let the visitor compose the next message while a reply is in flight.
    return widget && widget.options && widget.options.inputPlaceholder || "پیام خود را بنویسید…";
  }

  function statusFor(widget, state) {
    if (state === "human_waiting") return TEXT.waitingSub;
    if (state === "human_active") return TEXT.humanSub;
    if (state === "online") return widget.options.headerBadge || TEXT.online;
    return TEXT[state] || TEXT.online;
  }

  function announcementFor(previous, state) {
    if (previous === state) return "";
    if (state === "human_waiting") return TEXT.announceWaiting;
    if (state === "human_active") return TEXT.announceHuman;
    if (state === "locked") return TEXT.announceLocked;
    if (state === "offline") return TEXT.announceOffline;
    if (previous === "offline") return TEXT.announceOnline;
    if (previous === "human_active" || previous === "human_waiting") return TEXT.announceBackToAI;
    return "";
  }

  function sync(widget) {
    if (!widget || !widget.root || widget._destroyed) return "";
    var state = computeState(widget);
    widget.root.setAttribute("data-ui-state", state);
    if (widget.messages) widget.messages.setAttribute("aria-busy", widget.isLoading || widget._initializing ? "true" : "false");
    if (widget.subtitleEl) widget.subtitleEl.textContent = subtitleFor(widget);
    if (widget.input) {
      var placeholder = String(placeholderFor(widget, state));
      if (widget.input.placeholder !== placeholder) {
        widget.input.placeholder = placeholder;
        if (widget.autoGrowInput) widget.autoGrowInput();
      }
      widget.input.disabled = !!widget._blocked;
    }
    if (widget.netstatus) widget.netstatus.hidden = !(global.navigator && global.navigator.onLine === false) || !!widget._blocked;
    var mode = widget.root.getAttribute("data-live-mode");
    var disclosure = widget.root.querySelector(".asw-disclaim");
    if (disclosure) disclosure.textContent = mode === "waiting" ? "پس از اتصال کارشناس، گفتگو با پشتیبانی انسانی ادامه پیدا می‌کند." : mode === "human" ? "این گفتگو با پشتیبانی انسانی ادامه دارد." : "پاسخ‌های این دستیار از دانش همین سایت ساخته می‌شوند و ممکن است ناقص باشند.";
    var human = state === "human_waiting" || state === "human_active";
    if (widget.badgeEl) widget.badgeEl.hidden = human;
    if (widget.badgeText) widget.badgeText.textContent = statusFor(widget, state);
    var chip = widget.root.querySelector("#asw-live-chip");
    if (chip) {
      chip.hidden = !human;
      chip.textContent = state === "human_active" ? TEXT.humanSub : TEXT.waitingSub;
    }
    if (widget.banner) {
      var text = state === "locked" ? widget._blockedMessage || "این سرویس در حال حاضر در دسترس نیست." :
        state === "human_waiting" ? TEXT.waiting(Number(widget.options.liveHandoffSlaMinutes) || 0) : "";
      widget.banner.textContent = text;
      widget.banner.hidden = !text;
      widget.banner.setAttribute("data-tone", state === "locked" ? "locked" : "info");
    }
    var previous = widget._uiState || "";
    widget._uiState = state;
    var announcement = announcementFor(previous, state);
    if (announcement && widget.liveRegion) widget.liveRegion.textContent = announcement;
    return state;
  }

  function install(widget) {
    if (!widget || widget._uiInstalled) return widget && widget.ui;
    widget._uiInstalled = true;
    widget.ui = {
      version: VERSION,
      text: TEXT,
      state: function () { return computeState(widget); },
      sync: function () { return sync(widget); },
      destroy: function () { widget._uiInstalled = false; }
    };
    widget._markConfigReady = function (ok) {
      widget._configPending = false;
      widget._configReady = !!ok;
      widget._configUnreachable = !ok;
      sync(widget);
    };
    sync(widget);
    return widget.ui;
  }

  global.AISupportUI = {
    version: VERSION,
    TEXT: TEXT,
    install: install,
    sync: sync,
    computeState: computeState,
    subtitleFor: subtitleFor,
    placeholderFor: placeholderFor
  };
})(window);
