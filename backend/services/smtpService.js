const nodemailer = require('nodemailer');
const billingDb = require('../models/billingdb');

function getUserEmailConfig(userId) {
  return new Promise((resolve, reject) => {
    billingDb.query(
      `SELECT email, password, smtpHost, smtpPort
       FROM email_info
       WHERE userId = ?`,
      [userId],
      (err, results) => {
        if (err) return reject(err);
        if (!results.length) {
          return reject(new Error('Email is not configured for this account.'));
        }
        resolve(results[0]);
      }
    );
  });
}

function createTransporter(config) {
  const port = Number(config.smtpPort) || 465;
  return nodemailer.createTransport({
    host: config.smtpHost,
    port,
    // 465 uses implicit TLS; 587 (and most others) use STARTTLS, which
    // nodemailer negotiates automatically when secure is false.
    secure: port === 465,
    auth: {
      user: config.email,
      pass: config.password,
    },
  });
}

function logSentEmail({ userId, fromEmail, to, cc, bcc, subject, text, html, messageId }) {
  return new Promise((resolve, reject) => {
    billingDb.query(
      `INSERT INTO sent_emails
       (userId, fromEmail, \`to\`, cc, bcc, subject, text_body, html_body, messageId)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, fromEmail, to, cc || null, bcc || null, subject, text || null, html || null, messageId || null],
      (err, results) => {
        if (err) return reject(err);
        resolve(results);
      }
    );
  });
}

/**
 * Sends using the credentials the user configured via /configure —
 * previously this used a single global env-var account for everyone,
 * regardless of who was logged in. After a successful send, a copy is
 * logged so it can show up in that user's Sent list.
 */
async function sendMail({ userId, to, subject, text, html, replyTo, cc, bcc }) {
  const config = await getUserEmailConfig(userId);
  const transporter = createTransporter(config);

  const info = await transporter.sendMail({
    from: config.email,
    to,
    cc,
    bcc,
    subject,
    text,
    html,
    replyTo,
  });

  await logSentEmail({
    userId,
    fromEmail: config.email,
    to,
    cc,
    bcc,
    subject,
    text,
    html,
    messageId: info.messageId,
  });

  return info;
}

/**
 * Paginated Sent list, newest first — mirrors the shape of imapService's
 * getInbox() so the frontend can treat both folders the same way.
 */
async function getSent({ page = 1, limit = 20, userId } = {}) {
  const offset = (page - 1) * limit;

  const total = await new Promise((resolve, reject) => {
    billingDb.query(
      `SELECT COUNT(*) AS count FROM sent_emails WHERE userId = ?`,
      [userId],
      (err, results) => {
        if (err) return reject(err);
        resolve(results[0].count);
      }
    );
  });

  const rows = await new Promise((resolve, reject) => {
    billingDb.query(
      `SELECT id, \`to\`, subject, sentAt
       FROM sent_emails
       WHERE userId = ?
       ORDER BY sentAt DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset],
      (err, results) => {
        if (err) return reject(err);
        resolve(results);
      }
    );
  });

  const messages = rows.map((r) => ({
    uid: r.id,
    to: r.to,
    subject: r.subject,
    date: r.sentAt,
  }));

  return { messages, total };
}

/**
 * Full body for a single sent message.
 */
async function getSentMessage(id, userId) {
  const rows = await new Promise((resolve, reject) => {
    billingDb.query(
      `SELECT id, fromEmail, \`to\`, cc, bcc, subject, text_body, html_body, sentAt
       FROM sent_emails
       WHERE id = ? AND userId = ?
       LIMIT 1`,
      [id, userId],
      (err, results) => {
        if (err) return reject(err);
        resolve(results);
      }
    );
  });

  if (!rows.length) {
    const err = new Error('Message not found');
    err.status = 404;
    throw err;
  }

  const r = rows[0];
  return {
    uid: r.id,
    from: r.fromEmail,
    to: r.to,
    subject: r.subject,
    date: r.sentAt,
    text: r.text_body || '',
    html: r.html_body || null,
    attachments: [],
  };
}

module.exports = { sendMail, getSent, getSentMessage };