import { useEffect, useState } from "react";
import axios from "axios";
import * as XLSX from "xlsx";
import dayjs from "dayjs";
const AgentReport = () => {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [page, setPage] = useState(1);
  const rowsPerPage = 10;
  useEffect(() => {
    axios
      .get(`https://${window.location.hostname}:4000/telephony/agentReport`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      })
      .then((response) => {
        const formatted = response.data.map((item, index) => ({
          id: index + 1,
          user_id: item.user_id,
          no_of_breaks: item.no_of_breaks,
          break_names: item.break_names,
          login_time: item.login_time
            ? dayjs(item.login_time).format("DD-MM-YYYY HH:mm:ss")
            : "",
          no_of_ans: item.no_of_ans,
          no_of_can: item.no_of_can,
          no_of_tot: item.no_of_tot,
        }));
        const reversed = formatted.reverse();
        setData(reversed);
        setFilteredData(reversed);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching data!", err);
        setLoading(false);
      });
  }, []);
  const handleSearch = () => {
    if (fromDate && toDate) {
      const filtered = data.filter((agent) => {
        const loginDate = new Date(
          agent.login_time.split(" ")[0].split("-").reverse().join("-")
        );
        return loginDate >= new Date(fromDate) && loginDate <= new Date(toDate);
      });
      setFilteredData(filtered);
      setPage(1);
    } else {
      setFilteredData(data);
    }
  };
  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(filteredData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Agent Report Data");
    XLSX.writeFile(wb, "AgentReportData.xlsx");
    setIsModalOpen(true);
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
      <div className="ab-head">
        <div>
          <h3>Agent Reports</h3>
          <div className="ab-head-sub">
            Summary of agent activity, breaks and call handling.
          </div>
        </div>
      </div>
      <div className="ab-toolbar">
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
        <div className="ab-field">
          <label className="ab-label">&nbsp;</label>
          <div />
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
      <div className="ab-tablecard">
        <div className="ab-tablescroll">
          <table className="ab-table">
            <thead>
              <tr>
                <th>Sr.</th>
                <th>User ID</th>
                <th>No. of Breaks</th>
                <th>Break Names</th>
                <th>Login Time</th>
                <th>No. of Ans</th>
                <th>No. of Can</th>
                <th>No. of Total</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="ab-empty" colSpan={8}>
                    <span className="ab-spinner" /> Loading...
                  </td>
                </tr>
              ) : currentRows.length === 0 ? (
                <tr>
                  <td className="ab-empty" colSpan={8}>
                    No data available.
                  </td>
                </tr>
              ) : (
                currentRows.map((row, index) => (
                  <tr key={row.id}>
                    <td><span className="ab-id">{firstRow + index + 1}</span></td>
                    <td className="ab-user">{row.user_id}</td>
                    <td>{row.no_of_breaks}</td>
                    <td>{row.break_names}</td>
                    <td className="ab-mono">{row.login_time}</td>
                    <td>{row.no_of_ans}</td>
                    <td>{row.no_of_can}</td>
                    <td>{row.no_of_tot}</td>
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
export default AgentReport;