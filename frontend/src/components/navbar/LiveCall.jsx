import { useState, useRef, useEffect, useContext, useMemo } from "react";
import "./navbar.scss";
import "./liveCalls.scss";
import axios from "axios";
import moment from "moment";
import { Tooltip } from "@mui/material";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faAssistiveListeningSystems,
  faPhoneSquare,
  faUser,
  faPhoneSlash,
} from "@fortawesome/free-solid-svg-icons";
import {
  MdCall,
  MdClose,
  MdSearch,
  MdCallMade,
  MdCallReceived,
  MdLogin,
  MdCheckCircleOutline,
  MdPauseCircleOutline,
  MdPhoneInTalk,
  MdPhoneForwarded,
  MdQueue,
  MdPeopleOutline,
  MdViewHeadline,
  MdViewStream,
} from "react-icons/md";
import { AuthContext } from "../../context/authContext";
import { PopupContext } from "../../context/iframeContext";
import api from "../../api/api";

/* ---------- config ---------- */

const COUNTERS = [
  { label: "Logged In", key: "login", className: "login", Icon: MdLogin },
  { label: "Available", key: "available", className: "available", Icon: MdCheckCircleOutline },
  { label: "Pause", key: "pause", className: "pause", Icon: MdPauseCircleOutline },
  { label: "In Call", key: "in_call", className: "in-call", Icon: MdPhoneInTalk },
  { label: "Dialing", key: "call_dialing", className: "call-dialing", Icon: MdPhoneForwarded },
  { label: "In Queue", key: "call_queue", className: "call-queue", Icon: MdQueue },
  { label: "Total Leads", key: "total_leads", className: "leads", Icon: MdPeopleOutline },
];

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "answer", label: "Answered" },
  { key: "ringing", label: "Ringing" },
  { key: "other", label: "Other" },
];

const POLL_MS = 5000;

const statusClass = (status) => {
  const s = status?.toLowerCase();
  if (s === "answer") return "success";
  if (s === "ringing") return "warning";
  return "danger";
};

const formatSecs = (secs) =>
  [Math.floor(secs / 3600), Math.floor((secs % 3600) / 60), secs % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");

const readDense = () => {
  try {
    return localStorage.getItem("liveCallsDense") !== "0";
  } catch {
    return true;
  }
};

/* ---------- component ---------- */

const PopupIframe = ({ visible, toggleVisibility }) => {
  const { user } = useContext(AuthContext);
  const { updateIframeSrc, toggleIframe, popupState } = useContext(PopupContext);

  const [counters, setCounters] = useState({});
  const [liveCalls, setLiveCalls] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dense, setDense] = useState(readDense);
  const [now, setNow] = useState(Date.now());

  // uniqueid -> time we first saw the call as "answer"
  const answerTimesRef = useRef({});

  /* Agent status + leads counters */
  useEffect(() => {
    if (!visible) return;

    const fetchCounters = async () => {
      if (!localStorage.getItem("token")) return;
      const [statusRes, leadsRes] = await Promise.allSettled([
        api.get("/agent-status"),
        api.get("/fetch-leads"),
      ]);
      // keep the previous value for any key the API didn't return
      setCounters((prev) => ({
        ...prev,
        ...(statusRes.status === "fulfilled" ? statusRes.value.data : {}),
        ...(leadsRes.status === "fulfilled" ? leadsRes.value.data : {}),
      }));
    };

    fetchCounters();
    const id = setInterval(fetchCounters, POLL_MS);
    return () => clearInterval(id);
  }, [visible]);

  /* Live calls */
  useEffect(() => {
    if (!visible) return;

    const fetchLiveCalls = async () => {
      try {
        const res = await api.get("/live-calls");
        const calls = Array.isArray(res.data) ? res.data : [];
        const times = answerTimesRef.current;
        const active = new Set();

        calls.forEach((call) => {
          const id = String(call.uniqueid);
          active.add(id);
          if (call.status?.toLowerCase() === "answer" && !times[id]) {
            times[id] = Date.now();
          }
        });
        // forget calls that have ended
        Object.keys(times).forEach((id) => {
          if (!active.has(id)) delete times[id];
        });

        setLiveCalls(calls);
        setLastUpdated(new Date());
      } catch (err) {
        if (err.response?.status === 401) localStorage.removeItem("token");
        else if (err.response?.status === 404) setLiveCalls([]);
        else console.error("Live call error:", err);
      }
    };

    fetchLiveCalls();
    const id = setInterval(fetchLiveCalls, POLL_MS);
    return () => clearInterval(id);
  }, [visible]);

  /* 1s tick so durations count up smoothly between polls */
  useEffect(() => {
    if (!visible) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [visible]);

  /* Esc closes the popup */
  useEffect(() => {
    if (!visible) return;
    const onKey = (e) => e.key === "Escape" && toggleVisibility();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, toggleVisibility]);

  const toggleDense = () => {
    setDense((d) => {
      try {
        localStorage.setItem("liveCallsDense", d ? "0" : "1");
      } catch {}
      return !d;
    });
  };

  const statusCounts = useMemo(() => {
    const c = { all: liveCalls.length, answer: 0, ringing: 0, other: 0 };
    liveCalls.forEach((call) => {
      const s = call.status?.toLowerCase();
      if (s === "answer") c.answer++;
      else if (s === "ringing") c.ringing++;
      else c.other++;
    });
    return c;
  }, [liveCalls]);

  const filteredCalls = useMemo(() => {
    const q = search.trim().toLowerCase();
    return liveCalls.filter((call) => {
      const s = call.status?.toLowerCase();
      if (statusFilter === "answer" && s !== "answer") return false;
      if (statusFilter === "ringing" && s !== "ringing") return false;
      if (statusFilter === "other" && (s === "answer" || s === "ringing")) return false;
      if (!q) return true;
      return [call.Agent_name, call.Agent, call.call_from, call.call_to].some((v) =>
        String(v ?? "").toLowerCase().includes(q)
      );
    });
  }, [liveCalls, search, statusFilter]);

  const handleCallAction = async (agentNumber, actionType, channel = null) => {
    if (actionType === "hangup") {
      if (!channel) return alert("Missing channel.");
      if (!window.confirm(`Hang up agent ${agentNumber}'s call?`)) return;
      try {
        const res = await axios.get(
          `http://${window.location.hostname}/telephony_api/admin_call_hangup.php?channel=${encodeURIComponent(
            channel
          )}`
        );
        alert(res.data.status === "success" ? "Hung up." : res.data.message);
      } catch {
        alert("Hangup failed.");
      }
      return;
    }

    const prefix = actionType === "listen" ? "97" : actionType === "barge" ? "98" : "99";
    const dialNumber = `${prefix}${agentNumber}`;
    const { user_id, password, full_name } = user;
    const domain = window.location.hostname;
    const url = `https://${domain}/softphone/Phone/click-wisper.html?profileName=${full_name}&SipDomain=${domain}&SipUsername=${user_id}&SipPassword=${password}&d=${dialNumber}`;
    updateIframeSrc(url);
    toggleIframe("phone");
  };

  const calculateDuration = (call) => {
    const start = answerTimesRef.current[String(call.uniqueid)];
    if (call.status?.toLowerCase() !== "answer" || !start) return null;
    return formatSecs(Math.max(0, Math.floor((now - start) / 1000)));
  };

  return (
    <>
      {visible && (
        <div className="lc-overlay" onClick={toggleVisibility}>
          <div className="lc-popup" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="lc-header">
              <div className="lc-title">
                <div className="lc-title-icon">
                  <MdPhoneInTalk />
                </div>
                <div>
                  <h2>Live Calls</h2>
                  <p>Monitor all active agent calls in real-time</p>
                </div>
              </div>

              <div className="lc-header-right">
                <span className="lc-live-pill">
                  <i />
                  Live
                  {lastUpdated && <em>· {moment(lastUpdated).format("HH:mm:ss")}</em>}
                </span>

                <Tooltip title={dense ? "Comfortable rows" : "Compact rows"}>
                  <button className="lc-icon-btn" onClick={toggleDense}>
                    {dense ? <MdViewStream /> : <MdViewHeadline />}
                  </button>
                </Tooltip>

                <button className="lc-icon-btn" onClick={toggleVisibility} aria-label="Close">
                  <MdClose />
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="lc-stats">
              {COUNTERS.map(({ label, key, className, Icon }) => (
                <div key={key} className={`lc-stat ${className}`}>
                  <div className="lc-stat-icon">
                    <Icon />
                  </div>
                  <div className="lc-stat-body">
                    <span className="lc-stat-label">{label}</span>
                    <span className="lc-stat-value">{counters[key] ?? 0}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Toolbar */}
            <div className="lc-toolbar">
              <label className="lc-search">
                <MdSearch />
                <input
                  type="text"
                  placeholder="Search agent, ID or number…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button className="lc-search-clear" onClick={() => setSearch("")}>
                    <MdClose />
                  </button>
                )}
              </label>

              <div className="lc-chips">
                {STATUS_FILTERS.map((f) => (
                  <button
                    key={f.key}
                    className={`lc-chip ${f.key} ${statusFilter === f.key ? "active" : ""}`}
                    onClick={() => setStatusFilter(f.key)}
                  >
                    {f.label}
                    <span>{statusCounts[f.key]}</span>
                  </button>
                ))}
              </div>

              <div className="lc-toolbar-meta">
                Showing <b>{filteredCalls.length}</b> of <b>{liveCalls.length}</b> calls
              </div>
            </div>

            {/* Table */}
            <div className="lc-table-wrap">
              <table className={`lc-table ${dense ? "lc-table--dense" : ""}`}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Start</th>
                    <th>Agent</th>
                    <th>Agent ID</th>
                    <th>Caller</th>
                    <th>Receiver</th>
                    <th>Status</th>
                    <th>Duration</th>
                    <th>Direction</th>
                    <th className="right">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredCalls.length ? (
                    filteredCalls.map((call, index) => {
                      const duration = calculateDuration(call);
                      const outbound = call.direction === "outbound";
                      return (
                        <tr key={call.uniqueid}>
                          <td className="num">{index + 1}</td>
                          <td className="mono">{moment(call.time).format("HH:mm:ss")}</td>
                          <td>
                            <div className="lc-agent">
                              <span className="lc-avatar">
                                {(call.Agent_name || "?").charAt(0).toUpperCase()}
                              </span>
                              <strong title={call.Agent_name}>{call.Agent_name || "--"}</strong>
                            </div>
                          </td>
                          <td className="mono">{call.Agent}</td>
                          <td className="mono">{call.call_from}</td>
                          <td className="mono">{call.call_to}</td>
                          <td>
                            <span className={`lc-badge ${statusClass(call.status)}`}>
                              {call.status || "N/A"}
                            </span>
                          </td>
                          <td className={`mono lc-duration ${duration ? "" : "idle"}`}>
                            {duration || "--:--:--"}
                          </td>
                          <td>
                            <span className={`lc-dir ${outbound ? "outbound" : "inbound"}`}>
                              {outbound ? <MdCallMade /> : <MdCallReceived />}
                              {call.direction || "inbound"}
                            </span>
                          </td>
                          <td className="right">
                            <div className="lc-actions">
                              <Tooltip title="Listen">
                                <button
                                  className="lc-act listen"
                                  onClick={() => handleCallAction(call.Agent, "listen")}
                                >
                                  <FontAwesomeIcon icon={faAssistiveListeningSystems} />
                                </button>
                              </Tooltip>
                              <Tooltip title="Barge">
                                <button
                                  className="lc-act barge"
                                  onClick={() => handleCallAction(call.Agent, "barge")}
                                >
                                  <FontAwesomeIcon icon={faPhoneSquare} />
                                </button>
                              </Tooltip>
                              <Tooltip title="Whisper">
                                <button
                                  className="lc-act whisper"
                                  onClick={() => handleCallAction(call.Agent, "whisper")}
                                >
                                  <FontAwesomeIcon icon={faUser} />
                                </button>
                              </Tooltip>
                              <Tooltip title="Hangup">
                                <button
                                  className="lc-act hangup"
                                  onClick={() =>
                                    handleCallAction(call.Agent, "hangup", call.channel)
                                  }
                                >
                                  <FontAwesomeIcon icon={faPhoneSlash} />
                                </button>
                              </Tooltip>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={10} className="lc-empty-cell">
                        <div className="lc-empty">
                          <div className="lc-empty-icon">
                            <MdCall />
                          </div>
                          <h3>{liveCalls.length ? "No matching calls" : "No Live Calls"}</h3>
                          <p>
                            {liveCalls.length
                              ? "Try a different search or status filter."
                              : "There are currently no active calls."}
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {popupState.phone}
    </>
  );
};

export default PopupIframe;