import { useState, useEffect, useContext, useCallback } from "react";
import Axios from "axios";
import Swal from "sweetalert2";
import {
  User,
  Mail,
  Phone as PhoneIcon,
  Globe,
  IdCard,
  Lock,
  PhoneCall,
  Users,
  Link2,
  Copy,
  RefreshCw,
  KeyRound,
  Pencil,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import EditProfile from "./EditPro";
import { Dialog } from "@mui/material";
import { AuthContext } from "../../context/authContext";
import "./profile.css";
import "./Profile.scss";
const toast = (icon, title, timer = 2500) =>
  Swal.fire({
    toast: true,
    icon,
    title,
    position: "top-end",
    showConfirmButton: false,
    timer,
  });
const Profile = () => {
  const [open, setOpen] = useState(false);
  const [profileData, setProfileData] = useState(null);
  const [apiKey, setApiKey] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useContext(AuthContext);
  const fetchProfileData = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No token found.");
      const response = await Axios.get(
        `https://${window.location.hostname}:4000/telephony/profile`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setProfileData(response.data);
      setApiKey(response.data.api_key);
      if (response.data.admin_logo) {
        localStorage.setItem("admin_logo", response.data.admin_logo);
      }
    } catch (error) {
      console.error("Error fetching profile data:", error);
      toast("error", "Failed to load profile", 3000);
    }
  }, []);
  useEffect(() => {
    fetchProfileData();
  }, [fetchProfileData]);
  const generateApiKey = useCallback(async () => {
    if (!profileData) return;
    try {
      setRefreshing(true);
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No token found");
      const response = await Axios.put(
        `https://${window.location.hostname}:4000/update-api-key/${profileData.user_id}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setApiKey(response.data.api_key);
      toast("success", "API Key updated!", 2500);
    } catch (error) {
      console.error("Error updating API key:", error);
      toast("error", "Failed to update API Key", 3000);
    } finally {
      setRefreshing(false);
    }
  }, [profileData]);
  const copyText = (text, label = "Copied!") => {
    if (!text) return;
    navigator.clipboard.writeText(text).catch(() => {
      const input = document.createElement("input");
      input.value = text;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    });
    toast("success", label, 2000);
  };
  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);
  const handleProfileUpdateSuccess = async () => {
    await fetchProfileData();
    toast("success", "Profile updated!", 2500);
  };
  if (!profileData) {
    return (
      <div className="pf-page">
        <div className="pf-loading">
          <Loader2 size={22} className="pf-spin" />
          <span>Loading profile…</span>
        </div>
      </div>
    );
  }
  const initials = (profileData.full_name || "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="pf-page">
      {/* Hero */}
      <div className="pf-hero">
        <div className="pf-hero__left">
          <div className="pf-avatar">
            {profileData.admin_logo ? (
              <img src={profileData.admin_logo} alt={profileData.full_name} />
            ) : (
              <span>{initials}</span>
            )}
            <span className="pf-avatar__dot" title="Active" />
          </div>
          <div>
            <h1 className="pf-hero__name">
              <span className="pf-hero__name-accent">Hi,</span>{" "}
              {profileData.full_name}
            </h1>
            <div className="pf-hero__meta">
              <span className="pf-chip">
                <IdCard size={13} /> ID {profileData.user_id}
              </span>
              <span className="pf-chip">
                <Mail size={13} /> {profileData.admin_email}
              </span>
              <span className="pf-chip pf-chip--ok">
                <ShieldCheck size={13} /> Verified
              </span>
            </div>
          </div>
        </div>
        <button className="pf-btn pf-btn--primary" onClick={handleOpen}>
          <Pencil size={15} /> Edit Profile
        </button>
      </div>
      {/* Grid */}
      <div className="pf-grid">
        {/* Contact */}
        <section className="pf-card">
          <header className="pf-card__head">
            <div className="pf-card__icon pf-tint--indigo">
              <User size={16} />
            </div>
            <h3>Contact Information</h3>
          </header>
          <ul className="pf-list">
            <li>
              <span className="pf-list__label"><User size={13} /> Name</span>
              <span className="pf-list__value">{profileData.full_name}</span>
            </li>
            <li>
              <span className="pf-list__label"><Mail size={13} /> Email</span>
              <span className="pf-list__value">{profileData.admin_email}</span>
            </li>
            <li>
              <span className="pf-list__label"><PhoneIcon size={13} /> Phone</span>
              <span className="pf-list__value">{profileData.admin_mobile}</span>
            </li>
            <li>
              <span className="pf-list__label"><Globe size={13} /> Timezone</span>
              <span className="pf-list__value">{profileData.user_timezone}</span>
            </li>
          </ul>
        </section>
        {/* Account */}
        <section className="pf-card">
          <header className="pf-card__head">
            <div className="pf-card__icon pf-tint--cyan">
              <IdCard size={16} />
            </div>
            <h3>Account Details</h3>
          </header>
          <ul className="pf-list">
            <li>
              <span className="pf-list__label"><IdCard size={13} /> User ID</span>
              <span className="pf-list__value">{profileData.user_id}</span>
            </li>
            <li>
              <span className="pf-list__label"><Lock size={13} /> Password</span>
              <span className="pf-list__value pf-muted">••••••••</span>
            </li>
            <li>
              <span className="pf-list__label"><PhoneCall size={13} /> Use CLI</span>
              <span className="pf-list__value">
                <span
                  className={`pf-badge ${
                    profileData.use_did ? "pf-badge--green" : "pf-badge--slate"
                  }`}
                >
                  {profileData.use_did ? "Enabled" : "Disabled"}
                </span>
              </span>
            </li>
            <li>
              <span className="pf-list__label"><Users size={13} /> Total Agents</span>
              <span className="pf-list__value pf-strong">
                {profileData.totalAgents}
              </span>
            </li>
          </ul>
        </section>
        {/* URL IP - admin only */}
        {user?.user_id == "20100" && (
          <section className="pf-card">
            <header className="pf-card__head">
              <div className="pf-card__icon pf-tint--orange">
                <Link2 size={16} />
              </div>
              <h3>URL / IP</h3>
            </header>
            <div className="pf-copybox">
              <code className="pf-copybox__text">
                {profileData.api_url || "No URL configured"}
              </code>
              <button
                className="pf-icon-btn"
                onClick={() => copyText(profileData.api_url, "URL copied!")}
                title="Copy URL"
                disabled={!profileData.api_url}
              >
                <Copy size={14} />
              </button>
            </div>
          </section>
        )}
        {/* API Key - wide */}
        <section className="pf-card pf-card--wide">
          <header className="pf-card__head">
            <div className="pf-card__icon pf-tint--emerald">
              <KeyRound size={16} />
            </div>
            <h3>API Key</h3>
            <span className="pf-card__hint">Keep this secret</span>
          </header>
          <div className="pf-copybox pf-copybox--key">
            <code className="pf-copybox__text pf-copybox__text--mono">
              {apiKey || "—"}
            </code>
            <div className="pf-copybox__actions">
              <button
                className="pf-icon-btn"
                onClick={generateApiKey}
                title="Regenerate API Key"
                disabled={refreshing}
              >
                <RefreshCw size={14} className={refreshing ? "pf-spin" : ""} />
              </button>
              <button
                className="pf-icon-btn"
                onClick={() => copyText(apiKey, "API Key copied!")}
                title="Copy API Key"
                disabled={!apiKey}
              >
                <Copy size={14} />
              </button>
            </div>
          </div>
        </section>
      </div>
      {/* Edit dialog */}
      <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
        <EditProfile
          profileData={profileData}
          onClose={handleClose}
          onSuccess={handleProfileUpdateSuccess}
        />
      </Dialog>
    </div>
  );
};
export default Profile;