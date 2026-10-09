/**
 * AI Support Widget — commercial support widget, theme "__ASW_THEME_LABEL__".
 * ───────────────────────────────────────────────────────────────────────
 * One installable <script> per theme: no framework, no build step, no extra
 * request at runtime. All eleven bundles share the same markup, states and
 * design system, inlined from widget/design-core.css + themes/*.css and scripts/widget-runtime.js.
 * Regenerate with python3 scripts/build_widgets.py (no runtime dependencies).
 *
 * Behaviour contract (identical in every theme):
 *   · AI chat — JSON fallback and SSE streaming, with citations and feedback
 *   · live human support — request, wait, agent replies, close, back to AI
 *   · conversation memory — server token plus a short local transcript
 *   · lead capture / contact channels, business rules, analytics
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

  /* @asw-live-handoff */
  /* @asw-ui-shell */
  var THEME = /* @asw-theme */ null;

  /* ─────────────── DEFAULTS ─────────────── */
  var DEFAULTS = Object.assign({
    apiEndpoint: "/api/chat/",
    configEndpoint: "",
    eventsEndpoint: "",
    feedbackEndpoint: "",
    widgetPublicKey: "",
    title: "دستیار هوش مصنوعی",
    subtitle: "آنلاین • پاسخ فوری",
    greeting: "سلام! 👋 چطور می‌توانم کمکتان کنم؟",
    timeoutMs: 120000,
    primaryColor: "#6366f1",
    secondaryColor: "#8b5cf6",
    accentColor: "#a78bfa",
    headerBadge: "آنلاین",
    botAvatarText: "✦",
    inputPlaceholder: "پیام خود را بنویسید…",
    maxMessageLength: 4000,
    configTimeoutMs: 10000,
    themeMode: "gradient",
    darkMode: "auto",
    panelWidth: 400,
    panelHeight: 640,
    borderRadius: 16,
    mobileFullscreen: true,
    logoUrl: "",
    fontFamily: "'ASW Vazirmatn', 'Vazirmatn', Tahoma, system-ui, sans-serif",
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
    /* v4 — streaming, citations, lead capture, human handoff */
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
    /* v5 — engagement */
    showTeaser: true,
    teaserText: "معمولاً در کمتر از یک دقیقه پاسخ می‌دهیم.",
    /* v6 — product polish */
    enableVoiceInput: false, // Retained config key; the unavailable feature has no UI or runtime.
    fabLabel: "سوالی دارید؟ همین حالا بپرسید",
    supportPhone: "",
  }, THEME.defaults);

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
    wifiOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h.01"/><path d="M8.5 16.4a5 5 0 0 1 7 0"/><path d="M5 12.9a10 10 0 0 1 5.17-2.69"/><path d="M19 12.9a10 10 0 0 0-2.007-1.523"/><path d="M2 8.82a15 15 0 0 1 4.177-2.643"/><path d="M22 8.82a15 15 0 0 0-11.288-3.764"/><path d="m2 2 20 20"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>'
  };

  var THINKING_STATUSES = [
    "در حال نوشتن پاسخ…",
  ];

  /* ─────────────── CSS ─────────────── */
  var CSS = `
/* @asw-design */
  `;

  var FONT_CSS = /* @asw-font-css */ "";

  /* ─────────────── HELPERS ─────────────── */
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>\"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c];
    });
  }

  function formatTime() {
    return new Date().toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
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

  function booleanValue(value) {
    return value !== false && value !== "false" && value !== 0 && value !== "0";
  }

  var colorCanvas;
  function colorChannels(value, fallback) {
    try {
      if (!window.CSS || !window.CSS.supports("color", String(value)) || /^(?:var\(|currentcolor|inherit|initial|unset|revert)/i.test(String(value))) return fallback;
      colorCanvas = colorCanvas || document.createElement("canvas");
      colorCanvas.width = colorCanvas.height = 1;
      var ctx = colorCanvas.getContext("2d", { willReadFrequently: true });
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = String(value);
      ctx.fillRect(0, 0, 1, 1);
      var data = ctx.getImageData(0, 0, 1, 1).data;
      if (data[3] < 250) return fallback;
      return [data[0], data[1], data[2]];
    } catch (_) { return fallback; }
  }

  function luminance(rgb) {
    return rgb.map(function (v) {
      v /= 255;
      return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4);
    }).reduce(function (sum, v, i) { return sum + v * [.2126, .7152, .0722][i]; }, 0);
  }

  function contrast(a, b) {
    var x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
  }

  function legibleColor(rgb, background, ratio) {
    if (contrast(rgb, background) >= ratio) return rgb;
    var black = [15, 23, 42], white = [255, 255, 255];
    var target = contrast(black, background) > contrast(white, background) ? black : white;
    for (var i = 1; i <= 100; i++) {
      var next = rgb.map(function (v, c) { return Math.round(v + (target[c] - v) * i / 100); });
      if (contrast(next, background) >= ratio) return next;
    }
    return target;
  }

  function rgbCss(rgb) { return "rgb(" + rgb.join(", ") + ")"; }

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
      .replace(/(^|[^*])\*(?!\*)(.+?)\*(?!\*)/g, "$1<em>$2</em>")
      .replace(/(^|[^_])_(?!_)(.+?)_(?!_)/g, "$1<em>$2</em>")
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
      if (window._aiWidget && !window._aiWidget._destroyed && document.getElementById("ai-support-widget-host")) return window._aiWidget;
      var provided = {};
      Object.keys(options || {}).forEach(function (key) {
        if (["__proto__", "constructor", "prototype"].indexOf(key) === -1 && options[key] !== undefined && options[key] !== null) provided[key] = options[key];
      });
      this.options = Object.assign({}, DEFAULTS, provided);
      this.explicitOptions = provided;
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
      this._composing = false;
      this._initializing = true;
      this._requestId = 0;
      this._cleanups = [];
      this._uid = 0;
      this.mount();
      this.ready = this.initialize();
    }

    /* ─── Mount ─── */
    mount() {
      if (document.getElementById("ai-support-widget-host")) return;

      this.host = document.createElement("div");
      this.host.id = "ai-support-widget-host";
      this.host.style.cssText = "all:initial;position:fixed;z-index:2147483647;width:0;height:0;";
      document.body.appendChild(this.host);
      if (!document.getElementById("asw-font-face")) {
        var fonts = document.createElement("style");
        fonts.id = "asw-font-face";
        fonts.textContent = FONT_CSS;
        if (scriptElement && scriptElement.nonce) fonts.nonce = scriptElement.nonce;
        document.head.appendChild(fonts);
      }
      this.shadow = this.host.attachShadow({ mode: "open" });

      var style = document.createElement("style");
      style.textContent = CSS;
      if (scriptElement && scriptElement.nonce) style.nonce = scriptElement.nonce;
      this.shadow.appendChild(style);

      var root = document.createElement("div");
      root.className = "asw asw-root";
      root.setAttribute("data-bubble", this.options.bubbleStyle);
      root.setAttribute("data-font", this.options.fontSize);
      root.setAttribute("data-ui-state", "init");
      root.setAttribute("data-theme", THEME.name);
      this.applyThemeVars(root);

      var fabIconHtml = this.getFabIconHtml();
      var o = this.options;

      root.innerHTML =
        /* Identity gets its own measure; utilities never compete with the copy. */
        '<section class="asw-panel" id="asw-panel" role="dialog" aria-modal="false" aria-labelledby="asw-title" aria-describedby="asw-subtitle" aria-hidden="true" inert>' +
          '<header class="asw-header">' +
            '<div class="asw-heading">' +
              '<div class="asw-avatar-wrap" aria-hidden="true">' +
                '<div class="asw-avatar" id="asw-avatar"></div><span class="asw-status"></span>' +
              '</div>' +
              '<div class="asw-info">' +
                '<div class="asw-title-row"><h2 class="asw-title" id="asw-title" dir="auto"></h2></div>' +
                '<p class="asw-subtitle" id="asw-subtitle" dir="auto"></p>' +
              '</div>' +
            '</div>' +
            '<button class="asw-header-btn asw-close" id="asw-close" type="button" aria-label="بستن گفتگو" title="بستن گفتگو">' + ICONS.close + '</button>' +
            '<div class="asw-header-tools">' +
              '<div class="asw-presence-line"><span class="asw-badge" id="asw-badge"><span class="asw-badge-dot" aria-hidden="true"></span><span id="asw-badge-text"></span></span></div>' +
              '<div class="asw-actions" role="group" aria-label="ابزارهای گفتگو">' +
                '<button class="asw-header-btn" id="asw-clear-history" type="button" aria-label="شروع گفتگوی جدید" title="شروع گفتگوی جدید">' + ICONS.refresh + '<span class="asw-action-label">گفتگوی جدید</span></button>' +
                '<button class="asw-header-btn" id="asw-contact" type="button" aria-label="راه‌های ارتباط با پشتیبانی" title="راه‌های ارتباط با پشتیبانی">' + ICONS.headset + '</button>' +
                '<button class="asw-header-btn" id="asw-theme-toggle" type="button" aria-label="فعال کردن حالت تاریک" title="فعال کردن حالت تاریک" aria-pressed="false"></button>' +
              '</div>' +
            '</div>' +
          '</header>' +
          /* Service notice (waiting for an operator, locked, unavailable) */
          '<div class="asw-banner" id="asw-banner" hidden role="status"></div>' +
          /* Offline banner */
          '<div class="asw-netstatus" id="asw-netstatus" hidden role="status">' + ICONS.wifiOff + '<span>اتصال اینترنت قطع است — پاسخ‌ها ارسال نمی‌شوند</span></div>' +
          /* Messages */
          '<div class="asw-messages" id="asw-messages" role="log" aria-label="پیام‌های گفتگو" aria-live="polite" aria-relevant="additions text"></div>' +
          /* Typing */
          '<div class="asw-typing" id="asw-typing" hidden aria-hidden="true">' +
            '<div class="asw-typing-bubble"><span class="asw-typing-dot"></span><span class="asw-typing-dot"></span><span class="asw-typing-dot"></span></div>' +
            '<span class="asw-typing-label" id="asw-typing-label">' + THINKING_STATUSES[0] + '</span>' +
          '</div>' +
          /* Suggestions */
          '<div class="asw-suggestions" id="asw-suggestions"></div>' +
          /* Footer */
          '<footer class="asw-footer">' +
            '<button class="asw-scrollbtn" id="asw-scrollbtn" type="button" aria-label="رفتن به آخرین پیام" hidden tabindex="-1">' + ICONS.chevronDown + '</button>' +
            '<div class="asw-input-wrap" id="asw-input-wrap">' +
              '<textarea class="asw-input" id="asw-input" dir="auto" rows="1" autocomplete="off" enterkeyhint="send" maxlength="' + clamp(o.maxMessageLength, 200, 20000) + '" placeholder="' + escapeHtml(o.inputPlaceholder) + '" aria-label="متن پیام" aria-describedby="asw-input-hint asw-input-count"></textarea>' +
              '<button class="asw-send" id="asw-send" type="button" aria-label="ارسال پیام" disabled>' + ICONS.arrowUp + '</button>' +
            '</div>' +
            '<div class="asw-composer-meta"><span id="asw-input-hint">Enter برای ارسال · Shift + Enter برای خط جدید</span><span id="asw-input-count" hidden></span></div>' +
            '<div class="asw-foot-meta">' +
              '<div class="asw-disclaim">پاسخ‌های این دستیار از دانش همین سایت ساخته می‌شوند و ممکن است ناقص باشند.</div>' +
              '<div class="asw-powered" id="asw-powered"><span id="asw-credit">توسعهٔ <a href="https://ai-support.ir" target="_blank" rel="noopener noreferrer">AI Support</a></span><span class="asw-resource-links" id="asw-resources"></span></div>' +
            '</div>' +
          '</footer>' +
          /* Contact bottom-sheet */
          '<div class="asw-sheet" id="asw-sheet" hidden aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="asw-sheet-title" tabindex="-1">' +
            '<div class="asw-sheet-card">' +
              '<button class="asw-sheet-close" id="asw-sheet-close" type="button" aria-label="بستن">' + ICONS.close + '</button>' +
              '<div class="asw-sheet-grip" aria-hidden="true"></div>' +
              '<h3 class="asw-sheet-title" id="asw-sheet-title">' + escapeHtml(o.leadFormTitle) + '</h3>' +
              '<div class="asw-sheet-desc">' + escapeHtml(o.leadFormDescription) + '</div>' +
              '<div class="asw-chans" id="asw-chans"></div>' +
              '<div id="asw-sheet-form"></div>' +
            '</div>' +
          '</div>' +
          '<div class="asw-confirm" id="asw-confirm" role="alertdialog" aria-modal="true" aria-labelledby="asw-confirm-title" aria-describedby="asw-confirm-desc" tabindex="-1" hidden>' +
            '<div class="asw-confirm-card"><h3 id="asw-confirm-title">گفتگوی جدید شروع شود؟</h3>' +
              '<p id="asw-confirm-desc">گفتگوی فعلی و پیش‌نویس پاک می‌شوند. این کار قابل بازگشت نیست.</p>' +
              '<div class="asw-confirm-actions"><button type="button" id="asw-confirm-cancel">ادامهٔ گفتگو</button>' +
              '<button type="button" id="asw-confirm-reset" class="asw-danger">شروع گفتگوی جدید</button></div>' +
            '</div>' +
          '</div>' +
          /* Toast */
          '<div class="asw-toast" id="asw-toast" role="status"></div>' +
        '</section>' +
        /* FAB */
        '<button class="asw-fab" id="asw-fab" type="button" aria-label="باز کردن گفتگو" aria-controls="asw-panel" aria-expanded="false">' +
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
      this.footer = root.querySelector(".asw-footer");
      this.inputHint = root.querySelector("#asw-input-hint");
      this.inputCount = root.querySelector("#asw-input-count");
      this.confirm = root.querySelector("#asw-confirm");
      this.clearBtn = root.querySelector("#asw-clear-history");
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
      this.autoGrowInput();
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
      if (window.AISupportUI) window.AISupportUI.install(this);
      this.addHero(this.options.greeting);
      try {
        await this.loadConfig();
        if (this._destroyed) return;
        this.sendEvent("widget_loaded");
        this.restoreConversation();
        var restored = this.conversationId ? false : this.restoreLocalHistory();
        if (!restored) await this.restoreHistory();
        if (this._destroyed) return;
        if (this.messageCount === 0) this.addHero(this.options.greeting);
        if (window.matchMedia) {
          var mq = window.matchMedia("(prefers-color-scheme: dark)");
          var onScheme = () => { if (this.options.darkMode === "auto") this.applyTheme(); };
          if (mq.addEventListener) this._listen(mq, "change", onScheme);
          else if (mq.addListener) { mq.addListener(onScheme); this._cleanups.push(function () { mq.removeListener(onScheme); }); }
        }
        if (this.previewMode) this.bindPreviewChannel();
        if (this.options.liveHandoffEnabled && !this.previewMode && window.AISupportLive) window.AISupportLive.install(this);
        this._maybeShowTeaser();
      } finally {
        this._initializing = false;
        if (!this._destroyed) {
          this.updateSendState();
          this.ui.sync();
          if (!this.messages.querySelector(".asw-hero")) this.scrollToBottom(false, true);
        }
      }
    }

    /* ─── Light conversation memory (localStorage, 7 days, no DB pressure) ─── */
    _localKey() { return "asw_history_" + (location.hostname || "local"); }
    restoreLocalHistory() {
      if (this.previewMode) return false;
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
          self.addMessage(m.content, m.role === "user" ? "user" : "bot", false, {
            citations: m.citations || [],
            skipFeedback: m.role !== "assistant",
            noAnim: true,
            timestamp: m.t,
            sender: m.sender,
          });
        });
        this._chatStarted = true;
        this.syncSuggestions();
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
      if (this.previewMode || this._destroyed) return;
      try {
        var items = [];
        this.messages.querySelectorAll(".asw-row").forEach(function (row) {
          var bubble = row.querySelector(".asw-bubble");
          if (!bubble) return;
          var isUser = row.classList.contains("user");
          items.push({
            role: isUser ? "user" : "assistant",
            sender: row.dataset.sender || (isUser ? "user" : "ai"),
            content: (row._messageContent || bubble.textContent).slice(0, 8000),
            citations: row._citations || [],
            t: row._timestamp || Date.now(),
          });
        });
        if (items.length > 22) items = items.slice(-22);
        localStorage.setItem(this._localKey(), JSON.stringify({ ts: Date.now(), items: items }));
      } catch (_) {}
    }

    clearLocalHistory() {
      if (this.previewMode) return;
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
      if (this.previewMode) return;
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
          this._later(function () { self._setBlocked(true); }, 0);
        }
      } catch (_) {}
    }

    saveConversation() {
      if (this.previewMode || this._destroyed) return;
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

    _persistBlocked() {
      if (this.previewMode) return;
      try { sessionStorage.setItem("asw_blocked", "1"); } catch (_) {}
    }

    async restoreHistory() {
      /* Restore server-side history when the conversation already exists. */
      if (!this.conversationId || !this.conversationToken) return;
      if (this.messageCount > 1) return;
      var generation = this._requestId;
      var controller = new AbortController();
      this._historyController = controller;
      var timer = setTimeout(function () { controller.abort(); }, this.options.configTimeoutMs);
      try {
        var url = this.options.historyEndpoint + "?conversation_id=" + encodeURIComponent(this.conversationId);
        var res = await fetch(url, { method: "GET", mode: "cors", credentials: "omit", headers: this.getHeaders(), signal: controller.signal });
        if (!res.ok) return;
        var data = await res.json();
        if (this._destroyed || generation !== this._requestId) return;
        var msgs = Array.isArray(data.messages) ? data.messages : [];
        // Re-attach human mode after a refresh + seed the stream cursor.
        if (window.AISupportLive) window.AISupportLive.queueRestore(this, data.live_handoff, msgs);
        // Server is authoritative: lock when guard_blocked OR quota_locked; unlock otherwise.
        var isLocked = data.guard_blocked || data.quota_locked;
        var lockMsg  = data.quota_locked ? (data.quota_message || undefined) : undefined;
        if (isLocked) this._setBlocked(true, lockMsg);
        else this._clearBlocked();
        if (!msgs.length) return;
        this.messages.innerHTML = "";
        this.messageCount = 0;
        this._chatStarted = true;
        this.syncSuggestions();
        msgs.forEach((m) => {
          this.addMessage(m.content, m.role === "assistant" ? "bot" : "user", false, {
            citations: m.role === "assistant" ? (m.citations || []) : [],
            skipFeedback: true,
            timestamp: m.created_at || m.timestamp,
            sender: m.sender,
          });
        });
        if (window.AISupportLive) window.AISupportLive.decorateHistory(this, msgs);
        if (isLocked) this._setBlocked(true, lockMsg);
        else this._clearBlocked();
      } catch (_) {} finally { clearTimeout(timer); this._historyController = null; }
    }

    /* ─── Live preview channel (admin customizer) ─── */
    bindPreviewChannel() {
      this._listen(window, "message", (e) => {
        if (e.source !== parent || e.origin !== window.location.origin) return;
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
        "teaserText", "fabLabel", "supportPhone", "supportEmail", "faqUrl", "privacyUrl"];
      strKeys.forEach(function (k) {
        if (cfg[k] !== undefined && cfg[k] !== null) self.options[k] = String(cfg[k]);
      });
      ["panelWidth", "panelHeight", "borderRadius", "positionVerticalOffset", "positionHorizontalOffset", "maxMessageLength"].forEach(function (k) {
        var v = Number(cfg[k]);
        if (cfg[k] !== undefined && cfg[k] !== null && Number.isFinite(v)) self.options[k] = v;
      });
      ["mobileFullscreen", "showPoweredBy", "showTimestamp", "showAvatar", "showFeedback",
        "enableSounds", "enableAnimations", "showCitations", "enableLeadCapture", "enableHandoff",
        "showTeaser", "enableVoiceInput"].forEach(function (k) {
        if (cfg[k] !== undefined && cfg[k] !== null) self.options[k] = booleanValue(cfg[k]);
      });
      if (cfg.handoffUrls && typeof cfg.handoffUrls === "object") self.options.handoffUrls = cfg.handoffUrls;
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
      this.refreshHero();
      this.updateSendState();
      if (this.ui) this.ui.sync();
    }

    async loadConfig() {
      if (!this.options.configEndpoint) return;
      /* Presence handshake bookkeeping, read by the shared UI shell: until an
       * HTTP reply proves the backend is reachable the session is "unknown"
       * (neutral dot), never a green one. */
      this._configPending = true;
      this._configReady = undefined;
      if (this.ui) this.ui.sync();
      var controller = new AbortController();
      this._configController = controller;
      var timer = setTimeout(function () { controller.abort(); }, this.options.configTimeoutMs);
      try {
        var res = await fetch(this.options.configEndpoint, { method: "GET", mode: "cors", credentials: "omit", headers: this.getHeaders(), signal: controller.signal });
        if (this._destroyed) return;
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
          enableStreaming: "enable_streaming", maxMessageLength: "max_message_length",
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
        if (window.AISupportLive) window.AISupportLive.applyConfig(this, raw.live_handoff || { enabled: this.options.liveHandoffEnabled, sla_minutes: this.options.liveHandoffSlaMinutes });
        var self = this;
        Object.keys(map).forEach(function (key) {
          var apiVal = raw[map[key]];
          if (apiVal !== undefined && apiVal !== null && !Object.prototype.hasOwnProperty.call(self.explicitOptions, key)) {
            self.options[key] = apiVal;
          }
        });
        if (raw.guard_blocked || raw.quota_locked) this._setBlocked(true, raw.quota_message);
        this.titleEl.textContent = this.options.title;
        this.badgeText.textContent = this.options.headerBadge;
        this.subtitleEl.textContent = this.options.subtitle;
        this.applyVisuals();
        this.renderSuggestions();
        this.renderResources();
        this.renderChannels();
        this.refreshHero();
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
      } finally {
        clearTimeout(timer);
        this._configController = null;
        if (!this._destroyed && this.ui) this.ui.sync();
      }
    }

    /* ─── Theme variables, adaptive colours and viewport geometry ─── */
    applyThemeVars(el) {
      var o = this.options, root = el || this.root;
      ["primary", "secondary", "accent"].forEach(function (key) {
        var option = key + "Color";
        root.style.removeProperty("--asw-" + key);
        if (o[option] !== THEME.defaults[option]) {
          root.style.setProperty("--asw-" + key, rgbCss(colorChannels(o[option], colorChannels(THEME.defaults[option], [99, 102, 241]))));
        }
      });
      root.style.setProperty("--asw-header-bg-cfg", this.getHeaderBg());
      root.style.setProperty("--asw-panel-w", clamp(o.panelWidth, 280, 520) + "px");
      root.style.setProperty("--asw-panel-h", clamp(o.panelHeight, 400, 800) + "px");
      root.style.setProperty("--asw-radius", clamp(o.borderRadius, 4, 40) + "px");
      root.style.setProperty("--asw-font", o.fontFamily || DEFAULTS.fontFamily);
      root.style.setProperty("--asw-font-display", o.fontFamily || DEFAULTS.fontFamily);
      root.style.setProperty("--asw-font-size", o.fontSize === "small" ? "12px" : o.fontSize === "large" ? "16px" : "14px");
      root.setAttribute("data-bubble", o.bubbleStyle || "rounded");
      root.setAttribute("data-font", o.fontSize || "normal");
      root.setAttribute("data-anim", o.enableAnimations === false ? "off" : "on");
    }

    getHeaderBg() {
      if (this.options.themeMode === "solid") return "var(--asw-primary)";
      return "linear-gradient(135deg,var(--asw-primary),var(--asw-secondary))";
    }

    applyTheme() {
      var isDark = !!detectDarkMode(this.options.darkMode);
      this.root.classList.toggle("dark", isDark);
      this.root.style.colorScheme = isDark ? "dark" : "light";
      this.applyThemeVars();
      this.applyHeaderContrast();
      if (this.themeToggle) {
        // Show the available action, not an ambiguous icon of the current state.
        this.themeToggle.innerHTML = isDark
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M5 19l1.4-1.4M17.6 6.4 19 5"/></svg>'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/></svg>';
        var label = isDark ? "فعال کردن حالت روشن" : "فعال کردن حالت تاریک";
        this.themeToggle.setAttribute("aria-label", label);
        this.themeToggle.title = label;
        this.themeToggle.setAttribute("aria-pressed", String(isDark));
      }
    }

    applyVisuals() {
      var o = this.options;
      var pos = /^(bottom|top)-(right|left)$/.test(o.position) ? o.position : "bottom-right";
      ["br", "bl", "tr", "tl"].forEach((corner) => this.root.classList.remove("corner-" + corner));
      this.root.classList.add("corner-" + (pos.charAt(0) + pos.split("-")[1].charAt(0)));
      this.root.classList.toggle("mobile-fullscreen", o.mobileFullscreen !== false);
      this.applyTheme();
      this.syncViewport();
      if (o.logoUrl && isSafeUrl(o.logoUrl) && /^https?:$/i.test(new URL(o.logoUrl, location.href).protocol)) {
        var img = document.createElement("img");
        img.src = o.logoUrl;
        img.alt = "";
        img.referrerPolicy = "no-referrer";
        this.avatarEl.replaceChildren(img);
      } else this.avatarEl.textContent = o.botAvatarText || "✦";
      this.titleEl.textContent = o.title;
      this.subtitleEl.textContent = o.subtitle;
      this.input.placeholder = o.inputPlaceholder;
      this.input.maxLength = clamp(o.maxMessageLength, 200, 20000);
      this.root.querySelector("#asw-credit").hidden = o.showPoweredBy === false;
      this.powered.hidden = o.showPoweredBy === false && !this.resources.children.length;
      this.messages.classList.toggle("asw-no-avatar", o.showAvatar === false);
      this.contactBtn.hidden = o.enableLeadCapture === false && !this.getContactChannels().length && !o.liveHandoffEnabled;
      if (this.ui) this.ui.sync();
      this.autoGrowInput();
    }

    applyHeaderContrast() {
      var root = this.root;
      ["text-muted", "text-secondary", "on-brand", "on-primary", "on-gradient"].forEach(function (key) { root.style.removeProperty("--asw-" + key); });
      var css = getComputedStyle(root);
      var bg = colorChannels(css.getPropertyValue("--asw-bg").trim(), [255, 255, 255]);
      var surfaces = ["surface", "surface-2", "surface-3"].map(function (key) { return colorChannels(css.getPropertyValue("--asw-" + key).trim(), bg); });
      var surface = surfaces.reduce(function (chosen, next) {
        return luminance(bg) < .2 ? (luminance(next) > luminance(chosen) ? next : chosen) : (luminance(next) < luminance(chosen) ? next : chosen);
      }, bg);
      var reference = luminance(bg) < .2 ? (luminance(surface) > luminance(bg) ? surface : bg) : (luminance(surface) < luminance(bg) ? surface : bg);
      var primary = legibleColor(colorChannels(css.getPropertyValue("--asw-primary").trim(), [99, 102, 241]), reference, 4.6);
      var white = [255, 255, 255], ink = [15, 23, 42];
      var onBrand = contrast(primary, white) >= contrast(primary, ink) ? white : ink;
      var secondary = legibleColor(colorChannels(css.getPropertyValue("--asw-secondary").trim(), primary), onBrand, 4.6);
      root.style.setProperty("--asw-primary", rgbCss(primary));
      root.style.setProperty("--asw-secondary", rgbCss(secondary));
      root.style.setProperty("--asw-on-brand", rgbCss(onBrand));
      root.style.setProperty("--asw-on-primary", rgbCss(onBrand));
      root.style.setProperty("--asw-on-gradient", rgbCss(onBrand));
      ["text-muted", "text-secondary"].forEach(function (key) {
        var value = colorChannels(css.getPropertyValue("--asw-" + key).trim(), [100, 116, 139]);
        root.style.setProperty("--asw-" + key, rgbCss(legibleColor(value, reference, 4.6)));
      });
    }

    syncViewport() {
      if (!this.root || this._destroyed) return;
      var vv = window.visualViewport;
      var width = window.innerWidth;
      var height = vv ? vv.height : window.innerHeight;
      var v = clamp(this.options.positionVerticalOffset, 8, Math.max(8, Math.min(200, height - 64)));
      var h = clamp(this.options.positionHorizontalOffset, 8, Math.max(8, Math.min(200, width - 64)));
      var edge = Math.min(h, Math.max(8, (width - Math.min(clamp(this.options.panelWidth, 280, 520), width - 16)) / 2));
      var style = this.root.style;
      style.setProperty("--asw-viewport-h", height + "px");
      style.setProperty("--asw-viewport-y", (vv ? vv.offsetTop : 0) + "px");
      style.setProperty("--asw-offset-v", v + "px");
      style.setProperty("--asw-offset-h", h + "px");
      style.setProperty("--asw-panel-edge-x", edge + "px");
      style.setProperty("--asw-panel-available-h", Math.max(160, height - v - 76) + "px");
      var mobile = width <= 480 && this.options.mobileFullscreen !== false;
      this.panel.setAttribute("aria-modal", mobile ? "true" : "false");
      this._setPageScrollLocked(mobile && this.isOpen);
      var touch = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
      this.input.enterKeyHint = touch ? "enter" : "send";
      this.inputHint.textContent = touch ? "برای ارسال، دکمهٔ پیکان را لمس کنید" : "Enter برای ارسال · Shift + Enter برای خط جدید";
    }

    /* ─── Suggestions (chips strip + welcome cards) ─── */
    renderSuggestions() {
      var items = Array.isArray(this.options.suggestions) ? this.options.suggestions.filter(function (v) { return typeof v === "string" && v.trim(); }).slice(0, 6) : [];
      this._suggestionItems = items;
      this.suggestions.innerHTML = items.map(function (item) {
        return '<button class="asw-suggestion" type="button" data-msg="' + escapeHtml(item) + '"><span>' + escapeHtml(item) + "</span></button>";
      }).join("");
      this.syncSuggestions();
    }

    refreshHero() {
      var hero = this.messages && this.messages.querySelector(".asw-hero");
      if (hero && !this._chatStarted) { hero.remove(); this.messageCount = Math.max(0, this.messageCount - 1); this.addHero(this.options.greeting); }
    }

    syncSuggestions() {
      var heroExists = !!(this.messages && this.messages.querySelector(".asw-hero"));
      this.suggestions.hidden = !this._suggestionItems.length || heroExists || this._chatStarted;
      this._syncWelcomeDensity();
    }

    _syncWelcomeDensity() {
      if (!this.messages || this._destroyed) return;
      this.root.removeAttribute("data-welcome-density");
      this.root.removeAttribute("data-welcome-tight");
      var hero = this.messages.querySelector(".asw-hero");
      if (!hero) return;
      // Fit the welcome to the actual remaining space, not a device guess.
      // Long customer headers stay intact; constrained panels use compact cards.
      var css = getComputedStyle(this.messages);
      var padding = parseFloat(css.paddingTop) + parseFloat(css.paddingBottom);
      if (hero.scrollHeight + padding > this.messages.clientHeight + 1) {
        this.root.setAttribute("data-welcome-density", "compact");
        if (hero.scrollHeight + 24 > this.messages.clientHeight + 1) this.root.setAttribute("data-welcome-tight", "");
      }
      this._updateScrollBtn();
    }

    /* ─── Resource Links ─── */
    renderResources() {
      if (!this.resources) return;
      this.resources.textContent = "";
      var links = [];
      var o = this.options;
      if (o.faqUrl && isSafeUrl(o.faqUrl)) links.push({ label: "راهنما", url: o.faqUrl });
      if (o.privacyUrl && isSafeUrl(o.privacyUrl)) links.push({ label: "حریم خصوصی", url: o.privacyUrl });
      if (o.supportEmail) links.push({ label: "ایمیل", url: "mailto:" + o.supportEmail });
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
      this.powered.hidden = o.showPoweredBy === false && !links.length;
    }

    /* ─── Contact channel cards (sheet) ─── */
    getContactChannels() {
      var o = this.options;
      var chans = [];
      if (o.supportPhone) {
        chans.push({ key: "phone", label: "تماس تلفنی", cap: o.supportPhone, url: "tel:" + o.supportPhone, tint: "#10b981", icon: ICONS.phone });
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
      chans.forEach(function (ch) {
        var a = document.createElement("a");
        a.className = "asw-chan";
        if (ch.tint) a.style.setProperty("--chan", ch.tint);
        a.href = ch.url;
        if (ch.url.indexOf("http") === 0) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
        a.innerHTML = '<span class="asw-chan-ic" aria-hidden="true">' + ch.icon + '</span>' +
          '<span class="asw-chan-tx"><b>' + escapeHtml(ch.label) + '</b><i dir="auto">' + escapeHtml(ch.cap) + '</i></span>';
        a.addEventListener("click", function () { self.logHandoff(ch.key, self._lastUserMessage || ""); });
        self.chansEl.appendChild(a);
      });
      if (this.options.liveHandoffEnabled) {
        var live = document.createElement("button");
        live.type = "button";
        live.className = "asw-chan";
        live.dataset.liveContact = "true";
        live.innerHTML = '<span class="asw-chan-ic" aria-hidden="true">' + ICONS.headset + '</span><span class="asw-chan-tx"><b>گفتگو با کارشناس</b><i>ادامهٔ گفتگو در همین پنجره</i></span>';
        live.addEventListener("click", function () {
          if (self._blocked || live.disabled) return;
          if (!self.conversationId || !self.conversationToken) { self.closeSheet(); self._focus(self.input); self.showToast("برای اتصال به کارشناس، ابتدا یک پیام در گفتگو ارسال کنید."); return; }
          if (self.live && self.live.isActive()) { self.closeSheet(); self._focus(self.input); return; }
          if (!self.live && window.AISupportLive) window.AISupportLive.install(self);
          if (!self.live) return;
          live.disabled = true;
          live.dataset.pending = "true";
          self.updateSendState();
          self.live.request(self._lastUserMessage || "").then(function (ok) { delete live.dataset.pending; self.updateSendState(); if (ok) self.closeSheet(); });
        });
        this.chansEl.prepend(live);
      }
      this.chansEl.hidden = this.chansEl.children.length === 0;
      this.updateSendState();
    }

    /* ─── Events and focus lifecycle ─── */
    _listen(target, name, handler, options) {
      target.addEventListener(name, handler, options);
      this._cleanups.push(function () { target.removeEventListener(name, handler, options); });
    }

    bindEvents() {
      var self = this;
      // Remote logos and custom launch icons fail gracefully, never a broken image.
      this._listen(this.shadow, "error", function (event) {
        var image = event.target;
        if (!image || image.tagName !== "IMG" || !image.parentNode) return;
        var container = image.parentNode;
        if (image.classList.contains("asw-fab-custom-icon")) container.innerHTML = FAB_ICONS["chat-bubble"];
        else if (container.classList.contains("asw-hero-orb")) container.innerHTML = ICONS.sparkles;
        else if (container.classList.contains("asw-avatar") || container.classList.contains("asw-msg-avatar")) container.textContent = self.options.botAvatarText || "✦";
      }, true);
      this._listen(this.fab, "click", function () { self.toggle(); });
      this._listen(this.closeBtn, "click", function () { self.close(); });
      this._listen(this.themeToggle, "click", function () {
        self.options.darkMode = self.root.classList.contains("dark") ? "light" : "dark";
        self.applyTheme();
      });
      this._listen(this.input, "compositionstart", function () { self._composing = true; });
      this._listen(this.input, "compositionend", function () { self._composing = false; self.autoGrowInput(); self.updateSendState(); });
      this._listen(this.input, "input", function () { self.autoGrowInput(); self.updateSendState(); });
      this._listen(this.input, "keydown", function (e) {
        if (e.key !== "Enter" || e.shiftKey || e.isComposing || self._composing || e.keyCode === 229) return;
        // Touch keyboards keep Enter for newlines. IME confirmation never sends.
        var touch = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
        if (touch && !e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        if (!self.isLoading) self.send();
      });
      this._listen(this.sendBtn, "click", function () { self.isLoading ? self.stopResponse() : self.send(); });
      this._listen(this.contactBtn, "click", function () { self.openSheet(); });
      this._listen(this.sheetClose, "click", function () { self.closeSheet(); });
      this._listen(this.sheet, "click", function (e) { if (e.target === self.sheet) self.closeSheet(); });
      this._listen(this.clearBtn, "click", function () { self.requestNewConversation(); });
      this._listen(this.confirm.querySelector("#asw-confirm-cancel"), "click", function () { self.closeConfirm(); });
      this._listen(this.confirm.querySelector("#asw-confirm-reset"), "click", function () { self.closeConfirm(); self.newConversation(); });
      this._listen(this.shadow, "click", function (e) {
        var chip = e.target.closest("[data-msg]");
        if (chip && !chip.disabled) self.sendText(chip.dataset.msg);
        var copyBtn = e.target.closest(".asw-code-copy");
        if (copyBtn) {
          var code = self.shadow.getElementById(copyBtn.dataset.codeId);
          if (code) self.copyText(code.textContent).then(function (ok) {
            if (!ok) return;
            copyBtn.classList.add("copied");
            copyBtn.querySelector("span").textContent = "کپی شد";
            self._later(function () { if (copyBtn.isConnected) { copyBtn.classList.remove("copied"); copyBtn.querySelector("span").textContent = "کپی"; } }, 2000);
          });
        }
        var fbBtn = e.target.closest(".asw-fb-btn");
        if (fbBtn && !fbBtn.disabled) self.handleFeedback(fbBtn);
      });
      this._listen(this.teaser, "click", function () { self.open(); });
      this._listen(this.teaser, "keydown", function (e) {
        if (e.target !== self.teaser) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); self.open(); }
      });
      this._listen(this.teaserClose, "click", function (e) { e.stopPropagation(); self._dismissTeaser(true); });
      this._listen(this.messages, "scroll", function () { self._updateScrollBtn(); }, { passive: true });
      this._listen(this.scrollBtn, "click", function () { self.scrollToBottom(true); });
      function updateNet() {
        self.netstatus.hidden = navigator.onLine !== false;
        self.updateSendState();
        if (self.ui) self.ui.sync();
      }
      this._listen(window, "online", function () { updateNet(); if (self.isOpen) self.showToast("اتصال اینترنت برقرار شد.", 2200); });
      this._listen(window, "offline", updateNet);
      updateNet();
      this._listen(document, "visibilitychange", function () { if (!document.hidden) self._stopTitleFlash(); });
      this._listen(this.shadow, "keydown", function (e) { self._handleDialogKey(e); });
      var resize = function () { self.syncViewport(); self.autoGrowInput(); };
      this._listen(window, "resize", resize, { passive: true });
      if (window.visualViewport) {
        this._listen(window.visualViewport, "resize", resize, { passive: true });
        this._listen(window.visualViewport, "scroll", resize, { passive: true });
      }
      if (window.ResizeObserver) {
        this._composerObserver = new ResizeObserver(function (entries) {
          entries.forEach(function (entry) {
            if (entry.target === self.footer) self.root.style.setProperty("--asw-footer-h", self.footer.getBoundingClientRect().height + "px");
            if (entry.target === self.inputWrap && entry.contentRect.width !== self._composerWidth) {
              self._composerWidth = entry.contentRect.width;
              self.autoGrowInput();
            }
          });
        });
        this._composerObserver.observe(this.inputWrap);
        this._composerObserver.observe(this.footer);
        this._welcomeObserver = new ResizeObserver(function () { self._syncWelcomeDensity(); });
        this._welcomeObserver.observe(this.messages, { box: "border-box" });
      }
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { self._syncWelcomeDensity(); });
    }

    _later(callback, delay) {
      this._timers = this._timers || new Set();
      var self = this;
      var timer = setTimeout(function () { self._timers.delete(timer); if (!self._destroyed) callback(); }, delay);
      this._timers.add(timer);
      return timer;
    }

    _focus(el) { if (el && !this._destroyed) try { el.focus({ preventScroll: true }); } catch (_) { el.focus(); } }

    _handleDialogKey(e) {
      if (e.isComposing || e.keyCode === 229 || this._composing) return;
      if (e.key === "Escape") {
        e.preventDefault(); e.stopPropagation();
        if (!this.confirm.hidden) this.closeConfirm();
        else if (this.sheetOpen) this.closeSheet();
        else this.close();
        return;
      }
      if (e.key !== "Tab") return;
      var scope = !this.confirm.hidden ? this.confirm : this.sheetOpen ? this.sheet : this.panel.getAttribute("aria-modal") === "true" ? this.panel : null;
      if (!scope) return;
      var focusable = Array.from(scope.querySelectorAll('button:not(:disabled),a[href],textarea:not(:disabled),input:not(:disabled),[tabindex="0"]')).filter(function (el) {
        return !el.closest('[inert],[hidden]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
      });
      if (!focusable.length) { e.preventDefault(); this._focus(scope); return; }
      var first = focusable[0], last = focusable[focusable.length - 1], active = this.shadow.activeElement;
      if (e.shiftKey && (active === first || !scope.contains(active))) { e.preventDefault(); this._focus(last); }
      else if (!e.shiftKey && (active === last || !scope.contains(active))) { e.preventDefault(); this._focus(first); }
    }

    _setOverlayInert(value) {
      Array.from(this.panel.children).forEach(function (el) {
        if (!el.classList.contains("asw-sheet") && !el.classList.contains("asw-confirm") && !el.classList.contains("asw-toast")) el.inert = value;
      });
    }

    _setPageScrollLocked(lock) {
      if (lock && !this._pageScroll) {
        this._pageScroll = [document.documentElement.style.overflow, document.body.style.overflow];
        document.documentElement.style.overflow = document.body.style.overflow = "hidden";
      } else if (!lock && this._pageScroll) {
        document.documentElement.style.overflow = this._pageScroll[0];
        document.body.style.overflow = this._pageScroll[1];
        this._pageScroll = null;
      }
    }

    requestNewConversation() {
      if (!this._chatStarted && !this.input.value.trim() && !this.isLoading) { this.newConversation(); return; }
      this.confirm.hidden = false;
      this._setOverlayInert(true);
      this._focus(this.confirm.querySelector("#asw-confirm-cancel"));
    }

    closeConfirm() {
      this.confirm.hidden = true;
      this._setOverlayInert(false);
      if (this.isOpen) this._focus(this.clearBtn);
    }

    newConversation() {
      this._requestId++;
      if (this.abortStream) this.abortStream.abort();
      this.abortStream = null;
      if (this._historyController) this._historyController.abort();
      if (this.live && this.live.reset) this.live.reset();
      if (this._formControllers) this._formControllers.forEach(function (controller) { controller.abort(); });
      this.clearLocalHistory();
      if (!this.previewMode) try { sessionStorage.removeItem("asw_conversation_id"); sessionStorage.removeItem("asw_conversation_token"); } catch (_) {}
      this.conversationId = this.conversationToken = "";
      this._lastUserMessage = "";
      this._chatStarted = this._handoffShown = false;
      this.messages.replaceChildren();
      this.messageCount = 0;
      this.input.value = "";
      this.sheetFormEl.replaceChildren();
      this._stick = true;
      this.setLoading(false);
      this.autoGrowInput();
      this.addHero(this.options.greeting);
      this.renderSuggestions();
      this.showToast("گفتگوی جدید شروع شد.", 2200);
      if (this.isOpen && !this._blocked) this._focus(this.input);
    }

    /* ─── Contact bottom-sheet ─── */
    openSheet() {
      if (!this.isOpen || !this.sheet || this.contactBtn.hidden) return;
      if (!this.sheetFormEl.children.length || this.sheetFormEl.querySelector(".asw-form-success")) {
        this.sheetFormEl.replaceChildren();
        if (this.options.enableLeadCapture !== false) this.sheetFormEl.appendChild(this.buildContactForm("widget_form", { onDone: () => this.closeSheet() }));
      }
      clearTimeout(this._sheetTimer);
      this._sheetReturnFocus = this.shadow.activeElement;
      this.sheet.hidden = false;
      this.sheet.setAttribute("aria-hidden", "false");
      this.sheet.classList.add("open");
      this.sheetOpen = true;
      this.updateSendState();
      this._setOverlayInert(true);
      this._focus(this.sheetClose);
    }

    closeSheet() {
      if (!this.sheetOpen) return;
      this.sheetOpen = false;
      this.sheet.classList.remove("open");
      this.sheet.setAttribute("aria-hidden", "true");
      this.sheet.hidden = true;
      this._setOverlayInert(false);
      if (this.isOpen) this._focus(this._sheetReturnFocus || this.contactBtn);
    }

    /* ─── Professional contact form (shared: sheet + inline handoff) ─── */
    buildContactForm(source, opts) {
      opts = opts || {};
      var self = this;
      var uid = "f" + (++this._uid) + source;
      var wrap = document.createElement("form");
      wrap.noValidate = true;
      wrap.className = "asw-form" + (opts.compact ? " asw-leadform" : "");
      wrap.innerHTML =
        (opts.compact ? '<div class="asw-leadform-title">' + escapeHtml(this.options.leadFormTitle) + '</div>' +
          '<div class="asw-leadform-desc">' + escapeHtml(this.options.leadFormDescription) + '</div>' : "") +
        '<div class="asw-field" id="' + uid + '-nf">' +
          '<label class="asw-flabel" for="' + uid + '-name">نام و نام خانوادگی <b>*</b></label>' +
          '<input type="text" id="' + uid + '-name" name="name" placeholder="مثلاً: سارا محمدی" maxlength="200" autocomplete="name" required aria-required="true">' +
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
        '<button type="submit" class="asw-form-submit">' +
          '<span class="asw-spinner" hidden></span>' + ICONS.send + '<span class="asw-btn-txt">ثبت درخواست تماس</span>' +
        '</button>' +
        '<div class="asw-form-err" role="alert"></div>' +
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
      [[nameField, nameInput], [emailField, emailInput], [phoneField, phoneInput]].forEach(function (pair) {
        var error = pair[0].querySelector(".asw-ferr");
        error.id = pair[1].id + "-error";
        pair[1].setAttribute("aria-describedby", error.id);
        pair[1].setAttribute("aria-invalid", "false");
      });
      function normalizedPhone(value) {
        return String(value).replace(/[۰-۹٠-٩]/g, function (digit) {
          var code = digit.charCodeAt(0);
          return String(code >= 1776 ? code - 1776 : code - 1632);
        });
      }

      function setFieldState(field, input, state) {
        field.classList.remove("invalid", "ok");
        if (state) field.classList.add(state);
        input.setAttribute("aria-invalid", state === "invalid" ? "true" : "false");
      }

      function validate() {
        var ok = true;
        var name = nameInput.value.trim();
        var email = emailInput.value.trim();
        var phone = normalizedPhone(phoneInput.value.trim());
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

      wrap.addEventListener("submit", function (event) {
        event.preventDefault();
        if (submitBtn.disabled) return;
        if (!validate()) { self._focus(wrap.querySelector('[aria-invalid="true"]')); return; }
        if (navigator.onLine === false) { globalErr.textContent = "اتصال اینترنت را بررسی کنید؛ اطلاعات فرم حفظ شده است."; globalErr.classList.add("show"); return; }
        var generation = self._requestId;
        var controller = new AbortController();
        self._formControllers = self._formControllers || new Set();
        self._formControllers.add(controller);
        var timeout = setTimeout(function () { controller.abort(); }, 30000);

        var spinner = submitBtn.querySelector(".asw-spinner");
        var icon = submitBtn.querySelector("svg");
        var txt = submitBtn.querySelector(".asw-btn-txt");
        submitBtn.disabled = true;
        wrap.setAttribute("aria-busy", "true");
        wrap.querySelectorAll("input,textarea").forEach(function (input) { input.disabled = true; });
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
            phone: normalizedPhone(phoneInput.value.trim()),
            note: (noteInput.value || "").substring(0, 2000),
            conversation_id: self.conversationId,
            conversation_token: self.conversationToken,
            website: honeypot ? honeypot.value : "",
          }),
          signal: controller.signal,
        }).then(async function (res) {
          var data = await res.json();
          if (!res.ok) throw new Error(data.message || "ثبت اطلاعات ناموفق بود. لطفاً دوباره تلاش کنید.");
          return data;
        })
          .then(function (data) {
            if (self._destroyed || generation !== self._requestId || !wrap.isConnected) return;
            if (data && data.ok !== false) {
              wrap.innerHTML =
                '<div class="asw-form-success">' +
                  '<svg class="asw-checkmark" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M15 27l7.5 7.5L37 20"/></svg>' +
                  '<div class="asw-fs-title">درخواست شما با موفقیت ثبت شد</div>' +
                  '<div class="asw-fs-desc">کارشناسان ما در اسرع وقت با شما تماس می‌گیرند. زمان پاسخ‌گویی معمولاً کمتر از یک روز کاری است.</div>' +
                  (opts.onDone ? '<button type="button" class="asw-fs-close">متوجه شدم</button>' : '') +
                '</div>';
              self.showToast("درخواست تماس شما ثبت شد. ✓", 3000);
              if (opts.onDone) { var done = wrap.querySelector(".asw-fs-close"); done.addEventListener("click", opts.onDone); self._focus(done); }
              else self._focus(wrap);
            } else {
              fail((data && data.message) || "ثبت اطلاعات ناموفق بود. لطفاً دوباره تلاش کنید.");
            }
          })
          .catch(function (error) {
            if (self._destroyed || generation !== self._requestId || !wrap.isConnected) return;
            fail(error.name === "AbortError" ? "ارسال طول کشید؛ لطفاً دوباره تلاش کنید." : ["SyntaxError", "TypeError"].includes(error.name) ? "ارتباط با سرویس برقرار نشد؛ اطلاعات فرم شما حفظ شده است." : error.message || "خطای شبکه. لطفاً دوباره تلاش کنید.");
          }).finally(function () { clearTimeout(timeout); self._formControllers.delete(controller); wrap.setAttribute("aria-busy", "false"); });

        function fail(message) {
          globalErr.textContent = message;
          globalErr.classList.add("show");
          submitBtn.disabled = false;
          wrap.querySelectorAll("input,textarea").forEach(function (input) { input.disabled = false; });
          if (spinner) spinner.hidden = true;
          if (icon) icon.style.display = "";
          txt.textContent = "ثبت درخواست تماس";
        }
      });
      return wrap;
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
      this._later(function () { t.hidden = true; }, 320);
      if (permanent && !this.previewMode) { try { sessionStorage.setItem("asw_teaser_dismissed", "1"); } catch (_) {} }
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

    /* ─── Composer geometry and disclosure ─── */
    autoGrowInput() {
      var el = this.input;
      if (!el || !el.isConnected || this._destroyed) return;
      var css = getComputedStyle(el);
      var min = parseFloat(css.minHeight) || 44;
      var max = parseFloat(css.maxHeight) || 160;
      var scroll = el.scrollTop;
      el.style.height = "0px";
      var content = el.scrollHeight;
      el.style.height = Math.max(min, Math.min(content, max)) + "px";
      el.style.overflowY = content > max ? "auto" : "hidden";
      if (content > max) el.scrollTop = scroll;
    }

    open() {
      if (this._destroyed || this.isOpen) return;
      this.isOpen = true;
      this._unread = 0;
      this._stopTitleFlash();
      this.fabBadge.hidden = true;
      this._dismissTeaser(true);
      this.panel.inert = false;
      this.panel.classList.add("open");
      this.panel.setAttribute("aria-hidden", "false");
      this.fab.classList.add("active");
      this.fab.setAttribute("aria-expanded", "true");
      this.fab.setAttribute("aria-label", "بستن گفتگو");
      this.syncViewport();
      this.autoGrowInput();
      this._focus(this._blocked ? this.closeBtn : this.input);
      this._updateScrollBtn();
      this.sendEvent("widget_opened");
    }

    close() {
      if (this._destroyed || !this.isOpen) return;
      if (this.sheetOpen) this.closeSheet();
      if (!this.confirm.hidden) this.closeConfirm();
      this.isOpen = false;
      this.panel.classList.remove("open");
      this.panel.setAttribute("aria-hidden", "true");
      this.panel.inert = true;
      this.fab.classList.remove("active");
      this.fab.setAttribute("aria-expanded", "false");
      this.fab.setAttribute("aria-label", "باز کردن گفتگو");
      this._setPageScrollLocked(false);
      this._focus(this.fab);
    }

    toggle() { this.isOpen ? this.close() : this.open(); }

    updateSendState() {
      if (!this.sendBtn) return;
      var length = this.input.value.length;
      var limit = clamp(this.options.maxMessageLength, 200, 20000);
      this.input.disabled = !!this._blocked;
      this.sendBtn.disabled = this.isLoading ? !this.abortStream : !!this._blocked || !!this._initializing || navigator.onLine === false || !this.input.value.trim() || length > limit;
      this.inputCount.hidden = length < limit * .8;
      this.inputCount.textContent = length.toLocaleString("fa-IR") + " / " + limit.toLocaleString("fa-IR");
      this.inputCount.classList.toggle("asw-limit", length > limit);
      this.root.setAttribute("data-composer", this._blocked ? "locked" : this.isLoading ? "responding" : length ? "draft" : "empty");
      this.root.querySelectorAll("button[data-msg],.asw-retry").forEach((button) => { button.disabled = this.isLoading || !!this._blocked || !!this._initializing || navigator.onLine === false; });
      this.root.querySelectorAll("[data-live-contact],.asw-live-cta").forEach((button) => {
        var active = !!(this.live && this.live.isActive());
        button.disabled = this.isLoading || !!this._blocked || !!this._initializing || navigator.onLine === false || !!button.dataset.pending || !this.options.liveHandoffEnabled || (button.classList.contains("asw-live-cta") && active);
        var caption = button.querySelector("i");
        if (caption) caption.textContent = this._blocked ? "پشتیبانی انسانی اکنون در دسترس نیست" : navigator.onLine === false ? "برای اتصال، اینترنت را بررسی کنید" : this.isLoading ? "پس از پایان پاسخ می‌توانید متصل شوید" : button.dataset.pending ? "در حال ثبت درخواست…" : active ? "بازگشت به گفتگوی کارشناس" : this.conversationId && this.conversationToken ? "ادامهٔ گفتگو در همین پنجره" : "ابتدا یک پیام در گفتگو ارسال کنید";
      });
    }

    scrollToBottom(force, instant) {
      if (!force && this._stick === false) return;
      if (force) this._stick = true;
      var m = this.messages;
      var dist = m.scrollHeight - m.scrollTop - m.clientHeight;
      /* A long jump (history restore, re-attaching after refresh) reads as a
         glitch when animated, so only animate the short distances produced by
         streaming and new messages. */
      var reduced = this.options.enableAnimations === false || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      var behaviour = instant || reduced || dist > m.clientHeight * 1.5 ? "auto" : "smooth";
      m.scrollTo({ top: m.scrollHeight, behavior: behaviour });
    }

    _updateScrollBtn() {
      if (!this.scrollBtn) return;
      var m = this.messages;
      var dist = m.scrollHeight - m.scrollTop - m.clientHeight;
      var welcome = !this._chatStarted && !!this.messages.querySelector(".asw-hero");
      var threshold = welcome ? 24 : 160;
      this.scrollBtn.setAttribute("aria-label", welcome ? "دیدن پرسش‌های دیگر" : "رفتن به آخرین پیام");
      this.scrollBtn.title = welcome ? "پرسش‌های بیشتر" : "آخرین پیام";
      this.scrollBtn.hidden = dist <= threshold;
      this.scrollBtn.classList.toggle("show", dist > threshold);
      this.scrollBtn.tabIndex = dist > threshold ? 0 : -1;
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
      var orbContent = (this.options.logoUrl && isSafeUrl(this.options.logoUrl) && /^https?:$/i.test(new URL(this.options.logoUrl, location.href).protocol))
        ? '<img src="' + escapeHtml(this.options.logoUrl) + '" alt="" referrerpolicy="no-referrer">'
        : ICONS.sparkles;
      var cards = "";
      var items = (this._suggestionItems || []).slice(0, 4);
      if (items.length) {
        cards = '<div class="asw-hero-grid">' + items.map(function (item, index) {
          return '<button class="asw-suggestion" type="button" data-msg="' + escapeHtml(item) + '">' +
            '<span class="asw-idx" aria-hidden="true">' + String(index + 1).padStart(2, "0") + '</span><span class="asw-prompt-text">' + escapeHtml(item) + "</span>" +
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
      this.updateSendState();
      this.syncSuggestions();
      this._updateScrollBtn();
      this.messages.scrollTop = 0;
      return { row: el, col: el, bubble: el.querySelector(".asw-hero-text"), feedback: null, timeEl: null };
    }

    collapseHero() {
      var hero = this.messages.querySelector(".asw-hero");
      if (!hero) return;
      hero.remove();
      this.messageCount = Math.max(0, this.messageCount - 1);
      this.root.removeAttribute("data-welcome-density");
      this.root.removeAttribute("data-welcome-tight");
    }

    /* ─── Add Message ─── */
    addMessage(text, sender, isGreeting, opts) {
      opts = opts || {};
      if (isGreeting && sender === "bot") return this.addHero(text);

      var prev = this.messages.lastElementChild;
      var isCont = !!(prev && prev.classList && prev.classList.contains("asw-row") && prev.classList.contains(sender));
      var row = document.createElement("div");
      row._messageContent = String(text || "");
      row._citations = opts.citations || [];
      row._timestamp = opts.timestamp ? new Date(opts.timestamp).getTime() : Date.now();
      row.dataset.sender = opts.sender || (sender === "user" ? "user" : "ai");
      row.className = "asw-row " + sender + (isCont ? " asw-cont" : "") + (opts.noAnim ? " no-anim" : "");

      // Only the newest answer shows its action toolbar by default.
      var oldLast = this.messages.querySelector(".asw-row.asw-last");
      if (sender === "bot") {
        if (oldLast) oldLast.classList.remove("asw-last");
        row.classList.add("asw-last");
      }

      // Avatar
      if (this.options.showAvatar !== false && sender === "bot") {
        var avatar = document.createElement("div");
        avatar.className = "asw-msg-avatar";
        if (sender === "bot") {
          if (this.options.logoUrl && isSafeUrl(this.options.logoUrl) && /^https?:$/i.test(new URL(this.options.logoUrl, location.href).protocol)) {
            var img = document.createElement("img");
            img.src = this.options.logoUrl;
            img.alt = "";
            img.referrerPolicy = "no-referrer";
            avatar.appendChild(img);
          } else {
            avatar.textContent = this.options.botAvatarText || "✦";
          }
        } else {
          /* No avatar on user rows: identity is already the right-side position.
           * Keeps the transcript calm (support-inbox pattern). */
          avatar.textContent = "شما";
        }
        row.appendChild(avatar);
      }

      var col = document.createElement("div");
      col.className = "asw-col";

      var bubble = document.createElement("div");
      bubble.dir = "auto";
      bubble.className = "asw-bubble" + (opts.streaming ? " streaming" : "") + (opts.isError ? " asw-error-bubble" : "");
      bubble.innerHTML = sender === "bot" ? renderMarkdown(text) : escapeHtml(text);

      col.appendChild(bubble);

      // Retry button on error bubbles
      if (opts.isError && opts.retry !== false && this._lastUserMessage) {
        var selfR = this;
        var retryMsg = opts.retryMessage || this._lastUserMessage;
        var retry = document.createElement("button");
        retry.className = "asw-retry";
        retry.type = "button";
        retry.innerHTML = ICONS.refresh + "<span>تلاش دوباره</span>";
        retry.addEventListener("click", function () {
          if (selfR.sendText(retryMsg) && row.parentNode) { row.remove(); selfR.messageCount = Math.max(0, selfR.messageCount - 1); }
        });
        col.appendChild(retry);
      }

      // Citations
      if (sender === "bot" && this.options.showCitations && Array.isArray(opts.citations) && opts.citations.length) {
        col.appendChild(this.buildCitations(opts.citations));
      }


      var timeEl = null;
      if (this.options.showTimestamp !== false && !opts.streaming) {
        timeEl = document.createElement("div");
        timeEl.className = "asw-time";
        timeEl.textContent = new Date(row._timestamp).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
        col.appendChild(timeEl);
      }

      // Feedback: created for every bot answer; appended immediately unless
      // streaming (handleAnswerResultFromEl attaches it after the stream ends).
      var feedback = null;
      var wantFb = sender === "bot" && !isGreeting && this.options.showFeedback !== false;
      if (wantFb) {
        feedback = this.buildFeedbackEl(text);
        if (!opts.skipFeedback && !opts.isError && !opts.streaming) col.appendChild(feedback);
      }

      row.appendChild(col);
      this.messages.appendChild(row);
      this.messageCount++;

      // Unread badge while panel is closed
      if (sender === "bot" && !isGreeting && !opts.streaming && !opts.skipUnread && !this.isOpen) this._markUnread();

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

    /* ─── Clipboard: feature detection and a keyboard-safe fallback. ─── */
    async copyText(text) {
      var active = this.shadow.activeElement;
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          try { await navigator.clipboard.writeText(text); return true; } catch (_) {}
        }
        var input = document.createElement("textarea");
        input.value = text;
        input.setAttribute("aria-hidden", "true");
        input.tabIndex = -1;
        input.style.cssText = "position:fixed;top:0;left:-9999px;width:1px;height:1px;opacity:0;font-size:16px";
        this.shadow.appendChild(input);
        input.select();
        var ok = document.execCommand("copy");
        input.remove();
        if (active) this._focus(active);
        if (!ok) throw new Error("Clipboard unavailable");
        return true;
      } catch (_) {
        this.showToast("کپی خودکار ممکن نیست؛ متن را انتخاب و کپی کنید.");
        return false;
      }
    }

    /* ─── Feedback remains repeatable for copy and retryable on network error. ─── */
    handleFeedback(btn) {
      var group = btn.closest(".asw-feedback");
      if (!group) return;
      if (btn.dataset.action === "copy") {
        var row = btn.closest(".asw-row");
        this.copyText(row ? row._messageContent || "" : "").then((ok) => {
          if (!ok || this._destroyed) return;
          btn.classList.add("copied");
          btn.innerHTML = ICONS.check;
          this._later(function () { if (btn.isConnected) { btn.classList.remove("copied"); btn.innerHTML = ICONS.copy; } }, 1600);
        });
        return;
      }
      if (group.dataset.sent) return;
      var helpful = btn.dataset.action === "helpful";
      group.dataset.sent = "pending";
      group.querySelectorAll(".asw-fb-btn:not(.fb-copy)").forEach(function (item) { item.disabled = true; });
      btn.classList.add("active");
      btn.setAttribute("aria-pressed", "true");
      btn.innerHTML = helpful ? ICONS.thumbUpFilled : ICONS.thumbDownFilled;
      Promise.resolve(this.sendFeedback(helpful, group.dataset.question || "", group.dataset.answer || "", group.dataset.messageId || null)).then((ok) => {
        if (this._destroyed || !group.isConnected) return;
        if (ok !== false) { group.dataset.sent = "true"; this.showToast("از بازخورد شما ممنونیم.", 1800); return; }
        delete group.dataset.sent;
        group.querySelectorAll(".asw-fb-btn:not(.fb-copy)").forEach(function (item) {
          item.disabled = false;
          item.classList.remove("active");
          item.setAttribute("aria-pressed", "false");
          item.innerHTML = item.dataset.action === "helpful" ? ICONS.thumbUp : ICONS.thumbDown;
        });
        this.showToast("بازخورد ثبت نشد. لطفاً دوباره تلاش کنید.");
      });
    }

    async sendFeedback(helpful, question, answerPreview, messageId) {
      if (!this.options.feedbackEndpoint) return true;
      var body = { helpful: helpful, question: question, answer_preview: answerPreview, session_id: this.options.sessionId };
      if (messageId) {
        body.message_id = Number(messageId);
        body.conversation_id = this.conversationId;
        body.conversation_token = this.conversationToken;
      }
      var controller = new AbortController();
      this._auxControllers = this._auxControllers || new Set();
      this._auxControllers.add(controller);
      var timeout = setTimeout(function () { controller.abort(); }, 15000);
      try {
        var response = await fetch(this.options.feedbackEndpoint, { method: "POST", mode: "cors", credentials: "omit", headers: this.getHeaders(), body: JSON.stringify(body), signal: controller.signal });
        if (!response.ok) return false;
        var result = await response.json().catch(function () { return {}; });
        return result.ok !== false;
      } catch (_) { return false; }
      finally { clearTimeout(timeout); this._auxControllers.delete(controller); }
    }

    /* ─── Events ─── */
    sendEvent(type, meta) {
      if (!this.options.eventsEndpoint || this._destroyed || this.previewMode) return;
      var self = this, controller = new AbortController();
      this._auxControllers = this._auxControllers || new Set();
      this._auxControllers.add(controller);
      var timeout = setTimeout(function () { controller.abort(); }, 8000);
      fetch(this.options.eventsEndpoint, {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        headers: this.getHeaders(),
        body: JSON.stringify({ event_type: type, metadata: meta || {} }),
        signal: controller.signal,
      }).catch(function () {}).finally(function () { clearTimeout(timeout); self._auxControllers.delete(controller); });
    }

    /* ─── Loading preserves the draft; the same primary control cancels work. ─── */
    setLoading(loading) {
      this.isLoading = !!loading;
      this.typing.hidden = !loading;
      this.sendBtn.classList.toggle("asw-stop", !!loading);
      this.sendBtn.innerHTML = loading ? ICONS.stop : ICONS.arrowUp;
      this.sendBtn.setAttribute("aria-label", loading ? "توقف پاسخ" : "ارسال پیام");
      this.sendBtn.title = loading ? "توقف پاسخ" : "ارسال پیام";
      if (this.ui) this.ui.sync();
      this.updateSendState();
    }

    stopResponse() {
      if (!this.isLoading || !this.abortStream) return;
      this._requestStopped = true;
      this.abortStream.abort();
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

    /* ─── Sending never clears an unaccepted draft. ─── */
    send() {
      var message = this.input.value.trim();
      if (!this.sendText(message)) return false;
      this.input.value = "";
      this.autoGrowInput();
      this.updateSendState();
      this._focus(this.input);
      return true;
    }

    sendText(message) {
      var msg = typeof message === "string" ? message.trim() : "";
      if (!msg || this.isLoading || this._initializing || this._destroyed) return false;
      if (this._blocked) { this.showToast(this._blockedMessage || "ارسال پیام در حال حاضر ممکن نیست."); return false; }
      if (navigator.onLine === false) { this.showToast("اتصال اینترنت قطع است؛ پیش‌نویس شما حفظ شده است."); return false; }
      if (msg.length > clamp(this.options.maxMessageLength, 200, 20000)) { this.showToast("پیام طولانی است؛ لطفاً آن را کوتاه‌تر کنید."); return false; }
      var id = ++this._requestId;
      var controller = new AbortController();
      this.abortStream = controller;
      this._requestStopped = this._requestTimedOut = false;
      this._lastUserMessage = msg;
      this._chatStarted = true;
      this.collapseHero();
      this.addMessage(msg, "user");
      this.syncSuggestions();
      this.setLoading(true);
      this.playSound("send");
      this.scrollToBottom(true, true);
      this._performSend(msg, id, controller);
      return true;
    }

    async _performSend(msg, id, controller) {
      var current = () => !this._destroyed && id === this._requestId;
      var timer = setTimeout(() => { if (current()) { this._requestTimedOut = true; controller.abort(); } }, Number(this.options.timeoutMs) || 120000);
      try {
        if (this.options.enableStreaming && !this.previewMode) await this.streamChat(msg, controller, id);
        else {
          var result = await this.callBackend(msg, controller, id);
          if (!current() || this._requestStopped) return;
          this.handleAnswerResult(result.answer, result);
        }
        if (current() && !this._requestStopped) this.playSound("receive");
      } catch (err) {
        if (!current()) return;
        if (this._requestStopped) { this.showToast("پاسخ‌دهی متوقف شد.", 2200); return; }
        if (err && (err.guardBlocked || err.guardRefused)) return;
        this.sendEvent("fallback_triggered", { message: err && err.message || "unknown" });
        var error = this._requestTimedOut ? "پاسخ‌دهی طول کشید. لطفاً دوباره تلاش کنید." : err && err.userMessage || "پاسخ دریافت نشد. لطفاً دوباره تلاش کنید.";
        this.addMessage(error, "bot", false, { isError: true, skipFeedback: true, retry: true, retryMessage: msg });
        this.showToast(error, 4500);
      } finally {
        clearTimeout(timer);
        if (current()) {
          this.abortStream = null;
          this.setLoading(false);
          // No focus jump here: visitors may be reading, in a sheet, or on the host page.
          this.autoGrowInput();
        }
      }
    }

    _setBlocked(blocked, message) {
      this._blocked = !!blocked;
      this._blockedMessage = blocked ? message || "" : "";
      if (blocked) this._persistBlocked();
      else if (!this.previewMode) try { sessionStorage.removeItem("asw_blocked"); } catch (_) {}
      this.updateSendState();
      if (this.ui) this.ui.sync();
    }

    _clearBlocked() {
      this._setBlocked(false);
    }

    handleAnswerResult(answer, meta) {
      meta = meta || {};
      var els = this.addMessage(answer, "bot", false, {
        citations: meta.citations || [],
        skipFeedback: !!meta.guard_blocked || !!meta.quota_locked,
      });
      if (els.feedback && meta.message_id) {
        els.feedback.setAttribute("data-message-id", String(meta.message_id));
      }
      if (meta.guard_blocked || meta.quota_locked) {
        this._setBlocked(true, meta.quota_locked ? (meta.quota_message || undefined) : undefined);
        this.showToast(answer, 5000);
      }
      if (Array.isArray(meta.rule_actions) && meta.rule_actions.length) {
        this.applyRuleActions(meta.rule_actions, answer);
      } else if (meta.fallback || meta.human_requested) {
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
        if (type === "suggest_link" && payload && isSafeUrl(payload)) {
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

    /* ─── SSE: frame-safe parsing, atomic completion and genuine cancellation. ─── */
    async streamChat(message, controller, requestId) {
      var self = this, els = null, reader = null;
      var content = "", metadata = null, frame = 0, completed = false;
      var current = function () { return !self._destroyed && requestId === self._requestId; };
      function assertCurrent() {
        if (!current() || controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
      }
      function paint() {
        frame = 0;
        if (!current() || completed || !els) return;
        els.bubble.innerHTML = renderMarkdown(content);
        self.scrollToBottom();
      }
      function receive(raw) {
        if (metadata !== null || !raw.trim()) return;
        var name = "message", lines = [];
        raw.split("\n").forEach(function (line) {
          if (line.indexOf("event:") === 0) name = line.slice(6).trim();
          if (line.indexOf("data:") === 0) lines.push(line.slice(5).trimStart());
        });
        if (!lines.length) return;
        var data;
        try { data = JSON.parse(lines.join("\n")); } catch (_) { return; }
        assertCurrent();
        if (name === "meta") {
          if (data.conversation_id) self.conversationId = data.conversation_id;
          if (data.conversation_token) self.conversationToken = data.conversation_token;
          self.saveConversation();
        } else if (name === "token" && typeof data.t === "string") {
          content += data.t;
          if (!els && content) {
            els = self.addMessage("", "bot", false, { streaming: true, skipFeedback: true });
            self.typing.hidden = true;
          }
          if (!frame) frame = requestAnimationFrame(paint);
        } else if (name === "done") {
          metadata = data;
        } else if (name === "error") {
          var error = new Error(data.message || "Stream failed");
          error.userMessage = data.message || "خطا در دریافت پاسخ.";
          throw error;
        }
      }
      try {
        var response = await fetch(this.options.streamEndpoint, {
          method: "POST", mode: "cors", credentials: "omit", headers: this.getHeaders(),
          body: JSON.stringify({ message: message, conversation_id: this.conversationId,
            conversation_token: this.conversationToken, page_url: (location.href || "").substring(0, 1000) }),
          signal: controller.signal
        });
        assertCurrent();
        // Explicitly unsupported stream endpoints may safely use the JSON API.
        if ([404, 405, 501].indexOf(response.status) !== -1 || (response.ok && (!response.body || !response.body.getReader))) {
          var fallback = await this.callBackend(message, controller, requestId);
          assertCurrent();
          this.handleAnswerResult(fallback.answer, fallback);
          return;
        }
        if (!response.ok || /application\/json/i.test(response.headers.get("Content-Type") || "")) {
          var payload = await response.json().catch(function () { return {}; });
          var result = this._normalizeResponse(response, payload, requestId);
          assertCurrent();
          this.handleAnswerResult(result.answer, result);
          return;
        }
        reader = response.body.getReader();
        var decoder = new TextDecoder();
        var buffer = "";
        while (metadata === null) {
          assertCurrent();
          var chunk = await reader.read();
          assertCurrent();
          buffer += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
          // CRLF can be split across chunks. Normalize only after accumulation.
          buffer = buffer.replace(/\r\n/g, "\n");
          var boundary;
          while (metadata === null && (boundary = buffer.indexOf("\n\n")) !== -1) {
            var raw = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            receive(raw);
          }
          if (chunk.done) {
            if (buffer.trim()) receive(buffer);
            break;
          }
        }
        assertCurrent();
        if (metadata === null) {
          var interrupted = new Error("Incomplete stream");
          interrupted.userMessage = "ارتباط هنگام دریافت پاسخ قطع شد. لطفاً دوباره تلاش کنید.";
          throw interrupted;
        }
        completed = true;
        if (frame) { cancelAnimationFrame(frame); frame = 0; }
        if (metadata.conversation_id) this.conversationId = metadata.conversation_id;
        if (metadata.conversation_token) this.conversationToken = metadata.conversation_token;
        this.saveConversation();
        if (typeof metadata.answer === "string") content = metadata.answer;
        if (metadata.live_agent) {
          if (els) this.handleAnswerResultFromEl(els, content, metadata);
          else this.handleAnswerResult(content, metadata);
        } else {
          if (!content.trim()) content = metadata.message || metadata.quota_message || "";
          if (!content.trim()) throw new Error("Empty answer");
          if (els) this.handleAnswerResultFromEl(els, content, metadata);
          else this.handleAnswerResult(content, metadata);
        }
        this._configUnreachable = false;
        this._configReady = true;
      } catch (error) {
        if (frame) { cancelAnimationFrame(frame); frame = 0; }
        if (els && current()) {
          els.bubble.classList.remove("streaming");
          if (content.trim()) this.handleAnswerResultFromEl(els, content, { interrupted: true });
          else { els.row.remove(); this.messageCount = Math.max(0, this.messageCount - 1); }
        }
        throw error;
      } finally {
        if (frame) cancelAnimationFrame(frame);
        if (reader) { try { await reader.cancel(); } catch (_) {} }
      }
    }

    handleAnswerResultFromEl(els, answer, meta) {
      meta = meta || {};
      els.bubble.classList.remove("streaming");
      els.row._messageContent = answer;
      els.row._citations = meta.citations || [];
      els.bubble.innerHTML = renderMarkdown(answer);
      if (this.options.showCitations && Array.isArray(meta.citations) && meta.citations.length) els.col.appendChild(this.buildCitations(meta.citations));
      if (!els.timeEl && this.options.showTimestamp !== false) {
        els.timeEl = document.createElement("div");
        els.timeEl.className = "asw-time";
        els.timeEl.textContent = formatTime();
        els.col.appendChild(els.timeEl);
      }
      if (meta.guard_blocked || meta.quota_locked) {
        this._setBlocked(true, meta.quota_message);
        if (els.feedback) els.feedback.hidden = true;
      } else if (meta.interrupted) {
        var note = document.createElement("div");
        note.className = "asw-stream-note";
        note.textContent = this._requestStopped ? "پاسخ‌دهی متوقف شد" : "پاسخ کامل دریافت نشد";
        els.col.appendChild(note);
      } else if (this.options.showFeedback !== false) {
        if (!els.feedback) els.feedback = this.buildFeedbackEl(answer);
        els.feedback.dataset.question = (this._lastUserMessage || "").substring(0, 200);
        els.feedback.dataset.answer = answer.substring(0, 300);
        if (meta.message_id) els.feedback.dataset.messageId = String(meta.message_id);
        els.col.appendChild(els.feedback);
      }
      if (Array.isArray(meta.rule_actions) && meta.rule_actions.length) this.applyRuleActions(meta.rule_actions, answer);
      else if (meta.fallback || meta.human_requested) this.maybeShowHandoff(answer);
      this.saveLocalHistory();
      if (!meta.interrupted && !this.isOpen) this._markUnread();
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
      // Live human support CTA is injected by the shared client
      // (static/widget/live-handoff.js) right after this bar is built.
      var anyChannel = true;
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
      lastRow.appendChild(bar);
      this.scrollToBottom();
      if (this.options.enableLeadCapture) {
        var contact = document.createElement("button");
        contact.type = "button";
        contact.className = "asw-handoff-btn";
        contact.textContent = "ثبت درخواست تماس";
        contact.addEventListener("click", function () { self.openSheet(); });
        bar.appendChild(contact);
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
      })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
    }

    /* ─── Live human handoff ───
       The request/stream/dedupe/lifecycle logic lives in the shared client
       (static/widget/live-handoff.js, embedded above in every bundle) so all
       eleven themes behave identically. `this.live` is that client. */

    /* ─── JSON fallback uses the same request identity and stop control. ─── */
    async callBackend(message, controller, requestId) {
      var ownsController = !controller;
      controller = controller || new AbortController();
      var timer = ownsController ? setTimeout(function () { controller.abort(); }, Number(this.options.timeoutMs) || 120000) : null;
      try {
        var response = await fetch(this.options.apiEndpoint, {
          method: "POST", mode: "cors", credentials: "omit", headers: this.getHeaders(),
          body: JSON.stringify({ message: message, conversation_id: this.conversationId,
            conversation_token: this.conversationToken, page_url: (location.href || "").substring(0, 1000) }),
          signal: controller.signal
        });
        var data = await response.json().catch(function () { return {}; });
        if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
        return this._normalizeResponse(response, data, requestId);
      } finally { if (timer) clearTimeout(timer); }
    }

    _normalizeResponse(response, data, requestId) {
      if (this._destroyed || (requestId !== undefined && requestId !== this._requestId)) throw new DOMException("Stale request", "AbortError");
      if (!response.ok && !(response.status === 403 && (data.guard_blocked || data.quota_locked || data.answer))) {
        var error = new Error(data.message || data.error || "Request failed");
        error.userMessage = response.status >= 500 ? "سرویس موقتاً در دسترس نیست. لطفاً دوباره تلاش کنید." : data.message || "لطفاً پیام خود را بررسی و دوباره ارسال کنید.";
        throw error;
      }
      var answer = data.answer || data.reply || data.response || data.message;
      if (data.live_agent && !answer) answer = data.delivery_note || "پیام شما برای کارشناس ارسال شد.";
      if (typeof answer !== "string" || !answer.trim()) throw new Error("Empty answer");
      if (data.conversation_id) {
        this.conversationId = data.conversation_id;
        this.conversationToken = data.conversation_token || this.conversationToken;
        this.saveConversation();
      }
      this._configUnreachable = false;
      this._configReady = true;
      return Object.assign({}, data, { answer: answer.trim(), citations: data.citations || [], rule_actions: data.rule_actions || [] });
    }

    destroy() {
      if (this._destroyed) return;
      this._setPageScrollLocked(false);
      this._stopTitleFlash();
      this._destroyed = true;
      this._requestId++;
      [this.abortStream, this._configController, this._historyController].forEach(function (controller) { if (controller) controller.abort(); });
      if (this.live) this.live.destroy();
      if (this._auxControllers) this._auxControllers.forEach(function (controller) { controller.abort(); });
      if (this._formControllers) this._formControllers.forEach(function (controller) { controller.abort(); });
      if (this.ui && this.ui.destroy) this.ui.destroy();
      if (this._composerObserver) this._composerObserver.disconnect();
      if (this._welcomeObserver) this._welcomeObserver.disconnect();
      this._cleanups.forEach(function (remove) { remove(); });
      this._cleanups = [];
      if (this._timers) this._timers.forEach(clearTimeout);
      [this._toastTimer, this._teaserTimer, this._sheetTimer].forEach(clearTimeout);
      if (this.host) this.host.remove();
      if (window._aiWidget === this) window._aiWidget = null;
    }

    /* ─── Headers ─── */
    getHeaders() {
      var h = { "Content-Type": "application/json" };
      if (this.options.widgetPublicKey) h["X-Widget-Key"] = this.options.widgetPublicKey;
      if (this.conversationToken) h["X-Conversation-Token"] = this.conversationToken;
      return h;
    }
  }

  AISupportWidget.version = "7.0.0";

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
