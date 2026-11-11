import { useState, useEffect } from "react";
import axios from "axios";
import dayjs from "dayjs";
const LoginReport = () => {
  const [loginData, setLoginData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDate, setFilterDate] = useState({ fromDate: "", toDate: "" });
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const rowsPerPage = 10;
  useEffect(() => {
    fetchLoginData();
  }, []);
  const fetchLoginData = () => {
    setLoading(true);
    axios
      .get(
        `https://${window.location.hostname}:4000/telephony/agent-login-report`,
        {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        }
      )
      .then((response) => {
        const formatted = response.data.map((item, index) => ({
          id: index + 1,
          userId: item.user_name,
          userName: item.user_name,
          loginTime: item.log_in_time
            ? dayjs(item.log_in_time).format("DD-MM-YYYY HH:mm:ss")
            : "",
          logoutTime: item.log_out_time
            ? dayjs(item.log_out_time).format("DD-MM-YYYY HH:mm:ss")
            : "",
          status: item.status,
        }));
        setLoginData(formatted);
        setFilteredData(formatted);
        setLoading(false);
      })
      .catch((error) => {
        console.error("Error fetching login data:", error);
        setLoading(false);
      });
  };
  const handleFilter = () => {
    const { fromDate, toDate } = filterDate;
    if (!fromDate || !toDate || new Date(fromDate) > new Date(toDate)) {
      alert("Please select a valid date range");
      return;
    }
    const filtered = loginData.filter((item) => {
      const loginDate = new Date(
        item.loginTime.split(" ")[0].split("-").reverse().join("-")
      );
      return loginDate >= new Date(fromDate) && loginDate <= new Date(toDate);
    });
    setFilteredData(filtered);
    setPage(1);
  };
  const handleSearch = (e) => {
    const term = e.target.value.toLowerCase();
    setSearchTerm(term);
    const filtered = loginData.filter((item) =>
      String(item.userName || "").toLowerCase().includes(term)
    );
    setFilteredData(filtered);
    setPage(1);
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
  const statusPill = (status) => {
    if (status === 1 || status === "1")
      return <span className="ab-pill ab-pill--ready">Login</span>;
    return <span className="ab-pill ab-pill--offline">Logout</span>;
  };
  return (
    <div className="ab-wrap">
      <div className="ab-head">
        <div>
          <h3>User Login Reports</h3>
          <div className="ab-head-sub">
            Track agent login and logout sessions.
          </div>
        </div>
      </div>
      <div className="ab-toolbar">
        <div className="ab-field">
          <label className="ab-label">Search User</label>
          <input
            type="text"
            className="ab-input"
            placeholder="Search by user name..."
            value={searchTerm}
            onChange={handleSearch}
          />
        </div>
        <div className="ab-field">
          <label className="ab-label">From Date</label>
          <input
            type="date"
            className="ab-input"
            value={filterDate.fromDate}
            onChange={(e) =>
              setFilterDate({ ...filterDate, fromDate: e.target.value })
            }
          />
        </div>
        <div className="ab-field">
          <label className="ab-label">To Date</label>
          <input
            type="date"
            className="ab-input"
            value={filterDate.toDate}
            onChange={(e) =>
              setFilterDate({ ...filterDate, toDate: e.target.value })
            }
          />
        </div>
        <button className="ab-btn ab-btn--primary" onClick={handleFilter}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          Search
        </button>
        <div />
      </div>
      <div className="ab-tablecard">
        <div className="ab-tablescroll">
          <table className="ab-table">
            <thead>
              <tr>
                <th>Sr.</th>
                <th>User ID</th>
                <th>User Name</th>
                <th>Login Time</th>
                <th>Logout Time</th>
                <th>Status</th>
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
                currentRows.map((row, index) => (
                  <tr key={row.id}>
                    <td><span className="ab-id">{firstRow + index + 1}</span></td>
                    <td className="ab-user">{row.userId}</td>
                    <td>{row.userName}</td>
                    <td className="ab-mono">{row.loginTime}</td>
                    <td className="ab-mono">{row.logoutTime || "—"}</td>
                    <td>{statusPill(row.status)}</td>
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
    </div>
  );
};
export default LoginReport;
