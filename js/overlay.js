/* Overlay OBS — rendu de la barre d'informations */
(function (global) {
  "use strict";

  var CFG = global.OVERLAY_CONFIG || {};
  var LABELS = Object.assign(
    {
      follower: "Dernier follower",
      sub: "Dernier sub",
      subgift: "Dernier subgift",
      bits: "Dernier bits",
      donation: "Dernier don",
      goal: "Objectif",
    },
    CFG.labels || {}
  );

  var ICONS = {
    heart:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>',
    star:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.6l2.83 5.86 6.47.87-4.74 4.49 1.2 6.42L12 17.15l-5.76 3.09 1.2-6.42-4.74-4.49 6.47-.87L12 2.6z"/></svg>',
    gift:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20 6h-2.18c.11-.31.18-.65.18-1a3 3 0 0 0-5.5-1.65L12 4.02l-.5-.67A3 3 0 0 0 6.5 5c0 .35.07.69.18 1H4.5A2.5 2.5 0 0 0 2 8.5V19a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8.5A2.5 2.5 0 0 0 20 6zM15 4.5c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM9 4.5c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM4 19v-2.5h16V19H4zm0-4.5V8.5h5.1L7.1 11l1.7 1.3 2.2-3.02 1-1.28 1 1.28L15.2 12.3 16.9 11l-2-2.5H20v6H4z"/></svg>',
    gem:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8.2 2.8h7.6L22 9.1 12 21.2 2 9.1l6.2-6.3z"/><path fill="#fff" opacity=".32" d="M8.2 2.8h7.6l1.9 2.4H6.3l1.9-2.4z"/><path fill="#000" opacity=".18" d="M12 5.2 15.7 9H8.3L12 5.2z"/></svg>',
    coin:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.4" fill="currentColor"/><circle cx="12" cy="12" r="6.6" fill="#1c2230" opacity=".16"/><path fill="#6d4400" opacity=".75" d="M12 7.4l1.35 2.72 3 .44-2.18 2.12.52 3L12 14.27l-2.69 1.41.52-3-2.18-2.12 3-.44L12 7.4z"/></svg>',
    target:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7" opacity=".5"/><path fill="currentColor" d="M12 6.9l1.6 3.3 3.6.47-2.65 2.5.67 3.55L12 14.99l-3.22 1.73.67-3.55-2.65-2.5 3.6-.47L12 6.9z"/></svg>',
  };

  var root = document.documentElement;
  var body = document.body;
  var bar = document.getElementById("bar");
  var slotsEl = document.getElementById("slots");
  var brandName = document.getElementById("streamerName");
  var clockEl = document.getElementById("clock");
  var clockTime = document.getElementById("clockTime");
  var clockDate = document.getElementById("clockDate");

  var nodes = {};
  var lastValues = {};
  var flashTimers = {};
  var lastState = null;
  var state0 = null;

  var SLOT_ORDER = ["follower", "sub", "cheer", "goal"];

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */

  function upper(text) {
    var s = String(text == null ? "" : text);
    var theme = (lastState && lastState.theme) || {};
    return theme.uppercase === false ? s : s.toUpperCase();
  }

  function nb(value, decimals) {
    var n = Number(value);
    if (!isFinite(n)) n = 0;
    try {
      return new Intl.NumberFormat("fr-FR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals || 0,
      }).format(n);
    } catch (e) {
      return String(n);
    }
  }

  function pad(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function lighten(hex, amount) {
    var h = String(hex || "").replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return hex;
    var r = parseInt(h.slice(0, 2), 16);
    var g = parseInt(h.slice(2, 4), 16);
    var b = parseInt(h.slice(4, 6), 16);
    function mix(c) {
      return Math.round(Math.min(255, c + (255 - c) * amount));
    }
    var out =
      "#" +
      [mix(r), mix(g), mix(b)]
        .map(function (c) {
          var v = c.toString(16);
          return v.length === 1 ? "0" + v : v;
        })
        .join("");
    return out;
  }

  function setText(node, text) {
    if (node && node.textContent !== text) node.textContent = text;
  }

  /* ------------------------------------------------------------------ */
  /* Construction des emplacements                                       */
  /* ------------------------------------------------------------------ */

  function buildSlot(id) {
    var el = document.createElement("div");
    el.className = "slot slot--" + id;
    el.dataset.slot = id;

    var icon = document.createElement("span");
    icon.className = "slot__icon";

    var text = document.createElement("div");
    text.className = "slot__text";

    var label = document.createElement("span");
    label.className = "slot__label";

    var value = document.createElement("span");
    value.className = "slot__value";

    var name = document.createElement("span");
    name.className = "slot__name";

    var meta = document.createElement("span");
    meta.className = "slot__meta";

    value.appendChild(name);
    value.appendChild(meta);
    text.appendChild(label);
    text.appendChild(value);
    el.appendChild(icon);
    el.appendChild(text);

    var progress = null;
    var progressFill = null;
    if (id === "goal") {
      progress = document.createElement("span");
      progress.className = "slot__progress";
      progressFill = document.createElement("i");
      progress.appendChild(progressFill);
      el.appendChild(progress);
    }

    slotsEl.appendChild(el);
    nodes[id] = {
      root: el,
      icon: icon,
      label: label,
      value: value,
      name: name,
      meta: meta,
      progress: progress,
      progressFill: progressFill,
      iconKey: "",
    };
  }

  function flash(id) {
    var node = nodes[id];
    if (!node) return;
    clearTimeout(flashTimers[id]);
    node.root.classList.remove("is-flash");
    /* force le redémarrage de l'animation */
    void node.root.offsetWidth;
    node.root.classList.add("is-flash");
    bar.classList.add("is-hot");
    clearTimeout(flashTimers.hot);
    flashTimers.hot = setTimeout(function () {
      bar.classList.remove("is-hot");
    }, 1000);
    flashTimers[id] = setTimeout(function () {
      node.root.classList.remove("is-flash");
    }, 1300);
  }

  function setIcon(id, key) {
    var node = nodes[id];
    if (!node || node.iconKey === key) return;
    node.icon.innerHTML = ICONS[key] || "";
    node.iconKey = key;
  }

  function setSlot(id, data, opts) {
    var node = nodes[id];
    if (!node) return;
    var hidden = !!opts.hide;

    node.root.style.display = hidden ? "none" : "";
    if (hidden) return;

    node.root.classList.toggle("slot--empty", !!opts.empty);

    var labelChanged = node.label.textContent !== opts.label;
    if (labelChanged) node.label.textContent = opts.label;

    var nameText = String(opts.name == null ? "" : opts.name);
    var metaText = String(opts.meta == null ? "" : opts.meta);
    if (node.name.textContent !== nameText) node.name.textContent = nameText;
    if (node.meta.textContent !== metaText) node.meta.textContent = metaText;
    node.meta.style.display = metaText ? "" : "none";

    if (node.progressFill && typeof opts.progress === "number") {
      node.progressFill.style.width = Math.max(0, Math.min(100, opts.progress)) + "%";
      node.progress.style.display = opts.showProgress === false ? "none" : "";
    }

    if (id === "cheer") node.root.dataset.kind = opts.kind || "bits";
    if (id === "sub") node.root.dataset.gift = opts.gift ? "1" : "0";

    var signature = [opts.label, nameText, metaText, opts.kind || "", opts.icon || ""].join("|");
    if (lastValues[id] !== undefined && lastValues[id] !== signature && opts.animate !== false) {
      flash(id);
    }
    lastValues[id] = signature;
  }

  /* ------------------------------------------------------------------ */
  /* Rendu des données                                                   */
  /* ------------------------------------------------------------------ */

  function renderFollower(s) {
    var theme = s.theme || {};
    var f = s.follower || {};
    var name = (f.name || "").trim();
    setIcon("follower", "heart");
    setSlot("follower", f, {
      hide: !s.show.follower || (theme.hideEmpty && !name),
      empty: !name,
      icon: "heart",
      label: LABELS.follower,
      name: name ? upper(name) : "—",
      meta: "",
      animate: true,
    });
  }

  function renderSub(s) {
    var theme = s.theme || {};
    var sub = s.sub || {};
    var name = (sub.name || "").trim();
    var giftedBy = (sub.giftedBy || "").trim();
    var giftCount = Number(sub.giftCount) || 0;
    var gift = !!giftedBy || giftCount > 0;

    var meta = "";
    if (giftedBy) {
      meta = giftCount > 1 ? "x" + giftCount + " offerts par " + giftedBy : "offert par " + giftedBy;
    } else if (gift) {
      meta = giftCount > 1 ? "x" + giftCount + " subs offerts" : "sub offert";
    } else if (Number(sub.months) > 1) {
      meta = sub.months + " mois";
    } else if (sub.tier) {
      meta = sub.tier;
    }
    if (giftedBy && sub.tier && giftCount <= 1) meta += " · " + sub.tier;

    setIcon("sub", gift ? "gift" : "star");
    setSlot("sub", sub, {
      hide: !s.show.sub || (theme.hideEmpty && !name && !giftedBy),
      empty: !name && !giftedBy,
      icon: gift ? "gift" : "star",
      gift: gift,
      label: gift ? LABELS.subgift : LABELS.sub,
      name: name ? upper(name) : giftedBy ? "SUBGIFT" : "—",
      meta: upper(meta),
      animate: true,
    });
  }

  function renderCheer(s) {
    var theme = s.theme || {};
    var cheer = s.cheer || {};
    var isDonation = cheer.kind === "donation";
    var name = (cheer.name || "").trim();
    var meta = "";

    if (isDonation) {
      var amount = Number(cheer.amount) || 0;
      meta = nb(amount, 2) + " " + (cheer.currency || "€");
      setIcon("cheer", "coin");
    } else {
      meta = nb(cheer.bits) + " BITS";
      setIcon("cheer", "gem");
    }

    setSlot("cheer", cheer, {
      hide: !s.show.cheer || (theme.hideEmpty && !name),
      empty: !name,
      icon: isDonation ? "coin" : "gem",
      kind: isDonation ? "donation" : "bits",
      label: isDonation ? LABELS.donation : LABELS.bits,
      name: name ? upper(name) : "—",
      meta: upper(meta),
      animate: true,
    });
  }

  function renderGoal(s) {
    var theme = s.theme || {};
    var goal = s.goal || {};
    var current = Number(goal.current) || 0;
    var target = Number(goal.target) || 0;
    var pct = target > 0 ? (current / target) * 100 : 0;

    setIcon("goal", "target");
    setSlot("goal", goal, {
      hide: !s.show.goal,
      empty: false,
      icon: "target",
      label: LABELS.goal,
      name: nb(current) + " / " + nb(target),
      meta: upper(goal.label || "SUBS"),
      progress: pct,
      showProgress: theme.progress !== false,
      animate: true,
    });
  }

  /* ------------------------------------------------------------------ */
  /* Thème + horloge                                                     */
  /* ------------------------------------------------------------------ */

  function applyTheme(theme) {
    theme = theme || {};
    root.style.setProperty("--accent", theme.accent || "#f0610f");
    root.style.setProperty("--accent-2", lighten(theme.accent || "#f0610f", 0.22));
    root.style.setProperty("--bar-opacity", String(theme.opacity != null ? theme.opacity : 0.68));
    root.style.setProperty("--blur", (theme.blur != null ? theme.blur : 12) + "px");
    root.style.setProperty("--frost", String(Math.min(0.22, (theme.blur != null ? theme.blur : 12) / 150)));
    root.style.setProperty("--bar-h", (theme.height || 72) + "px");
    bar.dataset.mode = theme.mode === "right" ? "right" : "full";
    body.classList.toggle("no-anim", theme.animations === false);
    body.dataset.upper = theme.uppercase === false ? "0" : "1";
  }

  function renderClock(s) {
    var show = s.show && s.show.clock;
    clockEl.style.display = show ? "" : "none";
    if (!show) return;
    var now = new Date();
    var time =
      pad(now.getHours()) +
      ":" +
      pad(now.getMinutes()) +
      (s.clock && s.clock.seconds === false ? "" : ":" + pad(now.getSeconds()));
    setText(clockTime, time);
    var showDate = !(s.clock && s.clock.showDate === false);
    clockDate.style.display = showDate ? "" : "none";
    if (showDate) {
      var yy = String(now.getFullYear()).slice(-2);
      setText(clockDate, pad(now.getDate()) + " " + pad(now.getMonth() + 1) + " " + yy);
    }
  }

  function tick() {
    if (lastState) renderClock(lastState);
  }

  /* ------------------------------------------------------------------ */
  /* Rendu global                                                        */
  /* ------------------------------------------------------------------ */

  function render(s, source) {
    if (!s) return;
    lastState = s;
    state0 = s;

    applyTheme(s.theme);
    setText(brandName, upper(s.streamer || "LordHurTV"));
    renderFollower(s);
    renderSub(s);
    renderCheer(s);
    renderGoal(s);
    renderClock(s);

  }

  /* ------------------------------------------------------------------ */
  /* Mode démo (test dans OBS, sans panneau)                             */
  /* ------------------------------------------------------------------ */

  var DEMO_NAMES = ["Litchitchi", "Nymphidiel_", "Miguel", "Aurore", "Kael", "Sardoche", "Nono", "Zelda"];
  var DEMO_GIFTS = ["Mystik", "Litchitchi", "Kitsunee", "Vex"];

  function startDemo() {
    var tickDemo = 0;
    setInterval(function () {
      var name = DEMO_NAMES[Math.floor(Math.random() * DEMO_NAMES.length)];
      var kind = tickDemo++ % 4;
      if (kind === 0) OverlayState.set({ follower: { name: name, at: Date.now() } });
      else if (kind === 1)
        OverlayState.set({
          sub: {
            name: name,
            tier: "Tier " + (1 + Math.floor(Math.random() * 3)),
            months: 1,
            giftedBy: "",
            giftCount: 0,
            at: Date.now(),
          },
        });
      else if (kind === 2)
        OverlayState.set({
          sub: {
            giftedBy: DEMO_GIFTS[Math.floor(Math.random() * DEMO_GIFTS.length)],
            giftCount: 1 + Math.floor(Math.random() * 9),
            name: "",
            at: Date.now(),
          },
        });
      else
        OverlayState.set({
          cheer: {
            kind: Math.random() > 0.6 ? "donation" : "bits",
            name: name,
            bits: [100, 500, 1000, 2500][Math.floor(Math.random() * 4)],
            amount: [5, 10, 20, 50][Math.floor(Math.random() * 4)],
            currency: "€",
            at: Date.now(),
          },
        });
    }, 7000);
  }

  /* ------------------------------------------------------------------ */
  /* Démarrage                                                           */
  /* ------------------------------------------------------------------ */

  SLOT_ORDER.forEach(buildSlot);

  try {
    var params = new URLSearchParams(location.search);
    var bg = params.get("bg");
    if (bg) body.dataset.bg = bg;
  } catch (e) {
    /* ignore */
  }

  OverlayState.init();
  OverlayState.onChange(render);
  render(OverlayState.get(), "init");
  setInterval(tick, 250);

  if (/(?:^|[?&])demo=1(?:&|$)/.test(location.search)) startDemo();

  global.OverlayApp = { render: render };
})(window);
