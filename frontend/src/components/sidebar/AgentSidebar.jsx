// import React, { useContext, useState, useEffect } from "react";
// import "./sidebar.scss";
// import axios from "axios";
// import DashboardIcon from "@mui/icons-material/Dashboard";
// import CloudUploadIcon from "@mui/icons-material/CloudUpload";
// import CallIcon from "@mui/icons-material/Call";
// import GroupIcon from "@mui/icons-material/Call";
// import BarChartIcon from "@mui/icons-material/BarChart";

// import InsertChartOutlinedIcon from "@mui/icons-material/InsertChartOutlined";
// import BlockIcon from "@mui/icons-material/Block";
// import { Link, useLocation } from "react-router-dom";
// import { DarkModeContext } from "../../context/darkModeContext";
// import { Tooltip } from "@mui/material";
// import { Close as CloseIcon } from "@mui/icons-material";
// import { AuthContext } from "../../context/authContext";

// const AgentSidebar = ({
//   openSidebarToggle,
//   OpenSidebar,
//   onLeadFormClick,
//   onVerifyClick,
// }) => {
//   const { dispatch } = useContext(DarkModeContext);
//   const location = useLocation();
//   const { user, permissions } = useContext(AuthContext);
//   const [logo, setLogo] = useState("");
//   const [showAll, setShowAll] = useState(true);
//   useEffect(() => {
//     if (user?.admin) {
//       const token = localStorage.getItem("token");
//       axios
//         .get(`https://${window.location.hostname}:4000/logo/${user.admin}`, {
//           headers: {
//             Authorization: `Bearer ${token}`,
//           },
//         })
//         .then((res) => {
//           if (res.data?.admin_logo) {
//             setLogo(
//               `https://${window.location.hostname}:4000${res.data.admin_logo}`
//             );
//           }
//         })
//         .catch((err) => {
//           console.error("Error fetching logo:", err);
//         });
//     }
//   }, [user]);


//   useEffect(() => {
//     const fetchTokenData = async () => {
//       try {
//         const token = localStorage.getItem("token");

//         const res = await axios.get(
//           `https://${window.location.hostname}:4000/action/getTokenData`,
//           {
//             headers: {
//               Authorization: `Bearer ${token}`,
//             },
//           }
//         );

//         if (res.data.action === true) {
//           setShowAll(false);
//         }
//       } catch (error) {
//         console.error("Error fetching token data:", error);
//       }
//     };

//     fetchTokenData();
//   }, []);

//   const hasPermission = (key) => {
//     if (permissions?.[key] === 0) return false; // explicitly disabled
//     return true; // default true for undefined or 1
//   };

//   const tooltipTitles = {
//     dashboard: "View your dashboard",
//     dataUpload: "Upload necessary data",
//     callReport: "View call reports",
//     leadReport: "View lead reports",
//     blockNumber: "Block specific numbers",
//     fieldExecutive: "View Field Executives", // 👈 New tooltip
//     profile: "View and edit your profile",
//     verify: "Verify Your Detail",
//     leadForm: "Lead Form",
//     logout: "Logout from the application",
//   };

//   const isActiveRoute = (path) => {
//     return location.pathname === path;
//   };

//   return (
//     <div id="sidebar" className={openSidebarToggle ? "sidebar-responsive" : ""}>
//       <div className="top">
//         <Link to="/agent" style={{ textDecoration: "none" }}>
//           <span className="logo">
//             <img
//               className="logo-img"
//               src={logo || `${process.env.PUBLIC_URL}/logo.png`} // fallback
//               alt="Logo"
//               style={{
//                 height: "50px",
//                 width: "80%",
//                 marginTop: "24px",
//                 objectFit: "contain",
//               }}
//             />
//           </span>
//         </Link>
//         <span className="close-icon-container">
//           <CloseIcon className="icon close_icon" onClick={OpenSidebar} />
//         </span>
//       </div>
//       <hr />

//       <div className="center">
//         <ul>
//           <p className="title">MAIN</p>
//           <Tooltip title={tooltipTitles.dashboard} placement="right" arrow>
//             <Link to="/agent" style={{ textDecoration: "none" }}>
//               <li className={isActiveRoute("/") ? "active" : ""}>
//                 <DashboardIcon className="icon" />
//                 <span>Dashboard</span>
//               </li>
//             </Link>
//           </Tooltip>

//           {showAll && <p className="title">LISTS</p>}

//           {showAll && hasPermission("data_upload") && (
//             <Tooltip title={tooltipTitles.dataUpload} placement="right" arrow>
//               <Link to="/agent/dataUpload" style={{ textDecoration: "none" }}>
//                 <li
//                   className={isActiveRoute("/agent/dataUpload") ? "active" : ""}
//                 >
//                   <CloudUploadIcon className="icon" />
//                   <span>Data Upload</span>
//                 </li>
//               </Link>
//             </Tooltip>
//           )}

//           {showAll && hasPermission("report_view") && (
//             <>
//               <Tooltip title={tooltipTitles.callReport} placement="right" arrow>
//                 <Link
//                   to="/agent/call_report"
//                   style={{ textDecoration: "none" }}
//                 >
//                   <li
//                     className={
//                       isActiveRoute("/agent/callReport") ? "active" : ""
//                     }
//                   >
//                     <CallIcon className="icon" />
//                     <span>Call Report</span>
//                   </li>
//                 </Link>
//               </Tooltip>
//             </>
//           )}

//           {showAll && hasPermission("block_no") && (
//             <Tooltip title={tooltipTitles.blockNumber} placement="right" arrow>
//               <Link to="/agent/blockList" style={{ textDecoration: "none" }}>
//                 <li
//                   className={isActiveRoute("/agent/blockList") ? "active" : ""}
//                 >
//                   <BlockIcon className="icon" />
//                   <span>Block Number</span>
//                 </li>
//               </Link>
//             </Tooltip>
//           )}

//           {hasPermission("lead_form") && (
//             <Tooltip title={tooltipTitles.verify} placement="right" arrow>
//               <Link to={`/agent/verify`} style={{ textDecoration: "none" }}>
//                 <li className={isActiveRoute(`/agent/verify`) ? "active" : ""}>
//                   <BarChartIcon className="icon" />
//                   <span>Verify Report</span>
//                 </li>
//               </Link>
//             </Tooltip>
//           )}
 

//           {showAll && <Tooltip title={tooltipTitles.leadReport} placement="right" arrow>
//             <li onClick={onLeadFormClick} style={{ cursor: "pointer" }}>
//               <InsertChartOutlinedIcon className="icon" />
//               <span>Lead Form</span>
//             </li>
//           </Tooltip>}

//           {showAll && hasPermission("lead_report") && (
//             <Tooltip title={tooltipTitles.leadReport} placement="right" arrow>
//               <Link to="/agent/leadReportList" style={{ textDecoration: "none" }}>
//                 <li className={isActiveRoute("/agent/leadReportList") ? "active" : ""}>
//                   <InsertChartOutlinedIcon className="icon" />
//                   <span>Lead Report</span>
//                 </li>
//               </Link>
//             </Tooltip>
//           )}

//         </ul>
//       </div>
//     </div>
//   );
// };

// export default AgentSidebar;


// import React, { useContext, useState, useEffect } from "react";
// import axios from "axios";
// import { NavLink, useLocation } from "react-router-dom";
// import {
//   LayoutDashboard,
//   UploadCloud,
//   PhoneCall,
//   ShieldCheck,
//   BadgeCheck,
//   FileText,
//   BarChart3,
//   X,
// } from "lucide-react";
// import "./Sidebar.css";
// import { AuthContext } from "../../context/authContext";

// export default function AgentSidebar({
//   openSidebarToggle,
//   OpenSidebar,
//   onLeadFormClick,
//   onVerifyClick,
// }) {
//   const location = useLocation();
//   const normalize = (path) => path.replace(/\/+$/, "") || "/";
//   const { user, permissions } = useContext(AuthContext) || {};

//   const [logo, setLogo] = useState("");
//   const [showAll, setShowAll] = useState(true);

//   useEffect(() => {
//     if (user?.admin) {
//       const token = localStorage.getItem("token");
//       axios
//         .get(`https://${window.location.hostname}:4000/logo/${user.admin}`, {
//           headers: { Authorization: `Bearer ${token}` },
//         })
//         .then((res) => {
//           if (res.data?.admin_logo) {
//             setLogo(
//               `https://${window.location.hostname}:4000${res.data.admin_logo}`
//             );
//           }
//         })
//         .catch((err) => {
//           console.error("Error fetching logo:", err);
//         });
//     }
//   }, [user]);

//   useEffect(() => {
//     const fetchTokenData = async () => {
//       try {
//         const token = localStorage.getItem("token");
//         const res = await axios.get(
//           `https://${window.location.hostname}:4000/action/getTokenData`,
//           { headers: { Authorization: `Bearer ${token}` } }
//         );
//         if (res.data.action === true) {
//           setShowAll(false);
//         }
//       } catch (error) {
//         console.error("Error fetching token data:", error);
//       }
//     };

//     fetchTokenData();
//   }, []);

//   const hasPermission = (key) => {
//     if (permissions?.[key] === 0) return false; // explicitly disabled
//     return true; // default true for undefined or 1
//   };

//   // Build nav items as data so we can render them the same way Sidebar.jsx does
//   const NAV_ITEMS = [
//     {
//       key: "dashboard",
//       label: "Dashboard",
//       icon: LayoutDashboard,
//       path: "/agent",
//       end: true,
//       title: "View your dashboard",
//       show: true,
//     },
//     {
//       key: "dataUpload",
//       label: "Data Upload",
//       icon: UploadCloud,
//       path: "/agent/dataUpload",
//       title: "Upload necessary data",
//       show: showAll && hasPermission("data_upload"),
//     },
//     {
//       key: "callReport",
//       label: "Call Report",
//       icon: PhoneCall,
//       path: "/agent/call_report",
//       title: "View call reports",
//       show: showAll && hasPermission("report_view"),
//     },
//     {
//       key: "blockNumber",
//       label: "Block Number",
//       icon: ShieldCheck,
//       path: "/agent/blockList",
//       title: "Block specific numbers",
//       show: showAll && hasPermission("block_no"),
//     },
//     {
//       key: "verify",
//       label: "Verify Report",
//       icon: BadgeCheck,
//       path: "/agent/verify",
//       title: "Verify Your Detail",
//       show: hasPermission("lead_form"),
//       onClick: onVerifyClick,
//     },
//     {
//       key: "leadForm",
//       label: "Lead Form",
//       icon: FileText,
//       title: "Lead Form",
//       show: showAll,
//       isButton: true,
//       onClick: onLeadFormClick,
//     },
//     {
//       key: "leadReport",
//       label: "Lead Report",
//       icon: BarChart3,
//       path: "/agent/leadReportList",
//       title: "View lead reports",
//       show: showAll && hasPermission("lead_report"),
//     },
//   ];

//   const visibleItems = NAV_ITEMS.filter((item) => item.show);

//   return (
//     <>
//       {openSidebarToggle && (
//         <div className="rf-sb-overlay" onClick={OpenSidebar} />
//       )}

//       <aside
//         className={`rf-sidebar ${openSidebarToggle ? "rf-sidebar--mobile-open" : ""
//           }`}
//       >
//         <div className="rf-sidebar__top">
//           <NavLink to="/agent" className="rf-sb-logo" style={{ textDecoration: "none" }}>
//             <img
//               className="rf-sb-logo__img"
//               src={logo || `${process.env.PUBLIC_URL}/logo.png`}
//               alt="Logo"
//               style={{ height: "32px", width: "auto", objectFit: "contain" }}
//             />
//           </NavLink>
//           <button
//             type="button"
//             className="rf-sb-mobile-close"
//             onClick={OpenSidebar}
//             aria-label="Close menu"
//           >
//             <X size={18} />
//           </button>
//         </div>

//         <nav className="rf-sidebar__nav">
//           {visibleItems.map(({ key, label, icon: Icon, path, end, title, isButton, onClick }) => {
//             if (isButton) {
//               return (
//                 <button
//                   key={key}
//                   type="button"
//                   title={title}
//                   onClick={onClick}
//                   className="rf-sidebar__item"
//                 >
//                   <span className="rf-sidebar__item-icon">
//                     <Icon size={18} />
//                   </span>
//                   <span className="rf-sidebar__item-label">{label}</span>
//                 </button>
//               );
//             }

//             return (
//               <NavLink
//                 key={key}
//                 to={path}
//                 end={end}
//                 title={title}
//                 onClick={onClick}
//                 className={({ isActive }) => {
//                   const dashboardActive =
//                     key === "dashboard" &&
//                     normalize(location.pathname) === normalize(path);

//                   return `rf-sidebar__item ${(key === "dashboard" ? isActive || dashboardActive : isActive)
//                       ? "rf-sidebar__item--active"
//                       : ""
//                     }`;
//                 }}
//               >
//                 <span className="rf-sidebar__item-icon">
//                   <Icon size={18} />
//                 </span>
//                 <span className="rf-sidebar__item-label">{label}</span>
//               </NavLink>
//             );
//           })}
//         </nav>
//       </aside>
//     </>
//   );
// }



import { useContext, useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import axios from "axios";
import {
  LayoutDashboard,
  BarChart3,
  PhoneCall,
  ShieldCheck,
  ClipboardCheck,
  FileText,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";
import "./Sidebar.css";
import { AuthContext } from "../../context/authContext";
function RingfyLogo({ collapsed }) {
  return (
    <div className="rf-sb-logo">
      <svg width="28" height="28" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="20" cy="20" r="15" stroke="#4f46e5" strokeWidth="3" />
        <circle cx="20" cy="20" r="8" stroke="#4f46e5" strokeWidth="2" opacity="0.55" />
        <circle cx="20" cy="20" r="2.4" fill="#4f46e5" />
      </svg>
      {!collapsed && (
        <span className="rf-sb-logo__text">
          Ring<span className="rf-sb-logo__text-accent">fy</span>
        </span>
      )}
    </div>
  );
}
const AgentSidebar = ({
  collapsed,
  mobileOpen,
  onCloseMobile,
  onToggleCollapse,
  onLeadFormClick,
  onVerifyClick,
}) => {
  const location = useLocation();
  const { user, permissions, logout } = useContext(AuthContext) || {};
  const [showAll, setShowAll] = useState(true);
  const normalize = (path) => path.replace(/\/+$/, "") || "/";
  const hasPermission = (key) => {
    if (permissions?.[key] === 0) return false;
    return true;
  };
  useEffect(() => {
    const fetchTokenData = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await axios.get(
          `https://${window.location.hostname}:4000/action/getTokenData`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.data.action === true) setShowAll(false);
      } catch (error) {
        console.error("Error fetching token data:", error);
      }
    };
    fetchTokenData();
  }, []);
  const NAV_ITEMS = [
    { label: "Dashboard", icon: LayoutDashboard, path: "/agent" },
    {
      label: "Data Upload",
      icon: BarChart3,
      path: "/agent/dataUpload",
      permission: "data_upload",
      requiresShowAll: true,
    },
    {
      label: "Call Report",
      icon: PhoneCall,
      path: "/agent/call_report",
      permission: "report_view",
      requiresShowAll: true,
    },
    {
      label: "Block Number",
      icon: ShieldCheck,
      path: "/agent/blockList",
      permission: "block_no",
      requiresShowAll: true,
    },
    {
      label: "Verify Report",
      icon: ClipboardCheck,
      permission: "lead_form",
      action: "verify",
    },
    // {
    //   label: "Lead Form",
    //   icon: FileText,
    //   requiresShowAll: true,
    //   action: "leadForm",
    // },
    {
      label: "Lead Report",
      icon: BarChart3,
      path: "/agent/leadReportList",
      permission: "lead_report",
      requiresShowAll: true,
    },
  ];
  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.requiresShowAll && !showAll) return false;
    if (item.permission && !hasPermission(item.permission)) return false;
    return true;
  });
  const initials = (user?.name || user?.user_id || user?.username || "A")
    .toString()
    .trim()
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const handleActionClick = (action) => {
    if (action === "verify" && onVerifyClick) onVerifyClick();
    if (action === "leadForm" && onLeadFormClick) onLeadFormClick();
    if (onCloseMobile) onCloseMobile();
  };
  return (
    <>
      {mobileOpen && <div className="rf-sb-overlay" onClick={onCloseMobile} />}
      <aside
        className={`rf-sidebar ${collapsed ? "rf-sidebar--collapsed" : ""} ${
          mobileOpen ? "rf-sidebar--mobile-open" : ""
        }`}
      >
        <div className="rf-sidebar__top">
          <RingfyLogo collapsed={collapsed} />
          <button
            type="button"
            className="rf-sb-mobile-close"
            onClick={onCloseMobile}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>
        <nav className="rf-sidebar__nav">
          {!collapsed && <div className="rf-sidebar__section">MAIN</div>}
          {visibleItems.map(({ label, icon: Icon, path, action }) => {
            if (action) {
              return (
                <button
                  key={label}
                  type="button"
                  className="rf-sidebar__item rf-sidebar__item--button"
                  onClick={() => handleActionClick(action)}
                  title={collapsed ? label : undefined}
                >
                  <span className="rf-sidebar__item-icon">
                    <Icon size={18} />
                  </span>
                  {!collapsed && <span className="rf-sidebar__item-label">{label}</span>}
                </button>
              );
            }
            return (
              <NavLink
                key={path}
                to={path}
                end={label === "Dashboard"}
                onClick={onCloseMobile}
                className={({ isActive }) => {
                  const dashboardActive =
                    label === "Dashboard" &&
                    normalize(location.pathname) === normalize(path);
                  return `rf-sidebar__item ${
                    (label === "Dashboard" ? isActive || dashboardActive : isActive)
                      ? "rf-sidebar__item--active"
                      : ""
                  }`;
                }}
                title={collapsed ? label : undefined}
              >
                <span className="rf-sidebar__item-icon">
                  <Icon size={18} />
                </span>
                {!collapsed && <span className="rf-sidebar__item-label">{label}</span>}
              </NavLink>
            );
          })}
        </nav>
        <div className="rf-sidebar__bottom">
          <button
            type="button"
            className="rf-sidebar__collapse-btn"
            onClick={onToggleCollapse}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            {!collapsed && <span>Collapse</span>}
          </button>
          <div className="rf-sidebar__user">
            <div className="rf-sidebar__user-avatar">{initials}</div>
            {!collapsed && (
              <div className="rf-sidebar__user-info">
                <span className="rf-sidebar__user-name">
                  {user?.name || user?.user_id || user?.username || "Agent"}
                </span>
                <span className="rf-sidebar__user-role">
                  {user?.user_type_label || "Agent"}
                </span>
              </div>
            )}
            {!collapsed && (
              <button
                type="button"
                className="rf-sidebar__logout"
                onClick={logout}
                aria-label="Log out"
                title="Log out"
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};
export default AgentSidebar;