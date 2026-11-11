import React, { useState, useEffect, useContext } from "react";
import "./single.scss";
import ViewagentFeatured from "../../components/featured/ViewAgentFeature";
import { useParams } from "react-router-dom";
import { AuthContext } from "../../context/authContext";
import axios from "axios";
import { CircularProgress } from "@mui/material";
import Swal from "sweetalert2";

const userTypeLabels = {
  1: "AGENT",
  2: "TEAM LEADER",
  5: "IT",
  6: "QUALITY ANALYTICS",
  7: "MANAGER",
};

const TABS = ["profile", "permissions", "email", "announcement"];

const Single = () => {
  const { userid } = useParams();
  const { user } = useContext(AuthContext);
  const token = localStorage.getItem("token");
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [autoDialStatus, setAutoDialStatus] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");
  const [agentPermissionsEnabled, setAgentPermissionsEnabled] = useState(false);
  const [agentPermissions, setAgentPermissions] = useState({
    data_upload: false,
    report_view: false,
    block_no: false,
  });
  const [recordingPermission, setRecordingPermission] = useState(false);

  const togglePermission = (key) => {
    setAgentPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const fetchAgentPermissions = () => {
    axios
      .get(`https://${window.location.hostname}:4000/permissions/${userid}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      .then((res) => {
        let permissions = res.data;

        // ✅ If no record exists, treat all as true (default)
        if (!permissions || Object.keys(permissions).length === 0) {
          permissions = {
            data_upload: true,
            report_view: true,
            block_no: true,
          };
        }

        setAgentPermissions(permissions);
        setAgentPermissionsEnabled(
          permissions.data_upload || permissions.report_view || permissions.block_no
        );
      })
      .catch((err) => {
        console.error("Failed to fetch agent permissions:", err);
        setAgentPermissionsEnabled(false);
      });
  };

  const saveAgentPermissions = () => {
    const payload = {
      data_upload: !!agentPermissions.data_upload,
      block_no: !!agentPermissions.block_no,
      report_view: !!agentPermissions.report_view,
    };

    axios
      .post(`https://${window.location.hostname}:4000/permissions/${userid}`, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      .then(() => {
        Swal.fire({
          toast: true,
          position: "top-end",
          icon: "success",
          title: "Permissions updated successfully",
          showConfirmButton: false,
          timer: 2000,
          timerProgressBar: true,
        });
      })
      .catch((err) => {
        console.error("Failed to update permissions:", err);
        Swal.fire({
          toast: true,
          position: "top-end",
          icon: "error",
          title: "Permission update failed",
          showConfirmButton: false,
          timer: 2000,
          timerProgressBar: true,
        });
      });
  };

  const handleAutoDialChange = async () => {
    const newValue = !autoDialStatus;
    setAutoDialStatus(newValue);

    try {
      await axios.patch(
        `https://${window.location.hostname}:4000/user/${userid}/update-status`,
        { auto_dial_status: newValue },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
    } catch (err) {
      console.error("Failed to update auto dial status", err);
    }
  };

  const saveRecordingPermission = async (newValue) => {
    try {
      await axios.patch(
        `https://${window.location.hostname}:4000/user/${userid}/recording-permission`,
        { recording_permission: newValue },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      Swal.fire({
        toast: true,
        icon: "success",
        position: "top-end",
        title: "Recording permission updated",
        showConfirmButton: false,
        timer: 2000,
        timerProgressBar: true,
      });
    } catch (err) {
      console.error("Failed to update recording permission:", err);
      Swal.fire({
        toast: true,
        icon: "error",
        position: "top-end",
        title: "Failed to update recording permission",
        showConfirmButton: false,
        timer: 2000,
        timerProgressBar: true,
      });
    }
  };

  useEffect(() => {
    if (!token) {
      console.error("User is not authenticated");
      return;
    }

    axios
      .get(`https://${window.location.hostname}:4000/telephony/user/${userid}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        setUserData(res.data);
        setAutoDialStatus(res.data?.auto_dial_status);
        setRecordingPermission(res.data?.recording_permission === 1);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });

    fetchAgentPermissions();
  }, [userid]);

  if (loading) {
    return (
      <div className="singleContainer singleContainer--loading">
        <CircularProgress sx={{ color: "#7c6ff0" }} />
      </div>
    );
  }

  const initials = (userData?.full_name || "U")
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const statusValue = (userData?.status || "").toLowerCase();

  return (
    <div className="singleContainer">
      <div className="header-card">
        <div className="profile-block">
          <div className="avatar">{initials || "U"}</div>
          <div className="profile-meta">
            <span className="profile-type">
              {userTypeLabels[userData?.user_type] || "User Type"}
            </span>
            <span className="profile-name">{userData?.full_name || "User"}</span>
          </div>
        </div>

        <div className="tab-nav">
          {TABS.map((tab) => (
            <button
              key={tab}
              className={`tab-btn ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="tab-content">
        {activeTab === "profile" && (
          <div className="profile-grid">
            <div className="info-card">
              <h1 className="card-title">User Information</h1>
              <div className="info-list">
                <div className="info-row">
                  <span className="info-key">Username</span>
                  <span className="info-value">{userData.full_name}</span>
                </div>
                <div className="info-row">
                  <span className="info-key">External</span>
                  <span className="info-value">{userData.ext_number}</span>
                </div>
                <div className="info-row">
                  <span className="info-key">Campaign</span>
                  <span className="info-value">{userData.campaigns_id}</span>
                </div>
                <div className="info-row">
                  <span className="info-key">User Type</span>
                  <span className="info-value">
                    {userTypeLabels[userData.user_type] || userData.user_type}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-key">DID</span>
                  <span className="info-value">{userData.use_did}</span>
                </div>
                <div className="info-row">
                  <span className="info-key">Agent Priority</span>
                  <span className="info-value">{userData.agent_priorty}</span>
                </div>
                <div className="info-row">
                  <span className="info-key">Password</span>
                  <span className="info-value">{userData.password}</span>
                </div>
                <div className="info-row">
                  <span className="info-key">Status</span>
                  <span className={`status-pill status-${statusValue}`}>
                    {userData.status}
                  </span>
                </div>
              </div>
            </div>

            <div className="stats-card">
              <ViewagentFeatured userId={userid} />
            </div>
          </div>
        )}

        {activeTab === "permissions" && (
          <div className="panel-card">
            <h3 className="card-title">Permissions</h3>

            {user?.role === "admin" && (
              <div className="permission-row">
                <span className="permission-label">Enable Auto Dial</span>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={autoDialStatus}
                    onChange={handleAutoDialChange}
                  />
                  <span className="slider"></span>
                </label>
              </div>
            )}

            <div className="permission-row">
              <span className="permission-label">Agent Permissions</span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={agentPermissionsEnabled}
                  onChange={(e) => setAgentPermissionsEnabled(e.target.checked)}
                />
                <span className="slider"></span>
              </label>
            </div>

            {agentPermissionsEnabled && (
              <div className="agent-permission-options">
                <label className="check-row">
                  <span>Upload Data</span>
                  <input
                    type="checkbox"
                    checked={agentPermissions.data_upload}
                    onChange={() => togglePermission("data_upload")}
                  />
                </label>
                <label className="check-row">
                  <span>Report View</span>
                  <input
                    type="checkbox"
                    checked={agentPermissions.report_view}
                    onChange={() => togglePermission("report_view")}
                  />
                </label>
                <label className="check-row">
                  <span>Block Number</span>
                  <input
                    type="checkbox"
                    checked={agentPermissions.block_no}
                    onChange={() => togglePermission("block_no")}
                  />
                </label>
                <button onClick={saveAgentPermissions} className="save-btn">
                  Save Permissions
                </button>
              </div>
            )}

            <div className="permission-row">
              <span className="permission-label">Recording Permission</span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={recordingPermission}
                  onChange={() => {
                    const newValue = !recordingPermission;
                    setRecordingPermission(newValue);
                    saveRecordingPermission(newValue);
                  }}
                />
                <span className="slider"></span>
              </label>
            </div>
          </div>
        )}

        {activeTab === "email" && (
          <div className="panel-card">
            <h3 className="card-title">Email Configuration</h3>
            <div className="info-list">
              <div className="info-row">
                <span className="info-key">Email</span>
                <span className="info-value">{userData?.email || "Not available"}</span>
              </div>
              <div className="info-row">
                <span className="info-key">SMTP</span>
                <span className="info-value">smtp.domain.com</span>
              </div>
              <div className="info-row">
                <span className="info-key">Port</span>
                <span className="info-value">587</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === "announcement" && (
          <div className="panel-card">
            <h3 className="card-title">Announcement</h3>
            <p className="muted-text">
              This is an announcement section. You can customize it as needed.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Single;