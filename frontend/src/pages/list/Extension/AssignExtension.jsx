import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { X, Search, Users } from "lucide-react";

const AssignExtension = ({
  groupDropdownVisible = false,
  setGroupDropdownVisible = () => {},
  groupId = null,
  updateAssignedAgents = () => {},
}) => {
  const [agentsList, setAgentsList] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!groupId) return; // Only fetch if groupId is valid

    const fetchAgents = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem("token");
        if (!token) throw new Error("Authorization token is missing.");

        const response = await axios.get(
          `https://${window.location.hostname}:4000/getAgentsExtension/${groupId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        setAgentsList(response.data || []);
        setError("");
      } catch (err) {
        console.error("Error fetching agents:", err);
        setError(err.message || "An error occurred while fetching agents.");
      } finally {
        setLoading(false);
      }
    };

    fetchAgents();
  }, [groupId]);

  const filteredAgents = useMemo(() => {
    const q = searchQuery.toLowerCase();
    if (!q) return agentsList;
    return agentsList.filter(
      (a) =>
        a.agent_name?.toLowerCase().includes(q) ||
        a.agent_id?.toString().toLowerCase().includes(q)
    );
  }, [agentsList, searchQuery]);

  if (!groupDropdownVisible) return null;

  return (
    <div className="review-modal-backdrop" onClick={() => setGroupDropdownVisible(false)}>
      <div className="review-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="review-modal__head">
          <div className="review-modal__head-text">
            <span className="review-modal__icon">
              <Users size={16} />
            </span>
            <div>
              <h3>Assigned Agents</h3>
              <p>Agents currently linked to this extension group.</p>
            </div>
          </div>
          <button
            className="icon-btn"
            onClick={() => setGroupDropdownVisible(false)}
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        {agentsList.length > 0 && (
          <div className="review-modal__search">
            <Search size={15} />
            <input
              type="text"
              placeholder="Search agent name or ID…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        )}

        {/* Body */}
        <div className="review-modal__body">
          {loading ? (
            <div className="review-modal__empty">Loading agents…</div>
          ) : filteredAgents.length === 0 ? (
            <div className="review-modal__empty">
              {error || (agentsList.length === 0
                ? "No agents assigned for this group."
                : "No agents match your search.")}
            </div>
          ) : (
            <ul className="review-agent-list">
              {filteredAgents.map((agent) => (
                <li key={agent.agent_id} className="review-agent-row">
                  <span className="review-agent-avatar">
                    {(agent.agent_name || "?").trim().charAt(0).toUpperCase()}
                  </span>
                  <div className="review-agent-info">
                    <div className="review-agent-name">{agent.agent_name || "—"}</div>
                    <div className="review-agent-id">ID · {agent.agent_id}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="review-modal__foot">
          <span className="review-modal__count">
            {agentsList.length > 0
              ? `${agentsList.length} agent${agentsList.length !== 1 ? "s" : ""} assigned`
              : ""}
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setGroupDropdownVisible(false)}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default AssignExtension;