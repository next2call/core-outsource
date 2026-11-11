import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import axios from "axios";
import Swal from "sweetalert2";
import BackButton from "../../../context/BackButton";
import "./assignedAgents.css";

const avatarColors = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444",
  "#3b82f6", "#a855f7", "#ec4899", "#14b8a6",
];

const avatarColor = (seed = "") => {
  const i =
    String(seed)
      .split("")
      .reduce((a, c) => a + c.charCodeAt(0), 0) % avatarColors.length;
  return avatarColors[i];
};

const AssignedAgents = () => {
  const location = useLocation();
  const { groupId } = location.state || {};
  const [data, setData] = useState([]);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!groupId) {
          setError("Group ID is missing. Unable to fetch agents.");
          return;
        }
        const response = await axios.get(
          `https://${window.location.hostname}:4000/getAgentsByGroup/${groupId}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        setData(Array.isArray(response.data) ? response.data : []);
        setError("");
      } catch (err) {
        console.error(
          "Error fetching Extension:",
          err.response?.data?.message || err.message
        );
        setError("An error occurred while fetching extensions.");
      }
    };

    fetchAgents();
  }, [groupId]);

  const handleDelete = async (id) => {
    if (!id) {
      Swal.mixin({
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true,
        didOpen: (toast) => {
          toast.onmouseenter = Swal.stopTimer;
          toast.onmouseleave = Swal.resumeTimer;
        },
      }).fire({
        icon: "warning",
        title: "Please provide a valid ID.",
      });
      return;
    }

    try {
      const response = await axios.delete(
        `https://${window.location.hostname}:4000/deletelist/${id}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );

      if (response.status === 200) {
        setData((prevData) => prevData.filter((item) => item.id !== id));

        Swal.mixin({
          toast: true,
          position: "top-end",
          showConfirmButton: false,
          timer: 3000,
          timerProgressBar: true,
          didOpen: (toast) => {
            toast.onmouseenter = Swal.stopTimer;
            toast.onmouseleave = Swal.resumeTimer;
          },
        }).fire({
          icon: "success",
          title: "Record deleted successfully.",
        });
      }
    } catch (error) {
      Swal.mixin({
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true,
        didOpen: (toast) => {
          toast.onmouseenter = Swal.stopTimer;
          toast.onmouseleave = Swal.resumeTimer;
        },
      }).fire({
        icon: "error",
        title:
          error.response?.data?.message ||
          "An error occurred while deleting the record.",
      });
    }
  };

  const filteredData = (Array.isArray(data) ? data : []).filter((item) => {
    if (!searchQuery) return true;
    const s = searchQuery.toLowerCase();
    return (
      item.group_id?.toString().toLowerCase().includes(s) ||
      item.agent_id?.toString().toLowerCase().includes(s) ||
      item.agent_name?.toString().toLowerCase().includes(s) ||
      item.campaign_id?.toString().toLowerCase().includes(s)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageData = filteredData.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  return (
    <div className="users-page">
      {/* Header */}
      <div className="users-header">
        <div className="users-header-left">
          <BackButton />
          <div>
            <h1 className="users-title">Assigned Agents</h1>
            <p className="users-subtitle">
              Agents currently assigned to this group.
            </p>
          </div>
        </div>
        <div className="users-actions">
          <div className="users-search">
            <span className="users-search-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              placeholder="Search extension, agent ID, name, campaign..."
            />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="users-stats users-stats--compact">
        <div className="stat">
          <div className="stat-tint" style={{ background: "#6366f1" }} />
          <div>
            <div className="stat-label">TOTAL AGENTS</div>
            <div className="stat-value">{data.length}</div>
          </div>
        </div>
        <div className="stat">
          <div className="stat-tint" style={{ background: "#3b82f6" }} />
          <div>
            <div className="stat-label">SHOWING</div>
            <div className="stat-value">{filteredData.length}</div>
          </div>
        </div>
      </div>

      {/* Card + Table */}
      <div className="users-card">
        {error ? (
          <div className="users-empty error">{error}</div>
        ) : filteredData.length === 0 ? (
          <div className="users-empty">No assigned agents found.</div>
        ) : (
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>USER EXTENSION</th>
                  <th>AGENT NAME</th>
                  <th>AGENT ID</th>
                  <th>CAMPAIGN ID</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {pageData.map((row, idx) => {
                  const name = row.agent_name || "—";
                  return (
                    <tr key={row.id ?? idx}>
                      <td className="muted">
                        {(currentPage - 1) * pageSize + idx + 1}
                      </td>
                      <td className="mono">{row.group_id || "—"}</td>
                      <td className="left">
                        <div className="user-cell">
                          <div
                            className="avatar"
                            style={{ background: avatarColor(name) }}
                          >
                            {String(name).charAt(0).toUpperCase()}
                          </div>
                          <span>{name}</span>
                        </div>
                      </td>
                      <td className="mono">{row.agent_id || "—"}</td>
                      <td className="mono">{row.campaign_id || "—"}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="icon-btn danger"
                            onClick={() => handleDelete(row.id)}
                            title="Delete"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            </svg>
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
        {filteredData.length > 0 && (
          <div className="users-pagination">
            <div className="page-size">
              <span>Rows per page</span>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
            <div>
              {(currentPage - 1) * pageSize + 1}–
              {Math.min(currentPage * pageSize, filteredData.length)} of{" "}
              {filteredData.length}
            </div>
            <div className="page-nav">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >‹</button>
              <span>{currentPage} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >›</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AssignedAgents;