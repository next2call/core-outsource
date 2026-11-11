import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Swal from "sweetalert2";
import {
  Search,
  Plus,
  Eye,
  Pencil,
  Trash2,
  LogOut,
  X,
  ChevronLeft,
  ChevronRight,
  Copy,
  KeyRound,
  Users,
  CheckCircle2,
  Radio,
  Headset,
} from "lucide-react";
import { AuthContext } from "../../context/authContext";
import EditAgent from "./EditAgent";
import AddUserForm from "../../pages/new/New";
import "./datatable.scss";

/* ------------------------------------------------------------------ */
/*  Static maps                                                        */
/* ------------------------------------------------------------------ */
const USER_TYPE = {
  1: { label: "Agent", color: "#10b981" },
  2: { label: "Team Leader", color: "#0ea5e9" },
  5: { label: "IT", color: "#64748b" },
  6: { label: "Quality Analyst", color: "#f59e0b" },
  7: { label: "Manager", color: "#a855f7" },
  8: { label: "Admin", color: "#4f46e5" },
};
const PAGE_SIZES = [5, 10, 25, 50, 100];
// The full user list is only re-loaded every 5 minutes (names, campaigns,
// status...). Login / Logout comes live from the status stream instead.
const LIST_REFRESH_MS = 5 * 60 * 1000;
const STATUS_FALLBACK_MS = 15000; // only used if the live stream can't connect
const NA = "–";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const api = (path) => `https://${window.location.hostname}:4000${path}`;
const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

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

/* SweetAlert that follows the CRM theme */
const swal = (opts) => {
  const { bg, dark } = surfaceOf(document.querySelector(".ut-modal") || document.querySelector(".ut-card") || document.body);
  return Swal.fire({
    background: dark ? bg : "#fff",
    color: dark ? "#e5e7eb" : "#1f2937",
    confirmButtonColor: "#4f46e5",
    cancelButtonColor: dark ? "#374151" : "#64748b",
    ...opts,
  });
};
const toast = (icon, title) =>
  swal({ toast: true, position: "top-end", icon, title, showConfirmButton: false, timer: 2500, timerProgressBar: true });

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

const campaignList = (v) => (Array.isArray(v) ? v : v ? String(v).split(",").map((x) => x.trim()).filter(Boolean) : []);

const isLoggedIn = (u) => {
  const s = (u.loginStatus || "").toLowerCase();
  return s.includes("in") && !s.includes("out");
};

/* ------------------------------------------------------------------ */
/*  Live login status (Server-Sent Events over fetch, so the normal     */
/*  Authorization header is sent - no token in the URL)                 */
/* ------------------------------------------------------------------ */
function useAgentLiveStatus() {
  const [online, setOnline] = useState(null); // Set of user_ids, null until first data
  const [live, setLive] = useState(false);

  useEffect(() => {
    let stopped = false;
    let ctrl = null;
    let retryTimer = null;
    let fallbackTimer = null;
    let failures = 0;

    const apply = (msg) => {
      if (msg.type === "snapshot") {
        setOnline(new Set(msg.online.map(String)));
      } else if (msg.type === "change") {
        setOnline((prev) => {
          const next = new Set(prev || []);
          (msg.online || []).forEach((id) => next.add(String(id)));
          (msg.offline || []).forEach((id) => next.delete(String(id)));
          return next;
        });
      }
    };

    // one-off light request, used only while the stream is down
    const pollOnce = async () => {
      try {
        const res = await axios.get(api("/telephony/agents/login-status"), { headers: authHeader() });
        if (!stopped) setOnline(new Set((res.data.online || []).map(String)));
      } catch {
        /* keep last known state */
      }
    };
    const startFallback = () => {
      if (fallbackTimer) return;
      pollOnce();
      fallbackTimer = setInterval(pollOnce, STATUS_FALLBACK_MS);
    };
    const stopFallback = () => {
      clearInterval(fallbackTimer);
      fallbackTimer = null;
    };

    const connect = async () => {
      if (stopped) return;
      ctrl = new AbortController();
      try {
        const res = await fetch(api("/telephony/agents/status-stream"), {
          headers: { ...authHeader(), Accept: "text/event-stream" },
          signal: ctrl.signal,
          cache: "no-store",
        });
        if (res.status === 401 || res.status === 403) return; // not allowed: keep normal list data
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

        failures = 0;
        stopFallback();
        setLive(true);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf("\n\n")) !== -1) {
            const block = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const data = block
              .split("\n")
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5).trim())
              .join("\n");
            if (data) {
              try {
                apply(JSON.parse(data));
              } catch {
                /* ignore a bad message */
              }
            }
          }
        }
      } catch (e) {
        if (stopped || e.name === "AbortError") return;
      }
      // stream ended or failed: reconnect with back-off, poll lightly meanwhile
      setLive(false);
      failures += 1;
      if (failures >= 2) startFallback();
      retryTimer = setTimeout(connect, Math.min(30000, 2000 * failures));
    };

    connect();
    return () => {
      stopped = true;
      if (ctrl) ctrl.abort();
      clearTimeout(retryTimer);
      stopFallback();
    };
  }, []);

  // optimistic updates for this page's own logout buttons
  const markOffline = (id) =>
    setOnline((prev) => {
      if (!prev) return prev;
      const next = new Set(prev);
      next.delete(String(id));
      return next;
    });
  const markAllOffline = () => setOnline((prev) => (prev ? new Set() : prev));

  return { online, live, markOffline, markAllOffline };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function Datatable() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [rawData, setData] = useState([]);
  const { online, live, markOffline, markAllOffline } = useAgentLiveStatus();
  // list + live login status (overrides the loginStatus that came with the list)
  const data = useMemo(
    () =>
      online
        ? rawData.map((u) => ({ ...u, loginStatus: online.has(String(u.user_id)) ? "Login" : "Logout" }))
        : rawData,
    [rawData, online]
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // all | online | inactive
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [formData, setFormData] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  /* ---------------- fetch users (auto-refresh) ---------------- */
  const fetchAgents = async () => {
    try {
      if (!localStorage.getItem("token")) {
        navigate("/login");
        return;
      }
      const res = await axios.get(api("/telephony/agents"), { headers: authHeader() });
      setData(Array.isArray(res.data) ? res.data : []);
      setError("");
    } catch (err) {
      setError(err?.response?.status === 404 ? "" : "Error fetching user data.");
      if (err?.response?.status === 404) setData([]);
    } finally {
      setLoading(false);
    }
  };

  // Load the list once, then only every 5 min and when the tab comes back
  // after being hidden for a while. Login status is live (see hook above).
  useEffect(() => {
    fetchAgents();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") fetchAgents();
    }, LIST_REFRESH_MS);
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 60000) fetchAgents();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- actions ---------------- */
  const toggleStatus = async (id) => {
    const flip = (u) => (u.user_id === id ? { ...u, status: u.status === "active" ? "inactive" : "active" } : u);
    setData((prev) => prev.map(flip));
    try {
      await axios.put(api(`/telephony/status/${id}`), {}, { headers: authHeader() });
    } catch (e) {
      console.error(e);
      setData((prev) => prev.map(flip)); // undo
      toast("error", "Failed to change status");
    }
  };

  const logoutUser = async (id) => {
    try {
      await axios.post(api("/log/adminLogoutUser"), { admin_id: user.user_id, user_id: id }, { headers: authHeader() });
      setData((p) => p.map((u) => (u.user_id === id ? { ...u, loginStatus: "Logged Out" } : u)));
      markOffline(id);
      toast("success", `User ${id} logged out`);
    } catch {
      toast("error", "Failed to log out user");
    }
  };

  const logoutAll = async () => {
    const r = await swal({
      title: "Log out all agents?",
      text: "Every agent will be signed out of the dialer and will have to log in again.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Yes, log out all",
    });
    if (!r.isConfirmed) return;
    try {
      await axios.post(api("/log/logoutAllAgents"), { admin_id: user.user_id, admin_username: user.user_id }, { headers: authHeader() });
      setData((p) => p.map((u) => ({ ...u, loginStatus: "Log Out" })));
      markAllOffline();
      toast("success", "All agents have been logged out");
    } catch {
      toast("error", "Failed to log out all agents");
    }
  };

  const removeUser = async (id) => {
    const r = await swal({
      title: "Are you sure?",
      text: `User ${id} will be permanently deleted and can no longer log in.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Yes, delete",
    });
    if (!r.isConfirmed) return;
    try {
      await axios.delete(api(`/telephony/agents/${id}`), { headers: authHeader() });
      await axios.get(api("/action/changeSipStatus"), { headers: authHeader() });
      setData((p) => p.filter((u) => u.user_id !== id));
      toast("success", "User deleted");
    } catch {
      toast("error", "Failed to delete");
    }
  };

  const openEdit = (id) => {
    const row = data.find((item) => item.user_id === id);
    if (!row) return;
    setFormData({ ...row });
    setOpenDialog(true);
  };

  /* ---------------- derived data ---------------- */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = data.filter((u) => {
      if (filter === "online" && !isLoggedIn(u)) return false;
      if (filter === "inactive" && u.status === "active") return false;
      if (!q) return true;
      const level = USER_TYPE[u.user_type]?.label?.toLowerCase() ?? "";
      // Password is intentionally NOT searchable
      return (
        [u.user_id, u.full_name, campaignList(u.campaigns_id).join(","), u.status, u.loginStatus, u.agent_priorty].some((v) =>
          String(v ?? "").toLowerCase().includes(q)
        ) || level.includes(q)
      );
    });
    return [...base].sort((a, b) => Number(a.user_id) - Number(b.user_id));
  }, [data, search, filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const rows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  useEffect(() => setPage(1), [search, pageSize, filter]);

  const activeCount = data.filter((u) => u.status === "active").length;
  const onlineCount = data.filter(isLoggedIn).length;
  const agentCount = data.filter((u) => String(u.user_type) === "1").length;
  const pctOf = (n) => (data.length ? Math.round((n / data.length) * 100) : 0);
  const fromRow = filtered.length ? (currentPage - 1) * pageSize + 1 : 0;
  const toRow = Math.min(currentPage * pageSize, filtered.length);

  const stats = [
    { key: "total", label: "Total users", value: data.length, icon: Users, tone: "primary", sub: "SIP logins on the dialer" },
    { key: "active", label: "Active", value: activeCount, icon: CheckCircle2, tone: "good", sub: `${pctOf(activeCount)}% of all users`, bar: pctOf(activeCount) },
    { key: "online", label: "Logged in", value: onlineCount, icon: Radio, tone: "info", sub: onlineCount ? "on the dialer right now" : "nobody online" },
    { key: "agents", label: "Agents", value: agentCount, icon: Headset, tone: "amber", sub: `${data.length - agentCount} other staff` },
  ];

  const filters = [
    ["all", "All", data.length],
    ["online", "Logged in", onlineCount],
    ["inactive", "Inactive", data.length - activeCount],
  ];

  /* ---------------- render ---------------- */
  return (
    <div className="ut-page">
      {/* Header */}
      <div className="ut-header">
        <div>
          <h1 className="ut-title">Users</h1>
          <p className="ut-subtitle">Manage agents, team leaders and managers across your workspace.</p>
        </div>
        <div className="ut-actions">
          <label className="ut-search">
            <Search size={15} className="ut-search__icon" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search user, name, campaign, level…" />
            {search && (
              <button type="button" className="ut-search__clear" onClick={() => setSearch("")} title="Clear search">
                <X size={13} />
              </button>
            )}
          </label>
          <button type="button" className="ut-btn ut-btn--ghost" onClick={logoutAll}>
            <LogOut size={15} /> Logout all
          </button>
          <button type="button" className="ut-btn ut-btn--primary" onClick={() => setShowAdd(true)}>
            <Plus size={16} strokeWidth={2.4} /> Add User
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="ut-stats">
        {stats.map((s) => (
          <div className={`ut-stat ut-tone--${s.tone}`} key={s.key}>
            <div className="ut-stat__top">
              <span className="ut-stat__label">{s.label}</span>
              <s.icon size={16} strokeWidth={2.2} className="ut-stat__icon" />
            </div>
            <div className="ut-stat__value">{loading ? <span className="ut-skel ut-skel--val" /> : s.value}</div>
            <div className="ut-stat__sub">
              {s.bar !== undefined && <span className="ut-stat__bar"><i style={{ width: `${s.bar}%` }} /></span>}
              <span>{s.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="ut-card">
        <div className="ut-card__head">
          <div className="ut-card__title">
            <Users size={15} strokeWidth={2.2} className="ut-card__icon" />
            <h3>All users</h3>
            <span className="ut-count">{filtered.length}</span>
            <span
              title={live ? "Login status updates live" : "Reconnecting to live status…"}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, marginLeft: 6, color: live ? "#16a34a" : "#94a3b8" }}
            >
              <i style={{ width: 7, height: 7, borderRadius: "50%", background: live ? "#16a34a" : "#94a3b8" }} />
              {live ? "Live" : "Connecting"}
            </span>
          </div>
          <div className="ut-seg" role="group" aria-label="Filter users">
            {filters.map(([k, label, n]) => (
              <button key={k} type="button" className={filter === k ? "is-active" : ""} onClick={() => setFilter(k)}>
                {k !== "all" && <i className={`ut-seg__dot ut-seg__dot--${k}`} />}
                {label}
                <b>{n}</b>
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="ut-loading">
            {[0, 1, 2, 3].map((i) => (
              <div className="ut-loading__row" key={i}>
                <span className="ut-skel ut-skel--avatar" />
                <span className="ut-skel" style={{ width: "18%" }} />
                <span className="ut-skel" style={{ width: "12%" }} />
                <span className="ut-skel" style={{ width: "14%" }} />
                <span className="ut-skel" style={{ width: "10%", marginLeft: "auto" }} />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="ut-empty is-error">
            <span className="ut-empty__icon"><X size={20} /></span>
            <strong>Could not load users</strong>
            <span>{error}</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="ut-empty">
            <span className="ut-empty__icon">{data.length ? <Search size={20} /> : <Users size={20} />}</span>
            <strong>{data.length ? "No users match" : "No users yet"}</strong>
            <span>{data.length ? "Try a different search or filter." : "Create a SIP login for your first agent."}</span>
            {data.length ? (
              <button type="button" className="ut-btn ut-btn--ghost" onClick={() => { setSearch(""); setFilter("all"); }}>
                Clear filters
              </button>
            ) : (
              <button type="button" className="ut-btn ut-btn--primary" onClick={() => setShowAdd(true)}>
                <Plus size={16} /> Add User
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="ut-table-wrap">
              <table className="ut-table">
                <thead>
                  <tr>
                    <th className="ut-c-index">#</th>
                    <th>User</th>
                    <th>User ID</th>
                    <th>Password</th>
                    <th>Campaigns</th>
                    <th>Level</th>
                    <th className="ut-center">Priority</th>
                    <th>Login</th>
                    <th>Status</th>
                    <th className="ut-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u, i) => {
                    const level = USER_TYPE[u.user_type] || { label: "Unknown", color: "#94a3b8" };
                    const loggedIn = isLoggedIn(u);
                    const active = u.status === "active";
                    const camps = campaignList(u.campaigns_id);
                    return (
                      <tr key={u.user_id} className={active ? "" : "is-off"}>
                        <td className="ut-c-index ut-muted ut-mono">{(currentPage - 1) * pageSize + i + 1}</td>
                        <td className="ut-c-name">
                          <div className="ut-name">
                            <span className="ut-avatar" style={{ "--a": level.color }}>
                              {(u.full_name || "?").slice(0, 1).toUpperCase()}
                            </span>
                            <span className="ut-name__main" title={u.full_name}>{u.full_name || NA}</span>
                          </div>
                        </td>
                        <td data-label="User ID">
                          <button type="button" className="ut-id" onClick={() => copyText(String(u.user_id), "User ID")} title="Copy User ID">
                            {u.user_id}
                            <Copy size={11} />
                          </button>
                        </td>
                        <td data-label="Password">
                          {u.password ? (
                            <span className="ut-pass">
                              <span className="ut-pass__dots">••••••••</span>
                              <button type="button" className="ut-mini" onClick={() => copyText(String(u.password), "Password")} title="Copy password">
                                <KeyRound size={13} />
                              </button>
                            </span>
                          ) : (
                            <span className="ut-dash">{NA}</span>
                          )}
                        </td>
                        <td data-label="Campaigns">
                          {camps.length ? (
                            <span className="ut-camps" title={camps.join(", ")}>
                              <span className="ut-camps__first">{camps[0]}</span>
                              {camps.length > 1 && <span className="ut-camps__more">+{camps.length - 1}</span>}
                            </span>
                          ) : (
                            <span className="ut-dash">{NA}</span>
                          )}
                        </td>
                        <td data-label="Level">
                          <span className="ut-level" style={{ "--a": level.color }}>{level.label}</span>
                        </td>
                        <td className="ut-center ut-mono" data-label="Priority">{u.agent_priorty || NA}</td>
                        <td data-label="Login">
                          <span className={`ut-login${loggedIn ? " is-on" : ""}`}>
                            <i />
                            {u.loginStatus || NA}
                          </span>
                        </td>
                        <td data-label="Status">
                          <div className="ut-status">
                            <button
                              type="button"
                              className={`ut-toggle${active ? " is-on" : ""}`}
                              onClick={() => toggleStatus(u.user_id)}
                              aria-label="Toggle status"
                              aria-pressed={active}
                              title={active ? "Active, click to deactivate" : "Inactive, click to activate"}
                            >
                              <span className="ut-toggle__knob" />
                            </button>
                            <span className={`ut-status__label${active ? " is-on" : ""}`}>{active ? "Active" : "Inactive"}</span>
                          </div>
                        </td>
                        <td className="ut-c-actions">
                          <div className="ut-row-actions">
                            <IconBtn title="View" onClick={() => navigate(`${u.user_id}`)}>
                              <Eye size={15} />
                            </IconBtn>
                            <IconBtn title="Edit" onClick={() => openEdit(u.user_id)}>
                              <Pencil size={15} />
                            </IconBtn>
                            <IconBtn title="Log out this user" tone="amber" onClick={() => logoutUser(u.user_id)}>
                              <LogOut size={15} />
                            </IconBtn>
                            <span className="ut-row-actions__sep" />
                            <IconBtn title="Delete" tone="danger" onClick={() => removeUser(u.user_id)}>
                              <Trash2 size={15} />
                            </IconBtn>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="ut-pagination">
              <label className="ut-page-size">
                <span>Rows per page</span>
                <span className="ut-select">
                  <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                    {PAGE_SIZES.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </span>
              </label>
              <div className="ut-page-nav">
                <button type="button" disabled={currentPage <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                  <ChevronLeft size={15} />
                </button>
                <span className="ut-page-nav__cur">{currentPage} <i>/ {totalPages}</i></span>
                <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Edit dialog */}
      {openDialog && formData && (
        <Modal title="Edit User" subtitle={`${data.find((u) => u.user_id === formData.user_id)?.full_name || ""} · ${formData.user_id}`} onClose={() => setOpenDialog(false)}>
          <EditAgent openDialog={openDialog} setOpenDialog={setOpenDialog} formData={formData} setFormData={setFormData} setData={setData} />
        </Modal>
      )}

      {/* Add dialog */}
      {showAdd && (
        <Modal title="Add New User" subtitle="Create a SIP login for an agent or staff member." onClose={() => setShowAdd(false)}>
          <AddUserForm onSuccess={fetchAgents} onClose={() => setShowAdd(false)} />
        </Modal>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Small subcomponents                                                */
/* ------------------------------------------------------------------ */
function IconBtn({ children, title, onClick, tone }) {
  return (
    <button type="button" className={`ut-act${tone ? ` ut-act--${tone}` : ""}`} title={title} onClick={onClick}>
      {children}
    </button>
  );
}

function Modal({ title, subtitle, onClose, children }) {
  const ref = useRef(null);
  const [dark, setDark] = useState(false);

  // Follow light / dark theme
  useLayoutEffect(() => {
    const check = () => ref.current && setDark(surfaceOf(ref.current).dark);
    check();
    const t = setTimeout(check, 350);
    return () => clearTimeout(t);
  }, []);

  // Close on Escape, and stop the page behind from scrolling
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop ut-backdrop" onClick={onClose}>
      <div ref={ref} className={`modal wide ut-modal ${dark ? "ut-dark" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head ut-modal__head">
          <div>
            <h3>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="ut-act" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body ut-modal__body">{children}</div>
      </div>
    </div>
  );
}