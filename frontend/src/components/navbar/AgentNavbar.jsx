import { useContext, useState, useMemo, useRef, useEffect } from "react";
import "./AgentNavbar.css";
import { useAnnouncements } from "./nav_hooks/AnnouncementsBell";
import { useBreakStatus } from "./nav_hooks/useBreakStatus";
import { useAutoDial } from "./nav_hooks/useAutoDial";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { AuthContext } from "../../context/authContext";
import { DarkModeContext } from "../../context/darkModeContext";
import { PopupContext } from "../../context/iframeContext";
import Phone from "./PhoneCall";
import AnnouncementBox from "../featured/Agent_Allowancement_Card";


const MenuIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);
const ChevronDown = ({ className = "" }) => (
  <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);
const BellIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);
const PhoneIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);
const UserIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);
const LogoutIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);
const SunIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <line x1="12" y1="2" x2="12" y2="4" /><line x1="12" y1="20" x2="12" y2="22" />
    <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" /><line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
    <line x1="2" y1="12" x2="4" y2="12" /><line x1="20" y1="12" x2="22" y2="12" />
    <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" /><line x1="17.66" y1="6.34" x2="19.07" y2="4.93" />
  </svg>
);
const MoonIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);
const AgentNavbar = ({ OpenSidebar }) => {
  const { popupState, toggleIframe, updateIframeSrc } = useContext(PopupContext);
  const { logout, user } = useContext(AuthContext);
  const { darkMode, toggleDarkMode } = useContext(DarkModeContext) || {};
  const token = localStorage.getItem("token");
  const { announcements, unread, setUnread } = useAnnouncements(token);
  const { selectedBreak, updateBreakStatus } = useBreakStatus(
    user, popupState, updateIframeSrc, toggleIframe
  );
  const { autoDialOn, autoDialStatus, handleAutoDialToggle } = useAutoDial(
    user, token, popupState, updateIframeSrc, toggleIframe
  );
  const [isDropdownVisible, setDropdownVisible] = useState(false);
  const [breakOpen, setBreakOpen] = useState(false);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const bellRef = useRef(null);
  const breakRef = useRef(null);
  const userRef = useRef(null);
  const navigate = useNavigate();
  const breakOptions = ["Ready", "Lunch Break", "Bio Break", "Mobile"];
  const breakColors = {
    Ready: "#00796B",
    "Lunch Break": "#D84315",
    "Bio Break": "#F9A825",
    Mobile: "#4527A0",
  };
  const phonePopup = useMemo(
    () => (
      <Phone
        visible={popupState.phone}
        toggleVisibility={() => toggleIframe("phone")}
        iframeSrc={popupState.iframeSrc}
      />
    ),
    [popupState.phone, popupState.iframeSrc]
  );
  const updateWrapup = async (status) => {
    if (!user || !token) return;
    try {
      await axios.post(
        `https://${window.location.hostname}:4000/agent-wrapup`,
        { wrapup: status },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (err) {
      console.error("Failed to update wrapup", err);
    }
  };
  useEffect(() => {
    updateWrapup(popupState.phone ? 1 : 0);
  }, [popupState.phone]);
  // Close popovers on outside click
  useEffect(() => {
    const onClick = (e) => {
      if (breakRef.current && !breakRef.current.contains(e.target)) setBreakOpen(false);
      if (userRef.current && !userRef.current.contains(e.target)) setDropdownVisible(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);
  const handleSelectBreak = (option) => {
    updateBreakStatus(option);
    setBreakOpen(false);
  };
  const handleLogout = async () => {
    try {
      await axios.post(
        `https://${window.location.hostname}:4000/log/break_time`,
        { user_id: user.user_id, break_type: "Log Off" }
      );
      await axios.post(`https://${window.location.hostname}:4000/log/logout`, {
        user_id: user.user_id,
      });
      logout();
      navigate("/login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };
  const initials = (user?.name || user?.username || "A")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <>
      <header className="rf-navbar">
        <div className="rf-navbar__left">
          <button className="rf-navbar__menu-btn" onClick={OpenSidebar} aria-label="Open sidebar">
            <MenuIcon />
          </button>
          <h1 className="rf-navbar__title">Agent Dashboard</h1>
        </div>
        <div className="rf-navbar__right">
          {autoDialStatus && (
            <button
              className={`rf-navbar__autodial ${autoDialOn ? "rf-navbar__autodial--on" : ""}`}
              onClick={handleAutoDialToggle}
              type="button"
            >
              <span className="rf-navbar__autodial-dot" />
              <span>Auto Dial ({autoDialOn ? "ON" : "OFF"})</span>
            </button>
          )}
          {/* Break selector */}
          <div className="rf-navbar__break" ref={breakRef}>
            <button
              className="rf-navbar__break-btn"
              style={{ background: breakColors[selectedBreak] || "#008080" }}
              onClick={() => setBreakOpen((v) => !v)}
              type="button"
            >
              <span>{selectedBreak || "Break"}</span>
              <ChevronDown className={`rf-navbar__break-chevron ${breakOpen ? "rf-navbar__break-chevron--open" : ""}`} />
            </button>
            {breakOpen && (
              <div className="rf-navbar__break-menu" role="menu">
                {breakOptions.map((option) => (
                  <button
                    key={option}
                    className={`rf-navbar__break-item ${selectedBreak === option ? "rf-navbar__break-item--active" : ""}`}
                    onClick={() => handleSelectBreak(option)}
                    type="button"
                  >
                    <span className="rf-navbar__break-swatch" style={{ background: breakColors[option] }} />
                    {option}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Phone Button */}
          <button
            className="rf-navbar__icon-btn rf-navbar__icon-btn--call"
            // onClick={() => toggleIframe("phone")}
            onClick={() => {
              console.log("Phone button clicked");
              toggleIframe("phone");
            }}
            aria-label="Open phone"
            type="button"
          >
            <PhoneIcon />
          </button>

          {/* Dark mode toggle */}
          <button
            type="button"
            className="rf-navbar__icon-btn"
            onClick={toggleDarkMode}
            aria-label="Toggle dark mode"
            title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          >
            {darkMode ? <SunIcon /> : <MoonIcon />}
          </button>


          {/* Announcements Bell */}
          <div style={{ position: "relative" }} ref={bellRef}>
            <button
              className="rf-navbar__icon-btn"
              onClick={() => {
                setAnnouncementOpen((prev) => !prev);
                setUnread(false);
              }}
              aria-label="Announcements"
              type="button"
            >
              <BellIcon />
              {unread > 0 && (
                <span className="rf-navbar__badge">{unread > 9 ? "9+" : unread}</span>
              )}
            </button>
            <AnnouncementBox
              open={announcementOpen}
              anchorEl={bellRef.current}
              onClose={() => setAnnouncementOpen(false)}
              announcements={announcements}
            />
          </div>
          <div className="rf-navbar__divider" />
          {/* User menu */}
          <div className="rf-navbar__user" ref={userRef}>
            <button
              className="rf-navbar__user-trigger"
              onClick={() => setDropdownVisible((v) => !v)}
              type="button"
            >
              <span className="rf-navbar__user-avatar">{initials}</span>
              <span className="rf-navbar__user-name">{user?.name || user?.username || "Agent"}</span>
              <ChevronDown className={`rf-navbar__chevron ${isDropdownVisible ? "rf-navbar__chevron--open" : ""}`} />
            </button>
            {isDropdownVisible && (
              <div className="rf-navbar__menu">
                <div className="rf-navbar__menu-header">
                  <span className="rf-navbar__menu-name">{user?.name || user?.username || "Agent"}</span>
                  <span className="rf-navbar__menu-role">{user?.role || "agent"}</span>
                </div>
                <button
                  className="rf-navbar__menu-item"
                  onClick={() => { setDropdownVisible(false); navigate("/agent/userProfile"); }}
                  type="button"
                >
                  <UserIcon />
                  My Profile
                </button>
                <button
                  className="rf-navbar__menu-item rf-navbar__menu-item--danger"
                  onClick={handleLogout}
                  type="button"
                >
                  <LogoutIcon />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      {phonePopup}
    </>
  );
};
export default AgentNavbar;