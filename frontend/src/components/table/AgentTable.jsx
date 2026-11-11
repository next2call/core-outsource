import { useContext, useState, useEffect } from "react";
import DeleteIcon from "@mui/icons-material/Delete";
import PhoneIcon from "@mui/icons-material/Phone";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import { AuthContext } from "../../context/authContext";
import { PopupContext } from "../../context/iframeContext";
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Button,
} from "@mui/material";
import axios from "axios";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./reminderTable.css";

// Maps a freeform status string to one of the chip color variants.
const statusVariant = (status) => {
  const s = (status || "").toLowerCase();
  if (s.includes("answer") || s.includes("done") || s.includes("complete")) return "emerald";
  if (s.includes("cancel") || s.includes("fail") || s.includes("missed")) return "rose";
  if (s.includes("pending") || s.includes("snooze") || s.includes("wait")) return "amber";
  return "slate";
};

const ReminderTable = () => {
  const { user } = useContext(AuthContext);
  const { toggleIframe, updateIframeSrc } = useContext(PopupContext);
  const [reminders, setReminders] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [openDialog, setOpenDialog] = useState(false);
  const [reminderTime, setReminderTime] = useState("");
  const [reminderMessage, setReminderMessage] = useState("");
  const [snoozeReminder, setSnoozeReminder] = useState(null);
  const [shownReminders, setShownReminders] = useState(new Set());
  const [nextCountdown, setNextCountdown] = useState(null);
  const [alertQueue, setAlertQueue] = useState([]);
  const [currentAlert, setCurrentAlert] = useState(null);
  const [audioRef, setAudioRef] = useState(null);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  // Fetch reminders
  const fetchReminders = async (currentPage = 1) => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(
        `https://${window.location.hostname}:4000/reminders?page=${currentPage}&limit=${limit}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setReminders(res.data.data || []);
      setTotal(res.data.total || 0);
      setPage(currentPage);
    } catch (err) {
      toast.error("Failed to fetch reminders");
    }
  };

  useEffect(() => {
    fetchReminders(page);
  }, []);

  // Countdown
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const upcoming = reminders
        .map((r) => new Date(r.datetime) - now)
        .filter((ms) => ms > 0);
      setNextCountdown(
        upcoming.length ? Math.floor(Math.min(...upcoming) / 1000) : null
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [reminders]);

  // Trigger reminders
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setShownReminders((prev) => {
        const updated = new Set(prev);
        reminders.forEach((rem) => {
          const diff = Math.abs(now - new Date(rem.datetime));
          if (diff <= 5000 && !updated.has(rem.id)) {
            playReminder(rem);
            updated.add(rem.id);
          }
        });
        return updated;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [reminders]);

  // Queue alerts
  useEffect(() => {
    if (!currentAlert && alertQueue.length > 0) {
      const next = alertQueue[0];
      setCurrentAlert(next);
      setSnoozeReminder(next);
      setAlertQueue((prev) => prev.slice(1));
    }
  }, [alertQueue, currentAlert]);

  const playReminder = (rem) => {
    const audio = new Audio("/alarm.mp3");
    audio.loop = true;
    audio.play().catch((e) => console.error("Audio play failed", e));
    setAudioRef(audio);

    if (Notification.permission === "granted") {
      new Notification("⏰ Reminder", { body: rem.message });
    }

    toast.warn(`🔔 Reminder: ${rem.message}`, {
      autoClose: false,
      closeOnClick: false,
      draggable: false,
    });

    setAlertQueue((prev) => [...prev, rem]);
  };

  const handleClickToCall = (number) => {
    if (!number) return;
    const digits = number.replace(/\D/g, "");
    const formatted = digits.length <= 6 ? digits : `0${digits.slice(-10)}`;
    const u = JSON.parse(localStorage.getItem("user"));
    const src = `https://${window.location.hostname}/softphone/Phone/click-to-dial.html?profileName=${u.full_name}&SipDomain=${window.location.hostname}&SipUsername=${u.user_id}&SipPassword=${u.password}&d=${formatted}`;
    updateIframeSrc(src);
    toggleIframe("phone");
  };

  const handleAddReminder = async () => {
    try {
      const token = localStorage.getItem("token");
      const utc = new Date(reminderTime)
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");
      await axios.post(
        `https://${window.location.hostname}:4000/reminders`,
        { datetime: utc, message: reminderMessage },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("✅ Reminder added");
      setReminderMessage("");
      setReminderTime("");
      setOpenDialog(false);
      fetchReminders(page);
    } catch (err) {
      toast.error("❌ Failed to add reminder");
    }
  };

  const handleDelete = async (id) => {
    try {
      const token = localStorage.getItem("token");
      await axios.delete(
        `https://${window.location.hostname}:4000/reminders/${id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.info("🗑️ Reminder deleted");
      fetchReminders(page);
    } catch (err) {
      toast.error("❌ Delete failed");
    }
  };

  const handleSnooze = async (rem) => {
    try {
      const token = localStorage.getItem("token");
      const newTime = new Date(new Date(rem.datetime).getTime() + 5 * 60000);
      await axios.put(
        `https://${window.location.hostname}:4000/reminders/${rem.id}`,
        { datetime: newTime.toISOString().slice(0, 19).replace("T", " ") },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.info("😴 Snoozed for 5 min");
      stopAlarm(rem);
    } catch (err) {
      toast.error("❌ Snooze failed");
    }
  };

  const stopAlarm = (rem) => {
    if (audioRef) {
      audioRef.pause();
      audioRef.currentTime = 0;
    }
    setCurrentAlert(null);
    setSnoozeReminder(null);
    setShownReminders((prev) => {
      const updated = new Set(prev);
      updated.delete(rem.id);
      return updated;
    });
  };

  const goToPage = (val) => {
    if (val < 1 || val > totalPages) return;
    fetchReminders(val);
  };

  return (
    <div className="reminders-card">
      <ToastContainer position="bottom-right" theme="colored" />

      {/* Header */}
      <div className="reminders-card__header">
        <h3 className="reminders-card__title">
          <span className="reminders-card__title-icon">
            <NotificationsNoneOutlinedIcon fontSize="inherit" />
          </span>
          Reminders
        </h3>
        <button className="reminders-card__add-btn" onClick={() => setOpenDialog(true)}>
          <span className="reminders-card__add-icon">＋</span>
          Add Reminder
        </button>
        {/* <button className="reminders-card__add-btn" onClick={() => setOpenDialog(true)}>
          <span className="reminders-card__add-icon">＋</span>
          Add Reminder
        </button> */}
      </div>

      {/* Countdown */}
      {nextCountdown !== null && (
        <p className="reminders-card__countdown">
          ⏳ Next reminder in: {nextCountdown} sec
        </p>
      )}

      {/* Table */}
      <div className="reminders-table-scroll">
        <table className="reminders-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Message</th>
              <th>Time</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {reminders.map((rem, i) => (
              <tr key={rem.id}>
                <td>{(page - 1) * limit + i + 1}</td>
                <td className="reminders-table__message">{rem.message}</td>
                <td>
                  {new Date(rem.datetime).toLocaleString("en-GB", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}
                </td>
                <td className={!rem.email ? "reminders-table__muted" : ""}>
                  {rem.email || "—"}
                </td>
                <td className={!rem.phone_number ? "reminders-table__muted" : ""}>
                  {rem.phone_number || "—"}
                </td>
                <td>
                  {rem.dialstatus ? (
                    <span className={`reminder-chip reminder-chip--${statusVariant(rem.dialstatus)}`}>
                      {rem.dialstatus}
                    </span>
                  ) : (
                    <span className="reminders-table__muted">—</span>
                  )}
                </td>
                <td>
                  <div className="reminders-table__actions">
                    <button
                      className="reminder-action-btn"
                      title="Call"
                      onClick={() => handleClickToCall(rem.phone_number)}
                    >
                      <PhoneIcon fontSize="inherit" />
                    </button>
                    <button
                      className="reminder-action-btn reminder-action-btn--danger"
                      title="Delete"
                      onClick={() => handleDelete(rem.id)}
                    >
                      <DeleteIcon fontSize="inherit" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {reminders.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="reminders-table__empty">No reminders yet.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="reminders-pagination">
        <button
          className="reminders-pagination__btn"
          onClick={() => goToPage(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeftIcon fontSize="small" />
        </button>
        <span className="reminders-pagination__label">
          Page {page} of {totalPages}
        </span>
        <button
          className="reminders-pagination__btn"
          onClick={() => goToPage(page + 1)}
          disabled={page >= totalPages}
        >
          <ChevronRightIcon fontSize="small" />
        </button>
      </div>

      {/* Add Reminder Dialog */}
      <Dialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        fullWidth
        maxWidth="sm"
        PaperProps={{ className: "reminder-dialog" }}
      >
        <DialogTitle className="reminder-dialog__title">Add Reminder</DialogTitle>
        <DialogContent>
          <TextField
            type="datetime-local"
            label="Date & Time"
            value={reminderTime}
            onChange={(e) => setReminderTime(e.target.value)}
            fullWidth
            margin="normal"
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Reminder Message"
            value={reminderMessage}
            onChange={(e) => setReminderMessage(e.target.value)}
            fullWidth
            multiline
            rows={3}
            margin="normal"
          />
        </DialogContent>
        <DialogActions>
          <Button className="reminder-dialog__cancel-btn" onClick={() => setOpenDialog(false)}>
            Cancel
          </Button>
          <Button className="reminder-dialog__save-btn" onClick={handleAddReminder} variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snooze/Stop Alert */}
      {currentAlert && (
        <div className="reminder-alert">
          <p className="reminder-alert__message">⏰ {currentAlert.message}</p>
          <div className="reminder-alert__actions">
            <button
              className="reminder-alert__btn reminder-alert__btn--snooze"
              onClick={() => handleSnooze(currentAlert)}
            >
              Snooze 5 min
            </button>
            <button
              className="reminder-alert__btn reminder-alert__btn--stop"
              onClick={() => stopAlarm(currentAlert)}
            >
              Stop
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReminderTable;


// import  { useContext, useState, useEffect } from "react";
// import DeleteIcon from "@mui/icons-material/Delete";
// import { AuthContext } from "../../context/authContext";
// import { PopupContext } from "../../context/iframeContext";
// import {
//   IconButton,
//   Tooltip,
//   Table,
//   TableBody,
//   TableCell,
//   TableContainer,
//   TableHead,
//   TableRow,
//   Paper,
//   Button,
//   Dialog,
//   DialogActions,
//   DialogContent,
//   DialogTitle,
//   TextField,
//   Pagination,
//   Box,
//   Typography,
// } from "@mui/material";
// import PhoneIcon from "@mui/icons-material/Phone";
// import axios from "axios";
// import { toast, ToastContainer } from "react-toastify";
// import "react-toastify/dist/ReactToastify.css";

// const ReminderTable = () => {
//   const { user } = useContext(AuthContext);
//   const { toggleIframe, updateIframeSrc } = useContext(PopupContext);
//   const [reminders, setReminders] = useState([]);
//   const [total, setTotal] = useState(0);
//   const [page, setPage] = useState(1);
//   const [limit] = useState(10);
//   const [openDialog, setOpenDialog] = useState(false);
//   const [reminderTime, setReminderTime] = useState("");
//   const [reminderMessage, setReminderMessage] = useState("");
//   const [snoozeReminder, setSnoozeReminder] = useState(null);
//   const [shownReminders, setShownReminders] = useState(new Set());
//   const [nextCountdown, setNextCountdown] = useState(null);
//   const [alertQueue, setAlertQueue] = useState([]);
//   const [currentAlert, setCurrentAlert] = useState(null);
//   const [audioRef, setAudioRef] = useState(null);

//   // Fetch reminders
//   const fetchReminders = async (currentPage = 1) => {
//     try {
//       const token = localStorage.getItem("token");
//       const res = await axios.get(
//         `https://${window.location.hostname}:4000/reminders?page=${currentPage}&limit=${limit}`,
//         { headers: { Authorization: `Bearer ${token}` } }
//       );
//       setReminders(res.data.data || []);
//       setTotal(res.data.total || 0);
//       setPage(currentPage);
//     } catch (err) {
//       toast.error("Failed to fetch reminders");
//     }
//   };

//   useEffect(() => {
//     fetchReminders(page);
//   }, []);

//   // Countdown
//   useEffect(() => {
//     const interval = setInterval(() => {
//       const now = new Date();
//       const upcoming = reminders
//         .map((r) => new Date(r.datetime) - now)
//         .filter((ms) => ms > 0);
//       setNextCountdown(
//         upcoming.length ? Math.floor(Math.min(...upcoming) / 1000) : null
//       );
//     }, 1000);
//     return () => clearInterval(interval);
//   }, [reminders]);

//   // Trigger reminders
//   useEffect(() => {
//     const interval = setInterval(() => {
//       const now = new Date();
//       setShownReminders((prev) => {
//         const updated = new Set(prev);
//         reminders.forEach((rem) => {
//           const diff = Math.abs(now - new Date(rem.datetime));
//           if (diff <= 5000 && !updated.has(rem.id)) {
//             playReminder(rem);
//             updated.add(rem.id);
//           }
//         });
//         return updated;
//       });
//     }, 5000);
//     return () => clearInterval(interval);
//   }, [reminders]);

//   // Queue alerts
//   useEffect(() => {
//     if (!currentAlert && alertQueue.length > 0) {
//       const next = alertQueue[0];
//       setCurrentAlert(next);
//       setSnoozeReminder(next);
//       setAlertQueue((prev) => prev.slice(1));
//     }
//   }, [alertQueue, currentAlert]);

//   const playReminder = (rem) => {
//     const audio = new Audio("/alarm.mp3");
//     audio.loop = true;
//     audio.play().catch((e) => console.error("Audio play failed", e));
//     setAudioRef(audio);

//     if (Notification.permission === "granted") {
//       new Notification("⏰ Reminder", { body: rem.message });
//     }

//     toast.warn(`🔔 Reminder: ${rem.message}`, {
//       autoClose: false,
//       closeOnClick: false,
//       draggable: false,
//     });

//     setAlertQueue((prev) => [...prev, rem]);
//   };

//   const handleClickToCall = (number) => {
//     if (!number) return;
//     const digits = number.replace(/\D/g, "");
//     const formatted = digits.length <= 6 ? digits : `0${digits.slice(-10)}`;
//     const u = JSON.parse(localStorage.getItem("user"));
//     const src = `https://${window.location.hostname}/softphone/Phone/click-to-dial.html?profileName=${u.full_name}&SipDomain=${window.location.hostname}&SipUsername=${u.user_id}&SipPassword=${u.password}&d=${formatted}`;
//     updateIframeSrc(src);
//     toggleIframe("phone");
//   };

//   const handleAddReminder = async () => {
//     try {
//       const token = localStorage.getItem("token");
//       const utc = new Date(reminderTime)
//         .toISOString()
//         .slice(0, 19)
//         .replace("T", " ");
//       await axios.post(
//         `https://${window.location.hostname}:4000/reminders`,
//         { datetime: utc, message: reminderMessage },
//         { headers: { Authorization: `Bearer ${token}` } }
//       );
//       toast.success("✅ Reminder added");
//       setReminderMessage("");
//       setReminderTime("");
//       setOpenDialog(false);
//       fetchReminders(page);
//     } catch (err) {
//       toast.error("❌ Failed to add reminder");
//     }
//   };

//   const handleDelete = async (id) => {
//     try {
//       const token = localStorage.getItem("token");
//       await axios.delete(
//         `https://${window.location.hostname}:4000/reminders/${id}`,
//         { headers: { Authorization: `Bearer ${token}` } }
//       );
//       toast.info("🗑️ Reminder deleted");
//       fetchReminders(page);
//     } catch (err) {
//       toast.error("❌ Delete failed");
//     }
//   };

//   const handleSnooze = async (rem) => {
//     try {
//       const token = localStorage.getItem("token");
//       const newTime = new Date(new Date(rem.datetime).getTime() + 5 * 60000);
//       await axios.put(
//         `https://${window.location.hostname}:4000/reminders/${rem.id}`,
//         { datetime: newTime.toISOString().slice(0, 19).replace("T", " ") },
//         { headers: { Authorization: `Bearer ${token}` } }
//       );
//       toast.info("😴 Snoozed for 5 min");
//       stopAlarm(rem);
//     } catch (err) {
//       toast.error("❌ Snooze failed");
//     }
//   };

//   const stopAlarm = (rem) => {
//     if (audioRef) {
//       audioRef.pause();
//       audioRef.currentTime = 0;
//     }
//     setCurrentAlert(null);
//     setSnoozeReminder(null);
//     setShownReminders((prev) => {
//       const updated = new Set(prev);
//       updated.delete(rem.id);
//       return updated;
//     });
//   };

//   const handlePageChange = (_, val) => fetchReminders(val);

//   return (
//     <Box p={3}>
//       <ToastContainer position="bottom-right" theme="colored" />

//       {/* Header */}
//       <Box
//         display="flex"
//         justifyContent="space-between"
//         alignItems="center"
//         mb={2}
//       >
//         <Typography variant="h6" fontWeight="bold">
//           🔔 Reminders
//         </Typography>
//         <Button variant="contained" onClick={() => setOpenDialog(true)}>
//           ➕ Add Reminder
//         </Button>
//       </Box>

//       {/* Countdown */}
//       {nextCountdown !== null && (
//         <Typography variant="body2" color="green" mb={2}>
//           ⏳ Next reminder in: {nextCountdown} sec
//         </Typography>
//       )}

//       {/* Table */}
//       <TableContainer component={Paper}>
//         <Table size="small">
//           <TableHead sx={{ backgroundColor: "#f5f5f5" }}>
//             <TableRow>
//               <TableCell>#</TableCell>
//               <TableCell>Message</TableCell>
//               <TableCell>Time</TableCell>
//               <TableCell>Email</TableCell>
//               <TableCell>Phone</TableCell>
//               <TableCell>Status</TableCell>
//               <TableCell align="center">Actions</TableCell>
//             </TableRow>
//           </TableHead>
//           <TableBody>
//             {reminders.map((rem, i) => (
//               <TableRow key={rem.id} hover>
//                 <TableCell>{(page - 1) * limit + i + 1}</TableCell>
//                 <TableCell>{rem.message}</TableCell>
//                 <TableCell>
//                   {new Date(rem.datetime).toLocaleString("en-GB", {
//                     year: "numeric",
//                     month: "short",
//                     day: "numeric",
//                     hour: "2-digit",
//                     minute: "2-digit",
//                     hour12: false,
//                   })}
//                 </TableCell>
//                 <TableCell>{rem.email || "—"}</TableCell>
//                 <TableCell>{rem.phone_number || "—"}</TableCell>
//                 <TableCell>{rem.dialstatus || "—"}</TableCell>
//                 <TableCell align="center">
//                   <Tooltip title="Call">
//                     <IconButton
//                       onClick={() => handleClickToCall(rem.phone_number)}
//                     >
//                       <PhoneIcon color="primary" />
//                     </IconButton>
//                   </Tooltip>
//                   <Tooltip title="Delete">
//                     <IconButton
//                       color="error"
//                       onClick={() => handleDelete(rem.id)}
//                     >
//                       <DeleteIcon />
//                     </IconButton>
//                   </Tooltip>
//                 </TableCell>
//               </TableRow>
//             ))}
//           </TableBody>
//         </Table>
//       </TableContainer>

//       {/* Pagination */}
//       <Box display="flex" justifyContent="center" mt={3}>
//         <Pagination
//           count={Math.ceil(total / limit)}
//           page={page}
//           onChange={handlePageChange}
//         />
//       </Box>

//       {/* Add Reminder Dialog */}
//       <Dialog
//         open={openDialog}
//         onClose={() => setOpenDialog(false)}
//         fullWidth
//         maxWidth="sm"
//       >
//         <DialogTitle>Add Reminder</DialogTitle>
//         <DialogContent>
//           <TextField
//             type="datetime-local"
//             label="Date & Time"
//             value={reminderTime}
//             onChange={(e) => setReminderTime(e.target.value)}
//             fullWidth
//             margin="normal"
//             InputLabelProps={{ shrink: true }}
//           />
//           <TextField
//             label="Reminder Message"
//             value={reminderMessage}
//             onChange={(e) => setReminderMessage(e.target.value)}
//             fullWidth
//             multiline
//             rows={3}
//             margin="normal"
//           />
//         </DialogContent>
//         <DialogActions>
//           <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
//           <Button onClick={handleAddReminder} variant="contained">
//             Save
//           </Button>
//         </DialogActions>
//       </Dialog>

//       {/* Snooze/Stop Alert */}
//       {currentAlert && (
//         <Box
//           position="fixed"
//           bottom={80}
//           right={24}
//           bgcolor="white"
//           border="1px solid #ddd"
//           boxShadow={3}
//           p={2}
//           borderRadius={2}
//           zIndex={1300}
//         >
//           <Typography fontWeight="bold" color="error" mb={1}>
//             ⏰ {currentAlert.message}
//           </Typography>
//           <Box display="flex" justifyContent="flex-end" gap={1}>
//             <Button
//               variant="outlined"
//               onClick={() => handleSnooze(currentAlert)}
//             >
//               Snooze 5 min
//             </Button>
//             <Button
//               variant="contained"
//               color="error"
//               onClick={() => stopAlarm(currentAlert)}
//             >
//               Stop
//             </Button>
//           </Box>
//         </Box>
//       )}
//     </Box>
//   );
// };

// export default ReminderTable;
