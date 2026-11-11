/* =============================================================================
 * agentStatusStream.js - live agent Login / Logout status (no page polling)
 *
 * Before: every open Users page called GET /telephony/agents every 2.5 s
 *         = the full agent list + login check, per browser tab, forever.
 *         10 admins with the page open = 240 heavy queries per minute.
 *
 * Now:    the browser loads the agent list once, then keeps ONE open
 *         connection to /telephony/agents/status-stream (Server-Sent Events).
 *         The server runs ONE small query every 2 s (only while someone is
 *         watching), works out who logged in / out, and pushes only the
 *         changes. 1 tab or 100 tabs = the same single query.
 *
 *   GET /telephony/agents/status-stream  -> live stream (text/event-stream)
 *   GET /telephony/agents/login-status   -> { online: [...] } (fallback, one-off)
 *
 * Optional, for instant updates: call notifyAgentStatusChanged() in your
 * login / logout / adminLogoutUser / logoutAllAgents handlers right after
 * the DB write. Without it, changes still show within ~2 seconds.
 * ========================================================================== */
const db = require("../models/db");

const POLL_MS = 2000; // how often the server checks login_log (only while clients are connected)
const HEARTBEAT_MS = 25000; // keeps proxies / browsers from closing an idle stream
const MAX_CLIENTS = 1000; // all users together
const MAX_PER_USER = 10; // tabs per logged-in user

const query = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)))
  );

/* ---------------------------------------------------------------------------
 * Who is logged in today - same rule as getAgent's loginStatus:
 * a login_log row with a token today. Date range (not DATE()) so it uses
 * the idx_login_time index; reads only today's rows.
 * ------------------------------------------------------------------------- */
const ONLINE_SQL = `
  SELECT DISTINCT l.user_name AS user_id, u.admin, u.user_type
    FROM login_log l
    JOIN users u ON u.user_id = l.user_name
   WHERE l.token IS NOT NULL
     AND l.log_in_time >= CURDATE()
     AND l.log_in_time < CURDATE() + INTERVAL 1 DAY`;

let onlineMap = new Map(); // user_id -> { admin, user_type }
let loadedAt = 0;
let loadPromise = null;

function loadOnline() {
  if (!loadPromise) {
    loadPromise = query(ONLINE_SQL)
      .then((rows) => {
        const map = new Map();
        rows.forEach((r) =>
          map.set(String(r.user_id), { admin: String(r.admin ?? ""), user_type: Number(r.user_type) })
        );
        onlineMap = map;
        loadedAt = Date.now();
        return map;
      })
      .finally(() => {
        loadPromise = null;
      });
  }
  return loadPromise;
}

const ensureFresh = (maxAgeMs = POLL_MS) =>
  Date.now() - loadedAt < maxAgeMs ? Promise.resolve(onlineMap) : loadOnline();

/* ---------------------------------------------------------------------------
 * Which users a viewer may see - same rules as getAgent
 * ------------------------------------------------------------------------- */
async function buildFilter(user) {
  const userType = Number(user.userType);
  const userId = String(user.userId);
  const adminId = String(user.admin ?? "");

  if (userType === 8) return (id, r) => r.admin === userId && r.user_type !== 8;
  if (userType === 2) return (id, r) => r.admin === adminId && r.user_type === 1;
  if (userType === 7) return (id, r) => r.admin === adminId && [1, 2, 5].includes(r.user_type);
  if (userType === 9) {
    const admins = new Set(
      (await query("SELECT user_id FROM users WHERE SuperAdmin = ? AND user_type = 8", [userId])).map((r) =>
        String(r.user_id)
      )
    );
    return (id, r) => admins.has(r.admin) || admins.has(id);
  }
  return null;
}

const visibleOnline = (filter) => {
  const out = new Set();
  onlineMap.forEach((r, id) => {
    if (filter(id, r)) out.add(id);
  });
  return out;
};

/* ---------------------------------------------------------------------------
 * Connected browsers + the single shared timer
 * ------------------------------------------------------------------------- */
const clients = new Set(); // { res, filter, online: Set, userId }
let pollTimer = null;
let beatTimer = null;

function send(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
  if (typeof res.flush === "function") res.flush(); // when compression() middleware is used
}

async function tick() {
  if (!clients.size) return;
  try {
    await loadOnline();
  } catch (err) {
    console.error("agentStatusStream query failed:", err.message);
    return;
  }
  clients.forEach((c) => {
    const now = visibleOnline(c.filter);
    const online = [];
    const offline = [];
    now.forEach((id) => !c.online.has(id) && online.push(id));
    c.online.forEach((id) => !now.has(id) && offline.push(id));
    if (online.length || offline.length) {
      c.online = now;
      send(c.res, { type: "change", online, offline });
    }
  });
}

function startTimers() {
  if (!pollTimer) pollTimer = setInterval(tick, POLL_MS);
  if (!beatTimer) {
    beatTimer = setInterval(() => clients.forEach((c) => c.res.write(": ping\n\n")), HEARTBEAT_MS);
  }
}
function stopTimersIfIdle() {
  if (clients.size) return;
  clearInterval(pollTimer);
  clearInterval(beatTimer);
  pollTimer = beatTimer = null;
}

/* call after a login / logout DB write for an instant push (optional) */
let notifyTimer = null;
function notifyAgentStatusChanged() {
  if (notifyTimer || !clients.size) return;
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    loadedAt = 0; // force a fresh read
    tick();
  }, 150);
}

/* =============================================================================
 * GET /telephony/agents/status-stream
 * ========================================================================== */
exports.agentStatusStream = async (req, res) => {
  let filter;
  try {
    filter = await buildFilter(req.user);
  } catch (err) {
    console.error("agentStatusStream filter:", err.message);
    return res.status(500).json({ message: "Could not start live status." });
  }
  if (!filter) return res.status(403).json({ message: "Unauthorized access." });

  const userId = String(req.user.userId);
  let mine = 0;
  clients.forEach((c) => c.userId === userId && mine++);
  if (clients.size >= MAX_CLIENTS || mine >= MAX_PER_USER) {
    return res.status(429).json({ message: "Too many live connections." });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // nginx: don't buffer
  });
  if (typeof res.flushHeaders === "function") res.flushHeaders();
  req.socket.setTimeout(0); // never time out an open stream
  res.write("retry: 5000\n\n");

  const client = { res, filter, online: new Set(), userId };
  clients.add(client);
  startTimers();

  req.on("close", () => {
    clients.delete(client);
    stopTimersIfIdle();
  });

  try {
    await ensureFresh();
    client.online = visibleOnline(filter);
    send(res, { type: "snapshot", online: [...client.online] });
  } catch (err) {
    console.error("agentStatusStream snapshot:", err.message);
  }
};

/* =============================================================================
 * GET /telephony/agents/login-status   -> { online: ["TC005108", ...] }
 * (light one-off call; the page uses it only if the stream can't connect)
 * ========================================================================== */
exports.agentLoginStatus = async (req, res) => {
  try {
    const filter = await buildFilter(req.user);
    if (!filter) return res.status(403).json({ message: "Unauthorized access." });
    await ensureFresh(5000);
    return res.json({ online: [...visibleOnline(filter)] });
  } catch (err) {
    console.error("agentLoginStatus:", err.message);
    return res.status(500).json({ message: "Error fetching login status." });
  }
};

exports.notifyAgentStatusChanged = notifyAgentStatusChanged;