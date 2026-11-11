const express = require('express');
const authenticate = require('../middlewares/authenticateMiddleware');
const router = express.Router();

const smtpService = require('../services/smtpService');
const { getInbox, getMessage } = require('../services/imapService');
const billingDb = require('../models/billingdb');


router.post("/configure", authenticate(), async (req, res) => {
  try {
    const userId = req.user.userId;

    const {
      email,
      password,
      imapHost,
      imapPort,
      smtpHost,
      smtpPort,
    } = req.body;

    if (
      !email ||
      !password ||
      !imapHost ||
      !imapPort ||
      !smtpHost ||
      !smtpPort
    ) {
      return res.status(400).json({
        success: false,
        error: "All fields are required.",
      });
    }

    const query = `
      INSERT INTO email_info
      (userId, email, password, imapHost, imapPort, smtpHost, smtpPort)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        email = VALUES(email),
        password = VALUES(password),
        imapHost = VALUES(imapHost),
        imapPort = VALUES(imapPort),
        smtpHost = VALUES(smtpHost),
        smtpPort = VALUES(smtpPort)
    `;

    const result = await new Promise((resolve, reject) => {
      billingDb.query(
        query,
        [
          userId,
          email,
          password,
          imapHost,
          imapPort,
          smtpHost,
          smtpPort,
        ],
        (err, results) => {
          if (err) return reject(err);
          resolve(results);
        }
      );
    });

    return res.status(200).json({
      success: true,
      message:
        result.affectedRows === 1
          ? "Email configuration inserted successfully."
          : "Email configuration updated successfully.",
    });
  } catch (error) {
    console.error("Configure Error:", error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.get("/check-config", authenticate(), async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await new Promise((resolve, reject) => {
      billingDb.query(
        `SELECT 1
         FROM email_info
         WHERE userId = ?
         LIMIT 1`,
        [userId],
        (err, results) => {
          if (err) return reject(err);
          resolve(results);
        }
      );
    });

    return res.json({
      exists: result.length > 0,
    });
  } catch (error) {
    console.error("Error checking email config:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});


router.get('/inbox', authenticate(), async (req, res) => {
  try {
    const userId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const data = await getInbox({ page, limit, userId });
    return res.status(200).json(data);
  } catch (err) {
    console.error('Inbox fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch inbox' });
  }
});

// GET /mail/sent
router.get('/sent', authenticate(), async (req, res) => {
  try {
    const userId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const data = await smtpService.getSent({ page, limit, userId });
    return res.status(200).json(data);
  } catch (err) {
    console.error('Sent fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch sent messages' });
  }
});

// GET /mail/message/:uid            -> inbox message (default)
// GET /mail/message/:uid?folder=sent -> sent message
router.get('/message/:uid', authenticate(), async (req, res) => {
  try {
    const userId = req.user.userId;
    const uid = Number(req.params.uid);

    if (req.query.folder === 'sent') {
      const message = await smtpService.getSentMessage(uid, userId);
      return res.json(message);
    }

    const message = await getMessage(uid, userId);
    return res.json(message);
  } catch (err) {
    console.error('Message fetch error:', err);
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Failed to fetch message' });
  }
});

// POST /mail/send  { to, subject, text, html?, replyTo?, cc?, bcc? }
router.post('/send', authenticate(), async (req, res) => {
  try {
    const userId = req.user.userId;
    const { to, subject, text, html, replyTo, cc, bcc } = req.body;
    if (!to || !subject) {
      return res.status(400).json({ error: 'to and subject are required' });
    }
    const info = await smtpService.sendMail({ userId, to, subject, text, html, replyTo, cc, bcc });
    res.json({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error('Send error:', err);
    res.status(500).json({ error: err.message || 'Failed to send email' });
  }
});

module.exports = router;