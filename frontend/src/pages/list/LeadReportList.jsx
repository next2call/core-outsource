import { useEffect, useState, useContext, useMemo, useCallback, useRef } from "react";
import axios from "axios";
import Swal from "sweetalert2";
import dayjs from "dayjs";
import { saveAs } from "file-saver";
import * as XLSX from "xlsx";
import { maskNumber, clickToCall } from "../../context/Phoneutils";
import { AuthContext } from "../../context/authContext";
import { PopupContext } from "../../context/iframeContext";
import "./LeadReportList.css";

const NA = "–";

/* ---------- tiny inline icons (no MUI) ---------- */
const S = ({ size = 16, children, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    {children}
  </svg>
);
const Icon = {
  Search: (p) => <S {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></S>,
  Filter: (p) => <S {...p}><path d="M3 6h18M6 12h12M10 18h4" /></S>,
  Download: (p) => <S {...p}><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></S>,
  Phone: (p) => (
    <S size={14} {...p}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </S>
  ),
  Close: (p) => <S {...p}><path d="M18 6 6 18M6 6l12 12" /></S>,
  Calendar: (p) => <S {...p}><rect x="3" y="4" width="18" height="18" rx="3" /><path d="M16 2v4M8 2v4M3 10h18" /></S>,
  Users: (p) => (
    <S {...p}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </S>
  ),
  Target: (p) => <S {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></S>,
  Check: (p) => <S {...p}><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></S>,
  List: (p) => <S {...p}><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></S>,
  ChevronL: (p) => <S size={15} {...p}><path d="m15 18-6-6 6-6" /></S>,
  ChevronR: (p) => <S size={15} {...p}><path d="m9 18 6-6-6-6" /></S>,
  Refresh: (p) => <S {...p}><polyline points="23 4 23 10 17 10" /><path d="M20.5 15a9 9 0 1 1-2.1-9.4L23 10" /></S>,
};

/* ---------- SweetAlert that follows the CRM theme (light / dark) ---------- */
const surface = () => {
  let node = document.querySelector(".lr-card") || document.body;
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
const swal = (opts) => {
  const { bg, dark } = surface();
  return Swal.fire({
    background: dark ? bg : "#fff",
    color: dark ? "#e5e7eb" : "#1f2937",
    confirmButtonColor: "#4f46e5",
    cancelButtonColor: dark ? "#374151" : "#64748b",
    ...opts,
  });
};

const initialsOf = (name) =>
  String(name || "?").trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

const AVATAR_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#a855f7", "#ec4899", "#14b8a6"];
const avatarColor = (seed = "") =>
  AVATAR_COLORS[String(seed).split("").reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];

const dialTone = (s) => {
  const v = (s || "").toString().toLowerCase();
  // check "no answer" / "missed" first, otherwise "no answer" matches "answer"
  if (v.includes("miss") || /\bno\b|no[-_ ]?answer|noanswer|not connected|unanswered/.test(v)) return "warn";
  if (v.includes("fail") || v.includes("busy") || v.includes("reject") || v.includes("cancel")) return "danger";
  if (v.includes("answer") || v.includes("connect") || v.includes("success")) return "ok";
  return v ? "info" : "muted";
};

const LeadReportList = () => {
  const { user } = useContext(AuthContext);
  const { toggleIframe, updateIframeSrc } = useContext(PopupContext);
  const [data, setData] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [agents, setAgents] = useState([]);
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedAgent, setSelectedAgent] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const fromDateRef = useRef(null);
  const toDateRef = useRef(null);
  const today = dayjs().format("YYYY-MM-DD");

  const openPicker = (ref) => {
    const el = ref.current;
    if (!el) return;
    if (typeof el.showPicker === "function") {
      try {
        el.showPicker();
      } catch {
        el.focus();
      }
    } else {
      el.focus();
    }
  };

  const clampToToday = (value) => (value && value > today ? today : value);

  const fetchLeadsAndAgents = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const leadsRes = await axios.get(`https://${window.location.hostname}:4000/viewLeadReport`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const formatted = leadsRes.data.map((item) => ({
        ...item,
        date: item.date ? dayjs(item.date).format("DD-MM-YYYY HH:mm:ss") : "",
      }));
      setData(formatted);
      if (user?.userType !== 1) {
        const agentsRes = await axios.get(`https://${window.location.hostname}:4000/call_report_agent_dropdown`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setAgents(agentsRes.data);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchLeadsAndAgents();
  }, [fetchLeadsAndAgents]);

  const refresh = async () => {
    setRefreshing(true);
    await fetchLeadsAndAgents();
    setRefreshing(false);
  };

  const filteredData = useMemo(() => {
    const lower = searchQuery.toLowerCase();
    return data.filter((call) => {
      const matchSearch = Object.values(call).some((value) => value && value.toString().toLowerCase().includes(lower));
      const [day, month, year, hour, min, sec] = call.date?.match(/(\d+)/g) || [];
      if (!day) return matchSearch && !fromDate && !toDate;
      const callDateObj = new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}`);
      const from = fromDate ? new Date(fromDate + "T00:00:00") : null;
      const to = toDate ? new Date(toDate + "T23:59:59") : null;
      const matchDate = (!from || callDateObj >= from) && (!to || callDateObj <= to);
      const matchAgent = !selectedAgent || call.upload_user?.toString() === selectedAgent.toString();
      return matchSearch && matchDate && matchAgent;
    });
  }, [data, searchQuery, fromDate, toDate, selectedAgent]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage, pageSize]);

  const handleDownload = useCallback(async () => {
    if (filteredData.length === 0) {
      swal({ icon: "warning", title: "No Data", text: "No data available to export." });
      return;
    }
    const start = (currentPage - 1) * pageSize;
    const currentPageData = filteredData.slice(start, start + pageSize);
    const excelData = currentPageData.map((item, index) => ({
      SR: start + index + 1,
      "AGENT ID": item.upload_user,
      "CALLER NAME": item.name,
      "CALLER NUMBER": item.phone_number,
      EMAIL: item.email,
      REMARK: item.remark,
      "DIAL STATUS": item.dialstatus,
      DATE: item.date,
    }));
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Leads");
    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8",
    });
    saveAs(blob, `lead_data_page_${currentPage}.xlsx`);
    swal({
      icon: "success",
      title: `${currentPageData.length} records exported`,
      timer: 2000,
      toast: true,
      position: "top-end",
      showConfirmButton: false,
    });
  }, [filteredData, currentPage, pageSize]);

  const totalLeads = data.length;
  const showing = filteredData.length;
  const uniqueAgents = new Set(data.map((d) => d.upload_user).filter(Boolean)).size;
  const answered = data.filter((d) => dialTone(d.dialstatus) === "ok").length;
  const answeredPct = totalLeads ? Math.round((answered / totalLeads) * 100) : 0;
  const activeFilterCount = [fromDate, toDate, selectedAgent].filter(Boolean).length;
  const fromRow = filteredData.length ? (currentPage - 1) * pageSize + 1 : 0;
  const toRow = Math.min(currentPage * pageSize, filteredData.length);
  const clearAll = () => {
    setFromDate("");
    setToDate("");
    setSelectedAgent("");
    setSearchQuery("");
    setPage(1);
  };

  const stats = [
    { key: "total", label: "Total leads", value: totalLeads, icon: Icon.Target, tone: "primary", sub: "saved by agents" },
    { key: "answered", label: "Answered", value: answered, icon: Icon.Check, tone: "good", sub: `${answeredPct}% of all leads`, bar: answeredPct },
    { key: "agents", label: "Agents", value: uniqueAgents, icon: Icon.Users, tone: "amber", sub: "with at least one lead" },
    { key: "showing", label: "Showing", value: showing, icon: Icon.Filter, tone: "info", sub: activeFilterCount || searchQuery ? "matching your filters" : "no filters applied" },
  ];

  return (
    <div className="lr-page">
      {/* Header */}
      <div className="lr-header">
        <div>
          <h1 className="lr-title">Lead Reports</h1>
          <p className="lr-subtitle">Browse, filter and export lead call reports.</p>
        </div>
        <div className="lr-actions">
          <label className="lr-search">
            <span className="lr-search__icon"><Icon.Search size={15} /></span>
            <input
              type="text"
              placeholder="Search name, number, email, status…"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
            />
            {searchQuery && (
              <button type="button" className="lr-search__clear" onClick={() => setSearchQuery("")} title="Clear search">
                <Icon.Close size={13} />
              </button>
            )}
          </label>
          <button type="button" className={`lr-icon-btn${refreshing ? " is-spinning" : ""}`} onClick={refresh} title="Refresh">
            <Icon.Refresh size={15} />
          </button>
          <button type="button" className="lr-btn lr-btn--ghost" onClick={() => setFilterDialogOpen(true)} title="Filter">
            <Icon.Filter size={15} /> Filter
            {activeFilterCount > 0 && <span className="lr-dot-count">{activeFilterCount}</span>}
          </button>
          <button type="button" className="lr-btn lr-btn--primary" onClick={handleDownload}>
            <Icon.Download size={15} /> Export
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="lr-stats">
        {stats.map((s) => (
          <div className={`lr-stat lr-tone--${s.tone}`} key={s.key}>
            <div className="lr-stat__top">
              <span className="lr-stat__label">{s.label}</span>
              <span className="lr-stat__icon"><s.icon size={16} /></span>
            </div>
            <div className="lr-stat__value">{loading ? <span className="lr-skel lr-skel--val" /> : s.value.toLocaleString("en-IN")}</div>
            <div className="lr-stat__sub">
              {s.bar !== undefined && <span className="lr-stat__bar"><i style={{ width: `${s.bar}%` }} /></span>}
              <span>{s.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Card */}
      <div className="lr-card">
        <div className="lr-card__head">
          <div className="lr-card__title">
            <span className="lr-card__icon"><Icon.List size={15} /></span>
            <h3>Lead records</h3>
            <span className="lr-count">{showing}</span>
          </div>
          {activeFilterCount > 0 && (
            <div className="lr-tags">
              {fromDate && (
                <span className="lr-tag">From {dayjs(fromDate).format("DD MMM YYYY")}<button type="button" onClick={() => setFromDate("")} title="Remove"><Icon.Close size={11} /></button></span>
              )}
              {toDate && (
                <span className="lr-tag">To {dayjs(toDate).format("DD MMM YYYY")}<button type="button" onClick={() => setToDate("")} title="Remove"><Icon.Close size={11} /></button></span>
              )}
              {selectedAgent && (
                <span className="lr-tag">Agent {selectedAgent}<button type="button" onClick={() => setSelectedAgent("")} title="Remove"><Icon.Close size={11} /></button></span>
              )}
              <button type="button" className="lr-link" onClick={clearAll}>Clear all</button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="lr-loading">
            {[0, 1, 2, 3].map((i) => (
              <div className="lr-loading__row" key={i}>
                <span className="lr-skel lr-skel--avatar" />
                <span className="lr-skel" style={{ width: "18%" }} />
                <span className="lr-skel" style={{ width: "14%" }} />
                <span className="lr-skel" style={{ width: "10%" }} />
                <span className="lr-skel" style={{ width: "12%", marginLeft: "auto" }} />
              </div>
            ))}
          </div>
        ) : filteredData.length === 0 ? (
          <div className="lr-empty">
            <span className="lr-empty__icon">{data.length ? <Icon.Search size={20} /> : <Icon.Target size={20} />}</span>
            <strong>{data.length ? "No leads match" : "No leads yet"}</strong>
            <span>{data.length ? "Try a different search or clear the filters." : "Leads saved by agents after calls show up here."}</span>
            {data.length > 0 && (
              <button type="button" className="lr-btn lr-btn--ghost" onClick={clearAll}>Clear filters</button>
            )}
          </div>
        ) : (
          <div className="lr-table-wrap">
            <table className="lr-table">
              <thead>
                <tr>
                  <th className="lr-c-index">#</th>
                  <th>Lead</th>
                  <th>Number</th>
                  <th>Agent ID</th>
                  <th>Dial status</th>
                  <th>Remark</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {pageData.map((row, idx) => {
                  const sr = (currentPage - 1) * pageSize + idx + 1;
                  const [d, t] = String(row.date || "").split(" ");
                  return (
                    <tr key={`${row.id ?? row.phone_number ?? idx}-${sr}`}>
                      <td className="lr-c-index lr-muted lr-mono">{sr}</td>
                      <td className="lr-c-name">
                        <div className="lr-name">
                          <span className="lr-avatar" style={{ "--a": avatarColor(row.name || row.phone_number) }}>
                            {initialsOf(row.name)}
                          </span>
                          <div className="lr-name__text">
                            <span className="lr-name__main" title={row.name}>{row.name || NA}</span>
                            <span className="lr-name__sub" title={row.email}>{row.email || "no email"}</span>
                          </div>
                        </div>
                      </td>
                      <td data-label="Number">
                        <div className="lr-number">
                          <span className="lr-mono">{row.phone_number ? maskNumber(row.phone_number) : NA}</span>
                          {row.phone_number && (
                            <button
                              type="button"
                              className="lr-act lr-act--call"
                              title="Click to call"
                              onClick={() =>
                                clickToCall({
                                  number: row.phone_number,
                                  user,
                                  updateIframeSrc,
                                  toggleIframe,
                                })
                              }
                            >
                              <Icon.Phone size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td data-label="Agent ID">
                        {row.upload_user ? <span className="lr-id">{row.upload_user}</span> : <span className="lr-dash">{NA}</span>}
                      </td>
                      <td data-label="Dial status">
                        {row.dialstatus
                          ? <span className={`lr-chip lr-chip--${dialTone(row.dialstatus)}`}>{row.dialstatus}</span>
                          : <span className="lr-dash">{NA}</span>}
                      </td>
                      <td data-label="Remark">
                        <span className="lr-remark" title={row.remark || ""}>{row.remark || NA}</span>
                      </td>
                      <td data-label="Date">
                        {row.date ? (
                          <span className="lr-time">
                            <span>{d}</span>
                            <small>{t}</small>
                          </span>
                        ) : <span className="lr-dash">{NA}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filteredData.length > 0 && (
          <div className="lr-pagination">
            <label className="lr-page-size">
              <span>Rows per page</span>
              <span className="lr-select">
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </span>
            </label>
            <div className="lr-page-info">
              Showing <b>{fromRow}</b> to <b>{toRow}</b> of <b>{filteredData.length}</b>
            </div>
            <div className="lr-page-nav">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} aria-label="Previous page">
                <Icon.ChevronL />
              </button>
              <span className="lr-page-nav__cur">{currentPage} <i>/ {totalPages}</i></span>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} aria-label="Next page">
                <Icon.ChevronR />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Filter modal */}
      {filterDialogOpen && (
        <div className="lr-modal-backdrop" onClick={() => setFilterDialogOpen(false)}>
          <div className="lr-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Filter lead records">
            <div className="lr-modal__head">
              <div>
                <h3>Filter lead records</h3>
                <p>Narrow results by date range and agent.</p>
              </div>
              <button type="button" className="lr-act" onClick={() => setFilterDialogOpen(false)} title="Close">
                <Icon.Close size={16} />
              </button>
            </div>
            <div className="lr-modal__body">
              <label className="lr-field lr-field--date" onClick={() => openPicker(fromDateRef)}>
                <span><Icon.Calendar size={13} /> From date</span>
                <input
                  ref={fromDateRef}
                  type="date"
                  max={today}
                  value={fromDate}
                  onChange={(e) => setFromDate(clampToToday(e.target.value))}
                />
              </label>
              <label className="lr-field lr-field--date" onClick={() => openPicker(toDateRef)}>
                <span><Icon.Calendar size={13} /> To date</span>
                <input
                  ref={toDateRef}
                  type="date"
                  max={today}
                  min={fromDate || undefined}
                  value={toDate}
                  onChange={(e) => setToDate(clampToToday(e.target.value))}
                />
              </label>
              <label className="lr-field lr-field--full">
                <span><Icon.Users size={13} /> Agent</span>
                <select value={selectedAgent} onChange={(e) => setSelectedAgent(e.target.value)}>
                  <option value="">All agents</option>
                  {agents.map((agent) => (
                    <option key={agent.user_id} value={agent.user_id}>
                      {agent.full_name ? `${agent.full_name} (${agent.user_id})` : agent.user_id}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="lr-modal__foot">
              <button
                type="button"
                className="lr-btn lr-btn--ghost"
                onClick={() => {
                  setFromDate("");
                  setToDate("");
                  setSelectedAgent("");
                }}
              >
                Reset
              </button>
              <button
                type="button"
                className="lr-btn lr-btn--primary"
                onClick={() => {
                  setPage(1);
                  setFilterDialogOpen(false);
                }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default LeadReportList;