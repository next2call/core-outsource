import React, { useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";
import Swal from "sweetalert2";
import {
  Search,
  Plus,
  Eye,
  Pencil,
  Trash2,
  X,
  Tag,
  Layers,
  CheckCircle2,
  ListFilter,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Bell,
} from "lucide-react";
import "./dispositions.css";

// Optional: your auth context; fall back gracefully if not present.
let AuthContext;
try {
  // eslint-disable-next-line
  AuthContext = require("../../context/authContext").AuthContext;
} catch (e) {
  AuthContext = React.createContext({ user: null });
}

const NA = "–";

/* ---------- SweetAlert that follows the CRM theme (light / dark) ---------- */
const surface = () => {
  let node = document.querySelector(".dp-card") || document.body;
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
const toast = (icon, title) =>
  swal({ toast: true, position: "top-end", showConfirmButton: false, timer: 3000, timerProgressBar: true, icon, title });

/* dates are shown in IST no matter where the browser is */
const dateParts = (val) => {
  if (!val) return null;
  const d = new Date(val);
  if (isNaN(d)) return null;
  return {
    date: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }),
    time: d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }),
  };
};
const formatDate = (val) => {
  const p = dateParts(val);
  return p ? `${p.date}, ${p.time}` : NA;
};

const TAG_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#a855f7", "#ec4899", "#14b8a6"];
const tagColor = (seed = "") =>
  TAG_COLORS[String(seed).split("").reduce((a, c) => a + c.charCodeAt(0), 0) % TAG_COLORS.length];

/* ---------- small pieces ---------- */
const Modal = ({ open, onClose, title, subtitle, icon: Icon, children, footer }) => {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="dp-modal-backdrop" onClick={onClose}>
      <div className="dp-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="dp-modal__head">
          <div className="dp-modal__title">
            {Icon && <span className="dp-modal__badge"><Icon size={16} /></span>}
            <div>
              <h3>{title}</h3>
              {subtitle && <p>{subtitle}</p>}
            </div>
          </div>
          <button type="button" className="dp-act" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="dp-modal__body">{children}</div>
        {footer && <div className="dp-modal__foot">{footer}</div>}
      </div>
    </div>
  );
};

/* Active / Inactive picker used in the Add and Edit forms */
const StatusChoice = ({ value, onChange }) => (
  <div className="dp-choice" role="radiogroup" aria-label="Status">
    {[
      ["active", "Active", "Agents can pick it"],
      ["inactive", "Inactive", "Hidden from agents"],
    ].map(([v, label, hint]) => (
      <button
        key={v}
        type="button"
        role="radio"
        aria-checked={value === v}
        className={`dp-choice__opt${value === v ? " is-on" : ""}${v === "active" ? " is-good" : ""}`}
        onClick={() => onChange(v)}
      >
        <i />
        <span>
          <b>{label}</b>
          <small>{hint}</small>
        </span>
      </button>
    ))}
  </div>
);

const DispositionList = () => {
  const { user } = useContext(AuthContext) || {};
  const [data, setData] = useState([]);
  const [campaignOptions, setCampaignOptions] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [busyId, setBusyId] = useState(null);
  // Dialogs
  const [viewOpen, setViewOpen] = useState(false);
  const [viewRow, setViewRow] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({ dispo: "", campaign_id: "", status: "active", admin: "" });
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ dispositionName: "", campaignId: "", status: "active", reminder: 0, admin: "" });
  const [addError, setAddError] = useState("");

  const authHeader = () => {
    const token = localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  /* -------- data fetch -------- */
  const fetchDispositions = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setError("No authentication token found. Please log in.");
        setLoading(false);
        return;
      }
      const res = await axios.get(`https://${window.location.hostname}:4000/dispo/searchDis`, { headers: authHeader() });
      setData(res.data || []);
      setError("");
    } catch (err) {
      console.error("Error fetching dispositions:", err);
      setError("An error occurred while fetching dispositions.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetchDispositions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    await fetchDispositions();
    setRefreshing(false);
  };

  useEffect(() => {
    axios
      .get(`https://${window.location.hostname}:4000/campaigns_dropdown`, { headers: authHeader() })
      .then((res) => {
        setCampaignOptions((res.data || []).map((c) => ({ id: c.compaign_id, label: c.compaignname })));
      })
      .catch((e) => console.error("Error fetching campaigns:", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user?.user_type !== "9") return;
    axios
      .get(`https://${window.location.hostname}:4000/telephony/admin`, { headers: authHeader() })
      .then((res) => setAdmins(res.data || []))
      .catch((e) => console.error("Error fetching admins:", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const campaignName = (id) => campaignOptions.find((o) => String(o.id) === String(id))?.label;

  /* -------- actions -------- */
  const handleDelete = (row) => {
    swal({
      title: `Delete "${row.dispo}"?`,
      text: "Agents will no longer see this disposition.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Yes, delete it!",
    }).then(async (result) => {
      if (!result.isConfirmed) return;
      try {
        await axios.delete(`https://${window.location.hostname}:4000/dispo/deleteDispo/${row.id}`, { headers: authHeader() });
        setData((prev) => prev.filter((it) => it.id !== row.id));
        toast("success", "Disposition deleted successfully");
      } catch (e) {
        console.error(e);
        swal({ icon: "error", title: "Error", text: "Failed to delete. Please try again." });
      }
    });
  };

  const handleToggleStatus = async (id) => {
    const row = data.find((r) => r.id === id);
    if (!row) return;
    const newStatus = row.status === "active" ? "inactive" : "active";
    setBusyId(id);
    try {
      const res = await axios.put(
        `https://${window.location.hostname}:4000/dispo/statusDispo/${id}`,
        { status: newStatus },
        { headers: { ...authHeader(), "Content-Type": "application/json" } }
      );
      if (res.status === 200) {
        setData((prev) => prev.map((it) => (it.id === id ? { ...it, status: newStatus } : it)));
      } else {
        toast("error", "Failed to update status");
      }
    } catch (e) {
      console.error("Error updating status:", e);
      toast("error", "Failed to update status");
    } finally {
      setBusyId(null);
    }
  };

  const openView = (row) => {
    setViewRow(row);
    setViewOpen(true);
  };
  const openEdit = (row) => {
    setEditId(row.id);
    setEditForm({ dispo: row.dispo || "", campaign_id: row.campaign_id || "", status: row.status || "active", admin: row.admin || "" });
    setViewOpen(false);
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    try {
      await axios.put(`https://${window.location.hostname}:4000/dispo/updateDis/${editId}`, editForm, { headers: authHeader() });
      setData((prev) => prev.map((it) => (it.id === editId ? { ...it, ...editForm } : it)));
      setEditOpen(false);
      toast("success", "Updated successfully");
    } catch (e) {
      console.error("Update failed:", e);
      swal({ icon: "error", title: "Error", text: "Failed to update the disposition." });
    }
  };

  const handleAdd = async (e) => {
    e?.preventDefault?.();
    if (!addForm.dispositionName.trim()) {
      setAddError("Give the disposition a name.");
      return;
    }
    try {
      const res = await axios.post(`https://${window.location.hostname}:4000/dispo/addDis`, addForm, {
        headers: { ...authHeader(), "Content-Type": "application/json" },
      });
      toast("success", res.data?.message || "Disposition added successfully");
      const newRow = res.data?.data || {
        id: Date.now(),
        dispo: addForm.dispositionName,
        campaign_id: Array.isArray(addForm.campaignId) ? addForm.campaignId.join(",") : addForm.campaignId,
        status: addForm.status || "active",
        ins_date: new Date().toISOString(),
      };
      setData((prev) => [newRow, ...prev]);
      setAddForm({ dispositionName: "", campaignId: "", status: "active", reminder: 0, admin: "" });
      setAddError("");
      setAddOpen(false);
    } catch (err) {
      console.error("Error adding disposition:", err);
      toast("error", "Failed to add disposition");
    }
  };

  /* -------- derived -------- */
  const filteredData = useMemo(() => {
    return data.filter((item) => {
      if (filter === "active" && item.status !== "active") return false;
      if (filter === "inactive" && item.status === "active") return false;
      if (!searchQuery) return true;
      const s = searchQuery.toLowerCase();
      return (
        item.dispo?.toLowerCase().includes(s) ||
        String(item.campaign_id ?? "").toLowerCase().includes(s) ||
        String(item.id ?? "").toLowerCase().includes(s) ||
        String(campaignName(item.campaign_id) ?? "").toLowerCase().includes(s)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, filter, searchQuery, campaignOptions]);
  useEffect(() => setPage(1), [filter, searchQuery, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pageRows = filteredData.slice(pageStart, pageStart + pageSize);
  const activeCount = data.filter((d) => d.status === "active").length;
  const uniqueCampaigns = new Set(data.map((d) => d.campaign_id).filter((v) => v !== undefined && v !== null && v !== "")).size;
  const activePct = data.length ? Math.round((activeCount / data.length) * 100) : 0;
  const fromRow = filteredData.length ? pageStart + 1 : 0;
  const toRow = Math.min(pageStart + pageSize, filteredData.length);

  const stats = [
    { key: "total", label: "Total dispositions", value: data.length, icon: Tag, tone: "primary", sub: "call outcome tags" },
    { key: "active", label: "Active", value: activeCount, icon: CheckCircle2, tone: "good", sub: `${activePct}% visible to agents`, bar: activePct },
    { key: "camps", label: "Campaigns linked", value: uniqueCampaigns, icon: Layers, tone: "violet", sub: campaignOptions.length ? `of ${campaignOptions.length} campaigns` : "with at least one tag" },
    { key: "showing", label: "Showing", value: filteredData.length, icon: ListFilter, tone: "info", sub: searchQuery || filter !== "all" ? "matching your filters" : "no filters applied" },
  ];
  const filters = [
    ["all", "All", data.length],
    ["active", "Active", activeCount],
    ["inactive", "Inactive", data.length - activeCount],
  ];

  const pageButtons = [];
  for (let n = 1; n <= totalPages; n += 1) {
    if (n === 1 || n === totalPages || Math.abs(n - safePage) <= 1) pageButtons.push(n);
    else if (Math.abs(n - safePage) === 2) pageButtons.push(`gap-${n}`);
  }

  const CampaignSelect = ({ value, onChange }) => (
    <select value={value} onChange={onChange}>
      <option value="">Select a campaign</option>
      {campaignOptions.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label} (#{o.id})
        </option>
      ))}
    </select>
  );

  return (
    <div className="dp-page">
      {/* Header */}
      <div className="dp-header">
        <div>
          <h1 className="dp-title">Dispositions</h1>
          <p className="dp-subtitle">Manage call disposition tags and their campaign assignments.</p>
        </div>
        <div className="dp-actions">
          <label className="dp-search">
            <Search size={15} className="dp-search__icon" />
            <input type="text" placeholder="Search name, campaign, ID…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            {searchQuery && (
              <button type="button" className="dp-search__clear" onClick={() => setSearchQuery("")} title="Clear search">
                <X size={13} />
              </button>
            )}
          </label>
          <button type="button" className={`dp-icon-btn${refreshing ? " is-spinning" : ""}`} onClick={refresh} title="Refresh">
            <RefreshCw size={15} />
          </button>
          <button type="button" className="dp-btn dp-btn--primary" onClick={() => setAddOpen(true)}>
            <Plus size={16} strokeWidth={2.4} />
            Add Disposition
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="dp-stats">
        {stats.map((s) => (
          <div className={`dp-stat dp-tone--${s.tone}`} key={s.key}>
            <div className="dp-stat__top">
              <span className="dp-stat__label">{s.label}</span>
              <span className="dp-stat__icon"><s.icon size={16} strokeWidth={2.2} /></span>
            </div>
            <div className="dp-stat__value">{loading ? <span className="dp-skel dp-skel--val" /> : s.value}</div>
            <div className="dp-stat__sub">
              {s.bar !== undefined && <span className="dp-stat__bar"><i style={{ width: `${s.bar}%` }} /></span>}
              <span>{s.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Card */}
      <div className="dp-card">
        <div className="dp-card__head">
          <div className="dp-card__title">
            <span className="dp-card__icon"><Tag size={15} strokeWidth={2.2} /></span>
            <h3>All dispositions</h3>
            <span className="dp-count">{filteredData.length}</span>
          </div>
          <div className="dp-seg" role="group" aria-label="Filter dispositions">
            {filters.map(([k, label, n]) => (
              <button key={k} type="button" className={filter === k ? "is-active" : ""} onClick={() => setFilter(k)}>
                {k !== "all" && <i className={`dp-seg__dot dp-seg__dot--${k}`} />}
                {label}
                <b>{n}</b>
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="dp-loading">
            {[0, 1, 2, 3].map((i) => (
              <div className="dp-loading__row" key={i}>
                <span className="dp-skel dp-skel--avatar" />
                <span className="dp-skel" style={{ width: "18%" }} />
                <span className="dp-skel" style={{ width: "14%" }} />
                <span className="dp-skel" style={{ width: "10%" }} />
                <span className="dp-skel" style={{ width: "12%", marginLeft: "auto" }} />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="dp-empty is-error">
            <span className="dp-empty__icon"><X size={20} /></span>
            <strong>Could not load dispositions</strong>
            <span>{error}</span>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="dp-empty">
            <span className="dp-empty__icon">{data.length ? <Search size={20} /> : <Tag size={20} />}</span>
            <strong>{data.length ? "No dispositions match" : "No dispositions yet"}</strong>
            <span>{data.length ? "Try a different search or filter." : "Add tags like Interested or Call back for agents to pick after a call."}</span>
            {data.length ? (
              <button type="button" className="dp-btn dp-btn--ghost" onClick={() => { setSearchQuery(""); setFilter("all"); }}>
                Clear filters
              </button>
            ) : (
              <button type="button" className="dp-btn dp-btn--primary" onClick={() => setAddOpen(true)}>
                <Plus size={16} /> Add Disposition
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="dp-table-wrap">
              <table className="dp-table">
                <thead>
                  <tr>
                    <th className="dp-c-index">#</th>
                    <th>Disposition</th>
                    <th>Campaign</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th className="dp-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row, i) => {
                    const active = row.status === "active";
                    const camp = campaignName(row.campaign_id);
                    const when = dateParts(row.ins_date);
                    return (
                      <tr key={row.id} className={active ? "" : "is-off"}>
                        <td className="dp-c-index dp-muted dp-mono">{pageStart + i + 1}</td>
                        <td className="dp-c-name">
                          <div className="dp-name">
                            <span className="dp-tag" style={{ "--a": tagColor(row.dispo) }}><Tag size={14} /></span>
                            <div className="dp-name__text">
                              <span className="dp-name__main" title={row.dispo}>{row.dispo || NA}</span>
                              <span className="dp-name__sub">ID {row.id}</span>
                            </div>
                          </div>
                        </td>
                        <td data-label="Campaign">
                          {row.campaign_id ? (
                            <span className="dp-camp">
                              {camp && <span className="dp-camp__name">{camp}</span>}
                              <span className="dp-id">#{row.campaign_id}</span>
                            </span>
                          ) : <span className="dp-dash">{NA}</span>}
                        </td>
                        <td className="dp-c-status" data-label="Status">
                          <div className="dp-status">
                            <button
                              type="button"
                              className={`dp-toggle${active ? " is-on" : ""}`}
                              onClick={() => handleToggleStatus(row.id)}
                              disabled={busyId === row.id}
                              aria-label="Toggle status"
                              aria-pressed={active}
                              title={active ? "Active, click to deactivate" : "Inactive, click to activate"}
                            >
                              <span className="dp-toggle__knob" />
                            </button>
                            <span className={`dp-status__label${active ? " is-on" : ""}`}>{active ? "Active" : "Inactive"}</span>
                          </div>
                        </td>
                        <td data-label="Created">
                          {when ? (
                            <span className="dp-time"><span>{when.date}</span><small>{when.time}</small></span>
                          ) : <span className="dp-dash">{NA}</span>}
                        </td>
                        <td className="dp-c-actions">
                          <div className="dp-row-actions">
                            <button type="button" className="dp-act" title="View" onClick={() => openView(row)}>
                              <Eye size={15} />
                            </button>
                            <button type="button" className="dp-act" title="Edit" onClick={() => openEdit(row)}>
                              <Pencil size={15} />
                            </button>
                            <span className="dp-row-actions__sep" />
                            <button type="button" className="dp-act dp-act--danger" title="Delete" onClick={() => handleDelete(row)}>
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

            {/* Pagination */}
            <div className="dp-pagination">
              <label className="dp-page-size">
                <span>Rows per page</span>
                <span className="dp-select">
                  <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                    {[5, 10, 20, 50].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </span>
              </label>
              <div className="dp-page-info">
                Showing <b>{fromRow}</b> to <b>{toRow}</b> of <b>{filteredData.length}</b>
              </div>
              <div className="dp-page-nav">
                <button type="button" disabled={safePage === 1} onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Previous page">
                  <ChevronLeft size={15} />
                </button>
                {pageButtons.map((n) =>
                  typeof n === "number" ? (
                    <button key={n} type="button" className={n === safePage ? "is-active" : ""} onClick={() => setPage(n)}>
                      {n}
                    </button>
                  ) : (
                    <span key={n} className="dp-page-nav__gap">…</span>
                  )
                )}
                <button type="button" disabled={safePage === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} aria-label="Next page">
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* View modal */}
      <Modal
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        title={viewRow?.dispo || "Disposition"}
        subtitle={viewRow ? `ID ${viewRow.id}` : undefined}
        icon={Tag}
        footer={
          <>
            <button type="button" className="dp-btn dp-btn--ghost" onClick={() => setViewOpen(false)}>Close</button>
            {viewRow && (
              <button type="button" className="dp-btn dp-btn--primary" onClick={() => openEdit(viewRow)}>
                <Pencil size={14} /> Edit
              </button>
            )}
          </>
        }
      >
        {viewRow && (
          <dl className="dp-details">
            <div><dt>Name</dt><dd>{viewRow.dispo || NA}</dd></div>
            <div>
              <dt>Campaign</dt>
              <dd>{campaignName(viewRow.campaign_id) ? `${campaignName(viewRow.campaign_id)} (#${viewRow.campaign_id})` : viewRow.campaign_id ? `#${viewRow.campaign_id}` : NA}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <span className={`dp-pill${viewRow.status === "active" ? " is-on" : ""}`}>
                  {viewRow.status === "active" ? "Active" : "Inactive"}
                </span>
              </dd>
            </div>
            <div><dt>Created</dt><dd>{formatDate(viewRow.ins_date)}</dd></div>
          </dl>
        )}
      </Modal>

      {/* Edit modal */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit disposition"
        subtitle={editForm.dispo ? `${editForm.dispo} · ID ${editId}` : undefined}
        icon={Pencil}
        footer={
          <>
            <button type="button" className="dp-btn dp-btn--ghost" onClick={() => setEditOpen(false)}>Cancel</button>
            <button type="button" className="dp-btn dp-btn--primary" onClick={handleEditSave}>Save</button>
          </>
        }
      >
        <div className="dp-form">
          <label className="dp-field dp-field--full">
            <span>Disposition name</span>
            <input value={editForm.dispo} onChange={(e) => setEditForm((f) => ({ ...f, dispo: e.target.value }))} />
          </label>
          <label className="dp-field dp-field--full">
            <span>Campaign</span>
            <CampaignSelect value={editForm.campaign_id} onChange={(e) => setEditForm((f) => ({ ...f, campaign_id: e.target.value }))} />
          </label>
          <div className="dp-field dp-field--full">
            <span>Status</span>
            <StatusChoice value={editForm.status} onChange={(v) => setEditForm((f) => ({ ...f, status: v }))} />
          </div>
          {user?.user_type === "9" && (
            <label className="dp-field dp-field--full">
              <span>Admin</span>
              <select value={editForm.admin} onChange={(e) => setEditForm((f) => ({ ...f, admin: e.target.value }))}>
                <option value="">Select admin</option>
                {admins.map((a) => (
                  <option key={a.user_id} value={a.user_id}>{a.user_id}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      </Modal>

      {/* Add modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add disposition"
        subtitle="A tag agents pick after a call, like Interested or Call back."
        icon={Plus}
        footer={
          <>
            <button type="button" className="dp-btn dp-btn--ghost" onClick={() => setAddOpen(false)}>Cancel</button>
            <button type="button" className="dp-btn dp-btn--primary" onClick={handleAdd}>Add</button>
          </>
        }
      >
        <form className="dp-form" onSubmit={handleAdd}>
          <label className="dp-field dp-field--full">
            <span>Disposition name</span>
            <input
              autoFocus
              placeholder="e.g. Interested, Call back…"
              value={addForm.dispositionName}
              aria-invalid={!!addError}
              onChange={(e) => {
                setAddForm((f) => ({ ...f, dispositionName: e.target.value }));
                if (addError) setAddError("");
              }}
            />
            {addError && <em className="dp-field__error">{addError}</em>}
          </label>
          <label className="dp-field dp-field--full">
            <span>Campaign</span>
            <CampaignSelect value={addForm.campaignId} onChange={(e) => setAddForm((f) => ({ ...f, campaignId: e.target.value }))} />
          </label>
          <div className="dp-field dp-field--full">
            <span>Status</span>
            <StatusChoice value={addForm.status} onChange={(v) => setAddForm((f) => ({ ...f, status: v }))} />
          </div>
          {user?.user_type === "9" && (
            <label className="dp-field dp-field--full">
              <span>Admin</span>
              <select value={addForm.admin} onChange={(e) => setAddForm((f) => ({ ...f, admin: e.target.value }))}>
                <option value="">Select admin</option>
                {admins.map((a) => (
                  <option key={a.user_id} value={a.user_id}>{a.user_id}</option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            className={`dp-switch-row${addForm.reminder ? " is-on" : ""}`}
            onClick={() => setAddForm((f) => ({ ...f, reminder: f.reminder ? 0 : 1 }))}
            aria-pressed={!!addForm.reminder}
          >
            <span className="dp-switch-row__icon"><Bell size={15} /></span>
            <span className="dp-switch-row__text">
              <b>Remind me</b>
              <small>Turns on the reminder option for this disposition</small>
            </span>
            <span className={`dp-toggle${addForm.reminder ? " is-on" : ""}`} aria-hidden="true"><span className="dp-toggle__knob" /></span>
          </button>
          <button type="submit" hidden aria-hidden="true" />
        </form>
      </Modal>
    </div>
  );
};

export default DispositionList;