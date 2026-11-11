import { useState, useEffect } from "react";
import axios from "axios";
import * as XLSX from "xlsx";
import dayjs from "dayjs";
const DateFilterComponent = () => {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const [filteredData, setFilteredData] = useState([]);
  const [data, setData] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [page, setPage] = useState(1);
  const rowsPerPage = 10;
  useEffect(() => {
    axios
      .get(`https://${window.location.hostname}:4000/telephony/agent-breaks`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      })
      .then((response) => {
        const formatted = response.data.map((item, index) => ({
          id: index + 1,
          user_name: item.user_id,
          break_name: item.break_name,
          status: item.break_status,
          start_time: item.start_time, // keep original ISO value
          break_duration: item.break_duration,
        }));
        setData(formatted);
        setFilteredData(formatted);
        setUsers([...new Set(formatted.map((i) => i.user_name))]);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching data!", err);
        setLoading(false);
      });
  }, []);
  const handleSearch = () => {
    let filtered = data;

    if (fromDate && toDate) {
      filtered = filtered.filter((u) => {
        const d = dayjs(u.start_time).format("YYYY-MM-DD");
        return d >= fromDate && d <= toDate;
      });
    }

    if (selectedUser) {
      filtered = filtered.filter((u) => u.user_name === selectedUser);
    }

    setFilteredData(filtered);
    setPage(1);
  };
  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(filteredData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Agent Break Data");
    XLSX.writeFile(wb, "AgentBreakData.xlsx");
    setIsModalOpen(true);
  };
  const statusPill = (status) => {
    const s = String(status ?? "").toLowerCase();
    if (s === "ready" || s === "1")
      return <span className="ab-pill ab-pill--ready">Ready</span>;
    if (s === "break" || s === "on break" || s === "0")
      return <span className="ab-pill ab-pill--break">On Break</span>;
    if (s === "offline")
      return <span className="ab-pill ab-pill--offline">Offline</span>;
    return <span className="ab-pill ab-pill--muted">{String(status)}</span>;
  };
  const lastRow = page * rowsPerPage;
  const firstRow = lastRow - rowsPerPage;
  const currentRows = filteredData.slice(firstRow, lastRow);
  const totalPages = Math.max(1, Math.ceil(filteredData.length / rowsPerPage));
  const gotoPage = (p) => setPage(Math.min(Math.max(1, p), totalPages));
  const renderPageButtons = () => {
    const buttons = [];
    const maxVisible = 5;
    let start = Math.max(1, page - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    start = Math.max(1, end - maxVisible + 1);
    for (let i = start; i <= end; i++) {
      buttons.push(
        <button
          key={i}
          className={`ab-page-btn ${i === page ? "is-active" : ""}`}
          onClick={() => gotoPage(i)}
        >
          {i}
        </button>
      );
    }
    return buttons;
  };
  return (
    <div className="ab-wrap">
      {/* Header */}
      <div className="ab-head">
        <div>
          <h3>Agents Break</h3>
          <div className="ab-head-sub">
            Track break sessions and durations across your agents.
          </div>
        </div>
      </div>
      {/* Toolbar */}
      <div className="ab-toolbar">
        <div className="ab-field">
          <label className="ab-label">User ID</label>
          <select
            className="ab-select"
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
          >
            <option value="">All Users</option>
            {users.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        <div className="ab-field">
          <label className="ab-label">From Date</label>
          <input
            type="date"
            className="ab-input"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>
        <div className="ab-field">
          <label className="ab-label">To Date</label>
          <input
            type="date"
            className="ab-input"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
        <button className="ab-btn ab-btn--primary" onClick={handleSearch}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          Search
        </button>
        <button
          className="ab-icon-btn"
          onClick={handleExport}
          title="Export to Excel"
          aria-label="Export to Excel"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
      </div>
      {/* Table */}
      <div className="ab-tablecard">
        <div className="ab-tablescroll">
          <table className="ab-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>User ID</th>
                <th>Break Name</th>
                <th>Status</th>
                <th>Take Break Time</th>
                <th>Break Duration</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="ab-empty" colSpan={6}>
                    <span className="ab-spinner" /> Loading...
                  </td>
                </tr>
              ) : currentRows.length === 0 ? (
                <tr>
                  <td className="ab-empty" colSpan={6}>
                    No data found.
                  </td>
                </tr>
              ) : (
                currentRows.map((row) => (
                  <tr key={row.id}>
                    <td><span className="ab-id">{row.id}</span></td>
                    <td className="ab-user">{row.user_name}</td>
                    <td>{row.break_name}</td>
                    <td>{statusPill(row.status)}</td>
                    <td className="ab-mono">
                      {row.start_time
                        ? dayjs(row.start_time).format("DD-MM-YYYY HH:mm:ss")
                        : "—"}
                    </td>
                    <td className="ab-mono">{row.break_duration || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filteredData.length > 0 && (
          <div className="ab-pager">
            <div className="ab-pager-info">
              Showing <strong>{firstRow + 1}</strong>–
              <strong>{Math.min(lastRow, filteredData.length)}</strong> of{" "}
              <strong>{filteredData.length}</strong>
            </div>
            <div className="ab-pager-nav">
              <button className="ab-page-btn" onClick={() => gotoPage(1)} disabled={page === 1}>«</button>
              <button className="ab-page-btn" onClick={() => gotoPage(page - 1)} disabled={page === 1}>‹</button>
              {renderPageButtons()}
              <button className="ab-page-btn" onClick={() => gotoPage(page + 1)} disabled={page === totalPages}>›</button>
              <button className="ab-page-btn" onClick={() => gotoPage(totalPages)} disabled={page === totalPages}>»</button>
            </div>
          </div>
        )}
      </div>
      {/* Export Modal */}
      {isModalOpen && (
        <div className="ab-modal-backdrop" onClick={() => setIsModalOpen(false)}>
          <div className="ab-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ab-modal-head">Export Data</div>
            <div className="ab-modal-body">
              Your data has been exported successfully!
            </div>
            <div className="ab-modal-foot">
              <button className="ab-btn ab-btn--ghost" onClick={() => setIsModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default DateFilterComponent;