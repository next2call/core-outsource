import { useState, useEffect } from "react";
import {
  PhoneCall, PhoneIncoming, PhoneOutgoing, PhoneMissed, PhoneOff,
  ListOrdered, Users, UserCheck, UserMinus, Headphones, TrendingUp, MoreHorizontal,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import "./home.scss";


import { useContext } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/authContext";
import { PopupContext } from "../../context/iframeContext";
import api from "../../api/api";

const token = localStorage.getItem("token");

export default function Home() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const { toggleIframe } = useContext(PopupContext);

  const [range, setRange] = useState("day");
  const [topCallers, setTopCallers] = useState([]);
  const [callCounts, setCallCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [featureFilter, setFeatureFilter] = useState("all");
  const [featureData, setFeatureData] = useState({
    answerCall: 0,
    cancelCall: 0,
    otherCall: 0,
  });
  const [campaignData, setCampaignData] = useState([]);
  const [agentSummary, setAgentSummary] = useState([]);

  const iframeTypes = ["callQueue", "loginAgent", "availableAgent", "pauseAgent", "inCall"];

  const handleWidgetClick = (type) => {
    if (iframeTypes.includes(type)) {
      toggleIframe("call");
    } else {
      let basePath = "";

      switch (user?.user_type) {
        case "8":
          basePath = "admin";
          break;
        case "2":
          basePath = "team_leader";
          break;
        case "9":
          basePath = "superadmin";
          break;
        case "7":
          basePath = "manager";
          break;
        default:
          basePath = "agent";
      }

      navigate(`/${basePath}/data/${type}`);
    }
  };

  const formatDelta = (pct) => {
    if (pct === undefined || pct === null) return null;
    const trend = pct >= 0 ? "up" : "down";
    const sign = pct >= 0 ? "+" : "";
    return { delta: `${sign}${pct}%`, trend };
  };

  const changes = callCounts.changes || {};

  const widgets = [
    {
      key: "totalCall",
      title: "Total Calls",
      value: loading ? "..." : callCounts.totalCall || 0,
      ...formatDelta(changes.totalCall),
      icon: PhoneCall,
      tint: "tint--orange",
      iconColor: "icon--orange",
    },
    {
      key: "answerCall",
      title: "Answered",
      value: loading ? "..." : callCounts.answerCall || 0,
      ...formatDelta(changes.answerCall),
      icon: PhoneIncoming,
      tint: "tint--emerald",
      iconColor: "icon--emerald",
    },
    {
      key: "cancelCall",
      title: "Cancelled",
      value: loading ? "..." : callCounts.cancelCall || 0,
      ...formatDelta(changes.cancelCall),
      icon: PhoneOff,
      tint: "tint--rose",
      iconColor: "icon--rose",
    },
    {
      key: "otherCall",
      title: "Other",
      value: loading ? "..." : callCounts.otherCall || 0,
      ...formatDelta(changes.otherCall),
      icon: MoreHorizontal,
      tint: "tint--cyan",
      iconColor: "icon--cyan",
    },
    {
      key: "outboundCall",
      title: "Outbound",
      value: loading ? "..." : callCounts.outboundCall || 0,
      ...formatDelta(changes.outboundCall),
      icon: PhoneOutgoing,
      tint: "tint--indigo",
      iconColor: "icon--indigo",
    },
    {
      key: "inboundCall",
      title: "Inbound",
      value: loading ? "..." : callCounts.inboundCall || 0,
      ...formatDelta(changes.inboundCall),
      icon: PhoneIncoming,
      tint: "tint--lime",
      iconColor: "icon--lime",
    },
    {
      key: "noAnswerCall",
      title: "No Answer",
      value: loading ? "..." : callCounts.noAnswerCall || 0,
      ...formatDelta(changes.noAnswerCall),
      icon: PhoneMissed,
      tint: "tint--amber",
      iconColor: "icon--amber",
    },
    // live snapshots — no delta, backend doesn't compute one for these
    {
      key: "callQueue",
      title: "In Queue",
      value: loading ? "..." : callCounts.callQueue || 0,
      icon: ListOrdered,
      tint: "tint--purple",
      iconColor: "icon--purple",
    },
    {
      key: "loginAgent",
      title: "Logged-in Agents",
      value: loading ? "..." : callCounts.loginAgent || 0,
      icon: Users,
      tint: "tint--violet",
      iconColor: "icon--violet",
    },
    {
      key: "availableAgent",
      title: "Available",
      value: loading ? "..." : callCounts.availableAgent || 0,
      icon: UserCheck,
      tint: "tint--teal",
      iconColor: "icon--teal",
    },
    {
      key: "pauseAgent",
      title: "Paused",
      value: loading ? "..." : callCounts.pauseAgent || 0,
      icon: UserMinus,
      tint: "tint--slate",
      iconColor: "icon--slate",
    },
    {
      key: "inCall",
      title: "In Call",
      value: loading ? "..." : callCounts.inCall || 0,
      icon: Headphones,
      tint: "tint--sky",
      iconColor: "icon--sky",
    },
  ];
  const featureChartData = [
    {
      name: "Answered",
      calls: featureData.answerCall,
    },
    {
      name: "Cancelled",
      calls: featureData.cancelCall,
    },
    {
      name: "Other",
      calls: featureData.otherCall,
    },
  ];

  useEffect(() => {
    if (!token) return;

    const fetchAll = () => {
      api.get("/call-counts-per").then(res => setCallCounts(res.data));
      api.get(`/top-caller?range=${range}`).then(res => setTopCallers(res.data));
      api.get(`/feature/${featureFilter}`).then(res => setFeatureData(res.data));
      api.get("/chart-data").then(res => setCampaignData(res.data));
      api.get("/agent-summary").then(res => setAgentSummary(res.data || []));
    };

    // initial fetch — turn off loading once callCounts resolves
    api.get("/call-counts")
      .then(res => setCallCounts(res.data))
      .finally(() => setLoading(false));

    api.get(`/top-caller?range=${range}`).then(res => setTopCallers(res.data));
    api.get(`/feature/${featureFilter}`).then(res => setFeatureData(res.data));
    api.get("/chart-data").then(res => setCampaignData(res.data));
    api.get("/agent-summary").then(res => setAgentSummary(res.data || []));

    const interval = setInterval(fetchAll, 3000);

    return () => clearInterval(interval);
  }, [range, featureFilter]);

  const hasCampaignData = campaignData.length > 0;

  const getStatusClass = (status) => {
    switch (status) {
      case "Ready":
        return "chip--emerald";

      case "Log Off":
        return "chip--rose";

      case "Lunch Break":
        return "chip--amber";

      case "Bio Break":
        return "chip--amber";

      case "Mobile":
        return "chip--indigo";

      default:
        return "chip--slate";
    }
  };

  const formatDateTime = (date) => {
    if (!date) return "-";

    return new Date(date).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="home">
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Live overview</h1>
          <p className="page-header__subtitle">
            Real-time pulse of your call center — updated every few seconds.
          </p>
        </div>
        {/* <div className="live-badge">
          <span className="live-badge__dot">
            <span className="live-badge__ping" />
            <span className="live-badge__core" />
          </span>
          Streaming live
        </div> */}
      </div>

      {/* Widgets grid */}
      <div className="widgets-grid">
        {widgets.map((w) => (
          <button
            key={w.key}
            className="widget"
            onClick={() => handleWidgetClick(w.key)}
          >
            <div className="widget__top">
              <div className={`widget__icon ${w.tint}`}>
                <w.icon className={`widget__icon-svg ${w.iconColor}`} />
              </div>
              {w.delta && (
                <span className={`widget__delta ${w.trend === "up" ? "widget__delta--up" : "widget__delta--down"}`}>
                  <TrendingUp className={`widget__delta-icon ${w.trend === "down" ? "is-flipped" : ""}`} />
                  {w.delta}
                </span>
              )}
            </div>
            <p className="widget__value">{w.value}</p>
            <p className="widget__title">{w.title}</p>
          </button>
        ))}
      </div>

      {/* Charts row */}
      <div className="charts-row">
        {/* Top callers */}
        <div className="card">
          <div className="card__header">
            <div>
              <h3 className="card__title">Top Callers</h3>
              <p className="card__subtitle">Highest volume this {range}</p>
            </div>
            <select
              value={range}
              onChange={(e) => setRange(e.target.value)}
              className="select"
            >
              <option value="day">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </select>
          </div>
          <div className="callers">
            {topCallers.length > 0 ? (
              topCallers.map((c) => (
                <div key={c.name} className="caller">
                  <div className="caller__row">
                    <span className="caller__name">{c.name}</span>
                    <span className="caller__meta">
                      {c.calls}
                      <span className="caller__meta-muted"> · {c.percentage}%</span>
                    </span>
                  </div>

                  <div className="caller__bar">
                    <div
                      className="caller__bar-fill"
                      style={{
                        width: `${c.percentage}%`,
                        backgroundColor: c.color,
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="caller__empty">No callers found.</p>
            )}
          </div>
        </div>

        <div className="card">

          <div className="card__header">
            <div>
              <h3 className="card__title">Call Status</h3>
              <p className="card__subtitle">
                Answered vs Cancelled vs Other
              </p>
            </div>

            <select
              value={featureFilter}
              onChange={(e) => setFeatureFilter(e.target.value)}
              className="select"
            >
              <option value="all">All</option>
              <option value="today">Today</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          <p className="card__big-value">
            {featureData.answerCall +
              featureData.cancelCall +
              featureData.otherCall}
          </p>
          <p className="card__big-delta">
            Answered: {featureData.answerCall} •
            Cancelled: {featureData.cancelCall} •
            Other: {featureData.otherCall}
          </p>
          <div className="chart chart--sm">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={featureChartData}
                margin={{ top: 5, right: 0, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#4f46e5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value) => [`${value} Calls`, "Total"]}
                  contentStyle={{
                    borderRadius: 12,
                    border: "none",
                    boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
                  }}
                  cursor={{
                    stroke: "#6366f1",
                    strokeWidth: 2,
                  }}
                />
                <Area type="monotone" dataKey="calls" stroke="#6366f1" strokeWidth={3} fill="url(#g1)" activeDot={{ r: 6, fill: "#6366f1", stroke: "#fff", strokeWidth: 2, }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card__header card__header--tight">
            <div>
              <h3 className="card__title">Campaign Performance</h3>
              <p className="card__subtitle">Inbound vs outbound</p>
            </div>
            <div className="legend">
              <span className="legend__item">
                <span className="legend__dot legend__dot--indigo" />Inbound
              </span>
              <span className="legend__item">
                <span className="legend__dot legend__dot--emerald" />Outbound
              </span>
            </div>
          </div>
          <div className="chart chart--md">
            {hasCampaignData ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={campaignData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} cursor={{ fill: "#eef2ff" }} />
                  <Bar
                    dataKey="interested"
                    fill="#3b82f6"
                    radius={[4, 4, 0, 0]}
                  />

                  <Bar
                    dataKey="not_interested"
                    fill="#ef4444"
                    radius={[4, 4, 0, 0]}
                  />

                  <Bar
                    dataKey="answer"
                    fill="#4f46e5"
                    radius={[4, 4, 0, 0]}
                  />

                  <Bar
                    dataKey="no_answer"
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="chart__empty">
                No campaign data available
              </div>
            )}
          </div>
        </div>


      </div>

      {/* Recent calls table */}
      <div className="table-card">
        <div className="table-card__header">
          <div>
            <h3 className="card__title">Agent Summary</h3>
            <p className="card__subtitle">Latest activity across all agents</p>
          </div>
          <button className="link-btn">Live Data</button>
        </div>
        <div className="table-scroll">
          <table className="table">
            <thead className="table__head">
              <tr>
                <th>Agent</th>
                <th className="col-status">Status</th>
                <th className="col-login">Login</th>
                <th className="col-logout">Logout</th>
                <th>Duration</th>
                <th>Auto Dial</th>
                <th className="col-calls">Answered</th>
                <th className="col-calls">Cancelled</th>
                <th className="col-calls">Other</th>
                <th className="col-calls">Total</th>
              </tr>
            </thead>

            <tbody className="table__body">
              {agentSummary.map((agent) => (
                <tr key={agent.user_id}>
                  <td className="td--strong">{agent.user_id}</td>

                  <td className="col-status">
                    <span className={`chip ${getStatusClass(agent.break_name || "Log Off")}`}>
                      {agent.break_name || "Log Off"}
                    </span>
                  </td>

                  <td className="col-login">{formatDateTime(agent.log_in_time)}</td>

                  <td className="col-logout">{formatDateTime(agent.log_out_time)}</td>

                  <td>{agent.login_duration_seconds || "00:00:00"}</td>

                  <td>
                    <span
                      className={`chip ${agent.auto_dial_on ? "chip--emerald" : "chip--rose"
                        }`}
                    >
                      {agent.auto_dial_on ? "ON" : "OFF"}
                    </span>
                  </td>

                  <td className="col-calls">{agent.answer_calls}</td>

                  <td className="col-calls">{agent.cancel_calls}</td>

                  <td className="col-calls">{agent.other_calls}</td>

                  <td className="col-calls td--strong">{agent.total_calls}</td>
                </tr>
              ))}
            </tbody>


          </table>
        </div>
      </div>
    </div>
  );
}
