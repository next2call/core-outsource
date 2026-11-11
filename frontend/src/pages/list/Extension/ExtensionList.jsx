import React, { useState, useEffect } from "react";
import axios from "axios";
import Swal from "sweetalert2";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Plus,
  Eye,
  Pencil,
  UserCog,
  Users as UsersIcon,
  Trash2,
  KeyRound,
  Layers,
  Megaphone,
  ListFilter,
  PhoneCall,
  ChevronLeft,
  ChevronRight,
  X,
  RefreshCw,
} from "lucide-react";
import "./extensions.css";
import Dropdown from "./AgentExtension";
import AssignExtension from "./AssignExtension";

const NA = "–";

/* ------------------------------------------------------------------ */
/*  SweetAlert that follows the CRM theme (light / dark)               */
/* ------------------------------------------------------------------ */
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
const swalTheme = () => {
  const { bg, dark } = surfaceOf(document.querySelector(".ex-card") || document.body);
  return {
    background: dark ? bg : "#fff",
    color: dark ? "#e5e7eb" : "#1f2937",
    confirmButtonColor: "#4f46e5",
    cancelButtonColor: dark ? "#374151" : "#64748b",
  };
};
const swal = (opts) => Swal.fire({ ...swalTheme(), ...opts });
const toast = (icon, title) =>
  swal({ toast: true, position: "top-end", icon, title, showConfirmButton: false, timer: 3000, timerProgressBar: true });

/* ------------------------------------------------------------------ */
/*  Modal shell for Add / Edit                                         */
/* ------------------------------------------------------------------ */
const Modal = ({ open, onClose, title, subtitle, children }) => {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="ex-modal-backdrop" onClick={onClose}>
      <div className="ex-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="ex-modal__head">
          <div>
            <h3>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="ex-act" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
const ExtensionList = () => {
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [reload, setReload] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    id: "",
    group_id: "",
    group_name: "",
    press_key: "",
    campaign_id: "",
  });
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [currentGroupId, setCurrentGroupId] = useState(null);
  const [currentCampaignId, setCurrentCampaignId] = useState(null);
  const [groupDropdownVisible, setGroupDropdownVisible] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState("");

  const fetchExtensions = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setError("No authentication token found. Please log in.");
        return;
      }
      const response = await axios.get(`https://${window.location.hostname}:4000/viewExtension`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(response.data || []);
      setError("");
    } catch (err) {
      console.error("Error fetching Extension:", err.response?.data?.message || err.message);
      setError("An error occurred while fetching extensions.");
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    await fetchExtensions();
    setRefreshing(false);
  };

  useEffect(() => {
    fetchExtensions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  const handleDelete = (id) => {
    const token = localStorage.getItem("token");
    swal({
      title: "Are you sure?",
      text: "This will permanently delete the extension.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Yes, delete it!",
    }).then(async (result) => {
      if (!result.isConfirmed) return;
      try {
        await axios.delete(`https://${window.location.hostname}:4000/deleteExtension/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setData((prev) => prev.filter((item) => item.id !== id));
        toast("success", "Extension deleted successfully");
      } catch (err) {
        console.error("Error deleting record", err);
        toast("error", "An error occurred while deleting.");
      }
    });
  };

  const handleEdit = (row) => {
    setEditFormData({
      id: row.id,
      group_id: row.group_id,
      group_name: row.group_name,
      press_key: row.press_key,
      campaign_id: row.campaign_id,
    });
    setEditDialogOpen(true);
  };

  const handleAdd = async (formData) => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(`https://${window.location.hostname}:4000/addExtension`, formData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast("success", response.data?.message || "Extension added successfully");
      setAddDialogOpen(false);
      setTimeout(() => setReload((r) => !r), 400);
    } catch (err) {
      console.error("Error adding new extension", err);
      toast("error", err.response?.data?.message || "Failed to add extension");
    }
  };

  const handleManage = (row) => {
    setCurrentGroupId(row.group_id);
    setCurrentCampaignId(row.campaign_id);
    setDropdownVisible(true);
  };

  const handleReview = (row) => {
    setSelectedGroupId(row.group_id);
    setGroupDropdownVisible(true);
  };

  /* -------- derived data -------- */
  const filteredData = data.filter((item) => {
    if (!searchQuery) return true;
    const s = searchQuery.toLowerCase();
    return (
      item.group_id?.toString().toLowerCase().includes(s) ||
      item.group_name?.toLowerCase().includes(s) ||
      item.id?.toString().toLowerCase().includes(s) ||
      item.press_key?.toString().toLowerCase().includes(s) ||
      item.campaign_id?.toString().toLowerCase().includes(s)
    );
  });
  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pageRows = filteredData.slice(pageStart, pageStart + pageSize);
  const uniqueCampaigns = new Set(data.map((d) => d.campaign_id)).size;
  const uniqueKeys = new Set(data.map((d) => d.press_key).filter((k) => k !== undefined && k !== null && k !== "")).size;
  const fromRow = filteredData.length ? pageStart + 1 : 0;
  const toRow = Math.min(pageStart + pageSize, filteredData.length);

  const stats = [
    { key: "total", label: "Total extensions", value: data.length, icon: Layers, tone: "primary", sub: "IVR routes configured" },
    { key: "camps", label: "Campaigns", value: uniqueCampaigns, icon: Megaphone, tone: "good", sub: "using extensions" },
    { key: "keys", label: "Press keys used", value: uniqueKeys, icon: KeyRound, tone: "violet", sub: `${Math.max(0, 9 - uniqueKeys)} of 9 keys free`, bar: Math.round((Math.min(uniqueKeys, 9) / 9) * 100) },
    { key: "showing", label: "Showing", value: filteredData.length, icon: ListFilter, tone: "info", sub: searchQuery ? "matching your search" : "no filters applied" },
  ];

  const pageButtons = [];
  for (let n = 1; n <= totalPages; n += 1) {
    if (n === 1 || n === totalPages || Math.abs(n - safePage) <= 1) pageButtons.push(n);
    else if (Math.abs(n - safePage) === 2) pageButtons.push(`gap-${n}`);
  }

  return (
    <div className="ex-page">
      {/* Header */}
      <div className="ex-header">
        <div>
          <h1 className="ex-title">User Extensions</h1>
          <p className="ex-subtitle">Manage IVR extensions, key presses and campaign assignments.</p>
        </div>
        <div className="ex-actions">
          <label className="ex-search">
            <Search size={15} className="ex-search__icon" />
            <input
              type="text"
              placeholder="Search extension, key, campaign…"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
            />
            {searchQuery && (
              <button type="button" className="ex-search__clear" onClick={() => setSearchQuery("")} title="Clear search">
                <X size={13} />
              </button>
            )}
          </label>
          <button type="button" className={`ex-icon-btn${refreshing ? " is-spinning" : ""}`} onClick={refresh} title="Refresh">
            <RefreshCw size={15} />
          </button>
          <button type="button" className="ex-btn ex-btn--primary" onClick={() => setAddDialogOpen(true)}>
            <Plus size={16} strokeWidth={2.4} />
            Add Extension
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="ex-stats">
        {stats.map((s) => (
          <div className={`ex-stat ex-tone--${s.tone}`} key={s.key}>
            <div className="ex-stat__top">
              <span className="ex-stat__label">{s.label}</span>
              <span className="ex-stat__icon"><s.icon size={16} strokeWidth={2.2} /></span>
            </div>
            <div className="ex-stat__value">{loading ? <span className="ex-skel ex-skel--val" /> : s.value}</div>
            <div className="ex-stat__sub">
              {s.bar !== undefined && <span className="ex-stat__bar"><i style={{ width: `${s.bar}%` }} /></span>}
              <span>{s.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Table card */}
      <div className="ex-card">
        <div className="ex-card__head">
          <div className="ex-card__title">
            <span className="ex-card__icon"><PhoneCall size={15} strokeWidth={2.2} /></span>
            <h3>All extensions</h3>
            <span className="ex-count">{filteredData.length}</span>
          </div>
        </div>

        {error ? (
          <div className="ex-empty is-error">
            <span className="ex-empty__icon"><X size={20} /></span>
            <strong>Could not load extensions</strong>
            <span>{error}</span>
          </div>
        ) : loading ? (
          <div className="ex-loading">
            {[0, 1, 2, 3].map((i) => (
              <div className="ex-loading__row" key={i}>
                <span className="ex-skel ex-skel--avatar" />
                <span className="ex-skel" style={{ width: "18%" }} />
                <span className="ex-skel" style={{ width: "14%" }} />
                <span className="ex-skel" style={{ width: "10%" }} />
                <span className="ex-skel" style={{ width: "12%", marginLeft: "auto" }} />
              </div>
            ))}
          </div>
        ) : filteredData.length === 0 ? (
          <div className="ex-empty">
            <span className="ex-empty__icon">{data.length ? <Search size={20} /> : <PhoneCall size={20} />}</span>
            <strong>{data.length ? "No extensions match" : "No extensions yet"}</strong>
            <span>{data.length ? "Try a different search." : "Add an extension to route callers by key press."}</span>
            {data.length ? (
              <button type="button" className="ex-btn ex-btn--ghost" onClick={() => setSearchQuery("")}>
                Clear search
              </button>
            ) : (
              <button type="button" className="ex-btn ex-btn--primary" onClick={() => setAddDialogOpen(true)}>
                <Plus size={16} /> Add Extension
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="ex-table-wrap">
              <table className="ex-table">
                <thead>
                  <tr>
                    <th className="ex-c-index">#</th>
                    <th>User extension</th>
                    <th>Extension name</th>
                    <th>Press key</th>
                    <th>Campaign</th>
                    <th className="ex-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row, i) => (
                    <tr key={row.id}>
                      <td className="ex-c-index ex-muted ex-mono">{pageStart + i + 1}</td>
                      <td className="ex-c-name">
                        <div className="ex-name">
                          <span className="ex-avatar"><PhoneCall size={15} /></span>
                          <div className="ex-name__text">
                            <span className="ex-name__main ex-mono">{row.group_id}</span>
                            <span className="ex-name__sub">ID {row.id}</span>
                          </div>
                        </div>
                      </td>
                      <td data-label="Extension name">
                        <span className="ex-text">{row.group_name || NA}</span>
                      </td>
                      <td data-label="Press key">
                        {row.press_key !== undefined && row.press_key !== null && row.press_key !== ""
                          ? <span className="ex-key" title={`Caller presses ${row.press_key}`}>{row.press_key}</span>
                          : <span className="ex-dash">{NA}</span>}
                      </td>
                      <td data-label="Campaign">
                        {row.campaign_id ? <span className="ex-id">{row.campaign_id}</span> : <span className="ex-dash">{NA}</span>}
                      </td>
                      <td className="ex-c-actions">
                        <div className="ex-row-actions">
                          <button
                            type="button"
                            className="ex-act"
                            title="View assigned agents"
                            onClick={() => navigate("assignedagents", { state: { groupId: row.group_id } })}
                          >
                            <Eye size={15} />
                          </button>
                          <button type="button" className="ex-act" title="Edit" onClick={() => handleEdit(row)}>
                            <Pencil size={15} />
                          </button>
                          <button type="button" className="ex-act ex-act--teal" title="Assign department to agents" onClick={() => handleManage(row)}>
                            <UserCog size={15} />
                          </button>
                          <button type="button" className="ex-act ex-act--violet" title="Review assigned agents" onClick={() => handleReview(row)}>
                            <UsersIcon size={15} />
                          </button>
                          <span className="ex-row-actions__sep" />
                          <button type="button" className="ex-act ex-act--danger" title="Delete" onClick={() => handleDelete(row.id)}>
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="ex-pagination">
              <label className="ex-page-size">
                <span>Rows per page</span>
                <span className="ex-select">
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                  >
                    {[5, 10, 20, 50].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </span>
              </label>
              <div className="ex-page-info">
                Showing <b>{fromRow}</b> to <b>{toRow}</b> of <b>{filteredData.length}</b>
              </div>
              <div className="ex-page-nav">
                <button type="button" disabled={safePage === 1} onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Previous page">
                  <ChevronLeft size={15} />
                </button>
                {pageButtons.map((n) =>
                  typeof n === "number" ? (
                    <button key={n} type="button" className={n === safePage ? "is-active" : ""} onClick={() => setPage(n)}>
                      {n}
                    </button>
                  ) : (
                    <span key={n} className="ex-page-nav__gap">…</span>
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

      {/* Dialogs */}
      <Modal
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        title="Add Extension"
        subtitle="Route callers to a group when they press a key."
      >
        <AddDialog onClose={() => setAddDialogOpen(false)} onAdd={handleAdd} />
      </Modal>
      <Modal
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        title="Edit Extension"
        subtitle={editFormData.group_name ? `${editFormData.group_name} · ID ${editFormData.id}` : undefined}
      >
        <EditDialog
          onClose={() => setEditDialogOpen(false)}
          formData={editFormData}
          setFormData={setEditFormData}
          setData={setData}
        />
      </Modal>
      {dropdownVisible && (
        <Dropdown
          dropdownVisible={dropdownVisible}
          setDropdownVisible={setDropdownVisible}
          groupId={currentGroupId}
          campaignId={currentCampaignId}
        />
      )}
      {groupDropdownVisible && (
        <AssignExtension
          groupId={selectedGroupId}
          groupDropdownVisible={groupDropdownVisible}
          setGroupDropdownVisible={setGroupDropdownVisible}
        />
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Edit Extension, plain form rendered inside the Modal               */
/* ------------------------------------------------------------------ */
const EditDialog = ({ onClose, formData, setFormData, setData }) => {
  const [extensionOptions, setExtensionOptions] = useState([]);

  useEffect(() => {
    const token = localStorage.getItem("token");

    axios
      .get(`https://${window.location.hostname}:4000/campaigns_dropdown`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((response) => {
        const options = response.data.map((campaign) => ({
          id: campaign.compaign_id,
          label: campaign.compaignname,
        }));
        setExtensionOptions(options);
      })
      .catch((error) => {
        console.error("Error fetching campaigns:", error);
      });
  }, []);

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleUpdate = async (e) => {
    e.preventDefault();

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        swal({ icon: "warning", title: "Authentication Error", text: "You are not authenticated." });
        return;
      }

      const updatedData = {
        group_id: formData.group_id,
        group_name: formData.group_name,
        campaign_id: formData.campaign_id,
        press_key: formData.press_key,
        menu_id: formData.menu_id || "",
      };
      const url = `https://${window.location.hostname}:4000/extensionUpdate/${formData.id}`;
      const response = await axios.put(url, updatedData, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 200) {
        setData((prevData) => prevData.map((item) => (item.id === formData.id ? { ...item, ...updatedData } : item)));
        toast("success", "Extension updated successfully");
        onClose();
      } else {
        swal({ icon: "error", title: "Update Failed", text: "Failed to update the extension." });
      }
    } catch (error) {
      console.error("Error updating extension:", error.response?.data || error);
      swal({ icon: "error", title: "Server Error", text: "An error occurred. Please try again." });
    }
  };

  return (
    <form onSubmit={handleUpdate} autoComplete="off" noValidate>
      <div className="ex-modal__body">
        <label className="ex-field">
          <span>ID</span>
          <input name="id" value={formData.id} disabled />
        </label>

        <label className="ex-field">
          <span>Extension ID</span>
          <input name="group_id" type="number" value={formData.group_id} onChange={handleEditChange} autoComplete="off" placeholder="98765" />
        </label>

        <label className="ex-field">
          <span>Extension name</span>
          <input name="group_name" value={formData.group_name} onChange={handleEditChange} autoComplete="off" placeholder="Extension_1" />
        </label>

        <label className="ex-field">
          <span>Press key</span>
          <input name="press_key" type="number" value={formData.press_key} onChange={handleEditChange} autoComplete="off" placeholder="1" />
        </label>

        <label className="ex-field ex-field--full">
          <span>Campaign</span>
          <select name="campaign_id" value={formData.campaign_id} onChange={handleEditChange} autoComplete="off">
            <option value="">Select a campaign</option>
            {extensionOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="ex-modal__foot">
        <button type="button" className="ex-btn ex-btn--ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="ex-btn ex-btn--primary">
          Update
        </button>
      </div>
    </form>
  );
};

/* ------------------------------------------------------------------ */
/*  Add Extension, plain form rendered inside the Modal                */
/* ------------------------------------------------------------------ */
const AddDialog = ({ onClose, onAdd }) => {
  const [extensionOptions, setExtensionOptions] = useState([]);
  const [formData, setFormData] = useState({
    group_id: "",
    group_name: "",
    campaign_id: "",
    press_key: "",
  });

  useEffect(() => {
    const token = localStorage.getItem("token");

    axios
      .get(`https://${window.location.hostname}:4000/campaigns_dropdown`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((response) => {
        const options = response.data.map((campaign) => ({
          id: campaign.compaign_id,
          label: campaign.compaignname,
        }));
        setExtensionOptions(options);
      })
      .catch((error) => {
        console.error("Error fetching campaigns:", error);
      });
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handlePressKeyChange = (e) => {
    const value = e.target.value;
    if (value === "" || (Number(value) >= 1 && Number(value) <= 9)) {
      setFormData((prev) => ({ ...prev, press_key: value }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onAdd(formData);
  };

  return (
    <form onSubmit={handleSubmit} autoComplete="off" noValidate>
      <div className="ex-modal__body">
        <label className="ex-field">
          <span>Extension ID</span>
          <input name="group_id" value={formData.group_id} onChange={handleChange} autoComplete="off" placeholder="98765" />
        </label>

        <label className="ex-field">
          <span>Extension name</span>
          <input name="group_name" value={formData.group_name} onChange={handleChange} autoComplete="off" placeholder="Extension_1" />
        </label>

        <label className="ex-field">
          <span>Press key <i>1 to 9</i></span>
          <input
            name="press_key"
            type="number"
            min={1}
            max={9}
            step={1}
            value={formData.press_key}
            onChange={handlePressKeyChange}
            autoComplete="off"
            placeholder="1"
          />
        </label>

        <label className="ex-field">
          <span>Campaign</span>
          <select name="campaign_id" value={formData.campaign_id} onChange={handleChange} autoComplete="off">
            <option value="">Select a campaign</option>
            {extensionOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="ex-modal__foot">
        <button type="button" className="ex-btn ex-btn--ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="ex-btn ex-btn--primary">
          Add
        </button>
      </div>
    </form>
  );
};

export default ExtensionList;