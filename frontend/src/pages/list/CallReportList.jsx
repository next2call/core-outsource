import { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import axios from "axios";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import JSZip from "jszip";
import Swal from "sweetalert2";
import "./callReport.css";

/* =====================================================================
 * CONFIG - change these to match your backend
 * ===================================================================== */
const API = `https://${window.location.hostname}:4000`;
const CONFIG = {
  callsApi: "/viewCalls",
  agentsApi: "/call_report_agent_dropdown",
  // template lists (GET) - return array of { id, name, body } (other key names are auto-detected)
  smsTemplatesApi: "/sms_templates",
  whatsappTemplatesApi: "/whatsapp_templates",
  // send (POST) - body: { number, message, template_id, call_id, campaign_id, agent_id }
  smsSendApi: "/send_sms",
  whatsappSendApi: "/send_whatsapp",
  // block (POST) - body: { number }
  blockApi: "/block_number",
};
const MAX_ZIP_RECORDINGS = 300; // more than this in one ZIP freezes the browser
const ZIP_CONCURRENCY = 6; // parallel recording downloads
/* ===================================================================== */

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

/* ---------- inline SVG icons ---------- */
const S = ({ size = 16, children, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>{children}</svg>
);
const Icon = {
  Search: (p) => <S {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></S>,
  Filter: (p) => <S {...p}><path d="M3 5h18l-7 9v6l-4-2v-4z" /></S>,
  Download: (p) => <S {...p}><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></S>,
  Phone: (p) => <S {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.71 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.58 2.81.71A2 2 0 0 1 22 16.92z" /></S>,
  Block: (p) => <S {...p}><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></S>,
  Close: (p) => <S {...p}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></S>,
  Chevron: (p) => <S {...p}><path d="m9 6 6 6-6 6" /></S>,
  Audio: (p) => <S {...p}><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></S>,
  Grid: (p) => <S {...p}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></S>,
  Play: (p) => <S {...p}><polygon points="6 4 20 12 6 20 6 4" fill="currentColor" /></S>,
  Pause: (p) => <S {...p}><rect x="6" y="4" width="4" height="16" fill="currentColor" /><rect x="14" y="4" width="4" height="16" fill="currentColor" /></S>,
  Sms: (p) => <S {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M8 9h8M8 13h5" /></S>,
  WhatsApp: ({ size = 16, ...p }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm0 18.15c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24s8.24 3.7 8.24 8.24-3.7 8.24-8.24 8.24zm4.52-6.17c-.25-.12-1.47-.72-1.7-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.87.85-.87 2.07s.89 2.4 1.01 2.57c.12.17 1.75 2.67 4.24 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28z" />
    </svg>
  ),
  Refresh: (p) => <S {...p}><polyline points="23 4 23 10 17 10" /><path d="M20.5 15a9 9 0 1 1-2.1-9.4L23 10" /></S>,
  Check: (p) => <S {...p}><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></S>,
  List: (p) => <S {...p}><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></S>,
  In: (p) => <S size={12} {...p}><path d="M17 7 7 17" /><path d="M17 17H7V7" /></S>,
  Out: (p) => <S size={12} {...p}><path d="M7 17 17 7" /><path d="M7 7h10v10" /></S>,
};

/* ---------- helpers ---------- */
/* admin report: show full numbers (no masking) */
const maskNumber = (n) => (n ? n.toString() : "-");
const isRealNumber = (n) => !!n && /\d{6,}/.test(String(n));
const normTime = (s) =>
  s ? String(s).replace(/^(\d{4}-\d{2}-\d{2})-(\d{2}:\d{2}:\d{2})$/, "$1 $2") : "";
const parseTime = (s) => {
  const t = Date.parse(normTime(s).replace(" ", "T"));
  return isNaN(t) ? null : t;
};
const fmtNum = (n) => Number(n || 0).toLocaleString("en-IN");
const fmtDur = (v) => {
  const n = parseInt(v, 10);
  if (isNaN(n)) return "-";
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = String(n % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
};
const fmtClock = (sec) => {
  if (!isFinite(sec) || sec < 0) return "0:00";
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
};
const ANSWERED = new Set(["answered", "answer", "completed", "success"]);
const statusTone = (s) => {
  if (ANSWERED.has(s)) return "ok";
  if (["missed", "no answer", "no-answer", "noanswer"].includes(s)) return "warn";
  if (["failed", "busy", "cancel", "canceled", "cancelled", "rejected", "chanunavail", "congestion"].includes(s)) return "danger";
  if (!s || s === "-") return "muted";
  return "info";
};
/* the customer's number: inbound -> caller, outbound/auto -> called number */
const customerNumber = (c) => (c._dir === "inbound" ? c.call_from : c.call_to);

/* SweetAlert that follows the CRM theme (light / dark) */
const isDarkUI = () => {
  let node = document.querySelector(".cr-card") || document.body;
  while (node && node.nodeType === 1) {
    const m = String(getComputedStyle(node).backgroundColor).match(/rgba?\(([^)]+)\)/);
    if (m) {
      const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      if (a > 0.5) return { bg: `rgb(${r}, ${g}, ${b})`, dark: 0.2126 * r + 0.7152 * g + 0.0722 * b < 128 };
    }
    node = node.parentElement;
  }
  return { bg: "#fff", dark: false };
};
const swalTheme = () => {
  const { bg, dark } = isDarkUI();
  return {
    background: dark ? bg : "#fff",
    color: dark ? "#e5e7eb" : "#1f2937",
    confirmButtonColor: "#4f46e5",
    cancelButtonColor: dark ? "#374151" : "#64748b",
  };
};
const swal = (opts) => Swal.fire({ ...swalTheme(), ...(typeof opts === "string" ? { title: opts } : opts) });
const toast = (title, icon = "success") =>
  swal({ toast: true, position: "top-end", showConfirmButton: false, timer: 2600, timerProgressBar: true, icon, title });

/* run async jobs with a concurrency limit */
const runPool = async (items, limit, fn) => {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const idx = next++;
      await fn(items[idx], idx);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
};

const EMPTY_FILTERS = { from: "", to: "", agent: "", direction: "", status: "" };

/* ---------- table row (memoized: only re-renders when its own props change) ---------- */
const CallRow = memo(function CallRow({ c, sr, playing, onPlay, onDownload, onCall, onBlock, onMessage }) {
  const cust = customerNumber(c);
  const canContact = isRealNumber(cust);
  return (
    <tr className={playing ? "is-playing" : ""}>
      <td className="cr-muted cr-num">{sr}</td>
      <td className="cr-mono">{c.did || "-"}</td>
      <td className="cr-mono">{maskNumber(c.call_from)}</td>
      <td className="cr-mono">{maskNumber(c.call_to)}</td>
      <td className="cr-time">
        <span>{c._date}</span>
        <small>{c._clock}</small>
      </td>
      <td className="cr-mono">{fmtDur(c.dur)}</td>
      <td>
        <span className={`cr-dir cr-dir--${c._dir || "none"}`}>
          {c._dir === "inbound" ? <Icon.In /> : c._dir === "outbound" ? <Icon.Out /> : null}
          {c.direction || "-"}
        </span>
      </td>
      <td>
        <span className={`cr-chip cr-chip--${statusTone(c._st)}`}>{c.status || "-"}</span>
      </td>
      <td className="cr-muted">{c.hangup || "-"}</td>
      <td className="cr-ellipsis" title={c.campaign_id}>{c.campaign_id || "-"}</td>
      <td className="cr-actions-cell">
        <div className="cr-actions">
          <button
            className={`cr-act cr-act--play ${playing ? "is-on" : ""}`}
            title={c.record_url ? (playing ? "Pause recording" : "Play recording") : "No recording"}
            disabled={!c.record_url}
            onClick={() => onPlay(c)}
          >
            {playing ? <Icon.Pause size={13} /> : <Icon.Play size={13} />}
          </button>
          <button className="cr-act" title="Download recording" disabled={!c.record_url} onClick={() => onDownload(c)}>
            <Icon.Download size={14} />
          </button>
          <span className="cr-act-sep" />
          <button className="cr-act cr-act--call" title={`Call ${maskNumber(cust)}`} disabled={!canContact} onClick={() => onCall(cust)}>
            <Icon.Phone size={14} />
          </button>
          <button className="cr-act cr-act--wa" title="Send WhatsApp" disabled={!canContact} onClick={() => onMessage("whatsapp", c)}>
            <Icon.WhatsApp size={15} />
          </button>
          <button className="cr-act cr-act--sms" title="Send SMS" disabled={!canContact} onClick={() => onMessage("sms", c)}>
            <Icon.Sms size={14} />
          </button>
          <button className="cr-act cr-act--block" title={`Block ${maskNumber(cust)}`} disabled={!canContact} onClick={() => onBlock(cust)}>
            <Icon.Block size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
});

/* ---------- floating mini player (only this re-renders while audio plays) ---------- */
const MiniPlayer = ({ audio, row, playing, onToggle, onClose, onDownload }) => {
  const [t, setT] = useState(0);
  const [d, setD] = useState(0);
  useEffect(() => {
    const onTime = () => setT(audio.currentTime);
    const onMeta = () => setD(audio.duration);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("durationchange", onMeta);
    setT(audio.currentTime || 0);
    setD(audio.duration || 0);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("durationchange", onMeta);
    };
  }, [audio, row]);
  const pct = d ? (t / d) * 100 : 0;
  return (
    <div className="cr-player">
      <button className="cr-player__btn" onClick={onToggle} title={playing ? "Pause" : "Play"}>
        {playing ? <Icon.Pause size={14} /> : <Icon.Play size={14} />}
      </button>
      <div className="cr-player__info">
        <b>{maskNumber(customerNumber(row))}</b>
        <span>{row.status || "-"} · {row._date} {row._clock}</span>
      </div>
      <span className="cr-player__time">{fmtClock(t)}</span>
      <input
        className="cr-player__seek"
        type="range"
        min="0"
        max={d || 0}
        step="0.1"
        value={Math.min(t, d || 0)}
        style={{ "--pct": `${pct}%` }}
        onChange={(e) => {
          audio.currentTime = Number(e.target.value);
          setT(audio.currentTime);
        }}
      />
      <span className="cr-player__time">{fmtClock(d)}</span>
      <select
        className="cr-player__speed"
        defaultValue="1"
        onChange={(e) => (audio.playbackRate = Number(e.target.value))}
        title="Speed"
      >
        {[0.75, 1, 1.25, 1.5, 2].map((s) => <option key={s} value={s}>{s}x</option>)}
      </select>
      <button className="cr-icon-btn" onClick={() => onDownload(row)} title="Download"><Icon.Download size={15} /></button>
      <button className="cr-icon-btn" onClick={onClose} title="Close"><Icon.Close size={15} /></button>
    </div>
  );
};

/* ---------- WhatsApp / SMS modal ---------- */
const templateCache = {};
const normTemplate = (t, i) => ({
  id: t.id ?? t.template_id ?? t.templateId ?? i,
  name: t.name ?? t.template_name ?? t.title ?? `Template ${i + 1}`,
  body: t.body ?? t.message ?? t.content ?? t.template ?? t.text ?? "",
});

const MessageModal = ({ type, row, onClose }) => {
  const isWa = type === "whatsapp";
  const number = customerNumber(row);
  const [templates, setTemplates] = useState(templateCache[type] || []);
  const [loadingT, setLoadingT] = useState(!templateCache[type]);
  const [templateId, setTemplateId] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (templateCache[type]) return;
    axios
      .get(`${API}${isWa ? CONFIG.whatsappTemplatesApi : CONFIG.smsTemplatesApi}`, { headers: authHeader() })
      .then((res) => {
        const list = (Array.isArray(res.data) ? res.data : res.data?.data || []).map(normTemplate);
        templateCache[type] = list;
        setTemplates(list);
      })
      .catch((err) => {
        console.error("Template load failed:", err);
        setTemplates([]);
      })
      .finally(() => setLoadingT(false));
  }, [type, isWa]);

  const pickTemplate = (id) => {
    setTemplateId(id);
    const t = templates.find((x) => String(x.id) === String(id));
    if (t) setMessage(t.body);
  };

  const send = async () => {
    if (!message.trim() && !templateId) return toast("Pick a template or type a message", "warning");
    setSending(true);
    try {
      await axios.post(
        `${API}${isWa ? CONFIG.whatsappSendApi : CONFIG.smsSendApi}`,
        {
          number,
          message,
          template_id: templateId || null,
          call_id: row.id ?? null,
          campaign_id: row.campaign_id ?? null,
          agent_id: row.did ?? null,
        },
        { headers: authHeader() }
      );
      toast(`${isWa ? "WhatsApp" : "SMS"} sent to ${maskNumber(number)}`);
      onClose();
    } catch (err) {
      console.error("Send failed:", err);
      toast(err.response?.data?.message || "Sending failed", "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="cr-backdrop" onMouseDown={onClose}>
      <div className="cr-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cr-modal__head">
          <div className="cr-modal__title">
            <span className={`cr-modal__badge ${isWa ? "is-wa" : "is-sms"}`}>
              {isWa ? <Icon.WhatsApp size={18} /> : <Icon.Sms size={18} />}
            </span>
            <div>
              <h3>Send {isWa ? "WhatsApp" : "SMS"}</h3>
              <p>To <b className="cr-mono">{maskNumber(number)}</b>{row.campaign_id ? ` · ${row.campaign_id}` : ""}</p>
            </div>
          </div>
          <button className="cr-icon-btn" onClick={onClose}><Icon.Close /></button>
        </div>
        <div className="cr-modal__body">
          <label className="cr-field">
            <span>Template</span>
            <select value={templateId} onChange={(e) => pickTemplate(e.target.value)} disabled={loadingT}>
              <option value="">{loadingT ? "Loading templates…" : templates.length ? "Select a template" : "No templates found"}</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className="cr-field">
            <span>Message <small>{message.length} chars{!isWa ? ` · ${Math.max(1, Math.ceil(message.length / 160))} SMS` : ""}</small></span>
            <textarea
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Select a template or type a message"
              readOnly={isWa && !!templateId}
            />
          </label>
          {isWa && templateId && <p className="cr-hint">WhatsApp template text can't be edited; it is sent as approved.</p>}
        </div>
        <div className="cr-modal__foot">
          <button className="cr-btn cr-btn--ghost" onClick={onClose}>Cancel</button>
          <button className={`cr-btn ${isWa ? "cr-btn--wa" : "cr-btn--primary"}`} onClick={send} disabled={sending}>
            {sending ? "Sending…" : `Send ${isWa ? "WhatsApp" : "SMS"}`}
          </button>
        </div>
      </div>
    </div>
  );
};

/* =====================================================================
 * Page
 * ===================================================================== */
const CallReportList = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [agents, setAgents] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS); // applied
  const [draft, setDraft] = useState(EMPTY_FILTERS); // in modal
  const [quick, setQuick] = useState(""); // "" | answered | inbound | outbound
  const [filterOpen, setFilterOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [msg, setMsg] = useState(null); // { type, row }
  const [nowPlaying, setNowPlaying] = useState(null);
  const [playingKey, setPlayingKey] = useState(null);
  const exportRef = useRef(null);
  const audioRef = useRef(null);
  if (!audioRef.current && typeof Audio !== "undefined") {
    audioRef.current = new Audio();
    audioRef.current.preload = "none";
  }

  /* click outside export menu */
  useEffect(() => {
    const onClick = (e) => {
      if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  /* shared audio element events */
  useEffect(() => {
    const a = audioRef.current;
    const onPlay = () => setPlayingKey(a.dataset.key || null);
    const onStop = () => setPlayingKey(null);
    const onErr = () => {
      setPlayingKey(null);
      if (a.src) toast("Recording could not be played", "error");
    };
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onStop);
    a.addEventListener("ended", onStop);
    a.addEventListener("error", onErr);
    return () => {
      a.pause();
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onStop);
      a.removeEventListener("ended", onStop);
      a.removeEventListener("error", onErr);
    };
  }, []);

  /* fetch calls */
  const fetchCalls = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}${CONFIG.callsApi}`, { headers: authHeader() });
      setData(Array.isArray(res.data) ? res.data : res.data?.data || []);
      setError("");
    } catch (err) {
      console.error("Error fetching calls:", err);
      setError("An error occurred while fetching call reports.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  /* fetch agents */
  useEffect(() => {
    axios
      .get(`${API}${CONFIG.agentsApi}`, { headers: authHeader() })
      .then((res) => setAgents(res.data || []))
      .catch((err) => console.error("Error fetching agents:", err));
  }, []);

  /* debounce search */
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  /* reset to first page whenever the result set changes */
  useEffect(() => {
    setPage(0);
  }, [search, filters, quick, pageSize]);

  /* 1) prepare rows ONCE per fetch: parsed time, lower-cased fields, search string */
  const rows = useMemo(
    () =>
      data.map((c, i) => {
        const ts = parseTime(c.start_time);
        const nt = normTime(c.start_time);
        return {
          ...c,
          _key: String(c.id ?? `${i}-${c.start_time}`),
          _ts: ts,
          _date: nt ? nt.slice(0, 10) : "-",
          _clock: nt ? nt.slice(11, 19) : "",
          _dir: (c.direction || "").toLowerCase(),
          _st: (c.status || "").toLowerCase(),
          _q: `${c.did ?? ""} ${c.call_from ?? ""} ${c.call_to ?? ""} ${c.status ?? ""} ${c.direction ?? ""} ${c.campaign_id ?? ""} ${c.hangup ?? ""} ${nt}`.toLowerCase(),
        };
      }),
    [data]
  );

  /* 2) search + filter in ONE pass, stats in the same pass */
  const { base, stats } = useMemo(() => {
    const from = filters.from ? new Date(filters.from + "T00:00:00").getTime() : null;
    const to = filters.to ? new Date(filters.to + "T23:59:59").getTime() : null;
    const agent = filters.agent ? String(filters.agent) : "";
    const dir = filters.direction;
    const st = filters.status;
    const out = [];
    const s = { total: 0, answered: 0, inbound: 0, outbound: 0 };
    for (let i = 0; i < rows.length; i++) {
      const c = rows[i];
      if ((from || to) && (c._ts == null || (from && c._ts < from) || (to && c._ts > to))) continue;
      if (agent && String(c.did) !== agent) continue;
      if (dir && c._dir !== dir) continue;
      if (st && c._st !== st) continue;
      if (search && !c._q.includes(search)) continue;
      out.push(c);
      s.total++;
      if (ANSWERED.has(c._st)) s.answered++;
      if (c._dir === "inbound") s.inbound++;
      else if (c._dir === "outbound") s.outbound++;
    }
    return { base: out, stats: s };
  }, [rows, filters, search]);

  /* 3) quick filter from stat cards */
  const filtered = useMemo(() => {
    if (!quick) return base;
    if (quick === "answered") return base.filter((c) => ANSWERED.has(c._st));
    return base.filter((c) => c._dir === quick);
  }, [base, quick]);

  /* status / direction options for the filter modal */
  const options = useMemo(() => {
    const st = new Set();
    const dr = new Set();
    rows.forEach((c) => {
      if (c._st && c._st !== "-") st.add(c._st);
      if (c._dir && c._dir !== "-") dr.add(c._dir);
    });
    return { statuses: [...st].sort(), directions: [...dr].sort() };
  }, [rows]);

  /* pagination: only the current page is rendered */
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const startIdx = safePage * pageSize;
  const currentRows = useMemo(
    () => filtered.slice(startIdx, startIdx + pageSize),
    [filtered, startIdx, pageSize]
  );

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  /* ---------- row actions (stable references -> memoized rows don't re-render) ---------- */
  const handlePlay = useCallback((c) => {
    const a = audioRef.current;
    if (!c.record_url) return;
    if (a.dataset.key === c._key) {
      if (a.paused) a.play().catch(() => {});
      else a.pause();
      return;
    }
    a.pause();
    a.dataset.key = c._key;
    a.src = c.record_url;
    a.playbackRate = 1;
    setNowPlaying(c);
    a.play().catch((e) => console.error("Play failed:", e));
  }, []);

  const closePlayer = useCallback(() => {
    const a = audioRef.current;
    a.pause();
    a.removeAttribute("src");
    a.load();
    a.dataset.key = "";
    setNowPlaying(null);
  }, []);

  const handleDownload = useCallback(async (c) => {
    if (!c.record_url) return;
    const name = `recording_${c.did || "agent"}_${(c._date || "").replace(/-/g, "")}_${(c._clock || "").replace(/:/g, "")}.mp3`;
    try {
      const res = await fetch(c.record_url, { headers: authHeader() });
      if (!res.ok) throw new Error(res.status);
      saveAs(await res.blob(), name);
    } catch (e) {
      // CORS / auth issue - let the browser handle it directly
      window.open(c.record_url, "_blank", "noopener");
    }
  }, []);

  const handleCall = useCallback((num) => {
    if (!num) return;
    window.open(`tel:${num}`, "_self");
  }, []);

  const handleBlock = useCallback(async (num) => {
    if (!num) return;
    const r = await swal({
      icon: "warning",
      title: `Block ${maskNumber(num)}?`,
      text: "Calls from and to this number will be blocked.",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Block",
    });
    if (!r.isConfirmed) return;
    try {
      await axios.post(`${API}${CONFIG.blockApi}`, { number: num }, { headers: authHeader() });
      toast(`${maskNumber(num)} blocked`);
    } catch (err) {
      console.error("Block failed:", err);
      toast(err.response?.data?.message || "Block failed", "error");
    }
  }, []);

  const handleMessage = useCallback((type, row) => setMsg({ type, row }), []);

  /* ---------- exports ---------- */
  const rowsToExport = (list) =>
    list.map((item) => ({
      "Admin Name": item.admin,
      DID: item.did,
      "Call From": item.call_from,
      "Call To": item.call_to,
      "Campaign ID": item.campaign_id,
      "Start Time": item.start_time,
      "End Time": item.end_time,
      Duration: item.dur,
      Direction: item.direction,
      Status: item.status,
      Hangup: item.hangup,
    }));

  const exportData = (list, base) => {
    if (!list.length) return toast("No data available to download.", "info");
    const out = rowsToExport(list);
    if (out.length > 50000) {
      // CSV is far lighter than XLSX for very large exports
      const head = Object.keys(out[0]);
      const esc = (v) => {
        const s = v == null ? "" : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const csv = "﻿" + [head.join(","), ...out.map((r) => head.map((h) => esc(r[h])).join(","))].join("\n");
      saveAs(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${base}.csv`);
    } else {
      const ws = XLSX.utils.json_to_sheet(out);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Calls");
      const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      saveAs(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${base}.xlsx`);
    }
    toast(`${fmtNum(list.length)} records exported.`);
  };

  const downloadRecordings = async (all = false) => {
    let recs = (all ? filtered : currentRows).filter((r) => r.record_url);
    if (!recs.length) return swal("No recordings to download.");
    if (recs.length > MAX_ZIP_RECORDINGS) {
      const r = await swal({
        icon: "info",
        title: `${fmtNum(recs.length)} recordings found`,
        text: `Only the first ${MAX_ZIP_RECORDINGS} will be zipped. Use the date / agent filter to narrow down.`,
        showCancelButton: true,
        confirmButtonText: `Download ${MAX_ZIP_RECORDINGS}`,
      });
      if (!r.isConfirmed) return;
      recs = recs.slice(0, MAX_ZIP_RECORDINGS);
    }
    const zip = new JSZip();
    const folder = zip.folder("recordings");
    let done = 0;
    let failed = 0;
    swal({ title: "Preparing ZIP…", html: `0 / ${recs.length}`, allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    await runPool(recs, ZIP_CONCURRENCY, async (item, i) => {
      try {
        const res = await fetch(item.record_url, { headers: authHeader() });
        if (!res.ok) throw new Error(res.status);
        folder.file(`${i + 1}_${item.did || "agent"}_${(item._date || "").replace(/-/g, "")}_${(item._clock || "").replace(/:/g, "")}.mp3`, await res.blob());
      } catch (e) {
        failed++;
      }
      done++;
      const el = Swal.getHtmlContainer();
      if (el) el.textContent = `${done} / ${recs.length}`;
    });
    const content = await zip.generateAsync({ type: "blob" });
    Swal.close();
    saveAs(content, `recordings_${all ? "all" : `page_${safePage + 1}`}.zip`);
    toast(failed ? `ZIP ready (${failed} failed)` : "Recordings ZIP ready.", failed ? "warning" : "success");
  };

  /* ---------- filter modal ---------- */
  const openFilter = () => {
    setDraft(filters);
    setFilterOpen(true);
  };
  const applyFilter = () => {
    setFilters(draft);
    setFilterOpen(false);
  };
  const clearFilter = (key) => setFilters((f) => ({ ...f, [key]: "" }));
  const agentName = (id) => agents.find((a) => String(a.user_id) === String(id))?.full_name || id;

  const pctOf = (n) => (stats.total ? Math.round((n / stats.total) * 100) : 0);
  const statCards = [
    { key: "", label: "Total calls", value: stats.total, tone: "primary", icon: Icon.Phone, sub: quick ? "click to show all" : "matching your filters" },
    { key: "answered", label: "Answered", value: stats.answered, tone: "good", icon: Icon.Check, sub: `${pctOf(stats.answered)}% answer rate`, bar: pctOf(stats.answered) },
    { key: "inbound", label: "Inbound", value: stats.inbound, tone: "info", icon: Icon.In, sub: `${pctOf(stats.inbound)}% of calls` },
    { key: "outbound", label: "Outbound", value: stats.outbound, tone: "amber", icon: Icon.Out, sub: `${pctOf(stats.outbound)}% of calls` },
  ];

  /* ---------- render ---------- */
  return (
    <div className={`cr-page ${nowPlaying ? "has-player" : ""}`}>
      {/* Header */}
      <div className="cr-header">
        <div className="cr-header__text">
          <h1 className="cr-title">Call Reports</h1>
          <p className="cr-subtitle">Track and export inbound &amp; outbound call activity.</p>
        </div>
        <div className="cr-header__actions">
          <div className="cr-search">
            <span className="cr-search__icon"><Icon.Search /></span>
            <input
              type="text"
              placeholder="Search number, agent, status…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            {searchInput && (
              <button className="cr-search__clear" onClick={() => setSearchInput("")} aria-label="Clear"><Icon.Close size={14} /></button>
            )}
          </div>
          <button className="cr-icon-btn cr-icon-btn--lg" onClick={fetchCalls} title="Refresh" disabled={loading}>
            <Icon.Refresh className={loading ? "cr-spin" : ""} />
          </button>
          <button className="cr-btn cr-btn--ghost" onClick={openFilter}>
            <Icon.Filter /> Filter
            {activeFilterCount > 0 && <span className="cr-count">{activeFilterCount}</span>}
          </button>
          <div className="cr-export" ref={exportRef}>
            <button className="cr-btn cr-btn--primary" onClick={() => setExportOpen((v) => !v)}>
              <Icon.Download /> Export
            </button>
            {exportOpen && (
              <div className="cr-menu">
                <button onClick={() => { exportData(filtered, "call_data_all"); setExportOpen(false); }}>
                  <Icon.Grid /> Export all ({fmtNum(filtered.length)})
                </button>
                <button onClick={() => { exportData(currentRows, `call_data_page_${safePage + 1}`); setExportOpen(false); }}>
                  <Icon.Download /> Export current page
                </button>
                <div className="cr-menu__sep" />
                <button onClick={() => { downloadRecordings(false); setExportOpen(false); }}>
                  <Icon.Audio /> Page recordings
                </button>
                <button onClick={() => { downloadRecordings(true); setExportOpen(false); }}>
                  <Icon.Audio /> All recordings (max {MAX_ZIP_RECORDINGS})
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats (click = quick filter) */}
      <div className="cr-stats">
        {statCards.map((s) => (
          <button
            key={s.label}
            type="button"
            className={`cr-stat cr-tone--${s.tone} ${quick === s.key ? "is-active" : ""}`}
            onClick={() => setQuick(s.key)}
            title={s.key ? `Show only ${s.label.toLowerCase()} calls` : "Show all calls"}
          >
            <span className="cr-stat__top">
              <span className="cr-stat__label">{s.label}</span>
              <span className="cr-stat__icon"><s.icon size={16} /></span>
            </span>
            <span className="cr-stat__value">
              {loading ? <span className="cr-skel cr-skel--num" /> : fmtNum(s.value)}
            </span>
            <span className="cr-stat__sub">
              {s.bar !== undefined && !loading && <span className="cr-stat__meter"><i style={{ width: `${s.bar}%` }} /></span>}
              <span>{s.sub}</span>
            </span>
          </button>
        ))}
      </div>

      {/* Active filters */}
      {(activeFilterCount > 0 || quick) && (
        <div className="cr-active-filters">
          {quick && <span className="cr-tag">{quick}<button onClick={() => setQuick("")}><Icon.Close size={12} /></button></span>}
          {filters.from && <span className="cr-tag">From {filters.from}<button onClick={() => clearFilter("from")}><Icon.Close size={12} /></button></span>}
          {filters.to && <span className="cr-tag">To {filters.to}<button onClick={() => clearFilter("to")}><Icon.Close size={12} /></button></span>}
          {filters.agent && <span className="cr-tag">Agent {agentName(filters.agent)}<button onClick={() => clearFilter("agent")}><Icon.Close size={12} /></button></span>}
          {filters.direction && <span className="cr-tag">{filters.direction}<button onClick={() => clearFilter("direction")}><Icon.Close size={12} /></button></span>}
          {filters.status && <span className="cr-tag">{filters.status}<button onClick={() => clearFilter("status")}><Icon.Close size={12} /></button></span>}
          <button className="cr-link" onClick={() => { setFilters(EMPTY_FILTERS); setQuick(""); }}>Clear all</button>
        </div>
      )}

      {/* Table */}
      <div className="cr-card">
        <div className="cr-card__head">
          <div className="cr-card__title">
            <span className="cr-card__icon"><Icon.List size={15} /></span>
            <h3>Call records</h3>
            <span className="cr-badge">{fmtNum(filtered.length)}</span>
          </div>
          {nowPlaying && (
            <span className="cr-card__note"><Icon.Audio size={13} /> Playing {maskNumber(customerNumber(nowPlaying))}</span>
          )}
        </div>
        {error ? (
          <div className="cr-empty is-error">
            <span className="cr-empty__icon"><Icon.Close size={20} /></span>
            <strong>Could not load call reports</strong>
            <p>{error}</p>
            <button className="cr-btn cr-btn--ghost" onClick={fetchCalls}><Icon.Refresh /> Retry</button>
          </div>
        ) : (
          <>
            <div className="cr-table-wrap">
              <table className="cr-table">
                <thead>
                  <tr>
                    <th className="cr-num">#</th>
                    <th>Agent ID</th>
                    <th>Call From</th>
                    <th>Call To</th>
                    <th>Start Time</th>
                    <th>Duration</th>
                    <th>Direction</th>
                    <th>Status</th>
                    <th>Hangup</th>
                    <th>Campaign</th>
                    <th className="cr-actions-cell">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading &&
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={`sk${i}`} className="cr-skel-row">
                        {Array.from({ length: 11 }).map((__, j) => (
                          <td key={j}><span className="cr-skel" /></td>
                        ))}
                      </tr>
                    ))}
                  {!loading && currentRows.length === 0 && (
                    <tr>
                      <td colSpan={11}>
                        <div className="cr-empty">
                          <span className="cr-empty__icon"><Icon.Search size={20} /></span>
                          <strong>{data.length ? "No calls match" : "No calls yet"}</strong>
                          <p>{data.length ? "Try a different search or clear the filters." : "Calls will show up here once agents start dialing."}</p>
                          {data.length > 0 && (activeFilterCount > 0 || quick || searchInput) && (
                            <button className="cr-btn cr-btn--ghost" onClick={() => { setFilters(EMPTY_FILTERS); setQuick(""); setSearchInput(""); }}>
                              Clear filters
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  {!loading &&
                    currentRows.map((c, i) => (
                      <CallRow
                        key={c._key}
                        c={c}
                        sr={startIdx + i + 1}
                        playing={playingKey === c._key}
                        onPlay={handlePlay}
                        onDownload={handleDownload}
                        onCall={handleCall}
                        onBlock={handleBlock}
                        onMessage={handleMessage}
                      />
                    ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="cr-pagination">
              <div className="cr-page-size">
                <span>Rows per page</span>
                <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                  {[25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="cr-muted">
                {filtered.length
                  ? `Showing ${fmtNum(startIdx + 1)}–${fmtNum(Math.min(startIdx + pageSize, filtered.length))} of ${fmtNum(filtered.length)}`
                  : "0 records"}
              </div>
              <div className="cr-page-nav">
                <button disabled={safePage === 0} onClick={() => setPage(0)} title="First">«</button>
                <button disabled={safePage === 0} onClick={() => setPage(safePage - 1)} title="Previous">
                  <span style={{ transform: "rotate(180deg)", display: "inline-flex" }}><Icon.Chevron size={14} /></span>
                </button>
                <span className="cr-page-jump">
                  Page
                  <input
                    key={safePage}
                    type="number"
                    min="1"
                    max={totalPages}
                    defaultValue={safePage + 1}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const n = Math.min(totalPages, Math.max(1, Number(e.target.value) || 1));
                        setPage(n - 1);
                      }
                    }}
                    onBlur={(e) => {
                      const n = Math.min(totalPages, Math.max(1, Number(e.target.value) || 1));
                      if (n - 1 !== safePage) setPage(n - 1);
                    }}
                  />
                  / {fmtNum(totalPages)}
                </span>
                <button disabled={safePage + 1 >= totalPages} onClick={() => setPage(safePage + 1)} title="Next"><Icon.Chevron size={14} /></button>
                <button disabled={safePage + 1 >= totalPages} onClick={() => setPage(totalPages - 1)} title="Last">»</button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Mini player */}
      {nowPlaying && (
        <MiniPlayer
          audio={audioRef.current}
          row={nowPlaying}
          playing={playingKey === nowPlaying._key}
          onToggle={() => handlePlay(nowPlaying)}
          onClose={closePlayer}
          onDownload={handleDownload}
        />
      )}

      {/* WhatsApp / SMS */}
      {msg && <MessageModal type={msg.type} row={msg.row} onClose={() => setMsg(null)} />}

      {/* Filter Modal */}
      {filterOpen && (
        <div className="cr-backdrop" onMouseDown={() => setFilterOpen(false)}>
          <div className="cr-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="cr-modal__head">
              <div>
                <h3>Filter call records</h3>
                <p>Narrow down by date, agent, direction or status.</p>
              </div>
              <button className="cr-icon-btn" onClick={() => setFilterOpen(false)}><Icon.Close /></button>
            </div>
            <div className="cr-modal__body cr-grid-2">
              <label className="cr-field">
                <span>From date</span>
                <input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
              </label>
              <label className="cr-field">
                <span>To date</span>
                <input type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
              </label>
              <label className="cr-field cr-span-2">
                <span>Agent</span>
                <select value={draft.agent} onChange={(e) => setDraft({ ...draft, agent: e.target.value })}>
                  <option value="">All agents</option>
                  {agents.map((a) => <option key={a.user_id} value={a.user_id}>{a.full_name || a.user_id}</option>)}
                </select>
              </label>
              <label className="cr-field">
                <span>Direction</span>
                <select value={draft.direction} onChange={(e) => setDraft({ ...draft, direction: e.target.value })}>
                  <option value="">All</option>
                  {options.directions.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
              <label className="cr-field">
                <span>Status</span>
                <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                  <option value="">All</option>
                  {options.statuses.map((s) => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                </select>
              </label>
            </div>
            <div className="cr-modal__foot">
              <button className="cr-btn cr-btn--ghost" onClick={() => setDraft(EMPTY_FILTERS)}>Reset</button>
              <button className="cr-btn cr-btn--primary" onClick={applyFilter}>Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CallReportList;