import { useState } from "react";
import axios from "axios";
import Swal from "sweetalert2";
import AnnouncementOutlinedIcon from "@mui/icons-material/AnnouncementOutlined";


import CloseIcon from "@mui/icons-material/Close";
import CampaignIcon from "@mui/icons-material/Campaign";
import "./announce.css";

const CreateAnnouncementDialog = ({ open, onClose, onPostSuccess }) => {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!message.trim()) {
      Swal.fire("Error", "Announcement message cannot be empty.", "error");
      return;
    }

    setSubmitting(true);

    try {
      const token = localStorage.getItem("token");

      const res = await axios.post(
        `https://${window.location.hostname}:4000/announcements/create`,
        { message },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      Swal.fire(
        "Success",
        res.data.message || "Announcement posted.",
        "success"
      );

      setMessage("");
      onClose();

      if (onPostSuccess) onPostSuccess();
    } catch (err) {
      console.error(err);

      Swal.fire(
        "Error",
        err.response?.data?.message || "Failed to post announcement.",
        "error"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="announcement-backdrop" onClick={onClose}>
      <div
        className="announcement-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="announcement-head">
          <div className="announcement-title">
            <div className="announcement-icon-wrapper">
              <AnnouncementOutlinedIcon className="announcement-icon" />
            </div>

            <h3>Create Announcement</h3>
          </div>

          <button
            type="button"
            className="announcement-icon-btn"
            onClick={onClose}
          >
            <CloseIcon fontSize="small" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="announcement-body">
            <label className="announcement-field">
              <span>Announcement Message</span>

              <textarea
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your announcement here. This message will be visible to all users."
              />
            </label>
          </div>

          <div className="announcement-footer">
            <button
              type="button"
              className="announcement-btn announcement-btn-secondary"
              onClick={onClose}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="announcement-btn announcement-btn-primary"
              disabled={submitting}
            >
              {submitting ? "Posting..." : "Post Announcement"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateAnnouncementDialog;


// import {
//   Dialog,
//   DialogTitle,
//   DialogContent,
//   TextField,
//   Button,
//   Box,
//   CircularProgress,
//   IconButton,
//   Typography,
// } from '@mui/material';
// import CloseIcon from '@mui/icons-material/Close';
// import CampaignIcon from '@mui/icons-material/Campaign';
// import Swal from 'sweetalert2';
// import { useState } from 'react';
// import axios from 'axios';

// const CreateAnnouncementDialog = ({ open, onClose, onPostSuccess }) => {
//   const [message, setMessage] = useState('');
//   const [submitting, setSubmitting] = useState(false);

//   const handleSubmit = async (e) => {
//     e.preventDefault();

//     if (!message.trim()) {
//       Swal.fire('Error', 'Announcement message cannot be empty.', 'error');
//       return;
//     }

//     setSubmitting(true);
//     try {
//       const token = localStorage.getItem('token');
//       const res = await axios.post(
//         `https://${window.location.hostname}:4000/announcements/create`,
//         { message },
//         {
//           headers: {
//             Authorization: `Bearer ${token}`,
//           },
//         }
//       );

//       Swal.fire('Success', res.data.message || 'Announcement posted.', 'success');
//       setMessage('');
//       onClose(); // close dialog
//       if (onPostSuccess) onPostSuccess(); // notify parent to refresh
//     } catch (err) {
//       console.error(err);
//       Swal.fire(
//         'Error',
//         err.response?.data?.message || 'Failed to post announcement.',
//         'error'
//       );
//     } finally {
//       setSubmitting(false);
//     }
//   };

//   return (
//     <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
//       <DialogTitle>
//         <Box display="flex" alignItems="center" justifyContent="space-between">
//           <Box display="flex" alignItems="center" gap={1}>
//             <CampaignIcon sx={{ color: 'rgb(68, 0, 255)' }} />
//             <Typography variant="h6">Create Announcement</Typography>
//           </Box>
//           <IconButton onClick={onClose}>
//             <CloseIcon />
//           </IconButton>
//         </Box>
//       </DialogTitle>

//       <DialogContent dividers>
//         <form onSubmit={handleSubmit}>
//           <TextField
//             label="Announcement Message"
//             multiline
//             rows={4}
//             fullWidth
//             value={message}
//             onChange={(e) => setMessage(e.target.value)}
//             variant="outlined"
//             margin="normal"
//             placeholder="🚨 Please complete your tasks before 5 PM."
//           />

//           <Box display="flex" justifyContent="flex-end" mt={2}>
//             <Button
//               type="submit"
//               variant="contained"
//               sx={{
//                 backgroundColor: 'rgb(68, 0, 255)',
//                 '&:hover': { backgroundColor: 'rgb(50, 0, 200)' },
//               }}
//               disabled={submitting}
//               startIcon={submitting && <CircularProgress size={18} />}
//             >
//               {submitting ? 'Posting...' : 'Post'}
//             </Button>
//           </Box>
//         </form>
//       </DialogContent>
//     </Dialog>
//   );
// };


// export default CreateAnnouncementDialog;
