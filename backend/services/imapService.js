const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const billingDb = require('../models/billingdb');

function createClient(data) {
  return new ImapFlow({
    host: data.imapHost,
    port: Number(data.imapPort) || 993,
    secure: true,
    auth: {
      user: data.email,
      pass: data.password,
    },
    logger: false, // set to console for verbose IMAP debug logs
  });
}

/**
 * Fetch a page of the inbox, newest first.
 * Lightweight: envelope + flags only, no body — keeps the list fast.
 */
async function getInbox({ page = 1, limit = 20, userId } = {}) {

  const result = await new Promise((resolve, reject) => {
    billingDb.query(
      `SELECT email, password, imapHost, imapPort, smtpHost, smtpPort
     FROM email_info
     WHERE userId = ?`,
      [userId],
      (err, results) => {
        if (err) return reject(err);
        resolve(results);
      }
    );
  });

  const client = createClient(result[0]);
  await client.connect();

  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const total = client.mailbox.exists;
      if (total === 0) return { messages: [], total: 0 };

      const end = total - (page - 1) * limit;
      const start = Math.max(1, end - limit + 1);
      if (end < 1) return { messages: [], total };

      const messages = [];
      for await (const msg of client.fetch(`${start}:${end}`, {
        envelope: true,
        flags: true,
        uid: true,
        size: true,
      })) {
        messages.push({
          uid: msg.uid,
          from: msg.envelope.from?.[0] || null,
          to: msg.envelope.to || [],
          subject: msg.envelope.subject || '(no subject)',
          date: msg.envelope.date,
          seen: msg.flags.has('\\Seen'),
          size: msg.size,
        });
      }

      messages.reverse(); // newest first
      return { messages, total };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

/**
 * Fetch full body + attachments for a single message, and mark it read.
 */
async function getMessage(uid, userId) {

  const result = await new Promise((resolve, reject) => {
    billingDb.query(
      `SELECT email, password, imapHost, imapPort, smtpHost, smtpPort
     FROM email_info
     WHERE userId = ?`,
      [userId],
      (err, results) => {
        if (err) return reject(err);
        resolve(results);
      }
    );
  });

  const client = createClient(result[0]);
  await client.connect();

  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const { content } = await client.download(uid, undefined, { uid: true });
      const parsed = await simpleParser(content);

      await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });

      return {
        uid,
        from: parsed.from?.text || null,
        to: parsed.to?.text || null,
        subject: parsed.subject || '(no subject)',
        date: parsed.date,
        text: parsed.text || '',
        html: parsed.html || null,
        attachments: (parsed.attachments || []).map((a) => ({
          filename: a.filename,
          size: a.size,
          contentType: a.contentType,
        })),
      };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

module.exports = { getInbox, getMessage };