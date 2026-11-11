import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Loader2,
  FileAudio,
  X,
  Info,
  Megaphone,
  Settings2,
  PhoneIncoming,
  PhoneOutgoing,
  Zap,
  CalendarClock,
  Music2,
  BookOpen,
  Upload,
} from "lucide-react";
import Swal from "sweetalert2";
import axios from "axios";

/* ------------------------------------------------------------------ */
/*  Option lists                                                       */
/* ------------------------------------------------------------------ */
const STATUS_OPTIONS = [
  { value: "Y", label: "Active" },
  { value: "N", label: "Inactive" },
];

const CAMPAIGN_TYPE_OPTIONS = [
  { value: "both", label: "Both (Inbound + Outbound)" },
  { value: "inbound", label: "Inbound" },
  { value: "outbound", label: "Outbound" },
];

const AUTO_DIAL_STATUS_OPTIONS = [
  { value: "1", label: "Active" },
  { value: "0", label: "Inactive" },
];

const AUTO_DIAL_LEVELS = Array.from({ length: 11 }, (_, i) => ({ value: String(i), label: String(i) }));

const CALL_TIME_OPTIONS = [
  { value: "12am-11pm", label: "24 hours" },
  { value: "9am-6pm", label: "9am - 6pm" },
  { value: "10am-6pm", label: "10am - 6pm" },
  { value: "10am-7pm", label: "10am - 7pm" },
  { value: "12pm-5pm", label: "12pm - 5pm" },
  { value: "12pm-9pm", label: "12pm - 9pm" },
  { value: "5pm-9pm", label: "5pm - 9pm" },
];

const WEEK_OFF_OPTIONS = [
  { value: "", label: "None" },
  { value: "Sunday", label: "Sunday" },
  { value: "Monday", label: "Monday" },
  { value: "Tuesday", label: "Tuesday" },
  { value: "Wednesday", label: "Wednesday" },
  { value: "Thursday", label: "Thursday" },
  { value: "Friday", label: "Friday" },
  { value: "Saturday", label: "Saturday" },
  { value: "SaturdaytoSunday", label: "Saturday to Sunday" },
];

const RING_TIME_OPTIONS = [
  { value: "60", label: "60 seconds" },
  { value: "45", label: "45 seconds" },
  { value: "30", label: "30 seconds" },
];

const RING_TYPE_OPTIONS = [
  { value: "random", label: "Random", note: "Calls go to any free agent, picked at random." },
  { value: "rank", label: "Rank (Priority)", note: "Calls go to the free agent with the highest priority rank first." },
  { value: "ring_all", label: "Ring All", note: "Calls ring on all free agents at once. The first to answer gets it." },
  { value: "longest_wait_time", label: "Longest Wait Time", note: "Calls go to the agent who has been free the longest." },
];

const LEAD_FORM_OPTIONS = [
  { value: "", label: "None" },
  { value: "inactive", label: "Inactive" },
  { value: "active", label: "Active" },
];

const CALL_ROUTE_OPTIONS = [
  { value: "0", label: "None", note: "Incoming calls go straight to agents. No IVR menu." },
  {
    value: "1",
    label: "Extension Wise",
    note: "Callers get an IVR menu (e.g. press 1 for Sales, 2 for Accounts). After saving, open Extensions in the sidebar to finish setting up the menu options.",
  },
];

const FILE_FIELDS = [
  { label: "Welcome IVR", name: "welcome_ivr", help: "Played first when a customer's call connects. Example: \"Welcome to ABC Company…\"" },
  { label: "After Office IVR", name: "after_office_ivr", help: "Played when someone calls outside the Call Time you set." },
  { label: "Music On Hold", name: "music_on_hold", help: "Played while the caller is on hold or waiting in the queue." },
  { label: "Ring Tone Music", name: "ring_tone_music", help: "Played to the caller while the call rings on an agent." },
  { label: "No Agent IVR", name: "no_agent_ivr", help: "Played when no agent is free. Example: \"All our agents are busy…\"" },
  { label: "Week Off IVR", name: "week_off_ivr", help: "Played when someone calls on the Week Off day." },
];

/* Help text shown when the ⓘ next to a field is clicked */
const HELP = {
  compaign_id:
    "A short, unique code for this campaign. Letters and numbers only, no spaces (e.g. SALES01). It is used inside the dialer and reports, so choose it carefully.",
  compaignname: "A friendly name your team will recognise, e.g. \"Home Loan Sales\". Shown in lists and reports.",
  campaign_dis:
    "Inbound: only receives customer calls. Outbound: only calls customers. Both: does both. This decides which settings appear below.",
  status: "Active: the campaign is live and handles calls. Inactive: saved, but no calls are made or received.",
  admin: "The admin who owns this campaign. Their agents and reports will be linked to it.",
  campaign_number:
    "The DID number(s) customers dial to reach this campaign. Separate several numbers with commas. Each must be 6–15 digits.",
  outbond_cli:
    "The caller ID the customer sees when this campaign calls them. Separate several numbers with commas. Each must be 6–15 digits.",
  auto_dial_status:
    "Active: the system dials leads automatically and connects answered calls to free agents. Inactive: agents dial numbers manually.",
  auto_dial_level:
    "How many numbers the system dials at once for each free agent. 1 is safest. 2–3 reaches more customers but can drop calls if no agent is free. 0 turns it off.",
  local_call_time: "The working hours of the campaign. Calls are only made or answered in this window. Outside it, the After Office IVR plays.",
  week_off: "The day(s) the campaign is closed. Callers hear the Week Off IVR on these days. Choose None if it runs every day.",
  ring_time: "How long the customer's phone rings before the call is marked as not answered.",
  type: "Decides which free agent gets an incoming call. Pick an option to see what it does.",
  script_notes: "Active: a lead form opens for the agent on every call so they can note customer details. Inactive or None: no form.",
  ivr:
    "Choose Extension Wise if callers should pick a department from an IVR menu (press 1 for Sales, 2 for Accounts…). Then complete the menu under Extensions in the sidebar. Choose None if you don't need an IVR menu.",
};

const GUIDE_STEPS = [
  { title: "Basic details", text: "Give the campaign a unique ID and a name, then choose its type, status and admin." },
  { title: "Phone numbers", text: "Inbound needs the DID(s) customers call. Outbound needs the CLI(s) customers will see." },
  { title: "Dialing", text: "Outbound only: turn Auto Dial on to let the system dial leads, and set how many lines per agent." },
  { title: "Schedule & call handling", text: "Set working hours, week off, ring time, how incoming calls reach agents, and the IVR route." },
  { title: "Audio (optional)", text: "Upload .wav prompts. Best format: 8 kHz, 16-bit, mono WAV." },
];

const EMPTY_FORM = {
  compaign_id: "",
  compaignname: "",
  campaign_dis: "",
  campaign_number: "",
  outbond_cli: "",
  auto_dial_level: "",
  auto_dial_status: "",
  local_call_time: "",
  week_off: "",
  ring_time: "60",
  type: "",
  script_notes: "",
  ivr: "0",
  status: "Y",
  admin: "",
};

const NUMBER_FIELDS = ["campaign_number", "outbond_cli"];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const api = (path) => `https://${window.location.hostname}:4000${path}`;
const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

const splitNumbers = (value) =>
  String(value || "")
    .split(/[,\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);

const numberListError = (value, label) => {
  const list = splitNumbers(value);
  if (!list.length) return `${label} is required`;
  const bad = list.find((n) => !/^\d{6,15}$/.test(n));
  if (bad) return `"${bad}" is not valid. Each number must be 6–15 digits.`;
  const dup = list.find((n, i) => list.indexOf(n) !== i);
  if (dup) return `"${dup}" is entered more than once`;
  return "";
};

/* Reads the real background so text contrasts in light and dark themes */
const parseRGB = (c) => {
  const m = String(c).match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return { r, g, b, a };
};
const isDarkBackground = (el) => {
  let node = el;
  while (node && node.nodeType === 1) {
    const c = parseRGB(getComputedStyle(node).backgroundColor);
    if (c && c.a > 0.5) return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b < 128;
    node = node.parentElement;
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
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

/* SweetAlert that follows the CRM theme (light / dark).
   Reads the real background colour on screen each time it opens. */
const swalTheme = () => {
  const el = document.querySelector(".upload-modal") || document.querySelector(".users-card") || document.body;
  const { bg, dark } = surfaceOf(el);
  return dark
    ? {
      background: bg,
      color: "#e5e7eb",
      confirmButtonColor: "#6366f1",
      cancelButtonColor: "#374151",
      customClass: { popup: "swal-crm-dark" },
    }
    : {
      background: "#ffffff",
      color: "#1f2937",
      confirmButtonColor: "#6366f1",
      cancelButtonColor: "#64748b",
    };
};
const swal = (opts) => Swal.fire({ ...swalTheme(), ...opts });

/* Extra dark-mode touches SweetAlert has no option for (border, backdrop) */
if (typeof document !== "undefined" && !document.getElementById("swal-crm-theme")) {
  const st = document.createElement("style");
  st.id = "swal-crm-theme";
  st.textContent = `
    .swal-crm-dark { border: 1px solid rgba(255,255,255,.08); box-shadow: 0 24px 60px -12px rgba(0,0,0,.7) !important; }
    .swal-crm-dark .swal2-html-container { color: #9ca3af !important; }
    .swal-crm-dark .swal2-timer-progress-bar { background: rgba(255,255,255,.25); }
    .swal2-container:has(.swal-crm-dark).swal2-backdrop-show { background: rgba(0,0,0,.6) !important; }
  `;
  document.head.appendChild(st);
}

/* ------------------------------------------------------------------ */
/*  InfoTip: the ⓘ button. Help opens as a floating overlay that      */
/*  doesn't push the form around, follows the icon while the form    */
/*  scrolls, and closes on an outside click, Escape or another tip.   */
/* ------------------------------------------------------------------ */
// Only one tip open at a time across the whole form
let closeOpenTip = null;

/* Is the surface behind this element dark? (so the overlay matches the theme) */
const isDarkBehind = (el) => isDarkBackground(el);

const InfoTip = ({ text, label = "More info" }) => {
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [dark, setDark] = useState(false);

  const close = () => setOpen(false);

  const toggle = (e) => {
    e.preventDefault(); // the tip usually sits inside a <label>; don't focus the input
    e.stopPropagation();
    if (open) return close();
    if (closeOpenTip) closeOpenTip();
    closeOpenTip = close;
    setDark(isDarkBehind(btnRef.current));
    setOpen(true);
  };

  // Place it under the icon (or above if there's no room), kept on screen
  const place = () => {
    const btn = btnRef.current;
    const pop = popRef.current;
    if (!btn || !pop) return;
    const a = btn.getBoundingClientRect();
    // Icon scrolled out of the form: close instead of floating over nothing
    if (a.bottom < 0 || a.top > window.innerHeight) return close();
    const p = pop.getBoundingClientRect();
    const gap = 8;
    const below = a.bottom + gap + p.height <= window.innerHeight - 8;
    const top = below ? a.bottom + gap : Math.max(8, a.top - gap - p.height);
    const left = Math.min(Math.max(8, a.left + a.width / 2 - 20), window.innerWidth - p.width - 8);
    const arrow = Math.min(Math.max(12, a.left + a.width / 2 - left), p.width - 12);
    setPos({ top, left, arrow, below });
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (popRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      close();
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation(); // close the tip, not the whole dialog
        close();
        btnRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("touchstart", onDown, { capture: true, passive: true });
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", place, true); // the form body scrolls
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("touchstart", onDown, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      if (closeOpenTip === close) closeOpenTip = null;
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`rf-tip${open ? " is-open" : ""}`}
        onClick={toggle}
        aria-label={label}
        aria-expanded={open}
      >
        <Info size={13} />
      </button>
      {open &&
        createPortal(
          <div
            ref={popRef}
            role="tooltip"
            className={`rf-tip-pop${dark ? " is-dark" : ""}${pos && !pos.below ? " is-above" : ""}`}
            style={pos ? { top: pos.top, left: pos.left, "--arrow": `${pos.arrow}px` } : { top: 0, left: 0, visibility: "hidden" }}
          >
            {text}
          </div>,
          document.body
        )}
    </>
  );
};

/* ------------------------------------------------------------------ */
/*  Building blocks                                                    */
/* ------------------------------------------------------------------ */
const Section = ({ icon: Icon, title, subtitle, children }) => (
  <section className="nc-section">
    <header className="nc-section__head">
      <span className="nc-section__icon">
        <Icon size={16} />
      </span>
      <div>
        <h4>{title}</h4>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </header>
    <div className="nc-grid">{children}</div>
  </section>
);

/* size: "sm" = 1/3 width, "md" = 1/2 width, "full" = whole row */
const Field = ({ name, label, required, size = "sm", error, note, children }) => (
  <div className={`field nc-field nc-${size}`}>
    <div className="nc-label">
      <label htmlFor={`nc-${name}`}>
        {label}
        {required && <span className="nc-req">*</span>}
      </label>
      {HELP[name] && <InfoTip text={HELP[name]} label={`What is ${label}?`} />}
    </div>
    {children}
    {note && !error && <div className="nc-note">{note}</div>}
    {error && <small className="field-error nc-error">{error}</small>}
  </div>
);

const Select = ({ name, value, onChange, options, placeholder }) => (
  <select id={`nc-${name}`} name={name} value={value ?? ""} onChange={onChange}>
    {placeholder && <option value="">{placeholder}</option>}
    {options.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ))}
  </select>
);

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */
const NewCampaignDialog = ({ open, onClose }) => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [files, setFiles] = useState({});
  const [admins, setAdmins] = useState([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  // Guide starts hidden; the "Show guide" button opens it
  const [showGuide, setShowGuide] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const modalRef = useRef(null);

  const isInbound = ["both", "inbound"].includes(form.campaign_dis);
  const isOutbound = ["both", "outbound"].includes(form.campaign_dis);

  /* ---- load admins when the dialog opens ---- */
  useEffect(() => {
    if (!open) return;
    axios
      .get(api("/telephony/admin"), { headers: authHeader() })
      .then((res) => setAdmins(Array.isArray(res.data) ? res.data : []))
      .catch((err) => console.error("Error fetching admins:", err));
  }, [open]);

  /* ---- stop the page behind the dialog from scrolling (important on phones) ---- */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  /* ---- follow light / dark theme ---- */
  useLayoutEffect(() => {
    if (!open) return;
    const check = () => modalRef.current && setIsDark(isDarkBackground(modalRef.current));
    check();
    const timer = setTimeout(check, 350);
    const observer = new MutationObserver(() => {
      check();
      setTimeout(check, 350);
    });
    [document.documentElement, document.body].forEach((n) =>
      observer.observe(n, { attributes: true, attributeFilter: ["class", "data-theme", "style"] })
    );
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [open]);

  /* ---- handlers ---- */
  const handleChange = (e) => {
    const { name } = e.target;
    let { value } = e.target;
    if (NUMBER_FIELDS.includes(name)) value = value.replace(/[^\d,\s]/g, "");

    setForm((prev) => {
      const next = { ...prev, [name]: value };
      // Clear settings that don't apply to the chosen campaign type
      if (name === "campaign_dis") {
        if (value === "inbound") Object.assign(next, { outbond_cli: "", auto_dial_status: "", auto_dial_level: "" });
        if (value === "outbound") Object.assign(next, { campaign_number: "", type: "", ivr: "0" });
      }
      return next;
    });
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleFileChange = (e) => {
    const { name, files: picked } = e.target;
    if (picked?.[0]) setFiles((prev) => ({ ...prev, [name]: picked[0] }));
    e.target.value = ""; // allow re-picking the same file
  };

  const clearFile = (name) =>
    setFiles((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });

  const checkDuplicateId = async () => {
    if (!form.compaign_id.trim()) return;
    try {
      const res = await axios.get(api(`/campaigns/checkDuplicateId/${encodeURIComponent(form.compaign_id)}`), {
        headers: authHeader(),
      });
      if (res.data.exists) setErrors((prev) => ({ ...prev, compaign_id: "Campaign ID already exists" }));
    } catch (err) {
      console.error(err);
    }
  };

  const validate = () => {
    const e = {};
    if (!form.compaign_id.trim()) e.compaign_id = "Campaign ID is required";
    else if (!/^[A-Za-z0-9]+$/.test(form.compaign_id)) e.compaign_id = "Only letters and numbers are allowed";
    else if (errors.compaign_id === "Campaign ID already exists") e.compaign_id = errors.compaign_id;

    if (!form.compaignname.trim()) e.compaignname = "Campaign Name is required";
    if (!form.campaign_dis) e.campaign_dis = "Campaign Type is required";
    if (!form.status) e.status = "Status is required";
    if (!form.local_call_time) e.local_call_time = "Call Time is required";

    if (isInbound) {
      const err = numberListError(form.campaign_number, "Inbound DID");
      if (err) e.campaign_number = err;
      if (!form.type) e.type = "Ring Type is required for inbound calls";
    }
    if (isOutbound) {
      const err = numberListError(form.outbond_cli, "Outbound CLI");
      if (err) e.outbond_cli = err;
      if (form.auto_dial_status === "1" && (!form.auto_dial_level || form.auto_dial_level === "0"))
        e.auto_dial_level = "Choose a level of 1 or more when Auto Dial is active";
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const reset = () => {
    setForm(EMPTY_FORM);
    setFiles({});
    setErrors({});
  };

  const close = (result) => {
    reset();
    onClose(result);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) {
      // Scroll to the first error so the user sees what to fix
      requestAnimationFrame(() =>
        modalRef.current?.querySelector(".nc-error")?.scrollIntoView({ behavior: "smooth", block: "center" })
      );
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        campaign_number: splitNumbers(form.campaign_number).join(","),
        outbond_cli: splitNumbers(form.outbond_cli).join(","),
      };

      const formData = new FormData();
      Object.entries(payload).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== "") formData.append(key, value);
      });
      Object.entries(files).forEach(([key, file]) => file && formData.append(key, file));

      await axios.post(api("/campaigns/addCampaign"), formData, { headers: authHeader() });

      swal({
        toast: true,
        position: "top-end",
        icon: "success",
        title: "Campaign added successfully",
        showConfirmButton: false,
        timer: 3000,
      });
      close(true);
    } catch (error) {
      console.error("Error adding campaign:", error);
      swal({
        icon: "error",
        title: "Failed to add campaign",
        text: error?.response?.data?.message || "Something went wrong",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  /* shared props for every Field */
  const fp = (name) => ({ name, error: errors[name] });
  const numberPreview = (value) => {
    const list = splitNumbers(value);
    return list.length ? `${list.length} number${list.length > 1 ? "s" : ""} added` : null;
  };
  const ringNote = RING_TYPE_OPTIONS.find((o) => o.value === form.type)?.note;
  const routeNote = CALL_ROUTE_OPTIONS.find((o) => o.value === form.ivr)?.note;

  return (
    <div className="upload-modal-backdrop nc-backdrop" onClick={() => close(null)}>
      <style>{`
        .nc-modal {
          --nc-tint: color-mix(in srgb, currentColor 4%, transparent);
          --nc-tint-2: color-mix(in srgb, currentColor 8%, transparent);
          --nc-border: var(--line, color-mix(in srgb, currentColor 14%, transparent));
          --nc-muted: var(--muted, color-mix(in srgb, currentColor 55%, transparent));
          --nc-brand: var(--brand, #6366f1);
          --nc-brand-tint: color-mix(in srgb, var(--brand, #6366f1) 14%, transparent);
          --nc-danger: var(--danger, #ef4444);
          color: #0f172a;
          width: min(1000px, 96vw) !important;
          max-height: 92vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .nc-modal.nc-dark {
          color: #e5e7eb;
          --nc-border: rgba(255, 255, 255, .09);
          --nc-muted: #94a3b8;
        }
        .nc-modal form { display: flex; flex-direction: column; min-height: 0; flex: 1; }

        /* ---------- Header ---------- */
        .nc-head {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 18px 24px; border-bottom: 1px solid var(--nc-border);
        }
        .nc-head__main { display: flex; align-items: center; gap: 12px; }
        .nc-head__icon {
          width: 40px; height: 40px; border-radius: 11px; flex: none;
          display: inline-flex; align-items: center; justify-content: center;
          background: var(--nc-brand); color: #fff;
        }
        .nc-head h3 { margin: 0; font-size: 18px; font-weight: 700; color: inherit; }
        .nc-head p { margin: 2px 0 0; font-size: 12.5px; color: var(--nc-muted); }
        .nc-head__actions { display: flex; align-items: center; gap: 8px; }
        .nc-guide-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 12px; border-radius: 9px; cursor: pointer;
          font-size: 13px; font-weight: 600;
          border: 1px solid var(--nc-border); background: var(--nc-tint); color: inherit;
        }
        .nc-guide-btn:hover { border-color: var(--nc-brand); color: var(--nc-brand); }

        /* ---------- Body ---------- */
        .nc-body { overflow-y: auto; padding: 18px 24px 22px; display: flex; flex-direction: column; gap: 16px; }

        /* ---------- Guide ---------- */
        .nc-guide {
          border: 1px solid color-mix(in srgb, var(--nc-brand) 35%, transparent);
          background: var(--nc-brand-tint);
          border-radius: 14px; padding: 14px 16px;
        }
        .nc-guide h5 { margin: 0 0 10px; font-size: 13.5px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
        .nc-guide ol { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; }
        .nc-guide li { display: flex; gap: 10px; font-size: 12.5px; line-height: 1.45; }
        .nc-guide li b { display: block; font-size: 13px; margin-bottom: 2px; }
        .nc-guide li span.txt { color: var(--nc-muted); }
        .nc-step {
          width: 22px; height: 22px; flex: none; border-radius: 50%;
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 11.5px; font-weight: 700; background: var(--nc-brand); color: #fff;
        }

        /* ---------- Section ---------- */
        .nc-section { border: 1px solid var(--nc-border); border-radius: 14px; padding: 16px 18px 18px; background: var(--nc-tint); }
        .nc-section__head { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 14px; }
        .nc-section__icon {
          width: 30px; height: 30px; flex: none; border-radius: 8px;
          display: inline-flex; align-items: center; justify-content: center;
          background: var(--nc-brand-tint); color: var(--nc-brand);
        }
        .nc-section h4 { margin: 0; font-size: 14.5px; font-weight: 700; color: inherit; }
        .nc-section__head p { margin: 2px 0 0; font-size: 12.5px; color: var(--nc-muted); }

        /* 6-column grid: sm = 1/3, md = 1/2, full = whole row */
        .nc-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 14px 16px; }
        .nc-sm { grid-column: span 2; }
        .nc-md { grid-column: span 3; }
        .nc-full { grid-column: 1 / -1; }
        @media (max-width: 760px) { .nc-sm { grid-column: span 3; } .nc-md { grid-column: 1 / -1; } }
        @media (max-width: 480px) { .nc-sm { grid-column: 1 / -1; } }

        /* ---------- Field ---------- */
        .nc-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; margin: 0; }
        .nc-label { display: flex; align-items: center; gap: 6px; min-height: 20px; }
        .nc-label label {
          font-size: 12px; font-weight: 600; letter-spacing: .04em;
          text-transform: uppercase; color: var(--nc-muted);
        }
        .nc-req { color: var(--nc-danger); margin-left: 3px; }
        /* ⓘ button (the help card itself is rendered on <body>, see .rf-tip-pop) */
        .rf-tip {
          display: inline-grid; place-items: center; flex: none;
          width: 20px; height: 20px; padding: 0; border: 0; border-radius: 50%;
          background: none; color: var(--nc-muted); cursor: pointer;
        }
        .rf-tip:hover, .rf-tip.is-open { color: var(--nc-brand); background: var(--nc-brand-tint); }
        .rf-tip:focus-visible { outline: 2px solid var(--nc-brand); outline-offset: 1px; }
        .nc-file__tip { position: relative; z-index: 2; display: inline-flex; } /* above the hidden file input */
        .nc-file__tip .rf-tip { width: 24px; height: 24px; border: 1px solid var(--nc-border); }

        .rf-tip-pop {
          position: fixed; z-index: 3000;
          width: max-content; max-width: min(280px, calc(100vw - 16px));
          padding: 10px 12px; border: 1px solid #e4e7ee; border-radius: 10px;
          background: #ffffff; color: #374151;
          font-size: 12.5px; font-weight: 400; line-height: 1.5;
          letter-spacing: normal; text-transform: none; text-align: left;
          box-shadow: 0 8px 24px -10px rgba(15, 23, 42, 0.25);
          animation: rf-tip-in .12s ease;
        }
        .rf-tip-pop::before {
          content: ""; position: absolute; top: -5px; left: calc(var(--arrow, 20px) - 5px);
          width: 9px; height: 9px; background: inherit;
          border-left: 1px solid #e4e7ee; border-top: 1px solid #e4e7ee; transform: rotate(45deg);
        }
        .rf-tip-pop.is-above::before { top: auto; bottom: -5px; transform: rotate(225deg); }
        .rf-tip-pop.is-dark { background: #21252e; border-color: #2a2f3a; color: #d5d9e2; box-shadow: 0 8px 24px -10px rgba(0, 0, 0, 0.6); }
        .rf-tip-pop.is-dark::before { border-color: #2a2f3a; }
        @keyframes rf-tip-in { from { opacity: 0; transform: translateY(-3px); } }
        .nc-field input, .nc-field select { width: 100%; height: 40px; box-sizing: border-box; }
        .nc-note { font-size: 12px; line-height: 1.45; color: var(--nc-muted); }
        .nc-error { color: var(--nc-danger); font-size: 12px; }

        /* ---------- Audio upload ---------- */
        .nc-file {
          position: relative; display: flex; align-items: center; gap: 10px;
          padding: 12px; border-radius: 12px; cursor: pointer;
          border: 1.5px dashed var(--nc-border); background: var(--nc-tint);
          transition: border-color .15s, background .15s;
        }
        .nc-file:hover { border-color: var(--nc-brand); background: var(--nc-brand-tint); }
        .nc-file.chosen { border-style: solid; border-color: color-mix(in srgb, #22c55e 50%, transparent); }
        .nc-file input[type="file"] { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }
        .nc-file__icon {
          width: 34px; height: 34px; flex: none; border-radius: 9px;
          display: inline-flex; align-items: center; justify-content: center;
          background: var(--nc-brand-tint); color: var(--nc-brand);
        }
        .nc-file__text { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
        .nc-file__label { font-size: 13px; font-weight: 600; color: inherit; }
        .nc-file__name { font-size: 11.5px; color: var(--nc-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .nc-file.chosen .nc-file__name { color: #22c55e; font-weight: 600; }
        .nc-file__btn {
          position: relative; z-index: 2; flex: none;
          width: 24px; height: 24px; border-radius: 50%; cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center;
          border: 1px solid var(--nc-border); background: transparent; color: var(--nc-muted);
        }
        .nc-file__btn:hover { color: var(--nc-brand); border-color: var(--nc-brand); }
        .nc-file__btn.danger:hover { color: var(--nc-danger); border-color: var(--nc-danger); }

        /* ---------- Footer ---------- */
        .nc-foot {
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
          padding: 14px 24px; border-top: 1px solid var(--nc-border);
        }
        .nc-foot small { color: var(--nc-muted); font-size: 12px; }
        .nc-foot__btns { display: flex; gap: 10px; }
        .nc-body { overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
        .nc-foot .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }

        /* ================= Tablet ================= */
        @media (max-width: 900px) {
          .nc-modal { width: 96vw !important; }
        }

        /* ================= Phone: full-screen sheet ================= */
        @media (max-width: 640px) {
          .nc-backdrop {
            padding: 0 !important;
            align-items: stretch !important;
            justify-content: stretch !important;
          }
          .nc-modal {
            width: 100vw !important;
            max-width: 100vw !important;
            height: 100vh;
            height: 100dvh;
            max-height: 100dvh;
            margin: 0 !important;
            border-radius: 0 !important;
          }
          .nc-hide-sm { display: none !important; }

          .nc-head { padding: 12px 14px; padding-top: max(12px, env(safe-area-inset-top)); }
          .nc-head__icon { width: 34px; height: 34px; border-radius: 10px; }
          .nc-head h3 { font-size: 16px; }
          .nc-head p { font-size: 11.5px; }
          .nc-guide-btn { width: 38px; height: 38px; padding: 0; justify-content: center; }

          .nc-body { padding: 12px 12px 20px; gap: 12px; }
          .nc-guide { padding: 12px; }
          .nc-guide ol { grid-template-columns: 1fr; gap: 8px; }
          .nc-section { padding: 14px 12px; border-radius: 12px; }
          .nc-section__head { margin-bottom: 12px; }
          .nc-grid { gap: 12px; }

          /* 16px stops iPhone from zooming in when a field is tapped; 44px = easy to tap */
          .nc-field input, .nc-field select { height: 44px; font-size: 16px; }
          .rf-tip { width: 30px; height: 30px; }
          .rf-tip-pop { font-size: 13px; }

          .nc-file { padding: 12px 10px; }
          .nc-file__btn { width: 32px; height: 32px; }

          .nc-foot { padding: 10px 12px; padding-bottom: max(10px, env(safe-area-inset-bottom)); }
          .nc-foot__btns { width: 100%; }
          .nc-foot__btns .btn { flex: 1; min-height: 46px; font-size: 15px; }
        }

        /* Touch screens: no hover-only effects */
        @media (hover: none) {
          .nc-file:hover { border-color: var(--nc-border); background: var(--nc-tint); }
          .nc-file.chosen:hover { border-color: color-mix(in srgb, #22c55e 50%, transparent); }
        }
      `}</style>

      <div
        ref={modalRef}
        className={`upload-modal wide nc-modal ${isDark ? "nc-dark" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ================= Header ================= */}
        <div className="nc-head">
          <div className="nc-head__main">
            <span className="nc-head__icon">
              <Megaphone size={20} />
            </span>
            <div>
              <h3>Add Campaign</h3>
              <p>Click the ⓘ next to any field to see what it does.</p>
            </div>
          </div>
          <div className="nc-head__actions">
            <button type="button" className="nc-guide-btn" onClick={() => setShowGuide((s) => !s)}>
              <BookOpen size={15} />
              <span className="nc-hide-sm">{showGuide ? "Hide guide" : "Show guide"}</span>
            </button>
            <button type="button" className="icon-btn" onClick={() => close(null)} title="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} autoComplete="off" noValidate>
          <div className="nc-body">
            {/* ---------- Quick guide ---------- */}
            {showGuide && (
              <div className="nc-guide">
                <h5>
                  <BookOpen size={15} /> How to create a campaign
                </h5>
                <ol>
                  {GUIDE_STEPS.map((s, i) => (
                    <li key={s.title}>
                      <span className="nc-step">{i + 1}</span>
                      <span>
                        <b>{s.title}</b>
                        <span className="txt">{s.text}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* ---------- 1. Basic details ---------- */}
            <Section icon={Settings2} title="Basic Details" subtitle="Identify the campaign and choose what kind of calls it handles.">
              <Field {...fp("compaign_id")} label="Campaign ID" required size="md">
                <input
                  id="nc-compaign_id"
                  name="compaign_id"
                  value={form.compaign_id}
                  onChange={handleChange}
                  onBlur={checkDuplicateId}
                  placeholder="e.g. SALES01"
                  maxLength={20}
                />
              </Field>

              <Field {...fp("compaignname")} label="Campaign Name" required size="md">
                <input
                  id="nc-compaignname"
                  name="compaignname"
                  value={form.compaignname}
                  onChange={handleChange}
                  placeholder="e.g. Home Loan Sales"
                />
              </Field>

              <Field {...fp("campaign_dis")} label="Campaign Type" required>
                <Select
                  name="campaign_dis"
                  value={form.campaign_dis}
                  onChange={handleChange}
                  options={CAMPAIGN_TYPE_OPTIONS}
                  placeholder="Select type"
                />
              </Field>

              <Field {...fp("status")} label="Status" required>
                <Select name="status" value={form.status} onChange={handleChange} options={STATUS_OPTIONS} placeholder="Select status" />
              </Field>

              <Field {...fp("admin")} label="Admin">
                <Select
                  name="admin"
                  value={form.admin}
                  onChange={handleChange}
                  options={admins.map((a) => ({ value: a.user_id, label: a.full_name || a.user_id }))}
                  placeholder="Select admin"
                />
              </Field>
            </Section>

            {/* ---------- 2. Phone numbers ---------- */}
            {(isInbound || isOutbound) && (
              <Section icon={isInbound ? PhoneIncoming : PhoneOutgoing} title="Phone Numbers" subtitle="Separate multiple numbers with commas.">
                {isInbound && (
                  <Field
                    {...fp("campaign_number")}
                    label="Inbound DID(s)"
                    required
                    size={isOutbound ? "md" : "full"}
                    note={numberPreview(form.campaign_number)}
                  >
                    <input
                      id="nc-campaign_number"
                      name="campaign_number"
                      value={form.campaign_number}
                      onChange={handleChange}
                      inputMode="numeric"
                      placeholder="9876543210, 9876543211"
                    />
                  </Field>
                )}
                {isOutbound && (
                  <Field
                    {...fp("outbond_cli")}
                    label="Outbound CLI(s)"
                    required
                    size={isInbound ? "md" : "full"}
                    note={numberPreview(form.outbond_cli)}
                  >
                    <input
                      id="nc-outbond_cli"
                      name="outbond_cli"
                      value={form.outbond_cli}
                      onChange={handleChange}
                      inputMode="numeric"
                      placeholder="9876543210, 9876543211"
                    />
                  </Field>
                )}
              </Section>
            )}

            {/* ---------- 3. Dialing (outbound only) ---------- */}
            {isOutbound && (
              <Section icon={Zap} title="Auto Dialing" subtitle="Let the system dial your leads automatically.">
                <Field {...fp("auto_dial_status")} label="Auto Dial Status" size="md">
                  <Select
                    name="auto_dial_status"
                    value={form.auto_dial_status}
                    onChange={handleChange}
                    options={AUTO_DIAL_STATUS_OPTIONS}
                    placeholder="Select status"
                  />
                </Field>
                <Field
                  {...fp("auto_dial_level")}
                  label="Auto Dial Level"
                  size="md"
                  note={form.auto_dial_level && form.auto_dial_level !== "0" ? `Dials ${form.auto_dial_level} number(s) at a time per free agent.` : null}
                >
                  <Select name="auto_dial_level" value={form.auto_dial_level} onChange={handleChange} options={AUTO_DIAL_LEVELS} placeholder="None" />
                </Field>
              </Section>
            )}

            {/* ---------- 4. Schedule & call handling ---------- */}
            <Section icon={CalendarClock} title="Schedule & Call Handling" subtitle="When the campaign works and how calls reach your agents.">
              <Field {...fp("local_call_time")} label="Call Time" required>
                <Select
                  name="local_call_time"
                  value={form.local_call_time}
                  onChange={handleChange}
                  options={CALL_TIME_OPTIONS}
                  placeholder="Select call time"
                />
              </Field>

              <Field {...fp("week_off")} label="Week Off">
                <Select name="week_off" value={form.week_off} onChange={handleChange} options={WEEK_OFF_OPTIONS} />
              </Field>

              <Field {...fp("ring_time")} label="Ring Time">
                <Select name="ring_time" value={form.ring_time} onChange={handleChange} options={RING_TIME_OPTIONS} />
              </Field>

              {isInbound && (
                <Field {...fp("type")} label="Incoming Ring Type" required note={ringNote}>
                  <Select name="type" value={form.type} onChange={handleChange} options={RING_TYPE_OPTIONS} placeholder="Select ring type" />
                </Field>
              )}

              {isInbound && (
                <Field {...fp("ivr")} label="Call Route" note={routeNote}>
                  <Select name="ivr" value={form.ivr} onChange={handleChange} options={CALL_ROUTE_OPTIONS} />
                </Field>
              )}

              <Field {...fp("script_notes")} label="Lead Form">
                <Select name="script_notes" value={form.script_notes} onChange={handleChange} options={LEAD_FORM_OPTIONS} />
              </Field>
            </Section>

            {/* ---------- 5. Audio ---------- */}
            <Section
              icon={Music2}
              title="Audio Files (optional)"
              subtitle="Upload .wav files. Best format: 8 kHz, 16-bit, mono. Click ⓘ on a file to see when it plays."
            >
              {FILE_FIELDS.map((f) => {
                const chosen = files[f.name];
                return (
                  <div className="nc-field nc-sm" key={f.name}>
                    <div className={`nc-file ${chosen ? "chosen" : ""}`}>
                      <span className="nc-file__icon">
                        {chosen ? <FileAudio size={16} /> : <Upload size={16} />}
                      </span>
                      <span className="nc-file__text">
                        <span className="nc-file__label">{f.label}</span>
                        <span className="nc-file__name">{chosen ? chosen.name : "Click to upload .wav"}</span>
                      </span>
                      <span className="nc-file__tip">
                        <InfoTip text={f.help} label={`When does ${f.label} play?`} />
                      </span>
                      {chosen && (
                        <button
                          type="button"
                          className="nc-file__btn danger"
                          title="Remove file"
                          onClick={(e) => {
                            e.stopPropagation();
                            clearFile(f.name);
                          }}
                        >
                          <X size={13} />
                        </button>
                      )}
                      <input type="file" name={f.name} accept=".wav,audio/wav" onChange={handleFileChange} />
                    </div>
                  </div>
                );
              })}
            </Section>
          </div>

          {/* ================= Footer ================= */}
          <div className="nc-foot">
            <small className="nc-hide-sm">
              <span className="nc-req">*</span> Required fields
            </small>
            <div className="nc-foot__btns">
              <button type="button" className="btn btn-ghost" onClick={() => close(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving && <Loader2 size={14} className="spin" />}
                {saving ? "Saving..." : "Create Campaign"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewCampaignDialog;