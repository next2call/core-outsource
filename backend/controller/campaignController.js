/* =============================================================================
 * campaignController.js  (complete file - replace the WHOLE old file with this)
 *
 * Same routes, same request fields, same responses for the frontend.
 * What changed:
 *  - getCampaigns : 30s cache per user, super admin uses 2 simple queries
 *                   instead of a nested subquery, audio links from the right columns
 *  - postCampaign : duplicate check + insert in ONE query, missing id rejected
 *  - editCampaign : ONE query instead of two, missing fields keep their value
 *  - every write  : only the owner (admin / their super admin) can change a campaign
 *  - deleteCampaign fixed (it never returned 404, and failed with the mysql2 driver)
 *  - uploads      : unique file names (two campaigns uploading "welcome.wav" no
 *                   longer overwrite each other), 20 MB limit, audio files only,
 *                   rejected / failed uploads are deleted
 *  - removed console.log on every request (slows a busy server)
 * ========================================================================== */
const db = require("../models/db");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

/* ----------------------------- upload setup ------------------------------ */
const UPLOAD_DIR = "uploads/";
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const AUDIO_EXT = [".wav", ".mp3", ".gsm", ".ulaw", ".alaw", ".sln", ".ogg", ".m4a", ".aac", ".wma", ".amr"];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  // timestamp prefix keeps the original name readable but unique
  filename: (req, file, cb) => {
    const safe = path.basename(file.originalname).replace(/[^A-Za-z0-9._-]/g, "_");
    cb(null, `${Date.now()}_${Math.round(Math.random() * 1e4)}_${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB per file
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (AUDIO_EXT.includes(ext) || (file.mimetype || "").startsWith("audio/")) return cb(null, true);
    cb(new Error("Only audio files are allowed."));
  },
}).fields([
  { name: "welcome_ivr", maxCount: 1 },
  { name: "after_office_ivr", maxCount: 1 },
  { name: "music_on_hold", maxCount: 1 },
  { name: "ring_tone_music", maxCount: 1 },
  { name: "no_agent_ivr", maxCount: 1 },
  { name: "week_off_ivr", maxCount: 1 },
]);

const IVR_FIELDS = ["welcome_ivr", "after_office_ivr", "music_on_hold", "ring_tone_music", "no_agent_ivr", "week_off_ivr"];
const CAMPAIGN_ID_RE = /^[A-Za-z0-9]{1,30}$/;

/* ------------------------------- helpers --------------------------------- */
const query = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)))
  );

// delete files multer just saved (request rejected or DB failed)
const removeUploaded = (files) => {
  Object.values(files || {}).flat().forEach((f) => {
    if (f && f.path) fs.unlink(f.path, () => {});
  });
};

const uploadedPath = (files, name) =>
  files && files[name] && files[name][0] ? files[name][0].path.replace(/\\/g, "/") : null;

const uploadErrorResponse = (res, err) => {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ message: "Audio file is too large (max 20 MB)." });
  }
  if (err && err.message === "Only audio files are allowed.") {
    return res.status(400).json({ message: err.message });
  }
  console.error("File upload error:", err);
  return res.status(500).json({ message: "Error uploading files." });
};

// who may change a campaign: the admin who owns it, or that admin's super admin
const ownerWhere = (user) =>
  Number(user.userType) === 9
    ? { sql: "admin IN (SELECT DISTINCT admin FROM users WHERE SuperAdmin = ?)", params: [user.userId] }
    : { sql: "admin = ?", params: [user.userId] };

/* ------------------------------ list cache ------------------------------- */
const CAMPAIGN_CACHE_TTL = 30 * 1000;
const campaignCache = new Map();
const clearCampaignCache = () => campaignCache.clear();

// set UPLOADS_BASE_URL in .env, e.g. https://ringfy.next2call.com:4000/uploads/
// (the folder name is already in the stored path, so the base usually ends at the domain/port)
const UPLOADS_BASE_URL = process.env.UPLOADS_BASE_URL || "http://localhost:5000/uploads/";
const toAudioUrl = (file) => (file ? UPLOADS_BASE_URL + String(file).replace(/\\/g, "/") : null);

async function loadCampaigns(userId, userType) {
  let rows;
  if (userType === 9) {
    const admins = (
      await query("SELECT DISTINCT admin FROM users WHERE SuperAdmin = ? AND admin IS NOT NULL", [userId])
    ).map((r) => r.admin);
    if (!admins.length) return [];
    rows = await query("SELECT * FROM compaign_list WHERE admin IN (?) ORDER BY id DESC", [admins]);
  } else {
    rows = await query("SELECT * FROM compaign_list WHERE admin = ? ORDER BY id DESC", [userId]);
  }

  return rows.map((c) => ({
    ...c,
    // audio links from the FILE columns (week_off / ivr are settings, not files)
    week_off_audio: toAudioUrl(c.week_off_ivr),
    after_office_ivr_audio: toAudioUrl(c.after_office_ivr),
    ivr_audio: toAudioUrl(c.welcome_ivr),
    no_agent_ivr_audio: toAudioUrl(c.no_agent_ivr),
    ringtone_audio: toAudioUrl(c.ring_tone_music),
    music_on_hold_audio: toAudioUrl(c.music_on_hold),
  }));
}

/* =============================================================================
 * GET /campaigns
 * ========================================================================== */
exports.getCampaigns = async (req, res) => {
  const userId = req.user.userId;
  const userType = Number(req.user.userType);
  const key = `${userType}|${userId}`;

  try {
    let hit = campaignCache.get(key);
    if (!hit || hit.exp < Date.now() || req.query.fresh === "1") {
      // stores the promise: requests arriving together share ONE query
      hit = {
        exp: Date.now() + CAMPAIGN_CACHE_TTL,
        promise: loadCampaigns(userId, userType).catch((err) => {
          campaignCache.delete(key);
          throw err;
        }),
      };
      if (campaignCache.size > 2000) campaignCache.clear();
      campaignCache.set(key, hit);
    }

    const campaigns = await hit.promise;
    if (campaigns.length === 0) {
      return res.status(404).json({ message: "No campaigns found." });
    }
    return res.status(200).json(campaigns);
  } catch (err) {
    console.error("Database error:", err);
    return res.status(500).json({ message: "Error fetching campaign data." });
  }
};

/* =============================================================================
 * POST /campaigns
 * ========================================================================== */
exports.postCampaign = (req, res) => {
  upload(req, res, async (err) => {
    if (err) return uploadErrorResponse(res, err);

    const b = req.body || {};
    const files = req.files || {};
    const userId = req.user.userId;
    const userType = Number(req.user.userType);
    const compaign_id = typeof b.compaign_id === "string" ? b.compaign_id.trim() : "";

    const reject = (code, message) => {
      removeUploaded(files);
      return res.status(code).json({ message });
    };

    if (!CAMPAIGN_ID_RE.test(compaign_id)) {
      return reject(400, "Invalid Campaign ID. Only letters and numbers allowed (no spaces or special characters), max 30.");
    }

    try {
      let admin = userId;
      if (userType === 9) {
        // super admin picks the admin; it must be one of theirs
        admin = b.admin ? String(b.admin) : "";
        if (!admin) return reject(400, "Please select an admin for this campaign.");
        const ok = await query("SELECT 1 FROM users WHERE SuperAdmin = ? AND admin = ? LIMIT 1", [userId, admin]);
        if (!ok.length) return reject(403, "You can't create a campaign for this admin.");
      }

      const paths = {};
      IVR_FIELDS.forEach((f) => (paths[f] = uploadedPath(files, f)));

      // duplicate check + insert in one statement
      const result = await query(
        `INSERT INTO compaign_list (
           compaign_id, compaignname, campaign_number, outbond_cli,
           campaign_dis, status, local_call_time, week_off,
           script_notes, ring_time, auto_dial_level, auto_dial_status,
           ivr, type, admin,
           welcome_ivr, after_office_ivr, music_on_hold,
           ring_tone_music, no_agent_ivr, week_off_ivr
         )
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         FROM DUAL
         WHERE NOT EXISTS (SELECT 1 FROM compaign_list WHERE compaign_id = ?)`,
        [
          compaign_id, b.compaignname, b.campaign_number, b.outbond_cli,
          b.campaign_dis, b.status, b.local_call_time, b.week_off,
          b.script_notes, b.ring_time, b.auto_dial_level, b.auto_dial_status,
          b.ivr, b.type, admin,
          paths.welcome_ivr, paths.after_office_ivr, paths.music_on_hold,
          paths.ring_tone_music, paths.no_agent_ivr, paths.week_off_ivr,
          compaign_id,
        ]
      );

      if (result.affectedRows === 0) {
        return reject(400, "Campaign ID already exists. Please use a unique one.");
      }

      clearCampaignCache();
      return res.status(200).json({
        message: "Campaign added successfully.",
        id: result.insertId,
        audioPaths: paths,
      });
    } catch (e) {
      if (e.code === "ER_DUP_ENTRY") return reject(400, "Campaign ID already exists. Please use a unique one.");
      console.error("Database error:", e);
      return reject(500, "Error adding campaign.");
    }
  });
};

/* =============================================================================
 * GET /campaigns/checkDuplicateId/:id   -> { exists: true/false }
 * ========================================================================== */
exports.checkDuplicate = (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!CAMPAIGN_ID_RE.test(id)) return res.json({ exists: false });

  db.query("SELECT 1 FROM compaign_list WHERE compaign_id = ? LIMIT 1", [id], (error, results) => {
    if (error) {
      console.error("Error checking duplicate campaign ID:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
    return res.json({ exists: results.length > 0 });
  });
};

/* =============================================================================
 * PUT /campaigns/:id   (id = compaign_id)
 * ========================================================================== */
exports.editCampaign = (req, res) => {
  upload(req, res, async (err) => {
    if (err) return uploadErrorResponse(res, err);

    const b = req.body || {};
    const files = req.files || {};
    // missing field -> null -> COALESCE keeps the saved value
    const field = (name) => (b[name] === undefined ? null : b[name]);
    const owner = ownerWhere(req.user);

    try {
      const result = await query(
        `UPDATE compaign_list SET
           compaignname     = COALESCE(?, compaignname),
           campaign_number  = COALESCE(?, campaign_number),
           outbond_cli      = COALESCE(?, outbond_cli),
           campaign_dis     = COALESCE(?, campaign_dis),
           status           = COALESCE(?, status),
           local_call_time  = COALESCE(?, local_call_time),
           week_off         = COALESCE(?, week_off),
           script_notes     = COALESCE(?, script_notes),
           ring_time        = COALESCE(?, ring_time),
           auto_dial_level  = COALESCE(?, auto_dial_level),
           type             = COALESCE(?, type),
           ivr              = COALESCE(?, ivr),
           welcome_ivr      = COALESCE(?, welcome_ivr),
           after_office_ivr = COALESCE(?, after_office_ivr),
           music_on_hold    = COALESCE(?, music_on_hold),
           ring_tone_music  = COALESCE(?, ring_tone_music),
           no_agent_ivr     = COALESCE(?, no_agent_ivr),
           week_off_ivr     = COALESCE(?, week_off_ivr)
         WHERE compaign_id = ? AND ${owner.sql}`,
        [
          field("compaignname"), field("campaign_number"), field("outbond_cli"),
          field("campaign_dis"), field("status"), field("local_call_time"),
          field("week_off"), field("script_notes"), field("ring_time"),
          field("auto_dial_level"), field("type"), field("ivr"),
          ...IVR_FIELDS.map((f) => uploadedPath(files, f)),
          req.params.id,
          ...owner.params,
        ]
      );

      if (result.affectedRows === 0) {
        removeUploaded(files);
        return res.status(404).json({ message: "Campaign not found" });
      }
      clearCampaignCache();
      return res.status(200).json({ message: "Campaign updated successfully." });
    } catch (e) {
      console.error("Database error during update:", e);
      removeUploaded(files);
      return res.status(500).json({ message: "Error updating campaign." });
    }
  });
};

/* =============================================================================
 * PUT /campaigns/clearIvr/:id   -> remove all audio from a campaign
 * ========================================================================== */
exports.clearIVRs = (req, res) => {
  const owner = ownerWhere(req.user);
  db.query(
    `UPDATE compaign_list SET
       welcome_ivr = NULL, after_office_ivr = NULL, music_on_hold = NULL,
       ring_tone_music = NULL, no_agent_ivr = NULL, week_off_ivr = NULL
     WHERE compaign_id = ? AND ${owner.sql}`,
    [req.params.id, ...owner.params],
    (err, result) => {
      if (err) {
        console.error("Error clearing IVRs:", err);
        return res.status(500).json({ message: "Failed to clear IVRs." });
      }
      if (result.affectedRows === 0) return res.status(404).json({ message: "Campaign not found." });
      clearCampaignCache();
      return res.status(200).json({ message: "IVRs cleared successfully." });
    }
  );
};

/* =============================================================================
 * PUT /campaigns/removeIvr/:id   body: { field: "welcome_ivr" }
 * ========================================================================== */
exports.removeSingleIVR = (req, res) => {
  const { field } = req.body || {};
  if (!IVR_FIELDS.includes(field)) {
    return res.status(400).json({ message: "Invalid IVR field." });
  }
  const owner = ownerWhere(req.user);

  // `field` is safe in the SQL: it can only be one of IVR_FIELDS
  db.query(
    `UPDATE compaign_list SET ${field} = NULL WHERE compaign_id = ? AND ${owner.sql}`,
    [req.params.id, ...owner.params],
    (err, result) => {
      if (err) {
        console.error("Error removing IVR:", err);
        return res.status(500).json({ message: "Failed to remove IVR." });
      }
      if (result.affectedRows === 0) return res.status(404).json({ message: "Campaign not found." });
      clearCampaignCache();
      return res.status(200).json({ message: `${field} removed successfully.` });
    }
  );
};

/* =============================================================================
 * DELETE /campaigns/:id   (id = compaign_id)
 * ========================================================================== */
exports.deleteCampaign = (req, res) => {
  const owner = ownerWhere(req.user);
  db.query(
    `DELETE FROM compaign_list WHERE compaign_id = ? AND ${owner.sql}`,
    [req.params.id, ...owner.params],
    (err, result) => {
      if (err) {
        console.error("Error deleting campaign:", err);
        return res.status(500).json({ message: "An error occurred while deleting the campaign." });
      }
      if (result.affectedRows === 0) return res.status(404).json({ message: "Campaign not found." });
      clearCampaignCache();
      return res.status(200).json({ message: "Campaign deleted successfully." });
    }
  );
};

/* =============================================================================
 * PUT /campaigns/status/:id   (id = numeric row id)  body: { status: "active" | "inactive" }
 * ========================================================================== */
exports.statusToggler = (req, res) => {
  const dbStatus = (req.body || {}).status === "active" ? "Y" : "N";
  const owner = ownerWhere(req.user);

  db.query(
    `UPDATE compaign_list SET status = ? WHERE id = ? AND ${owner.sql}`,
    [dbStatus, req.params.id, ...owner.params],
    (err, result) => {
      if (err) {
        console.error("Error updating status:", err);
        return res.status(500).json({ message: "Internal Server Error" });
      }
      if (result.affectedRows === 0) return res.status(404).json({ message: "Campaign not found" });
      clearCampaignCache();
      return res.status(200).json({ message: "Status updated successfully" });
    }
  );
};

exports.clearCampaignCache = clearCampaignCache;