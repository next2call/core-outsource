import React, { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./agentHome.css";
import { PopupContext } from "../../context/iframeContext";
import PopupIframe from "../../components/navbar/LiveCall";
import AgentTable from "../../components/table/AgentTable";

/* =====================================================================
   Agent dashboard: own performance, login time, time spent per state.
   ===================================================================== */

// Flip to false once GET /agent/dashboard is live on the backend.
const USE_DEMO_DATA = true;
const API_BASE = process.env.REACT_APP_API_URL || "";
const REFRESH_MS = 15000;

async function fetchAgentDashboard(range) {
  if (USE_DEMO_DATA) return makeDemoData();
  const token = localStorage.getItem("token"); // change if your token is stored elsewhere
  const res = await fetch(`${API_BASE}/agent/dashboard?range=${range}`, {
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* ---------- agent states (codes from agent_live_report.agent_status) ---------- */
const STATES = {
  oncall: { label: "On call", cls: "ag-st--oncall" },
  ready: { label: "Ready", cls: "ag-st--ready" },
  wrapup: { label: "Wrap-up", cls: "ag-st--wrapup" },
  break: { label: "Break / Paused", cls: "ag-st--break" },
};
const STATE_ORDER = ["oncall", "ready", "wrapup", "break"];
const STATUS_BY_CODE = {
  0: { key: "offline", label: "Not logged in" },
  1: { key: "ready", label: "Ready" },
  2: { key: "break", label: "Paused" },
  3: { key: "oncall", label: "On call" },
  4: { key: "wrapup", label: "Wrap-up" },
};

/* ---------- formatting ---------- */
const pad = (n) => String(n).padStart(2, "0");
const fmtDur = (sec) => {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h) return `${h}h ${pad(m)}m`;
  return `${m}m ${pad(sec % 60)}s`;
};
const fmtClock = (sec) => {
  sec = Math.max(0, Math.round(sec || 0));
  return `${pad(Math.floor(sec / 3600))}:${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}`;
};
const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }) : "-";
const fmtHour = (h) => `${h % 12 || 12}${h < 12 ? "a" : "p"}`;
const fmtDay = (d) => new Date(d).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit" });
const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : "-");

/* ---------- small helpers ---------- */
function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const ro = new ResizeObserver(([entry]) => {
      const next = Math.floor(entry.contentRect.width);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setW((prev) => (Math.abs(prev - next) > 1 ? next : prev));
      });
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, []);
  return [ref, w];
}

const useNow = (ms = 1000) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
};

// Bar with 4px rounded top, square at the baseline.
const barPath = (x, y, w, h, r = 4) => {
  if (h <= 0) return "";
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
};

const niceMax = (v) => {
  if (v <= 0) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};

/* ---------- tooltip (one per page) ---------- */
function Tooltip({ tip }) {
  if (!tip) return null;
  return (
    <div className="ag-tip" style={{ left: tip.x + 14, top: tip.y + 14 }}>
      {tip.title && <div className="ag-tip__title">{tip.title}</div>}
      {tip.rows.map(([k, v, cls]) => (
        <div key={k} className="ag-tip__row">
          {cls && <i className={`ag-dot ${cls}`} />}
          <span>{k}</span>
          <strong>{v}</strong>
        </div>
      ))}
    </div>
  );
}

/* ---------- KPI tile ---------- */
function Kpi({ title, value, sub, tone, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} className={`ag-kpi ${onClick ? "is-clickable" : ""}`} onClick={onClick}>
      <span className="ag-kpi__title">{title}</span>
      <span className="ag-kpi__value">{value}</span>
      <span className={`ag-kpi__sub ${tone ? `ag-tone--${tone}` : ""}`}>{sub}</span>
    </Tag>
  );
}

/* ---------- donut: time spent per state ---------- */
function TimeDonut({ split, onTip }) {
  const total = STATE_ORDER.reduce((s, k) => s + (split[k] || 0), 0);
  const R = 46;
  const C = 2 * Math.PI * R;
  const GAP = total ? 2 : 0;
  let offset = 0;

  return (
    <div className="ag-status">
      <div className="ag-donut">
        <svg viewBox="0 0 120 120" width="120" height="120" role="img" aria-label="Time spent by state">
          <circle cx="60" cy="60" r={R} fill="none" stroke="var(--ag-track)" strokeWidth="14" />
          {STATE_ORDER.map((k) => {
            const v = split[k] || 0;
            if (!v) return null;
            const len = (v / total) * C;
            const seg = (
              <circle
                key={k}
                className={STATES[k].cls}
                cx="60"
                cy="60"
                r={R}
                fill="none"
                stroke="var(--c)"
                strokeWidth="14"
                strokeDasharray={`${Math.max(len - GAP, 0.5)} ${C}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 60 60)"
                onMouseMove={(e) => onTip(e, STATES[k].label, [["Time", fmtDur(v)], ["Share", pct(v, total)]])}
                onMouseLeave={() => onTip(null)}
              />
            );
            offset += len;
            return seg;
          })}
        </svg>
        <div className="ag-donut__center">
          <strong>{fmtDur(total)}</strong>
          <span>logged</span>
        </div>
      </div>

      <ul className="ag-legend-list">
        {STATE_ORDER.map((k) => (
          <li key={k}>
            <i className={`ag-dot ${STATES[k].cls}`} />
            <span>{STATES[k].label}</span>
            <strong className="ag-mono">{fmtDur(split[k])}</strong>
            <span className="ag-muted ag-mono">{pct(split[k] || 0, total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- calls per hour (stacked answered + missed) ---------- */
function HourlyBars({ data, onTip }) {
  const [ref, w] = useWidth();
  const H = 170;
  const pad = { t: 8, r: 4, b: 20, l: 26 };
  const max = niceMax(Math.max(0, ...data.map((d) => d.answered + d.missed)));
  const iw = Math.max(0, w - pad.l - pad.r);
  const ih = H - pad.t - pad.b;
  const step = data.length ? iw / data.length : 0;
  const bw = Math.max(4, Math.min(22, step * 0.6));
  const y = (v) => pad.t + ih - (v / max) * ih;
  const ticks = [0, max / 2, max];

  return (
    <div ref={ref} className="ag-chart">
      {w > 0 && (
        <svg width={w} height={H} role="img" aria-label="Calls per hour">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} className="ag-grid" />
              <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" className="ag-axis">{t}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = pad.l + i * step + (step - bw) / 2;
            const ah = (d.answered / max) * ih;
            const mh = (d.missed / max) * ih;
            const base = pad.t + ih;
            const gap = ah && mh ? 2 : 0;
            return (
              <g
                key={d.hour}
                onMouseMove={(e) =>
                  onTip(e, `${fmtHour(d.hour)} - ${fmtHour(d.hour + 1)}`, [
                    ["Answered", d.answered, "ag-sw--ans"],
                    ["Missed", d.missed, "ag-sw--miss"],
                  ])
                }
                onMouseLeave={() => onTip(null)}
              >
                <rect x={pad.l + i * step} y={pad.t} width={step} height={ih} fill="transparent" />
                {mh > 0 && <path d={barPath(x, base - ah - mh, bw, mh - gap)} className="ag-fill--miss" />}
                {ah > 0 && <path d={mh > 0 ? `M${x},${base}V${base - ah}H${x + bw}V${base}Z` : barPath(x, base - ah, bw, ah)} className="ag-fill--ans" />}
                {(data.length <= 12 || i % 2 === 0) && (
                  <text x={x + bw / 2} y={H - 5} textAnchor="middle" className="ag-axis">{fmtHour(d.hour)}</text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/* ---------- today's state timeline ---------- */
function StateTimeline({ segments, startIso, nowMs, onTip }) {
  const [ref, w] = useWidth();
  if (!segments?.length || !startIso) return <p className="ag-empty">No activity logged yet today.</p>;

  const start = new Date(startIso).getTime();
  const end = Math.max(nowMs, start + 3600e3);
  const span = end - start;
  const x = (t) => ((t - start) / span) * w;

  const firstHour = new Date(start);
  firstHour.setMinutes(0, 0, 0);
  const hours = [];
  for (let t = firstHour.getTime() + 3600e3; t < end; t += 3600e3) hours.push(t);
  const every = Math.ceil(hours.length / Math.max(1, Math.floor(w / 60)));

  return (
    <div ref={ref} className="ag-timeline">
      {w > 0 && (
        <svg width={w} height={46} role="img" aria-label="State timeline for today">
          <rect x="0" y="4" width={w} height="22" rx="4" fill="var(--ag-track)" />
          {segments.map((s, i) => {
            const s0 = new Date(s.start).getTime();
            const s1 = s.end ? new Date(s.end).getTime() : nowMs;
            const sx = x(s0);
            const sw = Math.max(1, x(s1) - sx - 2);
            return (
              <rect
                key={i}
                className={STATES[s.state]?.cls}
                x={sx}
                y="4"
                width={sw}
                height="22"
                rx="3"
                fill="var(--c)"
                onMouseMove={(e) =>
                  onTip(e, STATES[s.state]?.label, [
                    ["From", fmtTime(s.start)],
                    ["To", s.end ? fmtTime(s.end) : "now"],
                    ["Duration", fmtDur((s1 - s0) / 1000)],
                  ])
                }
                onMouseLeave={() => onTip(null)}
              />
            );
          })}
          {hours.map((t, i) =>
            i % every === 0 ? (
              <g key={t}>
                <line x1={x(t)} x2={x(t)} y1="28" y2="32" className="ag-grid" />
                <text x={x(t)} y="43" textAnchor="middle" className="ag-axis">{fmtHour(new Date(t).getHours())}</text>
              </g>
            ) : null
          )}
        </svg>
      )}
    </div>
  );
}

/* ---------- last 7 days: login hours vs talk hours ---------- */
function HistoryBars({ data, onTip }) {
  const [ref, w] = useWidth();
  const H = 180;
  const pad = { t: 8, r: 4, b: 20, l: 30 };
  const maxH = niceMax(Math.max(1, ...data.map((d) => d.login_sec / 3600)));
  const iw = Math.max(0, w - pad.l - pad.r);
  const ih = H - pad.t - pad.b;
  const step = data.length ? iw / data.length : 0;
  const bw = Math.max(4, Math.min(18, (step * 0.7) / 2));
  const y = (h) => pad.t + ih - (h / maxH) * ih;
  const ticks = [0, maxH / 2, maxH];

  return (
    <div ref={ref} className="ag-chart">
      {w > 0 && (
        <svg width={w} height={H} role="img" aria-label="Login and talk hours, last 7 days">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} className="ag-grid" />
              <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" className="ag-axis">{t}h</text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = pad.l + i * step + step / 2;
            const lh = d.login_sec / 3600;
            const th = d.talk_sec / 3600;
            return (
              <g
                key={d.date}
                onMouseMove={(e) =>
                  onTip(e, fmtDay(d.date), [
                    ["Login time", fmtDur(d.login_sec), "ag-sw--login"],
                    ["Talk time", fmtDur(d.talk_sec), "ag-sw--talk"],
                    ["Talk share", pct(d.talk_sec, d.login_sec)],
                  ])
                }
                onMouseLeave={() => onTip(null)}
              >
                <rect x={pad.l + i * step} y={pad.t} width={step} height={ih} fill="transparent" />
                <path d={barPath(cx - bw - 1, y(lh), bw, pad.t + ih - y(lh))} className="ag-fill--login" />
                <path d={barPath(cx + 1, y(th), bw, pad.t + ih - y(th))} className="ag-fill--talk" />
                <text x={cx} y={H - 5} textAnchor="middle" className="ag-axis">{fmtDay(d.date)}</text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/* =====================================================================
   Page
   ===================================================================== */
const AgentHome = () => {
  const navigate = useNavigate();
  const { popupState, toggleIframe } = useContext(PopupContext);

  const [range, setRange] = useState("today");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [fetchedAt, setFetchedAt] = useState(Date.now());
  const [tip, setTip] = useState(null);
  const now = useNow(1000);

  const load = useCallback(async () => {
    try {
      const d = await fetchAgentDashboard(range);
      setData(d);
      setFetchedAt(Date.now());
      setError("");
    } catch (e) {
      setError("Could not refresh dashboard data. Retrying...");
    }
  }, [range]);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const onTip = useCallback((e, title, rows) => {
    if (!e) return setTip(null);
    setTip({ x: e.clientX, y: e.clientY, title, rows });
  }, []);

  const derived = useMemo(() => {
    if (!data) return null;
    const k = data.kpis || {};
    const s = data.session || {};
    const live = s.logged_in ? (now - fetchedAt) / 1000 : 0;
    const loginSec = (s.login_sec || 0) + live;
    const st = STATUS_BY_CODE[data.status?.code] || STATUS_BY_CODE[0];
    const inStateSec = data.status?.since ? (now - new Date(data.status.since).getTime()) / 1000 : 0;
    const split = data.time_split || {};
    const productive = (split.oncall || 0) + (split.wrapup || 0);
    return { k, s, loginSec, st, inStateSec, split, productive };
  }, [data, now, fetchedAt]);

  const clock = new Date(now).toLocaleTimeString("en-IN", { hour12: true });
  const stale = now - fetchedAt > REFRESH_MS * 2;

  return (
    <div className="ag">
      {/* toolbar */}
      <div className="ag-toolbar">
        <div className="ag-toolbar__left">
          <h1 className="ag-title">My Dashboard</h1>
          <span className={`ag-live ${stale ? "is-stale" : ""}`}>
            <i className="ag-live__dot" /> {stale ? "Reconnecting" : "LIVE"}
          </span>
          <span className="ag-muted ag-mono ag-clock">{clock}</span>
          {USE_DEMO_DATA && <span className="ag-chip ag-chip--demo">Demo data</span>}
        </div>
        <div className="ag-toolbar__right">
          <label className="ag-field">
            Period
            <select className="ag-select" value={range} onChange={(e) => setRange(e.target.value)}>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
            </select>
          </label>
        </div>
      </div>

      {error && <p className="ag-notice ag-notice--err">{error}</p>}

      {!derived ? (
        <p className="ag-empty">Loading your dashboard...</p>
      ) : (
        <>
          {/* KPIs */}
          <div className="ag-kpis">
            <Kpi title="Total Calls" value={derived.k.total ?? 0} sub="all calls" onClick={() => navigate("agent/data/totalCall")} />
            <Kpi title="Answered" value={derived.k.answered ?? 0} sub={pct(derived.k.answered, derived.k.total)} tone="good" onClick={() => navigate("agent/data/answerCall")} />
            <Kpi title="Missed" value={derived.k.missed ?? 0} sub={pct(derived.k.missed, derived.k.total)} tone="bad" onClick={() => navigate("agent/data/cancelCall")} />
            <Kpi title="Other" value={derived.k.other ?? 0} sub={pct(derived.k.other, derived.k.total)} onClick={() => navigate("agent/data/otherCall")} />
            <Kpi title="Talk Time" value={fmtDur(derived.k.talk_sec)} sub={`${pct(derived.k.talk_sec, derived.loginSec)} of login`} />
            <Kpi title="Avg Handle" value={derived.k.avg_handle_sec ? fmtDur(derived.k.avg_handle_sec) : "-"} sub="per answered call" />
            <Kpi title="Login Time" value={fmtClock(derived.loginSec)} sub={derived.s.logged_in ? "running" : "logged out"} tone={derived.s.logged_in ? "good" : undefined} />
            <Kpi title="Productive" value={pct(derived.productive, derived.loginSec)} sub="on call + wrap-up" />
          </div>

          {/* session + time split + hourly */}
          <div className="ag-row ag-row--3">
            <section className="ag-card">
              <div className="ag-card__head">
                <h3 className="ag-card__title">My session</h3>
              </div>
              <div className={`ag-now ${STATES[derived.st.key]?.cls || "ag-st--offline"}`}>
                <span className="ag-now__label">
                  <i className="ag-dot" /> {derived.st.label}
                </span>
                <span className="ag-now__time ag-mono">{fmtClock(derived.inStateSec)}</span>
                <span className="ag-muted ag-small">in current state</span>
              </div>
              <dl className="ag-facts">
                <div><dt>First login</dt><dd className="ag-mono">{fmtTime(derived.s.first_login)}</dd></div>
                <div><dt>Logged in for</dt><dd className="ag-mono">{fmtDur(derived.loginSec)}</dd></div>
                <div><dt>Breaks taken</dt><dd className="ag-mono">{derived.s.breaks ?? 0}</dd></div>
                <div><dt>Break time</dt><dd className="ag-mono">{fmtDur(derived.split.break)}</dd></div>
                <div><dt>Last logout</dt><dd className="ag-mono">{fmtTime(derived.s.last_logout)}</dd></div>
              </dl>
            </section>

            <section className="ag-card">
              <div className="ag-card__head">
                <h3 className="ag-card__title">Where my time went</h3>
                <span className="ag-card__sub">{range === "today" ? "today" : "yesterday"}</span>
              </div>
              <TimeDonut split={derived.split} onTip={onTip} />
            </section>

            <section className="ag-card">
              <div className="ag-card__head">
                <h3 className="ag-card__title">Calls per hour</h3>
                <div className="ag-legend">
                  <span><i className="ag-sw ag-sw--ans" />Answered</span>
                  <span><i className="ag-sw ag-sw--miss" />Missed</span>
                </div>
              </div>
              <HourlyBars data={data.hourly || []} onTip={onTip} />
            </section>
          </div>

          {/* timeline */}
          <section className="ag-card">
            <div className="ag-card__head">
              <h3 className="ag-card__title">Activity timeline</h3>
              <span className="ag-card__sub">from first login to now</span>
              <div className="ag-legend">
                {STATE_ORDER.map((k) => (
                  <span key={k}><i className={`ag-dot ${STATES[k].cls}`} />{STATES[k].label}</span>
                ))}
              </div>
            </div>
            <StateTimeline segments={data.timeline} startIso={derived.s.first_login} nowMs={range === "today" ? now : fetchedAt} onTip={onTip} />
          </section>

          {/* history + sessions table */}
          <div className="ag-row ag-row--2">
            <section className="ag-card">
              <div className="ag-card__head">
                <h3 className="ag-card__title">Last 7 days</h3>
                <div className="ag-legend">
                  <span><i className="ag-sw ag-sw--login" />Login time</span>
                  <span><i className="ag-sw ag-sw--talk" />Talk time</span>
                </div>
              </div>
              <HistoryBars data={data.history || []} onTip={onTip} />
            </section>

            <section className="ag-card ag-card--table">
              <div className="ag-card__head">
                <h3 className="ag-card__title">Login sessions</h3>
              </div>
              <div className="ag-table-wrap">
                <AgentTable />
              </div>
            </section>
          </div>
        </>
      )}

      <Tooltip tip={tip} />

      {popupState.call && (
        <PopupIframe id="call" toggleVisibility={() => toggleIframe("call")} title="Live Calls" />
      )}
    </div>
  );
};

export default AgentHome;

/* ---------------------------------------------------------------------
   Demo data (only used while USE_DEMO_DATA = true).
   The real API should return exactly this shape.
   --------------------------------------------------------------------- */
function makeDemoData() {
  const today = new Date();
  const at = (h, m) => {
    const d = new Date(today);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  const timeline = [
    { state: "ready", start: at(9, 32), end: at(9, 41) },
    { state: "oncall", start: at(9, 41), end: at(9, 58) },
    { state: "wrapup", start: at(9, 58), end: at(10, 2) },
    { state: "ready", start: at(10, 2), end: at(10, 9) },
    { state: "oncall", start: at(10, 9), end: at(10, 37) },
    { state: "wrapup", start: at(10, 37), end: at(10, 41) },
    { state: "break", start: at(10, 41), end: at(10, 56) },
    { state: "ready", start: at(10, 56), end: at(11, 3) },
    { state: "oncall", start: at(11, 3), end: null },
  ];
  const nowMs = Date.now();
  const split = { oncall: 0, ready: 0, wrapup: 0, break: 0 };
  timeline.forEach((s) => {
    const e = s.end ? new Date(s.end).getTime() : nowMs;
    split[s.state] += Math.max(0, (e - new Date(s.start).getTime()) / 1000);
  });
  const loginSec = Object.values(split).reduce((a, b) => a + b, 0);
  const history = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    const login = i === 6 ? loginSec : (7 + Math.random() * 1.5) * 3600;
    return { date: d.toISOString().slice(0, 10), login_sec: login, talk_sec: login * (0.45 + Math.random() * 0.2) };
  });

  return {
    status: { code: 3, since: at(11, 3) },
    kpis: { total: 14, answered: 11, missed: 2, other: 1, talk_sec: split.oncall, avg_handle_sec: (split.oncall + split.wrapup) / 11 },
    session: { first_login: at(9, 32), last_logout: null, logged_in: true, login_sec: loginSec, breaks: 1 },
    time_split: split,
    timeline,
    hourly: [
      { hour: 9, answered: 3, missed: 1 },
      { hour: 10, answered: 5, missed: 1 },
      { hour: 11, answered: 3, missed: 0 },
    ],
    history,
  };
}