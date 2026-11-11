import { useEffect, useRef, useState } from "react";
import {
  X, FileAudio, Settings2, CalendarClock, PhoneIncoming, PhoneOutgoing, Music2, Clock, CalendarOff,
  Timer, Shuffle, FileText, Activity, Gauge, Megaphone, Play, Pause, Pencil, Copy, Download,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Labels & help text                                                 */
/* ------------------------------------------------------------------ */
const CAMPAIGN_TYPE_LABELS = { both: "Inbound + Outbound", inbound: "Inbound", outbound: "Outbound" };

const CAMPAIGN_TYPE_HELP = {
  both: "Receives incoming calls and also makes outgoing calls.",
  inbound: "Only receives incoming calls from customers.",
  outbound: "Only makes outgoing calls to customers.",
};

/* Explains the selected "Incoming Call Ring Type" in plain words */
const getRingTypeHelp = (value) => {
  const v = String(value || "").toLowerCase();
  if (v.includes("random")) return "A call goes to any free agent, picked at random.";
  if (v.includes("rank") || v.includes("priority")) return "A call goes to the free agent with the highest priority rank first.";
  if (v.includes("long") || v.includes("wait")) return "A call goes to the agent who has been waiting the longest.";
  if (v.includes("ring") && v.includes("all")) return "Rings every free agent at once. The first to answer gets the call.";
  return "Decides which free agent gets an incoming call.";
};

const FILE_FIELDS = [
  { label: "Welcome IVR", name: "welcome_ivr", help: "Plays first when a call connects." },
  { label: "After Office IVR", name: "after_office_ivr", help: "Plays outside the call time." },
  { label: "Music On Hold", name: "music_on_hold", help: "Plays while the caller waits in the queue." },
  { label: "Ring Tone Music", name: "ring_tone_music", help: "Plays while the call rings on an agent." },
  { label: "No Agent IVR", name: "no_agent_ivr", help: "Plays when no agent is free." },
  { label: "Week Off IVR", name: "week_off_ivr", help: "Plays on the week-off day." },
];

/* ------------------------------------------------------------------ */
/*  Small helpers                                                      */
/* ------------------------------------------------------------------ */
const isEmpty = (v) => v === null || v === undefined || String(v).trim() === "";

const toList = (v) => (isEmpty(v) ? [] : String(v).split(/[,\n;]+/).map((s) => s.trim()).filter(Boolean));

const ON_VALUES = ["active", "enable", "enabled", "yes", "on", "1", "y", "true"];
const OFF_VALUES = ["inactive", "disable", "disabled", "no", "off", "0", "n", "false"];
const statusTone = (v) => {
  const s = String(v ?? "").trim().toLowerCase();
  if (ON_VALUES.includes(s)) return "ok";
  if (OFF_VALUES.includes(s)) return "off";
  return "neutral";
};
const statusLabel = (v) => {
  const tone = statusTone(v);
  if (tone === "ok") return "Active";
  if (tone === "off") return "Inactive";
  return String(v);
};

const withSeconds = (v) => (isEmpty(v) ? v : /^\d+$/.test(String(v).trim()) ? `${v} sec` : v);

const audioUrl = (path) => {
  if (isEmpty(path)) return null;
  const p = String(path).trim();
  if (/^https?:\/\//i.test(p)) return p;
  return `https://${window.location.hostname}:4000/${p.replace(/^\/+/, "")}`;
};
const fileName = (path) => String(path || "").split(/[\\/]/).pop();
const fmtTime = (s) => {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

const copy = async (text) => {
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
};

/* ------------------------------------------------------------------ */
/*  Building blocks                                                    */
/* ------------------------------------------------------------------ */
const Section = ({ icon: Icon, title, subtitle, children, grid = true }) => (
  <section className="cpm-section">
    <header className="cpm-section__head">
      <span className="cpm-section__icon"><Icon size={15} /></span>
      <div>
        <h4>{title}</h4>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </header>
    {grid ? <div className="cpv-grid">{children}</div> : children}
  </section>
);

const Field = ({ icon: Icon, label, help, full, children }) => (
  <div className={`cpv-field${full ? " is-full" : ""}`}>
    <div className="cpv-field__label">
      {Icon && <Icon size={12} />}
      <span>{label}</span>
    </div>
    <div className="cpv-field__value">{children}</div>
    {help && <p className="cpv-field__help">{help}</p>}
  </div>
);

const Text = ({ value, empty = "Not set" }) =>
  isEmpty(value) ? <span className="cpv-empty">{empty}</span> : <span>{value}</span>;

const Pill = ({ value, empty = "Not set" }) =>
  isEmpty(value) ? (
    <span className="cpv-empty">{empty}</span>
  ) : (
    <span className={`cpv-pill is-${statusTone(value)}`}>
      <i />
      {statusLabel(value)}
    </span>
  );

const Chips = ({ value, empty }) => {
  const [copied, setCopied] = useState(null);
  const items = toList(value);
  if (!items.length) return <span className="cpv-empty">{empty}</span>;
  const onCopy = async (n) => {
    await copy(n);
    setCopied(n);
    setTimeout(() => setCopied((c) => (c === n ? null : c)), 1200);
  };
  return (
    <div className="cpv-chips">
      {items.map((n, i) => (
        <button type="button" className="cpv-chip" key={`${n}-${i}`} onClick={() => onCopy(n)} title="Copy number">
          {n}
          <span className="cpv-chip__ic">{copied === n ? "Copied" : <Copy size={11} />}</span>
        </button>
      ))}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */
const ViewDialog = ({ open, onClose, data, onEdit }) => {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(null); // field name
  const [progress, setProgress] = useState({ cur: 0, dur: 0 });
  const [audioError, setAudioError] = useState(null);

  // Stop the page behind the dialog from scrolling (important on phones)
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && onClose(null);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // One shared player for the whole dialog; stopped when it closes
  useEffect(() => {
    const a = new Audio();
    a.preload = "none";
    const onTime = () => setProgress({ cur: a.currentTime, dur: a.duration || 0 });
    const onEnd = () => { setPlaying(null); setProgress({ cur: 0, dur: 0 }); };
    const onErr = () => { setAudioError(a.dataset.key || null); setPlaying(null); };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onTime);
    a.addEventListener("ended", onEnd);
    a.addEventListener("error", onErr);
    audioRef.current = a;
    return () => {
      a.pause();
      a.removeAttribute("src");
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onTime);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("error", onErr);
    };
  }, []);

  useEffect(() => {
    if (!open && audioRef.current) {
      audioRef.current.pause();
      setPlaying(null);
    }
  }, [open]);

  if (!open || !data) return null;

  const toggle = (key, url) => {
    const a = audioRef.current;
    if (!a) return;
    setAudioError(null);
    if (playing === key) {
      a.pause();
      setPlaying(null);
      return;
    }
    if (a.dataset.key !== key) {
      a.src = url;
      a.dataset.key = key;
      setProgress({ cur: 0, dur: 0 });
    }
    a.play().then(() => setPlaying(key)).catch(() => setAudioError(key));
  };

  const seek = (e) => {
    const a = audioRef.current;
    if (!a || !a.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * a.duration;
  };

  const name = data.compaignname || data.campaignname;
  const type = String(data.campaign_dis || "").toLowerCase();
  const isInbound = ["both", "inbound"].includes(type);
  const isOutbound = ["both", "outbound"].includes(type);
  const uploadedCount = FILE_FIELDS.filter((f) => !isEmpty(data[f.name])).length;

  return (
    <div className="cpm-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose(null)}>
      <div className="cpm-modal cpm-modal--xl" role="dialog" aria-modal="true" aria-labelledby="cpv-title">
        {/* ================= Header ================= */}
        <div className="cpm-head">
          <div className="cpm-head__main">
            <span className="cpm-badge"><Megaphone size={17} /></span>
            <div className="cpm-head__text">
              <span className="cpm-eyebrow">Campaign details</span>
              <h3 id="cpv-title" title={name}>{name || "Untitled campaign"}</h3>
              <div className="cpv-tags">
                {!isEmpty(data.compaign_id) && <span className="cpv-tag cpv-tag--mono">#{data.compaign_id}</span>}
                {isInbound && <span className="cpv-tag"><PhoneIncoming size={12} /> Inbound</span>}
                {isOutbound && <span className="cpv-tag"><PhoneOutgoing size={12} /> Outbound</span>}
                {!isEmpty(data.status) && <Pill value={data.status} />}
              </div>
            </div>
          </div>
          <button type="button" className="cpm-x" onClick={() => onClose(null)} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* ================= Body ================= */}
        <div className="cpm-body">
          <Section icon={Settings2} title="General" subtitle="Basic information about this campaign and how it dials.">
            <Field label="Campaign name">
              <Text value={name} />
            </Field>
            <Field label="Campaign type" help={CAMPAIGN_TYPE_HELP[type]}>
              <Text value={CAMPAIGN_TYPE_LABELS[type] || data.campaign_dis} />
            </Field>
            <Field icon={Activity} label="Campaign status" help="Active campaigns are live and can handle calls.">
              <Pill value={data.status} />
            </Field>
            <Field icon={Activity} label="Auto dial" help="When active, the system dials numbers and connects answered calls to agents.">
              <Pill value={data.auto_dial_status} />
            </Field>
            <Field icon={Gauge} label="Auto dial level" help="Calls dialed at once for each free agent. Higher reaches more people but can drop more calls." full>
              <Text value={data.auto_dial_level} />
            </Field>
          </Section>

          {(isInbound || isOutbound) && (
            <Section icon={isInbound ? PhoneIncoming : PhoneOutgoing} title="Phone numbers" subtitle="Click a number to copy it.">
              {isInbound && (
                <Field icon={PhoneIncoming} label={`Inbound DID${toList(data.campaign_number).length === 1 ? "" : "s"}`} help="Numbers customers call to reach this campaign." full={!isOutbound}>
                  <Chips value={data.campaign_number} empty="No DIDs configured" />
                </Field>
              )}
              {isOutbound && (
                <Field icon={PhoneOutgoing} label={`Outbound CLI${toList(data.outbond_cli).length === 1 ? "" : "s"}`} help="The caller ID customers see when this campaign calls them." full={!isInbound}>
                  <Chips value={data.outbond_cli} empty="No CLIs configured" />
                </Field>
              )}
            </Section>
          )}

          <Section icon={CalendarClock} title="Schedule and call handling" subtitle="When the campaign works and how calls reach agents.">
            <Field icon={Clock} label="Call time" help="Calls are made and answered only in this window.">
              <Text value={data.local_call_time} />
            </Field>
            <Field icon={CalendarOff} label="Week off" help="Closed on these days; callers hear the Week Off IVR.">
              {toList(data.week_off).length ? (
                <div className="cpv-chips">
                  {toList(data.week_off).map((d) => <span key={d} className="cpv-tag">{d}</span>)}
                </div>
              ) : <Text value="" empty="No week off" />}
            </Field>
            <Field icon={Timer} label="Ring time" help="How long the customer's phone rings before the call counts as not answered.">
              <Text value={withSeconds(data.ring_time)} />
            </Field>
            <Field icon={FileText} label="Lead form" help="When active, a lead form opens for the agent on every call.">
              <Pill value={data.script_notes} />
            </Field>
            <Field icon={Shuffle} label="Incoming call ring type" help={isEmpty(data.type) ? null : getRingTypeHelp(data.type)} full>
              <Text value={data.type} />
            </Field>
          </Section>

          <Section
            icon={Music2}
            title="Audio"
            subtitle={`Prompts and music customers hear. ${uploadedCount} of ${FILE_FIELDS.length} uploaded.`}
            grid={false}
          >
            <div className="cpv-meter" aria-hidden="true">
              <i style={{ width: `${(uploadedCount / FILE_FIELDS.length) * 100}%` }} />
            </div>
            <ul className="cpm-audio-list">
              {FILE_FIELDS.map((field) => {
                const value = data[field.name];
                const url = audioUrl(value);
                const isPlaying = playing === field.name;
                const isLoaded = audioRef.current?.dataset.key === field.name;
                const pct = isLoaded && progress.dur ? (progress.cur / progress.dur) * 100 : 0;
                return (
                  <li key={field.name} className={`cpm-audio${url ? "" : " is-missing"}${isPlaying ? " is-playing" : ""}`}>
                    {url ? (
                      <button
                        type="button"
                        className="cpm-play"
                        onClick={() => toggle(field.name, url)}
                        aria-label={isPlaying ? `Pause ${field.label}` : `Play ${field.label}`}
                      >
                        {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                      </button>
                    ) : (
                      <span className="cpm-play is-off"><FileAudio size={14} /></span>
                    )}
                    <div className="cpm-audio__body">
                      <div className="cpm-audio__top">
                        <strong>{field.label}</strong>
                        <span className={`cpm-badge-sm ${url ? "is-ok" : ""}`}>{url ? "Uploaded" : "Not uploaded"}</span>
                      </div>
                      {url ? (
                        <>
                          <span className="cpm-audio__file" title={fileName(value)}>{fileName(value)}</span>
                          {isLoaded && (
                            <div className="cpm-progress">
                              <button type="button" className="cpm-progress__bar" onClick={seek} aria-label="Seek">
                                <i style={{ width: `${pct}%` }} />
                              </button>
                              <span>{fmtTime(progress.cur)} / {fmtTime(progress.dur)}</span>
                            </div>
                          )}
                          {audioError === field.name && <em className="cpm-error">Couldn't play this file.</em>}
                        </>
                      ) : (
                        <span className="cpm-audio__file">{field.help}</span>
                      )}
                    </div>
                    {url && (
                      <a className="cpm-icon" href={url} download target="_blank" rel="noreferrer" title="Download">
                        <Download size={14} />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>
        </div>

        {/* ================= Footer ================= */}
        <div className="cpm-foot">
          <span className="cpm-foot__spacer" />
          <button type="button" className="cp-btn cp-btn--ghost" onClick={() => onClose(null)}>Close</button>
          {onEdit && (
            <button type="button" className="cp-btn cp-btn--primary" onClick={() => onEdit(data)}>
              <Pencil size={15} /> Edit campaign
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ViewDialog;