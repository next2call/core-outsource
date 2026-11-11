// import { useState, useCallback } from "react";
// import React from "react";
// import { Outlet } from "react-router-dom";
// import Navbar from "../components/navbar/Navbar";
// import Sidebar from "../components/sidebar/Sidebar";
// import CustomSpeedDial from "../components/navbar/SpeedDial";


// const AdminRoute = () => {
//   const [openSidebarToggle, setOpenSidebarToggle] = useState(false);
 
//   const toggleSidebar = useCallback(() => {
//     setOpenSidebarToggle((prev) => !prev);
//   }, []);

//   return (
//     <div className="layout">
//       <Sidebar openSidebarToggle={openSidebarToggle} OpenSidebar={toggleSidebar} />

//       <div className="mainContent">
//         <Navbar OpenSidebar={toggleSidebar} />
//         <div className="outlet">
//           <Outlet />
//         </div>

//         <CustomSpeedDial />
//       </div>
//     </div>
//   );
// };
// export default React.memo(AdminRoute);


import { useState } from "react";
import { Outlet } from "react-router-dom";
import "./DashboardLayout.css";
import Sidebar from "../components/sidebar/Sidebar";
import Navbar from "../components/navbar/Navbar";

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