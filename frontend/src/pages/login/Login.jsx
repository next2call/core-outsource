import { useState, useRef, useEffect, useContext } from "react";
import Axios from "axios";
import {
  Lock, User, ArrowRight, ArrowLeft, Loader2, Check, Eye, EyeOff, AlertCircle, Sun, Moon,
  Megaphone, Activity, Headphones, ShieldCheck, Search, Briefcase,
} from "lucide-react";
import "./LoginPage.css";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/authContext";
import { DarkModeContext } from "../../context/darkModeContext";

const API = () => `https://${window.location.hostname}:4000`;

const ROUTES = {
  1: "/agent",
  2: "/team_leader",
  5: "/it",
  6: "/quality_analyst",
  7: "/manager",
  8: "/admin",
  9: "/superadmin",
};

// Agents and team leaders pick a campaign before entering
const needsCampaign = (type) => String(type) === "1" || String(type) === "2";

const STEP_TEXT = {
  credentials: ["Welcome back", "Sign in with your Ringfy user ID"],
  otp: ["Verify it's you", "Enter the 6-digit code we just sent"],
  campaign: ["Choose a campaign", "Pick the campaign you'll work on today"],
  success: ["You're all set", "Signed in successfully"],
};

const FEATURES = [
  { icon: Megaphone, title: "Campaigns and auto dial", text: "Run inbound and outbound campaigns with IVR, CLIs and schedules." },
  { icon: Activity, title: "Live reports", text: "Watch agents, calls and leads as they happen." },
  { icon: Headphones, title: "Recordings and QA", text: "Every call recorded, ready for quality review." },
  { icon: ShieldCheck, title: "Two-step sign-in", text: "One-time codes keep every account protected." },
];

const maskEmail = (email) => {
  if (!email || !email.includes("@")) return "";
  const [name, domain] = email.split("@");
  return `${name.slice(0, 2)}******@${domain}`;
};
const maskMobile = (mobile) => (mobile ? `******${String(mobile).slice(-4)}` : "");

function RingfyLogo() {
  return (
    <div className="rf-logo">
      <svg width="30" height="30" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="20" cy="20" r="15" stroke="currentColor" strokeWidth="3" />
        <circle cx="20" cy="20" r="8" stroke="currentColor" strokeWidth="2" opacity="0.55" />
        <circle cx="20" cy="20" r="2.4" fill="currentColor" />
      </svg>
      <span className="rf-logo__text">
        Ring<span className="rf-logo__text-accent">fy</span>
      </span>
    </div>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const { login } = useContext(AuthContext);
  const { darkMode, toggleDarkMode } = useContext(DarkModeContext) || {};

  const [step, setStep] = useState("credentials");
  const [flow, setFlow] = useState(["credentials", "success"]); // grows to include otp / campaign
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [maskedContact, setMaskedContact] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [countdown, setCountdown] = useState(60);
  const [otpKey, setOtpKey] = useState(0); // remounts the code boxes on resend

  const [userType, setUserType] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState("");

  const goTo = (next, extra) => {
    setError(null);
    if (extra) setFlow(["credentials", ...extra, "success"]);
    setStep(next);
  };

  // Short pause on the success screen, then into the workspace
  useEffect(() => {
    if (step !== "success" || userType === null) return undefined;
    const t = setTimeout(() => navigate(ROUTES[userType] || "/agent"), 1500);
    return () => clearTimeout(t);
  }, [step, userType, navigate]);

  // OTP countdown
  useEffect(() => {
    if (step !== "otp" || countdown <= 0) return undefined;
    const t = setTimeout(() => setCountdown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [step, countdown]);
  const otpExpired = step === "otp" && countdown <= 0;

  const getMask = async (uid) => {
    try {
      const res = await Axios.post(`${API()}/log/get_mask`, { uid });
      setMaskedEmail(maskEmail(res.data.email));
      setMaskedContact(maskMobile(res.data.mobileno));
    } catch {
      /* the OTP screen falls back to a masked user ID */
    }
  };

  // Shared by password login and OTP: fetch permissions, then campaign step or done
  const finishLogin = async ({ token, user, campaigns: list }, extraSteps = []) => {
    const permissionRes = await Axios.get(`${API()}/permissions/${user.user_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const permissions = permissionRes.data;
    setUserType(user.user_type);
    setDisplayName(user.name || user.full_name || user.user_id || userId);

    if (needsCampaign(user.user_type)) {
      const options = list || [];
      setCampaigns(options);
      setSelectedCampaign(options.length === 1 ? campaignValue(options[0]) : "");
      localStorage.setItem("tempUser", JSON.stringify(user));
      localStorage.setItem("tempToken", token);
      localStorage.setItem("tempPermissions", JSON.stringify(permissions));
      goTo("campaign", [...extraSteps, "campaign"]);
    } else {
      login(user, token, permissions);
      goTo("success", extraSteps);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    if (!userId.trim() || !password) {
      setError("Enter both your user ID and password.");
      return;
    }
    try {
      setLoading(true);
      const response = await Axios.post(`${API()}/log/login`, { user_id: userId.trim(), password });

      if (response.data.otpRequired) {
        await getMask(userId.trim());
        setCountdown(60);
        setOtpKey((k) => k + 1);
        goTo("otp", ["otp"]);
        return;
      }
      if (response.data.token && response.data.user) {
        await finishLogin(response.data);
      } else {
        throw new Error("Authentication failed");
      }
    } catch (err) {
      console.error("Login error:", err);
      if (err.code === "ERR_NETWORK" || !err.response) {
        setError(
          <>
            Can't reach the server. Open{" "}
            <a href={`${API()}/`} target="_blank" rel="noreferrer">{API()}</a>{" "}
            once to allow it, then try again.
          </>
        );
      } else {
        setError("That user ID and password don't match.");
      }
    } finally {
      setLoading(false);
    }
  };

  async function handleOtp(code) {
    setError(null);
    try {
      setLoading(true);
      const res = await Axios.post(`${API()}/log/verify_otp`, { user_id: userId.trim(), otp: code });
      await finishLogin(res.data, ["otp"]);
    } catch (err) {
      console.error("OTP verification failed:", err);
      setError("That code is wrong or has expired.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOtp() {
    try {
      setLoading(true);
      const response = await Axios.post(`${API()}/log/resend-otp`, { user_id: userId.trim() });
      if (response.data.success) {
        await getMask(userId.trim());
        setCountdown(60);
        setOtpKey((k) => k + 1);
        setError(null);
      } else {
        setError("Couldn't send a new code. Try again.");
      }
    } catch (err) {
      console.error(err);
      setError("Couldn't send a new code. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const handleCampaignSubmit = async (e) => {
    e?.preventDefault();
    if (!selectedCampaign) {
      setError("Pick a campaign to continue.");
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const tempUser = JSON.parse(localStorage.getItem("tempUser"));
      const tempToken = localStorage.getItem("tempToken");
      const tempPermissions = JSON.parse(localStorage.getItem("tempPermissions"));

      const response = await Axios.post(`${API()}/log/select_campaign`, {
        user_id: tempUser.user_id,
        campaign_id: selectedCampaign,
      });

      if (response.data.success) {
        login(tempUser, tempToken, tempPermissions);
        localStorage.removeItem("tempUser");
        localStorage.removeItem("tempToken");
        localStorage.removeItem("tempPermissions");
        setUserType(tempUser.user_type);
        goTo("success");
      } else {
        setError(response.data.message || "Couldn't join that campaign.");
      }
    } catch (err) {
      console.error(err);
      setError("Couldn't join that campaign. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const backToCredentials = () => {
    localStorage.removeItem("tempUser");
    localStorage.removeItem("tempToken");
    localStorage.removeItem("tempPermissions");
    setPassword("");
    goTo("credentials", []);
  };

  const [title, subtitle] = STEP_TEXT[step];
  const stepIndex = flow.indexOf(step);

  return (
    <div className={`rf-page${darkMode ? " is-dark" : ""}`}>
      <header className="rf-header">
        <RingfyLogo />
        {toggleDarkMode && (
          <button
            type="button"
            className="rf-theme-btn"
            onClick={toggleDarkMode}
            aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            title={darkMode ? "Light mode" : "Dark mode"}
          >
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        )}
      </header>

      <main className="rf-main">
        {/* Left: what Ringfy does */}
        <section className="rf-hero">
          <span className="rf-hero__badge">
            <span className="rf-hero__badge-dot" />
            Call center CRM
          </span>
          <h1 className="rf-hero__title">
            Every call, every lead,
            <br />
            <span className="rf-hero__title-accent">one workspace.</span>
          </h1>
          <p className="rf-hero__desc">
            Ringfy brings your dialer, campaigns, leads and reports together so your team can focus on the conversation.
          </p>

          <ul className="rf-hero__features">
            {FEATURES.map(({ icon: Icon, title: t, text }) => (
              <li key={t} className="rf-hero__feature">
                <span className="rf-hero__feature-icon"><Icon size={16} /></span>
                <div>
                  <strong>{t}</strong>
                  <span>{text}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Right: sign-in card */}
        <section className="rf-auth">
          <div className="rf-card">
            <div className="rf-steps" aria-label={`Step ${stepIndex + 1} of ${flow.length}`}>
              {flow.map((s, i) => (
                <span
                  key={s}
                  className={`rf-steps__bar${i === stepIndex ? " is-active" : i < stepIndex ? " is-passed" : ""}`}
                />
              ))}
            </div>

            <h2 className="rf-card__title">{title}</h2>
            <p className="rf-card__subtitle">{subtitle}</p>

            <div className="rf-card__body">
              {step === "credentials" && (
                <form onSubmit={handleSubmit} className="rf-form" noValidate>
                  <Field
                    id="userId"
                    label="User ID"
                    icon={<User size={16} />}
                    value={userId}
                    onChange={(v) => { setUserId(v); setError(null); }}
                    placeholder="Your user ID"
                    autoComplete="username"
                    autoFocus
                  />
                  <PasswordField value={password} onChange={(v) => { setPassword(v); setError(null); }} />

                  {error && <ErrorNote>{error}</ErrorNote>}

                  <button type="submit" disabled={loading} className="rf-btn-primary">
                    {loading ? (
                      <><Loader2 className="rf-spin" size={16} /> Signing in</>
                    ) : (
                      <>Continue <ArrowRight size={16} /></>
                    )}
                  </button>
                </form>
              )}

              {step === "otp" && (
                <OtpSection
                  key={otpKey}
                  userId={userId}
                  maskedContact={maskedContact}
                  maskedEmail={maskedEmail}
                  loading={loading}
                  error={error}
                  countdown={countdown}
                  otpExpired={otpExpired}
                  onResend={handleResendOtp}
                  onSubmit={handleOtp}
                  onType={() => error && setError(null)}
                  onBack={backToCredentials}
                />
              )}

              {step === "campaign" && (
                <CampaignPicker
                  campaigns={campaigns}
                  value={selectedCampaign}
                  onChange={(v) => { setSelectedCampaign(v); setError(null); }}
                  onSubmit={handleCampaignSubmit}
                  onBack={backToCredentials}
                  loading={loading}
                  error={error}
                />
              )}

              {step === "success" && (
                <div className="rf-success">
                  <span className="rf-success__icon"><Check size={26} strokeWidth={3} /></span>
                  <p className="rf-success__text">
                    Welcome back, <b>{displayName || userId}</b>.
                  </p>
                  <p className="rf-success__sub">
                    <Loader2 className="rf-spin" size={13} /> Opening your workspace
                  </p>
                </div>
              )}
            </div>
          </div>

          <p className="rf-footer-note">
            By signing in you agree to Ringfy's <a href="#">Terms</a> and <a href="#">Privacy</a>.
          </p>
        </section>
      </main>
    </div>
  );
}

/* ---------- small pieces ---------- */

function ErrorNote({ children }) {
  return (
    <div className="rf-error" role="alert">
      <AlertCircle size={14} />
      <span>{children}</span>
    </div>
  );
}

function Field({ id, label, icon, value, onChange, placeholder, type = "text", autoComplete, autoFocus, trailing, onKeyUp }) {
  return (
    <div className="rf-field">
      <label htmlFor={id} className="rf-field__label">{label}</label>
      <div className="rf-field__input-wrap">
        <span className="rf-field__icon">{icon}</span>
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyUp={onKeyUp}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          spellCheck={false}
          autoCapitalize="none"
          className={`rf-field__input${trailing ? " has-trailing" : ""}`}
        />
        {trailing}
      </div>
    </div>
  );
}

function PasswordField({ value, onChange }) {
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  return (
    <div>
      <Field
        id="password"
        label="Password"
        icon={<Lock size={16} />}
        value={value}
        onChange={onChange}
        placeholder="Your password"
        type={show ? "text" : "password"}
        autoComplete="current-password"
        onKeyUp={(e) => setCaps(e.getModifierState?.("CapsLock"))}
        trailing={
          <button
            type="button"
            className="rf-field__toggle"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            tabIndex={-1}
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        }
      />
      {caps && <p className="rf-field__hint">Caps Lock is on</p>}
    </div>
  );
}

/* ---------- campaign step ---------- */

// Campaigns may arrive as plain strings or as objects
const campaignValue = (c) => (typeof c === "object" && c !== null ? String(c.compaign_id ?? c.campaign_id ?? c.id ?? "") : String(c));
const campaignLabel = (c) => (typeof c === "object" && c !== null ? c.compaignname || c.campaign_name || campaignValue(c) : String(c));

function CampaignPicker({ campaigns, value, onChange, onSubmit, onBack, loading, error }) {
  const [q, setQ] = useState("");
  const list = campaigns.filter((c) => {
    const s = q.trim().toLowerCase();
    return !s || campaignLabel(c).toLowerCase().includes(s) || campaignValue(c).toLowerCase().includes(s);
  });

  return (
    <form className="rf-form" onSubmit={onSubmit}>
      {campaigns.length > 6 && (
        <div className="rf-field__input-wrap">
          <span className="rf-field__icon"><Search size={16} /></span>
          <input className="rf-field__input" placeholder="Search campaigns" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      )}

      {campaigns.length === 0 ? (
        <div className="rf-empty">
          <Briefcase size={18} />
          <span>No campaigns are assigned to you yet. Ask your admin to add you to one.</span>
        </div>
      ) : (
        <div className="rf-choices" role="radiogroup" aria-label="Campaign">
          {list.map((c) => {
            const v = campaignValue(c);
            const label = campaignLabel(c);
            const active = value === v;
            return (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={active}
                className={`rf-choice${active ? " is-active" : ""}`}
                onClick={() => onChange(v)}
              >
                <span className="rf-choice__avatar">{label.charAt(0).toUpperCase()}</span>
                <span className="rf-choice__text">
                  <b>{label}</b>
                  {label !== v && <small>{v}</small>}
                </span>
                <span className="rf-choice__radio">{active && <Check size={12} strokeWidth={3} />}</span>
              </button>
            );
          })}
          {list.length === 0 && <p className="rf-muted">Nothing matches "{q}".</p>}
        </div>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}

      <button className="rf-btn-primary" type="submit" disabled={loading || !campaigns.length}>
        {loading ? <><Loader2 className="rf-spin" size={16} /> Joining</> : <>Continue <ArrowRight size={16} /></>}
      </button>
      <div className="rf-otp__footer">
        <button type="button" onClick={onBack} className="rf-link"><ArrowLeft size={13} /> Use another account</button>
      </div>
    </form>
  );
}

/* ---------- OTP step ---------- */

function OtpSection({ userId, maskedContact, maskedEmail, loading, error, countdown, otpExpired, onResend, onSubmit, onType, onBack }) {
  const [digits, setDigits] = useState(Array(6).fill(""));
  const refs = useRef([]);
  const lastSent = useRef("");

  useEffect(() => { refs.current[0]?.focus(); }, []);

  const code = digits.join("");
  const complete = code.length === 6;

  // Submit by itself once all 6 digits are in (once per code)
  useEffect(() => {
    if (complete && !otpExpired && !loading && lastSent.current !== code) {
      lastSent.current = code;
      onSubmit(code);
    }
    if (!complete) lastSent.current = "";
  }, [code, complete, otpExpired, loading, onSubmit]);

  // Wrong code: clear the boxes so it can be typed again
  useEffect(() => {
    if (error && complete) {
      setDigits(Array(6).fill(""));
      refs.current[0]?.focus();
    }
  }, [error]); // eslint-disable-line react-hooks/exhaustive-deps

  function setDigit(i, v) {
    const clean = v.replace(/\D/g, "");
    if (clean.length > 1) return fill(clean, i); // autofill / typing fast
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    onType();
    if (clean && i < 5) refs.current[i + 1]?.focus();
  }

  function fill(text, from = 0) {
    const next = [...digits];
    for (let k = 0; k < text.length && from + k < 6; k += 1) next[from + k] = text[k];
    setDigits(next);
    onType();
    refs.current[Math.min(from + text.length, 5)]?.focus();
  }

  function handleKey(i, e) {
    if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < 5) refs.current[i + 1]?.focus();
  }

  function handlePaste(e) {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    e.preventDefault();
    const next = Array(6).fill("");
    for (let k = 0; k < text.length; k += 1) next[k] = text[k];
    setDigits(next);
    onType();
    refs.current[Math.min(text.length, 5)]?.focus();
  }

  const fallback = userId.length > 2 ? `${userId[0]}${"•".repeat(Math.max(userId.length - 2, 1))}${userId.slice(-1)}` : userId;
  const targets = [maskedContact, maskedEmail].filter(Boolean);

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (complete && !otpExpired) onSubmit(code); }}
      className="rf-otp"
    >
      <p className="rf-otp__hint">
        We sent a code to{" "}
        {targets.length ? (
          targets.map((t, i) => (
            <span key={t}>{i > 0 && " and "}<b>{t}</b></span>
          ))
        ) : (
          <>the phone and email linked to <b>{fallback}</b></>
        )}
      </p>

      <div className="rf-otp__inputs" onPaste={handlePaste}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            aria-label={`Digit ${i + 1}`}
            maxLength={i === 0 ? 6 : 1}
            value={d}
            disabled={loading || otpExpired}
            onChange={(e) => setDigit(i, e.target.value)}
            onKeyDown={(e) => handleKey(i, e)}
            onFocus={(e) => e.target.select()}
            className={`rf-otp__input${d ? " is-filled" : ""}${error ? " is-error" : ""}`}
          />
        ))}
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
      {otpExpired && !error && <ErrorNote>This code has expired. Send a new one.</ErrorNote>}

      <button type="submit" disabled={!complete || loading || otpExpired} className="rf-btn-primary">
        {loading ? <><Loader2 className="rf-spin" size={16} /> Checking</> : "Verify and sign in"}
      </button>

      <div className="rf-otp__footer">
        <button type="button" onClick={onBack} className="rf-link"><ArrowLeft size={13} /> Change account</button>
        {countdown <= 0 ? (
          <button type="button" onClick={onResend} className="rf-link rf-link--strong" disabled={loading}>
            Send a new code
          </button>
        ) : (
          <span>
            New code in <b className="rf-mono">{Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}</b>
          </span>
        )}
      </div>
    </form>
  );
}