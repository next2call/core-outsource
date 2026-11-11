import { useState, useEffect, useMemo, useRef, useCallback, useContext, memo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Headphones, UserPlus, PhoneOff, AlertTriangle, CheckCircle2, ChevronDown,
  Phone, PhoneCall, PhoneMissed, PhoneIncoming, PhoneOutgoing, Hourglass, Timer, Gauge,
  Users, Radio, BarChart3, Activity, ListChecks, Megaphone, Trophy, Inbox, ClipboardList,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell,
} from "recharts";
import "./home.scss";

import { AuthContext } from "../../context/authContext";
import { PopupContext } from "../../context/iframeContext";
import api from "../../api/api";

/* ------------------------------------------------------------------ */
/*  Settings                                                           */
/* ------------------------------------------------------------------ */
const REFRESH_MS = 5000;       // poll interval
const REQ_TIMEOUT = 8000;      // a request slower than this is dropped for this poll
const LONG_CALL_SEC = 300;     // live call shown red after 5 min
const LONG_BREAK_SEC = 600;    // break shown red + alert after 10 min
const QUEUE_WARN_SEC = 90;     // queue wait alert
const QUEUE_RED_SEC = 60;      // queue wait shown red
const DROP_LIMIT = 3;          // outbound drop-rate alert (%)
const MASK_NUMBERS = true;     // +91 98XXX X4410
const NA = "–";                // placeholder for missing values

const PERIODS = {
  today: { label: "Today", range: "day", feature: "today" },
  week: { label: "This week", range: "week", feature: "weekly" },
  month: { label: "This month", range: "month", feature: "monthly" },
};

// order chosen so neighbouring colours in the donut stay distinguishable
const STATE_META = {
  oncall: "On Call",
  ringing: "Ringing",
  ready: "Ready",
  wrapup: "Wrap-up",
  break: "Break",
  pause: "Pause",
};
const STATE_ORDER = Object.keys(STATE_META);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const has = (v) => v !== undefined && v !== null && v !== "";
const pad = (n) => String(n).padStart(2, "0");
const fmtInt = (v) => num(v).toLocaleString("en-IN");
const pct = (a, b) => (b ? (a / b) * 100 : 0);
const fmtPct = (v, d = 1) => (has(v) ? `${Number(v).toFixed(d)}%` : NA);

const fmtClock = (sec) => {
  if (!has(sec) || Number.isNaN(Number(sec))) return NA;
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${pad(h)}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
};
const fmtHMS = (sec) => {
  if (!has(sec)) return NA;
  const s = Math.max(0, Math.floor(sec));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};
const fmtSignedClock = (sec) => {
  if (!has(sec)) return null;
  const sign = sec > 0 ? "+" : sec < 0 ? "−" : "±";
  const s = Math.abs(Math.round(sec));
  return `${sign}${Math.floor(s / 60)}:${pad(s % 60)}`;
};
const fmtDelta = (v, unit = "%") => {
  if (!has(v)) return null;
  const n = Number(v);
  return `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n)}${unit}`;
};
const fmtDateTime = (date) => {
  if (!date) return NA;
  return new Date(date).toLocaleString("en-IN", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
};
const fmtHeaderDate = (d) => {
  const day = d.toLocaleDateString("en-IN", { weekday: "short" });
  const date = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  return `${day} ${date} · ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const maskNumber = (raw) => {
  if (!raw) return NA;
  const str = String(raw);
  if (!MASK_NUMBERS || /x/i.test(str)) return str;
  const d = str.replace(/\D/g, "");
  if (d.length < 10) return str;
  const last = d.slice(-10);
  const cc = d.length > 10 ? `+${d.slice(0, d.length - 10)} ` : "";
  return `${cc}${last.slice(0, 2)}XXX X${last.slice(6)}`;
};

const initialsOf = (name) =>
  String(name || "?").trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

// map any status text coming from the dialer into one of our 6 states
const normalizeState = (raw) => {
  const s = String(raw || "").toLowerCase().trim();
  if (!s) return "offline";
  if (/log ?off|logout|logged ?out|offline/.test(s)) return "offline";
  if (/ring/.test(s)) return "ringing";
  if (/in ?call|on ?call|incall|oncall|talk|busy|queue ?call|mobile/.test(s)) return "oncall";
  if (/wrap|dispo|acw/.test(s)) return "wrapup";
  if (/ready|avail|idle|waiting|free/.test(s)) return "ready";
  if (/break|lunch|tea|bio|dinner|snack/.test(s)) return "break";
  return "pause";
};

// seconds an item has been in its current state, ticking locally between polls
const elapsedSec = (sec, since, now, fetchedAt) => {
  if (has(sec)) return num(sec) + Math.max(0, (now - fetchedAt) / 1000);
  if (since) {
    const t = new Date(since).getTime();
    if (!Number.isNaN(t)) return Math.max(0, (now - t) / 1000);
  }
  return null;
};

const getBasePath = (userType) => {
  switch (String(userType)) {
    case "8": return "admin";
    case "2": return "team_leader";
    case "9": return "superadmin";
    case "7": return "manager";
    default: return "agent";
  }
};

const asArray = (v, ...keys) => {
  if (Array.isArray(v)) return v;
  for (const k of keys) if (v && Array.isArray(v[k])) return v[k];
  return [];
};

const tooltipStyle = {
  background: "var(--ld-card)",
  border: "1px solid var(--ld-border)",
  borderRadius: 10,
  fontSize: 12,
  color: "var(--ld-text)",
  boxShadow: "var(--ld-shadow-pop)",
  padding: "8px 10px",
};

/* ------------------------------------------------------------------ */
/*  Small presentational pieces                                        */
/* ------------------------------------------------------------------ */
const Sparkline = memo(function Sparkline({ data }) {
  if (!data || data.length < 2) return null;
  const w = 80;
  const h = 28;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const pts = data
    .map((v, i) => `${((i / (data.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 6)).toFixed(1)}`)
    .join(" ");
  return (
    <svg className="ld-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <polygon className="ld-spark__area" points={`0,${h} ${pts} ${w},${h}`} />
      <polyline className="ld-spark__line" points={pts} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
});

function KpiTile({ title, value, sub, subTone = "muted", spark, tone = "primary", icon: Icon, onClick, hint }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      className={`ld-kpi ld-kpi--${tone}${onClick ? " is-clickable" : ""}`}
      onClick={onClick}
      title={hint}
      type={onClick ? "button" : undefined}
    >
      <span className="ld-kpi__top">
        <span className="ld-kpi__title">{title}</span>
        {Icon && <span className="ld-kpi__icon"><Icon size={15} strokeWidth={2.2} /></span>}
      </span>
      <span className="ld-kpi__value">{value}</span>
      <span className="ld-kpi__foot">
        <span className={`ld-kpi__sub ld-tone--${subTone}`}>{sub}</span>
        <Sparkline data={spark} />
      </span>
    </Tag>
  );
}

const CardHead = ({ icon: Icon, tone = "primary", title, sub, children }) => (
  <header className="ld-card__head">
    {Icon && <span className={`ld-card__icon ld-ic--${tone}`}><Icon size={15} strokeWidth={2.2} /></span>}
    <h3 className="ld-card__title">{title}</h3>
    {has(sub) && <span className="ld-card__sub">{sub}</span>}
    {children}
  </header>
);

const Empty = ({ icon: Icon = Inbox, title, hint, compact = false }) => (
  <div className={`ld-empty-state${compact ? " ld-empty-state--compact" : ""}`}>
    <span className="ld-empty-state__icon"><Icon size={compact ? 14 : 18} /></span>
    <span className="ld-empty-state__text">
      <strong>{title}</strong>
      {hint && <span>{hint}</span>}
    </span>
  </div>
);

const StateChip = ({ state }) => (
  <span className={`ld-chip ld-st--${state}`}>{STATE_META[state] || state}</span>
);

const HourlyChart = memo(function HourlyChart({ rows }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 8, right: 4, left: -18, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid stroke="var(--ld-grid)" strokeDasharray="3 4" vertical={false} />
        <XAxis dataKey="hour" tick={{ fontSize: 11, fill: "var(--ld-muted)" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "var(--ld-muted)" }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: "var(--ld-hover)", radius: 6 }}
          contentStyle={tooltipStyle}
          labelStyle={{ color: "var(--ld-text)", fontWeight: 600, marginBottom: 2 }}
          itemStyle={{ color: "var(--ld-text-2)", padding: 0 }}
        />
        <Bar dataKey="answered" name="Answered" stackId="h" fill="var(--ld-series-1)" stroke="var(--ld-card)" strokeWidth={1.5} isAnimationActive={false} />
        <Bar dataKey="missed" name="Missed" stackId="h" fill="var(--ld-series-2)" stroke="var(--ld-card)" strokeWidth={1.5} radius={[5, 5, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
});

const StatusDonut = memo(function StatusDonut({ items, total }) {
  const data = items.filter((i) => i.value > 0);
  const empty = data.length === 0;
  return (
    <div className="ld-donut">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={empty ? [{ key: "none", label: "None", value: 1 }] : data}
            dataKey="value"
            nameKey="label"
            innerRadius="72%"
            outerRadius="100%"
            startAngle={90}
            endAngle={-270}
            paddingAngle={data.length > 1 ? 3 : 0}
            cornerRadius={data.length > 1 ? 4 : 0}
            stroke="none"
            isAnimationActive={false}
          >
            {(empty ? [{ key: "none" }] : data).map((d) => (
              <Cell key={d.key} fill={empty ? "var(--ld-track)" : `var(--ld-st-${d.key})`} />
            ))}
          </Pie>
          {!empty && <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "var(--ld-text)" }} />}
        </PieChart>
      </ResponsiveContainer>
      <div className="ld-donut__center">
        <strong>{total}</strong>
        <span>logged in</span>
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
export default function Home() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const { toggleIframe } = useContext(PopupContext);

  const [period, setPeriod] = useState("today");
  const [campaign, setCampaign] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [chartMode, setChartMode] = useState("auto"); // auto | hourly | daily
  const [callFilter, setCallFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [data, setData] = useState({ fetchedAt: Date.now() });
  const [pending, setPending] = useState({});
  const [confirmHang, setConfirmHang] = useState(null);
  const [notice, setNotice] = useState(null);

  const missingRef = useRef(new Set()); // endpoints that returned 404, stop polling them
  const busyRef = useRef(false);
  const firstRef = useRef(true);
  const campaignNamesRef = useRef(new Set());

  /* ---------- data loading ---------- */
  const get = useCallback(async (key, url) => {
    if (missingRef.current.has(key)) return undefined;
    try {
      // hard timeout so one hanging request can never freeze the whole poll loop
      const res = await Promise.race([
        api.get(url, { timeout: REQ_TIMEOUT }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), REQ_TIMEOUT + 500)),
      ]);
      // route not built yet but server answered with the React index.html, treat as missing
      if (typeof res?.data === "string" && /<!doctype|<html/i.test(res.data)) {
        missingRef.current.add(key);
        return undefined;
      }
      return res?.data;
    } catch (err) {
      if ([404, 405, 501].includes(err?.response?.status)) missingRef.current.add(key);
      return undefined;
    }
  }, []);

  const tick = useCallback(async () => {
    // read the token at call time (reading it once at import broke the first login)
    if (!localStorage.getItem("token") || busyRef.current) return;
    busyRef.current = true;
    const p = PERIODS[period];
    const qs = `period=${period}&campaign=${encodeURIComponent(campaign)}`;
    const countsUrl = firstRef.current ? "/call-counts" : "/call-counts-per";

    try {
      const [
        counts, top, feature, chart, summary,
        kpis, hourly, liveAgents, liveCalls, queue, dispositions, perf, alerts,
      ] = await Promise.all([
        // existing APIs
        get(countsUrl, countsUrl),
        get("/top-caller", `/top-caller?range=${p.range}`),
        get("/feature", `/feature/${p.feature}`),
        get("/chart-data", "/chart-data"),
        get("/agent-summary", "/agent-summary"),
        // new APIs (dashboard keeps working while these are not built yet)
        get("/dashboard/kpis", `/dashboard/kpis?${qs}`),
        get("/dashboard/calls-per-hour", `/dashboard/calls-per-hour?${qs}`),
        get("/dashboard/live-agents", `/dashboard/live-agents?campaign=${encodeURIComponent(campaign)}`),
        get("/dashboard/live-calls", `/dashboard/live-calls?campaign=${encodeURIComponent(campaign)}`),
        get("/dashboard/queue", `/dashboard/queue?campaign=${encodeURIComponent(campaign)}`),
        get("/dashboard/dispositions", `/dashboard/dispositions?${qs}`),
        get("/dashboard/campaign-performance", `/dashboard/campaign-performance?period=${period}`),
        get("/dashboard/alerts", `/dashboard/alerts?campaign=${encodeURIComponent(campaign)}`),
      ]);

      const next = { fetchedAt: Date.now() };
      const put = (k, v) => { if (v !== undefined) next[k] = v; };
      put("counts", counts);
      put("top", top && asArray(top, "data", "rows"));
      put("feature", feature);
      put("chart", chart && asArray(chart, "data", "rows"));
      put("summary", summary && asArray(summary, "data", "rows"));
      put("kpis", kpis);
      put("hourly", hourly);
      put("liveAgents", liveAgents && asArray(liveAgents, "data", "agents"));
      put("liveCalls", liveCalls && asArray(liveCalls, "data", "calls"));
      put("queue", queue && asArray(queue, "data", "calls"));
      put("dispositions", dispositions && asArray(dispositions, "data", "rows"));
      put("perf", perf && asArray(perf, "data", "rows"));
      put("alerts", alerts && asArray(alerts, "data", "alerts"));
      setData((prev) => ({ ...prev, ...next }));
      firstRef.current = false;
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  }, [get, period, campaign]);

  useEffect(() => {
    tick();
    const id = setInterval(tick, REFRESH_MS);
    return () => clearInterval(id);
  }, [tick]);

  // 1-second clock for the header and the running timers
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const id = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(id);
  }, [notice]);

  /* ---------- navigation (unchanged behaviour) ---------- */
  const iframeTypes = ["callQueue", "loginAgent", "availableAgent", "pauseAgent", "inCall"];
  const handleWidgetClick = (type) => {
    if (iframeTypes.includes(type)) toggleIframe("call");
    else navigate(`/${getBasePath(user?.user_type)}/data/${type}`);
  };

  /* ---------- derived data ---------- */
  const { fetchedAt } = data;
  const counts = data.counts || {};
  const changes = counts.changes || {};
  const kpis = data.kpis || {};

  const hourlyRows = useMemo(() => {
    const rows = asArray(data.hourly, "rows", "hours", "data");
    return rows.map((r) => ({
      hour: r.hour ?? r.label ?? "",
      answered: num(r.answered),
      missed: num(r.missed),
      inbound: num(r.inbound),
      outbound: num(r.outbound),
      talk: num(r.talk_sec),
      total: num(r.total ?? num(r.answered) + num(r.missed)),
    }));
  }, [data.hourly]);
  const hourlySummary = (data.hourly && !Array.isArray(data.hourly) && data.hourly.summary) || {};
  const spark = useMemo(() => {
    const col = (k) => hourlyRows.map((r) => r[k]);
    return {
      total: col("total"),
      answered: col("answered"),
      missed: col("missed"),
      inbound: col("inbound"),
      outbound: col("outbound"),
      talk: col("talk"),
      aht: hourlyRows.map((r) => (r.answered ? r.talk / r.answered : 0)),
    };
  }, [hourlyRows]);

  // live agents = /agent-summary (base) enriched with /dashboard/live-agents
  const agents = useMemo(() => {
    const live = new Map((data.liveAgents || []).map((a) => [String(a.user_id), a]));
    const build = (s, l) => {
      const id = String(l?.user_id ?? s?.user_id ?? "");
      const state = normalizeState(l?.state ?? l?.status ?? s?.break_name ?? "");
      const camp = l?.campaign ?? s?.campaign ?? null;
      let reason = l?.reason ?? null;
      if (!reason) {
        if (state === "oncall" || state === "ringing") reason = camp;
        else if (state === "wrapup") reason = "Disposition";
        else if (state === "ready") reason = "Waiting for call";
        else reason = s?.break_name || null;
      }
      return {
        id,
        name: l?.name ?? l?.full_name ?? s?.full_name ?? s?.user_name ?? id,
        state,
        reason,
        campaign: camp,
        calls: num(l?.calls ?? s?.total_calls),
        stateSec: l?.state_sec,
        stateSince: l?.state_since,
      };
    };
    const list = (data.summary || []).map((s) => {
      const l = live.get(String(s.user_id));
      live.delete(String(s.user_id));
      return build(s, l);
    });
    live.forEach((l) => list.push(build(null, l)));
    return list
      .filter((a) => a.state !== "offline")
      .filter((a) => campaign === "all" || !a.campaign || a.campaign === campaign)
      .sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state));
  }, [data.summary, data.liveAgents, campaign]);

  const agentsWithTime = agents.map((a) => ({ ...a, sec: elapsedSec(a.stateSec, a.stateSince, now, fetchedAt) }));
  const totalAgentsKnown = (data.summary || []).length || agents.length;

  const stateCounts = useMemo(() => {
    const c = Object.fromEntries(STATE_ORDER.map((s) => [s, 0]));
    if (agents.length) agents.forEach((a) => { c[a.state] += 1; });
    else {
      // fallback to the old counters
      c.oncall = num(counts.inCall);
      c.ready = num(counts.availableAgent);
      c.pause = num(counts.pauseAgent);
    }
    return c;
  }, [agents, counts.inCall, counts.availableAgent, counts.pauseAgent]);
  const loggedIn = agents.length || num(counts.loginAgent);
  const donutItems = useMemo(
    () => STATE_ORDER.map((k) => ({ key: k, label: STATE_META[k], value: stateCounts[k] })),
    [stateCounts],
  );

  const filteredAgents = agentFilter === "all" ? agentsWithTime : agentsWithTime.filter((a) => a.state === agentFilter);
  const half = Math.ceil(filteredAgents.length / 2);

  const calls = (data.liveCalls || [])
    .map((c) => {
      const dir = String(c.direction ?? c.call_type ?? "").toUpperCase().startsWith("IN") ? "IN" : "OUT";
      return {
        id: String(c.id ?? c.uniqueid ?? c.channel ?? `${c.user_id}-${c.number}`),
        agent: c.agent_name ?? c.name ?? c.user_id,
        ext: c.user_id,
        number: maskNumber(c.number ?? c.phone_number),
        campaign: c.campaign ?? "",
        dir,
        sec: elapsedSec(c.duration_sec, c.start_time, now, fetchedAt),
      };
    })
    .filter((c) => campaign === "all" || !c.campaign || c.campaign === campaign);
  const shownCalls = calls.filter((c) => {
    if (callFilter === "in") return c.dir === "IN";
    if (callFilter === "out") return c.dir === "OUT";
    if (callFilter === "long") return num(c.sec) > LONG_CALL_SEC;
    return true;
  });

  const queue = (data.queue || [])
    .map((q, i) => ({
      id: String(q.id ?? q.uniqueid ?? i),
      number: maskNumber(q.number ?? q.phone_number),
      queue: q.queue ?? q.campaign ?? "",
      sec: elapsedSec(q.wait_sec, q.since, now, fetchedAt),
    }))
    .sort((a, b) => num(b.sec) - num(a.sec));
  const longestWait = queue.length ? queue[0].sec : kpis.longest_wait_sec;

  // campaign table comes only from /dashboard/campaign-performance
  // (/chart-data is date-wise, so it feeds the daily chart + disposition fallback)
  const campaigns = useMemo(() => (data.perf || [])
    .filter((p) => p.campaign ?? p.name)
    .map((p) => {
      const dialed = num(p.dialed);
      const connected = num(p.connected);
      return {
        name: p.campaign ?? p.name,
        method: p.dial_method,
        dialed,
        connected,
        connectPct: dialed ? pct(connected, dialed) : null,
        aht: p.aht_sec,
        agents: p.agents,
        leadsLeft: p.leads_left,
        status: p.status,
        dropRate: p.drop_rate,
        hopperEmpty: p.hopper_empty,
        progress: has(p.progress)
          ? num(p.progress)
          : num(p.leads_total) > 0 ? (1 - num(p.leads_left) / num(p.leads_total)) * 100 : null,
      };
    }), [data.perf]);

  campaigns.forEach((c) => campaignNamesRef.current.add(c.name));
  const campaignOptions = [...campaignNamesRef.current].sort();

  // daily rows from the existing /chart-data
  const dailyRows = useMemo(() => (data.chart || [])
    .filter((d) => d?.name)
    .map((d) => ({
      hour: d.name,
      answered: num(d.answer),
      missed: num(d.no_answer),
      total: num(d.answer) + num(d.no_answer),
    })), [data.chart]);
  const useHourly = chartMode === "hourly" ? true : chartMode === "daily" ? false : hourlyRows.length > 0;
  const trendRows = useHourly ? hourlyRows : dailyRows;
  const trendTotal = trendRows.reduce((a, r) => a + r.total, 0);
  const peakRow = trendRows.reduce((best, r) => (r.total > (best?.total ?? 0) ? r : best), null);
  const peakLabel = hourlySummary.peak_hour ?? peakRow?.hour ?? NA;

  const dispoFromApi = data.dispositions !== undefined;
  const dispositions = useMemo(() => {
    let rows;
    if (dispoFromApi) {
      rows = (data.dispositions || []).map((d) => ({ name: d.name ?? d.disposition, count: num(d.count) }));
    } else {
      // fallback: totals of interested / not interested from /chart-data
      const sum = (k) => (data.chart || []).reduce((a, d) => a + num(d[k]), 0);
      rows = [
        { name: "Interested", count: sum("interested") },
        { name: "Not interested", count: sum("not_interested") },
      ].filter((r) => r.count > 0);
    }
    return rows.sort((a, b) => b.count - a.count);
  }, [dispoFromApi, data.dispositions, data.chart]);
  const maxDispo = Math.max(1, ...dispositions.map((d) => d.count));
  const totalDispo = dispositions.reduce((a, d) => a + d.count, 0);

  const feature = data.feature || {};
  const fAns = num(feature.answerCall);
  const fCan = num(feature.cancelCall);
  const fOth = num(feature.otherCall);
  const fTot = fAns + fCan + fOth;

  const topAgents = (data.top || []).slice(0, 5);

  /* ---------- alerts (server + computed) ---------- */
  const alerts = useMemo(() => {
    const list = [];
    const qNames = [...new Set(queue.filter((q) => num(q.sec) > QUEUE_WARN_SEC).map((q) => q.queue || "Queue"))];
    qNames.forEach((n) => list.push({ level: "critical", text: `${n} queue wait > ${QUEUE_WARN_SEC}s` }));
    const longBreak = agentsWithTime.filter((a) => a.state === "break" && num(a.sec) > LONG_BREAK_SEC);
    if (longBreak.length) {
      list.push({
        level: "warning",
        text: longBreak.length === 1
          ? `${longBreak[0].name} on break > ${LONG_BREAK_SEC / 60} min`
          : `${longBreak.length} agents on break > ${LONG_BREAK_SEC / 60} min`,
      });
    }
    campaigns.forEach((c) => {
      if (/pause/i.test(c.status || "")) {
        list.push({ level: "warning", text: `${c.name} campaign paused${c.hopperEmpty || num(c.leadsLeft) === 0 ? " (hopper empty)" : ""}` });
      }
      if (has(c.dropRate) && num(c.dropRate) >= DROP_LIMIT * 0.8) {
        list.push({
          level: num(c.dropRate) >= DROP_LIMIT ? "critical" : "warning",
          text: `Drop rate ${c.name} ${Number(c.dropRate).toFixed(1)}% (limit ${DROP_LIMIT}%)`,
        });
      }
    });
    (data.alerts || []).forEach((a) => list.push({ level: a.level || "warning", text: a.message ?? a.text }));
    const seen = new Set();
    return list.filter((a) => a.text && !seen.has(a.text) && seen.add(a.text));
  }, [queue, agentsWithTime, campaigns, data.alerts]);
  const critical = alerts.some((a) => a.level === "critical");

  /* ---------- KPI tiles ---------- */
  const total = num(counts.totalCall);
  const answered = num(counts.answerCall);
  const missed = has(kpis.missed) ? num(kpis.missed) : num(counts.cancelCall) + num(counts.noAnswerCall);
  const inbound = num(counts.inboundCall);
  const outbound = num(counts.outboundCall);
  const inQueue = has(counts.callQueue) ? num(counts.callQueue) : queue.length;
  const connectRate = has(kpis.connect_rate) ? num(kpis.connect_rate) : total ? pct(answered, total) : null;
  const L = (v) => (loading ? <span className="ld-skeleton" /> : v);
  const deltaTone = (v, upIsGood = true) => (!has(v) || Number(v) === 0 ? "muted" : (Number(v) > 0) === upIsGood ? "good" : "bad");

  const tiles = [
    {
      key: "totalCall", title: "Total Calls", value: L(fmtInt(total)), icon: Phone, tone: "primary",
      sub: has(changes.totalCall) ? `${fmtDelta(changes.totalCall)} vs prev` : "this period", subTone: deltaTone(changes.totalCall),
      spark: spark.total, nav: "totalCall",
    },
    {
      key: "answerCall", title: "Answered", value: L(fmtInt(answered)), icon: PhoneCall, tone: "good",
      sub: `${fmtPct(pct(answered, total))} of total`, subTone: "good",
      spark: spark.answered, nav: "answerCall",
      hint: has(changes.answerCall) ? `vs previous: ${fmtDelta(changes.answerCall)}` : undefined,
    },
    {
      key: "missed", title: "Missed", value: L(fmtInt(missed)), icon: PhoneMissed, tone: "bad",
      sub: `${fmtPct(pct(missed, total))} of total`, subTone: missed ? "bad" : "muted",
      spark: spark.missed, nav: "cancelCall",
      hint: `Cancelled ${fmtInt(counts.cancelCall)} · No answer ${fmtInt(counts.noAnswerCall)} · Other ${fmtInt(counts.otherCall)}`,
    },
    {
      key: "inboundCall", title: "Inbound", value: L(fmtInt(inbound)), icon: PhoneIncoming, tone: "info",
      sub: `${fmtPct(pct(inbound, total))} share`, spark: spark.inbound, nav: "inboundCall",
    },
    {
      key: "outboundCall", title: "Outbound", value: L(fmtInt(outbound)), icon: PhoneOutgoing, tone: "violet",
      sub: `${fmtPct(pct(outbound, total))} share`, spark: spark.outbound, nav: "outboundCall",
    },
    {
      key: "callQueue", title: "In Queue", value: L(fmtInt(inQueue)), icon: Hourglass, tone: "amber",
      sub: has(longestWait) ? `Longest ${fmtClock(longestWait)}` : "No wait",
      subTone: num(longestWait) > QUEUE_WARN_SEC ? "bad" : "muted",
      spark: null, nav: "callQueue",
    },
    {
      key: "aht", title: "Avg Handle", value: L(fmtClock(kpis.aht_sec)), icon: Timer, tone: "teal",
      sub: fmtSignedClock(kpis.aht_change_sec) ?? "per answered call", subTone: deltaTone(kpis.aht_change_sec, false),
      spark: spark.aht,
    },
    {
      key: "connect", title: "Connect Rate", value: L(fmtPct(connectRate)), icon: Gauge, tone: "pink",
      sub: fmtDelta(kpis.connect_rate_change) ?? "answered ÷ total", subTone: deltaTone(kpis.connect_rate_change),
      spark: null,
    },
  ];

  /* ---------- live-call monitoring ---------- */
  const monitor = async (call, action) => {
    if (action === "hangup" && confirmHang !== call.id) {
      setConfirmHang(call.id);
      setTimeout(() => setConfirmHang((c) => (c === call.id ? null : c)), 3000);
      return;
    }
    setConfirmHang(null);
    setPending((p) => ({ ...p, [call.id]: action }));
    try {
      await api.post(`/dashboard/live-calls/${encodeURIComponent(call.id)}/${action}`, {
        supervisor_id: user?.user_id ?? user?.id,
      });
      const verb = { listen: "Listening to", barge: "Barged into", hangup: "Hung up" }[action];
      setNotice({ type: "ok", text: `${verb} ${call.agent}'s call` });
      if (action === "hangup") tick();
    } catch (err) {
      setNotice({ type: "err", text: err?.response?.data?.message || `Could not ${action} this call` });
    } finally {
      setPending((p) => {
        const n = { ...p };
        delete n[call.id];
        return n;
      });
    }
  };

  /* ---------- status helpers ---------- */
  const isStale = now - fetchedAt > REFRESH_MS * 3;
  const campaignStatusTone = (s) => {
    const v = String(s || "").toLowerCase();
    if (/run|live|active/.test(v)) return "good";
    if (/pause/.test(v)) return "warn";
    if (/stop|inactive|error/.test(v)) return "bad";
    return "muted";
  };
  const legacyChip = (status) => {
    const st = normalizeState(status);
    return st === "offline" ? "ld-st--offline" : `ld-st--${st}`;
  };

  const renderAgentRows = (rows) =>
    rows.map((a) => {
      const red = (a.state === "break" && num(a.sec) > LONG_BREAK_SEC) || (a.state === "oncall" && num(a.sec) > LONG_CALL_SEC * 3);
      return (
        <div key={a.id} className={`ld-agent ld-st--${a.state}${a.state === "break" && red ? " is-hot" : ""}`}>
          <span className="ld-agent__name" title={`${a.name} (${a.id})`}>
            <i className="ld-avatar">{initialsOf(a.name)}</i>
            <span className="ld-ellipsis">{a.name}</span>
          </span>
          <span><StateChip state={a.state} /></span>
          <span className="ld-agent__reason" title={a.reason || ""}>{a.reason || NA}</span>
          <span className={`ld-mono${red ? " ld-tone--bad ld-strong" : ""}`}>{fmtClock(a.sec)}</span>
          <span className="ld-mono ld-right ld-muted">{a.calls}</span>
        </div>
      );
    });

  const AgentHead = () => (
    <div className="ld-agent ld-agent--head">
      <span>Agent</span><span>Status</span><span>Reason</span><span>Time</span><span className="ld-right">Calls</span>
    </div>
  );

  /* ================================================================== */
  return (
    <div className="ld">
      {/* ---------- toolbar ---------- */}
      <div className="ld-toolbar">
        <div className="ld-toolbar__left">
          <div className="ld-heading">
            <h1 className="ld-title">Live Dashboard</h1>
          </div>
          <p className="ld-subtitle">
            <span className="ld-mono">{fmtHeaderDate(new Date(now))}</span>
            <span className="ld-subtitle__sep" />
            <span>{campaign === "all" ? "All campaigns" : campaign}</span>
            <span className="ld-subtitle__sep" />
            <span>{PERIODS[period].label}</span>
          </p>
        </div>
        <div className="ld-toolbar__right">
          <label className="ld-select" title="Campaign">
            <Megaphone size={14} className="ld-select__lead" />
            <select value={campaign} onChange={(e) => setCampaign(e.target.value)} aria-label="Campaign">
              <option value="all">All campaigns</option>
              {campaignOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown size={14} className="ld-select__chev" />
          </label>
          <div className="ld-seg ld-seg--lg" role="group" aria-label="Period">
            {Object.entries(PERIODS).map(([k, v]) => (
              <button key={k} type="button" className={period === k ? "is-active" : ""} onClick={() => setPeriod(k)}>
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ---------- KPI tiles ---------- */}
      <div className="ld-kpis">
        {tiles.map((t) => (
          <KpiTile
            key={t.key}
            title={t.title}
            value={t.value}
            sub={t.sub}
            subTone={t.subTone}
            spark={t.spark}
            tone={t.tone}
            icon={t.icon}
            hint={t.hint}
            onClick={t.nav ? () => handleWidgetClick(t.nav) : undefined}
          />
        ))}
      </div>

      {/* ---------- agents (left) + live calls (right) ---------- */}
      <div className="ld-row ld-row--live">
        <section className="ld-card ld-card--fixed">
          <CardHead icon={Users} tone="primary" title="Logged-in agents" sub={`${loggedIn} of ${Math.max(totalAgentsKnown, loggedIn)} online`} />
          <div className="ld-pills">
            <button type="button" className={`ld-pill${agentFilter === "all" ? " is-active" : ""}`} onClick={() => setAgentFilter("all")}>
              All <b>{agents.length}</b>
            </button>
            {STATE_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                className={`ld-pill ld-st--${s}${agentFilter === s ? " is-active" : ""}`}
                onClick={() => setAgentFilter(agentFilter === s ? "all" : s)}
              >
                <span className="ld-dot" />
                {STATE_META[s]} <b>{stateCounts[s]}</b>
              </button>
            ))}
          </div>

          <div className="ld-scroll ld-agents-box">
            {filteredAgents.length ? (
              <div className="ld-agents">
                <div className="ld-agents__col">
                  <AgentHead />
                  {renderAgentRows(filteredAgents.slice(0, half))}
                </div>
                {filteredAgents.length > 1 && (
                  <div className="ld-agents__col">
                    <AgentHead />
                    {renderAgentRows(filteredAgents.slice(half))}
                  </div>
                )}
              </div>
            ) : loading ? (
              <Empty icon={Users} title="Loading agents…" />
            ) : (
              <Empty
                icon={Users}
                title={agentFilter === "all" ? "No agents logged in" : `No agents in ${STATE_META[agentFilter]}`}
                hint={agentFilter === "all" ? "Agents appear here as soon as they log in to the dialer." : "Try another status filter."}
              />
            )}
          </div>
        </section>

        <section className="ld-card ld-card--fixed ld-calls-box">
          <CardHead icon={Radio} tone="bad" title="Live calls" sub={`${calls.length} active`} />
          <div className="ld-pills">
            {[
              ["all", "All", calls.length],
              ["in", "Inbound", calls.filter((c) => c.dir === "IN").length],
              ["out", "Outbound", calls.filter((c) => c.dir === "OUT").length],
              ["long", `> ${LONG_CALL_SEC / 60} min`, calls.filter((c) => num(c.sec) > LONG_CALL_SEC).length],
            ].map(([k, label, n]) => (
              <button key={k} type="button" className={`ld-pill${callFilter === k ? " is-active" : ""}`} onClick={() => setCallFilter(k)}>
                {label} <b>{n}</b>
              </button>
            ))}
          </div>
          {notice && <div className={`ld-notice ld-notice--${notice.type}`}>{notice.text}</div>}
          <div className="ld-scroll">
            <table className="ld-table ld-table--calls ld-table--sticky">
              <thead>
                <tr><th>Agent</th><th>Number / Campaign</th><th>Time</th><th className="ld-right">Monitor</th></tr>
              </thead>
              <tbody>
                {shownCalls.map((c) => {
                  const busy = pending[c.id];
                  const confirming = confirmHang === c.id;
                  return (
                    <tr key={c.id}>
                      <td>
                        <div className="ld-person">
                          <i className="ld-avatar ld-st--oncall">{initialsOf(c.agent)}</i>
                          <div className="ld-person__text">
                            <div className="ld-strong ld-ellipsis">{c.agent}</div>
                            <div className="ld-mono ld-muted ld-small">{c.ext}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="ld-mono">{c.number}</div>
                        <div className="ld-small ld-muted ld-ellipsis">
                          <b className={`ld-dir ld-dir--${c.dir.toLowerCase()}`}>{c.dir}</b>
                          {c.campaign ? ` · ${c.campaign}` : ""}
                        </div>
                      </td>
                      <td>
                        <span className={`ld-timer${num(c.sec) > LONG_CALL_SEC ? " is-long" : ""}`}>{fmtClock(c.sec)}</span>
                      </td>
                      <td>
                        <div className="ld-actions">
                          <button type="button" className="ld-btn" title="Listen" disabled={!!busy} onClick={() => monitor(c, "listen")}>
                            <Headphones size={14} /><span className="ld-btn__label">{busy === "listen" ? "…" : "Listen"}</span>
                          </button>
                          <button type="button" className="ld-btn" title="Barge" disabled={!!busy} onClick={() => monitor(c, "barge")}>
                            <UserPlus size={14} /><span className="ld-btn__label">{busy === "barge" ? "…" : "Barge"}</span>
                          </button>
                          <button
                            type="button"
                            title={confirming ? "Click again to hang up" : "Hang up"}
                            className={`ld-btn ld-btn--danger${confirming ? " is-confirm" : ""}`}
                            disabled={!!busy}
                            onClick={() => monitor(c, "hangup")}
                          >
                            <PhoneOff size={14} />
                            <span className={confirming ? "" : "ld-btn__label"}>{busy === "hangup" ? "…" : confirming ? "Sure?" : "Hangup"}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!shownCalls.length && (
              <Empty
                icon={PhoneCall}
                title={callFilter === "all" ? "No active calls" : "No calls for this filter"}
                hint={callFilter === "all" ? "Live calls show up here with listen, barge and hangup controls." : undefined}
              />
            )}
          </div>
        </section>
      </div>

      {/* ---------- trend / agent status / dispositions ---------- */}
      <div className="ld-row ld-row--insights">
        <section className="ld-card ld-card--fixed">
          <CardHead icon={BarChart3} tone="primary" title={useHourly ? "Calls per hour" : "Calls per day"}>
            <div className="ld-seg">
              <button type="button" className={useHourly ? "is-active" : ""} onClick={() => setChartMode("hourly")}>Hourly</button>
              <button type="button" className={!useHourly ? "is-active" : ""} onClick={() => setChartMode("daily")}>Daily</button>
            </div>
            <div className="ld-legend">
              <span><i className="ld-sw ld-sw--1" />Answered</span>
              <span><i className="ld-sw ld-sw--2" />{useHourly ? "Missed" : "No answer"}</span>
            </div>
          </CardHead>
          <div className="ld-chart">
            {trendRows.length && trendTotal > 0
              ? <HourlyChart rows={trendRows} />
              : (
                <Empty
                  icon={BarChart3}
                  title={useHourly ? "No hourly data yet" : "No calls in this range yet"}
                  hint="The chart fills in as calls come through."
                />
              )}
          </div>
          <div className="ld-stats">
            <span>Peak <strong>{trendTotal > 0 ? peakLabel : NA}</strong></span>
            <span>Avg wait IB <strong className="ld-mono">{fmtClock(hourlySummary.avg_wait_ib_sec ?? kpis.avg_wait_ib_sec)}</strong></span>
            <span>Drop OB <strong className="ld-mono">{fmtPct(hourlySummary.drop_rate_ob ?? kpis.drop_rate_ob)}</strong></span>
          </div>
          <div className="ld-outcome" title={`Call outcome · ${PERIODS[period].label}`}>
            <div className="ld-outcome__bar">
              {fTot > 0 && (
                <>
                  <i style={{ width: `${pct(fAns, fTot)}%` }} className="ld-outcome__seg--ans" />
                  <i style={{ width: `${pct(fCan, fTot)}%` }} className="ld-outcome__seg--can" />
                  <i style={{ width: `${pct(fOth, fTot)}%` }} className="ld-outcome__seg--oth" />
                </>
              )}
            </div>
            <div className="ld-outcome__legend">
              <span><i className="ld-sw ld-sw--ans" />Ans <b>{fmtInt(fAns)}</b></span>
              <span><i className="ld-sw ld-sw--can" />Cancel <b>{fmtInt(fCan)}</b></span>
              <span><i className="ld-sw ld-sw--oth" />Other <b>{fmtInt(fOth)}</b></span>
            </div>
          </div>
        </section>

        <section className="ld-card ld-card--fixed">
          <CardHead icon={Activity} tone="good" title="Agent status" />
          <div className="ld-status">
            <StatusDonut items={donutItems} total={loggedIn} />
            <ul className="ld-status__list">
              {donutItems.map((d) => (
                <li key={d.key}>
                  <button
                    type="button"
                    className={`ld-st--${d.key}${agentFilter === d.key ? " is-active" : ""}`}
                    onClick={() => setAgentFilter(agentFilter === d.key ? "all" : d.key)}
                  >
                    <span className="ld-dot" />
                    <span>{d.label}</span>
                    <strong className="ld-mono">{d.value}</strong>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="ld-subhead">
            <h4>Waiting in queue</h4>
            <span className={`ld-count${inQueue ? " is-hot" : ""}`}>{inQueue}</span>
          </div>
          <div className="ld-queue ld-scroll">
            {queue.map((q) => (
              <div key={q.id} className="ld-queue__row">
                <span className="ld-mono">{q.number}</span>
                <span className="ld-muted">{q.queue}</span>
                <span className={`ld-mono ld-right${num(q.sec) > QUEUE_RED_SEC ? " ld-tone--bad ld-strong" : ""}`}>{fmtClock(q.sec)}</span>
              </div>
            ))}
            {!queue.length && <Empty compact icon={Hourglass} title="Nobody waiting" />}
          </div>
        </section>

        <section className="ld-card ld-card--fixed">
          <CardHead icon={ListChecks} tone="violet" title="Dispositions" sub={PERIODS[period].label.toLowerCase()}>
            {totalDispo > 0 && <span className="ld-badge">{fmtInt(totalDispo)}</span>}
          </CardHead>
          <div className="ld-dispo ld-scroll">
            {dispositions.map((d, i) => (
              <div key={d.name} className="ld-dispo__row">
                <span className="ld-dispo__name" title={d.name}>{d.name}</span>
                <span className="ld-dispo__track">
                  <i style={{ width: `${(d.count / maxDispo) * 100}%`, opacity: 1 - Math.min(i, 6) * 0.1 }} />
                </span>
                <strong className="ld-mono ld-right">{fmtInt(d.count)}</strong>
              </div>
            ))}
            {!dispositions.length && (
              <Empty icon={ListChecks} title="No dispositions yet" hint="Outcomes agents save after calls are counted here." />
            )}
          </div>
        </section>
      </div>

      {/* ---------- campaigns + top agents ---------- */}
      <div className="ld-row ld-row--bottom">
        <section className="ld-card ld-card--fixed ld-campaigns-box">
          <CardHead icon={Megaphone} tone="amber" title="Campaign performance" sub="dialer health per campaign" />
          <div className="ld-scroll">
            <table className="ld-table ld-table--sticky">
              <thead>
                <tr>
                  <th>Campaign</th><th className="ld-right">Dialed</th><th className="ld-right">Connected</th>
                  <th className="ld-right">Connect %</th><th className="ld-right ld-col-aht">AHT</th><th className="ld-right ld-col-agt">Agt</th>
                  <th className="ld-right">Leads left</th><th className="ld-col-progress">Progress</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.name} className={campaign !== "all" && campaign === c.name ? "is-selected" : ""}>
                    <td>
                      <div className="ld-strong">{c.name}</div>
                      {c.method && <div className="ld-small ld-muted">{c.method}</div>}
                    </td>
                    <td className="ld-mono ld-right">{fmtInt(c.dialed)}</td>
                    <td className="ld-mono ld-right">{fmtInt(c.connected)}</td>
                    <td className="ld-mono ld-right">{c.connectPct === null ? NA : fmtPct(c.connectPct)}</td>
                    <td className="ld-mono ld-right ld-col-aht">{fmtClock(c.aht)}</td>
                    <td className="ld-mono ld-right ld-col-agt">{has(c.agents) ? c.agents : NA}</td>
                    <td className="ld-mono ld-right">{has(c.leadsLeft) ? fmtInt(c.leadsLeft) : NA}</td>
                    <td className="ld-col-progress">
                      {has(c.progress) ? (
                        <span className="ld-progress">
                          <span className="ld-progress__track"><i style={{ width: `${Math.min(100, Math.max(0, c.progress))}%` }} /></span>
                          <span className="ld-mono ld-muted">{Math.round(c.progress)}%</span>
                        </span>
                      ) : <span className="ld-muted">{NA}</span>}
                    </td>
                    <td>
                      <span className={`ld-status-dot ld-tone--${campaignStatusTone(c.status)}`}>
                        <i />{c.status || NA}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!campaigns.length && (
              <Empty icon={Megaphone} title="No campaign data yet" hint="Needs the /dashboard/campaign-performance API." />
            )}
          </div>
        </section>

        <section className="ld-card ld-card--fixed">
          <CardHead icon={Trophy} tone="amber" title="Top agents" sub={PERIODS[period].label.toLowerCase()} />
          <div className="ld-scroll">
            <table className="ld-table ld-table--sticky">
              <thead>
                <tr><th>#</th><th>Agent</th><th className="ld-right">Calls</th><th className="ld-right">Talk time</th><th className="ld-right">Sales</th></tr>
              </thead>
              <tbody>
                {topAgents.map((a, i) => (
                  <tr key={a.name ?? i}>
                    <td><span className={`ld-rank ld-rank--${i + 1}`}>{i + 1}</span></td>
                    <td>
                      <div className="ld-person">
                        <i className="ld-avatar">{initialsOf(a.name)}</i>
                        <div className="ld-person__text">
                          <div className="ld-strong ld-ellipsis">{a.name}</div>
                          {has(a.percentage) && (
                            <span className="ld-share"><i style={{ width: `${Math.min(100, num(a.percentage))}%` }} /></span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="ld-mono ld-right">{fmtInt(a.calls)}</td>
                    <td className="ld-mono ld-right">{fmtHMS(a.talk_time_sec)}</td>
                    <td className="ld-mono ld-right">{has(a.sales) ? a.sales : NA}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!topAgents.length && <Empty icon={Trophy} title="No callers yet" hint="The leaderboard ranks agents by calls made." />}
          </div>
        </section>
      </div>

      {/* ---------- full agent summary (existing /agent-summary data) ---------- */}
      <details className="ld-card ld-details">
        <summary>
          <span className="ld-card__icon ld-ic--slate"><ClipboardList size={15} strokeWidth={2.2} /></span>
          <span className="ld-card__title">Agent summary</span>
          <span className="ld-card__sub">login / logout, auto-dial and call counts for every agent</span>
          <ChevronDown size={16} className="ld-details__chev" />
        </summary>
        <div className="ld-scroll ld-scroll--summary">
          <table className="ld-table ld-table--sticky">
            <thead>
              <tr>
                <th>Agent</th><th>Status</th><th>Login</th><th>Logout</th><th>Duration</th><th>Auto dial</th>
                <th className="ld-right">Answered</th><th className="ld-right">Cancelled</th><th className="ld-right">Other</th><th className="ld-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {(data.summary || []).map((a) => (
                <tr key={a.user_id}>
                  <td className="ld-strong">{a.user_id}</td>
                  <td><span className={`ld-chip ${legacyChip(a.break_name)}`}>{a.break_name || "Log Off"}</span></td>
                  <td className="ld-small">{fmtDateTime(a.log_in_time)}</td>
                  <td className="ld-small">{fmtDateTime(a.log_out_time)}</td>
                  <td className="ld-mono">{a.login_duration_seconds || "00:00:00"}</td>
                  <td><span className={`ld-chip ${a.auto_dial_on ? "ld-st--ready" : "ld-st--pause"}`}>{a.auto_dial_on ? "ON" : "OFF"}</span></td>
                  <td className="ld-mono ld-right">{a.answer_calls}</td>
                  <td className="ld-mono ld-right">{a.cancel_calls}</td>
                  <td className="ld-mono ld-right">{a.other_calls}</td>
                  <td className="ld-mono ld-right ld-strong">{a.total_calls}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!(data.summary || []).length && <Empty icon={ClipboardList} title="No agent activity yet" />}
        </div>
      </details>
    </div>
  );
}