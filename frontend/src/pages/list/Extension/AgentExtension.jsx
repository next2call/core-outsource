import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import Swal from "sweetalert2";
import { X, Search, UserCog, Check } from "lucide-react";

const Dropdown = ({
  dropdownVisible,
  setDropdownVisible,
  groupId,
  campaignId,
}) => {
  const [agentsList, setAgentsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAgent, setSelectedAgent] = useState([]);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    const fetchAgents = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem("token");
        if (!token) throw new Error("Authentication token not found");

        const response = await axios.get(
          `https://${window.location.hostname}:4000/agentsExtension`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        setAgentsList(response.data || []);
      } catch (err) {
        console.error("Error fetching agents:", err.response?.data || err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchAgents();
  }, []);

  const showToast = (icon, message) => {
    const Toast = Swal.mixin({
      toast: true,
      position: "top-end",
      showConfirmButton: false,
      timer: 3000,
      timerProgressBar: true,
      didOpen: (toast) => {
        toast.onmouseenter = Swal.stopTimer;
        toast.onmouseleave = Swal.resumeTimer;
      },
    });

    Toast.fire({ icon, title: message });
  };

  const handleCheckboxChange = (agent) => {
    setSelectedAgent((prev) =>
      prev.some((a) => a.user_id === agent.user_id)
        ? prev.filter((a) => a.user_id !== agent.user_id)
        : [...prev, agent]
    );
  };

  const filteredAgents = useMemo(() => {
    const q = searchQuery.toLowerCase();
    if (!q) return agentsList;
    return agentsList.filter(
      (a) =>
        a.full_name?.toLowerCase().includes(q) ||
        a.user_id?.toString().toLowerCase().includes(q)
    );
  }, [agentsList, searchQuery]);

  const handleAssign = async () => {
    if (selectedAgent.length === 0) {
      showToast("warning", "No agent selected.");
      return;
    }

    setAssigning(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Authentication token not found");

      for (let agent of selectedAgent) {
        const checkResponse = await axios.post(
          `https://${window.location.hostname}:4000/checkAgentAssignment`,
          { groupId, agentId: agent.user_id },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (checkResponse.data.assigned) {
          showToast("info", `Agent ${agent.full_name} is already assigned to this group.`);
          setAssigning(false);
          return;
        }
      }

      const payload = {
        groupId,
        campaignId,
        agents: selectedAgent.map((agent) => ({
          user_id: agent.user_id,
          full_name: agent.full_name || null,
        })),
      };

      await axios.post(
        `https://${window.location.hostname}:4000/assignAgent`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      showToast("success", "Agents assigned successfully!");
      setDropdownVisible(false);
    } catch (err) {
      console.error(err.message);
      showToast("error", "Error assigning agents.");
    } finally {
      setAssigning(false);
    }
  };

  if (!dropdownVisible) return null;

  return (
    <div className="assign-modal-backdrop" onClick={() => setDropdownVisible(false)}>
      <div className="assign-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="assign-modal__head">
          <div className="assign-modal__head-text">
            <span className="assign-modal__icon">
              <UserCog size={16} />
            </span>
            <div>
              <h3>Assign Agents</h3>
              <p>Select agents to add to this extension group.</p>
            </div>
          </div>
          <button
            className="icon-btn"
            onClick={() => setDropdownVisible(false)}
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="assign-modal__search">
          <Search size={15} />
          <input
            type="text"
            placeholder="Search agent name or ID…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Body */}
        <div className="assign-modal__body">
          {loading ? (
            <div className="assign-modal__empty">Loading agents…</div>
          ) : filteredAgents.length === 0 ? (
            <div className="assign-modal__empty">
              {agentsList.length === 0
                ? "No agents available."
                : "No agents match your search."}
            </div>
          ) : (
            <ul className="assign-agent-list">
              {filteredAgents.map((agent) => {
                const checked = selectedAgent.some((a) => a.user_id === agent.user_id);
                return (
                  <li
                    key={agent.user_id}
                    className={`assign-agent-row${checked ? " checked" : ""}`}
                    onClick={() => handleCheckboxChange(agent)}
                  >
                    <span className="assign-agent-avatar">
                      {(agent.full_name || "?").trim().charAt(0).toUpperCase()}
                    </span>
                    <div className="assign-agent-info">
                      <div className="assign-agent-name">{agent.full_name || "—"}</div>
                      <div className="assign-agent-id">ID · {agent.user_id}</div>
                    </div>
                    <span className={`assign-agent-check${checked ? " on" : ""}`}>
                      {checked && <Check size={13} strokeWidth={3} />}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="assign-modal__foot">
          <span className="assign-modal__count">
            {selectedAgent.length > 0
              ? `${selectedAgent.length} agent${selectedAgent.length !== 1 ? "s" : ""} selected`
              : "No agents selected"}
          </span>
          <div className="assign-modal__foot-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setDropdownVisible(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleAssign}
              disabled={assigning || selectedAgent.length === 0}
            >
              {assigning ? "Assigning…" : "Assign"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dropdown;