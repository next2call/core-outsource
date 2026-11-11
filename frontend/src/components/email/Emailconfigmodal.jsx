import { useEffect, useState } from "react";
import { X, Eye, EyeOff, Loader2, Mail, Lock, Inbox, Send, AlertCircle } from "lucide-react";

/**
 * Modal for setting up or updating IMAP + SMTP credentials.
 * One "save" action covers first-time setup and later updates.
 *
 * Props:
 *  - open: boolean
 *  - onClose: () => void
 *  - onSaved: (email) => void        called after a successful save
 *  - api: (path, options) => Promise  the same api() helper EmailClient uses
 *  - initialEmail: string            optional, prefills the address
 *  - firstTime: boolean              optional, changes the heading
 */

// Common providers. Picking one fills the server fields.
const PRESETS = [
  { key: "gmail", label: "Gmail", imapHost: "imap.gmail.com", imapPort: "993", smtpHost: "smtp.gmail.com", smtpPort: "465", domains: ["gmail.com", "googlemail.com"] },
  { key: "outlook", label: "Outlook", imapHost: "outlook.office365.com", imapPort: "993", smtpHost: "smtp.office365.com", smtpPort: "587", domains: ["outlook.com", "hotmail.com", "live.com"] },
  { key: "zoho", label: "Zoho India", imapHost: "imap.zoho.in", imapPort: "993", smtpHost: "smtp.zoho.in", smtpPort: "465", domains: ["zohomail.in", "zoho.in"] },
  { key: "yahoo", label: "Yahoo", imapHost: "imap.mail.yahoo.com", imapPort: "993", smtpHost: "smtp.mail.yahoo.com", smtpPort: "465", domains: ["yahoo.com", "yahoo.in"] },
];

const EMPTY = { email: "", password: "", imapHost: "", imapPort: "993", smtpHost: "", smtpPort: "465" };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function presetFor(form) {
  return PRESETS.find((p) => p.imapHost === form.imapHost && p.smtpHost === form.smtpHost)?.key || null;
}

function validPort(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n < 65536;
}

export default function EmailConfigModal({ open, onClose, onSaved, api, initialEmail = "", firstTime = false }) {
  const [form, setForm] = useState(EMPTY);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [saveError, setSaveError] = useState(null);

  // Fresh errors each time it opens; prefill the address if we know it.
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setSaveError(null);
    if (initialEmail) setForm((prev) => (prev.email ? prev : { ...prev, email: initialEmail }));
  }, [open, initialEmail]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, saving, onClose]);

  if (!open) return null;

  const set = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };
  const update = (field) => (e) => set(field, e.target.value);

  const applyPreset = (p) => {
    setForm((prev) => ({ ...prev, imapHost: p.imapHost, imapPort: p.imapPort, smtpHost: p.smtpHost, smtpPort: p.smtpPort }));
    setErrors((prev) => ({ ...prev, imapHost: undefined, imapPort: undefined, smtpHost: undefined, smtpPort: undefined }));
  };

  // Typing a known address with empty server fields fills them in.
  const onEmailBlur = () => {
    if (form.imapHost || form.smtpHost) return;
    const domain = form.email.split("@")[1]?.toLowerCase();
    const match = PRESETS.find((p) => p.domains.includes(domain));
    if (match) applyPreset(match);
  };

  const validate = () => {
    const next = {};
    if (!form.email.trim()) next.email = "Enter the email address";
    else if (!EMAIL_RE.test(form.email.trim())) next.email = "That doesn't look like an email address";
    if (!form.password) next.password = "Enter the password";
    if (!form.imapHost.trim()) next.imapHost = "Enter the IMAP host";
    if (!validPort(form.imapPort)) next.imapPort = "1 to 65535";
    if (!form.smtpHost.trim()) next.smtpHost = "Enter the SMTP host";
    if (!validPort(form.smtpPort)) next.smtpPort = "1 to 65535";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    if (saving || !validate()) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Endpoint assumed to pair with "/check-config".
      await api("/configure", {
        method: "POST",
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password,
          imapHost: form.imapHost.trim(),
          imapPort: Number(form.imapPort),
          smtpHost: form.smtpHost.trim(),
          smtpPort: Number(form.smtpPort),
        }),
      });
      setForm((prev) => ({ ...prev, password: "" }));
      onSaved(form.email.trim());
    } catch (err) {
      setSaveError(err.message || "Could not save these settings");
    } finally {
      setSaving(false);
    }
  };

  const active = presetFor(form);
  const field = (name, label, props = {}, extra = null) => (
    <label className="em-field">
      <span>{label}</span>
      {extra || (
        <input
          className="em-input"
          value={form[name]}
          onChange={update(name)}
          aria-invalid={!!errors[name]}
          {...props}
        />
      )}
      {errors[name] && <em className="em-field__error">{errors[name]}</em>}
    </label>
  );

  return (
    <div
      className="em-modal-backdrop"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <form className="em-modal" role="dialog" aria-modal="true" aria-labelledby="em-cfg-title" onSubmit={handleSave} noValidate>
        <div className="em-modal__head">
          <div className="em-modal__title">
            <span className="em-modal__badge"><Mail size={17} /></span>
            <div>
              <h3 id="em-cfg-title">{firstTime ? "Connect your email" : "Email account"}</h3>
              <p>IMAP receives mail, SMTP sends it. Your provider lists both.</p>
            </div>
          </div>
          <button type="button" className="em-icon-btn em-icon-btn--plain" onClick={onClose} aria-label="Close" disabled={saving}>
            <X size={16} />
          </button>
        </div>

        <div className="em-modal__body">
          <section className="em-group">
            <div className="em-group__title"><Lock size={13} /> Sign in</div>
            {field("email", "Email address", {
              type: "email",
              placeholder: "you@example.com",
              autoComplete: "username",
              onBlur: onEmailBlur,
              autoFocus: !form.email,
            })}
            {field("password", "Password", {}, (
              <div className="em-password">
                <input
                  className="em-input"
                  type={showPassword ? "text" : "password"}
                  placeholder="App password or account password"
                  value={form.password}
                  onChange={update("password")}
                  autoComplete="current-password"
                  aria-invalid={!!errors.password}
                  autoFocus={!!form.email}
                />
                <button
                  type="button"
                  className="em-password__toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            ))}
            <small className="em-hint">Gmail, Outlook and Yahoo need an app password when 2-step sign-in is on.</small>
          </section>

          <section className="em-group">
            <div className="em-group__title em-group__title--split">
              <span><Inbox size={13} /> Servers</span>
              <div className="em-presets" role="group" aria-label="Fill from provider">
                {PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    className={active === p.key ? "is-active" : ""}
                    onClick={() => applyPreset(p)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="em-row2">
              {field("imapHost", <><Inbox size={12} /> IMAP host</>, { type: "text", placeholder: "imap.example.com" })}
              {field("imapPort", "Port", { type: "number", inputMode: "numeric", placeholder: "993" })}
            </div>
            <div className="em-row2">
              {field("smtpHost", <><Send size={12} /> SMTP host</>, { type: "text", placeholder: "smtp.example.com" })}
              {field("smtpPort", "Port", { type: "number", inputMode: "numeric", placeholder: "465" })}
            </div>
          </section>

          {saveError && (
            <div className="em-alert em-alert--inline">
              <AlertCircle size={14} />
              <span>{saveError}</span>
            </div>
          )}
        </div>

        <div className="em-modal__foot">
          <button type="button" className="em-btn em-btn--ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="em-btn em-btn--primary" disabled={saving}>
            {saving ? <><Loader2 size={15} className="em-spin" /> Saving</> : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}