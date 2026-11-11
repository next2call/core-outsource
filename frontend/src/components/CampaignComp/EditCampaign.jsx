import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import {
  Loader2,
  FileAudio,
  X,
  Info,
  Pencil,
  Settings2,
  PhoneIncoming,
  PhoneOutgoing,
  Zap,
  CalendarClock,
  Music2,
  BookOpen,
  ChevronDown,
  Upload,
  RotateCcw,
} from "lucide-react";
import Swal from "sweetalert2";
import axios from "axios";

/* ------------------------------------------------------------------ */
/*  Option lists (same as NewCampaignDialog)                           */
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
    note: "Callers get an IVR menu (e.g. press 1 for Sales, 2 for Accounts). Open Extensions in the sidebar to set up the menu options.",
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

const HELP = {
  compaign_id: "The campaign's unique code. It can't be changed after the campaign is created.",
  compaignname: "A friendly name your team will recognise, e.g. \"Home Loan Sales\". Shown in lists and reports.",
  campaign_dis:
    "Inbound: only receives customer calls. Outbound: only calls customers. Both: does both. Changing this shows or hides the related settings below.",
  status: "Active: the campaign is live and handles calls. Inactive: saved, but no calls are made or received.",
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
  { title: "Change what you need", text: "Only edited fields are highlighted. Everything else stays as it is." },
  { title: "Changing the type", text: "Switching Inbound/Outbound/Both clears settings that no longer apply." },
  { title: "Replace audio", text: "Play the current file to check it. Upload a new .wav only if you want to replace it." },
  { title: "Save", text: "Save is enabled once something has changed. Use Reset to undo your edits." },
];

/* Every editable field, so values from the API are normalised to strings */
const FORM_FIELDS = [
  "compaignname",
  "campaign_dis",
  "status",
  "campaign_number",
  "outbond_cli",
  "auto_dial_status",
  "auto_dial_level",
  "local_call_time",
  "week_off",
  "ring_time",
  "type",
  "script_notes",
  "ivr",
];

const NUMBER_FIELDS = ["campaign_number", "outbond_cli"];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const api = (path) => `https://${window.location.hostname}:4000${path}`;
const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });
const audioUrl = (path) => `https://${window.location.hostname}:4000/${path}`;
const fileNameOf = (path) => String(path || "").split(/[\\/]/).pop();

const toForm = (data = {}) => {
  const f = { ...data };
  FORM_FIELDS.forEach((k) => {
    f[k] = data[k] === null || data[k] === undefined ? "" : String(data[k]);
  });
  f.campaign_dis = f.campaign_dis.toLowerCase();
  if (!f.ivr) f.ivr = "0";
  return f;
};

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
/*  Building blocks                                                    */
/* ------------------------------------------------------------------ */
const Section = ({ icon: Icon, title, subtitle, children }) => (
  <section className="ec-section">
    <header className="ec-section__head">
      <span className="ec-section__icon">
        <Icon size={16} />
      </span>
      <div>
        <h4>{title}</h4>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </header>
    <div className="ec-grid">{children}</div>
  </section>
);

const Field = ({ name, label, required, size = "sm", helpOpen, onToggleHelp, error, note, changed, children }) => (
  <div className={`field ec-field ec-${size} ${changed ? "is-changed" : ""}`}>
    <div className="ec-label">
      <label htmlFor={`ec-${name}`}>
        {label}
        {required && <span className="ec-req">*</span>}
      </label>
      {HELP[name] && (
        <button
          type="button"
          className={`ec-help-btn ${helpOpen ? "on" : ""}`}
          onClick={() => onToggleHelp(name)}
          aria-expanded={helpOpen}
          title="What is this?"
        >
          <Info size={14} />
        </button>
      )}
      {changed && <span className="ec-changed">Edited</span>}
    </div>
    {helpOpen && <div className="ec-help">{HELP[name]}</div>}
    {children}
    {note && !error && <div className="ec-note">{note}</div>}
    {error && <small className="field-error ec-error">{error}</small>}
  </div>
);

const Select = ({ name, value, onChange, options, placeholder }) => {
  // If the saved value isn't in the list (old data), still show it instead of a blank box
  const known = options.some((o) => o.value === value);
  return (
    <select id={`ec-${name}`} name={name} value={value ?? ""} onChange={onChange}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {!known && value !== "" && <option value={value}>{value}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
};

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */
const EditDialog = ({ open, onClose, data }) => {
  const initial = useMemo(() => toForm(data), [data]);
  const [form, setForm] = useState(initial);
  const [files, setFiles] = useState({});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [helpOpen, setHelpOpen] = useState({});
  const [showGuide, setShowGuide] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const modalRef = useRef(null);

  /* ---- reload the form whenever a different campaign is opened ---- */
  useEffect(() => {
    if (!open) return;
    setForm(initial);
    setFiles({});
    setErrors({});
    setHelpOpen({});
  }, [open, initial]);

  /* ---- stop the page behind from scrolling (important on phones) ---- */
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

  const isInbound = ["both", "inbound"].includes(form.campaign_dis);
  const isOutbound = ["both", "outbound"].includes(form.campaign_dis);

  const changedFields = FORM_FIELDS.filter((k) => (form[k] ?? "") !== (initial[k] ?? ""));
  const changeCount = changedFields.length + Object.keys(files).length;
  const isChanged = (k) => changedFields.includes(k);

  /* ---- handlers ---- */
  const toggleHelp = (name) => setHelpOpen((p) => ({ ...p, [name]: !p[name] }));

  const handleChange = (e) => {
    const { name } = e.target;
    let { value } = e.target;
    if (NUMBER_FIELDS.includes(name)) value = value.replace(/[^\d,\s]/g, "");

    setForm((prev) => {
      const next = { ...prev, [name]: value };
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
    e.target.value = "";
  };

  const clearFile = (name) =>
    setFiles((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });

  const resetChanges = () => {
    setForm(initial);
    setFiles({});
    setErrors({});
  };

  const validate = () => {
    const e = {};
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) {
      requestAnimationFrame(() =>
        modalRef.current?.querySelector(".ec-error")?.scrollIntoView({ behavior: "smooth", block: "center" })
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

      // Send every field (empty ones too) so cleared values are saved as empty
      const formData = new FormData();
      Object.entries(payload).forEach(([key, value]) => formData.append(key, value ?? ""));
      Object.entries(files).forEach(([key, file]) => file && formData.append(key, file));

      await axios.put(api(`/campaigns/editCampaign/${encodeURIComponent(data.compaign_id)}`), formData, {
        headers: authHeader(),
      });

      swal({
        toast: true,
        position: "top-end",
        icon: "success",
        title: "Campaign updated successfully",
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true,
      });
      onClose(payload);
    } catch (error) {
      console.error("Failed to update campaign:", error);
      swal({
        icon: "error",
        title: "Failed to update campaign",
        text: error?.response?.data?.message || "Something went wrong",
      });
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    if (changeCount && !saving) {
      swal({
        icon: "question",
        title: "Discard changes?",
        text: "Your edits to this campaign will be lost.",
        showCancelButton: true,
        confirmButtonText: "Discard",
        confirmButtonColor: "#dc2626",
        cancelButtonText: "Keep editing",
      }).then((r) => r.isConfirmed && onClose(null));
      return;
    }
    onClose(null);
  };

  if (!open || !data) return null;

  const fp = (name) => ({
    name,
    helpOpen: !!helpOpen[name],
    onToggleHelp: toggleHelp,
    error: errors[name],
    changed: isChanged(name),
  });
  const numberPreview = (value) => {
    const list = splitNumbers(value);
    return list.length ? `${list.length} number${list.length > 1 ? "s" : ""} added` : null;
  };
  const ringNote = RING_TYPE_OPTIONS.find((o) => o.value === form.type)?.note;
  const routeNote = CALL_ROUTE_OPTIONS.find((o) => o.value === form.ivr)?.note;

  return (
    <div className="upload-modal-backdrop ec-backdrop" onClick={close}>
      <style>{`
        .ec-modal {
          --ec-tint: color-mix(in srgb, currentColor 4%, transparent);
          --ec-tint-2: color-mix(in srgb, currentColor 8%, transparent);
          --ec-border: var(--line, color-mix(in srgb, currentColor 14%, transparent));
          --ec-muted: var(--muted, color-mix(in srgb, currentColor 55%, transparent));
          --ec-brand: var(--brand, #6366f1);
          --ec-brand-tint: color-mix(in srgb, var(--brand, #6366f1) 14%, transparent);
          --ec-danger: var(--danger, #ef4444);
          color: #0f172a;
          width: min(1000px, 96vw) !important;
          max-height: 92vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .ec-modal.ec-dark {
          color: #e5e7eb;
          --ec-border: rgba(255, 255, 255, .09);
          --ec-muted: #94a3b8;
        }
        .ec-modal form { display: flex; flex-direction: column; min-height: 0; flex: 1; }

        /* ---------- Header ---------- */
        .ec-head {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 18px 24px; border-bottom: 1px solid var(--ec-border);
        }
        .ec-head__main { display: flex; align-items: center; gap: 12px; }
        .ec-head__icon {
          width: 40px; height: 40px; border-radius: 11px; flex: none;
          display: inline-flex; align-items: center; justify-content: center;
          background: var(--ec-brand); color: #fff;
        }
        .ec-head h3 { margin: 0; font-size: 18px; font-weight: 700; color: inherit; }
        .ec-head p { margin: 2px 0 0; font-size: 12.5px; color: var(--ec-muted); }
        .ec-head__actions { display: flex; align-items: center; gap: 8px; }
        .ec-guide-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 12px; border-radius: 9px; cursor: pointer;
          font-size: 13px; font-weight: 600;
          border: 1px solid var(--ec-border); background: var(--ec-tint); color: inherit;
        }
        .ec-guide-btn:hover { border-color: var(--ec-brand); color: var(--ec-brand); }

        /* ---------- Body ---------- */
        .ec-body { overflow-y: auto; padding: 18px 24px 22px; display: flex; flex-direction: column; gap: 16px; }

        /* ---------- Guide ---------- */
        .ec-guide {
          border: 1px solid color-mix(in srgb, var(--ec-brand) 35%, transparent);
          background: var(--ec-brand-tint);
          border-radius: 14px; padding: 14px 16px;
        }
        .ec-guide h5 { margin: 0 0 10px; font-size: 13.5px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
        .ec-guide ol { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; }
        .ec-guide li { display: flex; gap: 10px; font-size: 12.5px; line-height: 1.45; }
        .ec-guide li b { display: block; font-size: 13px; margin-bottom: 2px; }
        .ec-guide li span.txt { color: var(--ec-muted); }
        .ec-step {
          width: 22px; height: 22px; flex: none; border-radius: 50%;
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 11.5px; font-weight: 700; background: var(--ec-brand); color: #fff;
        }

        /* ---------- Section ---------- */
        .ec-section { border: 1px solid var(--ec-border); border-radius: 14px; padding: 16px 18px 18px; background: var(--ec-tint); }
        .ec-section__head { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 14px; }
        .ec-section__icon {
          width: 30px; height: 30px; flex: none; border-radius: 8px;
          display: inline-flex; align-items: center; justify-content: center;
          background: var(--ec-brand-tint); color: var(--ec-brand);
        }
        .ec-section h4 { margin: 0; font-size: 14.5px; font-weight: 700; color: inherit; }
        .ec-section__head p { margin: 2px 0 0; font-size: 12.5px; color: var(--ec-muted); }

        /* 6-column grid: sm = 1/3, md = 1/2, full = whole row */
        .ec-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 14px 16px; }
        .ec-sm { grid-column: span 2; }
        .ec-md { grid-column: span 3; }
        .ec-full { grid-column: 1 / -1; }
        @media (max-width: 760px) { .ec-sm { grid-column: span 3; } .ec-md { grid-column: 1 / -1; } }
        @media (max-width: 480px) { .ec-sm { grid-column: 1 / -1; } }

        /* ---------- Field ---------- */
        .ec-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; margin: 0; }
        .ec-label { display: flex; align-items: center; gap: 6px; min-height: 20px; }
        .ec-label label {
          font-size: 12px; font-weight: 600; letter-spacing: .04em;
          text-transform: uppercase; color: var(--ec-muted);
        }
        .ec-req { color: var(--ec-danger); margin-left: 3px; }
        .ec-help-btn {
          width: 20px; height: 20px; padding: 0; border-radius: 50%; cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center;
          border: none; background: transparent; color: var(--ec-muted);
        }
        .ec-help-btn:hover, .ec-help-btn.on { color: var(--ec-brand); background: var(--ec-brand-tint); }
        .ec-help {
          font-size: 12.5px; line-height: 1.5; padding: 9px 11px; border-radius: 9px;
          background: var(--ec-brand-tint); border-left: 3px solid var(--ec-brand);
          animation: ec-in .15s ease-out;
        }
        @keyframes ec-in { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: none; } }
        .ec-field input, .ec-field select { width: 100%; height: 40px; box-sizing: border-box; }
        .ec-note { font-size: 12px; line-height: 1.45; color: var(--ec-muted); }
        .ec-error { color: var(--ec-danger); font-size: 12px; }

        /* ---------- Audio upload ---------- */
        .ec-file {
          position: relative; display: flex; align-items: center; gap: 10px;
          padding: 12px; border-radius: 12px; cursor: pointer;
          border: 1.5px dashed var(--ec-border); background: var(--ec-tint);
          transition: border-color .15s, background .15s;
        }
        .ec-file:hover { border-color: var(--ec-brand); background: var(--ec-brand-tint); }
        .ec-file.chosen { border-style: solid; border-color: color-mix(in srgb, #22c55e 50%, transparent); }
        .ec-file input[type="file"] { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }
        .ec-file__icon {
          width: 34px; height: 34px; flex: none; border-radius: 9px;
          display: inline-flex; align-items: center; justify-content: center;
          background: var(--ec-brand-tint); color: var(--ec-brand);
        }
        .ec-file__text { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
        .ec-file__label { font-size: 13px; font-weight: 600; color: inherit; }
        .ec-file__name { font-size: 11.5px; color: var(--ec-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ec-file.chosen .ec-file__name { color: #22c55e; font-weight: 600; }
        .ec-file__btn {
          position: relative; z-index: 2; flex: none;
          width: 24px; height: 24px; border-radius: 50%; cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center;
          border: 1px solid var(--ec-border); background: transparent; color: var(--ec-muted);
        }
        .ec-file__btn:hover { color: var(--ec-brand); border-color: var(--ec-brand); }
        .ec-file__btn.danger:hover { color: var(--ec-danger); border-color: var(--ec-danger); }

        /* ---------- Footer ---------- */
        .ec-foot {
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
          padding: 14px 24px; border-top: 1px solid var(--ec-border);
        }
        .ec-foot small { color: var(--ec-muted); font-size: 12px; }
        .ec-foot__btns { display: flex; gap: 10px; }
        .ec-body { overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
        .ec-foot .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }

        /* ================= Tablet ================= */
        @media (max-width: 900px) {
          .ec-modal { width: 96vw !important; }
        }

        /* ================= Phone: full-screen sheet ================= */
        @media (max-width: 640px) {
          .ec-backdrop {
            padding: 0 !important;
            align-items: stretch !important;
            justify-content: stretch !important;
          }
          .ec-modal {
            width: 100vw !important;
            max-width: 100vw !important;
            height: 100vh;
            height: 100dvh;
            max-height: 100dvh;
            margin: 0 !important;
            border-radius: 0 !important;
          }
          .ec-hide-sm { display: none !important; }

          .ec-head { padding: 12px 14px; padding-top: max(12px, env(safe-area-inset-top)); }
          .ec-head__icon { width: 34px; height: 34px; border-radius: 10px; }
          .ec-head h3 { font-size: 16px; }
          .ec-head p { font-size: 11.5px; }
          .ec-guide-btn { width: 38px; height: 38px; padding: 0; justify-content: center; }

          .ec-body { padding: 12px 12px 20px; gap: 12px; }
          .ec-guide { padding: 12px; }
          .ec-guide ol { grid-template-columns: 1fr; gap: 8px; }
          .ec-section { padding: 14px 12px; border-radius: 12px; }
          .ec-section__head { margin-bottom: 12px; }
          .ec-grid { gap: 12px; }

          /* 16px stops iPhone from zooming in when a field is tapped; 44px = easy to tap */
          .ec-field input, .ec-field select { height: 44px; font-size: 16px; }
          .ec-help-btn { width: 30px; height: 30px; }
          .ec-help { font-size: 13px; }

          .ec-file { padding: 12px 10px; }
          .ec-file__btn { width: 32px; height: 32px; }

          .ec-foot { padding: 10px 12px; padding-bottom: max(10px, env(safe-area-inset-bottom)); }
          .ec-foot__btns { width: 100%; }
          .ec-foot__btns .btn { flex: 1; min-height: 46px; font-size: 15px; }
        }

        /* Touch screens: no hover-only effects */
        @media (hover: none) {
          .ec-file:hover { border-color: var(--ec-border); background: var(--ec-tint); }
          .ec-file.chosen:hover { border-color: color-mix(in srgb, #22c55e 50%, transparent); }
        }

        /* ---------- Edit-only extras ---------- */
        .ec-id {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-weight: 700; color: var(--ec-brand);
          padding: 1px 7px; border-radius: 6px; background: var(--ec-brand-tint);
        }
        .ec-readonly { opacity: .7; cursor: not-allowed; }
        .ec-field.is-changed input, .ec-field.is-changed select {
          border-color: var(--ec-brand) !important;
          box-shadow: 0 0 0 3px var(--ec-brand-tint);
        }
        .ec-changed {
          margin-left: auto; font-size: 10.5px; font-weight: 700; letter-spacing: .04em;
          text-transform: uppercase; color: var(--ec-brand);
          padding: 2px 7px; border-radius: 999px; background: var(--ec-brand-tint);
        }

        .ec-audio {
          display: flex; flex-direction: column; gap: 8px; padding: 10px;
          border-radius: 12px; border: 1px solid var(--ec-border); background: var(--ec-tint);
        }
        .ec-audio.chosen { border-color: color-mix(in srgb, #22c55e 50%, transparent); }
        .ec-audio .ec-file { padding: 4px 2px; border: none; background: transparent; }
        .ec-audio .ec-file:hover { background: transparent; }
        .ec-audio.chosen .ec-file__name { color: #22c55e; font-weight: 600; }
        .ec-audio audio { width: 100%; height: 34px; }

        .ec-foot__info { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; }
        .ec-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ec-brand); }
        .ec-link {
          display: inline-flex; align-items: center; gap: 4px; margin-left: 4px;
          border: none; background: none; cursor: pointer; padding: 4px 6px; border-radius: 6px;
          font-size: 12.5px; font-weight: 600; color: var(--ec-muted);
        }
        .ec-link:hover { color: var(--ec-brand); background: var(--ec-brand-tint); }
        .ec-btn-disabled, .ec-foot .btn:disabled { opacity: .55; cursor: not-allowed; }

        @media (max-width: 640px) {
          .ec-audio audio { height: 40px; }
          .ec-foot { flex-wrap: wrap; }
          .ec-foot__info:empty { display: none; }
        }
      `}</style>

      <div
        ref={modalRef}
        className={`upload-modal wide ec-modal ${isDark ? "ec-dark" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ================= Header ================= */}
        <div className="ec-head">
          <div className="ec-head__main">
            <span className="ec-head__icon">
              <Pencil size={19} />
            </span>
            <div style={{ minWidth: 0 }}>
              <h3>Edit Campaign</h3>
              <p>
                <span className="ec-id">{data.compaign_id}</span>
                <span className="ec-hide-sm"> · Click ⓘ next to any field to see what it does.</span>
              </p>
            </div>
          </div>
          <div className="ec-head__actions">
            <button type="button" className="ec-guide-btn" onClick={() => setShowGuide((s) => !s)}>
              <BookOpen size={15} />
              <span className="ec-hide-sm">{showGuide ? "Hide guide" : "Guide"}</span>
            </button>
            <button type="button" className="icon-btn" onClick={close} title="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} autoComplete="off" noValidate>
          <div className="ec-body">
            {showGuide && (
              <div className="ec-guide">
                <h5>
                  <BookOpen size={15} /> Editing a campaign
                </h5>
                <ol>
                  {GUIDE_STEPS.map((s, i) => (
                    <li key={s.title}>
                      <span className="ec-step">{i + 1}</span>
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
            <Section icon={Settings2} title="Basic Details" subtitle="Name, type and status of the campaign.">
              <Field {...fp("compaign_id")} label="Campaign ID">
                <input id="ec-compaign_id" value={data.compaign_id || ""} readOnly disabled className="ec-readonly" />
              </Field>

              <Field {...fp("compaignname")} label="Campaign Name" required>
                <input
                  id="ec-compaignname"
                  name="compaignname"
                  value={form.compaignname}
                  onChange={handleChange}
                  placeholder="e.g. Home Loan Sales"
                />
              </Field>

              <Field {...fp("status")} label="Status" required>
                <Select name="status" value={form.status} onChange={handleChange} options={STATUS_OPTIONS} placeholder="Select status" />
              </Field>

              <Field {...fp("campaign_dis")} label="Campaign Type" required size="full">
                <Select
                  name="campaign_dis"
                  value={form.campaign_dis}
                  onChange={handleChange}
                  options={CAMPAIGN_TYPE_OPTIONS}
                  placeholder="Select type"
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
                      id="ec-campaign_number"
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
                      id="ec-outbond_cli"
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

            {/* ---------- 3. Auto dialing (outbound only) ---------- */}
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
              title="Audio Files"
              subtitle="Play the current file, or upload a new .wav to replace it. Best format: 8 kHz, 16-bit, mono."
            >
              {FILE_FIELDS.map((f) => {
                const chosen = files[f.name];
                const current = data[f.name];
                const open = !!helpOpen[f.name];
                return (
                  <div className="ec-field ec-sm" key={f.name}>
                    <div className={`ec-audio ${chosen ? "chosen" : ""}`}>
                      <div className="ec-file">
                        <span className="ec-file__icon">{chosen ? <FileAudio size={16} /> : <Upload size={16} />}</span>
                        <span className="ec-file__text">
                          <span className="ec-file__label">{f.label}</span>
                          <span className="ec-file__name">
                            {chosen
                              ? `New: ${chosen.name}`
                              : current
                              ? `Click to replace · ${fileNameOf(current)}`
                              : "Click to upload .wav"}
                          </span>
                        </span>
                        <button
                          type="button"
                          className="ec-file__btn"
                          title="When does this play?"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleHelp(f.name);
                          }}
                        >
                          {open ? <ChevronDown size={13} /> : <Info size={13} />}
                        </button>
                        {chosen && (
                          <button
                            type="button"
                            className="ec-file__btn danger"
                            title="Undo — keep the current file"
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
                      {current && !chosen && (
                        <audio controls preload="none" src={audioUrl(current)}>
                          Your browser does not support the audio element.
                        </audio>
                      )}
                    </div>
                    {open && <div className="ec-help">{f.help}</div>}
                  </div>
                );
              })}
            </Section>
          </div>

          {/* ================= Footer ================= */}
          <div className="ec-foot">
            <div className="ec-foot__info">
              {changeCount ? (
                <>
                  <span className="ec-dot" />
                  {changeCount} change{changeCount > 1 ? "s" : ""}
                  <button type="button" className="ec-link" onClick={resetChanges}>
                    <RotateCcw size={13} /> Reset
                  </button>
                </>
              ) : (
                <span className="ec-hide-sm">No changes yet</span>
              )}
            </div>
            <div className="ec-foot__btns">
              <button type="button" className="btn btn-ghost" onClick={close}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving || !changeCount}>
                {saving && <Loader2 size={14} className="spin" />}
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditDialog;