import { useState, useEffect } from "react";
import axios from "axios";
import Swal from "sweetalert2";
import {
  X,
  User,
  IdCard,
  PhoneCall,
  Megaphone,
  Lock,
  Mail,
  Phone as PhoneIcon,
  Link2,
  Globe,
  Image as ImageIcon,
  Building2,
  Loader2,
  Save,
} from "lucide-react";
import "./profile.css";
const toast = (icon, title, timer = 2800) =>
  Swal.fire({
    toast: true,
    icon,
    title,
    position: "top-end",
    showConfirmButton: false,
    timer,
    timerProgressBar: true,
  });
const EditPro = ({ profileData, onClose, onSuccess, user }) => {
  const isAdmin =
    profileData?.user_type == 9 || profileData?.user_type == 8;
  const [formData, setFormData] = useState({
    fullName: profileData?.full_name || "",
    userId: profileData?.user_id || "",
    useDID: profileData?.use_did || "",
    campaignId: profileData?.campaigns_id || "",
    password: "",
    email: profileData?.admin_email || "",
    mobile: profileData?.admin_mobile || "",
    UrlIP: profileData?.api_url || "",
    timezone: profileData?.user_timezone || "Asia/Kolkata",
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [profilePicture, setProfilePicture] = useState(null);
  const [profilePreview, setProfilePreview] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [campaignOptions, setCampaignOptions] = useState([]);
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (isAdmin) {
      axios
        .get(`https://${window.location.hostname}:4000/campaigns_dropdown`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        .then((response) => {
          const options = response.data.map((c) => ({
            id: c.compaign_id,
            label: c.compaignname,
          }));
          setCampaignOptions([
            { id: "", label: "--- Select Campaign ID ---" },
            ...options,
          ]);
        })
        .catch((err) => console.error("Error fetching campaigns:", err));
    } else {
      setCampaignOptions([
        {
          id: profileData?.campaigns_id,
          label: profileData?.campaign_name || profileData?.campaigns_id,
        },
      ]);
    }
  }, [profileData, isAdmin]);
  const validate = () => {
    const t = {};
    if (!formData.fullName.trim()) t.fullName = "Full name is required";
    if (formData.useDID && !/^\d{1,10}$/.test(formData.useDID))
      t.useDID = "Use DID must be up to 10 digits";
    if (!formData.email.trim() || !/\S+@\S+\.\S+/.test(formData.email))
      t.email = "Valid email is required";
    if (!formData.mobile.trim() || !/^\+?\d{7,15}$/.test(formData.mobile))
      t.mobile = "Valid mobile number is required";
    setErrors(t);
    return Object.keys(t).length === 0;
  };
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((s) => ({ ...s, [name]: value }));
  };
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfilePicture(file);
    setProfilePreview(URL.createObjectURL(file));
  };
  const handleLogoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };
  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found");
      const fd = new FormData();
      Object.keys(formData).forEach((k) => {
        if (k === "password" && !formData[k]) return;
        fd.append(k, formData[k]);
      });
      if (profilePicture) fd.append("profilePicture", profilePicture);
      if (logoFile) fd.append("companyLogo", logoFile);
      const response = await axios.put(
        `https://${window.location.hostname}:4000/users/${formData.userId}`,
        fd,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "multipart/form-data",
          },
        }
      );
      await axios.post(
        `https://${window.location.hostname}:4000/action/changeUrlIp`,
        { ip: formData.UrlIP },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.data?.admin_logo) {
        localStorage.setItem("admin_logo", response.data.admin_logo);
      }
      await onSuccess?.(response.data);
      onClose?.();
    } catch (err) {
      console.error("Error updating profile:", err);
      toast(
        "error",
        err?.response?.data?.message || "Failed to update profile"
      );
    } finally {
      setIsSubmitting(false);
    }
  };
  const initials = (formData.fullName || "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <form className="pf-edit" onSubmit={handleSubmit} noValidate>
      {/* Header */}
      <div className="pf-edit__head">
        <div className="pf-edit__head-left">
          <div className="pf-avatar pf-avatar--sm">
            {/* {profilePreview || profileData?.admin_logo ? (
              <img
                src={profilePreview || profileData.admin_logo}
                alt={formData.fullName}
              />
            ) : (
              <span>{initials}</span>
              )} */}
            <span>{initials}</span>
          </div>
          <div>
            <h2 className="pf-edit__title">Edit Profile</h2>
            <p className="pf-edit__sub">Update your account information</p>
          </div>
        </div>
        <button
          type="button"
          className="pf-icon-btn"
          onClick={onClose}
          title="Close"
        >
          <X size={16} />
        </button>
      </div>
      {/* Body */}
      <div className="pf-edit__body">
        <div className="pf-form-grid">
          {/* Full Name */}
          <div className="pf-field">
            <label className="pf-label">
              <User size={13} /> Full Name
            </label>
            <input
              className={`pf-input ${errors.fullName ? "pf-input--err" : ""}`}
              name="fullName"
              value={formData.fullName}
              onChange={handleChange}
              placeholder="John Doe"
            />
            {errors.fullName && (
              <span className="pf-err">{errors.fullName}</span>
            )}
          </div>
          {/* User ID */}
          <div className="pf-field">
            <label className="pf-label">
              <IdCard size={13} /> User ID
            </label>
            <input
              className="pf-input"
              name="userId"
              value={formData.userId}
              readOnly
              disabled
            />
          </div>
          {/* Use DID (admin only) */}
          {isAdmin && (
            <div className="pf-field">
              <label className="pf-label">
                <PhoneCall size={13} /> Use DID
              </label>
              <input
                className={`pf-input ${errors.useDID ? "pf-input--err" : ""}`}
                name="useDID"
                value={formData.useDID}
                onChange={handleChange}
                placeholder="Optional DID number"
              />
              {errors.useDID && (
                <span className="pf-err">{errors.useDID}</span>
              )}
            </div>
          )}
          {/* Campaign */}
          <div className="pf-field">
            <label className="pf-label">
              <Megaphone size={13} /> Campaign
            </label>
            {isAdmin ? (
              <select
                className="pf-input"
                name="campaignId"
                value={formData.campaignId}
                onChange={handleChange}
              >
                {campaignOptions.map((o) => (
                  <option key={o.id ?? "none"} value={o.id ?? ""}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="pf-input"
                value={
                  profileData?.campaign_name || profileData?.campaigns_id || ""
                }
                readOnly
                disabled
              />
            )}
          </div>
          {/* Password */}
          <div className="pf-field">
            <label className="pf-label">
              <Lock size={13} /> New Password
            </label>
            <input
              className="pf-input"
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Leave blank to keep current"
              autoComplete="new-password"
            />
          </div>
          {/* Email */}
          <div className="pf-field">
            <label className="pf-label">
              <Mail size={13} /> Email
            </label>
            <input
              className={`pf-input ${errors.email ? "pf-input--err" : ""}`}
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="you@example.com"
            />
            {errors.email && <span className="pf-err">{errors.email}</span>}
          </div>
          {/* Mobile */}
          <div className="pf-field">
            <label className="pf-label">
              <PhoneIcon size={13} /> Mobile
            </label>
            <input
              className={`pf-input ${errors.mobile ? "pf-input--err" : ""}`}
              name="mobile"
              value={formData.mobile}
              onChange={handleChange}
              placeholder="+919999999999"
            />
            {errors.mobile && <span className="pf-err">{errors.mobile}</span>}
          </div>
          {/* URL / IP (admin) */}
          {user === "admin" && (
            <div className="pf-field">
              <label className="pf-label">
                <Link2 size={13} /> URL / IP
              </label>
              <input
                className="pf-input"
                name="UrlIP"
                value={formData.UrlIP}
                onChange={handleChange}
                placeholder="https://api.example.com"
              />
            </div>
          )}
          {/* Timezone (admin) */}
          {isAdmin && (
            <div className="pf-field">
              <label className="pf-label">
                <Globe size={13} /> Timezone
              </label>
              <select
                className="pf-input"
                name="timezone"
                value={formData.timezone}
                onChange={handleChange}
              >
                <option value="Asia/Kolkata">Asia/Kolkata</option>
                <option value="America/New_York">America/New_York</option>
                <option value="Europe/Istanbul">Europe/Istanbul</option>
              </select>
            </div>
          )}
        </div>
        {/* Uploads */}
        <div className="pf-uploads">
          <div className="pf-upload">
            <div className="pf-upload__preview">
              {profilePreview ? (
                <img src={profilePreview} alt="preview" />
              ) : profileData?.admin_logo ? (
                <img src={profileData.admin_logo} alt="current" />
              ) : (
                <ImageIcon size={22} />
              )}
            </div>
            <div className="pf-upload__body">
              <span className="pf-label">
                <ImageIcon size={13} /> Profile Picture
              </span>
              <label className="pf-upload__btn">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  hidden
                />
                Choose file
              </label>
              <span className="pf-upload__hint">
                {profilePicture?.name || "PNG, JPG up to 2 MB"}
              </span>
            </div>
          </div>
          {isAdmin && (
            <div className="pf-upload">
              <div className="pf-upload__preview">
                {logoPreview ? (
                  <img src={logoPreview} alt="logo preview" />
                ) : (
                  <Building2 size={22} />
                )}
              </div>
              <div className="pf-upload__body">
                <span className="pf-label">
                  <Building2 size={13} /> Company Logo
                </span>
                <label className="pf-upload__btn">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoChange}
                    hidden
                  />
                  Choose file
                </label>
                <span className="pf-upload__hint">
                  {logoFile?.name || "Square image recommended"}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Footer */}
      <div className="pf-edit__foot">
        <button
          type="button"
          className="pf-btn pf-btn--ghost"
          onClick={onClose}
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="pf-btn pf-btn--primary"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 size={15} className="pf-spin" /> Saving…
            </>
          ) : (
            <>
              <Save size={15} /> Save Changes
            </>
          )}
        </button>
      </div>
    </form>
  );
};
export default EditPro;

// import { useState, useEffect } from "react";
// import {
//   Dialog,
//   DialogTitle,
//   DialogContent,
//   DialogActions,
//   TextField,
//   Button,
//   MenuItem,
//   InputLabel,
//   Grid,
//   IconButton,
//   Divider,
// } from "@mui/material";
// import Swal from "sweetalert2";
// import axios from "axios";
// import CloseIcon from "@mui/icons-material/Close";

// const EditPro = ({ profileData, handleClose, open, onSuccess, user }) => {
//   const [formData, setFormData] = useState({
//     fullName: profileData?.full_name || "",
//     userId: profileData?.user_id || "",
//     useDID: profileData?.use_did || "",
//     campaignId: profileData?.campaigns_id || "",
//     password: "",
//     email: profileData?.admin_email || "",
//     mobile: profileData?.admin_mobile || "",
//     UrlIP: profileData?.api_url || "",
//     timezone: profileData?.user_timezone || "",
//   });

//   const [errors, setErrors] = useState({});
//   const [isSubmitting, setIsSubmitting] = useState(false);
//   const [profilePicture, setProfilePicture] = useState(null);

//   const [campaignOptions, setCampaignOptions] = useState([]);
//   const [logoFile, setLogoFile] = useState(null); // for company logo

//   const [logoPreview, setLogoPreview] = useState(null);

//   const handleLogoChange = (e) => {
//     const file = e.target.files[0];
//     if (file) {
//       setLogoFile(file);
//       setLogoPreview(URL.createObjectURL(file));
//     }
//   };

//   useEffect(() => {
//     const token = localStorage.getItem("token");

//     if (profileData?.user_type == 9 || profileData?.user_type == 8) {
//       // Super Admin (9) or Admin (8) → Fetch all campaigns
//       axios
//         .get(`https://${window.location.hostname}:4000/campaigns_dropdown`, {
//           headers: { Authorization: `Bearer ${token}` },
//         })
//         .then((response) => {
//           const options = response.data.map((campaign) => ({
//             id: campaign.compaign_id,
//             label: campaign.compaignname,
//           }));
//           setCampaignOptions([
//             { id: "", label: "--- Select Campaign ID ---" },
//             ...options,
//           ]);
//         })
//         .catch((error) => {
//           console.error("Error fetching campaigns:", error);
//         });
//     } else {
//       setCampaignOptions([
//         {
//           id: profileData?.campaigns_id,
//           label: profileData?.campaign_name || profileData?.campaigns_id,
//         },
//       ]);
//     }
//   }, [profileData]);

//   const validate = () => {
//     const tempErrors = {};

//     if (!formData.fullName.trim())
//       tempErrors.fullName = "Full Name is required";
//     if (formData.useDID.trim()) {
//       if (!/^\d{1,10}$/.test(formData.useDID)) {
//         tempErrors.useDID = "Use DID must be a number with up to 10 digits";
//       }
//     }
//     if (!formData.email.trim() || !/\S+@\S+\.\S+/.test(formData.email))
//       tempErrors.email = "Valid email is required";
//     if (!formData.mobile.trim() || !/^\+?\d{7,15}$/.test(formData.mobile))
//       tempErrors.mobile = "Valid mobile number is required";

//     setErrors(tempErrors);
//     return Object.keys(tempErrors).length === 0;
//   };

//   const handleChange = (e) => {
//     const { name, value } = e.target;
//     setFormData({ ...formData, [name]: value });
//   };

//   const handleFileChange = (e) => {
//     const file = e.target.files[0];
//     if (file) {
//       setProfilePicture(file);
//     }
//   };

//   const handleSubmit = async () => {
//     if (validate()) {
//       setIsSubmitting(true);
//       try {
//         const token = localStorage.getItem("token");
//         if (!token) {
//           throw new Error("No authentication token found");
//         }
//         const ip = formData.UrlIP;

//         const formDataToSend = new FormData();
//         Object.keys(formData).forEach((key) => {
//           if (key === "password" && !formData[key]) return;
//           formDataToSend.append(key, formData[key]);
//         });

//         if (profilePicture) {
//           formDataToSend.append("profilePicture", profilePicture);
//         }

//         if (logoFile) {
//           formDataToSend.append("companyLogo", logoFile);
//         }

//         const response = await axios.put(
//           `https://${window.location.hostname}:4000/users/${formData.userId}`,
//           formDataToSend,
//           {
//             headers: {
//               Authorization: `Bearer ${token}`,
//               "Content-Type": "multipart/form-data",
//             },
//           }
//         );

//         const ipRes = await axios.post(
//           `https://${window.location.hostname}:4000/action/changeUrlIp`,
//           { ip },
//           {
//             headers: {
//               Authorization: `Bearer ${token}`,
//             },
//           }
//         );

//         if (response.data.admin_logo) {
//           localStorage.setItem("admin_logo", response.data.admin_logo);
//         }

//         await onSuccess?.(response.data);
//         handleClose();
//       }
//       catch (error) {
//         console.error("Error updating profile:", error);

//         // ❌ error toast
//         Swal.fire({
//           toast: true,
//           position: "top-end",
//           icon: "error",
//           title:
//             error.response?.data?.message ||
//             "There was an error updating your profile",
//           showConfirmButton: false,
//           timer: 3000,
//           timerProgressBar: true,
//         });
//       }
//       finally {
//         setIsSubmitting(false);
//       }
//     }
//   };

//   return (
//     <>
//       <Dialog
//         open={open}
//         onClose={handleClose}
//         maxWidth="sm"
//         fullWidth
//         BackdropProps={{
//           sx: { backgroundColor: "rgba(0, 0, 0, 0.3)" }, // less dark
//         }}
//         PaperProps={{
//           sx: {
//             borderRadius: 3,
//             boxShadow: 6,
//             p: 1,
//           },
//         }}
//       >
//         <DialogTitle
//           sx={{
//             fontWeight: "bold",
//             fontSize: "1.25rem",
//             display: "flex",
//             justifyContent: "space-between",
//             alignItems: "center",
//             px: 3,
//             pt: 2,
//           }}
//         >
//           Edit Profile
//           <IconButton onClick={handleClose}>
//             <CloseIcon />
//           </IconButton>
//         </DialogTitle>

//         <Divider />

//         <DialogContent
//           sx={{
//             px: 3,
//             pt: 2,
//             "& .MuiOutlinedInput-root": {
//               borderRadius: "15px",
//             },
//           }}
//         >
//           <form>
//             <Grid container spacing={2}>
//               <Grid item xs={12} sm={6}>
//                 <TextField
//                   label="User ID"
//                   name="userId"
//                   value={formData.userId}
//                   disabled
//                   fullWidth
//                   margin="dense"
//                 />
//               </Grid>
//               <Grid item xs={12} sm={6}>
//                 <TextField
//                   label="Full Name"
//                   name="fullName"
//                   value={formData.fullName}
//                   onChange={handleChange}
//                   error={Boolean(errors.fullName)}
//                   helperText={errors.fullName}
//                   fullWidth
//                   margin="dense"
//                 />
//               </Grid>

//               {(profileData?.user_type == 9 || profileData?.user_type == 8) && (
//                 <Grid item xs={12} sm={6}>
//                   <TextField
//                     label="Use DID"
//                     name="useDID"
//                     value={formData.useDID}
//                     onChange={handleChange}
//                     error={Boolean(errors.useDID)}
//                     helperText={errors.useDID}
//                     fullWidth
//                     margin="dense"
//                   />
//                 </Grid>
//               )}

//               <Grid item xs={12} sm={6}>
//                 {profileData?.user_type == 9 || profileData?.user_type == 8 ? (
//                   <TextField
//                     label="Campaign ID"
//                     select
//                     name="campaignId"
//                     value={formData.campaignId}
//                     onChange={handleChange}
//                     fullWidth
//                     margin="dense"
//                   >
//                     {campaignOptions.map((option) => (
//                       <MenuItem key={option.id} value={option.id}>
//                         {option.label}
//                       </MenuItem>
//                     ))}
//                   </TextField>
//                 ) : (
//                   <TextField
//                     label="Campaign ID"
//                     name="campaignId"
//                     value={formData.campaignId}
//                     fullWidth
//                     margin="dense"
//                     disabled
//                   />
//                 )}
//               </Grid>

//               <Grid item xs={12} sm={6}>
//                 <TextField
//                   label="Email"
//                   type="email"
//                   name="email"
//                   value={formData.email}
//                   onChange={handleChange}
//                   error={Boolean(errors.email)}
//                   helperText={errors.email}
//                   fullWidth
//                   margin="dense"
//                 />
//               </Grid>

//               <Grid item xs={12} sm={6}>
//                 <TextField
//                   label="Mobile"
//                   name="mobile"
//                   value={formData.mobile}
//                   onChange={handleChange}
//                   error={Boolean(errors.mobile)}
//                   helperText={errors.mobile}
//                   fullWidth
//                   margin="dense"
//                 />
//               </Grid>
//               {user === "admin" && <Grid item xs={12} sm={6}>
//                 <TextField
//                   label="Url IP"
//                   name="UrlIP"
//                   value={formData.UrlIP}
//                   onChange={handleChange}
//                   error={Boolean(errors.UrlIP)}
//                   helperText={errors.UrlIP}
//                   autoComplete="off"
//                   fullWidth
//                   margin="dense"
//                 />
//               </Grid>}
//               {(profileData?.user_type == 9 || profileData?.user_type == 8) && (
//                 <Grid item xs={12} sm={6}>
//                   <TextField
//                     select
//                     label="Timezone"
//                     name="timezone"
//                     value={formData.timezone}
//                     onChange={handleChange}
//                     fullWidth
//                     margin="dense"
//                   >
//                     <MenuItem value="Asia/Kolkata">Asia/Kolkata</MenuItem>
//                     <MenuItem value="America/New_York">
//                       America/New_York
//                     </MenuItem>
//                     <MenuItem value="Europe/Istanbul">Europe/Istanbul</MenuItem>
//                   </TextField>
//                 </Grid>
//               )}
//               <Grid item xs={12}>
//                 <Grid container spacing={3} alignItems="center">
//                   {/* Profile Picture */}
//                   <Grid item xs={12} sm={6}>
//                     <InputLabel sx={{ mb: 1, fontWeight: "bold" }}>
//                       Profile Picture
//                     </InputLabel>
//                     <label
//                       htmlFor="upload-photo"
//                       style={{ cursor: "pointer", display: "inline-block" }}
//                     >
//                       <img
//                         src={
//                           profilePicture
//                             ? URL.createObjectURL(profilePicture)
//                             : "https://via.placeholder.com/120x120?text=Upload"
//                         }
//                         alt="Upload Profile"
//                         style={{
//                           width: "120px",
//                           height: "120px",
//                           objectFit: "contain",
//                           background: "#fff",
//                           borderRadius: "12px",
//                           border: "2px solid #ccc",
//                           boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
//                           transition: "0.3s ease",
//                         }}
//                       />
//                     </label>
//                     <input
//                       id="upload-photo"
//                       type="file"
//                       accept="image/*"
//                       onChange={handleFileChange}
//                       style={{ display: "none" }}
//                     />
//                   </Grid>

//                   {/* ✅ Company Logo only for Admin/Superadmin */}
//                   {(profileData?.user_type == 9 ||
//                     profileData?.user_type == 8) && (
//                     <Grid item xs={12} sm={6}>
//                       <InputLabel sx={{ mb: 1, fontWeight: "bold" }}>
//                         Company Logo
//                       </InputLabel>
//                       <label
//                         htmlFor="upload-logo"
//                         style={{ cursor: "pointer", display: "inline-block" }}
//                       >
//                         <img
//                           src={
//                             logoFile
//                               ? URL.createObjectURL(logoFile)
//                               : "https://via.placeholder.com/120x120?text=Logo"
//                           }
//                           alt="Upload Logo"
//                           style={{
//                             width: "120px",
//                             height: "120px",
//                             objectFit: "cover",
//                             borderRadius: "12px",
//                             border: "2px solid #ccc",
//                             boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
//                             transition: "0.3s ease",
//                           }}
//                         />
//                       </label>
//                       <input
//                         id="upload-logo"
//                         type="file"
//                         accept="image/*"
//                         onChange={handleLogoChange}
//                         style={{ display: "none" }}
//                       />
//                     </Grid>
//                   )}
//                 </Grid>
//               </Grid>
//             </Grid>
//           </form>
//         </DialogContent>

//         <DialogActions sx={{ px: 3, pb: 2 }}>
//           <Button
//             onClick={handleClose}
//             color="secondary"
//             disabled={isSubmitting}
//           >
//             Cancel
//           </Button>
//           <Button
//             onClick={handleSubmit}
//             color="primary"
//             variant="contained"
//             disabled={isSubmitting}
//           >
//             {isSubmitting ? "Saving..." : "Save"}
//           </Button>
//         </DialogActions>
//       </Dialog>
//     </>
//   );
// };

// export default EditPro;
