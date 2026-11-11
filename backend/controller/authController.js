const db = require("../models/db");
const fs = require("fs");
const path = require("path");
const net = require("net");
const crypto = require("crypto"); // was missing — generateApiKey uses crypto.randomBytes

// =====================================================================
//  SIP (.conf) HELPERS
//  All create / edit / delete code below goes through these, so the
//  file is edited the same way everywhere.
//
//  The old code used regexes ending in (?=\n\[|$). Blocks written by
//  editAgent were indented ("   [40101]"), so that lookahead never
//  matched the next block and the regex kept eating following users
//  until it hit a non-indented "[" — that is why editing / deleting
//  one extension damaged others. These helpers parse the file line
//  by line instead (indentation doesn't matter) and only touch the
//  sections named exactly [<id>] and [<id>-auth].
// =====================================================================

const SIP_CONF_PATH = "/etc/asterisk/telephonysip.conf";
const AMI_HOST = "127.0.0.1";
const AMI_PORT = 5038;
const AMI_USER = "cron";
// Old code used two different secrets ("LkY|*99uv7^H" in addAgent/createAdmin,
// "1234" in editAgent/deleteAgent/editAdmin). The old reload never really
// checked the reply, so a wrong secret was silently ignored. We now try them
// in order and use the first one Asterisk accepts. Put the real one in .env
// as AMI_SECRET (see /etc/asterisk/manager.conf, user [cron]).
const AMI_SECRETS = [
  ...new Set([process.env.AMI_SECRET, "LkY|*99uv7^H", "1234"].filter(Boolean)),
];

function checkSipValue(label, value, blockBrackets) {
  const v = String(value ?? "").trim();
  if (!v || /[\r\n]/.test(v) || (blockBrackets && /[\[\]]/.test(v))) {
    throw new Error(`Invalid ${label} for SIP config.`);
  }
  return v;
}

// Name comment shown above each user, e.g. ";==================RN kumar ==================="
function sipNameComment(fullName) {
  const name = String(fullName ?? "")
    .replace(/[\r\n]+/g, " ")
    .trim();
  return name ? `;==================${name} ===================` : null;
}

function buildSipBlock(id, password, context, fullName) {
  const comment = sipNameComment(fullName);
  return [
    ...(comment ? [comment] : []),
    `[${id}]`,
    "type=endpoint",
    `context=${context}`,
    "disallow=all",
    "allow=opus,ulaw,alaw,g722",
    `auth=${id}-auth`,
    `aors=${id}`,
    "webrtc=yes",
    "dtls_cert_file=/etc/apache2/ssl.crt/viciphone.crt",
    "dtls_private_key=/etc/apache2/ssl.key/viciphone.key",
    "rtp_symmetric=yes",
    "force_rport=yes",
    "rewrite_contact=yes",
    "",
    `[${id}-auth]`,
    "type=auth",
    "auth_type=userpass",
    `username=${id}`,
    `password=${password}`,
    "",
    `[${id}]`,
    "type=aor",
    "max_contacts=1",
  ];
}

// Removes every section named [id] or [id-auth]; returns the remaining
// lines and the index where the user's first section used to be.
function stripSipUser(lines, id) {
  const names = new Set([id, `${id}-auth`]);
  const headerOf = (line) => {
    const m = line.trim().match(/^\[([^\]]+)\]/);
    return m ? m[1].trim() : null;
  };
  const isNameComment = (line) => /^;=+.*=+$/.test(line.trim());

  const kept = [];
  let skipping = false;
  let position = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let header = headerOf(line);

    // ";====name====" line: treat it as part of the user whose header
    // comes next, so it is removed/replaced together with that user and
    // never deleted along with the user above it.
    if (header === null && isNameComment(line)) {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === "") j++;
      if (j < lines.length) header = headerOf(lines[j]);
    }

    if (header !== null) {
      skipping = names.has(header);
      if (skipping && position === -1) position = kept.length;
    }
    if (!skipping) kept.push(line);
  }
  return { kept, position };
}

function readSipConf() {
  return fs.readFileSync(SIP_CONF_PATH, "utf-8").split(/\r?\n/);
}

function writeSipConf(lines) {
  const text =
    lines
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trimEnd() + "\n";
  fs.writeFileSync(SIP_CONF_PATH, text, "utf-8");
}

// Create or update a user. An existing user is rewritten IN PLACE
// (keeps its position in the file); a new user is appended at the end.
function upsertSipUser(id, password, context, fullName) {
  id = checkSipValue("user id", id, true);
  password = checkSipValue("password", password, false);
  context = checkSipValue("context", context || "telephony", true);

  const { kept, position } = stripSipUser(readSipConf(), id);
  const block = buildSipBlock(id, password, context, fullName);

  if (position === -1) {
    kept.push("", ...block);
  } else {
    kept.splice(position, 0, ...block, "");
  }
  writeSipConf(kept);
}

// Delete a user's endpoint, auth and aor sections only.
function removeSipUser(id) {
  id = checkSipValue("user id", id, true);
  const { kept, position } = stripSipUser(readSipConf(), id);
  if (position !== -1) writeSipConf(kept);
  return position !== -1;
}

// Login -> wait for success -> pjsip reload -> wait for reply -> logoff.
function amiReloadOnce(secret) {
  return new Promise((resolve) => {
    let buffer = "";
    let step = "login";
    let done = false;
    let timer = null;

    const client = net.createConnection({ host: AMI_HOST, port: AMI_PORT });

    const finish = (success, response, authFailed = false) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      client.destroy();
      resolve({ success, response, authFailed });
    };

    timer = setTimeout(
      () => finish(false, "Timeout while reloading SIP."),
      8000,
    );

    client.on("connect", () => {
      client.write(
        `Action: Login\r\nUsername: ${AMI_USER}\r\nSecret: ${secret}\r\nEvents: off\r\n\r\n`,
      );
    });

    client.on("data", (chunk) => {
      buffer += chunk.toString();
      let idx;
      while ((idx = buffer.indexOf("\r\n\r\n")) !== -1) {
        const msg = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 4);

        if (step === "login") {
          if (/Response: Success/i.test(msg)) {
            step = "reload";
            client.write("Action: Command\r\nCommand: pjsip reload\r\n\r\n");
          } else if (/Response: Error/i.test(msg)) {
            return finish(false, msg, true); // wrong secret
          }
        } else if (step === "reload" && /Response:/i.test(msg)) {
          client.write("Action: Logoff\r\n\r\n");
          return finish(/Response: (Success|Follows)/i.test(msg), msg);
        }
      }
    });

    client.on("error", (err) => {
      console.error("❌ AMI error:", err.message);
      finish(false, err.message);
    });
    client.on("close", () => finish(false, "AMI connection closed early."));
  });
}

async function reloadSIPViaAMI() {
  let last = { success: false, response: "No AMI secret configured." };
  for (const secret of AMI_SECRETS) {
    last = await amiReloadOnce(secret);
    if (!last.authFailed) break; // success, or a non-auth error: stop trying
  }
  if (!last.success) console.error("❌ PJSIP reload failed:", last.response);
  return last;
}

// The DB row and the .conf file are already saved when the reload runs, so a
// failed reload is reported as a warning (old behaviour: the request still
// succeeded) instead of turning the whole request into an error.
function sipReloadInfo(amiReload) {
  return amiReload.success
    ? { sipReloaded: true, amiResponse: amiReload.response }
    : {
        sipReloaded: false,
        warning:
          "Saved, but Asterisk 'pjsip reload' failed. Check AMI_SECRET or run 'pjsip reload' manually.",
        amiResponse: amiReload.response,
      };
}

// ---- "context" column support -------------------------------------------
// The new code reads/writes users.context. If that column doesn't exist yet,
// every add/edit query failed with "Unknown column 'context'". We check once
// and only use the column when it is there (default context: telephony).
let contextColumnPromise = null;
function hasContextColumn() {
  if (!contextColumnPromise) {
    contextColumnPromise = new Promise((resolve) => {
      db.query("SHOW COLUMNS FROM users LIKE 'context'", (err, rows) => {
        if (err) {
          console.error("Could not check users.context column:", err.message);
          contextColumnPromise = null; // retry next time
          return resolve(false);
        }
        resolve(rows.length > 0);
      });
    });
  }
  return contextColumnPromise;
}

const cleanText = (v) =>
  v === undefined || v === null ? "" : String(v).trim();

// Renumber agent_priorty 1..N for one admin.
// (Old "SET @rownum = 0; UPDATE ..." needs multipleStatements: true in the DB
//  config, otherwise it fails with a SQL syntax error.)
function reorderPriorities(adminId, callback) {
  db.query(
    `SELECT id FROM users WHERE admin = ? AND user_id <> admin ORDER BY CAST(agent_priorty AS UNSIGNED) ASC, id ASC`,
    [adminId],
    (selErr, rows) => {
      if (selErr) return callback(selErr);
      if (!rows.length) return callback(null);

      const cases = rows.map(() => "WHEN ? THEN ?").join(" ");
      const params = [];
      rows.forEach((r, i) => params.push(r.id, i + 1));
      params.push(rows.map((r) => r.id));

      db.query(
        `UPDATE users SET agent_priorty = CASE id ${cases} END WHERE id IN (?)`,
        params,
        (updErr) => callback(updErr || null),
      );
    },
  );
}

// =====================================================================
//  AGENT HELPERS (used by getAgent / addAgent / editAgent)
//  Names start with "ag" / "AG_" so they never clash with other code.
// =====================================================================
const agQuery = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))),
  );

// Same "Login" rule as before (a row with a token today). Today's logins are
// read ONCE as a date range: "log_in_time >= today AND < tomorrow" can use an
// index on log_in_time, while the old DATE(log_in_time) = CURDATE() always
// read the whole login_log table. Without the index it is no slower than before.
const AG_LOGIN_JOIN = `LEFT JOIN (
    SELECT DISTINCT user_name
      FROM login_log
     WHERE token IS NOT NULL
       AND log_in_time >= CURDATE()
       AND log_in_time < CURDATE() + INTERVAL 1 DAY
  ) ll ON ll.user_name = u.user_id`;
const AG_LOGIN_STATUS = `CASE WHEN ll.user_name IS NOT NULL THEN 'Login' ELSE 'Logout' END AS loginStatus`;

// Which user types each role may create / assign
const AG_CAN_ASSIGN = {
  9: [1, 2, 5, 6, 7], // super admin
  8: [1, 2, 5, 6, 7], // admin
  7: [1, 2, 5, 6], // manager
  2: [1], // team leader
};

// user ids go into telephonysip.conf as [id], so keep them simple
const AG_USER_ID_RE = /^[A-Za-z0-9_-]{2,30}$/;

// ';' starts a comment in Asterisk .conf files, so "abc;123" would silently
// become password "abc" and the phone could never register
function agPasswordError(p) {
  const s = String(p ?? "");
  if (s.trim() === "") return "Password is required.";
  if (s.length < 4 || s.length > 64) return "Password must be 4 to 64 characters.";
  if (/[\s;\[\]]/.test(s)) return "Password can't contain spaces, ';' or brackets.";
  return null;
}

// accepts "Agent" / "Team Leader" ... (as addAgent always did) or a number
function agResolveUserType(v) {
  if (v === undefined || v === null || v === "") return null;
  if (typeof userTypeMapping !== "undefined" && userTypeMapping[v]) return userTypeMapping[v];
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// One "pjsip reload" for several quick changes (bulk add / fast edits):
// calls within 500 ms share the same reload instead of each reloading Asterisk.
let agReloadPending = null;
function agReloadSIPShared() {
  if (!agReloadPending) {
    agReloadPending = new Promise((r) => setTimeout(r, 500)).then(() => {
      agReloadPending = null;
      return reloadSIPViaAMI();
    });
  }
  return agReloadPending;
}

const agStripSecrets = (row) => {
  delete row.otp;
  delete row.otp_expiry;
  return row;
};

// =====================================================================

exports.profile = (req, res) => {
  const userId = req.user.userId;

  const userQuery = "SELECT * FROM users WHERE user_id = ?";

  const agentCountQuery =
    "SELECT COUNT(user_id) AS totalAgents FROM users WHERE admin = ? AND user_id != ?";

  db.query(userQuery, [userId], (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Error fetching user data." });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    let user = results[0];

    db.query(agentCountQuery, [userId, userId], (err, agentResults) => {
      if (err) {
        console.error("Error fetching agent count:", err);
        return res.status(500).json({ message: "Error fetching agent count." });
      }

      user.totalAgents = agentResults[0].totalAgents; // Add total agent count to user data

      console.log(user);

      res.json(user);
    });
  });
};

// //----------------For ADMIN----------------------------------------------

//---------------------------------------------------------------------------------------------------------------

exports.getAgent = async (req, res) => {
  const userId = req.user.userId;
  const userType = Number(req.user.userType);
  const adminId = req.user.admin;

  try {
    let rows;

    if (userType === 8) {
      rows = await agQuery(
        `SELECT u.id, u.user_id, u.password, u.full_name, u.status, u.admin, u.use_did,
                u.ext_number, u.campaigns_id, u.campaign_name, u.user_type, u.agent_priorty,
                ${AG_LOGIN_STATUS}
           FROM users u
           ${AG_LOGIN_JOIN}
          WHERE u.admin = ? AND u.user_type != 8
          ORDER BY u.id DESC`,
        [userId],
      );
    } else if (userType === 2) {
      rows = await agQuery(
        `SELECT u.*, ${AG_LOGIN_STATUS}
           FROM users u
           ${AG_LOGIN_JOIN}
          WHERE u.admin = ? AND u.user_type = 1
          ORDER BY u.id DESC`,
        [adminId],
      );
    } else if (userType === 7) {
      rows = await agQuery(
        `SELECT u.*, ${AG_LOGIN_STATUS}
           FROM users u
           ${AG_LOGIN_JOIN}
          WHERE u.admin = ? AND u.user_type IN (1, 2, 5)
          ORDER BY u.id DESC`,
        [adminId],
      );
    } else if (userType === 9) {
      // admin list first (small), then a plain IN lookup instead of two nested subqueries
      const admins = (
        await agQuery("SELECT user_id FROM users WHERE SuperAdmin = ? AND user_type = 8", [userId])
      ).map((r) => r.user_id);
      if (!admins.length) return res.status(404).json({ message: "No users found." });
      rows = await agQuery(
        `SELECT u.*, ${AG_LOGIN_STATUS}
           FROM users u
           ${AG_LOGIN_JOIN}
          WHERE u.admin IN (?) OR u.user_id IN (?)
          ORDER BY u.id DESC`,
        [admins, admins],
      );
    } else {
      return res.status(403).json({ message: "Unauthorized access." });
    }

    if (rows.length === 0) {
      return res.status(404).json({ message: "No users found." });
    }
    // OTP codes were being sent to the browser in the agent list
    return res.status(200).json(rows.map(agStripSecrets));
  } catch (err) {
    console.error("Database error:", err);
    return res.status(500).json({ message: "Error fetching user data." });
  }
};

exports.generateApiKey = (req, res) => {
  const { userId } = req.params;
  const keyLength = Math.floor(Math.random() * 3) + 10;
  const newApiKey = crypto
    .randomBytes(6)
    .toString("hex")
    .substring(0, keyLength);

  const query = "UPDATE users SET api_key = ? WHERE user_id = ?";
  db.query(query, [newApiKey, userId], (err, result) => {
    if (err) {
      console.error("Error updating API key:", err);
      return res.status(500).json({ message: "Error updating API key." });
    }

    res.json({ api_key: newApiKey });
  });
};

//-------update-------------------------------------------

exports.editAgent = (req, res) => {
  const { userId } = req.params;
  const {
    password,
    full_name,
    status,
    user_type,
    agent_priorty,
    campaigns_id,
    campaign_name,
    use_did,
    ext_number,
  } = req.body || {};

  const campaignsIdString = Array.isArray(campaigns_id) ? campaigns_id.join(",") : campaigns_id;
  const campaignNameString = Array.isArray(campaign_name) ? campaign_name.join(",") : campaign_name;

  const loggedInUserId = req.user?.userId;
  const callerType = Number(req.user?.userType);
  const callerAdmin = req.user?.admin;

  // ✅ Basic Validation
  if (!password || !full_name || !user_type) {
    return res.status(400).json({
      message: "Please provide all required fields: password, full_name, user_type.",
    });
  }
  const pwErr = agPasswordError(password);
  if (pwErr) return res.status(400).json({ message: pwErr });

  const newType = agResolveUserType(user_type);
  if (!newType) return res.status(400).json({ message: "Invalid user type provided." });

  // 🔐 Ownership Permission Logic
  let checkQuery = "";
  let checkParams = [];

  if (callerType === 9) {
    checkQuery = `
      SELECT * FROM users
      WHERE user_id = ?
        AND (
          admin IN (SELECT user_id FROM users WHERE SuperAdmin = ?)
          OR user_id IN (SELECT user_id FROM users WHERE SuperAdmin = ?)
        )
      LIMIT 1`;
    checkParams = [userId, loggedInUserId, loggedInUserId];
  } else if (callerType === 8) {
    checkQuery = `SELECT * FROM users WHERE user_id = ? AND admin = ? LIMIT 1`;
    checkParams = [userId, loggedInUserId];
  } else if (callerType === 7) {
    checkQuery = `
      SELECT * FROM users
      WHERE user_id = ?
        AND admin = (SELECT admin FROM users WHERE user_id = ?)
        AND user_type IN (1, 2, 5, 6)
      LIMIT 1`;
    checkParams = [userId, loggedInUserId];
  } else if (callerType === 2) {
    // agents are saved with admin = the ADMIN (see addAgent), not the team
    // leader's id, so the old check (admin = team leader) never matched
    checkQuery = `SELECT * FROM users WHERE user_id = ? AND admin = ? AND user_type = 1 LIMIT 1`;
    checkParams = [userId, callerAdmin];
  } else {
    return res.status(403).json({ message: "Unauthorized request." });
  }

  // ✅ Ownership Check
  db.query(checkQuery, checkParams, (err, results) => {
    if (err) {
      console.error("❌ Database error:", err);
      return res.status(500).json({ message: "Error verifying user ownership." });
    }
    if (results.length === 0) {
      return res.status(403).json({ message: "You are not authorized to update this user." });
    }

    const existing = results[0];

    // 🔐 role check: before, any editor could send user_type 8 or 9 and turn
    // an agent into an Admin / Super Admin. Keeping the current type is always allowed.
    const allowed = AG_CAN_ASSIGN[callerType] || [];
    if (newType !== Number(existing.user_type) && !allowed.includes(newType)) {
      return res.status(403).json({ message: "You are not allowed to assign this user type." });
    }

    // Field not sent by the client -> keep the current DB value
    const keep = (value, oldValue) => (value === undefined ? oldValue : value);
    const sipContext = existing.context || "telephony";

    // 📝 Update User Query
    const updateQuery = `
      UPDATE users
      SET password = ?, full_name = ?, status = ?, user_type = ?,
          agent_priorty = ?, campaigns_id = ?, campaign_name = ?,
          use_did = ?, ext_number = ?
      WHERE id = ?
    `;

    db.query(
      updateQuery,
      [
        password,
        full_name,
        keep(status, existing.status),
        newType,
        keep(agent_priorty, existing.agent_priorty),
        keep(campaignsIdString, existing.campaigns_id),
        keep(campaignNameString, existing.campaign_name),
        keep(use_did, existing.use_did),
        keep(ext_number, existing.ext_number),
        existing.id, // exact row found by the ownership check
      ],
      async (updateErr, result) => {
        if (updateErr) {
          console.error("❌ Update error:", updateErr);
          return res.status(500).json({ message: "Error updating user." });
        }
        if (result.affectedRows === 0) {
          return res.status(404).json({ message: "User not found or no changes made." });
        }

        // 🔁 SIP config only needs rewriting when something in it changed
        const sipChanged =
          String(password) !== String(existing.password) ||
          String(full_name) !== String(existing.full_name);

        if (sipChanged) {
          try {
            upsertSipUser(existing.user_id, password, sipContext, full_name);
          } catch (e) {
            console.error("File error:", e);
            return res.status(500).json({ message: "User updated but failed to update PJSIP config." });
          }
        }

        const sipInfo = sipChanged
          ? sipReloadInfo(await agReloadSIPShared())
          : { sipReloaded: false, sipUnchanged: true };

        return res.status(200).json({
          message: "User updated successfully .",
          updatedUser: {
            user_id: existing.user_id,
            full_name,
            user_type: newType,
            agent_priorty: keep(agent_priorty, existing.agent_priorty),
            status: keep(status, existing.status),
          },
          ...sipInfo,
        });
      },
    );
  });
};

const userTypeMapping = {
  Agent: 1,
  Admin: 8,
  "Quality Analyst": 6,
  "Team Leader": 2,
  Manager: 7,
  IT: 5,
};

exports.addAgent = async (req, res) => {
  const callerType = Number(req.user.userType);
  const { admin } = req.user;
  const {
    user_id,
    password,
    user_type,
    full_name,
    campaigns_id,
    campaign_name,
    use_did,
  } = req.body || {};

  // 🔐 who may add users at all (before: any logged-in user, even an agent)
  const allowed = AG_CAN_ASSIGN[callerType];
  if (!allowed) {
    return res.status(403).json({ message: "You are not allowed to add users." });
  }

  const mappedUserType = agResolveUserType(user_type);
  if (!mappedUserType) {
    return res.status(400).json({ message: "Invalid user type provided." });
  }
  // 🔐 before: a team leader could add an Admin or Manager; only "TL adds TL" was blocked
  if (!allowed.includes(mappedUserType)) {
    return res.status(403).json({
      message: callerType === 2 ? "Team Leaders can only add Agents." : "You are not allowed to add this user type.",
    });
  }

  // ✅ validate BEFORE touching the DB (a bad id used to be inserted into
  //    the DB and then fail in the SIP file, leaving a half-created user)
  const id = String(user_id ?? "").trim();
  if (!AG_USER_ID_RE.test(id)) {
    return res.status(400).json({
      message: "Invalid User ID. Use 2 to 30 letters, numbers, '_' or '-' (no spaces).",
    });
  }
  const pwErr = agPasswordError(password);
  if (pwErr) return res.status(400).json({ message: pwErr });
  if (!String(full_name ?? "").trim()) {
    return res.status(400).json({ message: "Full name is required." });
  }

  const adminId = callerType === 8 ? req.user.userId : admin;
  if (!adminId) return res.status(400).json({ message: "Admin not found for this user." });

  const campaignsIdString = Array.isArray(campaigns_id) ? campaigns_id.join(",") : campaigns_id;
  const campaignNameString = Array.isArray(campaign_name) ? campaign_name.join(",") : campaign_name;

  try {
    const useContext = await hasContextColumn();

    // 3 independent lookups run in parallel instead of one after another
    const [ctxRows, dupRows, prioRows] = await Promise.all([
      useContext
        ? agQuery("SELECT context FROM users WHERE user_id = ? LIMIT 1", [adminId])
        : Promise.resolve([]),
      agQuery("SELECT 1 FROM users WHERE user_id = ? LIMIT 1", [id]),
      // numeric order: agent_priorty is text, so ORDER BY gave 1,10,11,..,2
      // and the "smallest free number" search handed out duplicates
      agQuery(
        `SELECT CAST(agent_priorty AS UNSIGNED) AS p
           FROM users
          WHERE admin = ? AND user_id <> admin AND agent_priorty REGEXP '^[0-9]+$'
          ORDER BY p ASC`,
        [adminId],
      ),
    ]);

    if (dupRows.length) {
      return res.status(409).json({ message: "User ID already exists." });
    }

    const userContext = (ctxRows[0] && ctxRows[0].context) || "telephony";

    // smallest missing priority number
    let priority = 1;
    for (const row of prioRows) {
      if (row.p === priority) priority++;
      else if (row.p > priority) break;
    }

    const newUser = {
      user_id: id,
      password,
      user_type: mappedUserType,
      full_name,
      campaigns_id: campaignsIdString,
      campaign_name: campaignNameString,
      use_did,
      admin: adminId,
      user_timezone: "Asia/Kolkata",
      agent_priorty: priority,
    };
    if (useContext) newUser.context = userContext;

    let insert;
    try {
      insert = await agQuery("INSERT INTO users SET ?", newUser);
    } catch (e) {
      if (e.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ message: "User ID already exists." });
      }
      throw e;
    }

    // SIP config; if it fails, remove the DB row again so nothing is half-created
    try {
      upsertSipUser(id, password, userContext, full_name);
    } catch (e) {
      console.error("PJSIP config error:", e);
      await agQuery("DELETE FROM users WHERE id = ?", [insert.insertId]).catch(() => {});
      return res.status(500).json({ message: "Failed to add agent (SIP config could not be updated)." });
    }

    const amiReload = await agReloadSIPShared();
    return res.status(201).json({
      message: "Agent added successfully.",
      priority,
      ...sipReloadInfo(amiReload),
    });
  } catch (err) {
    console.error("Error adding agent:", err);
    return res.status(500).json({ message: "Failed to add agent." });
  }
};

//----------------------------------------------------------------------------------------------------------

exports.superUser = async (req, res) => {
  const { userType } = req.user;
  const {
    user_id,
    password,
    user_type,
    full_name,
    campaigns_id,
    campaign_name,
    use_did,
    admin,
  } = req.body;

  const mappedUserType = userTypeMapping[user_type];
  if (!mappedUserType) {
    return res.status(400).json({ message: "Invalid user type provided." });
  }

  if (userType == 2 && mappedUserType === 2) {
    return res
      .status(403)
      .json({ message: "Team Leaders can only add Agents." });
  }

  const campaignsIdString = Array.isArray(campaigns_id)
    ? campaigns_id.join(",")
    : campaigns_id;
  const campaignNameString = Array.isArray(campaign_name)
    ? campaign_name.join(",")
    : campaign_name;

  const insertQuery = `
    INSERT INTO users (
      user_id, password, user_type, full_name, 
      campaigns_id, campaign_name, use_did, admin
    ) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  try {
    // Insert user into DB
    await new Promise((resolve, reject) => {
      db.query(
        insertQuery,
        [
          user_id,
          password,
          mappedUserType,
          full_name,
          campaignsIdString,
          campaignNameString,
          use_did,
          admin,
        ],
        (err, results) => (err ? reject(err) : resolve(results)),
      );
    });

    upsertSipUser(user_id, password, "telephony", full_name);

    // Reload SIP config via AMI
    const amiReload = await reloadSIPViaAMI();
    return res.status(201).json({
      message: "Agent added successfully and PJSIP updated.",
      ...sipReloadInfo(amiReload),
    });
  } catch (err) {
    console.error("Error adding agent:", err);
    return res
      .status(500)
      .json({ message: "Failed to add agent.", error: err.message });
  }
};

exports.deleteAgent = (req, res) => {
  const { userId, userType } = req.user;
  const agentId = req.params.id;

  let checkQuery = "";
  let checkParams = [];

  switch (String(userType)) {
    case "9":
      checkQuery = `
        SELECT * FROM users 
        WHERE user_id = ? 
          AND (
            admin IN (SELECT user_id FROM users WHERE SuperAdmin = ? AND user_type = 8)
            OR user_id IN (SELECT user_id FROM users WHERE SuperAdmin = ? AND user_type = 8)
          )`;
      checkParams = [agentId, userId, userId];
      break;

    case "8":
      checkQuery = `SELECT * FROM users WHERE user_id = ? AND admin = ?`;
      checkParams = [agentId, userId];
      break;

    case "7":
      checkQuery = `SELECT * FROM users WHERE user_id = ? AND admin = ? AND user_type IN (1, 2, 6)`;
      checkParams = [agentId, userId];
      break;

    case "2":
      checkQuery = `SELECT * FROM users WHERE user_id = ? AND admin = ? AND user_type = 1`;
      checkParams = [agentId, userId];
      break;

    default:
      return res.status(403).json({ message: "Unauthorized request." });
  }

  db.query(checkQuery, checkParams, (err, results) => {
    if (err) {
      console.error("DB error:", err);
      return res.status(500).json({ message: "Error verifying ownership." });
    }

    if (results.length === 0) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this agent." });
    }

    // ✅ Get admin ID before deletion
    const adminId = results[0].admin;

    // ✅ Delete the agent first
    db.query(`DELETE FROM users WHERE user_id = ?`, [agentId], (deleteErr) => {
      if (deleteErr) {
        console.error("Delete DB error:", deleteErr);
        return res.status(500).json({ message: "Failed to delete user." });
      }

      // ✅ Reorder remaining priorities for this admin
      reorderPriorities(adminId, async (reorderErr) => {
        if (reorderErr) {
          console.error("Reorder error:", reorderErr);
          return res.status(500).json({
            message: "User deleted, but failed to reorder priorities.",
            error: reorderErr.message,
          });
        }

        // ✅ SIP config cleanup — removes ONLY [agentId] and [agentId-auth]
        try {
          removeSipUser(results[0].user_id); // exact DB id, case-safe
        } catch (fsErr) {
          console.error("FS error during SIP config update:", fsErr);
          return res.status(500).json({
            message: "Agent deleted, but failed to update SIP config.",
            error: fsErr.message,
          });
        }

        // ✅ AMI SIP Reload
        const amiReload = await reloadSIPViaAMI();
        return res.status(200).json({
          message: "Agent deleted, priorities updated, and SIP reloaded.",
          ...sipReloadInfo(amiReload),
        });
      });
    });
  });
};

exports.getAgentBreak = (req, res) => {
  const userId = req.user.userId;
  const userType = req.user.userType; // user_type from token

  let query = "";
  let queryParams = [];

  if (userType == 8) {
    // Admin can see breaks of both team leaders (2) and agents (1) under them
    query = `
      SELECT 
        u.user_id,
        u.full_name,
        u.admin,
        u.agent_priorty,
        b.break_name,
        b.start_time,
        b.break_duration,
        b.end_time,
        b.break_status,
        b.status AS break_status
      FROM users u
      JOIN break_time b ON u.user_id = b.user_name
      WHERE u.admin = ? AND u.user_type IN (1, 2)
      ORDER BY u.id DESC
    `;
    queryParams = [userId];
  } else if (userType == 2) {
    // Team Leaders can only see their own agents (1) breaks
    query = `
      SELECT 
        u.user_id,
        u.full_name,
        u.admin,
        u.agent_priorty,
        b.break_name,
        b.start_time,
        b.break_duration,
        b.end_time,
        b.break_status,
        b.status AS break_status
      FROM users u
      JOIN break_time b ON u.user_id = b.user_name
      WHERE u.admin = (SELECT admin FROM users WHERE user_id = ?) AND u.user_type = 1
      ORDER BY u.id DESC
    `;
    queryParams = [userId];
  } else {
    return res.status(403).json({ message: "Unauthorized request." });
  }

  db.query(query, queryParams, (err, results) => {
    if (err) {
      console.error("❌ Database error:", err);
      return res.status(500).json({ message: "Error fetching break times." });
    }

    if (results.length === 0) {
      return res
        .status(404)
        .json({ message: "No break times found for agents." });
    }

    res.status(200).json(results);
  });
};

exports.getAgentLoginReport = (req, res) => {
  const adminOrTeamLeaderId = req.user.userId;
  const userType = req.user.userType; // Get user_type from token

  let agentQuery = "";
  let queryParams = [];

  if (userType == 8) {
    // Admin can see login reports of Team Leaders (2) & Agents (1)
    agentQuery = `
      SELECT user_id, full_name 
      FROM users 
      WHERE admin = ? AND user_type IN (1, 2) 
      ORDER BY id DESC
    `;
    queryParams = [adminOrTeamLeaderId];
  } else if (userType == 2) {
    // Team Leaders can only see login reports of their agents (1)
    agentQuery = `
      SELECT user_id, full_name 
      FROM users 
      WHERE admin = (SELECT admin FROM users WHERE user_id = ?) AND user_type = 1 
      ORDER BY id DESC
    `;
    queryParams = [adminOrTeamLeaderId];
  } else {
    return res.status(403).json({ message: "Unauthorized request." });
  }

  db.query(agentQuery, queryParams, (err, agentResults) => {
    if (err) {
      console.error("❌ Database error:", err);
      return res.status(500).json({ message: "Error fetching agents." });
    }

    if (agentResults.length === 0) {
      return res
        .status(404)
        .json({ message: "No agents found for this user." });
    }

    const agentUserNames = agentResults.map((agent) => agent.user_id);

    const loginQuery = `
      SELECT id, user_name, log_in_time, log_out_time, status 
      FROM login_log 
      WHERE user_name IN (?) 
      ORDER BY log_in_time DESC
    `;

    db.query(loginQuery, [agentUserNames], (err, loginResults) => {
      if (err) {
        console.error("❌ Database error:", err);
        return res
          .status(500)
          .json({ message: "Error fetching login report." });
      }

      return res.status(200).json(loginResults);
    });
  });
};

exports.viewAgentDetails = (req, res) => {
  const userId = req.params.userid;

  const sql = "SELECT * FROM users WHERE user_id = ?";
  db.query(sql, [userId], (err, data) => {
    if (err) {
      console.error("Error executing query:", err);
      return res.status(500).json({ error: "Database query failed" });
    }

    if (data.length === 0) {
      return res
        .status(404)
        .json({ message: "No records found for the given ID" });
    }

    return res.json(data[0]); // Return user details
  });
};

exports.getAllAgentReport = (req, res) => {
  const adminOrTeamLeaderId = req.user.userId;
  const userType = req.user.userType; // Get user_type from token

  let query = "";
  let queryParams = [];

  if (userType == 8) {
    query = `
    SELECT 
      u.user_id,
      ANY_VALUE(u.status) AS status,  
      COUNT(DISTINCT bt.break_name) AS no_of_breaks,
      GROUP_CONCAT(DISTINCT bt.break_name SEPARATOR ', ') AS break_names,
      ANY_VALUE(ll.log_in_time) AS login_time,  
      COALESCE(call_data.no_of_ans, 0) AS no_of_ans,
      COALESCE(call_data.no_of_can, 0) AS no_of_can,
      COALESCE(call_data.no_of_tot, 0) AS no_of_tot
    FROM users u
    LEFT JOIN break_time bt ON u.user_id = bt.user_name
    LEFT JOIN login_log ll ON u.user_id = ll.user_name
    LEFT JOIN (
        SELECT 
          call_from AS user_id,
          COUNT(CASE WHEN status = 'ANSWER' THEN 1 END) AS no_of_ans,
          COUNT(CASE WHEN status = 'CANCEL' THEN 1 END) AS no_of_can,
          COUNT(*) AS no_of_tot
        FROM cdr
        GROUP BY call_from
    ) AS call_data ON u.user_id = call_data.user_id
    WHERE 
      u.admin = ? 
      AND u.user_type IN (1, 2) 
    GROUP BY 
      u.user_id
    ORDER BY 
      ANY_VALUE(u.id) DESC;
    `;
    queryParams = [adminOrTeamLeaderId];
  } else if (userType == 2) {
    // Team Leaders can only see reports of their Agents (1)
    query = `
    SELECT 
      u.user_id,
      ANY_VALUE(u.status) AS status,
      COUNT(DISTINCT bt.break_name) AS no_of_breaks,
      GROUP_CONCAT(DISTINCT bt.break_name SEPARATOR ', ') AS break_names,
      ANY_VALUE(ll.log_in_time) AS login_time,
      COALESCE(call_data.no_of_ans, 0) AS no_of_ans,
      COALESCE(call_data.no_of_can, 0) AS no_of_can,
      COALESCE(call_data.no_of_tot, 0) AS no_of_tot
    FROM users u
    LEFT JOIN break_time bt ON u.user_id = bt.user_name
    LEFT JOIN login_log ll ON u.user_id = ll.user_name
    LEFT JOIN (
        SELECT 
          call_from AS user_id,
          COUNT(CASE WHEN status = 'ANSWER' THEN 1 END) AS no_of_ans,
          COUNT(CASE WHEN status = 'CANCEL' THEN 1 END) AS no_of_can,
          COUNT(*) AS no_of_tot
        FROM cdr
        GROUP BY call_from
    ) AS call_data ON u.user_id = call_data.user_id
    WHERE 
      u.admin = (SELECT admin FROM users WHERE user_id = ?) 
      AND u.user_type = 1 
    GROUP BY 
      u.user_id
    ORDER BY 
      ANY_VALUE(u.id) DESC;
    `;
    queryParams = [adminOrTeamLeaderId];
  } else {
    return res.status(403).json({ message: "Unauthorized request." });
  }

  db.query(query, queryParams, (err, results) => {
    if (err) {
      console.error("❌ Database error:", err);
      return res.status(500).json({ message: "Error fetching agent reports." });
    }

    console.log("✅ Query executed successfully. Results:", results);

    // Check if any user has call counts
    results.forEach((row) => {
      console.log(
        `User ID: ${row.user_id}, Answered: ${row.no_of_ans}, Canceled: ${row.no_of_can}, Total Calls: ${row.no_of_tot}`,
      );
    });

    if (results.length === 0) {
      console.warn("⚠️ No data found for this user.");
      return res.status(404).json({ message: "No data found for this user." });
    }

    res.status(200).json(results);
  });
};

exports.AgentDetailFeature = (req, res) => {
  const { user_id, filter } = req.params;

  if (!user_id) {
    return res.status(400).json({ error: "User ID is required" });
  }

  let dateCondition = "";

  if (filter === "today") {
    dateCondition = "AND DATE(start_time) = CURDATE()";
  } else if (filter === "weekly") {
    dateCondition = "AND WEEK(start_time) = WEEK(CURDATE())";
  } else if (filter === "monthly") {
    dateCondition = "AND MONTH(start_time) = MONTH(CURDATE())";
  }
  const query1 = `
    SELECT 
      COUNT(CASE WHEN status = 'ANSWER' THEN 1 END) AS answerCall,
      COUNT(CASE WHEN status = 'CANCEL' THEN 1 END) AS cancelCall,
      COUNT(CASE WHEN status IN ('CONGESTION', 'CHANUNAVAIL') THEN 1 END) AS otherCall,
      COUNT(CASE WHEN direction = 'OUTBOUND' THEN 1 END) AS outboundCall,
      COUNT(CASE WHEN direction = 'INBOUND' THEN 1 END) AS inboundCall,
      COUNT(*) AS totalCall
    FROM cdr 
    WHERE (call_from = ? OR call_to = ?) AND admin = ? ${dateCondition}
  `;

  db.query(query1, [user_id, user_id, user_id], (err, results) => {
    if (err) {
      console.error("Error fetching call counts:", err);
      return res.status(500).json({ error: "Failed to fetch call counts" });
    }

    if (results[0].totalCall > 0) {
      console.log("User ID found in cdr:", results[0]);
      return res.json(results[0]);
    } else {
      const query2 = `
        SELECT 
          COUNT(CASE WHEN status = 'ANSWER' THEN 1 END) AS answerCall,
          COUNT(CASE WHEN status = 'CANCEL' THEN 1 END) AS cancelCall,
          COUNT(CASE WHEN status IN ('CONGESTION', 'CHANUNAVAIL') THEN 1 END) AS otherCall,
          COUNT(CASE WHEN direction = 'OUTBOUND' THEN 1 END) AS outboundCall,
          COUNT(CASE WHEN direction = 'INBOUND' THEN 1 END) AS inboundCall,
          COUNT(*) AS totalCall
        FROM cdr 
        WHERE (call_from = ? OR call_to = ?) ${dateCondition}
      `;

      db.query(query2, [user_id, user_id], (err, results2) => {
        if (err) {
          console.error(
            "Error fetching call counts from call_from or call_to:",
            err,
          );
          return res.status(500).json({ error: "Failed to fetch call counts" });
        }

        return res.json(results2[0]); // Return the data when matching `call_from` or `call_to`
      });
    }
  });
};

//=============================================================================================

exports.ViewAgentDetailChart = (req, res) => {
  const adminId = req.user.userId;
  const { userId } = req.params;

  const query = `
    SELECT 
      DATE_FORMAT(start_time, '%Y-%m') AS month, 
      COUNT(CASE WHEN status = 'ANSWER' THEN 1 END) AS answerCall,
      COUNT(CASE WHEN status = 'CANCEL' THEN 1 END) AS cancelCall,
      COUNT(CASE WHEN status IN ('CONGESTION', 'CHANUNAVAIL') THEN 1 END) AS otherCall,
      COUNT(CASE WHEN direction = 'OUTBOUND' THEN 1 END) AS outboundCall,
      COUNT(CASE WHEN direction = 'INBOUND' THEN 1 END) AS inboundCall,
      COUNT(*) AS totalCall
    FROM cdr
    WHERE admin = ? 
      AND (call_from = ? OR call_to = ?)
      AND start_time >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
    GROUP BY month
    ORDER BY month;
  `;

  db.query(query, [adminId, userId, userId], (err, results) => {
    if (err) {
      console.error("Error fetching agent chart data:", err);
      return res
        .status(500)
        .json({ error: "Database query error", details: err });
    }

    if (!results.length) {
      return res.status(404).json({ error: "No data found for this agent." });
    }

    const formattedResults = results.map((row) => ({
      name: row.month,
      answerCall: row.answerCall || 0,
      cancelCall: row.cancelCall || 0,
      otherCall: row.otherCall || 0,
      outboundCall: row.outboundCall || 0,
      inboundCall: row.inboundCall || 0,
      totalCall: row.totalCall || 0,
    }));

    res.json(formattedResults);
  });
};

//=============================================================================================

exports.toggleUserStatus = (req, res) => {
  const userId = req.params.user_id; // User ID to be updated
  const userType = req.user.userType; // Logged-in user type
  const adminId = req.user.admin; // Admin ID (if Team Leader)

  let query;
  let queryParams;

  if (userType == 8 || userType == 9) {
    // Admin can update any user's status (except admins)
    query = `UPDATE users SET status = IF(status = 'active', 'inactive', 'active') WHERE User_id = ?`;
    queryParams = [userId];
  } else if (userType == 2 || userType == 7) {
    // Team Leader can update only their agents
    query = `UPDATE users SET status = IF(status = 'active', 'inactive', 'active') WHERE user_id = ? AND admin = ? AND user_type = 1`;
    //  query = `UPDATE users SET status = IF(status = 'active', 'inactive', 'active') WHERE user_id = ? AND admin = ? AND user_type = 1`;
    queryParams = [userId, adminId];
  } else {
    return res.status(403).json({ message: "Unauthorized access." });
  }

  db.query(query, queryParams, (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Error updating user status." });
    }

    if (results.affectedRows === 0) {
      return res
        .status(404)
        .json({ message: "User not found or unauthorized." });
    }

    return res
      .status(200)
      .json({ message: "User status updated successfully." });
  });
};

//=============================================================================================
exports.AgentSummary = (req, res) => {
  const adminId = req.user.userId;
  const userId = req.params.user_id;

  // console.log(`Executing query with adminId: ${adminId} and userId: ${userId}`);
  const query = `
    SELECT admin, call_from, call_to, start_time, dur, direction, status, record_url
    FROM cdr
    WHERE admin = ? AND (call_from = ? OR call_to = ?) 
    ORDER BY id DESC
  `;

  // query has 3 placeholders — userId was only passed once before
  db.query(query, [adminId, userId, userId], (err, data) => {
    if (err) {
      return res.status(500).json({ error: "Database query failed" });
    }

    if (data.length === 0) {
      return res
        .status(404)
        .json({ message: "No records found for the given ID" });
    }

    return res.json(data);
  });
};

exports.createAdmin = (req, res) => {
  const superAdminId = req.user.userId;

  const {
    user_id,
    password,
    full_name,
    ext_number,
    use_did,
    admin_mobile,
    admin_email,
    context,
  } = req.body;

  // Use provided context, otherwise default to telephony
  const sipContext = cleanText(context) || "telephony";

  const newAdmin = {
    SuperAdmin: superAdminId,
    admin: user_id,
    user_id,
    password,
    full_name,
    ext_number,
    use_did,
    admin_mobile: admin_mobile || "",
    admin_email: admin_email || "",
    context: sipContext,
    user_type: 8,
    status: "active",
    ins_date: new Date(),
    user_timezone: "Asia/Kolkata",
  };

  const query = "INSERT INTO users SET ?";

  hasContextColumn().then((useContext) => {
    if (!useContext) delete newAdmin.context;

    db.query(query, newAdmin, async (err, result) => {
      if (err) {
        console.error("❌ DB Error:", err);
        return res.status(500).json({
          message: "Failed to create admin.",
        });
      }

      try {
        upsertSipUser(user_id, password, sipContext, full_name);
      } catch (err) {
        console.error("⚠️ PJSIP update error:", err);
        return res.status(500).json({
          message: "Admin created, but failed to update PJSIP config.",
          error: err.message,
        });
      }

      const amiReload = await reloadSIPViaAMI();
      return res.status(201).json({
        message: "Admin created and SIP reloaded.",
        adminId: result.insertId,
        ...sipReloadInfo(amiReload),
      });
    });
  });
};

exports.editAdmin = (req, res) => {
  const userId = req.params.user_id;
  const superAdminId = req.user.userId;

  const {
    full_name,
    password,
    ext_number,
    use_did,
    admin_mobile,
    admin_email,
    context,
  } = req.body;

  const updateData = {
    full_name,
    ext_number,
    use_did,
    admin_mobile,
    admin_email,
    SuperAdmin: superAdminId,
  };

  // Update password only if provided
  if (cleanText(password) !== "") {
    updateData.password = password;
  }

  // Fields not sent by the client are left unchanged (undefined -> NULL otherwise)
  Object.keys(updateData).forEach((k) => {
    if (updateData[k] === undefined) delete updateData[k];
  });

  const query = "UPDATE users SET ? WHERE user_id = ?";

  hasContextColumn().then((useContext) => {
    // Update context only if provided (and the column exists)
    if (useContext && cleanText(context) !== "") {
      updateData.context = cleanText(context);
    }

    db.query(query, [updateData, userId], (updateErr, result) => {
      if (updateErr) {
        console.error("❌ Update error:", updateErr);
        return res.status(500).json({ message: "Error updating user." });
      }

      if (result.affectedRows === 0) {
        return res
          .status(404)
          .json({ message: "User not found or no changes made." });
      }

      // Fetch latest context & password from DB
      const getUserQuery = useContext
        ? "SELECT user_id, context, password, full_name FROM users WHERE user_id = ?"
        : "SELECT user_id, password, full_name FROM users WHERE user_id = ?";

      db.query(getUserQuery, [userId], async (fetchErr, users) => {
        if (fetchErr) {
          console.error("❌ Fetch error:", fetchErr);
          return res
            .status(500)
            .json({ message: "Failed to fetch updated user." });
        }

        if (users.length === 0) {
          return res.status(404).json({ message: "User not found." });
        }

        const dbUser = users[0];

        const sipContext = dbUser.context || "telephony";
        const sipPassword = dbUser.password;

        try {
          upsertSipUser(
            dbUser.user_id,
            sipPassword,
            sipContext,
            dbUser.full_name,
          );
        } catch (e) {
          console.error("File error:", e);
          return res.status(500).json({
            message: "User updated but failed to update SIP configuration.",
          });
        }

        const amiReload = await reloadSIPViaAMI();
        return res.status(200).json({
          message: "User updated.",
          updatedUser: {
            user_id: userId,
            full_name,
            admin_email,
          },
          ...sipReloadInfo(amiReload),
        });
      });
    });
  });
};

exports.getAdmins = (req, res) => {
  const superAdminId = req.user.userId;
  const query = `
SELECT 
  a.*, 
  IFNULL(agent_counts.agentCount, 0) AS avail_agents,
  CASE 
    WHEN ll.token IS NOT NULL THEN 'Login'
    ELSE 'Logout'
  END AS loginStatus
FROM users a
LEFT JOIN (
  SELECT admin, COUNT(*) AS agentCount 
  FROM users 
  WHERE user_type != 8 
  GROUP BY admin
) agent_counts ON a.user_id = agent_counts.admin
LEFT JOIN (
  SELECT user_name, MAX(token) AS token
  FROM login_log
  WHERE token IS NOT NULL 
    AND DATE(log_in_time) = CURDATE()  
  GROUP BY user_name
) ll ON a.user_id = ll.user_name
WHERE a.SuperAdmin = ?
  AND a.user_type = 8
ORDER BY a.id DESC;
`;

  // console.log("Executing SQL:", query.replace("?", `'${superAdminId}'`));

  db.query(query, [superAdminId], (err, results) => {
    if (err) {
      console.error("Error fetching admins:", err);
      return res.status(500).json({ message: "Internal server error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "No admins found" });
    }

    return res.status(200).json(results);
  });
};