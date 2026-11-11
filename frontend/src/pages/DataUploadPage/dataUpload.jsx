import { useState, useEffect, useMemo, useCallback } from "react";
import axios from "axios";
import Swal from "sweetalert2";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Plus,
  Download,
  Upload,
  Pencil,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
  Database,
  CheckCircle2,
  PauseCircle,
  Users,
  RefreshCw,
} from "lucide-react";
import UploadLeadDialog from "./UploadFile";
import "./DataUpload.css";

const NA = "–";

/* ---------- SweetAlert that follows the CRM theme (light / dark) ---------- */
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
const swal = (opts) => {
  const { bg, dark } = surfaceOf(document.querySelector(".du-card") || document.body);
  return Swal.fire({
    background: dark ? bg : "#fff",
    color: dark ? "#e5e7eb" : "#1f2937",
    confirmButtonColor: "#4f46e5",
    cancelButtonColor: dark ? "#374151" : "#64748b",
    ...opts,
  });
};
const showToast = (icon, title) =>
  swal({ toast: true, position: "top-end", icon, title, showConfirmButton: false, timer: 3000, timerProgressBar: true });

const formatIST = (value) => {
  if (!value) return NA;
  const utc = new Date(value);
  const ist = new Date(utc.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  return ist.toLocaleString("en-IN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
};
const isRowActive = (item) => item.ACTIVE === "active" || item.ACTIVE === 1 || item.ACTIVE === true;
const fmtNum = (n) => Number(n || 0).toLocaleString("en-IN");

/* ---------- Modal shell for Add / Edit ---------- */
const Modal = ({ title, subtitle, onClose, children }) => {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="du-modal-backdrop" onClick={onClose}>
      <div className="du-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="du-modal__head">
          <div>
            <h3>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="du-act" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

const DataUpload = ({ selectedListId }) => {
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [listId, setListId] = useState("");
  const [campaign, setCampaign] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState("all"); // all | active | inactive
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [campaignOptions, setCampaignOptions] = useState([]);
  const [leadStats, setLeadStats] = useState({}); // { [list_id]: { total, fresh } }
  const [formData, setFormData] = useState({
    listId: "",
    name: "",
    description: "",
    leadsCount: "",
    campaign: "",
    active: true,
  });

  /* ---------- Fetch campaigns ---------- */
  useEffect(() => {
    const token = localStorage.getItem("token");
    axios
      .get(`https://${window.location.hostname}:4000/campaigns_dropdown`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((response) => {
        const options = response.data.map((c) => ({
          id: c.compaign_id,
          label: c.compaignname,
        }));
        setCampaignOptions([{ id: "", label: "Select a campaign" }, ...options]);
      })
      .catch((err) => console.error("Error fetching campaigns:", err));
  }, []);

  /* ---------- Fetch lists ---------- */
  const fetchLists = useCallback(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return Promise.resolve();
    }
    return axios
      .get(`https://${window.location.hostname}:4000/list`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((response) => setData(response.data))
      .catch((err) => console.error("Error fetching data:", err))
      .finally(() => setLoading(false));
  }, [navigate]);

  /* ---------- Live lead counts per list (one grouped query, cached on server) ---------- */
  const fetchLeadStats = useCallback((fresh = false) => {
    const token = localStorage.getItem("token");
    if (!token) return Promise.resolve();
    return axios
      .get(`https://${window.location.hostname}:4000/list-lead-stats`, {
        headers: { Authorization: `Bearer ${token}` },
        params: fresh ? { fresh: 1 } : undefined,
      })
      .then((response) => {
        const map = {};
        (response.data || []).forEach((r) => {
          map[String(r.list_id)] = { total: r.total, fresh: r.fresh };
        });
        setLeadStats(map);
      })
      .catch((err) => console.error("Error fetching lead stats:", err));
  }, []);

  useEffect(() => {
    fetchLists();
    fetchLeadStats();
  }, [fetchLists, fetchLeadStats]);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchLists(), fetchLeadStats(true)]);
    setRefreshing(false);
  };

  useEffect(() => {
    if (editDialogOpen && selectedListId) {
      axios
        .get(`https://${window.location.hostname}:4000/lists/${selectedListId}`)
        .then((response) => {
          if (response.data) setFormData(response.data);
        })
        .catch((err) => console.error("Error fetching data:", err));
    }
  }, [editDialogOpen, selectedListId]);

  /* ---------- Handlers ---------- */
  const handleOpenDialog = (row) => {
    setListId(row.LIST_ID);
    setCampaign(row.CAMPAIGN);
    setOpenDialog(true);
  };
  const handleCloseDialog = () => {
    setOpenDialog(false);
    setAddDialogOpen(false);
    setEditDialogOpen(false);
  };
  // after an upload, refresh the counts (skip server cache)
  const handleCloseUploadDialog = () => {
    setOpenDialog(false);
    fetchLeadStats(true);
  };
  const handleCloseEditDialog = () => {
    setFormData({ listId: "", name: "", description: "", campaign: "" });
    setAddDialogOpen(false);
    setEditDialogOpen(false);
  };
  const handleToggleStatus = async (id) => {
    const item = data.find((i) => i.ID === id);
    if (!item) return;
    const oldStatus = item.ACTIVE;
    const newStatus = isRowActive(item) ? "inactive" : "active";
    setData((prev) => prev.map((i) => (i.ID === id ? { ...i, ACTIVE: newStatus } : i)));
    try {
      await axios.put(
        `https://${window.location.hostname}:4000/statusUpload/${id}`,
        { status: newStatus },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
            "Content-Type": "application/json",
          },
        }
      );
    } catch (err) {
      console.error("Error updating status:", err);
      setData((prev) => prev.map((i) => (i.ID === id ? { ...i, ACTIVE: oldStatus } : i)));
      showToast("error", "Failed to update status");
    }
  };
  const handleDelete = async (row) => {
    const result = await swal({
      title: "Delete this list?",
      text: "This action cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Delete",
    });
    if (!result.isConfirmed) return;
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`https://${window.location.hostname}:4000/lists/${row.LIST_ID}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData((prev) => prev.filter((i) => i.LIST_ID !== row.LIST_ID));
      showToast("success", "The list has been deleted.");
    } catch (err) {
      console.error("Error deleting list:", err);
      showToast("error", "Failed to delete the list.");
    }
  };
  const handleAddNewList = () => {
    setFormData({
      listId: "",
      name: "",
      description: "",
      leadsCount: "",
      campaign: "",
      active: false,
    });
    setAddDialogOpen(true);
  };
  const handleEdit = (row) => {
    setFormData({
      listId: row.LIST_ID,
      name: row.NAME,
      description: row.DESCRIPTION,
      leadsCount: row.LEADS_COUNT,
      campaign: row.CAMPAIGN,
      active: row.ACTIVE === 1 || row.ACTIVE === "active",
    });
    setEditDialogOpen(true);
  };
  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };
  const handleSaveAdd = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("token");
    const newData = {
      LIST_ID: formData.listId,
      NAME: formData.name,
      DESCRIPTION: formData.description,
      LEADS_COUNT: 0, // real count now comes from /list-lead-stats
      CAMPAIGN: formData.campaign,
      ACTIVE: formData.active ?? true,
      RTIME: new Date().toISOString(),
    };
    try {
      await axios.post(`https://${window.location.hostname}:4000/listAdd`, newData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchLists(); // reload so the new row has its real ID (toggle/edit need it)
      handleCloseDialog();
      showToast("success", "Data added successfully!");
    } catch (err) {
      console.error("Error adding data:", err);
      showToast("error", "Failed to add data!");
    }
  };
  const handleUpdate = () => {
    if (!formData.listId) {
      swal({ icon: "warning", title: "Missing List ID" });
      return;
    }
    const token = localStorage.getItem("token");
    axios
      .put(`https://${window.location.hostname}:4000/lists/${formData.listId}`, formData, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then(() => {
        setData((prev) =>
          prev.map((item) =>
            item.LIST_ID === formData.listId
              ? {
                  ...item,
                  NAME: formData.name,
                  DESCRIPTION: formData.description,
                  CAMPAIGN: formData.campaign,
                  ACTIVE: formData.active,
                }
              : item
          )
        );
        handleCloseEditDialog();
        showToast("success", "Data updated successfully");
      })
      .catch((err) => {
        console.error("Error saving data:", err);
        swal({ icon: "error", title: "Update Failed" });
      });
  };
  const handleDownload = () => {
    const sample = [
      { email: "xyz@gmail.com", name: "John", phone_number: "1234567890" },
      { email: "abc@gmail.com", name: "Jane", phone_number: "9876543210" },
      { email: "abc@gmail.com", name: "Alice", phone_number: "2223334444" },
    ];
    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lists");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(
      new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8",
      }),
      "list_data.xlsx"
    );
  };

  /* ---------- Filtering + pagination ---------- */
  const filtered = useMemo(() => {
    let result = data;
    if (filter === "active") result = result.filter(isRowActive);
    if (filter === "inactive") result = result.filter((r) => !isRowActive(r));
    if (!searchQuery) return result;
    const q = searchQuery.toLowerCase();
    return result.filter(
      (item) =>
        (item.LIST_ID && item.LIST_ID.toString().toLowerCase().includes(q)) ||
        (item.NAME && item.NAME.toLowerCase().includes(q)) ||
        (item.CAMPAIGN != null && String(item.CAMPAIGN).toLowerCase().includes(q)) ||
        (item.ACTIVE && String(item.ACTIVE).toLowerCase().includes(q)) ||
        (item.RTIME && new Date(item.RTIME).toLocaleString("en-IN").toLowerCase().includes(q))
    );
  }, [data, searchQuery, filter]);
  useEffect(() => setPage(1), [searchQuery, filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const fromRow = filtered.length ? (currentPage - 1) * pageSize + 1 : 0;
  const toRow = Math.min(currentPage * pageSize, filtered.length);

  const stats = useMemo(() => {
    const total = data.length;
    const active = data.filter(isRowActive).length;
    let leads = 0;
    let fresh = 0;
    data.forEach((d) => {
      const s = leadStats[String(d.LIST_ID)];
      if (s) {
        leads += Number(s.total) || 0;
        fresh += Number(s.fresh) || 0;
      }
    });
    return { total, active, inactive: total - active, leads, fresh };
  }, [data, leadStats]);

  const pctOf = (n, d) => (d ? Math.round((n / d) * 100) : 0);
  const statCards = [
    { key: "total", label: "Total lists", value: fmtNum(stats.total), icon: Database, tone: "primary", sub: "lead lists uploaded" },
    { key: "active", label: "Active", value: fmtNum(stats.active), icon: CheckCircle2, tone: "good", sub: `${pctOf(stats.active, stats.total)}% of all lists`, bar: pctOf(stats.active, stats.total) },
    { key: "inactive", label: "Inactive", value: fmtNum(stats.inactive), icon: PauseCircle, tone: "amber", sub: stats.inactive ? "not being dialed" : "nothing paused" },
    { key: "leads", label: "Total leads", value: fmtNum(stats.leads), icon: Users, tone: "info", sub: `${fmtNum(stats.fresh)} not dialed yet`, bar: pctOf(stats.fresh, stats.leads) },
  ];
  const filters = [
    ["all", "All", stats.total],
    ["active", "Active", stats.active],
    ["inactive", "Inactive", stats.inactive],
  ];

  return (
    <div className="du-page">
      {/* Header */}
      <div className="du-header">
        <div>
          <h1 className="du-title">Show List</h1>
          <p className="du-subtitle">Manage your upload lists, campaigns and leads in one place.</p>
        </div>
        <div className="du-actions">
          <label className="du-search">
            <Search size={15} className="du-search__icon" />
            <input placeholder="Search lists…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            {searchQuery && (
              <button type="button" className="du-search__clear" onClick={() => setSearchQuery("")} title="Clear search">
                <X size={13} />
              </button>
            )}
          </label>
          <button type="button" className={`du-icon-btn${refreshing ? " is-spinning" : ""}`} onClick={refresh} title="Refresh lists and lead counts">
            <RefreshCw size={15} />
          </button>
          <button type="button" className="du-btn du-btn--ghost" onClick={handleDownload} title="Download sample file">
            <Download size={15} /> Sample
          </button>
          <button type="button" className="du-btn du-btn--primary" onClick={handleAddNewList}>
            <Plus size={16} strokeWidth={2.4} /> Add New List
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="du-stats">
        {statCards.map((s) => (
          <div className={`du-stat du-tone--${s.tone}`} key={s.key}>
            <div className="du-stat__top">
              <span className="du-stat__label">{s.label}</span>
              <span className="du-stat__icon"><s.icon size={16} strokeWidth={2.2} /></span>
            </div>
            <div className="du-stat__value">{loading ? <span className="du-skel du-skel--val" /> : s.value}</div>
            <div className="du-stat__sub">
              {s.bar !== undefined && <span className="du-stat__bar"><i style={{ width: `${s.bar}%` }} /></span>}
              <span>{s.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="du-card">
        <div className="du-card__head">
          <div className="du-card__title">
            <span className="du-card__icon"><Database size={15} strokeWidth={2.2} /></span>
            <h3>All lists</h3>
            <span className="du-count">{filtered.length}</span>
          </div>
          <div className="du-seg" role="group" aria-label="Filter lists">
            {filters.map(([k, label, n]) => (
              <button key={k} type="button" className={filter === k ? "is-active" : ""} onClick={() => setFilter(k)}>
                {k !== "all" && <i className={`du-seg__dot du-seg__dot--${k}`} />}
                {label}
                <b>{n}</b>
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="du-loading">
            {[0, 1, 2, 3].map((i) => (
              <div className="du-loading__row" key={i}>
                <span className="du-skel" style={{ width: "10%" }} />
                <span className="du-skel" style={{ width: "16%" }} />
                <span className="du-skel" style={{ width: "22%" }} />
                <span className="du-skel" style={{ width: "8%" }} />
                <span className="du-skel" style={{ width: "10%", marginLeft: "auto" }} />
              </div>
            ))}
          </div>
        ) : pageItems.length === 0 ? (
          <div className="du-empty">
            <span className="du-empty__icon">{data.length ? <Search size={20} /> : <Database size={20} />}</span>
            <strong>{data.length ? "No lists match" : "No lists yet"}</strong>
            <span>{data.length ? "Try a different search or filter." : "Create a list, then upload leads into it."}</span>
            {data.length ? (
              <button type="button" className="du-btn du-btn--ghost" onClick={() => { setSearchQuery(""); setFilter("all"); }}>
                Clear filters
              </button>
            ) : (
              <button type="button" className="du-btn du-btn--primary" onClick={handleAddNewList}>
                <Plus size={16} /> Add New List
              </button>
            )}
          </div>
        ) : (
          <div className="du-table-wrap">
            <table className="du-table">
              <thead>
                <tr>
                  <th>List ID</th>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Leads</th>
                  <th>Campaign</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th className="du-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((row) => {
                  const isActive = isRowActive(row);
                  const s = leadStats[String(row.LIST_ID)];
                  const total = Number(s?.total) || 0;
                  const fresh = Number(s?.fresh) || 0;
                  return (
                    <tr key={row.LIST_ID} className={isActive ? "" : "is-off"}>
                      <td className="du-c-name">
                        <button
                          type="button"
                          className="du-link"
                          title="View uploaded data"
                          onClick={() =>
                            navigate(`showlist/${encodeURIComponent(row.LIST_ID)}?campaign=${encodeURIComponent(row.CAMPAIGN ?? "")}`)
                          }
                        >
                          {row.LIST_ID}
                        </button>
                      </td>
                      <td data-label="Name"><span className="du-name">{row.NAME || NA}</span></td>
                      <td data-label="Description">
                        <span className="du-desc" title={row.DESCRIPTION || ""}>{row.DESCRIPTION || NA}</span>
                      </td>
                      <td data-label="Leads">
                        <span className="du-leads" title={`${fmtNum(fresh)} not dialed yet`}>
                          <b>{fmtNum(total)}</b>
                          <span className="du-leads__sub">
                            <span className="du-leads__bar"><i style={{ width: `${pctOf(fresh, total)}%` }} /></span>
                            {fmtNum(fresh)} fresh
                          </span>
                        </span>
                      </td>
                      <td data-label="Campaign">
                        {row.CAMPAIGN ? <span className="du-id">{row.CAMPAIGN}</span> : <span className="du-dash">{NA}</span>}
                      </td>
                      <td className="du-c-status" data-label="Status">
                        <div className="du-status">
                          <button
                            type="button"
                            className={`du-toggle${isActive ? " is-on" : ""}`}
                            onClick={() => handleToggleStatus(row.ID)}
                            aria-label="Toggle status"
                            aria-pressed={isActive}
                          >
                            <span className="du-toggle__knob" />
                          </button>
                          <span className={`du-status__label${isActive ? " is-on" : ""}`}>{isActive ? "Active" : "Inactive"}</span>
                        </div>
                      </td>
                      <td data-label="Created" className="du-muted du-mono">{formatIST(row.RTIME)}</td>
                      <td className="du-c-actions">
                        <div className="du-row-actions">
                          <button type="button" className="du-act du-act--primary" title="Upload leads" onClick={() => handleOpenDialog(row)}>
                            <Upload size={15} />
                          </button>
                          <button type="button" className="du-act" title="Edit" onClick={() => handleEdit(row)}>
                            <Pencil size={15} />
                          </button>
                          <span className="du-row-actions__sep" />
                          <button type="button" className="du-act du-act--danger" title="Delete" onClick={() => handleDelete(row)}>
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
        {!loading && filtered.length > 0 && (
          <div className="du-pagination">
            <label className="du-page-size">
              <span>Rows per page</span>
              <span className="du-select">
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  {[5, 10, 20, 50].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </span>
            </label>
            <div className="du-page-info">
              Showing <b>{fromRow}</b> to <b>{toRow}</b> of <b>{filtered.length}</b>
            </div>
            <div className="du-page-nav">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} aria-label="Previous page">
                <ChevronLeft size={15} />
              </button>
              <span className="du-page-nav__cur">{currentPage} <i>/ {totalPages}</i></span>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} aria-label="Next page">
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Upload dialog (external component) */}
      {openDialog && (
        <UploadLeadDialog open={openDialog} onClose={handleCloseUploadDialog} listId={listId} campaign={campaign} />
      )}

      {/* Add dialog */}
      {addDialogOpen && (
        <Modal title="Add New List" subtitle="Create a list, then upload leads into it." onClose={handleCloseDialog}>
          <form onSubmit={handleSaveAdd}>
            <div className="du-modal__body">
              <label className="du-field">
                <span>List ID</span>
                <input name="listId" value={formData.listId} onChange={handleFormChange} placeholder="e.g. LIST_001" autoComplete="new-password" required />
              </label>
              <label className="du-field">
                <span>Name</span>
                <input name="name" value={formData.name} onChange={handleFormChange} placeholder="List name" required />
              </label>
              <label className="du-field du-field--full">
                <span>Description</span>
                <textarea name="description" value={formData.description} onChange={handleFormChange} placeholder="Short description" />
              </label>
              <label className="du-field du-field--full">
                <span>Campaign</span>
                <select name="campaign" value={formData.campaign} onChange={handleFormChange}>
                  {campaignOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="du-modal__foot">
              <button type="button" className="du-btn du-btn--ghost" onClick={handleCloseDialog}>Cancel</button>
              <button type="submit" className="du-btn du-btn--primary">Save</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit dialog */}
      {editDialogOpen && (
        <Modal title="Edit List" subtitle={formData.listId ? `List ${formData.listId}` : undefined} onClose={handleCloseEditDialog}>
          <div className="du-modal__body">
            <label className="du-field">
              <span>List ID</span>
              <input value={formData.listId} disabled placeholder="Id" autoComplete="off" />
            </label>
            <label className="du-field">
              <span>Name</span>
              <input value={formData.name} placeholder="Name" onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
            </label>
            <label className="du-field du-field--full">
              <span>Description</span>
              <textarea
                value={formData.description || ""}
                placeholder="Description"
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </label>
            <label className="du-field du-field--full">
              <span>Campaign</span>
              <select value={formData.campaign || ""} onChange={(e) => setFormData({ ...formData, campaign: e.target.value })}>
                {campaignOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="du-modal__foot">
            <button type="button" className="du-btn du-btn--ghost" onClick={handleCloseEditDialog}>Cancel</button>
            <button type="button" className="du-btn du-btn--primary" onClick={handleUpdate}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default DataUpload;
export { showToast };