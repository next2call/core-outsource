import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import Swal from "sweetalert2";
import "./callReport.css"; // shares the cr-* styles with Call Reports

const NA = "–";

/* ---------- inline SVG icons (same style as Call Report) ---------- */
const S = ({ size = 16, children, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    {children}
  </svg>
);
const Icon = {
  Search: (p) => <S {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></S>,
  Plus: (p) => <S {...p}><path d="M12 5v14M5 12h14" /></S>,
  Trash: (p) => (
    <S size={14} {...p}>
      <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </S>
  ),
  Close: (p) => <S {...p}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></S>,
  Chevron: (p) => <S size={14} {...p}><path d="m9 6 6 6-6 6" /></S>,
  Block: (p) => <S {...p}><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></S>,
  Shield: (p) => <S {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></S>,
  Check: (p) => <S {...p}><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></S>,
  Calendar: (p) => <S {...p}><rect x="3" y="4" width="18" height="18" rx="3" /><path d="M16 2v4M8 2v4M3 10h18" /></S>,
  List: (p) => <S {...p}><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></S>,
  Refresh: (p) => <S {...p}><polyline points="23 4 23 10 17 10" /><path d="M20.5 15a9 9 0 1 1-2.1-9.4L23 10" /></S>,
  Copy: (p) => <S size={12} {...p}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></S>,
};

/* ---------- helpers ---------- */
const istParts = (v) => {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d)) return null;
  const date = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
  const day = d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD, for "added today"
  return { date, time, day };
};

/* SweetAlert that follows the CRM theme (light / dark) */
const surface = () => {
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
const toast = (title, icon = "success") =>
  swal({ toast: true, position: "top-end", showConfirmButton: false, timer: 2600, timerProgressBar: true, icon, title });

const copyText = async (text) => {
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
  toast(`${text} copied`);
};

/* ---------- component ---------- */
const BlockList = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [quick, setQuick] = useState(""); // "" | blocked | unblocked | today
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [addOpen, setAddOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const fetchBlockList = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setError("No authentication token found. Please log in.");
        return;
      }
      const res = await axios.get(`https://${window.location.hostname}:4000/block`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(res.data || []);
      setError("");
    } catch (err) {
      console.error("Error fetching Block List:", err);
      setError("An error occurred while fetching blocks.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    fetchBlockList();
  }, [fetchBlockList]);

  /* prepare rows once: parsed date */
  const rows = useMemo(() => data.map((r) => ({ ...r, _t: istParts(r.ins_date) })), [data]);
  const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  /* stats */
  const stats = useMemo(() => {
    const total = rows.length;
    const blocked = rows.filter((r) => Number(r.status) === 1).length;
    const today = rows.filter((r) => r._t?.day === todayKey).length;
    return { total, blocked, unblocked: total - blocked, today };
  }, [rows, todayKey]);

  /* search + quick filter */
  const filteredData = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return rows.filter((row) => {
      if (quick === "blocked" && Number(row.status) !== 1) return false;
      if (quick === "unblocked" && Number(row.status) === 1) return false;
      if (quick === "today" && row._t?.day !== todayKey) return false;
      if (!q) return true;
      return Object.entries(row).some(([k, v]) => k !== "_t" && v && v.toString().toLowerCase().includes(q));
    });
  }, [rows, searchQuery, quick, todayKey]);
  useEffect(() => {
    setPage(0);
  }, [searchQuery, quick, pageSize]);

  /* pagination */
  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const startIdx = safePage * pageSize;
  const currentRows = filteredData.slice(startIdx, startIdx + pageSize);

  /* actions */
  const handleDelete = (row) => {
    swal({
      title: `Delete ${row.block_no || "this number"}?`,
      text: "It will be removed from the block list completely.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Yes, delete it!",
    }).then(async (result) => {
      if (!result.isConfirmed) return;
      try {
        const token = localStorage.getItem("token");
        const res = await axios.delete(`https://${window.location.hostname}:4000/deleteBlock/${row.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 200) {
          setData((prev) => prev.filter((i) => i.id !== row.id));
          toast("Block deleted successfully!");
        } else {
          toast("Failed to delete block.", "error");
        }
      } catch (e) {
        console.error(e);
        toast("An error occurred. Please try again.", "error");
      }
    });
  };

  const handleToggleStatus = async (blockId, currentStatus) => {
    if (blockId == null) return;
    const newStatus = Number(currentStatus) === 0 ? 1 : 0;
    setBusyId(blockId);
    try {
      const res = await axios.post(
        `https://${window.location.hostname}:4000/blockStatus`,
        { id: blockId, status: newStatus },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );
      if (res.data.success) {
        setData((prev) => prev.map((row) => (row.id === blockId ? { ...row, status: newStatus } : row)));
        toast(newStatus === 1 ? "Number blocked." : "Number unblocked.");
      } else {
        toast("Failed to update status.", "error");
      }
    } catch (e) {
      console.error(e);
      toast("Error updating status.", "error");
    } finally {
      setBusyId(null);
    }
  };

  const pctOf = (n) => (stats.total ? Math.round((n / stats.total) * 100) : 0);
  const statCards = [
    { key: "", label: "Total numbers", value: stats.total, tone: "primary", icon: Icon.Shield, sub: quick ? "click to show all" : "on the block list" },
    { key: "blocked", label: "Blocked", value: stats.blocked, tone: "bad", icon: Icon.Block, sub: `${pctOf(stats.blocked)}% of the list`, bar: pctOf(stats.blocked) },
    { key: "unblocked", label: "Unblocked", value: stats.unblocked, tone: "good", icon: Icon.Check, sub: "kept on the list, calls allowed" },
    { key: "today", label: "Added today", value: stats.today, tone: "info", icon: Icon.Calendar, sub: "new entries since midnight" },
  ];
  const quickLabel = { blocked: "Blocked", unblocked: "Unblocked", today: "Added today" }[quick];

  /* render */
  return (
    <div className="cr-page">
      {/* Header */}
      <div className="cr-header">
        <div className="cr-header__text">
          <h1 className="cr-title">Block List</h1>
          <p className="cr-subtitle">Manage blocked numbers and switch their status in one place.</p>
        </div>
        <div className="cr-header__actions">
          <div className="cr-search">
            <span className="cr-search__icon"><Icon.Search size={15} /></span>
            <input type="text" placeholder="Search number…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            {searchQuery && (
              <button className="cr-search__clear" onClick={() => setSearchQuery("")} aria-label="Clear">
                <Icon.Close size={13} />
              </button>
            )}
          </div>
          <button className="cr-icon-btn cr-icon-btn--lg" onClick={fetchBlockList} title="Refresh" disabled={loading}>
            <Icon.Refresh size={15} className={loading ? "cr-spin" : ""} />
          </button>
          <button className="cr-btn cr-btn--primary" onClick={() => setAddOpen(true)}>
            <Icon.Plus size={16} strokeWidth={2.4} /> Add Block
          </button>
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
            title={s.key ? `Show only: ${s.label.toLowerCase()}` : "Show all numbers"}
          >
            <span className="cr-stat__top">
              <span className="cr-stat__label">{s.label}</span>
              <span className="cr-stat__icon"><s.icon size={16} /></span>
            </span>
            <span className="cr-stat__value">
              {loading ? <span className="cr-skel cr-skel--num" /> : s.value.toLocaleString("en-IN")}
            </span>
            <span className="cr-stat__sub">
              {s.bar !== undefined && !loading && <span className="cr-stat__meter"><i style={{ width: `${s.bar}%` }} /></span>}
              <span>{s.sub}</span>
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="cr-card">
        <div className="cr-card__head">
          <div className="cr-card__title">
            <span className="cr-card__icon"><Icon.List size={15} /></span>
            <h3>Blocked numbers</h3>
            <span className="cr-badge">{filteredData.length.toLocaleString("en-IN")}</span>
          </div>
          {quick && (
            <span className="cr-tag">
              {quickLabel}
              <button onClick={() => setQuick("")} title="Remove filter"><Icon.Close size={11} /></button>
            </span>
          )}
        </div>

        {error ? (
          <div className="cr-empty is-error">
            <span className="cr-empty__icon"><Icon.Close size={20} /></span>
            <strong>Could not load the block list</strong>
            <p>{error}</p>
            <button className="cr-btn cr-btn--ghost" onClick={fetchBlockList}><Icon.Refresh size={15} /> Retry</button>
          </div>
        ) : (
          <>
            <div className="cr-table-wrap">
              <table className="cr-table">
                <thead>
                  <tr>
                    <th className="cr-num">#</th>
                    <th>Number</th>
                    <th>Added on</th>
                    <th>Status</th>
                    <th className="cr-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading &&
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={`sk${i}`} className="cr-skel-row">
                        {Array.from({ length: 5 }).map((__, j) => (
                          <td key={j}><span className="cr-skel" /></td>
                        ))}
                      </tr>
                    ))}

                  {!loading && currentRows.length === 0 && (
                    <tr>
                      <td colSpan={5}>
                        <div className="cr-empty">
                          <span className="cr-empty__icon">{data.length ? <Icon.Search size={20} /> : <Icon.Shield size={20} />}</span>
                          <strong>{data.length ? "No numbers match" : "No blocked numbers yet"}</strong>
                          <p>{data.length ? "Try a different search or clear the filter." : "Numbers you block can't call in or be dialed."}</p>
                          {data.length > 0 ? (
                            <button className="cr-btn cr-btn--ghost" onClick={() => { setSearchQuery(""); setQuick(""); }}>Clear filters</button>
                          ) : (
                            <button className="cr-btn cr-btn--primary" onClick={() => setAddOpen(true)}><Icon.Plus size={16} /> Add Block</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}

                  {!loading &&
                    currentRows.map((row, i) => {
                      const isBlocked = Number(row.status) === 1;
                      return (
                        <tr key={row.id ?? `${startIdx + i}`} className={isBlocked ? "" : "is-off"}>
                          <td className="cr-muted cr-num">{startIdx + i + 1}</td>
                          <td>
                            {row.block_no ? (
                              <button type="button" className="cr-number" onClick={() => copyText(String(row.block_no))} title="Copy number">
                                <span className={`cr-number__icon${isBlocked ? " is-blocked" : ""}`}><Icon.Block size={13} /></span>
                                <span className="cr-mono">{row.block_no}</span>
                                <span className="cr-number__copy"><Icon.Copy /></span>
                              </button>
                            ) : <span className="cr-muted">{NA}</span>}
                          </td>
                          <td className="cr-time">
                            {row._t ? (<><span>{row._t.date}</span><small>{row._t.time}</small></>) : <span className="cr-muted">{NA}</span>}
                          </td>
                          <td>
                            <div className="cr-status">
                              <button
                                type="button"
                                className={`cr-switch${isBlocked ? " is-on" : ""}`}
                                onClick={() => handleToggleStatus(row.id, row.status)}
                                disabled={busyId === row.id}
                                aria-pressed={isBlocked}
                                title={isBlocked ? "Blocked, click to unblock" : "Unblocked, click to block"}
                              >
                                <span className="cr-switch__knob" />
                              </button>
                              <span className={`cr-status__label${isBlocked ? " is-on" : ""}`}>{isBlocked ? "Blocked" : "Unblocked"}</span>
                            </div>
                          </td>
                          <td>
                            <div className="cr-actions cr-actions--end">
                              <button className="cr-act cr-act--block" title="Delete from list" onClick={() => handleDelete(row)}>
                                <Icon.Trash />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {!loading && filteredData.length > 0 && (
              <div className="cr-pagination">
                <div className="cr-page-size">
                  <span>Rows per page</span>
                  <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                    {[10, 25, 50, 100].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <div className="cr-muted">
                  Showing {(startIdx + 1).toLocaleString("en-IN")} to {Math.min(startIdx + pageSize, filteredData.length).toLocaleString("en-IN")} of {filteredData.length.toLocaleString("en-IN")}
                </div>
                <div className="cr-page-nav">
                  <button disabled={safePage === 0} onClick={() => setPage(safePage - 1)} title="Previous">
                    <span style={{ transform: "rotate(180deg)", display: "inline-flex" }}><Icon.Chevron /></span>
                  </button>
                  <span className="cr-page-jump">{safePage + 1} / {totalPages}</span>
                  <button disabled={safePage + 1 >= totalPages} onClick={() => setPage(safePage + 1)} title="Next">
                    <Icon.Chevron />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add Block Modal */}
      {addOpen && <AddBlockModal onClose={() => setAddOpen(false)} onSaved={fetchBlockList} />}
    </div>
  );
};

/* ---------- Add Block Modal ---------- */
const AddBlockModal = ({ onClose, onSaved }) => {
  const [blockNo, setBlockNo] = useState("");
  const [status, setStatus] = useState(1);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!blockNo.trim()) {
      setError("Block number is required.");
      return;
    }
    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(
        `https://${window.location.hostname}:4000/addBlock`,
        { block_no: blockNo.trim(), status, ins_date: new Date().toISOString() },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (res.data.success) {
        toast(res.data.message || "Block added successfully!");
        await onSaved?.();
        onClose();
      } else {
        toast(res.data.message || "Failed to add block.", "error");
        if (res.status === 409) onClose();
      }
    } catch (err) {
      console.error(err);
      toast(err.response?.data?.message || "Failed to add block.", "error");
      if (err.response?.status === 409) onClose();
    } finally {
      setSaving(false);
    }
  };

  // rendered inside .cr-page, so it picks up the same theme tokens
  return (
      <div className="cr-backdrop" onMouseDown={onClose}>
        <form className="cr-modal cr-modal--sm" onMouseDown={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
          <div className="cr-modal__head">
            <div className="cr-modal__title">
              <span className="cr-modal__badge is-block"><Icon.Block size={17} /></span>
              <div>
                <h3>Add a number</h3>
                <p>Blocked numbers can't call in or be dialed.</p>
              </div>
            </div>
            <button type="button" className="cr-icon-btn" onClick={onClose} title="Close">
              <Icon.Close size={16} />
            </button>
          </div>
          <div className="cr-modal__body">
            <label className="cr-field">
              <span>Phone number</span>
              <input
                ref={inputRef}
                type="text"
                inputMode="tel"
                placeholder="e.g. 9876543210"
                value={blockNo}
                onChange={(e) => {
                  setBlockNo(e.target.value);
                  if (error) setError("");
                }}
                aria-invalid={!!error}
              />
              {error && <em className="cr-field__error">{error}</em>}
            </label>
            <div className="cr-field">
              <span>Status</span>
              <div className="cr-choice" role="radiogroup" aria-label="Status">
                {[
                  [1, "Blocked", "Calls stopped"],
                  [0, "Unblocked", "Kept on the list only"],
                ].map(([v, label, hint]) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={status === v}
                    className={`cr-choice__opt${status === v ? " is-on" : ""}${v === 1 ? " is-bad" : " is-good"}`}
                    onClick={() => setStatus(v)}
                  >
                    <i />
                    <span>
                      <b>{label}</b>
                      <small>{hint}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="cr-modal__foot">
            <button type="button" className="cr-btn cr-btn--ghost" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="cr-btn cr-btn--primary" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
  );
};

export default BlockList;