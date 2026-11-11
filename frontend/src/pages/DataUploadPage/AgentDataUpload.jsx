import { useState, useEffect, useContext, useMemo } from "react";
import axios from "axios";
import { maskNumber, clickToCall } from "../../context/Phoneutils";
import { AuthContext } from "../../context/authContext";
import { PopupContext } from "../../context/iframeContext";
import "./DataUpload.css";
const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);
const UploadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);
const PhoneIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z" />
  </svg>
);
const AgentDataUpload = () => {
  const [openDialog, setOpenDialog] = useState(false);
  const { user } = useContext(AuthContext) || {};
  const { toggleIframe, updateIframeSrc } = useContext(PopupContext) || {};
  const [selectedFile, setSelectedFile] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(0);
  const [listData, setListData] = useState([]);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    const fetchData = async () => {
      const token = localStorage.getItem("token");
      if (!token) return;
      try {
        const response = await axios.get(
          `https://${window.location.hostname}:4000/AgentDataUpload`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setListData(response.data.data || []);
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };
    fetchData();
  }, []);
  const handleOpenDialog = () => {
    setSelectedFile(null);
    setOpenDialog(true);
  };
  const handleCloseDialog = () => setOpenDialog(false);
  const handleFileChange = (e) => setSelectedFile(e.target.files[0]);
  const handleSave = async () => {
    if (!selectedFile) {
      alert("Please select a file.");
      return;
    }
    const token = localStorage.getItem("token");
    if (!token) {
      alert("No authentication token found. Please login.");
      return;
    }
    const formData = new FormData();
    formData.append("excel", selectedFile);
    try {
      setUploading(true);
      const response = await axios.post(
        `https://${window.location.hostname}:4000/agent_upload`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            Authorization: `Bearer ${token}`,
          },
        }
      );
      alert(`Upload Successful! Rows Processed: ${response.data.successCount}`);
      handleCloseDialog();
    } catch (error) {
      console.error("Upload Failed:", error.response?.data || error.message);
      alert(`Upload Failed: ${error.response?.data?.error || "Server Error"}`);
    } finally {
      setUploading(false);
    }
  };
  const filteredData = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return listData;
    return listData.filter((item) =>
      [item.name, item.email, item.department, item.phone_number, item.company_name, item.industry]
        .some((v) => v && v.toString().toLowerCase().includes(q))
    );
  }, [listData, searchQuery]);
  const totalRows = filteredData.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const paged = filteredData.slice(currentPage * pageSize, currentPage * pageSize + pageSize);
  const uniqueCompanies = new Set(listData.map((d) => d.company_name).filter(Boolean)).size;
  const uniqueIndustries = new Set(listData.map((d) => d.industry).filter(Boolean)).size;
  return (
    <div className="upload-page">
      {/* Header */}
      <div className="upload-header">
        <div>
          <h1 className="upload-title">Uploaded Data</h1>
          <p className="upload-subtitle">
            Your uploaded contacts, ready to dial and manage.
          </p>
        </div>
        <div className="upload-actions">
          <div className="upload-search">
            <span className="upload-search-icon"><SearchIcon /></span>
            <input
              type="text"
              placeholder="Search data..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
            />
          </div>
          <button className="btn btn-primary" onClick={handleOpenDialog}>
            <UploadIcon /> Upload Excel
          </button>
        </div>
      </div>
      {/* Stats */}
      <div className="upload-stats">
        <div className="stat">
          <div className="stat-tint" style={{ background: "#6366f1" }} />
          <div>
            <div className="stat-label">TOTAL RECORDS</div>
            <div className="stat-value">{listData.length}</div>
          </div>
        </div>
        <div className="stat">
          <div className="stat-tint" style={{ background: "#10b981" }} />
          <div>
            <div className="stat-label">SHOWING</div>
            <div className="stat-value">{totalRows}</div>
          </div>
        </div>
        <div className="stat">
          <div className="stat-tint" style={{ background: "#f59e0b" }} />
          <div>
            <div className="stat-label">COMPANIES</div>
            <div className="stat-value">{uniqueCompanies}</div>
          </div>
        </div>
        <div className="stat">
          <div className="stat-tint" style={{ background: "#0ea5e9" }} />
          <div>
            <div className="stat-label">INDUSTRIES</div>
            <div className="stat-value">{uniqueIndustries}</div>
          </div>
        </div>
      </div>
      {/* Table */}
      <div className="upload-card">
        {paged.length === 0 ? (
          <div className="upload-empty">No data to display.</div>
        ) : (
          <div className="upload-table-wrap">
            <table className="upload-table">
              <thead>
                <tr>
                  <th>Sr.</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Department</th>
                  <th>Phone Number</th>
                  <th>Company</th>
                  <th>Industry</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((row, idx) => (
                  <tr key={row.id ?? idx}>
                    <td className="mono">{currentPage * pageSize + idx + 1}</td>
                    <td style={{ textAlign: "left", fontWeight: 600, color: "var(--ink)" }}>
                      {row.name || <span className="muted">—</span>}
                    </td>
                    <td className="desc">{row.email || <span className="muted">—</span>}</td>
                    <td>{row.department || <span className="muted">—</span>}</td>
                    <td>
                      <div className="row-actions" style={{ gap: 10 }}>
                        <span className="mono">{maskNumber(row.phone_number || "")}</span>
                        {row.phone_number && (
                          <button
                            type="button"
                            className="icon-btn icon-btn--edit"
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
                            <PhoneIcon />
                          </button>
                        )}
                      </div>
                    </td>
                    <td>{row.company_name || <span className="muted">—</span>}</td>
                    <td>{row.industry || <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {/* Pagination */}
        {totalRows > 0 && (
          <div className="upload-pagination">
            <div className="page-size">
              <span>Rows per page</span>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div>
              {currentPage * pageSize + 1}–
              {Math.min((currentPage + 1) * pageSize, totalRows)} of {totalRows}
            </div>
            <div className="page-nav">
              <button onClick={() => setPage(0)} disabled={currentPage === 0}>«</button>
              <button onClick={() => setPage(currentPage - 1)} disabled={currentPage === 0}>‹</button>
              <span style={{ padding: "0 8px" }}>
                {currentPage + 1} / {totalPages}
              </span>
              <button onClick={() => setPage(currentPage + 1)} disabled={currentPage >= totalPages - 1}>›</button>
              <button onClick={() => setPage(totalPages - 1)} disabled={currentPage >= totalPages - 1}>»</button>
            </div>
          </div>
        )}
      </div>
      {/* Upload Modal */}
      {openDialog && (
        <div className="upload-modal-backdrop" onClick={handleCloseDialog}>
          <div className="upload-modal" onClick={(e) => e.stopPropagation()}>
            <div className="upload-modal__head">
              <h3>Upload Excel File</h3>
              <button className="icon-btn" onClick={handleCloseDialog} aria-label="Close">✕</button>
            </div>
            <div className="upload-modal__body" style={{ gridTemplateColumns: "1fr" }}>
              <label className="field full">
                <span>Excel File (.xlsx / .xls / .csv)</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileChange}
                />
                {selectedFile && (
                  <small style={{ color: "var(--muted)", marginTop: 6 }}>
                    Selected: <strong style={{ color: "var(--ink-2)" }}>{selectedFile.name}</strong>
                  </small>
                )}
              </label>
            </div>
            <div className="upload-modal__foot">
              <button className="btn btn-ghost" onClick={handleCloseDialog} disabled={uploading}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={uploading}>
                {uploading ? "Uploading…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default AgentDataUpload;