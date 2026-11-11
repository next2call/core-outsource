import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import "./DashboardLayout.css";

export default function DashboardLayout({ pageTitle }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className={`rf-shell ${collapsed ? "rf-shell--collapsed" : ""}`}>
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        onToggleCollapse={() => setCollapsed((v) => !v)}
      />

      <div className="rf-shell__content">
        <Navbar pageTitle={pageTitle} onOpenMobileSidebar={() => setMobileOpen(true)} notificationCount={3} />

        <main className="rf-shell__main">
          {/* Nested routes render here. Swap <Outlet /> for {children} if you're
              not using react-router's element-based routing for this layout. */}
          <Outlet />
        </main>
      </div>
    </div>
  );
}