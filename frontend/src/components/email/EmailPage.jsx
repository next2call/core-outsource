import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Settings, Mail, Inbox as InboxIcon, Send as SendIcon, Check, AlertCircle, RefreshCw,
  Search, X, ChevronLeft, ChevronRight, Reply, Paperclip, ArrowLeft, Pencil, Loader2,
} from 'lucide-react';
import './email.css';
import EmailConfigModal from './Emailconfigmodal';

const API_BASE = `https://${window.location.hostname}:4000`;

// Module-level cache: lives outside the component, so it survives
// navigating away from this page and coming back. Keyed by "folder:page".
const messageCache = new Map();

const POLL_INTERVAL_MS = 20000;
const LIMIT = 20;

function getToken() {
  return localStorage.getItem('token');
}

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}/mail${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

/* ---------- helpers ---------- */

function toDate(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatListDate(v) {
  const d = toDate(v);
  if (!d) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString([], sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatFullDate(v) {
  const d = toDate(v);
  if (!d) return '';
  return d.toLocaleString([], {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function formatSize(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

// Address fields can come back as a string ("Name <a@b.com>" or "a@b.com"),
// a {name, address} object, or an array of either. Normalise to a list.
function parseAddresses(field) {
  if (!field) return [];
  if (Array.isArray(field)) return field.flatMap(parseAddresses);
  if (typeof field === 'object') {
    if (Array.isArray(field.value)) return parseAddresses(field.value);
    return [{ name: field.name || '', address: field.address || '' }];
  }
  return String(field)
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
      if (m) return { name: m[1].trim(), address: m[2].trim() };
      return part.includes('@') ? { name: '', address: part } : { name: part, address: '' };
    });
}

function firstAddress(field) {
  return parseAddresses(field)[0] || { name: '', address: '' };
}

function contactLabel(field) {
  const list = parseAddresses(field);
  if (!list.length) return 'Unknown';
  const first = list[0].name || list[0].address || 'Unknown';
  return list.length > 1 ? `${first} +${list.length - 1}` : first;
}

function contactInitials(field) {
  const { name, address } = firstAddress(field);
  if (name) {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
  }
  return address ? address[0].toUpperCase() : '?';
}

const AVATAR_TONES = ['indigo', 'teal', 'amber', 'rose', 'sky', 'violet'];
function avatarTone(field) {
  const { name, address } = firstAddress(field);
  const key = (address || name || '?').toLowerCase();
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

function listAddresses(field) {
  const list = parseAddresses(field);
  if (!list.length) return '';
  return list.map((a) => (a.name && a.address ? `${a.name} <${a.address}>` : a.name || a.address)).join(', ');
}

function contactField(m, folder) {
  return folder === 'sent' ? m.to : m.from;
}

function Avatar({ field, size }) {
  return (
    <span className={`em-avatar em-avatar--${avatarTone(field)} ${size === 'lg' ? 'em-avatar--lg' : ''}`}>
      {contactInitials(field)}
    </span>
  );
}

const FOLDERS = [
  { key: 'inbox', label: 'Inbox', icon: InboxIcon },
  { key: 'sent', label: 'Sent', icon: SendIcon },
];

/* ---------- page ---------- */

export default function EmailClient() {
  // null = still checking, true/false = known
  const [configured, setConfigured] = useState(null);
  const [configError, setConfigError] = useState(null);
  const [account, setAccount] = useState('');
  const [configModalOpen, setConfigModalOpen] = useState(false);

  const [folder, setFolder] = useState('inbox');
  const [messages, setMessages] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [refreshingKey, setRefreshingKey] = useState(null);
  const [selectedUid, setSelectedUid] = useState(null);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [loadingMessage, setLoadingMessage] = useState(false);
  const [compose, setCompose] = useState(null); // null | { to, subject, body }
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState(null); // { type: 'success' | 'error', text }

  const folderRef = useRef(folder);
  const pageRef = useRef(page);
  const openRequest = useRef(0);
  useEffect(() => { folderRef.current = folder; }, [folder]);
  useEffect(() => { pageRef.current = page; }, [page]);

  const isCurrent = (f, p) => folderRef.current === f && pageRef.current === p;

  const loadMessages = useCallback(async (f, p, { silent = false } = {}) => {
    const cacheKey = `${f}:${p}`;
    const hasCache = messageCache.has(cacheKey);

    // Big loading state only when there is nothing to show yet.
    if (silent || hasCache) setRefreshingKey(cacheKey);
    else setLoadingList(true);

    try {
      // Assumes a "/sent" list endpoint mirroring "/inbox".
      const data = await api(`/${f}?page=${p}&limit=${LIMIT}`);
      const entry = { messages: data.messages || [], total: data.total || 0 };
      messageCache.set(cacheKey, entry);
      if (folderRef.current === f && pageRef.current === p) {
        setMessages(entry.messages);
        setTotal(entry.total);
        setError(null);
      }
    } catch (err) {
      if (folderRef.current === f && pageRef.current === p) setError(err.message);
    } finally {
      // Only clear the spinner this request started, so a slow refresh
      // of another view can't leave the button stuck.
      setRefreshingKey((k) => (k === cacheKey ? null : k));
      if (folderRef.current === f && pageRef.current === p) setLoadingList(false);
    }
  }, []);

  const verifyConfig = useCallback(async () => {
    setConfigured(null);
    setConfigError(null);
    try {
      const data = await api('/check-config');
      setConfigured(!!data.exists);
      if (data.email) setAccount(data.email);
      if (!data.exists) {
        setConfigModalOpen(true);
        setLoadingList(false);
      }
    } catch (err) {
      setConfigError(err.message);
      setLoadingList(false);
    }
  }, []);

  useEffect(() => { verifyConfig(); }, [verifyConfig]);

  // Folder or page changed: paint the cached view instantly, or load it.
  useEffect(() => {
    if (!configured) return;
    const cached = messageCache.get(`${folder}:${page}`);
    if (cached) {
      setMessages(cached.messages);
      setTotal(cached.total);
      setError(null);
      setLoadingList(false);
      return;
    }
    setMessages([]);
    loadMessages(folder, page);
  }, [configured, folder, page, loadMessages]);

  // Background poll of the current view. Skipped while the tab is hidden.
  useEffect(() => {
    if (!configured) return undefined;
    const interval = setInterval(() => {
      if (document.hidden) return;
      loadMessages(folderRef.current, pageRef.current, { silent: true });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [configured, loadMessages]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const closeReader = () => {
    openRequest.current += 1;
    setSelectedUid(null);
    setSelectedMessage(null);
    setLoadingMessage(false);
  };

  const switchFolder = (f) => {
    if (f === folder) return;
    closeReader();
    setFolder(f);
    setPage(1);
    setQuery('');
  };

  const goToPage = (p) => {
    setPage(p);
    setQuery('');
  };

  const handleRefresh = () => loadMessages(folder, page, { silent: true });

  const openMessage = async (uid) => {
    const req = ++openRequest.current;
    const f = folder;
    const p = page;
    setSelectedUid(uid);
    setSelectedMessage(null);
    setLoadingMessage(true);
    setCompose(null);
    try {
      // IMAP UIDs are only unique within one folder, so pass it along.
      const msg = await api(`/message/${uid}?folder=${f}`);
      if (req !== openRequest.current) return; // a newer click won
      setSelectedMessage(msg);
      if (f === 'inbox') {
        setMessages((prev) => {
          const updated = prev.map((m) => (m.uid === uid ? { ...m, seen: true } : m));
          const cached = messageCache.get(`${f}:${p}`);
          if (cached) messageCache.set(`${f}:${p}`, { ...cached, messages: updated });
          return updated;
        });
      }
    } catch (err) {
      if (req === openRequest.current) setToast({ type: 'error', text: err.message || 'Could not open message' });
    } finally {
      if (req === openRequest.current) setLoadingMessage(false);
    }
  };

  const startCompose = (draft = {}) => {
    closeReader();
    setCompose({ to: '', subject: '', body: '', ...draft });
  };

  const startReply = (msg) => {
    const sender = firstAddress(msg.replyTo || msg.from);
    const subject = msg.subject || '';
    const quoted = (msg.text || '').split('\n').map((l) => `> ${l}`).join('\n');
    const when = formatFullDate(msg.date);
    startCompose({
      to: sender.address || sender.name || '',
      subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`,
      body: msg.text ? `\n\nOn ${when}, ${contactLabel(msg.from)} wrote:\n${quoted}` : '',
    });
  };

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const rangeStart = total === 0 ? 0 : (page - 1) * LIMIT + 1;
  const rangeEnd = Math.min(page * LIMIT, total);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((m) => {
      const who = listAddresses(contactField(m, folder)).toLowerCase();
      return who.includes(q) || String(m.subject || '').toLowerCase().includes(q);
    });
  }, [messages, query, folder]);

  const unreadOnPage = folder === 'inbox' ? messages.filter((m) => !m.seen).length : 0;

  const handleConfigSaved = (savedEmail) => {
    messageCache.clear();
    if (savedEmail) setAccount(savedEmail);
    setConfigModalOpen(false);
    setConfigured(true);
    closeReader();
    setCompose(null);
    setFolder('inbox');
    setPage(1);
    setMessages([]);
    setToast({ type: 'success', text: 'Email account saved' });
    loadMessages('inbox', 1);
  };

  const handleSent = (to) => {
    setCompose(null);
    setToast({ type: 'success', text: to ? `Message sent to ${to}` : 'Message sent' });
    // Drop every cached Sent page so the new message shows up next time.
    [...messageCache.keys()].filter((k) => k.startsWith('sent:')).forEach((k) => messageCache.delete(k));
    if (folder === 'sent') {
      if (page === 1) loadMessages('sent', 1);
      else setPage(1);
    }
  };

  const refreshing = refreshingKey === `${folder}:${page}`;
  const readerOpen = !!(compose || selectedUid);

  return (
    <div className="em-page">
      <header className="em-header">
        <div>
          <h1 className="em-title">Email</h1>
          <p className="em-subtitle">
            {account ? <>Connected as <b>{account}</b></> : 'Send and receive mail without leaving Ringfy'}
          </p>
        </div>
        {configured && (
          <div className="em-actions">
            <button type="button" className="em-btn em-btn--ghost" onClick={() => setConfigModalOpen(true)}>
              <Settings size={15} /> Account
            </button>
            <button type="button" className="em-btn em-btn--primary" onClick={() => startCompose()}>
              <Pencil size={15} /> Compose
            </button>
          </div>
        )}
      </header>

      {toast && (
        <div className={`em-toast em-toast--${toast.type}`} role="status">
          {toast.type === 'success' ? <Check size={15} /> : <AlertCircle size={15} />}
          <span>{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss"><X size={14} /></button>
        </div>
      )}

      {configError ? (
        <div className="em-card em-card--center">
          <div className="em-empty is-error">
            <span className="em-empty__icon"><AlertCircle size={22} /></span>
            <h3>Couldn't reach the mail server</h3>
            <p>{configError}</p>
            <button type="button" className="em-btn em-btn--ghost" onClick={verifyConfig}>
              <RefreshCw size={15} /> Try again
            </button>
          </div>
        </div>
      ) : configured === false ? (
        <div className="em-card em-card--center">
          <div className="em-empty">
            <span className="em-empty__icon em-empty__icon--brand"><Mail size={22} /></span>
            <h3>Connect your email</h3>
            <p>Add your IMAP and SMTP details to start sending and receiving mail from here.</p>
            <button type="button" className="em-btn em-btn--primary" onClick={() => setConfigModalOpen(true)}>
              <Settings size={15} /> Configure email
            </button>
          </div>
        </div>
      ) : (
        <div className={`em-card em-shell ${readerOpen ? 'has-reader' : ''}`}>
          {/* ---------- list ---------- */}
          <section className="em-list" aria-label="Messages">
            <div className="em-list__head">
              <div className="em-seg" role="tablist">
                {FOLDERS.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={folder === key}
                    className={folder === key ? 'is-active' : ''}
                    onClick={() => switchFolder(key)}
                  >
                    <Icon size={14} />
                    {label}
                    {key === 'inbox' && folder === 'inbox' && unreadOnPage > 0 && <b>{unreadOnPage}</b>}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="em-icon-btn"
                onClick={handleRefresh}
                disabled={refreshing || !configured}
                title="Refresh"
                aria-label="Refresh"
              >
                <RefreshCw size={15} className={refreshing ? 'em-spin' : ''} />
              </button>
            </div>

            <div className="em-search">
              <Search size={15} className="em-search__icon" />
              <input
                type="text"
                placeholder={`Search this page of ${folder === 'sent' ? 'sent mail' : 'your inbox'}`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button type="button" className="em-search__clear" onClick={() => setQuery('')} aria-label="Clear search">
                  <X size={13} />
                </button>
              )}
            </div>

            {error && (
              <div className="em-alert">
                <AlertCircle size={14} />
                <span>{error}</span>
                <button type="button" onClick={handleRefresh}>Retry</button>
              </div>
            )}

            <div className="em-list__scroll">
              {loadingList || configured === null ? (
                <ul className="em-rows" aria-hidden="true">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <li key={i} className="em-row em-row--skeleton">
                      <span className="em-sk em-sk--avatar" />
                      <div className="em-row__body">
                        <span className="em-sk" style={{ width: `${45 + ((i * 13) % 30)}%` }} />
                        <span className="em-sk" style={{ width: `${60 + ((i * 7) % 30)}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : visible.length === 0 ? (
                <div className="em-empty em-empty--list">
                  <span className="em-empty__icon">
                    {query ? <Search size={20} /> : folder === 'sent' ? <SendIcon size={20} /> : <InboxIcon size={20} />}
                  </span>
                  <h3>{query ? 'No matches' : folder === 'sent' ? 'Nothing sent yet' : 'Your inbox is empty'}</h3>
                  <p>{query ? `Nothing on this page matches "${query}".` : 'New mail is checked every 20 seconds.'}</p>
                </div>
              ) : (
                <ul className="em-rows">
                  {visible.map((m) => {
                    const contact = contactField(m, folder);
                    const unread = folder === 'inbox' && !m.seen;
                    const active = selectedUid === m.uid;
                    const snippet = m.snippet || m.preview || '';
                    return (
                      <li key={m.uid}>
                        <button
                          type="button"
                          className={`em-row ${active ? 'is-active' : ''} ${unread ? 'is-unread' : ''}`}
                          onClick={() => openMessage(m.uid)}
                          aria-current={active ? 'true' : undefined}
                        >
                          <Avatar field={contact} />
                          <div className="em-row__body">
                            <div className="em-row__top">
                              <span className="em-row__from">
                                {folder === 'sent' && <span className="em-row__to">To:</span>}
                                {contactLabel(contact)}
                              </span>
                              <span className="em-row__date">{formatListDate(m.date)}</span>
                            </div>
                            <div className="em-row__subject">
                              {unread && <span className="em-row__dot" aria-label="Unread" />}
                              <span>{m.subject || '(no subject)'}</span>
                              {(m.hasAttachments || m.attachments?.length > 0) && <Paperclip size={12} className="em-row__clip" />}
                            </div>
                            {snippet && <div className="em-row__snippet">{snippet}</div>}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="em-list__foot">
              <span>
                {total > 0 ? <>Showing <b>{rangeStart}</b> to <b>{rangeEnd}</b> of <b>{total}</b></> : 'No messages'}
              </span>
              <div className="em-pager">
                <button type="button" disabled={page <= 1} onClick={() => goToPage(page - 1)} aria-label="Previous page">
                  <ChevronLeft size={15} />
                </button>
                <span>{page} / {totalPages}</span>
                <button type="button" disabled={page >= totalPages} onClick={() => goToPage(page + 1)} aria-label="Next page">
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </section>

          {/* ---------- reader ---------- */}
          <section className="em-reader" aria-label="Reader">
            {compose ? (
              <ComposePane
                key={`${compose.to}|${compose.subject}`}
                initial={compose}
                onClose={() => setCompose(null)}
                onSent={handleSent}
              />
            ) : loadingMessage ? (
              <div className="em-message">
                <div className="em-message__head">
                  <span className="em-sk" style={{ width: '55%', height: 18 }} />
                  <div className="em-sender">
                    <span className="em-sk em-sk--avatar em-sk--lg" />
                    <div style={{ flex: 1, display: 'grid', gap: 8 }}>
                      <span className="em-sk" style={{ width: '35%' }} />
                      <span className="em-sk" style={{ width: '25%' }} />
                    </div>
                  </div>
                </div>
                <div className="em-message__body" style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
                  {[92, 80, 86, 60].map((w) => <span key={w} className="em-sk" style={{ width: `${w}%` }} />)}
                </div>
              </div>
            ) : selectedMessage ? (
              <MessageView
                message={selectedMessage}
                folder={folder}
                onBack={closeReader}
                onReply={() => startReply(selectedMessage)}
              />
            ) : (
              <div className="em-empty em-empty--reader">
                <span className="em-empty__icon"><Mail size={22} /></span>
                <h3>No message selected</h3>
                <p>Pick a message from the list to read it, or start a new one.</p>
                <button type="button" className="em-btn em-btn--ghost" onClick={() => startCompose()}>
                  <Pencil size={15} /> Compose
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      <EmailConfigModal
        open={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
        onSaved={handleConfigSaved}
        api={api}
        initialEmail={account}
        firstTime={configured === false}
      />
    </div>
  );
}

/* ---------- message view ---------- */

function MessageView({ message, folder, onBack, onReply }) {
  const from = message.from;
  const fromAddr = firstAddress(from);
  const to = listAddresses(message.to);
  const cc = listAddresses(message.cc);
  const attachments = message.attachments || [];

  return (
    <article className="em-message">
      <div className="em-message__head">
        <div className="em-message__bar">
          <button type="button" className="em-icon-btn em-back" onClick={onBack} aria-label="Back to list">
            <ArrowLeft size={15} />
          </button>
          <h2>{message.subject || '(no subject)'}</h2>
          {folder === 'inbox' && (
            <button type="button" className="em-btn em-btn--ghost em-btn--sm" onClick={onReply}>
              <Reply size={15} /> Reply
            </button>
          )}
        </div>

        <div className="em-sender">
          <Avatar field={from} size="lg" />
          <div className="em-sender__info">
            <div className="em-sender__line">
              <b>{fromAddr.name || fromAddr.address || 'Unknown sender'}</b>
              {fromAddr.name && fromAddr.address && <span>{fromAddr.address}</span>}
            </div>
            {to && <div className="em-sender__meta">To: {to}</div>}
            {cc && <div className="em-sender__meta">Cc: {cc}</div>}
          </div>
          <time className="em-sender__date">{formatFullDate(message.date)}</time>
        </div>
      </div>

      <div className="em-message__body">
        {message.html ? (
          <div className="em-paper">
            <iframe title="Email content" className="em-iframe" srcDoc={message.html} sandbox="" />
          </div>
        ) : message.text ? (
          <pre className="em-text">{message.text}</pre>
        ) : (
          <p className="em-muted">This message has no content.</p>
        )}
      </div>

      {attachments.length > 0 && (
        <div className="em-attachments">
          <div className="em-attachments__label">
            <Paperclip size={13} /> {attachments.length} attachment{attachments.length > 1 ? 's' : ''}
          </div>
          <div className="em-attachments__list">
            {attachments.map((a, i) => (
              <div key={i} className="em-chip" title={a.filename}>
                <span className="em-chip__ext">{(String(a.filename || '').split('.').pop() || 'file').slice(0, 4)}</span>
                <span className="em-chip__name">{a.filename || 'Attachment'}</span>
                <span className="em-chip__size">{formatSize(a.size)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {folder === 'inbox' && (
        <div className="em-message__foot">
          <button type="button" className="em-btn em-btn--primary" onClick={onReply}>
            <Reply size={15} /> Reply
          </button>
        </div>
      )}
    </article>
  );
}

/* ---------- compose ---------- */

const EMAIL_RE = /^[^\s@<>,]+@[^\s@<>,]+\.[^\s@<>,]+$/;

function ComposePane({ initial, onClose, onSent }) {
  const [to, setTo] = useState(initial.to || '');
  const [subject, setSubject] = useState(initial.subject || '');
  const [body, setBody] = useState(initial.body || '');
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState({});
  const [sendError, setSendError] = useState(null);
  const bodyRef = useRef(null);
  const toRef = useRef(null);

  useEffect(() => {
    // Replying: put the cursor above the quote. New mail: start at "To".
    if (initial.to && bodyRef.current) {
      bodyRef.current.focus();
      bodyRef.current.setSelectionRange(0, 0);
    } else if (toRef.current) {
      toRef.current.focus();
    }
  }, [initial.to]);

  const validate = () => {
    const next = {};
    const recipients = to.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    if (!recipients.length) next.to = 'Add at least one recipient';
    else {
      const bad = recipients.find((r) => !EMAIL_RE.test(r.replace(/^.*<([^>]+)>$/, '$1')));
      if (bad) next.to = `"${bad}" is not a valid email address`;
    }
    if (!subject.trim()) next.subject = 'Add a subject';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSend = async () => {
    if (sending || !validate()) return;
    setSending(true);
    setSendError(null);
    try {
      await api('/send', {
        method: 'POST',
        body: JSON.stringify({ to: to.trim(), subject: subject.trim(), text: body }),
      });
      onSent(to.trim());
    } catch (err) {
      setSendError(err.message);
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  const clear = (k) => errors[k] && setErrors((prev) => ({ ...prev, [k]: undefined }));

  return (
    <div className="em-compose" onKeyDown={onKeyDown}>
      <div className="em-compose__head">
        <button type="button" className="em-icon-btn em-back" onClick={onClose} aria-label="Back to list">
          <ArrowLeft size={15} />
        </button>
        <div>
          <h2>{initial.to ? 'Reply' : 'New message'}</h2>
          <p>Ctrl + Enter to send</p>
        </div>
        <button type="button" className="em-icon-btn em-compose__close" onClick={onClose} aria-label="Discard">
          <X size={16} />
        </button>
      </div>

      <div className="em-compose__fields">
        <label className={`em-line ${errors.to ? 'is-invalid' : ''}`}>
          <span>To</span>
          <input
            ref={toRef}
            type="text"
            placeholder="name@example.com, separate several with commas"
            value={to}
            onChange={(e) => { setTo(e.target.value); clear('to'); }}
            aria-invalid={!!errors.to}
          />
        </label>
        {errors.to && <em className="em-field__error">{errors.to}</em>}
        <label className={`em-line ${errors.subject ? 'is-invalid' : ''}`}>
          <span>Subject</span>
          <input
            type="text"
            placeholder="What is this about?"
            value={subject}
            onChange={(e) => { setSubject(e.target.value); clear('subject'); }}
            aria-invalid={!!errors.subject}
          />
        </label>
        {errors.subject && <em className="em-field__error">{errors.subject}</em>}
      </div>

      <textarea
        ref={bodyRef}
        className="em-compose__body"
        placeholder="Write your message"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />

      {sendError && (
        <div className="em-alert em-alert--inline">
          <AlertCircle size={14} />
          <span>{sendError}</span>
        </div>
      )}

      <div className="em-compose__foot">
        <span className="em-muted">{initial.to ? 'Replying keeps the original below your message' : ''}</span>
        <div className="em-compose__btns">
          <button type="button" className="em-btn em-btn--ghost" onClick={onClose} disabled={sending}>Discard</button>
          <button type="button" className="em-btn em-btn--primary" onClick={handleSend} disabled={sending}>
            {sending ? <><Loader2 size={15} className="em-spin" /> Sending</> : <><SendIcon size={15} /> Send</>}
          </button>
        </div>
      </div>
    </div>
  );
}