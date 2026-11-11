import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import axios from "axios";
import Swal from "sweetalert2";
import { saveAs } from "file-saver";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import "./ShowList.css";

/* ---------- Config / helpers ---------- */
const API = `https://${window.location.hostname}:4000`;
const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

const toast = (icon, title) =>
  Swal.mixin({
    toast: true,
    position: "top-end",
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
  }).fire({ icon, title });

const formatIST = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d)) return String(value);
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const fmt = (n) => Number(n || 0).toLocaleString("en-IN");

/* Status colours — known ones fixed, anything else gets a stable colour from a hash */
const STATUS_COLORS = {
  NEW: "#6366f1",
  ANSWER: "#10b981",
  ANSWERED: "#10b981",
  CONNECTED: "#10b981",
  "NO ANSWER": "#f59e0b",
  NOANSWER: "#f59e0b",
  NA: "#f59e0b",
  BUSY: "#f97316",
  DROP: "#ef4444",
  DROPPED: "#ef4444",
  FAILED: "#ef4444",
  CONGESTION: "#ef4444",
  INCALL: "#0ea5e9",
  QUEUE: "#0ea5e9",
  DIALING: "#0ea5e9",
};
const PALETTE = ["#8b5cf6", "#14b8a6", "#ec4899", "#64748b", "#84cc16", "#06b6d4", "#d946ef", "#a16207"];
const statusColor = (s) => {
  const key = String(s || "").toUpperCase();
  if (STATUS_COLORS[key]) return STATUS_COLORS[key];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

/* ---------- Inline icons ---------- */
const Svg = ({ children, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
const IconBack = () => <Svg><path d="M19 12H5" /><polyline points="12 19 5 12 12 5" /></Svg>;
const IconSearch = () => <Svg><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></Svg>;
const IconUpload = () => <Svg><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></Svg>;
const IconDownload = () => <Svg><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></Svg>;
const IconPlus = () => <Svg><path d="M5 12h14M12 5v14" /></Svg>;
const IconRecycle = () => <Svg><path d="M21 12a9 9 0 1 1-3-6.7" /><polyline points="21 3 21 9 15 9" /></Svg>;
const IconPhone = () => <Svg><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></Svg>;
const IconTrash = () => <Svg><polyline points="3 6 5 6 21 6" /><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></Svg>;
const IconClose = () => <Svg><path d="M18 6 6 18M6 6l12 12" /></Svg>;
const IconRefresh = () => <Svg><polyline points="23 4 23 10 17 10" /><path d="M20.5 15a9 9 0 1 1-2.1-9.4L23 10" /></Svg>;
const IconFile = () => <Svg size={28}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></Svg>;
const IconChevronL = () => <Svg size={14}><polyline points="15 18 9 12 15 6" /></Svg>;
const IconChevronR = () => <Svg size={14}><polyline points="9 18 15 12 9 6" /></Svg>;

/* ---------- Modal shell ---------- */
const Modal = ({ title, subtitle, onClose, children, footer, width = 520 }) => (
  <div className="sl-backdrop" onMouseDown={onClose}>
    <div className="sl-modal" style={{ maxWidth: width }} onMouseDown={(e) => e.stopPropagation()}>
      <div className="sl-modal__head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button className="sl-icon-btn" onClick={onClose} aria-label="Close"><IconClose /></button>
      </div>
      <div className="sl-modal__body">{children}</div>
      {footer && <div className="sl-modal__foot">{footer}</div>}
    </div>
  </div>
);

const EMPTY_LEAD = { name: "", phone_number: "", email: "", company_name: "", username: "" };

const ShowList = () => {
  const { listId, campaign: campaignParam } = useParams();
  const [searchParams] = useSearchParams();
  const campaign = searchParams.get("campaign") || campaignParam || "";
  const navigate = useNavigate();

  /* table state */
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  /* summary */
  const [summary, setSummary] = useState({ freshStatus: "NEW", lockedStatuses: [], statuses: [] });

  /* agents */
  const [agents, setAgents] = useState([]);

  /* modals */
  const [modal, setModal] = useState(null); // "upload" | "add" | "churn" | null

  /* upload */
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadPct, setUploadPct] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef();

  /* add lead */
  const [lead, setLead] = useState(EMPTY_LEAD);
  const [savingLead, setSavingLead] = useState(false);

  /* churn */
  const [churnStatuses, setChurnStatuses] = useState([]);
  const [churning, setChurning] = useState(false);

  const [exporting, setExporting] = useState(false);
  const abortRef = useRef(null);

  /* ---------- Debounced search ---------- */
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  /* ---------- Fetch one page of leads (server-side) ---------- */
  const fetchRows = useCallback(async () => {
    if (!listId) return;
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/leads/${encodeURIComponent(listId)}`, {
        headers: authHeader(),
        params: { page, pageSize, status: statusFilter || undefined, search: search || undefined },
        signal: ctrl.signal,
      });
      setRows(res.data.rows || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      if (axios.isCancel(err) || err.name === "CanceledError") return;
      if (err.response?.status === 401) return navigate("/login");
      console.error("Error fetching leads:", err);
      toast("error", "Failed to load leads");
    } finally {
      if (abortRef.current === ctrl) setLoading(false);
    }
  }, [listId, page, pageSize, statusFilter, search, navigate]);

  const fetchSummary = useCallback(async () => {
    if (!listId) return;
    try {
      const res = await axios.get(`${API}/leads/${encodeURIComponent(listId)}/summary`, {
        headers: authHeader(),
      });
      setSummary(res.data);
    } catch (err) {
      console.error("Error fetching summary:", err);
    }
  }, [listId]);

  const refreshAll = useCallback(() => {
    fetchRows();
    fetchSummary();
  }, [fetchRows, fetchSummary]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    fetchSummary();
    // light polling so status counts move while the dialer works (only when tab visible)
    const t = setInterval(() => {
      if (document.visibilityState === "visible") fetchSummary();
    }, 30000);
    return () => clearInterval(t);
  }, [fetchSummary]);

  useEffect(() => {
    axios
      .get(`${API}/call_report_agent_dropdown`, { headers: authHeader() })
      .then((res) => setAgents(res.data || []))
      .catch((err) => console.error("Error fetching agents:", err));
  }, []);

  /* ---------- Derived ---------- */
  const listTotal = useMemo(
    () => summary.statuses.reduce((s, x) => s + x.count, 0),
    [summary]
  );
  const freshCount = useMemo(
    () => summary.statuses.find((x) => x.status === summary.freshStatus)?.count || 0,
    [summary]
  );
  const churnable = useMemo(
    () =>
      summary.statuses.filter(
        (x) => x.status !== summary.freshStatus && !summary.lockedStatuses.includes(x.status)
      ),
    [summary]
  );
  const churnSelectedCount = useMemo(
    () => churnable.filter((x) => churnStatuses.includes(x.status)).reduce((s, x) => s + x.count, 0),
    [churnable, churnStatuses]
  );
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  /* ---------- Actions ---------- */
  const handleDelete = async (row) => {
    const r = await Swal.fire({
      title: "Delete this lead?",
      text: `${row.name || ""} ${row.phone_number || ""}`.trim(),
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      confirmButtonText: "Delete",
    });
    if (!r.isConfirmed) return;
    try {
      await axios.delete(`${API}/leads/${encodeURIComponent(listId)}/row/${row.id}`, {
        headers: authHeader(),
      });
      toast("success", "Lead deleted");
      refreshAll();
    } catch (err) {
      console.error(err);
      toast("error", err.response?.data?.message || "Delete failed");
    }
  };

  const handleDeleteAll = async () => {
    const r = await Swal.fire({
      title: "Delete ALL leads in this list?",
      html: `This removes <b>${fmt(listTotal)}</b> leads from list <b>${listId}</b>. This cannot be undone.<br/><br/>Type the list ID to confirm:`,
      input: "text",
      inputPlaceholder: listId,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      confirmButtonText: "Delete all",
      preConfirm: (v) => {
        if (v !== String(listId)) Swal.showValidationMessage("List ID does not match");
        return v;
      },
    });
    if (!r.isConfirmed) return;
    Swal.fire({ title: "Deleting…", text: "Running in batches, please wait.", allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
      const res = await axios.delete(`${API}/leads/${encodeURIComponent(listId)}/all`, {
        headers: authHeader(),
      });
      Swal.close();
      toast("success", `${fmt(res.data.deleted)} leads deleted`);
      setPage(1);
      refreshAll();
    } catch (err) {
      Swal.close();
      console.error(err);
      toast("error", err.response?.data?.message || "Delete failed");
      refreshAll();
    }
  };

  const handleExport = async () => {
    if (!total) return toast("warning", "No data to export");
    setExporting(true);
    try {
      const res = await axios.get(`${API}/leads/${encodeURIComponent(listId)}/export`, {
        headers: authHeader(),
        params: { status: statusFilter || undefined, search: search || undefined },
        responseType: "blob",
      });
      const suffix = statusFilter ? `_${statusFilter.replace(/\W+/g, "_")}` : "";
      saveAs(res.data, `list_${listId}${suffix}_${new Date().toISOString().slice(0, 10)}.csv`);
      toast("success", `${fmt(total)} records exported`);
    } catch (err) {
      console.error(err);
      toast("error", "Export failed");
    } finally {
      setExporting(false);
    }
  };

  /* upload */
  const openUpload = () => {
    setSelectedFile(null);
    setSelectedUsers([]);
    setUploadPct(null);
    setModal("upload");
  };
  const pickFile = (file) => {
    if (!file) return;
    if (!/\.(xlsx|xls)$/i.test(file.name)) return toast("warning", "Only .xlsx / .xls files");
    setSelectedFile(file);
  };
  const toggleUser = (id) =>
    setSelectedUsers((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleUpload = async () => {
    if (!selectedFile) return toast("warning", "Choose a file first");
    if (!selectedUsers.length) return toast("warning", "Select at least one agent");
    const fd = new FormData();
    fd.append("excel", selectedFile);
    fd.append("selectedUsers", selectedUsers.join(","));
    fd.append("listId", listId);
    fd.append("campaign_id", campaign);
    setUploadPct(0);
    try {
      await axios.post(`${API}/showListupload`, fd, {
        headers: { ...authHeader(), "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => e.total && setUploadPct(Math.round((e.loaded * 100) / e.total)),
      });
      toast("success", "File uploaded successfully");
      setModal(null);
      setPage(1);
      refreshAll();
    } catch (err) {
      console.error("Upload error:", err);
      toast("error", err.response?.data?.message || "Upload failed");
    } finally {
      setUploadPct(null);
    }
  };

  /* add single lead */
  const openAdd = () => {
    setLead(EMPTY_LEAD);
    setModal("add");
  };
  const handleAddLead = async (e) => {
    e.preventDefault();
    const digits = lead.phone_number.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) return toast("warning", "Enter a valid phone number");
    setSavingLead(true);
    try {
      await axios.post(
        `${API}/leads/${encodeURIComponent(listId)}/single`,
        { ...lead, phone_number: digits, campaign_id: campaign },
        { headers: authHeader() }
      );
      toast("success", "Lead added — ready to dial");
      setModal(null);
      refreshAll();
    } catch (err) {
      console.error(err);
      toast("error", err.response?.data?.message || "Failed to add lead");
    } finally {
      setSavingLead(false);
    }
  };

  /* churn */
  const openChurn = () => {
    setChurnStatuses([]);
    setModal("churn");
  };
  const handleChurn = async () => {
    if (!churnStatuses.length) return;
    const r = await Swal.fire({
      title: `Re-queue ${fmt(churnSelectedCount)} leads?`,
      text: `They will be reset to "${summary.freshStatus}" and the autodialer will call them again.`,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#4f46e5",
      confirmButtonText: "Yes, churn",
    });
    if (!r.isConfirmed) return;
    setChurning(true);
    try {
      const res = await axios.post(
        `${API}/leads/${encodeURIComponent(listId)}/churn`,
        { statuses: churnStatuses },
        { headers: authHeader() }
      );
      toast("success", `${fmt(res.data.updated)} leads sent back to dialer`);
      setModal(null);
      refreshAll();
    } catch (err) {
      console.error(err);
      toast("error", err.response?.data?.message || "Churn failed");
      refreshAll();
    } finally {
      setChurning(false);
    }
  };

  const selectStatus = (s) => {
    setStatusFilter(s);
    setPage(1);
  };

  /* ---------- Render ---------- */
  return (
    <div className="sl-page">
      {/* Header */}
      <div className="sl-header">
        <div className="sl-title-wrap">
          <button className="sl-icon-btn" onClick={() => navigate(-1)} title="Back to lists">
            <IconBack />
          </button>
          <div>
            <h1 className="sl-title">
              Upload Data <span className="sl-tag">List {listId}</span>
            </h1>
            <p className="sl-subtitle">
              {campaign ? <>Campaign <b>{campaign}</b> · </> : null}
              {fmt(listTotal)} leads · {fmt(freshCount)} waiting to dial
            </p>
          </div>
        </div>

        <div className="sl-actions">
          <button className="sl-btn sl-btn--ghost sl-btn--compact" onClick={openAdd} title="Add single lead">
            <IconPlus /> <span className="sl-btn__label">Add Lead</span>
          </button>
          <button className="sl-btn sl-btn--ghost sl-btn--compact" onClick={openChurn} disabled={!churnable.length} title="Churn data">
            <IconRecycle /> <span className="sl-btn__label">Churn</span>
          </button>
          <button className="sl-btn sl-btn--ghost sl-btn--compact" onClick={() => navigate("dialdata")} title="Dialed data">
            <IconPhone /> <span className="sl-btn__label">Dialed Data</span>
          </button>
          <button className="sl-btn sl-btn--ghost sl-btn--compact" onClick={handleExport} disabled={exporting} title="Export CSV">
            <IconDownload /> <span className="sl-btn__label">{exporting ? "Exporting…" : "Export"}</span>
          </button>
          <button className="sl-icon-btn sl-icon-btn--lg sl-icon-btn--danger" onClick={handleDeleteAll} disabled={!listTotal} title="Delete all leads">
            <IconTrash />
          </button>
          <button className="sl-btn sl-btn--primary" onClick={openUpload}>
            <IconUpload /> Upload
          </button>
        </div>
      </div>

      {/* Status breakdown */}
      <div className="sl-status-bar">
        <button
          className={`sl-chip ${statusFilter === "" ? "is-active" : ""}`}
          onClick={() => selectStatus("")}
        >
          <span className="sl-chip__dot" style={{ background: "#334155" }} />
          All <b>{fmt(listTotal)}</b>
        </button>
        {summary.statuses.map((s) => (
          <button
            key={s.status}
            className={`sl-chip ${statusFilter === s.status ? "is-active" : ""}`}
            onClick={() => selectStatus(statusFilter === s.status ? "" : s.status)}
            style={{ "--chip": statusColor(s.status) }}
          >
            <span className="sl-chip__dot" style={{ background: statusColor(s.status) }} />
            {s.status} <b>{fmt(s.count)}</b>
          </button>
        ))}
      </div>

      {listTotal > 0 && (
        <div className="sl-progress" title="Status distribution">
          {summary.statuses.map((s) => (
            <span
              key={s.status}
              style={{ width: `${(s.count / listTotal) * 100}%`, background: statusColor(s.status) }}
              title={`${s.status}: ${fmt(s.count)}`}
            />
          ))}
        </div>
      )}

      {/* Table card */}
      <div className="sl-card">
        <div className="sl-toolbar">
          <div className="sl-search">
            <span className="sl-search__icon"><IconSearch /></span>
            <input
              placeholder="Search phone, name, email, company…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <div className="sl-toolbar__right">
            {statusFilter && (
              <span className="sl-filter-tag">
                Status: {statusFilter}
                <button onClick={() => selectStatus("")} aria-label="Clear filter"><IconClose /></button>
              </span>
            )}
            <button className="sl-icon-btn" onClick={refreshAll} title="Refresh">
              <IconRefresh />
            </button>
          </div>
        </div>

        <div className={`sl-table-wrap ${loading ? "is-loading" : ""}`}>
          <table className="sl-table">
            <thead>
              <tr>
                <th className="w-num">#</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Company</th>
                <th>Department</th>
                <th>Industry</th>
                <th>Status</th>
                <th>Agent</th>
                <th>Uploaded</th>
                <th className="center">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={11}>
                    <div className="sl-empty">
                      <IconFile />
                      <p>{search || statusFilter ? "No leads match this filter." : "No leads in this list yet."}</p>
                      {!search && !statusFilter && (
                        <div className="sl-empty__actions">
                          <button className="sl-btn sl-btn--primary" onClick={openUpload}><IconUpload /> Upload file</button>
                          <button className="sl-btn sl-btn--ghost" onClick={openAdd}><IconPlus /> Add a test lead</button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              {rows.map((row, i) => (
                <tr key={row.id}>
                  <td className="w-num muted">{(page - 1) * pageSize + i + 1}</td>
                  <td className="strong">{row.name || "-"}</td>
                  <td className="mono">{row.phone_number || "-"}</td>
                  <td className="muted ellipsis" title={row.email}>{row.email || "-"}</td>
                  <td className="ellipsis" title={row.company_name}>{row.company_name || "-"}</td>
                  <td>{row.department || "-"}</td>
                  <td>{row.industry || "-"}</td>
                  <td>
                    <span className="sl-badge" style={{ "--c": statusColor(row.dial_status) }}>
                      {row.dial_status || "-"}
                    </span>
                  </td>
                  <td>{row.username || <span className="muted">—</span>}</td>
                  <td className="muted nowrap">{formatIST(row.ins_date)}</td>
                  <td className="center">
                    <button className="sl-icon-btn sl-icon-btn--danger" title="Delete" onClick={() => handleDelete(row)}>
                      <IconTrash />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && <div className="sl-loader"><span /></div>}
        </div>

        {/* Pagination */}
        <div className="sl-pagination">
          <div className="sl-page-size">
            <span>Rows per page</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {[25, 50, 100, 200].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="muted">
            {total ? `${fmt((page - 1) * pageSize + 1)}–${fmt(Math.min(page * pageSize, total))} of ${fmt(total)}` : "0 records"}
          </div>
          <div className="sl-page-nav">
            <button onClick={() => setPage(1)} disabled={page === 1}>First</button>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}><IconChevronL /></button>
            <span>Page {page} / {fmt(totalPages)}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}><IconChevronR /></button>
          </div>
        </div>
      </div>

      {/* ---------- Upload modal ---------- */}
      {modal === "upload" && (
        <Modal
          title="Upload leads"
          subtitle={`Excel file into list ${listId}`}
          onClose={() => uploadPct === null && setModal(null)}
          width={600}
          footer={
            <>
              <button className="sl-btn sl-btn--ghost" onClick={() => setModal(null)} disabled={uploadPct !== null}>Cancel</button>
              <button
                className="sl-btn sl-btn--primary"
                onClick={handleUpload}
                disabled={!selectedFile || !selectedUsers.length || uploadPct !== null}
              >
                {uploadPct !== null ? `Uploading ${uploadPct}%…` : "Upload"}
              </button>
            </>
          }
        >
          <div
            className={`sl-drop ${dragOver ? "is-over" : ""} ${selectedFile ? "has-file" : ""}`}
            onClick={() => fileInputRef.current.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files[0]); }}
          >
            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx,.xls"
              style={{ display: "none" }}
              onChange={(e) => { pickFile(e.target.files[0]); e.target.value = ""; }}
            />
            <IconFile />
            {selectedFile ? (
              <>
                <b>{selectedFile.name}</b>
                <span>{(selectedFile.size / 1024 / 1024).toFixed(2)} MB · click to change</span>
              </>
            ) : (
              <>
                <b>Drop Excel file here or click to browse</b>
                <span>.xlsx / .xls — use the Sample file format from the lists page</span>
              </>
            )}
          </div>
          {uploadPct !== null && (
            <div className="sl-upload-bar"><span style={{ width: `${uploadPct}%` }} /></div>
          )}

          <div className="sl-field-head">
            <span>Allocate to agents <b>({selectedUsers.length} selected)</b></span>
            <button
              type="button"
              className="sl-link"
              onClick={() =>
                setSelectedUsers(selectedUsers.length === agents.length ? [] : agents.map((a) => a.user_id))
              }
            >
              {selectedUsers.length === agents.length && agents.length ? "Clear all" : "Select all"}
            </button>
          </div>
          <div className="sl-agent-list">
            {agents.length === 0 && <div className="muted sl-pad">No agents found.</div>}
            {agents.map((a) => (
              <label key={a.user_id} className={`sl-agent ${selectedUsers.includes(a.user_id) ? "is-on" : ""}`}>
                <input
                  type="checkbox"
                  checked={selectedUsers.includes(a.user_id)}
                  onChange={() => toggleUser(a.user_id)}
                />
                <span className="sl-avatar">{String(a.full_name || a.user_id).charAt(0).toUpperCase()}</span>
                <span>
                  <b>{a.user_id}</b>
                  <small>{a.full_name}</small>
                </span>
              </label>
            ))}
          </div>
        </Modal>
      )}

      {/* ---------- Add single lead modal ---------- */}
      {modal === "add" && (
        <Modal
          title="Add single lead"
          subtitle="Quick way to test the dialer with one number"
          onClose={() => setModal(null)}
          footer={
            <>
              <button className="sl-btn sl-btn--ghost" type="button" onClick={() => setModal(null)}>Cancel</button>
              <button className="sl-btn sl-btn--primary" type="submit" form="sl-add-form" disabled={savingLead}>
                {savingLead ? "Saving…" : "Add lead"}
              </button>
            </>
          }
        >
          <form id="sl-add-form" className="sl-form" onSubmit={handleAddLead}>
            <label className="sl-field">
              <span>Phone number *</span>
              <input
                value={lead.phone_number}
                onChange={(e) => setLead({ ...lead, phone_number: e.target.value })}
                placeholder="9876543210"
                inputMode="tel"
                autoFocus
                required
              />
            </label>
            <label className="sl-field">
              <span>Name</span>
              <input value={lead.name} onChange={(e) => setLead({ ...lead, name: e.target.value })} placeholder="Test Lead" />
            </label>
            <label className="sl-field">
              <span>Email</span>
              <input type="email" value={lead.email} onChange={(e) => setLead({ ...lead, email: e.target.value })} placeholder="test@example.com" />
            </label>
            <label className="sl-field">
              <span>Company</span>
              <input value={lead.company_name} onChange={(e) => setLead({ ...lead, company_name: e.target.value })} placeholder="Company" />
            </label>
            <label className="sl-field full">
              <span>Allocate to agent</span>
              <select value={lead.username} onChange={(e) => setLead({ ...lead, username: e.target.value })}>
                <option value="">— Not allocated —</option>
                {agents.map((a) => (
                  <option key={a.user_id} value={a.user_id}>{a.user_id} - {a.full_name}</option>
                ))}
              </select>
            </label>
          </form>
        </Modal>
      )}

      {/* ---------- Churn modal ---------- */}
      {modal === "churn" && (
        <Modal
          title="Churn data"
          subtitle={`Send already-dialed leads back to the dialer as "${summary.freshStatus}"`}
          onClose={() => !churning && setModal(null)}
          width={540}
          footer={
            <>
              <button className="sl-btn sl-btn--ghost" onClick={() => setModal(null)} disabled={churning}>Cancel</button>
              <button className="sl-btn sl-btn--primary" onClick={handleChurn} disabled={!churnStatuses.length || churning}>
                {churning ? "Processing in batches…" : `Re-queue ${fmt(churnSelectedCount)} leads`}
              </button>
            </>
          }
        >
          {churnable.length === 0 ? (
            <div className="muted sl-pad">Nothing to churn — no dialed leads in this list yet.</div>
          ) : (
            <>
              <div className="sl-field-head">
                <span>Pick the statuses to redial</span>
                <button
                  type="button"
                  className="sl-link"
                  onClick={() =>
                    setChurnStatuses(churnStatuses.length === churnable.length ? [] : churnable.map((x) => x.status))
                  }
                >
                  {churnStatuses.length === churnable.length ? "Clear all" : "Select all"}
                </button>
              </div>
              <div className="sl-churn-list">
                {churnable.map((s) => (
                  <label key={s.status} className={`sl-churn-item ${churnStatuses.includes(s.status) ? "is-on" : ""}`}>
                    <input
                      type="checkbox"
                      checked={churnStatuses.includes(s.status)}
                      onChange={() =>
                        setChurnStatuses((prev) =>
                          prev.includes(s.status) ? prev.filter((x) => x !== s.status) : [...prev, s.status]
                        )
                      }
                    />
                    <span className="sl-badge" style={{ "--c": statusColor(s.status) }}>{s.status}</span>
                    <span className="sl-churn-count">{fmt(s.count)}</span>
                  </label>
                ))}
              </div>
              <p className="sl-note">
                Updates run on the server in small batches with a short pause between them, so live
                calls and the dialer hopper are not blocked. Leads currently in a call
                {summary.lockedStatuses.length ? ` (${summary.lockedStatuses.join(", ")})` : ""} are never touched.
              </p>
            </>
          )}
        </Modal>
      )}
    </div>
  );
};

export default ShowList;