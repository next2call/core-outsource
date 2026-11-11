import { useContext, useEffect, useRef, useState } from "react";
import { Video, Phone as PhoneIcon, Menu, Bell, Plus, ChevronDown, LogOut, User as UserIcon, Sun, Moon } from "lucide-react";
import "./Navbar.css";
import { AuthContext } from "../../context/authContext";
import { DarkModeContext } from "../../context/darkModeContext";

import { useMemo } from "react";
import { PopupContext } from "../../context/iframeContext";
import Phone from "./PhoneCall";
import PopupIframe from "./LiveCall";

import CreateAnnouncementDialog from "../Form/Create_Announcement";
import { TbAlertSquareRounded } from "react-icons/tb";

import { useNavigate } from "react-router-dom";

import Clock from "./nav_hooks/Clock";

// shown in the user menu when the API does not send user_type_label
const ROLE_LABELS = { 1: "Agent", 2: "Team Leader", 5: "IT", 6: "Quality Analyst", 7: "Manager", 8: "Admin", 9: "Super Admin" };

export default function Navbar({ pageTitle = "Dashboard", onOpenMobileSidebar, notificationCount = 0 }) {

  const navigate = useNavigate();

  const { user, logout } = useContext(AuthContext) || {};
  const { darkMode, toggleDarkMode } = useContext(DarkModeContext) || {};
  const { popupState, toggleIframe } = useContext(PopupContext);
  const [menuOpen, setMenuOpen] = useState(false);
  const [announcementDialogOpen, setAnnouncementDialogOpen] = useState(false);
  const menuRef = useRef(null);

  const initials = (user?.name || user?.user_id || "U")
    .trim()
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const phonePopup = useMemo(
    () => (
      <Phone
        visible={popupState.phone}
        id="phone"
        toggleVisibility={() => toggleIframe("phone")}
        iframeSrc={popupState.iframeSrc}
      />
    ),
    [popupState.phone, popupState.iframeSrc]
  );

  const callPopup = useMemo(
    () => (
      <PopupIframe
        id="call"
        visible={popupState.call}
        toggleVisibility={() => toggleIframe("call")}
        title="Live Calls"
      />
    ),
    [popupState.call]
  );

  return (
    <>
      <header className="rf-navbar">
        <div className="rf-navbar__left">
          <button
            type="button"
            className="rf-navbar__menu-btn"
            onClick={onOpenMobileSidebar}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <h1 className="rf-navbar__title">{pageTitle}</h1>
          <Clock />
        </div>

        <div className="rf-navbar__right">

          <button
            type="button"
            className="rf-navbar__live-btn"
            onClick={() => toggleIframe("call")}
          >
            <span className="rf-navbar__live-dot" />
            <Video size={16} />
            Live Call
          </button>

          <button
            type="button"
            className="rf-navbar__call-btn"
            onClick={() => toggleIframe("phone")}
          >
            <PhoneIcon size={16} />
            Call
          </button>

          <button
            type="button"
            className="rf-navbar__icon-btn"
            onClick={toggleDarkMode}
            aria-label="Toggle dark mode"
            title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          >
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {user?.role === "admin" && (<button
            type="button"
            className="rf-navbar__icon-btn"
            aria-label="Create Announcement"
            onClick={() => setAnnouncementDialogOpen(true)}
          >
            <Bell size={18} />
            <span className="rf-navbar__badge rf-navbar__badge--plus">
              <Plus size={10} strokeWidth={3} />
            </span>
          </button>
          )}

          <div className="rf-navbar__divider" />

          <div className="rf-navbar__user" ref={menuRef}>
            <button
              type="button"
              className="rf-navbar__user-trigger"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span className="rf-navbar__user-avatar">{initials}</span>
              <span className="rf-navbar__user-name">{user?.name || user?.user_id || "Guest"}</span>
              <ChevronDown
                size={14}
                className={`rf-navbar__chevron ${menuOpen ? "rf-navbar__chevron--open" : ""}`}
              />
            </button>

            {menuOpen && (
              <div className="rf-navbar__menu">
                <div className="rf-navbar__menu-header">
                  <span className="rf-navbar__menu-name">{user?.name || user?.user_id}</span>
                  <span className="rf-navbar__menu-role">{user?.user_type_label || ROLE_LABELS[user?.user_type] || "Agent"}</span>
                </div>
                <button type="button" className="rf-navbar__menu-item" onClick={() => { setMenuOpen(false); navigate("/admin/userProfile") }}>
                  <UserIcon size={15} />
                  My profile
                </button>
                <button type="button" className="rf-navbar__menu-item rf-navbar__menu-item--danger" onClick={logout}>
                  <LogOut size={15} />
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <CreateAnnouncementDialog
        open={announcementDialogOpen}
        onClose={() => setAnnouncementDialogOpen(false)}
      />
      {callPopup}
      {phonePopup}
    </>
  );
}









// import React, { useContext, useState, useEffect, useMemo } from "react";
// import "./navbar.scss";
// import { useNavigate, Link } from "react-router-dom";
// import axios from "axios";
// import { AuthContext } from "../../context/authContext";
// import { Menu as MenuIcon } from "@mui/icons-material";
// import Button from "@mui/material/Button";
// import { PopupContext } from "../../context/iframeContext";
// import PopupIframe from "./LiveCall";
// import Phone from "./PhoneCall";
// import CreateAnnouncementDialog from "../Form/Create_Announcement";
// import { Player } from "@lottiefiles/react-lottie-player";
// import {
//   AccountCircle,
//   AccessAlarm,
//   PhoneInTalk,
//   Logout,
//   Settings,
// } from "@mui/icons-material";
// import Clock from "./nav_hooks/Clock";
// import { MdCall } from "react-icons/md";
// import { TbAlertSquareRounded } from "react-icons/tb";

// const NavbarOld = ({ OpenSidebar }) => {
//   const { popupState, toggleIframe } = useContext(PopupContext);
//   const [isDropdownVisible, setDropdownVisible] = useState(false);
//   const [announcementDialogOpen, setAnnouncementDialogOpen] = useState(false);
//   const { logout, user } = useContext(AuthContext);
//   const navigate = useNavigate();
//   const toggleDropdown = () => setDropdownVisible(!isDropdownVisible);
//   const [profileData, setProfileData] = useState(null);

//   useEffect(() => {
//     const fetchProfileData = async () => {
//       try {
//         const token = localStorage.getItem("token");
//         if (!token) {
//           throw new Error("No token found");
//         }

//         const response = await axios.get(
//           `https://${window.location.hostname}:4000/telephony/profile`,
//           {
//             headers: { Authorization: `Bearer ${token}` },
//           }
//         );

//         setProfileData(response.data);
//       } catch (error) {
//         console.error("Error fetching profile data:", error);
//       }
//     };

//     fetchProfileData();
//   }, []);
//   const handleLogout = async () => {
//     try {
//       const token = localStorage.getItem("token");
//       if (!token) {
//         console.error("No token found, redirecting to login...");
//         logout();
//         navigate("/login");
//         return;
//       }

//       await axios.post(
//         `https://${window.location.hostname}:4000/log/logout`,
//         {
//           user_id: user.user_id,
//           admin: user.admin_id || null, // ✅ make sure admin is sent
//         },
//         {
//           headers: {
//             Authorization: `Bearer ${token}`, // ✅ send token
//           },
//         }
//       );
//       logout();
//       navigate("/login");
//     } catch (error) {
//       console.error("Logout failed:", error);
//       logout();
//       navigate("/login");
//     }
//   };

//   const callPopup = useMemo(
//     () => (
//       <PopupIframe
//         id="call"
//         visible={popupState.call}
//         toggleVisibility={() => toggleIframe("call")}
//         title="Live Calls"
//       />
//     ),
//     [popupState.call]
//   );

//   const phonePopup = useMemo(
//     () => (
//       <Phone
//         visible={popupState.phone}
//         id="phone"
//         toggleVisibility={() => toggleIframe("phone")}
//         iframeSrc={popupState.iframeSrc}
//       />
//     ),
//     [popupState.phone, popupState.iframeSrc]
//   );

//   return (
//     <div className="navbar">
//       <div className="menu-icon">
//         <MenuIcon className="icon" onClick={OpenSidebar} />
//       </div>
//       <div className="wrapper">
//         <div className="search"></div>
//         <div className="items">
//           <div className="item">
//             <Clock />
//           </div>

//           <div
//             className="item"
//             onClick={() => toggleIframe("call")}
//             title="Live Calls"
//             className="live-pill">
//             <button className="primary-button">LIVE</button>
//           </div>

//           <button type="button" className="button" onClick={() => toggleIframe("phone")} title="Call via Phone">
//             <span className="button__text">Call</span>
//             <span className="button__icon">

//               <MdCall color="white" size={15} />


//             </span>
//           </button>
//           {user?.role === "admin" && (

//               <button id="bottone1"
//                 className="nav-action"
//                 onClick={() => setAnnouncementDialogOpen(true)}
//                 title="Create Announcement"
//               >
//                 <TbAlertSquareRounded size={25} color="white" />
//               </button>
//           )}
//           <div className="item">
//             <div className="menu" onClick={toggleDropdown}>
//               <img
//                 src={
//                   profileData?.admin_profile
//                     ? `https://${window.location.hostname}:4000${profileData.admin_profile}`
//                     : "/download.png"
//                 }
//                 alt="Profile"
//                 className="avatar"
//               />
//               {isDropdownVisible && (
//                 <div className="dropdown-menu">
//                   <ul>
//                     <li>
//                       <a href="/admin/userProfile">
//                         <AccountCircle style={{ marginRight: "8px" }} />
//                         My Profile
//                       </a>
//                     </li>
//                     <li>
//                       <Link to="/admin/reminders">
//                         <AccessAlarm style={{ marginRight: "8px" }} />
//                         Reminder
//                       </Link>
//                     </li>
//                     <li>
//                       <Link to="/admin/did">
//                         <PhoneInTalk style={{ marginRight: "8px" }} />
//                         DID
//                       </Link>
//                     </li>
//                     <li>
//                       <Link to="/admin/sms_template">
//                         <PhoneInTalk style={{ marginRight: "8px" }} />
//                         SMS
//                       </Link>
//                     </li>
//                     <li onClick={handleLogout} className="logout-button">
//                       <Logout style={{ marginRight: "8px" }} />
//                       Logout
//                     </li>
//                     {user?.role === "superadmin" && (
//                       <li>
//                         <Link to="/superadmin/admin_control">
//                           <Settings style={{ marginRight: "8px" }} />
//                           Setting
//                         </Link>
//                       </li>
//                     )}
//                   </ul>
//                 </div>
//               )}
//             </div>
//           </div>
//         </div>
//       </div>
//       <CreateAnnouncementDialog
//         open={announcementDialogOpen}
//         onClose={() => setAnnouncementDialogOpen(false)}
//       />
//       {callPopup}
//       {phonePopup}
//     </div>
//   );
// };