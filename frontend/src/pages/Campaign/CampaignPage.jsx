import React, { useState, useEffect, useContext, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Swal from "sweetalert2";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  Megaphone, CheckCircle2, PauseCircle, ListFilter, Search, Plus, Eye, Pencil, Trash2,
  Music, Users, Copy, X, Clock, CalendarOff, RefreshCw, ChevronLeft, ChevronRight, PhoneOutgoing, PhoneIncoming,
} from "lucide-react";
import { AuthContext } from "../../context/authContext";
import ViewDialog from "../../components/CampaignComp/ViewCampaign";
import IVRDialog from "../../components/CampaignComp/IVRDialog";
import "./campaign.css";

const EditDialog = React.lazy(() => import("../../components/CampaignComp/EditCampaign"));
const NewCampaignDialog = React.lazy(() => import("../../components/CampaignComp/NewCampaignDialog"));

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const NA = "–";

const splitNumbers = (value) =>
  String(value ?? "")
    .split(/[,\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);

const splitList = (value) =>
  String(value ?? "")
    .split(/[,|/]+/)
    .map((x) => x.trim())
    .filter(Boolean);

const AVATAR_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#a855f7", "#ec4899", "#14b8a6"];
const avatarColor = (seed = "") =>
  AVATAR_COLORS[String(seed).split("").reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];

/* Finds the real background colour behind an element, so the popup matches light/dark theme */
const parseRGB = (c) => {
  const m = String(c).match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return { r, g, b, a };
};
const surfaceOf = (el) => {
  let node = el;
  while (node && node.nodeType === 1) {
    const raw = getComputedStyle(node).backgroundColor;
    const c = parseRGB(raw);
    if (c && c.a > 0.5) return { bg: `rgb(${c.r}, ${c.g}, ${c.b})`, dark: 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b < 128 };
    node = node.parentElement;
  }
  return { bg: "#fff", dark: false };
};

/* SweetAlert that follows the CRM theme (light / dark).
   Reads the real background colour on screen each time it opens. */
const swalTheme = () => {
  const el = document.querySelector(".upload-modal") || document.querySelector(".cp-card") || document.body;
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
const copyText = async (text, what = "Copied") => {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for http / older browsers
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  swal({ toast: true, position: "top-end", icon: "success", title: what, showConfirmButton: false, timer: 1500 });
};

const isPhone = () => window.matchMedia("(max-width: 640px)").matches;

/* ------------------------------------------------------------------ */
/*  Number cell: first number + "+N more" button                      */
/* ------------------------------------------------------------------ */
const NumberCell = ({ value, title, campaign, onOpen }) => {
  const list = splitNumbers(value);
  if (!list.length) return <span className="cp-dash">{NA}</span>;
  return (
    <div className="cp-num">
      <span className="cp-num__first" title={list[0]}>
        {list[0]}
      </span>
      {list.length > 1 && (
        <button
          type="button"
          className="cp-num__more"
          onClick={(e) => onOpen({ anchor: e.currentTarget, title, campaign, numbers: list })}
          title={`View all ${list.length} numbers`}
        >
          +{list.length - 1}
        </button>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Popup listing all numbers                                          */
/*  Desktop: dropdown under the button. Phone: bottom sheet.           */
/* ------------------------------------------------------------------ */
const NumbersPopup = ({ info, onClose }) => {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  const [phone] = useState(isPhone);
  const surface = useRef(surfaceOf(info.anchor)).current;

  // Position the dropdown under (or above) the button and keep it on screen
  useLayoutEffect(() => {
    if (phone || !ref.current) return;
    const a = info.anchor.getBoundingClientRect();
    const p = ref.current.getBoundingClientRect();
    const gap = 6;
    let top = a.bottom + gap;
    if (top + p.height > window.innerHeight - 8) top = Math.max(8, a.top - p.height - gap);
    const left = Math.min(Math.max(8, a.left), window.innerWidth - p.width - 8);
    setPos({ top, left });
  }, [info, phone]);

  // Close on Escape, outside click, scroll or resize
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target) && !info.anchor.contains(e.target)) onClose();
    };
    const onMove = (e) => {
      if (ref.current && ref.current.contains(e.target)) return; // scrolling inside the list is fine
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    if (!phone) {
      window.addEventListener("scroll", onMove, true);
      window.addEventListener("resize", onClose);
    }
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onClose);
    };
  }, [info, onClose, phone]);

  const style = {
    background: surface.bg,
    color: surface.dark ? "#e5e7eb" : "#0f172a",
    ...(phone ? {} : pos ? { top: pos.top, left: pos.left } : { visibility: "hidden", top: 0, left: 0 }),
  };

  return createPortal(
    <>
      {phone && <div className="cp-pop-backdrop" onClick={onClose} />}
      <div
        ref={ref}
        className={`cp-pop ${phone ? "sheet" : ""} ${surface.dark ? "dark" : ""}`}
        style={style}
        role="dialog"
        aria-label={info.title}
      >
        {phone && <div className="cp-pop__grip" />}
        <div className="cp-pop__head">
          <div>
            <div className="cp-pop__title">{info.title}</div>
            <div className="cp-pop__sub">
              {info.campaign} · {info.numbers.length} numbers
            </div>
          </div>
          <button type="button" className="cp-pop__x" onClick={onClose} title="Close">
            <X size={15} />
          </button>
        </div>

        <ul className="cp-pop__list">
          {info.numbers.map((n, i) => (
            <li key={`${n}-${i}`}>
              <span className="cp-pop__idx">{i + 1}</span>
              <span className="cp-pop__num">{n}</span>
              <button type="button" className="cp-pop__copy" onClick={() => copyText(n, `${n} copied`)} title="Copy">
                <Copy size={14} />
              </button>
            </li>
          ))}
        </ul>

        <div className="cp-pop__foot">
          <button type="button" className="cp-pop__all" onClick={() => copyText(info.numbers.join(", "), "All numbers copied")}>
            <Copy size={14} /> Copy all
          </button>
        </div>
      </div>
    </>,
    document.body
  );
};

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
const CampaignPage = () => {
  const [data, setData] = useState([]);
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [editRowId, setEditRowId] = useState(null);
  const [viewData, setViewData] = useState(null);
  const [filter, setFilter] = useState("all"); // all | active | inactive
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [numbersPopup, setNumbersPopup] = useState(null);

  const basePath = { 9: "superadmin", 8: "admin", 7: "manager" }[user?.user_type] || "admin";

  const fetchCampaigns = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setError("No authentication token found. Please log in.");
        return;
      }
      const response = await axios.get(`https://${window.location.hostname}:4000/campaigns`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(response.data);
      setError("");
    } catch (err) {
      console.error("Error fetching campaigns:", err);
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    await fetchCampaigns();
    setRefreshing(false);
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  // Go back to page 1 when the search or filter changes
  useEffect(() => setPage(1), [searchQuery, filter]);

  const handleDelete = (id) => {
    swal({
      title: "Are you sure?",
      text: "This will permanently delete the campaign.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Yes, delete it!",
    }).then(async (result) => {
      if (!result.isConfirmed) return;
      try {
        const token = localStorage.getItem("token");
        if (!token) return;
        await axios.delete(`https://${window.location.hostname}:4000/campaigns/deleteCampaign/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setData((prev) => prev.filter((item) => item.compaign_id !== id));
        swal({ toast: true, position: "top-end", icon: "success", title: "The campaign has been deleted.", showConfirmButton: false, timer: 3000, timerProgressBar: true });
      } catch (err) {
        console.error("Error deleting campaign:", err);
        swal({ toast: true, position: "top-end", icon: "error", title: "Failed to delete the campaign.", showConfirmButton: false, timer: 3000, timerProgressBar: true });
      }
    });
  };

  const handleToggleStatus = async (id) => {
    const current = data.find((item) => item.id === id);
    if (!current) return;
    const oldStatus = current.status;
    const newStatus = oldStatus === "Y" ? "inactive" : "active";
    setData((prev) => prev.map((item) => (item.id === id ? { ...item, status: newStatus === "active" ? "Y" : "N" } : item)));
    try {
      const token = localStorage.getItem("token");
      await axios.put(
        `https://${window.location.hostname}:4000/campaigns/statusCompaign/${id}`,
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (err) {
      console.error("Failed to update status", err);
      // Put the switch back if the server didn't save it
      setData((prev) => prev.map((item) => (item.id === id ? { ...item, status: oldStatus } : item)));
      swal({ toast: true, position: "top-end", icon: "error", title: "Failed to update status", showConfirmButton: false, timer: 3000 });
    }
  };

  const filteredData = data.filter((item) => {
    if (filter === "active" && item.status !== "Y") return false;
    if (filter === "inactive" && item.status === "Y") return false;
    if (!searchQuery) return true;
    const s = searchQuery.toLowerCase();
    return [item.compaign_id, item.compaignname, item.status, item.campaign_number, item.outbond_cli, item.local_call_time, item.week_off].some(
      (v) => v !== null && v !== undefined && String(v).toLowerCase().includes(s)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageData = filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const activeCount = data.filter((d) => d.status === "Y").length;
  const inactiveCount = data.length - activeCount;
  const activePct = data.length ? Math.round((activeCount / data.length) * 100) : 0;
  const fromRow = filteredData.length ? (currentPage - 1) * pageSize + 1 : 0;
  const toRow = Math.min(currentPage * pageSize, filteredData.length);

  const stats = [
    { key: "total", label: "Total campaigns", value: data.length, icon: Megaphone, tone: "primary", sub: "configured on the dialer" },
    { key: "active", label: "Active", value: activeCount, icon: CheckCircle2, tone: "good", sub: `${activePct}% of all campaigns`, bar: activePct },
    { key: "inactive", label: "Inactive", value: inactiveCount, icon: PauseCircle, tone: "amber", sub: inactiveCount ? "paused, not dialing" : "nothing paused" },
    { key: "showing", label: "Showing", value: filteredData.length, icon: ListFilter, tone: "info", sub: searchQuery || filter !== "all" ? "matching your filters" : "no filters applied" },
  ];

  const filters = [
    ["all", "All", data.length],
    ["active", "Active", activeCount],
    ["inactive", "Inactive", inactiveCount],
  ];

  return (
    <div className="cp-page">
      {/* Header */}
      <div className="cp-header">
        <div className="cp-header__text">
          <h1 className="cp-title">Campaigns</h1>
          <p className="cp-subtitle">Manage outbound campaigns, CLIs, schedules and IVR flows.</p>
        </div>
        <div className="cp-actions">
          <label className="cp-search">
            <Search size={15} className="cp-search__icon" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ID, name, status, CLI…"
            />
            {searchQuery && (
              <button type="button" className="cp-search__clear" onClick={() => setSearchQuery("")} title="Clear search">
                <X size={13} />
              </button>
            )}
          </label>
          <button type="button" className={`cp-icon-btn${refreshing ? " is-spinning" : ""}`} onClick={refresh} title="Refresh">
            <RefreshCw size={15} />
          </button>
          <button type="button" className="cp-btn cp-btn--primary" onClick={() => setAddDialogOpen(true)}>
            <Plus size={16} strokeWidth={2.4} />
            Add Campaign
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="cp-stats">
        {stats.map((s) => (
          <div className={`cp-stat cp-tone--${s.tone}`} key={s.key}>
            <div className="cp-stat__top">
              <span className="cp-stat__label">{s.label}</span>
              <span className="cp-stat__icon"><s.icon size={16} strokeWidth={2.2} /></span>
            </div>
            <div className="cp-stat__value">{loading ? <span className="cp-skel cp-skel--val" /> : s.value}</div>
            <div className="cp-stat__sub">
              {s.bar !== undefined && (
                <span className="cp-stat__bar"><i style={{ width: `${s.bar}%` }} /></span>
              )}
              <span>{s.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Card + Table */}
      <div className="cp-card">
        <div className="cp-card__head">
          <div className="cp-card__title">
            <span className="cp-card__icon"><Megaphone size={15} strokeWidth={2.2} /></span>
            <h3>All campaigns</h3>
            <span className="cp-count">{filteredData.length}</span>
          </div>
          <div className="cp-seg" role="group" aria-label="Filter campaigns">
            {filters.map(([k, label, n]) => (
              <button key={k} type="button" className={filter === k ? "is-active" : ""} onClick={() => setFilter(k)}>
                {k !== "all" && <i className={`cp-seg__dot cp-seg__dot--${k}`} />}
                {label}
                <b>{n}</b>
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <div className="cp-empty is-error">
            <span className="cp-empty__icon"><X size={20} /></span>
            <strong>Could not load campaigns</strong>
            <span>{error}</span>
          </div>
        ) : loading ? (
          <div className="cp-loading">
            {[0, 1, 2, 3].map((i) => (
              <div className="cp-loading__row" key={i}>
                <span className="cp-skel cp-skel--avatar" />
                <span className="cp-skel" style={{ width: "18%" }} />
                <span className="cp-skel" style={{ width: "14%" }} />
                <span className="cp-skel" style={{ width: "12%" }} />
                <span className="cp-skel" style={{ width: "10%", marginLeft: "auto" }} />
              </div>
            ))}
          </div>
        ) : filteredData.length === 0 ? (
          <div className="cp-empty">
            <span className="cp-empty__icon">{data.length ? <Search size={20} /> : <Megaphone size={20} />}</span>
            <strong>{data.length ? "No campaigns match" : "No campaigns yet"}</strong>
            <span>{data.length ? "Try a different search or filter." : "Create your first campaign to start dialing."}</span>
            {data.length ? (
              <button type="button" className="cp-btn cp-btn--ghost" onClick={() => { setSearchQuery(""); setFilter("all"); }}>
                Clear filters
              </button>
            ) : (
              <button type="button" className="cp-btn cp-btn--primary" onClick={() => setAddDialogOpen(true)}>
                <Plus size={16} /> Add Campaign
              </button>
            )}
          </div>
        ) : (
          <div className="cp-table-wrap">
            <table className="cp-table">
              <thead>
                <tr>
                  <th className="cp-c-index">#</th>
                  <th>Campaign</th>
                  <th>Campaign ID</th>
                  <th><span className="cp-th-ic"><PhoneOutgoing size={12} />Outbound CLI</span></th>
                  <th><span className="cp-th-ic"><PhoneIncoming size={12} />Inbound DID</span></th>
                  <th>Call time</th>
                  <th>Week off</th>
                  <th>Status</th>
                  <th className="cp-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageData.map((row, idx) => {
                  const isActive = row.status === "Y";
                  const name = row.compaignname || NA;
                  const color = avatarColor(name);
                  const weekOff = splitList(row.week_off);
                  return (
                    <tr key={row.id ?? row.compaign_id ?? idx} className={isActive ? "" : "is-off"}>
                      <td className="cp-c-index cp-muted cp-mono">{(currentPage - 1) * pageSize + idx + 1}</td>
                      <td className="cp-c-name">
                        <div className="cp-name">
                          <span className="cp-avatar" style={{ "--a": color }}>
                            {String(name).charAt(0).toUpperCase()}
                          </span>
                          <div className="cp-name__text">
                            <span className="cp-name__main" title={name}>{name}</span>
                            <span className="cp-name__sub">{String(row.ivr) === "1" ? "IVR enabled" : "Direct dial"}</span>
                          </div>
                        </div>
                      </td>
                      <td data-label="Campaign ID">
                        <button type="button" className="cp-id" onClick={() => copyText(String(row.compaign_id), "Campaign ID copied")} title="Copy ID">
                          {row.compaign_id}
                          <Copy size={11} />
                        </button>
                      </td>
                      <td data-label="Outbound CLI">
                        <NumberCell value={row.outbond_cli} title="Outbound CLI numbers" campaign={name} onOpen={setNumbersPopup} />
                      </td>
                      <td data-label="Inbound DID">
                        <NumberCell value={row.campaign_number} title="Inbound DID numbers" campaign={name} onOpen={setNumbersPopup} />
                      </td>
                      <td data-label="Call time">
                        {row.local_call_time
                          ? <span className="cp-tag"><Clock size={12} />{row.local_call_time}</span>
                          : <span className="cp-dash">{NA}</span>}
                      </td>
                      <td data-label="Week off">
                        {weekOff.length ? (
                          <span className="cp-tags">
                            {weekOff.slice(0, 2).map((d) => <span key={d} className="cp-tag cp-tag--soft"><CalendarOff size={11} />{d}</span>)}
                            {weekOff.length > 2 && <span className="cp-tag cp-tag--soft">+{weekOff.length - 2}</span>}
                          </span>
                        ) : <span className="cp-dash">{NA}</span>}
                      </td>
                      <td className="cp-c-status" data-label="Status">
                        <div className="cp-status">
                          <button
                            type="button"
                            className={`cp-toggle${isActive ? " is-on" : ""}`}
                            onClick={() => handleToggleStatus(row.id)}
                            title={isActive ? "Active, click to deactivate" : "Inactive, click to activate"}
                            aria-pressed={isActive}
                          >
                            <span className="cp-toggle__knob" />
                          </button>
                          <span className={`cp-status__label${isActive ? " is-on" : ""}`}>{isActive ? "Active" : "Inactive"}</span>
                        </div>
                      </td>
                      <td className="cp-c-actions">
                        <div className="cp-row-actions">
                          <button type="button" className="cp-act" onClick={() => setViewData(row)} title="View">
                            <Eye size={15} />
                          </button>
                          <button type="button" className="cp-act" onClick={() => setEditRowId(row.id)} title="Edit">
                            <Pencil size={15} />
                          </button>
                          <button type="button" className="cp-act cp-act--violet" onClick={() => setSelectedCampaign(row)} title="IVR">
                            <Music size={15} />
                          </button>
                          {String(row.ivr) === "1" && (
                            <button type="button" className="cp-act cp-act--teal" onClick={() => navigate(`/${basePath}/extension`)} title="Extensions">
                              <Users size={15} />
                            </button>
                          )}
                          <span className="cp-row-actions__sep" />
                          <button type="button" className="cp-act cp-act--danger" onClick={() => handleDelete(row.compaign_id)} title="Delete">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && filteredData.length > 0 && (
          <div className="cp-pagination">
            <label className="cp-page-size">
              <span>Rows per page</span>
              <span className="cp-select">
                <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </span>
            </label>
            <div className="cp-page-nav">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} aria-label="Previous page">
                <ChevronLeft size={15} />
              </button>
              <span className="cp-page-nav__cur">{currentPage} <i>/ {totalPages}</i></span>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} aria-label="Next page">
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* All-numbers popup */}
      {numbersPopup && <NumbersPopup info={numbersPopup} onClose={() => setNumbersPopup(null)} />}

      {/* Dialogs */}
      {viewData && (
        <ViewDialog
          open
          onClose={() => setViewData(null)}
          data={viewData}
          onEdit={(row) => { setViewData(null); setEditRowId(row.id); }}
        />
      )}

      {editRowId && (
        <React.Suspense fallback={null}>
          <EditDialog
            open
            data={data.find((item) => item.id === editRowId)}
            onClose={(updated) => {
              if (updated) {
                setData((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
              }
              setEditRowId(null);
            }}
          />
        </React.Suspense>
      )}

      <IVRDialog
        open={!!selectedCampaign}
        campaign={selectedCampaign}
        onClose={(changed) => {
          setSelectedCampaign(null);
          if (changed) fetchCampaigns(); // new or removed audio shows up in View right away
        }}
      />

      <React.Suspense fallback={null}>
        <NewCampaignDialog
          open={addDialogOpen}
          onClose={async (refresh) => {
            setAddDialogOpen(false);
            if (refresh) await fetchCampaigns();
          }}
        />
      </React.Suspense>
    </div>
  );
};

export default CampaignPage;