/* Panneau de contrôle — overlay OBS */
(function (global) {
  "use strict";

  var CFG = global.OVERLAY_CONFIG || {};
  var $ = function (id) {
    return document.getElementById(id);
  };

  var state = OverlayState.init();
  var demoTimer = null;
  var toastTimer = null;
  var localWarned = false;

  var NAMES = [
    "Litchitchi",
    "Nymphidiel_",
    "Miguel",
    "Aurore",
    "Kael",
    "Sardoche",
    "Kitsunee",
    "Zelda",
    "Nono",
    "Mystik",
    "Vex",
    "Aeloria",
    "Pixel",
    "Tonio",
  ];
  var GIFTERS = ["Mystik", "Litchitchi", "Kitsunee", "Vex", "Aurore", "Nono"];

  /* ------------------------------------------------------------------ */
  /* Utilitaires état                                                    */
  /* ------------------------------------------------------------------ */

  function getPath(obj, path) {
    return path.split(".").reduce(function (o, key) {
      return o == null ? undefined : o[key];
    }, obj);
  }

  function patchFor(path, value) {
    var parts = path.split(".");
    var patch = value;
    for (var i = parts.length - 1; i >= 0; i--) {
      var wrap = {};
      wrap[parts[i]] = patch;
      patch = wrap;
    }
    return patch;
  }

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function toast(message, kind) {
    var el = $("toast");
    if (!el) return;
    el.textContent = message;
    el.dataset.kind = kind || "info";
    el.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove("is-visible");
    }, 2600);
  }

  /* ------------------------------------------------------------------ */
  /* Synchro formulaire                                                  */
  /* ------------------------------------------------------------------ */

  var inputs = Array.prototype.slice.call(document.querySelectorAll("[data-path]"));

  function bindInputs() {
    inputs.forEach(function (input) {
      input.addEventListener("input", function () {
        var value;
        if (input.type === "checkbox") {
          value = input.checked;
        } else if (input.type === "number" || input.type === "range") {
          value = input.value === "" ? 0 : Number(input.value);
        } else {
          value = input.value;
        }

        if (input.type === "text" && input.dataset.path === "theme.accent") {
          var hex = value.trim();
          if (!/^#?[0-9a-fA-F]{6}$/.test(hex)) return;
          value = "#" + hex.replace("#", "");
        }

        OverlayState.set(patchFor(input.dataset.path, value));
        syncPathInputs(input.dataset.path, value);
      });

      input.addEventListener("change", function () {
        if (input.type === "text" && input.dataset.path !== "theme.accent") {
          input.value = input.value.trim();
          OverlayState.set(patchFor(input.dataset.path, input.value));
        }
      });
    });
  }

  function syncPathInputs(path, value) {
    inputs.forEach(function (input) {
      if (input.dataset.path !== path) return;
      if (document.activeElement === input) return;
      if (input.type === "checkbox") input.checked = !!value;
      else if (input.type === "color") input.value = value;
      else if (input.type === "text" && path === "theme.accent") input.value = String(value).toUpperCase();
      else input.value = value == null ? "" : value;
    });
  }

  function updateOutputs(s) {
    inputs.forEach(function (input) {
      var outId = input.dataset.output;
      if (!outId) return;
      var out = $(outId);
      if (!out) return;
      var value = Number(input.value);
      var format = input.dataset.format;
      if (format === "percent") out.textContent = Math.round(value * 100) + " %";
      else if (format === "px") out.textContent = Math.round(value) + " px";
      else out.textContent = String(value);
    });
  }

  function updateSegs(s) {
    var gift = !!s.sub.giftedBy || Number(s.sub.giftCount) > 0;
    var kind = s.cheer.kind === "donation" ? "donation" : "bits";
    var subType = $("subType");
    if (subType) {
      subType.querySelectorAll("button").forEach(function (b) {
        b.classList.toggle("is-active", b.dataset.value === (gift ? "subgift" : "sub"));
      });
    }

    var cheerType = $("cheerType");
    if (cheerType) {
      cheerType.querySelectorAll("button").forEach(function (b) {
        b.classList.toggle("is-active", b.dataset.value === kind);
      });
    }

    var barMode = $("barMode");
    if (barMode) {
      var mode = s.theme.mode === "right" ? "right" : "full";
      barMode.querySelectorAll("button").forEach(function (b) {
        b.classList.toggle("is-active", b.dataset.value === mode);
      });
    }

    document.querySelectorAll(".gift-only").forEach(function (el) {
      el.style.display = gift ? "" : "none";
    });
    document.querySelectorAll(".bits-only").forEach(function (el) {
      el.style.display = kind === "bits" ? "" : "none";
    });
    document.querySelectorAll(".don-only").forEach(function (el) {
      el.style.display = kind === "donation" ? "" : "none";
    });
  }

  function renderForm(s) {
    if (!s) return;
    inputs.forEach(function (input) {
      if (document.activeElement === input) return;
      var value = getPath(s, input.dataset.path);
      if (input.type === "checkbox") input.checked = !!value;
      else if (value === undefined || value === null) input.value = "";
      else if (input.type === "text" && input.dataset.path === "theme.accent") input.value = String(value).toUpperCase();
      else input.value = value;
    });
    updateOutputs(s);
    updateSegs(s);
  }

  function updateStatus() {
    var st = OverlayState.status();
    var el = $("connStatus");
    var txt = $("connText");
    if (!el || !txt) return;

    if (st.server) {
      el.dataset.state = "server";
      txt.textContent = "Serveur local connecté";
      el.title = "L'overlay et ce panneau sont synchronisés via server.js (localhost / LAN).";
    } else if (st.cloud) {
      el.dataset.state = "cloud";
      txt.textContent = "Synchro cloud active";
      el.title = "Synchronisation Supabase Realtime active (GitHub Pages / contrôle à distance).";
    } else if (!st.serverChecked) {
      el.dataset.state = "pending";
      txt.textContent = "Détection…";
      el.title = "Recherche d'un serveur local.";
    } else {
      el.dataset.state = "local";
      txt.textContent = "Mode local";
      el.title =
        "Les réglages restent dans ce navigateur. Lance `npm start` pour piloter OBS en direct, ou configure Supabase (README).";
      if (!localWarned) {
        localWarned = true;
        setTimeout(function () {
          toast("Mode local — lance npm start pour piloter OBS en direct");
        }, 1200);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Contrôles segmentés                                                 */
  /* ------------------------------------------------------------------ */

  function bindSeg(id, onPick) {
    var el = $(id);
    if (!el) return;
    el.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-value]");
      if (!btn) return;
      onPick(btn.dataset.value);
    });
  }

  function bindControls() {
    bindSeg("subType", function (value) {
      var s = OverlayState.get();
      if (value === "subgift") {
        OverlayState.set({
          sub: {
            giftedBy: s.sub.giftedBy || "",
            giftCount: Math.max(1, Number(s.sub.giftCount) || 1),
          },
        });
      } else {
        OverlayState.set({ sub: { giftedBy: "", giftCount: 0 } });
      }
    });

    bindSeg("cheerType", function (value) {
      OverlayState.set({
        cheer: {
          kind: value === "donation" ? "donation" : "bits",
          amount: Number(OverlayState.get().cheer.amount) || (value === "donation" ? 5 : 0),
          bits: Number(OverlayState.get().cheer.bits) || (value === "bits" ? 500 : 0),
        },
      });
    });

    bindSeg("barMode", function (value) {
      OverlayState.set({ theme: { mode: value === "right" ? "right" : "full" } });
    });

    var bgSwitch = $("bgSwitch");
    if (bgSwitch) {
      bgSwitch.addEventListener("click", function (e) {
        var btn = e.target.closest("button[data-bg]");
        if (!btn) return;
        bgSwitch.querySelectorAll("button").forEach(function (b) {
          b.classList.toggle("is-active", b === btn);
        });
        setPreviewBg(btn.dataset.bg);
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Aperçu                                                              */
  /* ------------------------------------------------------------------ */

  function setPreviewBg(bg) {
    var frame = $("previewFrame");
    if (!frame) return;
    try {
      var url = new URL("overlay.html", location.href);
      url.searchParams.set("preview", "1");
      if (bg && bg !== "none") url.searchParams.set("bg", bg);
      frame.src = url.href;
    } catch (e) {
      /* ignore */
    }
  }

  function fitPreview() {
    var wrap = $("previewWrap");
    var frame = $("previewFrame");
    if (!wrap || !frame) return;
    var scale = wrap.clientWidth / 1920;
    frame.style.transform = "scale(" + scale + ")";
  }

  /* ------------------------------------------------------------------ */
  /* Simulations                                                         */
  /* ------------------------------------------------------------------ */

  function simulate(type) {
    var name = pick(NAMES);

    if (type === "follower") {
      OverlayState.set({ follower: { name: name, at: Date.now() } });
      toast("Nouveau follower : " + name);
    } else if (type === "sub") {
      OverlayState.set({
        sub: {
          name: name,
          tier: "Tier " + randInt(1, 3),
          months: pick([1, 1, 1, 3, 6, 12, 24]),
          giftedBy: "",
          giftCount: 0,
          at: Date.now(),
        },
      });
      toast("Nouveau sub : " + name);
    } else if (type === "subgift") {
      var gifter = pick(GIFTERS);
      var count = randInt(1, 10);
      OverlayState.set({
        sub: {
          name: count > 1 ? "" : name,
          tier: "Tier " + randInt(1, 3),
          months: 1,
          giftedBy: gifter,
          giftCount: count,
          at: Date.now(),
        },
      });
      toast(
        count > 1
          ? gifter + " offre " + count + " subs"
          : gifter + " offre un sub à " + name
      );
    } else if (type === "bits") {
      var bits = pick([100, 250, 500, 1000, 1500, 2500, 5000]);
      OverlayState.set({
        cheer: { kind: "bits", name: name, bits: bits, currency: "€", at: Date.now() },
      });
      toast(bits + " bits de " + name);
    } else if (type === "donation") {
      var amount = pick([2, 5, 10, 20, 50, 100]);
      OverlayState.set({
        cheer: { kind: "donation", name: name, amount: amount, currency: "€", at: Date.now() },
      });
      toast(amount + " € de " + name);
    } else if (type === "cheer") {
      simulate(Math.random() > 0.5 ? "bits" : "donation");
    } else if (type === "goal-plus") {
      var s = OverlayState.get();
      OverlayState.set({ goal: { current: Number(s.goal.current) + 1 } });
    }
  }

  function toggleDemo() {
    var btn = $("demoToggle");
    if (demoTimer) {
      clearInterval(demoTimer);
      demoTimer = null;
      if (btn) {
        btn.setAttribute("aria-pressed", "false");
        btn.textContent = "Lancer le mode démo automatique";
      }
      toast("Mode démo arrêté");
      return;
    }
    var types = demoTypes();
    demoTimer = setInterval(function () {
      simulate(pick(types));
    }, 6000);
    if (btn) {
      btn.setAttribute("aria-pressed", "true");
      btn.textContent = "Arrêter le mode démo";
    }
    toast("Mode démo lancé");
  }

  function demoTypes() {
    return ["follower", "sub", "subgift", "bits", "donation"];
  }

  /* ------------------------------------------------------------------ */
  /* Données                                                             */
  /* ------------------------------------------------------------------ */

  function exportState() {
    try {
      var blob = new Blob([JSON.stringify(OverlayState.get(), null, 2)], {
        type: "application/json",
      });
      var a = document.createElement("a");
      var d = new Date();
      a.href = URL.createObjectURL(blob);
      a.download =
        "overlay-lordhurtv-" +
        d.getFullYear() +
        ("0" + (d.getMonth() + 1)).slice(-2) +
        ("0" + d.getDate()).slice(-2) +
        ".json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () {
        URL.revokeObjectURL(a.href);
      }, 2000);
      toast("Export téléchargé");
    } catch (e) {
      toast("Export impossible", "error");
    }
  }

  function importState(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(String(reader.result));
        if (!data || typeof data !== "object") throw new Error("format");
        OverlayState.replace(data);
        renderForm(OverlayState.get());
        toast("Configuration importée");
      } catch (e) {
        toast("Fichier invalide", "error");
      }
    };
    reader.readAsText(file);
  }

  function copyObsUrl() {
    var url;
    try {
      url = new URL("overlay.html", location.href).href;
    } catch (e) {
      url = "overlay.html";
    }
    var done = function () {
      toast("URL OBS copiée : " + url);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () {
        fallbackCopy(url, done);
      });
    } else {
      fallbackCopy(url, done);
    }
  }

  function fallbackCopy(text, done) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      done();
    } catch (e) {
      toast("Copie impossible — URL : " + text, "error");
    }
    ta.remove();
  }

  /* ------------------------------------------------------------------ */
  /* Initialisation                                                      */
  /* ------------------------------------------------------------------ */

  bindInputs();
  bindControls();
  renderForm(state);
  updateStatus();

  OverlayState.onChange(function (s, source) {
    renderForm(s);
    updateStatus();
  });

  setInterval(updateStatus, 1500);

  document.querySelectorAll("[data-sim]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      simulate(btn.dataset.sim);
    });
  });

  var demoToggle = $("demoToggle");
  if (demoToggle) demoToggle.addEventListener("click", toggleDemo);

  var copyBtn = $("copyObs");
  if (copyBtn) copyBtn.addEventListener("click", copyObsUrl);

  var exportBtn = $("exportState");
  if (exportBtn) exportBtn.addEventListener("click", exportState);

  var importBtn = $("importState");
  var importFile = $("importFile");
  if (importBtn && importFile) {
    importBtn.addEventListener("click", function () {
      importFile.click();
    });
    importFile.addEventListener("change", function () {
      if (importFile.files && importFile.files[0]) importState(importFile.files[0]);
      importFile.value = "";
    });
  }

  var resetBtn = $("resetState");
  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      if (!confirm("Réinitialiser toutes les données de l'overlay ?")) return;
      OverlayState.reset();
      toast("Overlay réinitialisé");
    });
  }

  var resetTheme = $("resetTheme");
  if (resetTheme) {
    resetTheme.addEventListener("click", function () {
      var defaults = (CFG.defaults && CFG.defaults.theme) || {};
      OverlayState.set({ theme: defaults });
      toast("Apparence réinitialisée");
    });
  }

  var wrap = $("previewWrap");
  if (wrap) {
    fitPreview();
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(fitPreview).observe(wrap);
    } else {
      global.addEventListener("resize", fitPreview);
    }
  }

  global.ControlApp = {
    simulate: simulate,
    renderForm: renderForm,
  };
})(window);
