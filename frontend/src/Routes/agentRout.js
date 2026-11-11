// import { useState, useCallback } from "react";
// import React from "react";
// import { Outlet } from "react-router-dom";
// import AgentNavbar from "../components/navbar/AgentNavbar";
// import AgentSidebar from "../components/sidebar/AgentSidebar";
// import VerificationModal from "../components/navbar/verify";
// import LeadFormModal from "../components/Form/LeadForm";
// import CustomSpeedDial from "../components/navbar/SpeedDial";
// import { jwtDecode } from "jwt-decode";
// import axios from "axios";

// const AgentRoute = () => {
//   const [openSidebarToggle, setOpenSidebarToggle] = useState(false);
//   const [openVerify, setOpenVerify] = useState(false);
//   const [openLeadForm, setOpenLeadForm] = useState(false); // NEW

//   const handleLeadFormClick = useCallback(async () => {
//     try {
//       const token = localStorage.getItem("token");

//       const res = await axios.get(
//         `https://${window.location.hostname}:4000/action/getTokenData`,
//         {
//           headers: {
//             Authorization: `Bearer ${token}`,
//           },
//         }
//       );

//       if (res.data.action == 'true') {
//         setOpenLeadForm(true);
//       }
//       else {
//         const redirect = await axios.get(
//           `https://${window.location.hostname}:4000/action/dialer-search-data`,
//           {
//             headers: {
//               Authorization: `Bearer ${token}`,
//             },
//           }
//         );

//         if (redirect.data.status != 0) {
//           window.open(redirect?.data?.dialerSearchUrl);
//         } else {
//           setOpenLeadForm(true);
//         }
//       }


//     } catch (err) {
//       console.error("Error decoding token:", err);
//     }
//   }, []);

//   const toggleSidebar = useCallback(() => {
//     setOpenSidebarToggle((prev) => !prev);
//   }, []);
//   return (
//     <div className="layout">
//       <AgentSidebar openSidebarToggle={openSidebarToggle} OpenSidebar={toggleSidebar} onVerifyClick={() => {
//         setOpenVerify(true)
//         console.log("Testing!!!")
//       }} onLeadFormClick={handleLeadFormClick} />

//       <div className="mainContent">
//         <AgentNavbar
//           OpenSidebar={toggleSidebar}
//         />
//         <div className="outlet">
//           <Outlet />
//         </div>
//         <CustomSpeedDial />
//       </div>

//       <LeadFormModal open={openLeadForm} onClose={() => setOpenLeadForm(false)} />
//       <VerificationModal open={openVerify} onClose={() => setOpenVerify(false)} />
//     </div>
//   );
// };

// export default React.memo(AgentRoute);

import React, { useState, useCallback } from "react";
import { Outlet } from "react-router-dom";
import axios from "axios";

import "./DashboardLayout.css";

import AgentSidebar from "../components/sidebar/AgentSidebar";
import AgentNavbar from "../components/navbar/AgentNavbar";
import VerificationModal from "../components/navbar/verify";
import LeadFormModal from "../components/Form/LeadForm";
import CustomSpeedDial from "../components/navbar/SpeedDial";

function DashboardLayout({ pageTitle }) {
  // Existing responsive layout state
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Restored modal state
  const [openVerify, setOpenVerify] = useState(false);
  const [openLeadForm, setOpenLeadForm] = useState(false);

  // Restored lead form handler
  const handleLeadFormClick = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");

      const res = await axios.get(
        `https://${window.location.hostname}:4000/action/getTokenData`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (res.data.action === "true") {
        setOpenLeadForm(true);
      } else {
        const redirect = await axios.get(
          `https://${window.location.hostname}:4000/action/dialer-search-data`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (redirect.data.status !== 0) {
          window.open(redirect.data.dialerSearchUrl);
        } else {
          setOpenLeadForm(true);
        }
      }
    } catch (err) {
      console.error("Error:", err);
    }
  }, []);

  return (
    <div className={`rf-shell ${collapsed ? "rf-shell--collapsed" : ""}`}>
      <AgentSidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        onToggleCollapse={() => setCollapsed((v) => !v)}

        // Restored callbacks
        onVerifyClick={() => setOpenVerify(true)}
        onLeadFormClick={handleLeadFormClick}
      />

      <div className="rf-shell__content">
        <AgentNavbar
          pageTitle={pageTitle}
          onOpenMobileSidebar={() => setMobileOpen(true)}
          notificationCount={3}
        />

        <main className="rf-shell__main">
          <Outlet />
        </main>

        <CustomSpeedDial />
      </div>

      <LeadFormModal
        open={openLeadForm}
        onClose={() => setOpenLeadForm(false)}
      />

      <VerificationModal
        open={openVerify}
        onClose={() => setOpenVerify(false)}
      />
    </div>
  );
}

export default React.memo(DashboardLayout);