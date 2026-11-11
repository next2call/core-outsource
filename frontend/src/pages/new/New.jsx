import { useState, useContext, useEffect, useLayoutEffect, useRef } from "react";
import axios from "axios";
import Swal from "sweetalert2";
import {
  Eye,
  EyeOff,
  Loader2,
  Info,
  KeyRound,
  UserRound,
  Megaphone,
  Phone,
  Copy,
  Wand2,
  Check,
} from "lucide-react";
import { AuthContext } from "../../context/authContext";

/* ------------------------------------------------------------------ */
/*  Help text — shown when the ⓘ next to a field is clicked            */
/* ------------------------------------------------------------------ */
const HELP = {
  user_id:
    "The SIP login ID (extension number) of this user. Numbers only, at least 4 digits, e.g. 1001. The user logs in to the webphone / softphone with this ID. It can't be changed later.",
  password:
    "The SIP password the user logs in with. At least 9 characters: letters, numbers, _ and - only. Use Generate for a strong one, then Copy to share it with the user.",
  full_name: "The user's real name. Shown in the users list, live calls and reports.",
  user_type:
    "Agent: logs in and handles calls. Team Leader: handles calls and looks after a team. Manager / Quality Analyst: monitor calls and reports.",
  agent_priorty:
    "Used when a campaign's Incoming Ring Type is Rank (Priority): incoming calls are offered to agents in priority order, starting from 1.",
  campaigns_id:
    "The campaigns this user works in. The user only receives and makes calls for the campaigns ticked here. Select at least one.",
  use_did:
    "Optional. A DID number assigned to this user. Enter it with country code, e.g. 911204567890.",
  ext_number:
    "Optional. The user's own phone number (mobile/landline) with country code, e.g. 919876543210. Used when calls need to reach the user outside the webphone.",
};

const PRIORITY_OPTIONS = Array.from({ length: 10 }, (_, i) => String(i + 1));

const EMPTY_FORM = {
  user_id: "",
  password: "",
  user_type: "",
  agent_priorty: "1",
  full_name: "",
  campaigns_id: [],
  campaign_name: "NULL",
  use_did: "",
  ext_number: "",
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const api = (path) => `https://${window.location.hostname}:4000${path}`;
const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

/* Strong password using only the characters the dialer accepts */
const generatePassword = (length = 12) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789_-";
  const bytes = new Uint32Array(length);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
};

const parseRGB = (c) => {
  const m = String(c).match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return { r, g, b, a };
};
const surfaceOf = (el) => {
  let node = el;
  while (node && node.nodeType === 1) {
    const c = parseRGB(getComputedStyle(node).backgroundColor);
    if (c && c.a > 0.5) return { bg: `rgb(${c.r}, ${c.g}, ${c.b})`, dark: 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b < 128 };
    node = node.parentElement;
  }
  return { bg: "#fff", dark: false };
};

/* SweetAlert / toast that follows the CRM theme */
const swal = (opts) => {
  const { bg, dark } = surfaceOf(document.querySelector(".modal") || document.querySelector(".users-card") || document.body);
  return Swal.fire({
    background: dark ? bg : "#fff",
    color: dark ? "#e5e7eb" : "#1f2937",
    confirmButtonColor: "#6366f1",
    cancelButtonColor: dark ? "#374151" : "#64748b",
    ...opts,
  });
};
const toast = (icon, title) =>
  swal({ toast: true, position: "top-end", icon, title, showConfirmButton: false, timer: 3000, timerProgressBar: true });

const copyText = async (text, label) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  toast("success", `${label} copied`);
};

/* Follows light / dark theme of the modal it is shown in */
const useDarkTheme = (ref) => {
  const [dark, setDark] = useState(false);
  useLayoutEffect(() => {
    const check = () => ref.current && setDark(surfaceOf(ref.current).dark);
    check();
    const t = setTimeout(check, 350);
    const obs = new MutationObserver(() => {
      check();
      setTimeout(check, 350);
    });
    [document.documentElement, document.body].forEach((n) =>
      obs.observe(n, { attributes: true, attributeFilter: ["class", "data-theme", "style"] })
    );
    return () => {
      clearTimeout(t);
      obs.disconnect();
    };
  }, [ref]);
  return dark;
};

/* ------------------------------------------------------------------ */
/*  Building blocks                                                    */
/* ------------------------------------------------------------------ */
const Section = ({ icon: Icon, title, children }) => (
  <section className="uf-section">
    <header className="uf-section__head">
      <span className="uf-section__icon">
        <Icon size={16} />
      </span>
      <h4>{title}</h4>
    </header>
    <div className="uf-grid">{children}</div>
  </section>
);

const Field = ({ name, label, required, full, helpOpen, onToggleHelp, error, note, extra, children }) => (
  <div className={`uf-field ${full ? "full" : ""} ${error ? "has-error" : ""}`}>
    <div className="uf-label">
      <label htmlFor={`uf-${name}`}>
        {label}
        {required && <span className="uf-req">*</span>}
      </label>
      {HELP[name] && (
        <button
          type="button"
          className={`uf-help-btn ${helpOpen ? "on" : ""}`}
          onClick={() => onToggleHelp(name)}
          aria-expanded={helpOpen}
          title="What is this?"
        >
          <Info size={14} />
        </button>
      )}
      {extra}
    </div>
    {helpOpen && <div className="uf-help">{HELP[name]}</div>}
    {children}
    {note && !error && <div className="uf-note">{note}</div>}
    {error && <small className="field-error uf-error">{error}</small>}
  </div>
);

/* ------------------------------------------------------------------ */
/*  Add User form                                                      */
/* ------------------------------------------------------------------ */
const AddUserForm = ({ onSuccess, onClose }) => {
  const { user } = useContext(AuthContext);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [helpOpen, setHelpOpen] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [campaigns, setCampaigns] = useState([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [saving, setSaving] = useState(false);
  const rootRef = useRef(null);
  const dark = useDarkTheme(rootRef);

  /* User types this login is allowed to create */
  const role = user?.role;
  const userTypeOptions = ["admin", "manager", "quality_analyst"].includes(role)
    ? ["Agent", "Team Leader", "Manager", "Quality Analyst"]
    : role === "team_leader"
    ? ["Agent", "Quality Analyst"]
    : [];

  useEffect(() => {
    setLoadingCampaigns(true);
    axios
      .get(api("/campaigns_dropdown"), { headers: authHeader() })
      .then((res) =>
        setCampaigns(
          (res.data || []).map((item, index) => ({
            id: item.compaign_id || `temp-id-${index}`,
            name: item.compaignname || "Unnamed Campaign",
          }))
        )
      )
      .catch((err) => console.error("Error fetching campaigns:", err))
      .finally(() => setLoadingCampaigns(false));
  }, []);

  /* ---- handlers ---- */
  const toggleHelp = (name) => setHelpOpen((p) => ({ ...p, [name]: !p[name] }));
  const clearError = (name) => errors[name] && setErrors((p) => ({ ...p, [name]: "" }));

  const handleChange = (e) => {
    const { name } = e.target;
    let { value } = e.target;
    if (["user_id", "use_did", "ext_number"].includes(name)) value = value.replace(/\D/g, "");
    if (name === "password" && !/^[A-Za-z0-9_-]*$/.test(value)) return; // block characters SIP doesn't accept
    setFormData((p) => ({ ...p, [name]: value }));
    clearError(name);
  };

  const toggleCampaign = (name) => {
    setFormData((p) => ({
      ...p,
      campaigns_id: p.campaigns_id.includes(name) ? p.campaigns_id.filter((c) => c !== name) : [...p.campaigns_id, name],
    }));
    clearError("campaigns_id");
  };

  const allSelected = campaigns.length > 0 && campaigns.every((c) => formData.campaigns_id.includes(c.name));
  const toggleAll = () => {
    setFormData((p) => ({ ...p, campaigns_id: allSelected ? [] : campaigns.map((c) => c.name) }));
    clearError("campaigns_id");
  };

  const fillPassword = () => {
    setFormData((p) => ({ ...p, password: generatePassword() }));
    setShowPassword(true);
    clearError("password");
  };

  const validate = () => {
    const e = {};
    if (formData.user_id.length < 4) e.user_id = "User ID must be at least 4 digits.";
    if (formData.password.length < 9) e.password = "Password must be at least 9 characters.";
    if (!formData.full_name.trim()) e.full_name = "Full Name is required.";
    if (!formData.user_type) e.user_type = "Select a user type.";
    if (formData.campaigns_id.length === 0) e.campaigns_id = "Select at least one campaign.";
    if (formData.use_did && formData.use_did.length <= 10) e.use_did = "Enter the DID with country code (11+ digits).";
    if (formData.ext_number && formData.ext_number.length <= 10) e.ext_number = "Enter the number with country code (11+ digits).";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) {
      requestAnimationFrame(() =>
        rootRef.current?.querySelector(".uf-error")?.scrollIntoView({ behavior: "smooth", block: "center" })
      );
      return;
    }

    setSaving(true);
    try {
      const response = await axios.post(api("/telephony/add/agents"), { ...formData, full_name: formData.full_name.trim() }, { headers: authHeader() });
      await axios.get(api("/action/changeSipStatus"), { headers: authHeader() });

      toast("success", response.data?.message || "User added successfully");
      setFormData(EMPTY_FORM);
      onSuccess?.();
      onClose?.();
    } catch (error) {
      const msg =
        error.response?.status === 409
          ? "User ID already exists."
          : error.response?.data?.message || "Failed to add user. Please try again.";
      if (error.response?.status === 409) setErrors((p) => ({ ...p, user_id: msg }));
      toast("error", msg);
    } finally {
      setSaving(false);
    }
  };

  const fp = (name) => ({ name, helpOpen: !!helpOpen[name], onToggleHelp: toggleHelp, error: errors[name] });

  return (
    <form ref={rootRef} className={`uf ${dark ? "uf-dark" : ""}`} onSubmit={handleSubmit} noValidate autoComplete="off">
      <style>{`
        .uf {
          --uf-border: var(--line, color-mix(in srgb, currentColor 16%, transparent));
          --uf-muted: var(--muted, color-mix(in srgb, currentColor 55%, transparent));
          --uf-brand: var(--brand, #6366f1);
          --uf-brand-tint: color-mix(in srgb, var(--brand, #6366f1) 14%, transparent);
          --uf-danger: var(--danger, #ef4444);
          --uf-input-bg: color-mix(in srgb, currentColor 3%, transparent);
          --uf-input-border: color-mix(in srgb, currentColor 18%, transparent);
          color: #0f172a;
          display: flex; flex-direction: column;
          min-height: 0; flex: 1; max-height: inherit;
        }
        .uf.uf-dark {
          color: #e5e7eb;
          --uf-border: rgba(255, 255, 255, .08);
          --uf-muted: #94a3b8;
          --uf-input-bg: rgba(255, 255, 255, .04);
          --uf-input-border: rgba(255, 255, 255, .14);
        }

        .uf-body {
          flex: 1; min-height: 0; overflow-y: auto;
          padding: 6px 22px 18px; display: flex; flex-direction: column;
          overscroll-behavior: contain;
        }

        /* ---------- Section: compact heading + divider ---------- */
        .uf-section { padding: 14px 0 16px; border-bottom: 1px solid var(--uf-border); }
        .uf-section:last-child { border-bottom: none; padding-bottom: 4px; }
        .uf-section__head { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
        .uf-section__icon {
          width: 24px; height: 24px; flex: none; border-radius: 7px;
          display: inline-flex; align-items: center; justify-content: center;
          background: var(--uf-brand-tint); color: var(--uf-brand);
        }
        .uf-section__icon svg { width: 14px; height: 14px; }
        .uf-section h4 { margin: 0; font-size: 13.5px; font-weight: 700; color: inherit; }
        .uf-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 16px; }

        /* ---------- Field ---------- */
        .uf-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
        .uf-field.full { grid-column: 1 / -1; }
        .uf-label { display: flex; align-items: center; gap: 4px; min-height: 18px; }
        .uf-label label { font-size: 12.5px; font-weight: 600; color: var(--uf-muted); }
        .uf-req { color: var(--uf-danger); margin-left: 2px; }
        .uf-help-btn {
          width: 20px; height: 20px; padding: 0; border-radius: 50%; cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center;
          border: none; background: transparent; color: var(--uf-muted); opacity: .8;
        }
        .uf-help-btn:hover, .uf-help-btn.on { color: var(--uf-brand); background: var(--uf-brand-tint); opacity: 1; }
        .uf-help {
          font-size: 12.5px; line-height: 1.5; padding: 8px 10px; border-radius: 8px;
          background: var(--uf-brand-tint); border-left: 3px solid var(--uf-brand);
          animation: uf-in .15s ease-out;
        }
        @keyframes uf-in { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: none; } }

        /* ---------- Inputs (own styles so they look right in any theme) ---------- */
        .uf .uf-field input,
        .uf .uf-field select {
          width: 100%; height: 40px; box-sizing: border-box; margin: 0;
          padding: 0 12px; border-radius: 9px;
          border: 1px solid var(--uf-input-border) !important;
          background: var(--uf-input-bg) !important;
          color: inherit !important;
          font: inherit; font-size: 14px;
          outline: none; box-shadow: none;
          transition: border-color .15s, box-shadow .15s, background .15s;
        }
        .uf .uf-field select { padding-right: 32px; cursor: pointer; }
        .uf.uf-dark .uf-field select option { background: #1f2129; color: #e5e7eb; }
        .uf .uf-field input::placeholder { color: var(--uf-muted); opacity: .75; }
        .uf .uf-field input:hover:not(:disabled),
        .uf .uf-field select:hover { border-color: color-mix(in srgb, var(--uf-brand) 45%, transparent) !important; }
        .uf .uf-field input:focus,
        .uf .uf-field select:focus {
          border-color: var(--uf-brand) !important;
          box-shadow: 0 0 0 3px var(--uf-brand-tint) !important;
        }
        .uf .uf-field.has-error input, .uf .uf-field.has-error select { border-color: var(--uf-danger) !important; }
        .uf .uf-field input:disabled, .uf .uf-readonly { opacity: .65; cursor: not-allowed; }
        .uf .uf-field.is-changed input, .uf .uf-field.is-changed select { border-color: var(--uf-brand) !important; }

        .uf-note { font-size: 12px; line-height: 1.45; color: var(--uf-muted); }
        .uf-error { color: var(--uf-danger); font-size: 12px; }
        .uf-changed {
          margin-left: auto; font-size: 10.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
          color: var(--uf-brand); padding: 2px 7px; border-radius: 999px; background: var(--uf-brand-tint);
        }

        /* ---------- Password: show + copy buttons inside the box ---------- */
        .uf-pass { position: relative; display: block; }
        .uf .uf-pass input { padding-right: 78px; }
        .uf .uf-pass.uf-copy-in input { padding-right: 44px; }
        .uf-pass__btns {
          position: absolute; top: 0; right: 4px; bottom: 0;
          display: flex; align-items: center; gap: 2px;
        }
        .uf .uf-pass__btn {
          width: 32px !important; height: 32px !important; min-width: 0 !important; padding: 0 !important; margin: 0 !important;
          border-radius: 7px !important; cursor: pointer;
          display: inline-flex !important; align-items: center; justify-content: center;
          border: none !important; background: transparent !important; color: var(--uf-muted) !important;
          box-shadow: none !important;
        }
        .uf .uf-pass__btn:hover:not(:disabled) { color: var(--uf-brand) !important; background: var(--uf-brand-tint) !important; }
        .uf .uf-pass__btn:disabled { opacity: .35; cursor: default; }

        .uf-link {
          align-self: flex-start; display: inline-flex; align-items: center; gap: 5px;
          border: none; background: none; padding: 0; cursor: pointer;
          font-size: 12.5px; font-weight: 600; color: var(--uf-brand);
        }
        .uf-link:hover { text-decoration: underline; }
        .uf-link.right { margin-left: auto; }

        /* ---------- Campaign chips ---------- */
        .uf-chips { display: flex; flex-wrap: wrap; gap: 8px; max-height: 170px; overflow-y: auto; padding: 2px; }
        .uf-chip {
          display: inline-flex; align-items: center; gap: 7px; cursor: pointer;
          padding: 6px 12px; border-radius: 999px;
          font-size: 13px; font-weight: 500;
          border: 1px solid var(--uf-input-border); background: var(--uf-input-bg); color: inherit;
          transition: border-color .15s, background .15s;
        }
        .uf-chip:hover { border-color: var(--uf-brand); }
        .uf-chip.on { border-color: var(--uf-brand); background: var(--uf-brand-tint); color: var(--uf-brand); font-weight: 600; }
        .uf-chip__box {
          width: 15px; height: 15px; border-radius: 4px; flex: none;
          display: inline-flex; align-items: center; justify-content: center;
          border: 1.5px solid var(--uf-input-border);
        }
        .uf-chip.on .uf-chip__box { background: var(--uf-brand); border-color: var(--uf-brand); color: #fff; }

        /* ---------- Footer ---------- */
        .uf-foot {
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
          padding: 12px 22px; border-top: 1px solid var(--uf-border);
        }
        .uf-foot__info { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; }
        .uf-foot__info small { color: var(--uf-muted); font-weight: 500; font-size: 12px; }
        .uf-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--uf-brand); }
        .uf-foot__btns { display: flex; gap: 10px; margin-left: auto; }
        .uf-foot .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
        .uf-foot .btn:disabled { opacity: .55; cursor: not-allowed; }

        /* ---------- Phone ---------- */
        @media (max-width: 640px) {
          .uf-hide-sm { display: none !important; }
          .uf-body { padding: 4px 14px 16px; }
          .uf-grid { grid-template-columns: 1fr; gap: 12px; }
          .uf .uf-field input, .uf .uf-field select { height: 44px; font-size: 16px; } /* no iPhone zoom */
          .uf-help-btn { width: 28px; height: 28px; }
          .uf .uf-pass__btn { width: 36px !important; height: 36px !important; }
          .uf .uf-pass input { padding-right: 84px; }
          .uf-chip { padding: 8px 13px; }
          .uf-chips { max-height: none; }
          .uf-foot { padding: 10px 14px; padding-bottom: max(10px, env(safe-area-inset-bottom)); }
          .uf-foot__info:has(> small:only-child) { display: none; }
          .uf-foot__btns { flex: 1; }
          .uf-foot__btns .btn { flex: 1; min-height: 46px; font-size: 15px; }
        }
      `}</style>

      <div className="uf-body">

        {/* ---------- Login ---------- */}
        <Section icon={KeyRound} title="Login Details (SIP)">
          <Field {...fp("user_id")} label="User ID" required>
            <input
              id="uf-user_id"
              name="user_id"
              inputMode="numeric"
              placeholder="e.g. 1001"
              value={formData.user_id}
              onChange={handleChange}
              maxLength={10}
            />
          </Field>

          <Field
            {...fp("password")}
            label="Password"
            required
          >
            <div className="uf-pass">
              <input
                id="uf-password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Min. 9 characters"
                value={formData.password}
                onChange={handleChange}
                autoComplete="new-password"
              />
              <div className="uf-pass__btns">
              <button type="button" className="uf-pass__btn" onClick={() => setShowPassword((s) => !s)} title={showPassword ? "Hide" : "Show"}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              <button
                type="button"
                className="uf-pass__btn"
                onClick={() => formData.password && copyText(formData.password, "Password")}
                disabled={!formData.password}
                title="Copy password"
              >
                <Copy size={15} />
              </button>
              </div>
            </div>
            <button type="button" className="uf-link" onClick={fillPassword}>
              <Wand2 size={13} /> Generate strong password
            </button>
          </Field>
        </Section>

        {/* ---------- Profile ---------- */}
        <Section icon={UserRound} title="Profile & Role">
          <Field {...fp("full_name")} label="Full Name" required>
            <input id="uf-full_name" name="full_name" placeholder="e.g. Rahul Kumar" value={formData.full_name} onChange={handleChange} />
          </Field>

          <Field {...fp("user_type")} label="User Type" required note={userTypeOptions.length ? null : "Your login can't create users."}>
            <select id="uf-user_type" name="user_type" value={formData.user_type} onChange={handleChange}>
              <option value="">Select user type</option>
              {userTypeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>

          <Field {...fp("agent_priorty")} label="Priority">
            <select id="uf-agent_priorty" name="agent_priorty" value={formData.agent_priorty} onChange={handleChange}>
              {PRIORITY_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
        </Section>

        {/* ---------- Campaigns ---------- */}
        <Section icon={Megaphone} title="Campaigns">
          <Field
            {...fp("campaigns_id")}
            label={`Assigned Campaigns (${formData.campaigns_id.length} selected)`}
            required
            full
            extra={
              <>
                {loadingCampaigns && <Loader2 size={13} className="spin" />}
                {campaigns.length > 1 && (
                  <button type="button" className="uf-link right" onClick={toggleAll}>
                    {allSelected ? "Clear all" : "Select all"}
                  </button>
                )}
              </>
            }
          >
            <div className="uf-chips">
              {campaigns.length === 0 && !loadingCampaigns && <div className="uf-note">No campaigns available. Create a campaign first.</div>}
              {campaigns.map((c) => {
                const on = formData.campaigns_id.includes(c.name);
                return (
                  <button type="button" key={c.id} className={`uf-chip ${on ? "on" : ""}`} onClick={() => toggleCampaign(c.name)} aria-pressed={on}>
                    <span className="uf-chip__box">{on && <Check size={12} strokeWidth={3} />}</span>
                    {c.name}
                  </button>
                );
              })}
            </div>
          </Field>
        </Section>

        {/* ---------- Numbers ---------- */}
        <Section icon={Phone} title="Phone Numbers (optional)">
          <Field {...fp("use_did")} label="DID Number">
            <input id="uf-use_did" name="use_did" inputMode="numeric" placeholder="e.g. 911204567890" value={formData.use_did} onChange={handleChange} />
          </Field>
          <Field {...fp("ext_number")} label="Contact Number">
            <input id="uf-ext_number" name="ext_number" inputMode="numeric" placeholder="e.g. 919876543210" value={formData.ext_number} onChange={handleChange} />
          </Field>
        </Section>
      </div>

      <div className="uf-foot">
        <small className="uf-hide-sm">
          <span className="uf-req">*</span> Required fields
        </small>
        <div className="uf-foot__btns">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving && <Loader2 size={14} className="spin" />}
            {saving ? "Creating..." : "Create User"}
          </button>
        </div>
      </div>
    </form>
  );
};

export default AddUserForm;