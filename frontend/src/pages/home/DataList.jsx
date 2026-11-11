import { useEffect, useState, useContext, lazy, Suspense } from "react";
import { useParams } from "react-router-dom";
import { AuthContext } from "../../context/authContext";
import BackButton from "../../context/BackButton";
import axios from "axios";
import Phone from "../../components/navbar/PhoneCall";
import Swal from "sweetalert2";
import * as XLSX from "xlsx";
import {
  Download,
  Phone as PhoneIcon,
  Ban,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Database,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  Clock,
} from "lucide-react";
import { PopupContext } from "../../context/iframeContext";
import "./dataList.css";
const RecordingPlayer = lazy(() => import("../../context/Call_Recording"));
const DataList = () => {
  const { type } = useParams();
  const { popupState, toggleIframe } = useContext(PopupContext);
  const { user } = useContext(AuthContext);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    setLoading(true);
    setError(null);
    const token = localStorage.getItem("token");
    if (!token) {
      setError("Authorization token is missing.");
      setLoading(false);
      return;
    }
    axios
      .get(
        `https://${window.location.hostname}:4000/data/${type}?page=${page}&pageSize=${pageSize}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      .then((response) => {
        setData(response.data.data || []);
        setTotalItems(response.data.totalItems || 0);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching data:", err);
        setError("Failed to fetch data");
        setLoading(false);
      });
  }, [type, page, pageSize]);
  const handleExport = async () => {
    try {
      setExporting(true);
      const token = localStorage.getItem("token");
      if (!token) {
        Swal.fire("Error", "Authorization token is missing.", "error");
        return;
      }
      let allData = [];
      let currentPage = 1;
      const chunk = 100;
      let totalFetched = 0;
      while (true) {
        const response = await axios.get(
          `https://${window.location.hostname}:4000/data/${type}?page=${currentPage}&pageSize=${chunk}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const pageData = response.data.data || [];
        allData = [...allData, ...pageData];
        totalFetched += pageData.length;
        if (totalFetched >= (response.data.totalItems || 0) || pageData.length === 0) break;
        currentPage++;
      }
      if (allData.length === 0) {
        Swal.fire("Warning", "No data available to export.", "warning");
        return;
      }
      const worksheet = XLSX.utils.json_to_sheet(allData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
      XLSX.writeFile(workbook, `${type}_data.xlsx`);
    } catch (err) {
      console.error("Export error:", err);
      Swal.fire("Error", "Failed to export data.", "error");
    } finally {
      setExporting(false);
    }
  };
  let iframeSrc = "";
  if (user?.user_type === "8") iframeSrc = "/admin/softphone/Phone/index.html";
  else if (user?.user_type === "2") iframeSrc = "/team_leader/softphone/Phone/index.html";
  else if (user?.user_type === "1") iframeSrc = "/agent/softphone/Phone/index.html";
  const handleClickToCall = (number) => {
    console.log("Initiating call to:", number);
    toggleIframe("phone");
  };
  const handleBlockNumber = async (number) => {
    const ins_date = new Date().toISOString().slice(0, 19).replace("T", " ");
    const confirm = await Swal.fire({
      title: "Block this number?",
      text: number,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Block",
      confirmButtonColor: "#ef4444",
    });
    if (!confirm.isConfirmed) return;
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      const response = await axios.post(
        `https://${window.location.hostname}:4000/addBlock`,
        { block_no: number, ins_date },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.data.success) {
        Swal.fire("Blocked", `Number ${number} blocked successfully.`, "success");
      }
    } catch (err) {
      console.error("Error blocking number:", err);
      Swal.fire("Error", "Failed to block the number.", "error");
    }
  };
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const filtered = search.trim()
    ? data.filter((it) => {
      const q = search.toLowerCase();
      return (
        String(it.call_from || "").toLowerCase().includes(q) ||
        String(it.did || "").toLowerCase().includes(q) ||
        String(it.status || "").toLowerCase().includes(q) ||
        String(it.hangup || "").toLowerCase().includes(q)
      );
    })
    : data;
  const stats = {
    total: totalItems,
    inbound: data.filter((d) => d.direction === "inbound").length,
    outbound: data.filter((d) => d.direction === "outbound").length,
    showing: filtered.length,
  };
  const statusClass = (s) => {
    const v = String(s || "").trim().toUpperCase();

    switch (v) {
      case "ANSWER":
        return "dl-chip dl-chip--green";

      case "NOANSWER":
      case "CANCEL":
        return "dl-chip dl-chip--red";

      case "CONGESTION":
      case "CHANUNAVAIL":
        return "dl-chip dl-chip--amber";

      default:
        return "dl-chip dl-chip--slate";
    }
  };
  return (
    <div className="dl-page">
      {/* Header */}
      <div className="dl-header">
        <div className="dl-header__left">
          <BackButton />
          <div>
            <h1 className="dl-title call-rep-title">
              <span>{type ? type.toUpperCase() : "DATA"}</span> Records
            </h1>
            <p className="dl-subtitle">Live call activity for the {type} dataset</p>
          </div>
        </div>
        <div className="dl-header__right">
          <div className="dl-search">
            <Search size={16} className="dl-search__icon" />
            <input
              className="dl-search__input"
              placeholder="Search number, status..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="dl-btn dl-btn--primary" onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 size={16} className="dl-spin" /> : <Download size={16} />}
            <span>{exporting ? "Exporting..." : "Export Excel"}</span>
          </button>
        </div>
      </div>
      {/* Stats */}
      <div className="dl-stats">
        <div className="dl-stat">
          <div className="dl-stat__icon dl-tint--indigo"><Database size={18} /></div>
          <div>
            <p className="dl-stat__label">Total Records</p>
            <p className="dl-stat__value">{stats.total.toLocaleString()}</p>
          </div>
        </div>
        <div className="dl-stat">
          <div className="dl-stat__icon dl-tint--emerald"><PhoneIncoming size={18} /></div>
          <div>
            <p className="dl-stat__label">Inbound (page)</p>
            <p className="dl-stat__value">{stats.inbound}</p>
          </div>
        </div>
        <div className="dl-stat">
          <div className="dl-stat__icon dl-tint--orange"><PhoneOutgoing size={18} /></div>
          <div>
            <p className="dl-stat__label">Outbound (page)</p>
            <p className="dl-stat__value">{stats.outbound}</p>
          </div>
        </div>
        <div className="dl-stat">
          <div className="dl-stat__icon dl-tint--cyan"><PhoneCall size={18} /></div>
          <div>
            <p className="dl-stat__label">Showing</p>
            <p className="dl-stat__value">{stats.showing}</p>
          </div>
        </div>
      </div>
      {/* Table Card */}
      <div className="dl-card">
        {loading ? (
          <div className="dl-state">
            <Loader2 size={22} className="dl-spin" />
            <span>Loading records...</span>
          </div>
        ) : error ? (
          <div className="dl-state dl-state--error">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="dl-state">No records found.</div>
        ) : (
          <div className="dl-table-wrap">
            <table className="dl-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Call From</th>
                  <th>Number (DID)</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Duration</th>
                  <th>Status</th>
                  <th>Hangup</th>
                  <th>Direction</th>
                  <th>Recording</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, index) => (
                  <tr key={index}>
                    <td className="dl-td-num">{(page - 1) * pageSize + index + 1}</td>
                    <td>
                      <div className="dl-cell-num">
                        <span className="dl-num">{item.call_from || "—"}</span>
                        {item.direction === "inbound" && item.call_from && (
                          <div className="dl-actions">
                            <button
                              className="dl-icon-btn dl-icon-btn--call"
                              title="Call back"
                              onClick={() => handleClickToCall(item.call_from)}
                            >
                              <PhoneIcon size={14} />
                            </button>
                            <button
                              className="dl-icon-btn dl-icon-btn--block"
                              title="Block number"
                              onClick={() => handleBlockNumber(item.call_from)}
                            >
                              <Ban size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="dl-cell-num">
                        <span className="dl-num">{item.did || "—"}</span>
                        {item.direction === "outbound" && item.did && (
                          <div className="dl-actions">
                            <button
                              className="dl-icon-btn dl-icon-btn--call"
                              title="Call back"
                              onClick={() => handleClickToCall(item.did)}
                            >
                              <PhoneIcon size={14} />
                            </button>
                            <button
                              className="dl-icon-btn dl-icon-btn--block"
                              title="Block number"
                              onClick={() => handleBlockNumber(item.did)}
                            >
                              <Ban size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="dl-muted">{item.start_time || "—"}</td>
                    <td className="dl-muted">{item.end_time || "—"}</td>
                    <td>
                      <span className="dl-dur">
                        <Clock size={12} /> {item.dur || "0s"}
                      </span>
                    </td>
                    <td><span className={statusClass(item.status)}>{item.status || "—"}</span></td>
                    <td className="dl-muted">{item.hangup || "—"}</td>
                    <td>
                      <span className={`dl-dir ${item.direction === "inbound" ? "dl-dir--in" : "dl-dir--out"}`}>
                        {item.direction === "inbound" ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}
                        {item.direction || "—"}
                      </span>
                    </td>
                    <td>
                      <Suspense fallback={<span className="dl-muted">Loading…</span>}>
                        <RecordingPlayer recordingUrl={item.recording_url} />
                      </Suspense>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {/* Pagination */}
        {!loading && !error && totalItems > 0 && (
          <div className="dl-pagination">
            <span className="dl-page-info">
              Page <b>{page}</b> of <b>{totalPages}</b> · {totalItems.toLocaleString()} records
            </span>
            <div className="dl-page-controls">
              <button
                className="dl-page-btn"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft size={16} /> Prev
              </button>
              <button
                className="dl-page-btn"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
      {popupState.phone && (
        <Phone open={popupState.phone} onClose={() => toggleIframe("phone")} iframeSrc={iframeSrc} />
      )}
    </div>
  );
};
export default DataList;


// import { useEffect, useState, useContext, useRef, lazy, Suspense } from "react";
// import { useParams } from "react-router-dom";
// import { AuthContext } from "../../context/authContext";
// import BackButton from "../../context/BackButton";
// import axios from "axios";
// import Phone from "../../components/navbar/PhoneCall";
// import Swal from "sweetalert2"; // at the top if not already
// import "./home.scss";
// import {
//   Table,
//   TableBody,
//   TableCell,
//   TableContainer,
//   TableHead,
//   TableRow,
//   Paper,
//   Typography,
//   CircularProgress,
//   Button,
//   IconButton,
//   Tooltip,
//   Pagination,
// } from "@mui/material";
// import DownloadIcon from "@mui/icons-material/Download";
// import * as XLSX from "xlsx";
// import PhoneIcon from "@mui/icons-material/Phone";
// import BlockIcon from "@mui/icons-material/Block";
// import { PopupContext } from "../../context/iframeContext";
// const RecordingPlayer = lazy(() => import("../../context/Call_Recording"));
// const DataList = () => {
//   const { type } = useParams();
//   const { popupState, toggleIframe } = useContext(PopupContext);
//   const { user } = useContext(AuthContext);
//   const [data, setData] = useState([]);
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState(null);
//   const [page, setPage] = useState(1);
//   const [pageSize] = useState(10);
//   const [totalItems, setTotalItems] = useState(0);
//   useEffect(() => {
//     setLoading(true);
//     setError(null);

//     const token = localStorage.getItem("token");

//     if (!token) {
//       setError("Authorization token is missing.");
//       setLoading(false);
//       return;
//     }

//     axios
//       .get(
//         `https://${window.location.hostname}:4000/data/${type}?page=${page}&pageSize=${pageSize}`,
//         {
//           headers: {
//             Authorization: `Bearer ${token}`,
//           },
//         }
//       )
//       .then((response) => {
//         setData(response.data.data);
//         setTotalItems(response.data.totalItems);
//         setLoading(false);
//       })
//       .catch((err) => {
//         console.error("Error fetching data:", err);
//         setError("Failed to fetch data");
//         setLoading(false);
//       });
//   }, [type, page, pageSize]);

//   const handleExport = async () => {
//     try {
//       const token = localStorage.getItem("token");
//       if (!token) {
//         Swal.fire("Error", "Authorization token is missing.", "error");
//         return;
//       }

//       let allData = [];
//       let currentPage = 1;
//       const pageSize = 100;
//       let totalFetched = 0;

//       do {
//         const response = await axios.get(
//           `https://${window.location.hostname}:4000/data/${type}?page=${currentPage}&pageSize=${pageSize}`,
//           {
//             headers: {
//               Authorization: `Bearer ${token}`,
//             },
//           }
//         );

//         const pageData = response.data.data;
//         allData = [...allData, ...pageData];
//         totalFetched += pageData.length;

//         if (totalFetched >= response.data.totalItems) break;

//         currentPage++;
//       } while (true);

//       if (allData.length === 0) {
//         Swal.fire("Warning", "No data available to export.", "warning");
//         return;
//       }

//       const worksheet = XLSX.utils.json_to_sheet(allData);
//       const workbook = XLSX.utils.book_new();
//       XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
//       XLSX.writeFile(workbook, `${type}_data.xlsx`);
//     } catch (error) {
//       console.error("Export error:", error);
//       Swal.fire("Error", "Failed to export data.", "error");
//     }
//   };

//   let iframeSrc = "";
//   if (user?.user_type === "8") iframeSrc = "/admin/softphone/Phone/index.html";
//   else if (user?.user_type === "2")
//     iframeSrc = "/team_leader/softphone/Phone/index.html";
//   else if (user?.user_type === "1")
//     iframeSrc = "/agent/softphone/Phone/index.html";

//   const handleClickToCall = (number) => {
//     console.log("Initiating call to:", number);
//     toggleIframe("phone");
//   };

//   const handleBlockNumber = async (number) => {
//     const ins_date = new Date().toISOString().slice(0, 19).replace("T", " "); // Format date
//     try {
//       const token = localStorage.getItem("token");
//       if (!token) {
//         console.error("No authentication token found.");
//         return;
//       }

//       const response = await axios.post(
//         `https://${window.location.hostname}:4000/addBlock`,
//         { block_no: number, ins_date },
//         {
//           headers: {
//             Authorization: `Bearer ${token}`,
//           },
//         }
//       );

//       if (response.data.success) {
//         alert(`Number ${number} blocked successfully!`);
//       }
//     } catch (error) {
//       console.error("Error blocking number:", error);
//       alert("Failed to block the number.");
//     }
//   };

//   const handlePageChange = (event, newPage) => {
//     setPage(newPage);
//   };

//   return (
//     <div>
//       <div
//         style={{
//           display: "flex",
//           justifyContent: "space-between",
//           alignItems: "center",
//           padding: "10px",
//         }}
//       >
//         <div style={{ marginBottom: "10px" }}>
//           <BackButton />
//         </div>
//         <Typography variant="h5" gutterBottom>
//           {type.toUpperCase()}
//         </Typography>
//         <Button
//           variant="outlined"
//           color="primary"
//           onClick={handleExport}
//           style={{
//             background: "linear-gradient(90deg, #4caf50, #2e7d32)",
//             color: "white",
//             borderColor: "#4caf50",
//           }}
//         >
//           Export <DownloadIcon />
//         </Button>
//       </div>

//       {loading && <CircularProgress />}
//       {error && <Typography color="error">{error}</Typography>}

//       <TableContainer component={Paper}>
//         <Table sx={{ minWidth: 650 }} aria-label="simple table">
//           <TableHead>
//             <TableRow>
//               <TableCell>ID</TableCell>
//               <TableCell>Call From</TableCell>
//               <TableCell>Number</TableCell>
//               <TableCell>Start Time</TableCell>
//               <TableCell>End Time</TableCell>
//               <TableCell>Duration</TableCell>
//               <TableCell>Status</TableCell>
//               <TableCell>Hangup</TableCell>
//               <TableCell>Direction</TableCell>
//               <TableCell>Recording</TableCell>
//             </TableRow>
//           </TableHead>
//           <TableBody>
//             {data.map((item, index) => (
//               <TableRow key={item.id}>
//                 <TableCell>{(page - 1) * pageSize + index + 1}</TableCell>

//                 <TableCell>
//                   <div>
//                     {item.call_from}
//                     {item.direction === "inbound" && item.call_from && (
//                       <>
//                         <IconButton
//                           onClick={() => handleClickToCall(item.call_from)}
//                           color="primary"
//                         >
//                           <Tooltip title="Click to Call">
//                             <PhoneIcon
//                               className="phoneIcon"
//                               style={{ fontSize: "15px" }}
//                             />
//                           </Tooltip>
//                         </IconButton>

//                         <IconButton
//                           onClick={() => handleBlockNumber(item.call_from)}
//                           color="secondary"
//                         >
//                           <Tooltip title="Block Number">
//                             <BlockIcon
//                               className="blockIcon"
//                               style={{ fontSize: "15px" }}
//                             />
//                           </Tooltip>
//                         </IconButton>
//                       </>
//                     )}
//                   </div>
//                 </TableCell>

//                 <TableCell>
//                   <div>
//                     {item.did}
//                     {item.direction === "outbound" && item.did && (
//                       <>
//                         <IconButton
//                           onClick={() => handleClickToCall(item.did)}
//                           color="primary"
//                         >
//                           <Tooltip title="Click to Call">
//                             <PhoneIcon
//                               className="phoneIcon"
//                               style={{ fontSize: "15px" }}
//                             />
//                           </Tooltip>
//                         </IconButton>

//                         <IconButton
//                           onClick={() => handleBlockNumber(item.did)}
//                           color="secondary"
//                         >
//                           <Tooltip title="Block Number">
//                             <BlockIcon
//                               className="blockIcon"
//                               style={{ fontSize: "15px" }}
//                             />
//                           </Tooltip>
//                         </IconButton>
//                       </>
//                     )}
//                   </div>
//                 </TableCell>
//                 <TableCell>{item.start_time}</TableCell>
//                 <TableCell>{item.end_time}</TableCell>
//                 <TableCell>{item.dur}</TableCell>
//                 <TableCell>{item.status}</TableCell>
//                 <TableCell>{item.hangup}</TableCell>
//                 <TableCell>{item.direction}</TableCell>
//                 <TableCell>
//                   <Suspense
//                     key={item.id}
//                     fallback={<CircularProgress size={20} />}
//                   >
//                     <RecordingPlayer url={item.record_url} id={item.id} />
//                   </Suspense>
//                 </TableCell>
//               </TableRow>
//             ))}
//           </TableBody>
//         </Table>
//       </TableContainer>
//       {popupState.phone && (
//         <Phone
//           id="phone"
//           toggleVisibility={() => toggleIframe("phone")}
//           iframeSrc={iframeSrc}
//         />
//       )}

//       <Pagination
//         count={Math.ceil(totalItems / pageSize)}
//         page={page}
//         onChange={handlePageChange}
//         color="primary"
//         style={{ marginTop: "20px" }}
//       />
//     </div>
//   );
// };

// export default DataList;
