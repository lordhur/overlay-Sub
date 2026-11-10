/*
 * OverlayState — état partagé entre l'overlay (overlay.html) et le panneau de
 * contrôle (control.html).
 *
 * Canaux de synchronisation (dans l'ordre de priorité) :
 *  1. Petit serveur local (server.js) via SSE + POST /api/state  → OBS sur le même PC / le LAN
 *  2. BroadcastChannel + localStorage                            → même navigateur (aperçu live)
 *  3. Supabase Realtime (optionnel, config.js > cloud)           → GitHub Pages / contrôle à distance
 */
(function (global) {
  "use strict";

  var CFG = global.OVERLAY_CONFIG || {};
  var DEFAULTS = (CFG.defaults ? JSON.parse(JSON.stringify(CFG.defaults)) : {});
  var KEY = "lordhur-overlay:state";
  var CHANNEL = "lordhur-overlay";
  var clientId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  var state = null;
  var listeners = [];
  var bc = null;
  var serverMode = false;
  var serverChecked = false;
  var eventSource = null;
  var publishTimer = null;
  var cloudChannel = null;
  var cloudClient = null;
  var cloudCfg = null;
  var cloudReady = false;

  /* ------------------------------------------------------------------ */
  /* Utilitaires                                                         */
  /* ------------------------------------------------------------------ */

  function isObj(v) {
    return v !== null && typeof v === "object" && !Array.isArray(v);
  }

  function merge(base, patch) {
    var out = {};
    var k;
    for (k in base) if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
    if (!isObj(patch)) return out;
    for (k in patch) {
      if (!Object.prototype.hasOwnProperty.call(patch, k)) continue;
      var v = patch[k];
      if (v === undefined) continue;
      out[k] = isObj(v) && isObj(out[k]) ? merge(out[k], v) : v;
    }
    return out;
  }

  function equal(a, b) {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch (e) {
      return false;
    }
  }

  function defaults() {
    return merge(DEFAULTS, {});
  }

  function readLocal() {
    try {
      var raw = global.localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeLocal() {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      /* quota / navigation privée : on ignore */
    }
  }

  function num(value, fallback) {
    var n = parseFloat(value);
    return isFinite(n) ? n : fallback;
  }

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  /* Surcharges par l'URL (pratique pour tester dans OBS) */
  function fromQuery() {
    var patch = {};
    var p;
    try {
      p = new URLSearchParams(global.location.search);
    } catch (e) {
      return patch;
    }
    if (p.has("name")) patch.streamer = p.get("name");
    if (p.has("follower")) patch.follower = { name: p.get("follower") };
    if (p.has("sub")) patch.sub = { name: p.get("sub") };
    if (p.has("subgift")) patch.sub = { giftedBy: p.get("subgift") };
    if (p.has("bits")) {
      patch.cheer = { kind: "bits", bits: num(p.get("bits"), 0) };
      if (p.has("cheerName")) patch.cheer.name = p.get("cheerName");
    }
    if (p.has("don")) {
      patch.cheer = { kind: "donation", amount: num(p.get("don"), 0) };
      if (p.has("donName")) patch.cheer.name = p.get("donName");
      if (p.has("currency")) patch.cheer.currency = p.get("currency");
    }
    if (p.has("goal")) {
      var g = String(p.get("goal")).split("/");
      patch.goal = {
        current: num(g[0], 0),
        target: num(g[1], num(g[0], 0)),
      };
    }
    if (p.has("goalLabel")) patch.goal = { label: p.get("goalLabel") };
    var theme = {};
    if (p.has("accent")) theme.accent = String(p.get("accent")).replace(/^#?/, "#");
    if (p.has("opacity")) theme.opacity = clamp(num(p.get("opacity"), 0.68), 0.05, 1);
    if (p.has("blur")) theme.blur = clamp(num(p.get("blur"), 12), 0, 40);
    if (p.has("height")) theme.height = clamp(num(p.get("height"), 72), 40, 160);
    if (p.get("mode") === "right" || p.get("mode") === "full") theme.mode = p.get("mode");
    if (p.has("hideEmpty")) theme.hideEmpty = p.get("hideEmpty") !== "0";
    if (p.has("noanim")) theme.animations = false;
    if (Object.keys(theme).length) patch.theme = theme;
    return patch;
  }

  /* ------------------------------------------------------------------ */
  /* Émission / rendu                                                    */
  /* ------------------------------------------------------------------ */

  function emit(source) {
    listeners.forEach(function (fn) {
      try {
        fn(state, source);
      } catch (e) {
        console.error("[overlay] listener", e);
      }
    });
  }

  function onChange(fn) {
    if (typeof fn === "function") listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (f) {
        return f !== fn;
      });
    };
  }

  /* ------------------------------------------------------------------ */
  /* Diffusion locale + serveur + cloud                                  */
  /* ------------------------------------------------------------------ */

  function broadcastLocal() {
    if (!bc) return;
    try {
      bc.postMessage({ type: "state", source: clientId, state: state });
    } catch (e) {
      /* ignore */
    }
  }

  function postServer() {
    if (!serverMode) return;
    try {
      fetch("api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: state }),
        keepalive: true,
      }).catch(function () {});
    } catch (e) {
      /* ignore */
    }
  }

  function cloudSend() {
    if (!cloudChannel || !cloudReady) return;
    try {
      cloudChannel.send({
        type: "broadcast",
        event: "state",
        payload: { source: clientId, state: state },
      });
    } catch (e) {
      /* ignore */
    }
  }

  function cloudPersist() {
    if (!cloudCfg || !cloudCfg.persist || !cloudReady) return;
    try {
      fetch(cloudCfg.supabaseUrl + "/rest/v1/" + cloudCfg.table, {
        method: "POST",
        headers: {
          apikey: cloudCfg.supabaseAnonKey,
          Authorization: "Bearer " + cloudCfg.supabaseAnonKey,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify([
          { id: cloudCfg.rowId, state: state, updated_at: new Date().toISOString() },
        ]),
      }).catch(function () {});
    } catch (e) {
      /* ignore */
    }
  }

  function publishNow() {
    postServer();
    cloudSend();
    cloudPersist();
  }

  function schedulePublish() {
    clearTimeout(publishTimer);
    publishTimer = setTimeout(publishNow, 90);
  }

  /* ------------------------------------------------------------------ */
  /* Réception                                                           */
  /* ------------------------------------------------------------------ */

  function applyRemote(next, source) {
    if (!isObj(next)) return;
    var merged = merge(defaults(), next);
    if (equal(merged, state)) return;
    state = merged;
    writeLocal();
    emit(source || "remote");
  }

  /* ------------------------------------------------------------------ */
  /* Connexion serveur local                                             */
  /* ------------------------------------------------------------------ */

  function probeServer() {
    if (!/^https?:$/.test(global.location.protocol)) {
      serverChecked = true;
      return;
    }
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () {
      if (ctrl) ctrl.abort();
    }, 2000);

    fetch("api/state", {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: ctrl ? ctrl.signal : undefined,
    })
      .then(function (res) {
        if (!res.ok) throw new Error("no server");
        var type = res.headers.get("content-type") || "";
        if (type.indexOf("application/json") === -1) throw new Error("not api");
        return res.json();
      })
      .then(function (data) {
        clearTimeout(timer);
        serverMode = true;
        serverChecked = true;
        if (data && isObj(data.state)) {
          applyRemote(data.state, "server");
        } else {
          /* Premier lancement du serveur : on y dépose l'état courant. */
          postServer();
        }
        openStream();
      })
      .catch(function () {
        clearTimeout(timer);
        serverChecked = true;
      });
  }

  function openStream() {
    if (!serverMode || eventSource || typeof EventSource === "undefined") return;
    try {
      eventSource = new EventSource("api/events");
      eventSource.addEventListener("state", function (e) {
        try {
          var data = JSON.parse(e.data);
          if (data && data.state) applyRemote(data.state, "server");
        } catch (err) {
          /* ignore */
        }
      });
      eventSource.addEventListener("error", function () {
        /* EventSource se reconnecte tout seul */
      });
    } catch (e) {
      eventSource = null;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Connexion Supabase (optionnelle)                                    */
  /* ------------------------------------------------------------------ */

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = function () {
        reject(new Error("script"));
      };
      document.head.appendChild(s);
    });
  }

  function cloudSettings() {
    var cfg = merge(
      { supabaseUrl: "", supabaseAnonKey: "", channel: "lordhurtv-overlay", table: "overlay_state", rowId: "lordhurtv", persist: false },
      CFG.cloud || {}
    );
    try {
      var local = JSON.parse(global.localStorage.getItem("lordhur-overlay:cloud") || "null");
      if (isObj(local)) cfg = merge(cfg, local);
    } catch (e) {
      /* ignore */
    }
    return cfg;
  }

  function connectCloud() {
    cloudCfg = cloudSettings();
    if (!cloudCfg.supabaseUrl || !cloudCfg.supabaseAnonKey) return;

    var ready =
      global.supabase && global.supabase.createClient
        ? Promise.resolve()
        : loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js");

    ready
      .then(function () {
        if (!global.supabase || !global.supabase.createClient) throw new Error("supabase indisponible");
        cloudClient = global.supabase.createClient(cloudCfg.supabaseUrl, cloudCfg.supabaseAnonKey);
        cloudChannel = cloudClient.channel(cloudCfg.channel, {
          config: { broadcast: { self: false, ack: false } },
        });
        cloudChannel.on("broadcast", { event: "state" }, function (message) {
          var payload = message && message.payload;
          if (!payload || payload.source === clientId) return;
          applyRemote(payload.state, "cloud");
        });
        cloudChannel.subscribe(function (status) {
          var wasReady = cloudReady;
          cloudReady = status === "SUBSCRIBED";
          if (cloudReady && !wasReady) {
            emit("cloud-status");
            if (cloudCfg.persist) pullCloud();
          }
        });
      })
      .catch(function (err) {
        console.warn("[overlay] cloud:", err && err.message ? err.message : err);
      });
  }

  function pullCloud() {
    if (!cloudCfg || !cloudCfg.supabaseUrl) return;
    var url =
      cloudCfg.supabaseUrl +
      "/rest/v1/" +
      cloudCfg.table +
      "?id=eq." +
      encodeURIComponent(cloudCfg.rowId) +
      "&select=state";
    fetch(url, {
      headers: {
        apikey: cloudCfg.supabaseAnonKey,
        Authorization: "Bearer " + cloudCfg.supabaseAnonKey,
      },
    })
      .then(function (r) {
        if (!r.ok) throw new Error("lecture impossible");
        return r.json();
      })
      .then(function (rows) {
        if (Array.isArray(rows) && rows[0] && isObj(rows[0].state)) applyRemote(rows[0].state, "cloud");
      })
      .catch(function () {});
  }

  /* ------------------------------------------------------------------ */
  /* API publique                                                        */
  /* ------------------------------------------------------------------ */

  function init() {
    state = merge(defaults(), readLocal());
    state = merge(state, fromQuery());
    emit("init");

    if ("BroadcastChannel" in global) {
      try {
        bc = new BroadcastChannel(CHANNEL);
        bc.onmessage = function (e) {
          var d = e.data;
          if (!d || d.source === clientId) return;
          applyRemote(d.state, "broadcast");
        };
      } catch (e) {
        bc = null;
      }
    }

    global.addEventListener("storage", function (e) {
      if (e.key !== KEY || !e.newValue) return;
      try {
        applyRemote(JSON.parse(e.newValue), "storage");
      } catch (err) {
        /* ignore */
      }
    });

    try {
      probeServer();
    } catch (e) {
      serverChecked = true;
    }
    try {
      connectCloud();
    } catch (e) {
      /* cloud optionnel */
    }
    return state;
  }

  function get() {
    return state;
  }

  function set(patch) {
    if (!isObj(patch)) return state;
    state = merge(state, patch);
    state.updatedAt = Date.now();
    writeLocal();
    emit("local");
    broadcastLocal();
    schedulePublish();
    return state;
  }

  function replace(next) {
    if (!isObj(next)) return state;
    state = merge(defaults(), next);
    state.updatedAt = Date.now();
    writeLocal();
    emit("local");
    broadcastLocal();
    schedulePublish();
    return state;
  }

  function reset() {
    return replace(defaults());
  }

  function status() {
    return {
      server: serverMode,
      serverChecked: serverChecked,
      cloud: cloudReady,
      cloudConfigured: !!(cloudCfg && cloudCfg.supabaseUrl),
      clientId: clientId,
    };
  }

  global.OverlayState = {
    init: init,
    get: get,
    set: set,
    replace: replace,
    reset: reset,
    onChange: onChange,
    status: status,
    defaults: defaults,
    clientId: clientId,
  };
})(window);
