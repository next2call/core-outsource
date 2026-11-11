import { useContext, useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  PhoneCall,
  Users,
  Megaphone,
  BarChart3,
  ShieldCheck,
  UsersRound,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  AtSign,
  ClipboardList,
  ChevronDown,
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

const ICON_SIZE = 17;

// shown under the user name when the API does not send user_type_label
const ROLE_LABELS = { 1: "Agent", 2: "Team Leader", 5: "IT", 6: "Quality Analyst", 7: "Manager", 8: "Admin", 9: "Super Admin" };

export default function Sidebar({ collapsed, mobileOpen, onCloseMobile, onToggleCollapse }) {
  const location = useLocation();
  const normalize = (path) => path.replace(/\/+$/, "") || "/";
  const { user, permissions, logout } = useContext(AuthContext) || {};

  // On mobile the drawer is always full width, so never show the icon-only layout there.
  const isCollapsed = collapsed && !mobileOpen;

  const hasPermission = (key) => {
    if (user?.user_type === "8" || user?.user_type === "7") return true;
    return permissions?.[key] === 1;
  };

  const basePath =
    user?.user_type === "8"
      ? "admin"
      : user?.user_type === "7"
        ? "manager"
        : "admin";

  const NAV_ITEMS = [
    {
      label: "Dashboard",
      icon: LayoutDashboard,
      path: `/${basePath}`,
    },
    {
      label: "Campaigns",
      icon: Megaphone,
      path: `/${basePath}/campaign`,
      permission: "campaign",
    },
    {
      label: "Users List",
      icon: Users,
      path: `/${basePath}/agent`,
      permission: "agent_management",
    },
    {
      label: "Extensions",
      icon: PhoneCall,
      path: `/${basePath}/extension`,
      permission: "dtmf",
    },
    {
      label: "Data Upload",
      icon: BarChart3,
      path: `/${basePath}/dataUpload`,
      permission: "data_upload",
    },
    {
      label: "Reports",
      icon: ClipboardList,
      children: [
        {
          label: "Call Report",
          path: `/${basePath}/call_report`,
          permission: "report_view",
        },
        {
          label: "Lead Report",
          path: `/${basePath}/leadReportList`,
          permission: "report_view",
        },
        {
          label: "User Details",
          path: "/admin/user-details",
        },
        // add more reports here, e.g.
        // { label: "Agent Report", path: `/${basePath}/agent_report`, permission: "report_view" },
      ],
    },
    {
      label: "Block Number",
      icon: ShieldCheck,
      path: `/${basePath}/blockList`,
      permission: "block_no",
    },
    {
      label: "Disposition",
      icon: UsersRound,
      path: `/${basePath}/dispositionList`,
      permission: "disposition",
    },
    {
      label: "IVR Converter",
      icon: PhoneCall,
      path: `/${basePath}/ivrList`,
      permission: "ivr_converter",
    },
    {
      label: "Email",
      icon: AtSign,
      path: "/admin/email",
    },
  ];

  const canSee = (item) => !item.permission || hasPermission(item.permission);

  // Filter items by permission; drop a group entirely if none of its reports are allowed.
  const visibleItems = NAV_ITEMS.map((item) =>
    item.children ? { ...item, children: item.children.filter(canSee) } : item
  ).filter((item) => (item.children ? item.children.length > 0 : canSee(item)));

  const current = normalize(location.pathname);
  const isGroupActive = (group) =>
    group.children.some((c) => current === normalize(c.path) || current.startsWith(normalize(c.path) + "/"));

  // Expanded groups (sidebar open). A group opens automatically when you are on one of its pages.
  const [openGroups, setOpenGroups] = useState(() => {
    const init = {};
    visibleItems.forEach((item) => {
      if (item.children && isGroupActive(item)) init[item.label] = true;
    });
    return init;
  });

  useEffect(() => {
    visibleItems.forEach((item) => {
      if (item.children && isGroupActive(item)) {
        setOpenGroups((prev) => (prev[item.label] ? prev : { ...prev, [item.label]: true }));
      }
    });
    setFlyout(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const toggleGroup = (label) =>
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));

  // Hover flyout for groups while the sidebar is collapsed.
  const [flyout, setFlyout] = useState(null); // { label, top }
  const closeTimer = useRef(null);

  const openFlyout = (label, el) => {
    clearTimeout(closeTimer.current);
    const rect = el.getBoundingClientRect();
    setFlyout({ label, top: rect.top });
  };
  const scheduleCloseFlyout = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setFlyout(null), 120);
  };

  useEffect(() => () => clearTimeout(closeTimer.current), []);
  useEffect(() => {
    if (!isCollapsed) setFlyout(null);
  }, [isCollapsed]);

  const initials = (user?.name || user?.user_id || "U")
    .trim()
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const renderLink = ({ label, icon: Icon, path }) => (
    <NavLink
      key={path}
      to={path}
      end={label === "Dashboard"}
      onClick={onCloseMobile}
      title={isCollapsed ? label : undefined}
      className={({ isActive }) => {
        const dashboardActive = label === "Dashboard" && current === normalize(path);
        const active = label === "Dashboard" ? isActive || dashboardActive : isActive;
        return `rf-sidebar__item ${active ? "rf-sidebar__item--active" : ""}`;
      }}
    >
      <span className="rf-sidebar__item-icon">
        <Icon size={ICON_SIZE} />
      </span>
      {!isCollapsed && <span className="rf-sidebar__item-label">{label}</span>}
    </NavLink>
  );

  const renderGroup = (group) => {
    const { label, icon: Icon, children } = group;
    const active = isGroupActive(group);
    const open = !!openGroups[label];
    const showFlyout = isCollapsed && flyout?.label === label;

    return (
      <div
        key={label}
        className={`rf-sidebar__group ${open && !isCollapsed ? "rf-sidebar__group--open" : ""}`}
        onMouseEnter={isCollapsed ? (e) => openFlyout(label, e.currentTarget) : undefined}
        onMouseLeave={isCollapsed ? scheduleCloseFlyout : undefined}
      >
        <button
          type="button"
          className={`rf-sidebar__item rf-sidebar__group-btn ${active ? "rf-sidebar__item--parent-active" : ""}`}
          aria-expanded={isCollapsed ? showFlyout : open}
          onClick={(e) => {
            if (isCollapsed) {
              showFlyout ? setFlyout(null) : openFlyout(label, e.currentTarget.parentElement);
            } else {
              toggleGroup(label);
            }
          }}
        >
          <span className="rf-sidebar__item-icon">
            <Icon size={ICON_SIZE} />
          </span>
          {!isCollapsed && (
            <>
              <span className="rf-sidebar__item-label">{label}</span>
              <ChevronDown size={15} className="rf-sidebar__group-chevron" />
            </>
          )}
        </button>

        {!isCollapsed && open && (
          <div className="rf-sidebar__sub">
            {children.map((c) => (
              <NavLink
                key={c.path}
                to={c.path}
                onClick={onCloseMobile}
                className={({ isActive }) =>
                  `rf-sidebar__subitem ${isActive ? "rf-sidebar__subitem--active" : ""}`
                }
              >
                {c.label}
              </NavLink>
            ))}
          </div>
        )}

        {showFlyout && (
          <div
            className="rf-sb-flyout"
            style={{ top: flyout.top }}
            onMouseEnter={() => clearTimeout(closeTimer.current)}
            onMouseLeave={scheduleCloseFlyout}
          >
            <div className="rf-sb-flyout__panel">
              <div className="rf-sb-flyout__title">{label}</div>
              {children.map((c) => (
                <NavLink
                  key={c.path}
                  to={c.path}
                  onClick={() => setFlyout(null)}
                  className={({ isActive }) =>
                    `rf-sidebar__subitem ${isActive ? "rf-sidebar__subitem--active" : ""}`
                  }
                >
                  {c.label}
                </NavLink>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {mobileOpen && <div className="rf-sb-overlay" onClick={onCloseMobile} />}

      <aside
        className={`rf-sidebar ${isCollapsed ? "rf-sidebar--collapsed" : ""} ${
          mobileOpen ? "rf-sidebar--mobile-open" : ""
        }`}
      >
        <div className="rf-sidebar__top">
          <RingfyLogo collapsed={isCollapsed} />
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
          {visibleItems.map((item) => (item.children ? renderGroup(item) : renderLink(item)))}
        </nav>

        <div className="rf-sidebar__bottom">
          <button
            type="button"
            className="rf-sidebar__collapse-btn"
            onClick={onToggleCollapse}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <PanelLeftOpen size={ICON_SIZE} /> : <PanelLeftClose size={ICON_SIZE} />}
            {!isCollapsed && <span>Collapse</span>}
          </button>

          <div className="rf-sidebar__user">
            <div className="rf-sidebar__user-avatar">{initials}</div>
            {!isCollapsed && (
              <div className="rf-sidebar__user-info">
                <span className="rf-sidebar__user-name">
                  {user?.name || user?.user_id || "Guest"}
                </span>
                <span className="rf-sidebar__user-role">
                  {user?.user_type_label || ROLE_LABELS[user?.user_type] || "Agent"}
                </span>
              </div>
            )}
            {!isCollapsed && (
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
}