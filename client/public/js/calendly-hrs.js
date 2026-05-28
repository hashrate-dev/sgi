(function () {
  var LABELS = {
    es: "📅 Reserva una reunión",
    en: "📅 Book a meeting",
    pt: "📅 Agende uma reunião",
  };

  function resolveLang() {
    var stored = "";
    try {
      stored = (localStorage.getItem("marketplace-lang") || "").toLowerCase();
    } catch (e) {
      /* ignore */
    }
    if (stored === "es" || stored === "en" || stored === "pt") return stored;
    var htmlLang = (document.documentElement.lang || "").toLowerCase().slice(0, 2);
    if (htmlLang === "es" || htmlLang === "en" || htmlLang === "pt") return htmlLang;
    return "en";
  }

  function getLabel() {
    return LABELS[resolveLang()] || LABELS.en;
  }

  function getCalendlyUrl() {
    var lang = resolveLang();
    var locale = lang === "pt" ? "pt-BR" : lang;
    var base = "https://calendly.com/hashrate-space/30min";
    var params = [
      "hide_event_type_details=0",
      "hide_gdpr_banner=1",
      "background_color=f5f8fa",
      "text_color=14324a",
      "primary_color=36a08e",
      "locale=" + encodeURIComponent(locale),
    ];
    if (typeof window !== "undefined" && window.location && window.location.hostname) {
      params.push("embed_domain=" + encodeURIComponent(window.location.hostname));
    }
    return base + "?" + params.join("&");
  }

  function whenCalendlyReady(cb) {
    if (window.Calendly && typeof window.Calendly.initPopupWidget === "function") {
      cb();
      return;
    }
    var attempts = 0;
    var timer = window.setInterval(function () {
      attempts += 1;
      if (window.Calendly && typeof window.Calendly.initPopupWidget === "function") {
        window.clearInterval(timer);
        cb();
        return;
      }
      if (attempts > 120) window.clearInterval(timer);
    }, 50);
  }

  function openCalendlyPopup() {
    whenCalendlyReady(function () {
      window.Calendly.initPopupWidget({ url: getCalendlyUrl() });
    });
  }

  function ensureFab() {
    var existing = document.getElementById("hrs-calendly-fab");
    if (existing) {
      existing.textContent = getLabel();
      return existing;
    }
    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "hrs-calendly-fab";
    btn.textContent = getLabel();
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      openCalendlyPopup();
    });
    document.body.appendChild(btn);
    return btn;
  }

  function hideLegacyBadge() {
    var legacy = document.querySelector(".calendly-badge-widget");
    if (legacy) legacy.style.display = "none";
  }

  function init() {
    hideLegacyBadge();
    ensureFab();
    window.addEventListener("marketplace-lang-change", function () {
      ensureFab();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.HrsCalendly = {
    open: openCalendlyPopup,
    getUrl: getCalendlyUrl,
    refreshLabel: ensureFab,
  };
})();
