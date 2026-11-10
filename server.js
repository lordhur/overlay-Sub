#!/usr/bin/env node
/*
 * Petit serveur local (aucune dépendance) pour piloter l'overlay dans OBS.
 *
 *   npm start          → http://localhost:3000        (overlay)
 *                        http://localhost:3000/control.html (panneau)
 *
 * API :
 *   GET  /api/state                 → { state }
 *   POST /api/state                 ← { state }         (panneau / overlay)
 *   GET  /api/events                → SSE temps réel
 *   GET/POST /api/event?type=...    ← webhooks (Streamer.bot, StreamElements…)
 *   POST /api/reset                 → réinitialise
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const MAX_BODY = 512 * 1024;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

const baseTheme = {
  accent: "#F0610F",
  opacity: 0.68,
  blur: 12,
  height: 64,
  mode: "right",
  animations: true,
  hideEmpty: false,
  uppercase: true,
  progress: true,
};

function defaultState() {
  return {
    streamer: "LordHurTV",
    follower: { name: "", at: null },
    sub: { name: "", tier: "", months: 0, giftedBy: "", giftCount: 0, at: null },
    cheer: { kind: "bits", name: "", bits: 0, amount: 0, currency: "€", at: null },
    goal: { current: 0, target: 100, label: "SUBS" },
    show: { follower: true, sub: true, cheer: true, goal: true, clock: true },
    theme: Object.assign({}, baseTheme),
    clock: { seconds: true, showDate: true },
  };
}

function isObj(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function merge(base, patch) {
  const out = Object.assign({}, base);
  if (!isObj(patch)) return out;
  for (const key of Object.keys(patch)) {
    if (patch[key] === undefined) continue;
    out[key] = isObj(patch[key]) && isObj(out[key]) ? merge(out[key], patch[key]) : patch[key];
  }
  return out;
}

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (isObj(parsed)) return parsed;
  } catch (e) {
    /* pas encore de fichier */
  }
  return null;
}

let state = loadState();

let saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (err) {
      console.warn("[state] écriture impossible:", err.message);
    }
  }, 150);
}

/* -------------------------------------------------------------------------- */
/* SSE                                                                        */
/* -------------------------------------------------------------------------- */

const clients = new Set();

function sendEvent(name, payload) {
  const chunk = "event: " + name + "\ndata: " + JSON.stringify(payload) + "\n\n";
  for (const res of clients) {
    try {
      res.write(chunk);
    } catch (e) {
      clients.delete(res);
    }
  }
}

function broadcastState() {
  sendEvent("state", { state, at: Date.now() });
}

setInterval(() => {
  for (const res of clients) {
    try {
      res.write(": ping\n\n");
    } catch (e) {
      clients.delete(res);
    }
  }
}, 25000).unref();

/* -------------------------------------------------------------------------- */
/* Helpers HTTP                                                               */
/* -------------------------------------------------------------------------- */

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  res.setHeader("Cache-Control", "no-store");
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  cors(res);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("payload trop volumineux"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function parsePayload(req, urlObj) {
  const query = Object.fromEntries(urlObj.searchParams.entries());
  let body = {};
  if (req.method === "POST" || req.method === "PUT") {
    const raw = await readBody(req);
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch (e) {
        body = Object.fromEntries(new URLSearchParams(raw).entries());
      }
    }
  }
  if (isObj(body.state)) body = body.state;
  return Object.assign({}, query, body);
}

/* -------------------------------------------------------------------------- */
/* Événements (webhooks)                                                      */
/* -------------------------------------------------------------------------- */

function normalizeType(value) {
  const type = String(value || "").toLowerCase().replace(/[\s_-]+/g, "");
  if (["follow", "follower", "newfollower"].includes(type)) return "follow";
  if (["sub", "subscription", "subscribe", "resub"].includes(type)) return "sub";
  if (["subgift", "giftsub", "gifted", "communitygift"].includes(type)) return "subgift";
  if (["bits", "cheer", "cheers"].includes(type)) return "bits";
  if (["donation", "don", "tip", "donate"].includes(type)) return "donation";
  if (["goal", "subgoal"].includes(type)) return "goal";
  return type;
}

function numberOr(value, fallback) {
  const n = Number(value);
  return isFinite(n) ? n : fallback;
}

function applyEvent(payload) {
  const type = normalizeType(payload.type || payload.event);
  const now = Date.now();
  const name = String(payload.name || payload.user || payload.username || payload.from || "").trim();
  const gifter = String(payload.gifter || payload.giftedBy || payload.sender || "").trim();
  const amount = numberOr(payload.amount ?? payload.donation, 0);
  const bits = numberOr(payload.bits ?? payload.amount, 0);
  const months = numberOr(payload.months, 0);
  const count = numberOr(payload.count ?? payload.giftCount ?? payload.quantity, 0);
  const base = state ? merge(defaultState(), state) : defaultState();

  if (!type) return { ok: false, error: "type manquant (follow, sub, subgift, bits, donation)" };

  let next = base;

  if (type === "follow") {
    next = merge(base, { follower: { name, at: now } });
  } else if (type === "sub") {
    next = merge(base, {
      sub: {
        name,
        tier: String(payload.tier || ""),
        months: months || 1,
        giftedBy: "",
        giftCount: 0,
        at: now,
      },
    });
  } else if (type === "subgift") {
    next = merge(base, {
      sub: {
        name: gifter ? name : "",
        tier: String(payload.tier || ""),
        months: months || 1,
        giftedBy: gifter || name,
        giftCount: count || 1,
        at: now,
      },
    });
  } else if (type === "bits") {
    next = merge(base, {
      cheer: {
        kind: "bits",
        name,
        bits,
        amount: 0,
        currency: String(payload.currency || "€"),
        at: now,
      },
    });
  } else if (type === "donation") {
    next = merge(base, {
      cheer: {
        kind: "donation",
        name,
        bits: 0,
        amount,
        currency: String(payload.currency || "€"),
        at: now,
      },
    });
  } else if (type === "goal") {
    next = merge(base, {
      goal: {
        current: numberOr(payload.current, base.goal.current),
        target: numberOr(payload.target, base.goal.target),
      },
    });
  } else {
    return { ok: false, error: "type inconnu: " + type };
  }

  next.updatedAt = now;
  state = next;
  saveState();
  broadcastState();
  return { ok: true, state };
}

/* -------------------------------------------------------------------------- */
/* Fichiers statiques                                                         */
/* -------------------------------------------------------------------------- */

function serveStatic(req, res, pathname) {
  let rel = pathname;
  if (rel === "/control") rel = "/control.html";
  if (rel === "/overlay") rel = "/overlay.html";

  const filePath = path.normalize(path.join(ROOT, rel));
  const relative = path.relative(ROOT, filePath);

  if (relative.startsWith("..") || path.isAbsolute(relative) || relative.split(path.sep)[0].startsWith(".")) {
    cors(res);
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Interdit");
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      cors(res);
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        '<!doctype html><meta charset="utf-8"><title>404</title>' +
          '<body style="background:#0b0e14;color:#eef2f9;font-family:sans-serif;padding:40px">' +
          '<h1>404</h1><p><a style="color:#ff8a3d" href="/">Overlay</a> · ' +
          '<a style="color:#ff8a3d" href="/control.html">Panneau de contrôle</a></p>'
      );
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    cors(res);
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Content-Length": stats.size,
      "Last-Modified": stats.mtime.toUTCString(),
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    fs.createReadStream(filePath)
      .on("error", () => res.end())
      .pipe(res);
  });
}

/* -------------------------------------------------------------------------- */
/* Serveur                                                                    */
/* -------------------------------------------------------------------------- */

const server = http.createServer(async (req, res) => {
  let urlObj;
  try {
    urlObj = new URL(req.url, "http://localhost");
  } catch (e) {
    res.writeHead(400);
    res.end();
    return;
  }

  const pathname = decodeURIComponent(urlObj.pathname);

  if (req.method === "OPTIONS") {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (pathname === "/api/state") {
    if (req.method === "GET" || req.method === "HEAD") {
      sendJson(res, 200, { state: state, server: "overlay-sub", at: Date.now() });
      return;
    }
    if (req.method === "POST" || req.method === "PUT") {
      try {
        const payload = await parsePayload(req, urlObj);
        const next = isObj(payload.state) ? payload.state : payload;
        if (!isObj(next)) throw new Error("état invalide");
        state = merge(state ? merge(defaultState(), state) : defaultState(), next);
        state.updatedAt = Date.now();
        saveState();
        broadcastState();
        sendJson(res, 200, { ok: true, state });
      } catch (e) {
        sendJson(res, 400, { ok: false, error: e.message });
      }
      return;
    }
    sendJson(res, 405, { ok: false, error: "méthode non supportée" });
    return;
  }

  if (pathname === "/api/event" || pathname.startsWith("/api/event/")) {
    try {
      const payload = await parsePayload(req, urlObj);
      if (pathname.startsWith("/api/event/")) {
        payload.type = payload.type || pathname.split("/api/event/")[1];
      }
      const result = applyEvent(payload);
      sendJson(res, result.ok ? 200 : 400, result);
    } catch (e) {
      sendJson(res, 400, { ok: false, error: e.message });
    }
    return;
  }

  if (pathname === "/api/reset") {
    if (req.method !== "POST") {
      sendJson(res, 405, { ok: false, error: "utilise POST" });
      return;
    }
    state = defaultState();
    state.updatedAt = Date.now();
    saveState();
    broadcastState();
    sendJson(res, 200, { ok: true, state });
    return;
  }

  if (pathname === "/api/events") {
    cors(res);
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write("retry: 2000\n\n");
    clients.add(res);
    if (state) {
      res.write("event: state\ndata: " + JSON.stringify({ state, at: Date.now() }) + "\n\n");
    }
    req.on("close", () => {
      clients.delete(res);
    });
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { ok: false, error: "méthode non supportée" });
    return;
  }

  /*
   * La racine sert le panneau de contrôle dans un navigateur classique et
   * l'overlay transparent dans OBS (détection du User-Agent) — pratique quand
   * on colle simplement http://localhost:3000 dans une source navigateur.
   * ?overlay force l'overlay, ?control force le panneau.
   */
  let rel = pathname;
  if (rel === "/" || rel === "/index.html") {
    const ua = String(req.headers["user-agent"] || "");
    const forceOverlay = urlObj.searchParams.has("overlay");
    const forceControl = urlObj.searchParams.has("control");
    const isObs = /OBS|streamlabs|xsplit|vmix/i.test(ua);
    rel = forceOverlay || (isObs && !forceControl) ? "/overlay.html" : "/control.html";
  }

  serveStatic(req, res, rel);
});

server.listen(PORT, HOST, () => {
  const line = "─".repeat(58);
  console.log("\n" + line);
  console.log("  Overlay LordHurTV — serveur local");
  console.log(line);
  console.log("  Panneau  : http://localhost:" + PORT + "/");
  console.log("  Overlay  : http://localhost:" + PORT + "/overlay.html");
  console.log("  Webhook  : http://localhost:" + PORT + "/api/event?type=follow&name=Pseudo");
  console.log(line);
  console.log("  Astuce OBS : source navigateur 1920x1080, URL http://localhost:" + PORT + "/overlay.html");
  console.log("  Ne pas oublier de cocher « Arrêter la source lorsque masquée ».");
  console.log(line + "\n");
});
