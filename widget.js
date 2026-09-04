/**
 * AI Support Widget v7.0 — Material Design 3 Edition
 * ─────────────────────────────────────────────────────────────────────────
 * UI layer rebuilt from scratch on Material Design 3 (Material You).
 * The API / backend / memory layer is intentionally unchanged.
 *
 * Material Design 3 system:
 *   · Full M3 color-role set (primary / secondary / tertiary, containers,
 *     on-* roles, outline, scrim, error) derived from the configurable seed
 *     color, with a matching dark scheme — no hard-coded brand gradients.
 *   · 5-step tonal surface hierarchy (surface-container lowest → highest)
 *     instead of glassmorphism; hierarchy is expressed by tone, not blur.
 *   · M3 elevation levels 1–5 (umbra + penumbra shadow pairs).
 *   · M3 shape scale (xs 4 · s 8 · m 12 · l 16 · xl 28 · full) applied to
 *     panel, bubbles, sheets, chips, cards and buttons.
 *   · State layers (hover 8% / focus 10% / pressed 12%) + touch ripples on
 *     every interactive surface.
 *   · Emphasized motion easing and M3 durations throughout.
 *
 * M3 components used:
 *   · Large FAB (primary container) that morphs to a tonal close affordance
 *   · Small top app bar, standard icon buttons, plain & rich tooltips
 *   · Filled / tonal / outlined / text buttons, assist & suggestion chips
 *   · Filled search-bar-style text field, outlined form fields with
 *     supporting text, modal bottom sheet with drag handle, snackbar,
 *     badges, filled cards, circular progress indicator
 *
 * Backend / API layer (unchanged contract):
 *   · JSON chat fallback + SSE streaming (meta/token/done/error)
 *   · Remote config, events, feedback, history, leads, handoff
 *   · Session (server token) + local (7-day) history persistence
 *   · postMessage live-preview channel for the admin customizer
 */
(function () {
  "use strict";

  if (window.AISupportWidget) return;

  var scriptElement = document.currentScript;
  var scriptConfig = scriptElement && scriptElement.dataset ? scriptElement.dataset : {};

  /* ─────────────── DEFAULTS ─────────────── */
  var DEFAULTS = {
    apiEndpoint: "/api/chat/",
    configEndpoint: "",
    eventsEndpoint: "",
    feedbackEndpoint: "",
    widgetPublicKey: "",
    title: "دستیار هوش مصنوعی",
    subtitle: "آنلاین • پاسخ فوری",
    greeting: "سلام! 👋 چطور می‌توانم کمکتان کنم؟",
    timeoutMs: 45000,
    primaryColor: "#6750a4",
    secondaryColor: "#625b71",
    accentColor: "#7d5260",
    headerBadge: "آنلاین",
    botAvatarText: "✦",
    inputPlaceholder: "پیام خود را بنویسید...",
    themeMode: "gradient",
    darkMode: "auto",
    panelWidth: 400,
    panelHeight: 640,
    borderRadius: 28,
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
    /* v4 — streaming, citations, lead capture, human handoff */
    enableStreaming: true,
    showCitations: true,
    enableLeadCapture: true,
    leadFormTitle: "تماس با کارشناسان ما",
    leadFormDescription: "راه دلخواه‌تان را انتخاب کنید یا فرم را پر کنید؛ در اسرع وقت پاسخ می‌دهیم.",
    enableHandoff: true,
    handoffTrigger: "low_confidence",
    handoffMessage: "پاسخ این سؤال در دانش دستیار نبود؛ یک کارشناس انسانی بررسی می‌کند.",
    handoffUrls: {},
    handoffLabel: "گفتگو با کارشناس",
    /* v5 — engagement */
    showTeaser: true,
    teaserText: "معمولاً در کمتر از یک دقیقه پاسخ می‌دهیم.",
    /* v6 — product polish */
    enableVoiceInput: true,
    fabLabel: "سوالی دارید؟ همین حالا بپرسید",
    supportPhone: "",
  };

  /* ─────────────── SVG ICONS ─────────────── */
  /* ─────────────── MATERIAL SYMBOLS (24dp, filled) ─────────────── */
  var FAB_ICONS = {
    "chat-bubble": '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 14h8v-2H6v2zm0-3h12V9H6v2zm0-3h12V6H6v2zM2 22V4q0-.825.588-1.412Q3.175 2 4 2h16q.825 0 1.413.588Q22 3.175 22 4v12q0 .825-.587 1.413Q20.825 18 20 18H6l-4 4z"/></svg>',
    "message-circle": '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.25 21.5q-.75 0-1.25-.5t-.5-1.25V4.25Q2.5 3.5 3 3t1.25-.5h15.5q.75 0 1.25.5t.5 1.25v11.5q0 .75-.5 1.25t-1.25.5H7l-2.75 2.75zM8 13.5h5.5V12H8zm0-3h8V9H8zm0-3h8V6H8z"/></svg>',
    "robot": '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a1.5 1.5 0 0 1 1.5 1.5A1.5 1.5 0 0 1 12.75 4.8V6H18a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3h5.25V4.8A1.5 1.5 0 0 1 12 2zM8.5 11a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5zm7 0a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5zM1 11h1.5v5H1a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1zm22 0a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1.5v-5z"/></svg>',
    "headset": '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a9 9 0 0 0-9 9v6a3 3 0 0 0 3 3h1.5a1.5 1.5 0 0 0 1.5-1.5v-4A1.5 1.5 0 0 0 7.5 13H5v-2a7 7 0 0 1 14 0v2h-2.5a1.5 1.5 0 0 0-1.5 1.5v4a1.5 1.5 0 0 0 1.5 1.5H18a3 3 0 0 0 3-3v-6a9 9 0 0 0-9-9z"/></svg>',
    "sparkle": '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z"/></svg>',
    "lightning": '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11 21H9.5l1-7H6.75q-.4 0-.6-.35t-.025-.7l5.5-9.6q.125-.2.338-.275T12.4 3q.25.075.375.288T12.85 3.8L11.9 10h3.85q.425 0 .613.4t-.088.75L11.7 21z"/></svg>',
  };

  var ICONS = {
    close: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5l5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6z"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 20V4l19 8zm2-3 11.85-5L5 7v3.5l6 1.5-6 1.5z"/></svg>',
    arrowUp: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11 20V7.825L5.4 13.4 4 12l8-8 8 8-1.4 1.4L13 7.825V20z"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 18q-.825 0-1.412-.587Q7 16.825 7 16V4q0-.825.588-1.413Q8.175 2 9 2h9q.825 0 1.413.587Q20 3.175 20 4v12q0 .825-.587 1.413Q18.825 18 18 18zm-4 4q-.825 0-1.412-.587Q3 20.825 3 20V6h2v14h11v2z"/></svg>',
    thumbUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M2 20h3V9H2zm18.9-9.4h-6.3l.95-4.55.03-.32a1.2 1.2 0 0 0-.35-.85L14.17 4 8.6 9.59a1.94 1.94 0 0 0-.6 1.41V19a2 2 0 0 0 2 2h8a2 2 0 0 0 1.84-1.22l3.02-7.05a2 2 0 0 0-1.96-2.13z"/></svg>',
    thumbDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M22 4h-3v11h3zM3.1 13.4h6.3l-.95 4.55-.03.32c0 .33.14.63.35.85L9.83 20l5.57-5.59c.37-.36.6-.86.6-1.41V5a2 2 0 0 0-2-2H6a2 2 0 0 0-1.84 1.22L1.14 11.27a2 2 0 0 0 1.96 2.13z"/></svg>',
    thumbUpFilled: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 20h3V9H2zm18.9-9.4h-6.3l.95-4.55.03-.32a1.2 1.2 0 0 0-.35-.85L14.17 4 8.6 9.59a1.94 1.94 0 0 0-.6 1.41V19a2 2 0 0 0 2 2h8a2 2 0 0 0 1.84-1.22l3.02-7.05a2 2 0 0 0-1.96-2.13z"/></svg>',
    thumbDownFilled: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 4h-3v11h3zM3.1 13.4h6.3l-.95 4.55-.03.32c0 .33.14.63.35.85L9.83 20l5.57-5.59c.37-.36.6-.86.6-1.41V5a2 2 0 0 0-2-2H6a2 2 0 0 0-1.84 1.22L1.14 11.27a2 2 0 0 0 1.96 2.13z"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11 17H7q-2.075 0-3.537-1.463Q2 14.075 2 12t1.463-3.538Q4.925 7 7 7h4v2H7q-1.25 0-2.125.875T4 12q0 1.25.875 2.125T7 15h4zm-3-4v-2h8v2zm5 4v-2h4q1.25 0 2.125-.875T20 12q0-1.25-.875-2.125T17 9h-4V7h4q2.075 0 3.538 1.462Q22 9.925 22 12q0 2.075-1.462 3.537Q19.075 17 17 17z"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.95 21q-3.125 0-6.175-1.362-3.05-1.363-5.55-3.863-2.5-2.5-3.863-5.55Q3 7.175 3 4.05q0-.45.3-.75t.75-.3H8.1q.35 0 .625.238.275.237.325.562l.65 3.5q.05.4-.025.675-.075.275-.275.475L6.975 10.9q1.05 1.8 2.638 3.375Q11.2 15.85 13.1 17.025l2.35-2.35q.2-.2.525-.3.325-.1.65-.05l3.45.7q.35.075.588.337.237.263.237.588v4.05q0 .45-.3.75t-.75.3z"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 20q-.825 0-1.412-.587Q2 18.825 2 18V6q0-.825.588-1.412Q3.175 4 4 4h16q.825 0 1.413.588Q22 5.175 22 6v12q0 .825-.587 1.413Q20.825 20 20 20zm8-7 8-5V6l-8 5-8-5v2z"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12q-1.65 0-2.825-1.175Q8 9.65 8 8q0-1.65 1.175-2.825Q10.35 4 12 4q1.65 0 2.825 1.175Q16 6.35 16 8q0 1.65-1.175 2.825Q13.65 12 12 12zm-8 8v-2.8q0-.85.438-1.563.437-.712 1.162-1.087 1.55-.775 3.15-1.163Q10.35 13 12 13t3.25.387q1.6.388 3.15 1.163.725.375 1.163 1.087Q20 16.35 20 17.2V20z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m9.55 18-5.7-5.7 1.425-1.425L9.55 15.15l9.175-9.175L20.15 7.4z"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18V6h12v12z"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20q-3.35 0-5.675-2.325Q4 15.35 4 12q0-3.35 2.325-5.675Q8.65 4 12 4q1.725 0 3.3.712Q16.875 5.425 18 6.75V4h2v7h-7V9h4.2q-.8-1.4-2.187-2.2Q13.625 6 12 6 9.5 6 7.75 7.75T6 12q0 2.5 1.75 4.25T12 18q1.925 0 3.475-1.1Q17.025 15.8 17.65 14h2.1q-.7 2.65-2.85 4.325Q14.75 20 12 20z"/></svg>',
    chevronDown: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 15.4-6-6L7.4 8l4.6 4.6L16.6 8 18 9.4z"/></svg>',
    chevronLeft: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 18 8 12l6-6 1.4 1.4L10.8 12l4.6 4.6z"/></svg>',
    sparkles: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9.5 3 11 7.5 15.5 9 11 10.5 9.5 15 8 10.5 3.5 9 8 7.5zm8 8 .95 2.8 2.8.95-2.8.95L17.5 18.5l-.95-2.8-2.8-.95 2.8-.95zM16 3l.7 2.05L18.75 5.75 16.7 6.45 16 8.5l-.7-2.05L13.25 5.75l2.05-.7z"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 14q-1.25 0-2.125-.875T9 11V5q0-1.25.875-2.125T12 2q1.25 0 2.125.875T15 5v6q0 1.25-.875 2.125T12 14zm-1 7v-3.075q-2.6-.35-4.3-2.325Q5 13.625 5 11h2q0 2.075 1.463 3.537Q9.925 16 12 16t3.538-1.463Q17 13.075 17 11h2q0 2.625-1.7 4.6-1.7 1.975-4.3 2.325V21z"/></svg>',
    wifiOff: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.8 22.6 16.15 19H16l-4 5-9-11.15q.575-.475 1.213-.9.637-.425 1.312-.775L1.4 4.2l1.4-1.4 18.4 18.4zM12 24l-.7-.875L12 24l.7-.875zm7.85-8.6-2.9-2.9q1.075.3 2.025.788.95.487 1.775 1.162zM22.6 12.15q-1.775-1.5-4.075-2.325T13.7 9l-2.9-2.9q.3-.025.6-.038Q11.7 6.05 12 6.05q3.35 0 6.288 1.113Q21.225 8.275 23.6 10.2z"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11 17h2v-6h-2zm1-8q.425 0 .713-.288Q13 8.425 13 8t-.287-.713Q12.425 7 12 7t-.712.287Q11 7.575 11 8t.288.712Q11.575 9 12 9zm0 13q-2.075 0-3.9-.788-1.825-.787-3.175-2.137-1.35-1.35-2.137-3.175Q2 14.075 2 12t.788-3.9q.787-1.825 2.137-3.175 1.35-1.35 3.175-2.138Q9.925 2 12 2t3.9.787q1.825.788 3.175 2.138 1.35 1.35 2.138 3.175Q22 9.925 22 12t-.787 3.9q-.788 1.825-2.138 3.175-1.35 1.35-3.175 2.137Q14.075 22 12 22z"/></svg>',
  };

  var THINKING_STATUSES = [
    "در حال تحلیل سؤال شما…",
    "جستجو در منابع دانش…",
    "مرتب‌سازی اطلاعات پیدا شده…",
    "نوشتن پاسخ…",
  ];

  /* ─────────────── CSS ─────────────── */
  var CSS = `
    /* ═══════════════════════════════════════════════════════════════════
       AI Support Widget — Material Design 3 (Material You) UI layer
       Rebuilt from scratch: MD3 color roles, tonal surfaces, elevation
       levels, shape scale, state layers, ripples, typography scale and
       emphasized motion easing. Class hooks & JS contract unchanged.
       ═══════════════════════════════════════════════════════════════════ */

    @import url('https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css');

    :host{all:initial;--asw-font:'Vazirmatn','Roboto','Segoe UI',ui-sans-serif,system-ui,sans-serif}
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    .asw{font-family:var(--asw-font);font-size:var(--asw-font-size,14px);direction:rtl;line-height:1.7;color:var(--asw-text);-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}

    /* ─── M3 tokens — light scheme ───
       Roles derived from the configurable primary/secondary seed colors. */
    .asw{
      --asw-primary:#6750a4;--asw-secondary:#625b71;--asw-accent:#7d5260;

      /* Tonal palette generated from the seed at runtime via color-mix */
      --m3-primary:var(--asw-primary);
      --m3-on-primary:#fff;
      --m3-primary-container:color-mix(in srgb,var(--asw-primary) 18%,#fff);
      --m3-on-primary-container:color-mix(in srgb,var(--asw-primary) 82%,#000);
      --m3-secondary:var(--asw-secondary);
      --m3-secondary-container:color-mix(in srgb,var(--asw-secondary) 16%,#fff);
      --m3-on-secondary-container:color-mix(in srgb,var(--asw-secondary) 80%,#000);
      --m3-tertiary:var(--asw-accent);
      --m3-tertiary-container:color-mix(in srgb,var(--asw-accent) 18%,#fff);

      --m3-surface:#fef7ff;
      --m3-surface-dim:#ded8e1;
      --m3-surface-bright:#fef7ff;
      /* 5 surface container tones — the backbone of M3 hierarchy */
      --m3-surface-c-lowest:#ffffff;
      --m3-surface-c-low:color-mix(in srgb,var(--asw-primary) 4%,#fff);
      --m3-surface-c:color-mix(in srgb,var(--asw-primary) 7%,#fff);
      --m3-surface-c-high:color-mix(in srgb,var(--asw-primary) 10%,#fff);
      --m3-surface-c-highest:color-mix(in srgb,var(--asw-primary) 13%,#fff);
      --m3-on-surface:#1d1b20;
      --m3-on-surface-var:#49454f;
      --m3-outline:#79747e;
      --m3-outline-var:#cac4d0;
      --m3-scrim:rgba(0,0,0,.32);
      --m3-error:#b3261e;--m3-on-error:#fff;
      --m3-error-container:#f9dedc;--m3-on-error-container:#8c1d18;
      --m3-success:#146c2e;--m3-success-container:#c4eed0;
      --m3-warning:#7a5900;--m3-warning-container:#ffdf9e;

      /* Legacy aliases kept so inline JS styling keeps working */
      --asw-bg:var(--m3-surface-c-low);
      --asw-surface:var(--m3-surface-c);
      --asw-surface-2:var(--m3-surface-c-high);
      --asw-text:var(--m3-on-surface);
      --asw-text-secondary:var(--m3-on-surface-var);
      --asw-text-muted:var(--m3-outline);
      --asw-border:var(--m3-outline-var);
      --asw-border-strong:var(--m3-outline);
      --asw-bot-bg:var(--m3-surface-c-high);
      --asw-bot-text:var(--m3-on-surface);
      --asw-user-bg:var(--m3-primary);--asw-user-bg-2:var(--m3-primary);
      --asw-user-text:var(--m3-on-primary);
      --asw-input-bg:var(--m3-surface-c-highest);
      --asw-input-focus-bg:var(--m3-surface-c-highest);
      --asw-success:var(--m3-success);--asw-error:var(--m3-error);--asw-warning:var(--m3-warning);
      --asw-header-bg:var(--m3-surface-c-low);

      /* M3 elevation levels (umbra + penumbra) */
      --m3-e1:0 1px 2px rgba(0,0,0,.30),0 1px 3px 1px rgba(0,0,0,.15);
      --m3-e2:0 1px 2px rgba(0,0,0,.30),0 2px 6px 2px rgba(0,0,0,.15);
      --m3-e3:0 1px 3px rgba(0,0,0,.30),0 4px 8px 3px rgba(0,0,0,.15);
      --m3-e4:0 2px 3px rgba(0,0,0,.30),0 6px 10px 4px rgba(0,0,0,.15);
      --m3-e5:0 4px 4px rgba(0,0,0,.30),0 8px 12px 6px rgba(0,0,0,.15);
      --asw-shadow:var(--m3-e3);

      /* M3 shape scale */
      --m3-r-xs:4px;--m3-r-s:8px;--m3-r-m:12px;--m3-r-l:16px;--m3-r-xl:28px;--m3-r-full:999px;
      --asw-radius:28px;--asw-radius-sm:16px;--asw-radius-xs:12px;

      --asw-panel-w:392px;--asw-panel-h:640px;

      /* M3 expressive motion easing + durations */
      --m3-emphasized:cubic-bezier(.2,0,0,1);
      --m3-emphasized-dec:cubic-bezier(.05,.7,.1,1);
      --m3-emphasized-acc:cubic-bezier(.3,0,.8,.15);
      --m3-standard:cubic-bezier(.2,0,0,1);
      --asw-spring:var(--m3-emphasized-dec);--asw-out:var(--m3-emphasized-dec);
    }

    /* ─── M3 tokens — dark scheme ─── */
    .asw.dark{
      --m3-primary:color-mix(in srgb,var(--asw-primary) 62%,#fff);
      --m3-on-primary:color-mix(in srgb,var(--asw-primary) 70%,#000);
      --m3-primary-container:color-mix(in srgb,var(--asw-primary) 62%,#000);
      --m3-on-primary-container:color-mix(in srgb,var(--asw-primary) 30%,#fff);
      --m3-secondary:color-mix(in srgb,var(--asw-secondary) 55%,#fff);
      --m3-secondary-container:color-mix(in srgb,var(--asw-secondary) 55%,#000);
      --m3-on-secondary-container:color-mix(in srgb,var(--asw-secondary) 28%,#fff);
      --m3-tertiary:color-mix(in srgb,var(--asw-accent) 60%,#fff);
      --m3-tertiary-container:color-mix(in srgb,var(--asw-accent) 55%,#000);

      --m3-surface:#141218;
      --m3-surface-c-lowest:#0f0d13;
      --m3-surface-c-low:color-mix(in srgb,var(--asw-primary) 6%,#141218);
      --m3-surface-c:color-mix(in srgb,var(--asw-primary) 9%,#17151c);
      --m3-surface-c-high:color-mix(in srgb,var(--asw-primary) 12%,#1d1b21);
      --m3-surface-c-highest:color-mix(in srgb,var(--asw-primary) 15%,#232128);
      --m3-on-surface:#e6e0e9;
      --m3-on-surface-var:#cac4d0;
      --m3-outline:#938f99;
      --m3-outline-var:#49454f;
      --m3-scrim:rgba(0,0,0,.55);
      --m3-error:#f2b8b5;--m3-on-error:#601410;
      --m3-error-container:#8c1d18;--m3-on-error-container:#f9dedc;
      --m3-success:#7fd894;--m3-success-container:#0b5323;
      --m3-warning:#f5c451;--m3-warning-container:#5c4200;
      --m3-e1:0 1px 2px rgba(0,0,0,.5),0 1px 3px 1px rgba(0,0,0,.4);
      --m3-e2:0 1px 2px rgba(0,0,0,.5),0 2px 6px 2px rgba(0,0,0,.4);
      --m3-e3:0 1px 3px rgba(0,0,0,.55),0 4px 8px 3px rgba(0,0,0,.42);
      --m3-e4:0 2px 3px rgba(0,0,0,.55),0 6px 10px 4px rgba(0,0,0,.45);
      --m3-e5:0 4px 4px rgba(0,0,0,.6),0 8px 12px 6px rgba(0,0,0,.48);
    }

    /* ─── Root ─── */
    .asw-root{position:fixed;z-index:2147483647;width:0;height:0;pointer-events:none}
    .asw-root>*{pointer-events:auto}
    .asw-root *{box-sizing:border-box}

    /* State layer utility — M3 hover 8% / focus 10% / pressed 10% */
    .asw-state{position:relative;overflow:hidden;isolation:isolate}
    .asw-state::before{content:"";position:absolute;inset:0;background:currentColor;opacity:0;transition:opacity .12s linear;pointer-events:none;border-radius:inherit}
    .asw-state:hover::before{opacity:.08}
    .asw-state:focus-visible::before{opacity:.10}
    .asw-state:active::before{opacity:.12}

    /* Ripple */
    .asw-ripple{position:absolute;border-radius:50%;background:currentColor;opacity:.20;transform:scale(0);pointer-events:none;animation:asw-ripple .5s var(--m3-standard) forwards}
    @keyframes asw-ripple{to{transform:scale(2.4);opacity:0}}

    /* ─── Ambient tonal glow (subtle in M3 — no neon) ─── */
    .asw-glow{position:fixed;z-index:0;width:320px;height:320px;border-radius:50%;pointer-events:none;background:radial-gradient(circle,color-mix(in srgb,var(--m3-primary) 24%,transparent) 0%,transparent 66%);filter:blur(48px);opacity:0;transform:scale(.7);transition:opacity .4s var(--m3-standard),transform .5s var(--m3-emphasized-dec)}
    .asw-glow.show{opacity:.5;transform:scale(1)}

    /* ─── FAB — M3 Large FAB, primary container, elevation 3 ─── */
    .asw-fab{position:fixed;width:64px;height:64px;border:none;border-radius:var(--m3-r-l);background:var(--m3-primary-container);color:var(--m3-on-primary-container);display:grid;place-items:center;cursor:pointer;overflow:visible;z-index:2;box-shadow:var(--m3-e3);transition:box-shadow .2s var(--m3-standard),border-radius .35s var(--m3-emphasized),background-color .2s linear,color .2s linear,transform .3s var(--m3-emphasized-dec);animation:asw-fab-in .5s var(--m3-emphasized-dec) .1s both}
    .asw-fab::before{content:"";position:absolute;inset:0;border-radius:inherit;background:currentColor;opacity:0;transition:opacity .12s linear;pointer-events:none}
    .asw-fab:hover{box-shadow:var(--m3-e4)}
    .asw-fab:hover::before{opacity:.08}
    .asw-fab:focus-visible::before{opacity:.10}
    .asw-fab:active{box-shadow:var(--m3-e3);transform:scale(.96)}
    .asw-fab:active::before{opacity:.12}
    /* Open state: FAB morphs into a tonal "close" surface (container transform) */
    .asw-fab.active{background:var(--m3-surface-c-high);color:var(--m3-on-surface-var);border-radius:50%;box-shadow:var(--m3-e1)}
    .asw-fab svg{width:26px;height:26px;position:relative}
    .asw-fab-shine{display:none}
    .asw-fab-icon-main,.asw-fab-icon-close{position:absolute;inset:0;display:grid;place-items:center;transition:opacity .15s linear,transform .35s var(--m3-emphasized)}
    .asw-fab-icon-close{opacity:0;transform:rotate(-120deg) scale(.5)}
    .asw-fab.active .asw-fab-icon-main{opacity:0;transform:rotate(120deg) scale(.5)}
    .asw-fab.active .asw-fab-icon-close{opacity:1;transform:rotate(0) scale(1)}
    .asw-fab-custom-icon{width:28px;height:28px;border-radius:var(--m3-r-s);object-fit:contain}
    .asw-fab-pulse{position:absolute;inset:0;border-radius:inherit;border:2px solid var(--m3-primary);opacity:0;animation:asw-ping 2.8s var(--m3-emphasized-dec) 1.2s infinite;pointer-events:none}
    .asw-fab.active .asw-fab-pulse{display:none}
    /* Plain tooltip (M3) */
    .asw-fab-label{position:absolute;inset-inline-end:calc(100% + 12px);top:50%;transform:translateY(-50%) scale(.85);transform-origin:right center;white-space:nowrap;padding:8px 14px;border-radius:var(--m3-r-xs);background:var(--m3-on-surface);color:var(--m3-surface);font-family:inherit;font-size:12px;font-weight:500;letter-spacing:.02em;box-shadow:none;opacity:0;pointer-events:none;transition:opacity .15s linear,transform .2s var(--m3-emphasized-dec)}
    .corner-bl .asw-fab-label,.corner-tl .asw-fab-label{inset-inline-end:auto;inset-inline-start:calc(100% + 12px);transform-origin:left center}
    .asw-fab:hover .asw-fab-label,.asw-fab:focus-visible .asw-fab-label{opacity:1;transform:translateY(-50%) scale(1)}
    .asw-fab.active .asw-fab-label{display:none}
    /* M3 badge */
    .asw-fab-badge{position:absolute;top:-2px;inset-inline-end:-2px;min-width:16px;height:16px;padding:0 4px;border-radius:var(--m3-r-full);background:var(--m3-error);color:var(--m3-on-error);font-size:11px;font-weight:500;line-height:1;display:grid;place-items:center;box-shadow:none;pointer-events:none}
    .asw-fab-badge.asw-pop{animation:asw-pop .3s var(--m3-emphasized-dec)}
    .asw-fab-badge[hidden]{display:none}
    @keyframes asw-fab-in{from{transform:scale(0) rotate(-45deg);opacity:0}to{transform:scale(1) rotate(0);opacity:1}}
    @keyframes asw-ping{0%{transform:scale(1);opacity:.4}70%,100%{transform:scale(1.35);opacity:0}}
    @keyframes asw-pop{from{transform:scale(.4)}to{transform:scale(1)}}

    /* ─── Teaser — M3 rich tooltip / elevated card ─── */
    .asw-teaser{position:fixed;z-index:1;max-width:264px;display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border-radius:var(--m3-r-m);background:var(--m3-surface-c-high);color:var(--m3-on-surface);box-shadow:var(--m3-e2);border:none;cursor:pointer;opacity:0;transform:translateY(8px) scale(.96);transition:opacity .15s linear,transform .3s var(--m3-emphasized-dec),box-shadow .2s;pointer-events:none}
    .asw-teaser.show{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}
    .asw-teaser:hover{box-shadow:var(--m3-e3)}
    .asw-teaser-orb{width:40px;height:40px;flex:none;border-radius:50%;background:var(--m3-primary-container);color:var(--m3-on-primary-container);display:grid;place-items:center}
    .asw-teaser-orb svg{width:20px;height:20px}
    .asw-teaser-body{min-width:0;padding-inline-end:12px}
    .asw-teaser-title{font-size:14px;font-weight:500;line-height:1.4;color:var(--m3-on-surface)}
    .asw-teaser-text{font-size:12px;color:var(--m3-on-surface-var);line-height:1.6;margin-top:4px}
    .asw-teaser-close{position:absolute;top:6px;inset-inline-start:6px;width:28px;height:28px;border:none;border-radius:50%;background:transparent;color:var(--m3-on-surface-var);display:grid;place-items:center;cursor:pointer;opacity:0;transition:opacity .12s,background .12s}
    .asw-teaser:hover .asw-teaser-close,.asw-teaser-close:focus-visible{opacity:1}
    .asw-teaser-close:hover{background:color-mix(in srgb,var(--m3-on-surface) 8%,transparent)}
    .asw-teaser-close svg{width:12px;height:12px}
    @media(max-width:520px){.asw-teaser{display:none}}

    /* ─── Panel — M3 elevated surface container, shape XL ─── */
    .asw-panel{position:fixed;z-index:3;width:var(--asw-panel-w);height:var(--asw-panel-h);max-width:calc(100vw - 20px);max-height:calc(100dvh - 96px);display:flex;flex-direction:column;overflow:hidden;background:var(--m3-surface-c-low);border-radius:var(--asw-radius);border:none;box-shadow:var(--m3-e3);opacity:0;pointer-events:none;transform:translateY(24px) scale(.9);transform-origin:bottom right;transition:opacity .15s var(--m3-emphasized-acc),transform .3s var(--m3-emphasized-acc);will-change:transform,opacity}
    .asw-panel.open{opacity:1;pointer-events:auto;transform:translateY(0) scale(1);transition:opacity .1s linear,transform .4s var(--m3-emphasized-dec)}
    .asw-panel.no-anim{transition:none}
    .asw-root.corner-br .asw-panel{transform-origin:bottom right}
    .asw-root.corner-bl .asw-panel{transform-origin:bottom left}
    .asw-root.corner-tr .asw-panel{transform-origin:top right}
    .asw-root.corner-tl .asw-panel{transform-origin:top left}
    .asw-root.corner-tr .asw-panel,.asw-root.corner-tl .asw-panel{transform:translateY(-24px) scale(.9)}
    .asw-root.corner-tr .asw-panel.open,.asw-root.corner-tl .asw-panel.open{transform:translateY(0) scale(1)}

    /* ─── Top app bar (M3 small) ─── */
    .asw-header{position:relative;z-index:3;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 8px 10px 12px;background:var(--m3-surface-c);color:var(--m3-on-surface);min-height:64px}
    .asw-heading{position:relative;display:flex;align-items:center;gap:12px;min-width:0;flex:1;padding-inline-start:6px}
    .asw-avatar-wrap{position:relative;flex:none}
    .asw-avatar{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:var(--m3-primary-container);color:var(--m3-on-primary-container);font-size:16px;font-weight:500;overflow:hidden;transition:transform .3s var(--m3-emphasized-dec)}
    .asw-avatar img{width:100%;height:100%;border-radius:inherit;object-fit:cover}
    .asw-status{position:absolute;bottom:0;inset-inline-end:0;width:10px;height:10px;border-radius:50%;background:var(--m3-success);border:2px solid var(--m3-surface-c)}
    .asw-info{min-width:0;flex:1}
    .asw-title-row{display:flex;align-items:center;gap:6px;min-width:0}
    /* M3 title-medium */
    .asw-title{font-size:16px;font-weight:500;letter-spacing:.01em;line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--m3-on-surface)}
    /* M3 assist chip (small) */
    .asw-ai-chip{flex:none;display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 8px;border-radius:var(--m3-r-s);font-size:10px;font-weight:500;letter-spacing:.05em;color:var(--m3-on-secondary-container);background:var(--m3-secondary-container)}
    .asw-ai-chip svg{width:11px;height:11px}
    .asw-badge{display:inline-flex;align-items:center;gap:5px;flex:none;height:20px;padding:0 8px;border-radius:var(--m3-r-s);background:color-mix(in srgb,var(--m3-success) 18%,transparent);color:color-mix(in srgb,var(--m3-success) 80%,var(--m3-on-surface));font-size:10px;font-weight:500;white-space:nowrap}
    .asw-badge-dot{width:6px;height:6px;border-radius:50%;background:var(--m3-success)}
    /* M3 body-small */
    .asw-subtitle{font-size:12px;font-weight:400;letter-spacing:.03em;color:var(--m3-on-surface-var);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

    /* Icon buttons (M3 standard, 40dp target) */
    .asw-actions{position:relative;display:flex;gap:2px;flex:none}
    .asw-header-btn{position:relative;width:40px;height:40px;border:none;border-radius:50%;background:transparent;color:var(--m3-on-surface-var);display:grid;place-items:center;cursor:pointer;overflow:hidden;transition:color .12s linear}
    .asw-header-btn::before{content:"";position:absolute;inset:0;border-radius:inherit;background:currentColor;opacity:0;transition:opacity .12s linear}
    .asw-header-btn:hover::before{opacity:.08}
    .asw-header-btn:focus-visible::before{opacity:.10}
    .asw-header-btn:active::before{opacity:.12}
    .asw-header-btn svg{width:20px;height:20px;position:relative;transition:transform .4s var(--m3-emphasized)}
    #asw-clear-history:hover svg{transform:rotate(-180deg)}
    .asw-header-btn.asw-close:hover{color:var(--m3-on-surface)}

    /* ─── Offline banner — M3 warning container ─── */
    .asw-netstatus{position:relative;z-index:3;flex:none;display:flex;align-items:center;justify-content:center;gap:8px;padding:10px 12px;background:var(--m3-warning-container);color:color-mix(in srgb,var(--m3-warning) 70%,var(--m3-on-surface));font-size:12px;font-weight:500;letter-spacing:.02em}
    .asw-netstatus[hidden]{display:none}
    .asw-netstatus svg{width:16px;height:16px;flex:none}

    /* ─── Messages ─── */
    .asw-messages{position:relative;z-index:1;flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;padding:16px 16px 8px;display:flex;flex-direction:column;gap:12px;scroll-behavior:smooth;background:var(--m3-surface-c-low);scrollbar-width:thin;scrollbar-color:var(--m3-outline-var) transparent}
    .asw-messages::-webkit-scrollbar{width:6px}
    .asw-messages::-webkit-scrollbar-track{background:transparent}
    .asw-messages::-webkit-scrollbar-thumb{background:var(--m3-outline-var);border-radius:var(--m3-r-full)}
    .asw-messages::-webkit-scrollbar-thumb:hover{background:var(--m3-outline)}

    /* Rows */
    .asw-row{position:relative;z-index:1;display:flex;flex-wrap:wrap;align-items:flex-end;gap:8px;max-width:88%;animation:asw-in .35s var(--m3-emphasized-dec) both}
    .asw-row.user{align-self:flex-end;flex-direction:row-reverse}
    .asw-row.bot{align-self:flex-start}
    .asw-row.bot + .asw-row.bot,.asw-row.user + .asw-row.user{margin-top:-6px}
    .asw-row.asw-cont .asw-msg-avatar{visibility:hidden}
    @keyframes asw-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
    .asw-row.no-anim{animation:none}

    .asw-msg-avatar{width:32px;height:32px;flex:0 0 32px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:500;overflow:hidden}
    .asw-row.bot .asw-msg-avatar{background:var(--m3-primary-container);color:var(--m3-on-primary-container)}
    .asw-row.bot .asw-msg-avatar img{width:100%;height:100%;object-fit:cover}
    .asw-row.user .asw-msg-avatar{background:var(--m3-tertiary-container);color:var(--m3-on-surface)}
    .asw-no-avatar .asw-msg-avatar{display:none}

    /* Day divider */
    .asw-divider{position:relative;z-index:1;align-self:center;display:inline-flex;align-items:center;gap:8px;margin:4px 0;padding:4px 12px;border-radius:var(--m3-r-full);background:var(--m3-surface-c-high);color:var(--m3-on-surface-var);font-size:11px;font-weight:500;letter-spacing:.04em;animation:asw-in .3s var(--m3-emphasized-dec) both}

    /* ─── Bubbles — M3 shape scale, tonal containers ─── */
    .asw-col{max-width:100%;min-width:0}
    .asw-bubble{padding:12px 16px;font-size:var(--asw-font-size,14px);line-height:1.75;letter-spacing:.01em;word-break:break-word;white-space:pre-wrap;overflow-wrap:anywhere;position:relative;text-align:start}
    .asw-row.bot .asw-bubble{background:var(--m3-surface-c-high);color:var(--m3-on-surface);border:none;border-radius:var(--m3-r-l) var(--m3-r-l) var(--m3-r-l) var(--m3-r-xs)}
    .asw-row.user .asw-bubble{background:var(--m3-primary);color:var(--m3-on-primary);border-radius:var(--m3-r-l) var(--m3-r-l) var(--m3-r-xs) var(--m3-r-l)}
    .asw[data-bubble="rounded"] .asw-row.bot .asw-bubble{border-radius:var(--m3-r-l) var(--m3-r-l) var(--m3-r-l) var(--m3-r-xs)}
    .asw[data-bubble="rounded"] .asw-row.user .asw-bubble{border-radius:var(--m3-r-l) var(--m3-r-l) var(--m3-r-xs) var(--m3-r-l)}
    .asw[data-bubble="sharp"] .asw-bubble{border-radius:var(--m3-r-xs)}
    .asw[data-bubble="pill"] .asw-bubble{border-radius:var(--m3-r-xl);padding:12px 20px}

    /* Bubble content */
    .asw-bubble strong{font-weight:600}
    .asw-bubble em{font-style:italic}
    .asw-bubble a{color:var(--m3-primary);font-weight:500;text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px}
    .asw-row.user .asw-bubble a{color:var(--m3-on-primary)}
    .asw-bubble ul,.asw-bubble ol{margin:8px 0 4px;padding-inline-start:22px}
    .asw-bubble li{margin:4px 0}
    .asw-bubble li::marker{color:var(--m3-primary)}
    .asw-bubble p{margin:4px 0}
    .asw-bubble p:first-child{margin-top:0}
    .asw-bubble p:last-child{margin-bottom:0}

    /* Tables — M3 data surface */
    .asw-table-wrap{margin:12px 0;border:1px solid var(--m3-outline-var);border-radius:var(--m3-r-m);overflow:hidden;overflow-x:auto;background:var(--m3-surface-c-lowest);direction:rtl}
    .asw-table-wrap table{border-collapse:collapse;width:100%;font-size:12.5px;line-height:1.7}
    .asw-table-wrap th{background:var(--m3-surface-c-high);font-weight:500;text-align:start;padding:12px 14px;white-space:nowrap;color:var(--m3-on-surface)}
    .asw-table-wrap td{padding:12px 14px;border-top:1px solid var(--m3-outline-var);color:var(--m3-on-surface-var)}
    .asw-table-wrap tbody tr{transition:background .12s linear}
    .asw-table-wrap tbody tr:hover{background:color-mix(in srgb,var(--m3-primary) 6%,transparent)}
    .asw-table-wrap th[style*="center"],.asw-table-wrap td[style*="center"]{text-align:center}

    /* Code blocks — neutral tonal surface */
    .asw-code-wrap{position:relative;margin:12px 0;border-radius:var(--m3-r-m);overflow:hidden;background:#1d1b20;border:1px solid #322f37;direction:ltr;text-align:left}
    .asw-code-header{display:flex;align-items:center;gap:8px;padding:8px 12px;background:#141218;border-bottom:1px solid #322f37}
    .asw-code-dots{display:none}
    .asw-code-lang{font-size:11px;color:#cac4d0;font-weight:500;letter-spacing:.08em;text-transform:uppercase}
    .asw-code-copy{margin-left:auto;display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 12px;border:none;border-radius:var(--m3-r-full);background:transparent;color:#cac4d0;font-size:11px;font-weight:500;cursor:pointer;transition:background .12s linear,color .12s linear;font-family:inherit}
    .asw-code-copy:hover{background:rgba(255,255,255,.08);color:#e6e0e9}
    .asw-code-copy.copied{color:#7fd894}
    .asw-code-copy svg{width:14px;height:14px}
    .asw-code-block{margin:0;padding:14px 16px;overflow-x:auto;font-family:'Roboto Mono',ui-monospace,'JetBrains Mono',Consolas,monospace;font-size:12.5px;line-height:1.7;color:#e6e0e9;white-space:pre;tab-size:2}
    .asw-code-block::-webkit-scrollbar{height:6px}
    .asw-code-block::-webkit-scrollbar-thumb{background:#49454f;border-radius:var(--m3-r-full)}
    .asw-code-block code{font-family:inherit}

    /* Inline code */
    .asw-bubble code:not(.asw-code-block code){padding:2px 6px;border-radius:var(--m3-r-xs);background:var(--m3-surface-c-highest);font-family:'Roboto Mono',ui-monospace,monospace;font-size:.87em;color:var(--m3-primary);border:none;white-space:pre-wrap}
    .asw-row.user .asw-bubble code:not(.asw-code-block code){background:rgba(255,255,255,.18);color:var(--m3-on-primary)}

    /* Timestamp — M3 label-small */
    .asw-time{padding:4px 6px 0;font-size:11px;font-weight:500;letter-spacing:.04em;color:var(--m3-outline)}
    .asw-row.user .asw-time{text-align:left}

    /* ─── Feedback — M3 icon buttons ─── */
    .asw-feedback{display:flex;align-items:center;gap:0;margin-top:4px;opacity:0;transition:opacity .15s linear}
    .asw-row:hover .asw-feedback,.asw-feedback:focus-within,.asw-feedback[data-sent],.asw-row.asw-last .asw-feedback{opacity:1}
    @media(hover:none){.asw-feedback{opacity:1}}
    .asw-feedback[hidden]{display:none}
    .asw-fb-btn{position:relative;width:32px;height:32px;border:none;border-radius:50%;background:transparent;color:var(--m3-on-surface-var);cursor:pointer;display:grid;place-items:center;overflow:hidden;transition:color .12s linear}
    .asw-fb-btn::before{content:"";position:absolute;inset:0;border-radius:inherit;background:currentColor;opacity:0;transition:opacity .12s linear}
    .asw-fb-btn:hover::before{opacity:.08}
    .asw-fb-btn:active::before{opacity:.12}
    .asw-fb-btn:hover{color:var(--m3-primary)}
    .asw-fb-btn.active{color:var(--m3-primary)}
    .asw-fb-btn.active.thumbs-up,.asw-fb-btn.copied{color:var(--m3-success)}
    .asw-fb-btn.active.thumbs-down{color:var(--m3-error)}
    .asw-fb-btn svg{width:16px;height:16px;position:relative}

    /* Retry — M3 outlined button */
    .asw-retry{position:relative;display:inline-flex;align-items:center;gap:8px;margin-top:10px;height:36px;padding:0 16px;border-radius:var(--m3-r-full);border:1px solid var(--m3-error);background:transparent;color:var(--m3-error);font-family:inherit;font-size:13px;font-weight:500;letter-spacing:.02em;cursor:pointer;overflow:hidden;transition:background .12s linear}
    .asw-retry::before{content:"";position:absolute;inset:0;background:currentColor;opacity:0;transition:opacity .12s linear}
    .asw-retry:hover::before{opacity:.08}
    .asw-retry:active::before{opacity:.12}
    .asw-retry svg{width:16px;height:16px;position:relative}
    .asw-retry span{position:relative}

    /* ─── Typing indicator ─── */
    .asw-typing{position:relative;z-index:1;flex:none;display:flex;align-items:center;gap:8px;padding:0 16px 12px;margin-top:-4px}
    .asw-typing[hidden]{display:none}
    .asw-typing-ava{width:32px;height:32px;flex:none;border-radius:50%;background:var(--m3-primary-container);color:var(--m3-on-primary-container);display:grid;place-items:center}
    .asw-typing-ava svg{width:15px;height:15px}
    .asw-typing-bubble{display:flex;align-items:center;gap:5px;padding:14px 16px;background:var(--m3-surface-c-high);border:none;border-radius:var(--m3-r-l) var(--m3-r-l) var(--m3-r-l) var(--m3-r-xs)}
    .asw-typing-dot{width:7px;height:7px;border-radius:50%;background:var(--m3-primary);animation:asw-bounce 1.2s var(--m3-standard) infinite}
    .asw-typing-dot:nth-child(2){animation-delay:.15s}
    .asw-typing-dot:nth-child(3){animation-delay:.3s}
    @keyframes asw-bounce{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-5px);opacity:1}}
    .asw-typing-label{font-size:12px;font-weight:500;letter-spacing:.03em;margin-inline-start:4px;color:var(--m3-on-surface-var)}

    /* ─── Hero welcome ─── */
    .asw-hero{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;text-align:center;gap:16px;padding:32px 8px 12px;transition:opacity .2s linear,transform .3s var(--m3-emphasized-acc)}
    .asw-hero>*{animation:asw-in .4s var(--m3-emphasized-dec) both}
    .asw-hero>*:nth-child(2){animation-delay:.05s}
    .asw-hero>*:nth-child(3){animation-delay:.1s}
    .asw-hero>*:nth-child(4){animation-delay:.15s}
    .asw-hero-out{opacity:0!important;transform:translateY(-8px)!important;pointer-events:none}
    .asw-hero-spot{display:none}
    .asw-hero-orb-wrap{position:relative}
    .asw-hero-orb{position:relative;width:80px;height:80px;border-radius:var(--m3-r-xl);background:var(--m3-primary-container);color:var(--m3-on-primary-container);display:grid;place-items:center;box-shadow:var(--m3-e1);animation:asw-float 6s ease-in-out infinite}
    .asw-hero-orb svg{width:36px;height:36px}
    .asw-hero-orb img{width:100%;height:100%;border-radius:inherit;object-fit:cover}
    .asw-hero-p{position:absolute;border-radius:50%;background:var(--m3-tertiary);opacity:.5;animation:asw-pfloat 6s ease-in-out infinite}
    .asw-hero-p.p1{width:8px;height:8px;top:-10px;inset-inline-start:6px}
    .asw-hero-p.p2{width:6px;height:6px;top:12px;inset-inline-end:-14px;animation-delay:1.4s}
    .asw-hero-p.p3{width:5px;height:5px;bottom:-6px;inset-inline-start:-12px;animation-delay:2.4s}
    @keyframes asw-pfloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
    @keyframes asw-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
    /* M3 headline-small-ish welcome copy */
    .asw-hero-text{font-size:16px;font-weight:400;line-height:1.7;color:var(--m3-on-surface);max-width:300px}
    .asw-hero-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%;max-width:344px}
    /* Hero cards — M3 filled cards */
    .asw-hero-grid .asw-suggestion{position:relative;justify-content:flex-start;text-align:start;white-space:normal;border-radius:var(--m3-r-m);padding:14px;line-height:1.6;font-size:13px;gap:8px;height:auto;background:var(--m3-surface-c-high);border:none;color:var(--m3-on-surface)}
    .asw-hero-grid .asw-suggestion::before{display:none}
    .asw-hero-grid .asw-suggestion span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .asw-card-arrow{margin-inline-start:auto;flex:none;color:var(--m3-primary);opacity:.7;transition:transform .3s var(--m3-emphasized)}
    .asw-card-arrow svg{width:16px;height:16px;display:block}
    .asw-suggestion:hover .asw-card-arrow{transform:translateX(-3px);opacity:1}
    @media(max-width:400px){.asw-hero-grid{grid-template-columns:1fr}}

    /* ─── Suggestion chips (M3 assist chips) ─── */
    .asw-suggestions{position:relative;z-index:2;flex:none;display:flex;gap:8px;align-items:center;overflow-x:auto;padding:8px 16px 10px;scrollbar-width:none;-webkit-overflow-scrolling:touch;background:var(--m3-surface-c-low)}
    .asw-suggestions::-webkit-scrollbar{display:none}
    .asw-suggestions[hidden]{display:none}
    .asw-suggestion{position:relative;display:inline-flex;align-items:center;gap:8px;flex:0 0 auto;height:32px;padding:0 16px;border-radius:var(--m3-r-s);border:1px solid var(--m3-outline-var);background:transparent;color:var(--m3-on-surface);font-family:inherit;font-size:13px;font-weight:500;letter-spacing:.02em;cursor:pointer;white-space:nowrap;text-decoration:none;overflow:hidden;transition:border-color .12s linear,background-color .12s linear}
    .asw-suggestion::after{content:"";position:absolute;inset:0;background:currentColor;opacity:0;transition:opacity .12s linear;pointer-events:none}
    .asw-suggestion:hover::after{opacity:.08}
    .asw-suggestion:focus-visible::after{opacity:.10}
    .asw-suggestion:active::after{opacity:.12}
    .asw-suggestion:hover{border-color:var(--m3-outline)}
    .asw-suggestion>*{position:relative}
    .asw-bubble .asw-suggestion{margin-top:8px}

    /* ─── Footer / Input ─── */
    .asw-footer{position:relative;z-index:2;flex:none;padding:8px 12px calc(12px + env(safe-area-inset-bottom,0px));background:var(--m3-surface-c);border-top:none}
    /* M3 filled text field, fully-rounded search-bar variant */
    .asw-input-wrap{display:flex;align-items:flex-end;gap:4px;padding:4px 4px 4px 8px;padding-inline:16px 4px;border:none;border-radius:var(--m3-r-xl);background:var(--m3-surface-c-highest);transition:background-color .12s linear,box-shadow .2s var(--m3-standard)}
    .asw-input-wrap:focus-within{box-shadow:inset 0 0 0 2px var(--m3-primary)}
    .asw-input-wrap.asw-listening{box-shadow:inset 0 0 0 2px var(--m3-error)}

    .asw-input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:var(--m3-on-surface);font-family:inherit;font-size:var(--asw-font-size,14px);line-height:1.6;letter-spacing:.02em;resize:none;padding:12px 0;max-height:132px;overflow-y:auto;scrollbar-width:none}
    .asw-input::-webkit-scrollbar{display:none}
    .asw-input::placeholder{color:var(--m3-on-surface-var)}

    /* Voice waveform */
    .asw-wave{display:flex;align-items:center;gap:3px;height:20px;flex:none;padding-inline-end:4px;align-self:center}
    .asw-wave[hidden]{display:none}
    .asw-wave span{width:3px;height:100%;border-radius:var(--m3-r-full);background:var(--m3-error);transform-origin:center;animation:asw-wave .9s ease-in-out infinite}
    .asw-wave span:nth-child(1){animation-duration:.82s}
    .asw-wave span:nth-child(2){animation-duration:.66s;animation-delay:.09s}
    .asw-wave span:nth-child(3){animation-duration:1.05s;animation-delay:.05s}
    .asw-wave span:nth-child(4){animation-duration:.74s;animation-delay:.13s}
    .asw-wave span:nth-child(5){animation-duration:.95s;animation-delay:.03s}
    @keyframes asw-wave{0%,100%{transform:scaleY(.3)}50%{transform:scaleY(1)}}

    .asw-mic{position:relative;width:40px;height:40px;flex:none;align-self:center;border:none;border-radius:50%;background:transparent;color:var(--m3-on-surface-var);display:grid;place-items:center;cursor:pointer;overflow:hidden;transition:color .12s linear}
    .asw-mic::before{content:"";position:absolute;inset:0;border-radius:inherit;background:currentColor;opacity:0;transition:opacity .12s linear}
    .asw-mic:hover::before{opacity:.08}
    .asw-mic:active::before{opacity:.12}
    .asw-mic[hidden]{display:none}
    .asw-mic svg{width:20px;height:20px;position:relative}
    .asw-input-wrap.asw-listening .asw-mic{color:var(--m3-error);animation:asw-mic-pulse 1.4s ease-in-out infinite}
    @keyframes asw-mic-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}

    /* Send — M3 filled icon button */
    .asw-send{position:relative;width:40px;height:40px;flex:none;align-self:center;border:none;border-radius:50%;display:grid;place-items:center;background:var(--m3-primary);color:var(--m3-on-primary);cursor:pointer;overflow:hidden;transition:background-color .15s linear,opacity .15s linear,transform .2s var(--m3-emphasized-dec)}
    .asw-send::before{content:"";position:absolute;inset:0;border-radius:inherit;background:currentColor;opacity:0;transition:opacity .12s linear}
    .asw-send:hover::before{opacity:.08}
    .asw-send:focus-visible::before{opacity:.10}
    .asw-send:active{transform:scale(.92)}
    .asw-send:active::before{opacity:.12}
    .asw-send:disabled{cursor:default;background:color-mix(in srgb,var(--m3-on-surface) 12%,transparent);color:color-mix(in srgb,var(--m3-on-surface) 38%,transparent);transform:none}
    .asw-send:disabled::before{opacity:0}
    .asw-send svg{width:20px;height:20px;position:relative}
    .asw-send.asw-stop{background:var(--m3-error-container);color:var(--m3-on-error-container)}

    /* Scroll-to-bottom — M3 small FAB (surface) */
    .asw-scrollbtn{position:absolute;top:-52px;inset-inline-end:16px;z-index:5;width:40px;height:40px;border-radius:var(--m3-r-m);border:none;background:var(--m3-surface-c-high);color:var(--m3-primary);display:grid;place-items:center;cursor:pointer;box-shadow:var(--m3-e2);opacity:0;transform:scale(.7);pointer-events:none;transition:opacity .15s linear,transform .25s var(--m3-emphasized-dec),box-shadow .2s}
    .asw-scrollbtn.show{opacity:1;transform:scale(1);pointer-events:auto}
    .asw-scrollbtn:hover{box-shadow:var(--m3-e3)}
    .asw-scrollbtn svg{width:20px;height:20px}

    .asw-foot-meta{display:flex;flex-direction:column;align-items:center;gap:2px;padding-top:8px}
    .asw-disclaim{font-size:11px;letter-spacing:.03em;color:var(--m3-on-surface-var);text-align:center;opacity:.85}
    .asw-powered{text-align:center;padding:0;font-size:11px;color:var(--m3-outline);font-weight:400;letter-spacing:.03em}
    .asw-powered[hidden]{display:none}
    .asw-powered a{color:var(--m3-primary);text-decoration:none;font-weight:500}
    .asw-powered a:hover{text-decoration:underline}
    .asw-resource-links{display:inline-flex;gap:6px;margin-inline-start:6px}

    /* ─── Snackbar (M3) ─── */
    .asw-toast{position:absolute;bottom:16px;left:16px;right:16px;top:auto;z-index:50;display:flex;align-items:center;gap:12px;min-height:48px;padding:12px 16px;border-radius:var(--m3-r-xs);background:color-mix(in srgb,var(--m3-on-surface) 92%,#000);color:var(--m3-surface);font-size:13px;font-weight:400;line-height:1.5;letter-spacing:.02em;text-align:start;border:none;box-shadow:var(--m3-e3);opacity:0;transform:translateY(16px);transition:opacity .15s linear,transform .3s var(--m3-emphasized-dec);pointer-events:none}
    .asw-toast.show{opacity:1;transform:translateY(0)}
    .asw-toast svg{width:18px;height:18px;flex:none;color:var(--m3-tertiary)}

    /* ─── Streaming caret ─── */
    .asw-bubble.streaming::after{content:"";display:inline-block;width:2px;height:15px;margin-inline-start:3px;border-radius:1px;background:var(--m3-primary);vertical-align:-2px;animation:asw-blink 1s steps(2) infinite}
    .asw-row.user .asw-bubble.streaming::after{background:var(--m3-on-primary)}
    @keyframes asw-blink{50%{opacity:0}}

    /* ─── Citations — M3 suggestion chips ─── */
    .asw-citations{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:10px;padding-top:10px;border-top:1px solid var(--m3-outline-var)}
    .asw-citations-label{font-size:11px;font-weight:500;color:var(--m3-on-surface-var);letter-spacing:.04em}
    .asw-citation{position:relative;display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 12px;font-size:12px;font-weight:500;color:var(--m3-on-surface-var);background:transparent;border:1px solid var(--m3-outline-var);border-radius:var(--m3-r-s);text-decoration:none;max-width:170px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:border-color .12s linear}
    .asw-citation:hover{border-color:var(--m3-primary);color:var(--m3-primary)}
    .asw-citation svg{width:14px;height:14px;flex:none}

    /* ─── Handoff callout — M3 outlined card ─── */
    .asw-handoff{flex:1 1 100%;display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:4px;padding:16px;border-radius:var(--m3-r-m);border:1px solid var(--m3-outline-var);background:var(--m3-surface-c);animation:asw-in .35s var(--m3-emphasized-dec) both}
    .asw-handoff-label{width:100%;font-size:13px;line-height:1.7;color:var(--m3-on-surface-var);font-weight:400;letter-spacing:.02em}
    /* M3 tonal buttons */
    .asw-handoff-btn{position:relative;display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 16px;border-radius:var(--m3-r-full);border:none;background:var(--m3-secondary-container);color:var(--m3-on-secondary-container);font-family:inherit;font-size:13px;font-weight:500;letter-spacing:.02em;cursor:pointer;text-decoration:none;overflow:hidden;transition:box-shadow .2s}
    .asw-handoff-btn::before{content:"";position:absolute;inset:0;background:currentColor;opacity:0;transition:opacity .12s linear}
    .asw-handoff-btn:hover::before{opacity:.08}
    .asw-handoff-btn:hover{box-shadow:var(--m3-e1)}
    .asw-handoff-btn:active::before{opacity:.12}
    .asw-handoff-btn svg{width:16px;height:16px;position:relative}
    .asw-messages:not(.asw-no-avatar) .asw-row > .asw-handoff,
    .asw-messages:not(.asw-no-avatar) .asw-row > .asw-leadform{margin-inline-start:40px}

    /* ─── Rule hint ─── */
    .asw-rule-hint{margin-top:8px;padding:12px 14px;background:var(--m3-surface-c-high);border:none;border-radius:var(--m3-r-m);font-size:12.5px;line-height:1.7;color:var(--m3-on-surface-var)}
    .asw-messages > .asw-rule-hint{align-self:center;margin:2px 0 4px;padding:6px 14px;border-radius:var(--m3-r-full);background:var(--m3-surface-c-high);border:none;color:var(--m3-on-surface-var);font-size:11.5px;animation:asw-in .3s both}

    /* ─── Bottom sheet (M3 modal bottom sheet) ─── */
    .asw-sheet{position:absolute;inset:0;z-index:40;display:flex;align-items:flex-end;opacity:0;pointer-events:none;transition:opacity .2s linear}
    .asw-sheet::before{content:"";position:absolute;inset:0;background:var(--m3-scrim)}
    .asw-sheet.open{opacity:1;pointer-events:auto}
    .asw-sheet[hidden]{display:none}
    .asw-sheet-card{position:relative;width:100%;max-height:92%;overflow-y:auto;overscroll-behavior:contain;background:var(--m3-surface-c-low);border-radius:var(--m3-r-xl) var(--m3-r-xl) 0 0;border:none;box-shadow:var(--m3-e1);padding:12px 24px calc(24px + env(safe-area-inset-bottom,0px));transform:translateY(100%);transition:transform .4s var(--m3-emphasized-dec);scrollbar-width:thin}
    .asw-sheet.open .asw-sheet-card{transform:translateY(0)}
    /* Drag handle */
    .asw-sheet-grip{width:32px;height:4px;border-radius:var(--m3-r-full);background:color-mix(in srgb,var(--m3-on-surface-var) 40%,transparent);margin:10px auto 18px}
    .asw-sheet-close{position:absolute;top:12px;inset-inline-end:12px;width:40px;height:40px;border:none;border-radius:50%;background:transparent;color:var(--m3-on-surface-var);display:grid;place-items:center;cursor:pointer;overflow:hidden;transition:color .12s linear}
    .asw-sheet-close::before{content:"";position:absolute;inset:0;border-radius:inherit;background:currentColor;opacity:0;transition:opacity .12s linear}
    .asw-sheet-close:hover::before{opacity:.08}
    .asw-sheet-close:active::before{opacity:.12}
    .asw-sheet-close svg{width:18px;height:18px;position:relative}
    /* M3 headline-small / body-medium */
    .asw-sheet-title{font-size:20px;font-weight:400;line-height:1.4;color:var(--m3-on-surface);letter-spacing:0}
    .asw-sheet-desc{font-size:13px;color:var(--m3-on-surface-var);line-height:1.7;letter-spacing:.02em;margin:8px 0 18px}
    /* Channel list — M3 filled cards */
    .asw-chans{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px}
    @media(max-width:360px){.asw-chans{grid-template-columns:1fr}}
    .asw-chan{position:relative;display:flex;align-items:center;gap:12px;padding:12px;border-radius:var(--m3-r-m);border:none;background:var(--m3-surface-c-high);text-decoration:none;overflow:hidden;transition:box-shadow .2s var(--m3-standard)}
    .asw-chan::before{content:"";position:absolute;inset:0;background:var(--m3-on-surface);opacity:0;transition:opacity .12s linear}
    .asw-chan:hover::before{opacity:.08}
    .asw-chan:active::before{opacity:.12}
    .asw-chan:hover{box-shadow:var(--m3-e1)}
    .asw-chan-ic{position:relative;width:40px;height:40px;flex:none;border-radius:50%;display:grid;place-items:center;color:#fff;background:var(--chan,var(--m3-primary))}
    .asw-chan-ic svg{width:18px;height:18px}
    .asw-chan-tx{position:relative;min-width:0;display:flex;flex-direction:column;gap:2px}
    .asw-chan-tx b{font-size:13px;font-weight:500;color:var(--m3-on-surface)}
    .asw-chan-tx i{font-style:normal;font-size:11px;color:var(--m3-on-surface-var);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;direction:ltr;text-align:end}
    .asw-chan-more{width:100%;justify-content:center;margin-top:2px}

    /* ─── Form — M3 outlined text fields ─── */
    .asw-form{text-align:start}
    .asw-field{margin-bottom:16px}
    .asw-field-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    @media(max-width:340px){.asw-field-row{grid-template-columns:1fr}}
    .asw-flabel{display:flex;align-items:center;gap:4px;font-size:12px;font-weight:500;letter-spacing:.03em;color:var(--m3-on-surface-var);margin-bottom:6px}
    .asw-flabel b{color:var(--m3-error);font-weight:500}
    .asw-form input,.asw-form textarea{width:100%;box-sizing:border-box;font-family:inherit;font-size:14px;letter-spacing:.02em;color:var(--m3-on-surface);padding:14px 16px;border-radius:var(--m3-r-xs);border:1px solid var(--m3-outline);background:transparent;outline:none;transition:border-color .12s linear,box-shadow .12s linear}
    .asw-form textarea{resize:vertical;min-height:72px;max-height:140px;line-height:1.7}
    .asw-form input::placeholder,.asw-form textarea::placeholder{color:var(--m3-outline)}
    .asw-form input:hover,.asw-form textarea:hover{border-color:var(--m3-on-surface)}
    .asw-form input:focus,.asw-form textarea:focus{border-color:var(--m3-primary);box-shadow:inset 0 0 0 1px var(--m3-primary)}
    .asw-field.invalid input,.asw-field.invalid textarea{border-color:var(--m3-error);box-shadow:inset 0 0 0 1px var(--m3-error)}
    .asw-field.invalid .asw-flabel{color:var(--m3-error)}
    .asw-field.ok input{border-color:var(--m3-success)}
    /* Supporting text */
    .asw-ferr{display:none;font-size:12px;font-weight:400;letter-spacing:.03em;color:var(--m3-error);margin-top:6px;padding-inline:16px}
    .asw-field.invalid .asw-ferr{display:block}
    /* M3 filled button */
    .asw-form-submit{position:relative;width:100%;display:inline-flex;align-items:center;justify-content:center;gap:8px;margin-top:8px;height:48px;padding:0 24px;border:none;border-radius:var(--m3-r-full);background:var(--m3-primary);color:var(--m3-on-primary);font-family:inherit;font-size:14px;font-weight:500;letter-spacing:.04em;cursor:pointer;overflow:hidden;transition:box-shadow .2s var(--m3-standard),background-color .15s linear}
    .asw-form-submit::before{content:"";position:absolute;inset:0;background:currentColor;opacity:0;transition:opacity .12s linear}
    .asw-form-submit:hover::before{opacity:.08}
    .asw-form-submit:hover{box-shadow:var(--m3-e1)}
    .asw-form-submit:active::before{opacity:.12}
    .asw-form-submit:disabled{background:color-mix(in srgb,var(--m3-on-surface) 12%,transparent);color:color-mix(in srgb,var(--m3-on-surface) 38%,transparent);box-shadow:none;cursor:default}
    .asw-form-submit:disabled::before{opacity:0}
    .asw-form-submit svg{width:18px;height:18px;position:relative}
    .asw-form-submit span{position:relative}
    /* M3 circular progress indicator */
    .asw-spinner{width:18px;height:18px;flex:none;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;opacity:.9;animation:asw-rot .9s linear infinite}
    @keyframes asw-rot{to{transform:rotate(360deg)}}
    .asw-form-note{display:flex;align-items:center;justify-content:center;gap:6px;font-size:11.5px;color:var(--m3-on-surface-var);text-align:center;margin-top:14px;line-height:1.7;letter-spacing:.02em}
    .asw-form-note svg{width:14px;height:14px;flex:none;opacity:.8}
    .asw-form-err{display:none;font-size:12px;font-weight:400;color:var(--m3-error);margin-top:12px;text-align:center;letter-spacing:.02em}
    .asw-form-err.show{display:block}

    /* Success state */
    .asw-form-success{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;padding:24px 8px 8px;animation:asw-in .35s var(--m3-emphasized-dec) both}
    .asw-checkmark{width:64px;height:64px;stroke:var(--m3-success);stroke-width:3;fill:none;stroke-linecap:round;stroke-linejoin:round}
    .asw-checkmark circle{stroke-dasharray:170;stroke-dashoffset:170;animation:asw-draw .7s var(--m3-emphasized-dec) .05s forwards}
    .asw-checkmark path{stroke-dasharray:44;stroke-dashoffset:44;animation:asw-draw .4s var(--m3-emphasized-dec) .55s forwards}
    @keyframes asw-draw{to{stroke-dashoffset:0}}
    .asw-fs-title{font-size:18px;font-weight:400;color:var(--m3-on-surface);margin-top:12px;line-height:1.5}
    .asw-fs-desc{font-size:13px;color:var(--m3-on-surface-var);line-height:1.8;max-width:280px;letter-spacing:.02em}
    /* M3 text button */
    .asw-fs-close{position:relative;margin-top:16px;height:40px;padding:0 24px;border-radius:var(--m3-r-full);border:none;background:transparent;color:var(--m3-primary);font-family:inherit;font-size:14px;font-weight:500;letter-spacing:.04em;cursor:pointer;overflow:hidden}
    .asw-fs-close::before{content:"";position:absolute;inset:0;background:currentColor;opacity:0;transition:opacity .12s linear}
    .asw-fs-close:hover::before{opacity:.08}
    .asw-fs-close:active::before{opacity:.12}
    .asw-leadform-wrap{animation:asw-in .35s var(--m3-emphasized-dec) both}
    .asw-leadform{position:relative;flex:1 1 100%;margin:4px 0;padding:16px;border-radius:var(--m3-r-m);border:1px solid var(--m3-outline-var);background:var(--m3-surface-c);animation:asw-in .35s var(--m3-emphasized-dec) both}
    .asw-leadform-title{font-size:15px;font-weight:500;color:var(--m3-on-surface);margin-bottom:4px}
    .asw-leadform-desc{font-size:12.5px;color:var(--m3-on-surface-var);line-height:1.7;margin-bottom:14px}

    /* ─── Error bubble ─── */
    .asw-bubble.asw-error-bubble{background:var(--m3-error-container);color:var(--m3-on-error-container);border:none}

    /* ─── Responsive / mobile fullscreen ─── */
    @media(max-width:480px){
      .asw-fab{width:56px;height:56px;border-radius:var(--m3-r-l)}
      .asw-panel{width:min(var(--asw-panel-w),calc(100vw - 24px));height:min(var(--asw-panel-h),calc(100dvh - 80px))}
      .asw-root.mobile-fullscreen .asw-panel{position:fixed!important;inset:0!important;width:100vw!important;max-width:none!important;height:100vh!important;height:100dvh!important;max-height:none!important;border-radius:0!important;transform:translateY(24px)!important;box-shadow:none!important}
      .asw-root.mobile-fullscreen .asw-panel.open{transform:translateY(0)!important}
      .asw-root.mobile-fullscreen .asw-fab{display:none!important}
      .asw-root.mobile-fullscreen .asw-glow{display:none}
      .asw-root.mobile-fullscreen .asw-sheet-card{border-radius:0;padding-top:16px}
      .asw-row{max-width:92%}
      .asw-sheet-card{padding-inline:16px}
    }

    @media(prefers-reduced-motion:reduce){
      .asw-panel,.asw-fab,.asw-suggestion,.asw-teaser,.asw-scrollbtn,.asw-toast,.asw-glow,.asw-fab-label,.asw-sheet,.asw-sheet-card,.asw-chan{transition:none}
      .asw-typing-dot,.asw-fab-pulse,.asw-hero-orb,.asw-hero-p,.asw-mic,.asw-wave span,.asw-spinner,.asw-ripple{animation:none}
      .asw-row,.asw-hero,.asw-hero>*,.asw-handoff,.asw-leadform,.asw-leadform-wrap,.asw-divider,.asw-form-success,.asw-fab{animation:none;opacity:1;transform:none}
      .asw-checkmark circle,.asw-checkmark path{stroke-dashoffset:0;animation:none}
    }

    /* ─── Type scale variants ─── */
    .asw[data-font="small"]{--asw-font-size:12px}
    .asw[data-font="large"]{--asw-font-size:16px}

    /* ─── Animation kill-switch ─── */
    .asw[data-anim="off"] *,.asw[data-anim="off"] *::before,.asw[data-anim="off"] *::after{animation:none!important;transition:none!important}

    /* ─── Accessibility ─── */
    .asw :focus-visible{outline:3px solid var(--m3-primary);outline-offset:2px;border-radius:var(--m3-r-xs)}
    .asw ::selection{background:color-mix(in srgb,var(--m3-primary) 25%,transparent)}
    .asw-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
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
    var output = [];
    var inList = false;
    var inOl = false;
    var codeBlock = false;
    var codeLines = [];
    var codeLang = "";

    function closeLists() {
      if (inList) { output.push("</ul>"); inList = false; }
      if (inOl) { output.push("</ol>"); inOl = false; }
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      if (line.match(/^```/)) {
        if (codeBlock) {
          output.push(renderCodeBlock(codeLines.join("\n"), codeLang));
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
          output.push(renderTable(rows));
          i = j - 1;
          continue;
        }
      }

      var isUl = line.match(/^\s*[-*•]\s+(.+)/);
      var isOl = line.match(/^\s*\d+\.\s+(.+)/);
      if (!isUl && inList) { output.push("</ul>"); inList = false; }
      if (!isOl && inOl) { output.push("</ol>"); inOl = false; }

      if (isUl) {
        if (!inList) { output.push("<ul>"); inList = true; }
        output.push("<li>" + renderInline(isUl[1]) + "</li>");
      } else if (isOl) {
        if (!inOl) { output.push("<ol>"); inOl = true; }
        output.push("<li>" + renderInline(isOl[1]) + "</li>");
      } else {
        output.push(renderInline(line));
      }
    }

    if (codeBlock) output.push(renderCodeBlock(codeLines.join("\n"), codeLang));
    if (inList) output.push("</ul>");
    if (inOl) output.push("</ol>");

    return output.join("<br>");
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
      '<div class="asw-code-header"><span class="asw-code-dots"><span></span><span></span><span></span></span>' +
      '<span class="asw-code-lang">' + escapeHtml(langLabel) + '</span>' +
      '<button class="asw-code-copy" data-code-id="' + id + '" type="button">' + ICONS.copy + '<span>کپی</span></button></div>' +
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
      this.applyThemeVars(root);

      var fabIconHtml = this.getFabIconHtml();

      root.innerHTML =
        /* Ambient glow */
        '<div class="asw-glow" id="asw-glow" aria-hidden="true"></div>' +
        /* Panel */
        '<section class="asw-panel" role="dialog" aria-label="' + escapeHtml(this.options.title) + '" aria-hidden="true">' +
          /* Header */
          '<header class="asw-header">' +
            '<div class="asw-heading">' +
              '<div class="asw-avatar-wrap">' +
                '<div class="asw-avatar" id="asw-avatar"></div>' +
                '<span class="asw-status" aria-hidden="true"></span>' +
              '</div>' +
              '<div class="asw-info">' +
                '<div class="asw-title-row"><span class="asw-title" id="asw-title"></span><span class="asw-ai-chip" aria-hidden="true">' + ICONS.sparkles + '<span>AI</span></span><span class="asw-badge" id="asw-badge"><span class="asw-badge-dot" aria-hidden="true"></span><span id="asw-badge-text"></span></span></div>' +
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
          /* Offline banner */
          '<div class="asw-netstatus" id="asw-netstatus" hidden role="status">' + ICONS.wifiOff + '<span>اتصال اینترنت قطع است — پاسخ‌ها ارسال نمی‌شوند</span></div>' +
          /* Messages */
          '<div class="asw-messages" id="asw-messages" role="log" aria-live="polite"></div>' +
          /* Typing */
          '<div class="asw-typing" id="asw-typing" hidden aria-label="در حال تایپ...">' +
            '<div class="asw-typing-ava" aria-hidden="true">' + ICONS.sparkles + '</div>' +
            '<div class="asw-typing-bubble" aria-hidden="true"><span class="asw-typing-dot"></span><span class="asw-typing-dot"></span><span class="asw-typing-dot"></span></div>' +
            '<span class="asw-typing-label" id="asw-typing-label">' + THINKING_STATUSES[0] + '</span>' +
          '</div>' +
          /* Suggestions */
          '<div class="asw-suggestions" id="asw-suggestions"></div>' +
          /* Footer */
          '<footer class="asw-footer">' +
            '<button class="asw-scrollbtn" id="asw-scrollbtn" type="button" aria-label="رفتن به آخرین پیام">' + ICONS.chevronDown + '</button>' +
            '<div class="asw-input-wrap" id="asw-input-wrap">' +
              '<textarea class="asw-input" id="asw-input" rows="1" autocomplete="off" enterkeyhint="send" placeholder="' + escapeHtml(this.options.inputPlaceholder) + '" aria-label="پیام" style="height:auto;min-height:24px;max-height:132px"></textarea>' +
              '<div class="asw-wave" id="asw-wave" hidden aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>' +
              '<button class="asw-mic" id="asw-mic" type="button" aria-label="ورودی صوتی" title="ورودی صوتی" hidden>' + ICONS.mic + '</button>' +
              '<button class="asw-send" id="asw-send" type="button" aria-label="ارسال پیام" disabled>' + ICONS.arrowUp + '</button>' +
            '</div>' +
            '<div class="asw-foot-meta">' +
              '<div class="asw-disclaim">پاسخ‌ها توسط هوش مصنوعی تولید می‌شوند و ممکن است اشتباه باشند.</div>' +
              '<div class="asw-powered" id="asw-powered">توسعه‌ی <a href="https://ai-support.ir" target="_blank" rel="noopener">AI Support</a><span class="asw-resource-links" id="asw-resources"></span></div>' +
            '</div>' +
          '</footer>' +
          /* Contact bottom-sheet */
          '<div class="asw-sheet" id="asw-sheet" hidden aria-hidden="true" role="dialog" aria-label="تماس با ما">' +
            '<div class="asw-sheet-card">' +
              '<div class="asw-sheet-grip" aria-hidden="true"></div>' +
              '<button class="asw-sheet-close" id="asw-sheet-close" type="button" aria-label="بستن">' + ICONS.close + '</button>' +
              '<div class="asw-sheet-title">' + escapeHtml(this.options.leadFormTitle) + '</div>' +
              '<div class="asw-sheet-desc">' + escapeHtml(this.options.leadFormDescription) + '</div>' +
              '<div class="asw-chans" id="asw-chans"></div>' +
              '<div id="asw-sheet-form"></div>' +
            '</div>' +
          '</div>' +
          /* Toast */
          '<div class="asw-toast" id="asw-toast" role="status"></div>' +
        '</section>' +
        /* FAB */
        '<button class="asw-fab" id="asw-fab" type="button" aria-label="باز کردن چت" aria-expanded="false">' +
          '<span class="asw-fab-label" aria-hidden="true">' + escapeHtml(this.options.fabLabel) + '</span>' +
          '<span class="asw-fab-pulse" aria-hidden="true"></span>' +
          '<span class="asw-fab-shine" aria-hidden="true"></span>' +
          '<span class="asw-fab-icon-main">' + fabIconHtml + '</span>' +
          '<span class="asw-fab-icon-close" aria-hidden="true">' + ICONS.close + '</span>' +
          '<span class="asw-fab-badge" id="asw-fab-badge" hidden aria-hidden="true"></span>' +
        '</button>' +
        /* Teaser */
        '<div class="asw-teaser" id="asw-teaser" role="button" tabindex="0" aria-label="گفتگو با پشتیبان" hidden>' +
          '<button class="asw-teaser-close" id="asw-teaser-close" type="button" aria-label="بستن">' + ICONS.close + '</button>' +
          '<div class="asw-teaser-orb" aria-hidden="true">' + ICONS.sparkles + '</div>' +
          '<div class="asw-teaser-body"><div class="asw-teaser-title">سوالی دارید؟</div><div class="asw-teaser-text">' + escapeHtml(this.options.teaserText) + '</div></div>' +
        '</div>';

      this.shadow.appendChild(root);
      this.root = root;
      this.panel = root.querySelector(".asw-panel");
      this.glow = root.querySelector("#asw-glow");
      this.fab = root.querySelector("#asw-fab");
      this.fabBadge = root.querySelector("#asw-fab-badge");
      this.teaser = root.querySelector("#asw-teaser");
      this.teaserClose = root.querySelector("#asw-teaser-close");
      this.closeBtn = root.querySelector("#asw-close");
      this.themeToggle = root.querySelector("#asw-theme-toggle");
      this.contactBtn = root.querySelector("#asw-contact");
      this.titleEl = root.querySelector("#asw-title");
      this.badgeText = root.querySelector("#asw-badge-text");
      this.subtitleEl = root.querySelector("#asw-subtitle");
      this.avatarEl = root.querySelector("#asw-avatar");
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
      this.sendEvent("widget_loaded");
      this.restoreConversation();
      var restored = this.restoreLocalHistory();
      if (!restored) await this.restoreHistory();
      // First-ever visit (no local/server history): render the hero greeting.
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

    /* ─── Light conversation memory (localStorage, 7 days, no DB pressure) ─── */
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
      try { localStorage.removeItem(this._localKey()); } catch (_) {}
    }

    /* ─── Conversation persistence (server token) ─── */
    restoreConversation() {
      try {
        this.conversationId = sessionStorage.getItem("asw_conversation_id") || "";
        this.conversationToken = sessionStorage.getItem("asw_conversation_token") || "";
      } catch (_) {}
    }

    saveConversation() {
      try {
        if (this.conversationId) sessionStorage.setItem("asw_conversation_id", this.conversationId);
        if (this.conversationToken) sessionStorage.setItem("asw_conversation_token", this.conversationToken);
      } catch (_) {}
    }

    async restoreHistory() {
      /* Restore server-side history when the conversation already exists. */
      if (!this.conversationId || !this.conversationToken) return;
      if (this.messageCount > 1) return;
      try {
        var url = this.options.historyEndpoint + "?conversation_id=" + encodeURIComponent(this.conversationId);
        var res = await fetch(url, { method: "GET", mode: "cors", credentials: "omit", headers: this.getHeaders() });
        if (!res.ok) return;
        var data = await res.json();
        var msgs = Array.isArray(data.messages) ? data.messages : [];
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

    /* ─── Load Config from API ─── */
    async loadConfig() {
      if (!this.options.configEndpoint) return;
      try {
        var res = await fetch(this.options.configEndpoint, { method: "GET", mode: "cors", credentials: "omit", headers: this.getHeaders() });
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
      } catch (_) { /* defaults remain */ }
    }

    /* ─── Apply Theme Variables ─── */
    applyThemeVars(el) {
      var o = this.options;
      var s = el || this.root;
      s.style.setProperty("--asw-primary", o.primaryColor);
      s.style.setProperty("--asw-secondary", o.secondaryColor);
      s.style.setProperty("--asw-accent", o.accentColor || o.secondaryColor);
      s.style.setProperty("--asw-header-bg", this.getHeaderBg());
      s.style.setProperty("--asw-panel-w", clamp(o.panelWidth, 300, 520) + "px");
      s.style.setProperty("--asw-panel-h", clamp(o.panelHeight, 400, 800) + "px");
      s.style.setProperty("--asw-radius", clamp(o.borderRadius, 12, 36) + "px");
      s.style.setProperty("--asw-font", o.fontFamily);
      s.style.setProperty("--asw-font-size", o.fontSize === "small" ? "12px" : o.fontSize === "large" ? "16px" : "14px");
      s.setAttribute("data-bubble", o.bubbleStyle || "rounded");
      s.setAttribute("data-font", o.fontSize || "normal");
      s.setAttribute("data-anim", o.enableAnimations === false ? "off" : "on");
    }

    getHeaderBg() {
      var o = this.options;
      if (o.themeMode === "solid") return o.primaryColor;
      if (o.themeMode === "glass") return "linear-gradient(135deg, " + o.primaryColor + "dd, " + o.secondaryColor + "cc)";
      return "linear-gradient(135deg, " + o.primaryColor + ", " + o.secondaryColor + ")";
    }

    applyTheme() {
      var isDark = detectDarkMode(this.options.darkMode);
      this.root.classList.toggle("dark", isDark);
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

      this.root.className = "asw asw-root corner-" + corner;
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

      // Ambient glow: centered on the FAB corner
      if (this.glow) {
        this.glow.style.position = "fixed";
        var gs = 340;
        if (isBottom) {
          this.glow.style.top = "auto";
          this.glow.style.bottom = (vertPx - gs / 2 - 20) + "px";
        } else {
          this.glow.style.bottom = "auto";
          this.glow.style.top = (vertPx - gs / 2 - 20) + "px";
        }
        if (isLeft) {
          this.glow.style.right = "auto";
          this.glow.style.left = (horizPx - gs / 2 - 10) + "px";
        } else {
          this.glow.style.left = "auto";
          this.glow.style.right = (horizPx - gs / 2 - 10) + "px";
        }
      }

      // Panel: fixed, positioned directly adjacent to FAB
      this.panel.style.position = "fixed";
      var fabSize = 60;
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
      this.badgeText.textContent = o.headerBadge;
      if (!this.isLoading) this.subtitleEl.textContent = o.subtitle;
      this.input.placeholder = o.inputPlaceholder;
      this.powered.hidden = o.showPoweredBy === false;
      this.messages.classList.toggle("asw-no-avatar", o.showAvatar === false);
    }

    /* ─── Suggestions (strip + hero cards) ─── */
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
          '<span class="asw-chan-tx"><b>' + escapeHtml(ch.label) + '</b><i>' + escapeHtml(ch.cap) + '</i></span>';
        a.addEventListener("click", function () { self.logHandoff(ch.key, self._lastUserMessage || ""); });
        self.chansEl.appendChild(a);
      });
      this.chansEl.hidden = chans.length === 0;
    }

    /* ─── Material ripple (M3 state layer, delegated) ─── */
    bindRipples() {
      var root = this.root;
      if (!root || this.options.enableAnimations === false) return;
      var SELECTOR = ".asw-fab,.asw-header-btn,.asw-send,.asw-mic,.asw-fb-btn," +
        ".asw-suggestion,.asw-handoff-btn,.asw-form-submit,.asw-fs-close," +
        ".asw-chan,.asw-sheet-close,.asw-retry,.asw-scrollbtn,.asw-teaser-close";
      root.addEventListener("pointerdown", function (e) {
        var target = e.target && e.target.closest ? e.target.closest(SELECTOR) : null;
        if (!target || target.disabled) return;
        var rect = target.getBoundingClientRect();
        var size = Math.max(rect.width, rect.height);
        var ink = document.createElement("span");
        ink.className = "asw-ripple";
        ink.style.width = ink.style.height = size + "px";
        ink.style.left = (e.clientX - rect.left - size / 2) + "px";
        ink.style.top = (e.clientY - rect.top - size / 2) + "px";
        var cs = getComputedStyle(target);
        if (cs.position === "static") target.style.position = "relative";
        if (cs.overflow === "visible") ink.style.display = "none";
        target.appendChild(ink);
        setTimeout(function () { if (ink.parentNode) ink.parentNode.removeChild(ink); }, 520);
      }, { passive: true });
    }

    /* ─── Bind Events ─── */
    bindEvents() {
      var self = this;

      this.bindRipples();

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
        // During streaming the send button acts as a stop control.
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

      // Contact sheet
      if (this.sheetClose) {
        this.sheetClose.addEventListener("click", function () { self.closeSheet(); });
      }
      this.sheet.addEventListener("click", function (e) {
        if (e.target === self.sheet) self.closeSheet();
      });

      // Suggestion chips (strip + hero cards) — one delegated handler
      this.shadow.addEventListener("click", function (e) {
        var chip = e.target.closest("[data-msg]");
        if (!chip) return;
        self.sendText(chip.dataset.msg);
      });

      // New conversation (clears local history + session tokens)
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

      // Teaser
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

      // Scroll-to-bottom pill + stick-to-bottom tracking
      this.messages.addEventListener("scroll", function () { self._updateScrollBtn(); }, { passive: true });
      if (this.scrollBtn) {
        this.scrollBtn.addEventListener("click", function () { self.scrollToBottom(true); });
      }

      // Offline / online awareness
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

      // Tab-title flash while a reply arrives in a hidden tab
      document.addEventListener("visibilitychange", function () {
        if (!document.hidden) self._stopTitleFlash();
      });

      // Code copy buttons
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

      // Feedback buttons
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
      // Rebuild the form each time so the note is pre-filled with fresh context.
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
      setTimeout(function () { s.hidden = true; }, 380);
    }

    /* ─── Professional contact form (shared: sheet + inline handoff) ─── */
    buildContactForm(source, opts) {
      opts = opts || {};
      var self = this;
      var uid = "f" + (++this._uid) + source;
      var wrap = document.createElement("div");
      wrap.className = "asw-form" + (opts.compact ? " asw-leadform" : "");
      wrap.innerHTML =
        (opts.compact ? '<div class="asw-leadform-title">' + escapeHtml(this.options.leadFormTitle) + '</div>' +
          '<div class="asw-leadform-desc">' + escapeHtml(this.options.leadFormDescription) + '</div>' : "") +
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

    /* ─── Voice input (Web Speech API — progressive enhancement) ─── */
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
      setTimeout(function () { t.hidden = true; }, 320);
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
      if (this.glow) this.glow.classList.add("show");
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
      if (this.glow) this.glow.classList.remove("show");
      this.fab.focus();
    }

    toggle() { this.isOpen ? this.close() : this.open(); }

    /* ─── Send State ─── */
    updateSendState() {
      this.sendBtn.disabled = this.isLoading || !this.input.value.trim();
    }

    scrollToBottom(force) {
      if (!force && this._stick === false) return;
      var m = this.messages;
      m.scrollTo({ top: m.scrollHeight, behavior: "smooth" });
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

    /* ─── Hero (greeting) ─── */
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
        '<div class="asw-hero-spot" aria-hidden="true"></div>' +
        '<div class="asw-hero-orb-wrap" aria-hidden="true">' +
          '<span class="asw-hero-p p1"></span><span class="asw-hero-p p2"></span><span class="asw-hero-p p3"></span>' +
          '<div class="asw-hero-orb">' + orbContent + "</div>" +
        "</div>" +
        '<div class="asw-hero-text">' + escapeHtml(text) + "</div>" + cards;
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
      setTimeout(function () { if (hero.parentNode) hero.parentNode.removeChild(hero); }, 420);
    }

    /* ─── Add Message ─── */
    addMessage(text, sender, isGreeting, opts) {
      opts = opts || {};
      if (isGreeting && sender === "bot") return this.addHero(text);

      var prev = this.messages.lastElementChild;
      var isCont = !!(prev && prev.classList && prev.classList.contains("asw-row") && prev.classList.contains(sender));
      var row = document.createElement("div");
      row.className = "asw-row " + sender + (isCont ? " asw-cont" : "") + (opts.noAnim ? " no-anim" : "");

      // Only the newest answer shows its action toolbar by default.
      var oldLast = this.messages.querySelector(".asw-row.asw-last");
      if (oldLast) oldLast.classList.remove("asw-last");
      row.classList.add("asw-last");

      // Avatar
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
            avatar.textContent = this.options.botAvatarText || "✦";
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

      // Retry button on error bubbles
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

      // Feedback: created for every bot answer; appended immediately unless
      // streaming (handleAnswerResultFromEl attaches it after the stream ends).
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

      // Citations
      if (sender === "bot" && this.options.showCitations && Array.isArray(opts.citations) && opts.citations.length) {
        col.appendChild(this.buildCitations(opts.citations));
      }

      row.appendChild(col);
      this.messages.appendChild(row);
      this.messageCount++;

      // Unread badge while panel is closed
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
      el.innerHTML =
        '<button class="asw-fb-btn fb-copy" type="button" data-action="copy" aria-label="کپی پاسخ" title="کپی پاسخ">' + ICONS.copy + '</button>' +
        '<button class="asw-fb-btn thumbs-up" type="button" data-action="helpful" aria-label="مفيد بود" title="مفید بود">' + ICONS.thumbUp + '</button>' +
        '<button class="asw-fb-btn thumbs-down" type="button" data-action="not_helpful" aria-label="مفيد نبود" title="مفید نبود">' + ICONS.thumbDown + '</button>';
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

      // Visual feedback
      feedbackDiv.querySelectorAll(".asw-fb-btn").forEach(function (b) {
        if (b.dataset.action === "copy") return;
        b.classList.remove("active");
        b.disabled = true;
      });
      btn.classList.add("active");

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

    /* ─── Loading State — staged AI thinking statuses ─── */
    setLoading(loading) {
      var self = this;
      this.isLoading = loading;
      this.typing.hidden = !loading;
      this.input.disabled = loading;
      this.input.placeholder = loading ? "در حال پاسخ‌دهی..." : this.options.inputPlaceholder;
      if (this.subtitleEl) {
        this.subtitleEl.textContent = loading ? "در حال نوشتن…" : this.options.subtitle;
      }
      if (loading) {
        this._statusIdx = 0;
        if (this.typingLabel) this.typingLabel.textContent = THINKING_STATUSES[0];
        if (this._statusTimer) clearInterval(this._statusTimer);
        this._statusTimer = setInterval(function () {
          self._statusIdx = ((self._statusIdx || 0) + 1) % THINKING_STATUSES.length;
          if (self.typingLabel) self.typingLabel.textContent = THINKING_STATUSES[self._statusIdx];
        }, 1600);
        this.sendBtn.classList.add("asw-stop");
        this.sendBtn.innerHTML = ICONS.stop;
      } else {
        if (this._statusTimer) { clearInterval(this._statusTimer); this._statusTimer = null; }
        this.sendBtn.classList.remove("asw-stop");
        this.sendBtn.innerHTML = ICONS.arrowUp;
      }
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
      var timeout = setTimeout(function () { self.abortStream.abort(); }, Number(this.options.timeoutMs) || 60000);

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
              // No SSE support (older proxy) — fall back to JSON chat.
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
          // Let the typewriter finish, then finalize.
          streamClosed = true;
          ensurePaint();
        } else if (!streamedText) {
          // SSE stream empty/unsupported → classic JSON roundtrip.
          var result = await this.callBackend(message);
          this.handleAnswerResult(result.answer, result);
        }
      } catch (err) {
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
        if (err.name === "AbortError") {
          // User stop or timeout: keep partial text if meaningful.
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
      // Always offer the contact form as the guaranteed channel.
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
      var timeout = setTimeout(function () { controller.abort(); }, Number(this.options.timeoutMs) || 45000);
      try {
        var res = await fetch(this.options.apiEndpoint, {
          method: "POST", mode: "cors", credentials: "omit",
          headers: this.getHeaders(),
          body: JSON.stringify({
            message: message,
            conversation_id: this.conversationId,
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
