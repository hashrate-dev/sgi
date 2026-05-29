(function () {
  var LABELS = {
    es: "Reserva una reunión",
    en: "Book a meeting",
    pt: "Agende uma reunião",
  };

  var spinnerPurgeRaf = null;
  var appendChildPatched = false;

  function patchSpinnerAppendChild() {
    if (appendChildPatched) return;
    appendChildPatched = true;
    var originalAppendChild = Element.prototype.appendChild;
    var originalInsertBefore = Element.prototype.insertBefore;
    Element.prototype.appendChild = function (child) {
      if (child && child.classList && child.classList.contains("calendly-spinner")) {
        return child;
      }
      return originalAppendChild.call(this, child);
    };
    Element.prototype.insertBefore = function (child, ref) {
      if (child && child.classList && child.classList.contains("calendly-spinner")) {
        return child;
      }
      return originalInsertBefore.call(this, child, ref);
    };
  }

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
      "background_color=ffffff",
      "text_color=14324a",
      "primary_color=36a08e",
      "locale=" + encodeURIComponent(locale),
    ];
    if (typeof window !== "undefined" && window.location && window.location.hostname) {
      params.push("embed_domain=" + encodeURIComponent(window.location.hostname));
    }
    return base + "?" + params.join("&");
  }

  function injectSpinnerKillCss() {
    if (document.getElementById("hrs-calendly-kill-spinners")) return;
    var style = document.createElement("style");
    style.id = "hrs-calendly-kill-spinners";
    style.textContent =
      ".calendly-spinner,.calendly-spinner *,[class*='calendly-bounce']," +
      ".calendly-bounce1,.calendly-bounce2,.calendly-bounce3{" +
      "display:none!important;visibility:hidden!important;opacity:0!important;" +
      "width:0!important;height:0!important;overflow:hidden!important;" +
      "position:absolute!important;left:-99999px!important;top:-99999px!important;" +
      "pointer-events:none!important;animation:none!important}";
    document.head.appendChild(style);
  }

  function purgeAllSpinners() {
    var nodes = document.querySelectorAll(
      ".calendly-spinner, [class*='calendly-bounce'], .calendly-bounce1, .calendly-bounce2, .calendly-bounce3"
    );
    for (var i = nodes.length - 1; i >= 0; i--) {
      if (nodes[i].parentNode) {
        nodes[i].parentNode.removeChild(nodes[i]);
      }
    }
  }

  function removeSingleLoader(overlay) {
    if (!overlay) return;
    var loaders = overlay.querySelectorAll(".hrs-calendly-loader");
    for (var i = 0; i < loaders.length; i++) {
      if (loaders[i].parentNode) loaders[i].parentNode.removeChild(loaders[i]);
    }
  }

  function ensureSingleLoader(overlay) {
    if (!overlay || overlay.classList.contains("hrs-calendly-ready")) return;
    purgeAllSpinners();
    var loaders = overlay.querySelectorAll(".hrs-calendly-loader");
    for (var i = 1; i < loaders.length; i++) {
      if (loaders[i].parentNode) loaders[i].parentNode.removeChild(loaders[i]);
    }
    if (loaders.length > 0) return;
    var loader = document.createElement("div");
    loader.className = "hrs-calendly-loader";
    loader.setAttribute("role", "status");
    loader.setAttribute("aria-label", "Cargando calendario");
    loader.innerHTML = '<div class="hrs-calendly-loader__ring" aria-hidden="true"></div>';
    overlay.appendChild(loader);
  }

  function startSpinnerPurgeLoop() {
    if (spinnerPurgeRaf != null) return;
    function tick() {
      var overlay = document.querySelector(".calendly-overlay");
      if (!overlay) {
        spinnerPurgeRaf = null;
        return;
      }
      purgeAllSpinners();
      ensureSingleLoader(overlay);
      spinnerPurgeRaf = window.requestAnimationFrame(tick);
    }
    spinnerPurgeRaf = window.requestAnimationFrame(tick);
  }

  function stopSpinnerPurgeLoop() {
    if (spinnerPurgeRaf != null) {
      window.cancelAnimationFrame(spinnerPurgeRaf);
      spinnerPurgeRaf = null;
    }
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

  function getCalendlyViewportMaxHeight() {
    return Math.max(400, window.innerHeight - 24);
  }

  function applyCalendlyHeight(heightPx) {
    var overlay = document.querySelector(".calendly-overlay");
    if (!overlay || !heightPx) return;
    var popup = overlay.querySelector(".calendly-popup");
    var content = overlay.querySelector(".calendly-popup-content");
    var iframe = content && content.querySelector("iframe");
    if (!popup || !content) return;

    var maxAllowed = getCalendlyViewportMaxHeight();
    var maxH = Math.max(400, Math.min(Math.ceil(heightPx) + 12, maxAllowed));
    var h = maxH + "px";
    popup.style.setProperty("height", h, "important");
    popup.style.setProperty("max-height", maxAllowed + "px", "important");
    content.style.setProperty("height", h, "important");
    content.style.setProperty("max-height", "100%", "important");
    if (iframe) {
      iframe.style.setProperty("height", h, "important");
      iframe.style.setProperty("max-height", "100%", "important");
      iframe.setAttribute("scrolling", "no");
    }
  }

  function getCalendlyDefaultHeight() {
    return Math.min(680, getCalendlyViewportMaxHeight());
  }

  function resetCalendlyPopupSize(overlay) {
    applyCalendlyHeight(getCalendlyDefaultHeight());
  }

  function markCalendlyReady(overlay) {
    if (!overlay || overlay.classList.contains("hrs-calendly-ready")) return;
    overlay.classList.add("hrs-calendly-ready");
    purgeAllSpinners();
    removeSingleLoader(overlay);
    stopSpinnerPurgeLoop();
  }

  function scheduleMarkReady(overlay) {
    if (!overlay || overlay.classList.contains("hrs-calendly-ready")) return;
    if (overlay.dataset.hrsReadyScheduled === "1") return;
    overlay.dataset.hrsReadyScheduled = "1";
    window.setTimeout(function () {
      markCalendlyReady(overlay);
    }, 700);
  }

  function prepareCalendlyOverlay(overlay) {
    if (!overlay) return;
    overlay.classList.remove("hrs-calendly-ready");
    overlay.removeAttribute("data-hrs-ready-scheduled");
    purgeAllSpinners();
    ensureSingleLoader(overlay);
    startSpinnerPurgeLoop();
    var popup = overlay.querySelector(".calendly-popup");
    var content = popup && popup.querySelector(".calendly-popup-content");
    if (!content) return;
    var iframe = content.querySelector("iframe");
    if (iframe) {
      iframe.setAttribute("scrolling", "no");
    }
  }

  function setCalendlyOverlayBodyState(isOpen) {
    document.documentElement.classList.toggle("calendly-overlay-open", !!isOpen);
    document.body.classList.toggle("calendly-overlay-open", !!isOpen);
    if (!isOpen) {
      stopSpinnerPurgeLoop();
      purgeAllSpinners();
      var closed = document.querySelector(".calendly-overlay");
      if (closed) removeSingleLoader(closed);
    }
  }

  function watchCalendlyOverlayOnce() {
    function attachToOverlay(overlay) {
      setCalendlyOverlayBodyState(true);
      resetCalendlyPopupSize(overlay);
      prepareCalendlyOverlay(overlay);
      if (overlay.dataset.hrsObserved === "1") return;
      overlay.dataset.hrsObserved = "1";
      var obs = new MutationObserver(function () {
        purgeAllSpinners();
      });
      obs.observe(overlay, { childList: true, subtree: true });
      window.setTimeout(function () {
        prepareCalendlyOverlay(overlay);
      }, 50);
      window.setTimeout(function () {
        scheduleMarkReady(overlay);
      }, 9000);
    }

    var existing = document.querySelector(".calendly-overlay");
    if (existing) {
      attachToOverlay(existing);
      return;
    }

    var waitObs = new MutationObserver(function () {
      var overlay = document.querySelector(".calendly-overlay");
      if (!overlay) return;
      waitObs.disconnect();
      attachToOverlay(overlay);
    });
    waitObs.observe(document.body, { childList: true });
  }

  function setupCalendlyMessageListener() {
    if (setupCalendlyMessageListener._done) return;
    setupCalendlyMessageListener._done = true;

    var overlayCloseObs = new MutationObserver(function () {
      var overlay = document.querySelector(".calendly-overlay");
      setCalendlyOverlayBodyState(!!overlay);
    });
    overlayCloseObs.observe(document.body, { childList: true });

    window.addEventListener("message", function (e) {
      if (e.origin !== "https://calendly.com") return;
      var data = e.data;
      if (!data || typeof data.event !== "string") return;
      var overlay = document.querySelector(".calendly-overlay");
      if (data.event === "calendly.page_height") {
        var height = data.payload && data.payload.height;
        if (height) applyCalendlyHeight(height);
      }
      if (
        data.event === "calendly.event_type_viewed" ||
        data.event === "calendly.profile_page_view" ||
        data.event === "calendly.date_and_time_selected"
      ) {
        scheduleMarkReady(overlay);
      }
    });
  }

  function openCalendlyPopup() {
    whenCalendlyReady(function () {
      window.Calendly.initPopupWidget({ url: getCalendlyUrl() });
      watchCalendlyOverlayOnce();
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
    patchSpinnerAppendChild();
    injectSpinnerKillCss();
    purgeAllSpinners();
    hideLegacyBadge();
    setupCalendlyMessageListener();
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
