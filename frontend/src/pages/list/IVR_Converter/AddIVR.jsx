import React, { useState, useEffect, useContext, useRef } from "react";
import { AuthContext } from "../../../context/authContext";
import axios from "axios";
import Swal from "sweetalert2";
import { X, Mic, Languages, Megaphone, UserCog, Type, Loader2, Plus, Hand, Moon, Headphones } from "lucide-react";

const LANGUAGES = [
  { value: "Hindi (Male 1)", label: "Hindi (Male 1)" },
  { value: "hi_female_v1", label: "Hindi (Female)" },
  { value: "hi_male_v2", label: "Hindi (Male 2)" },
  { value: "en_male_v1", label: "English (Male)" },
  { value: "en_female_v1", label: "English (Female 1)" },
  { value: "en_female_v4", label: "English (Female 2)" },
  { value: "en_female_v6", label: "English (Female 3)" },
  { value: "en_female_v7", label: "English (Female 4)" },
  { value: "gu_female_v2", label: "Gujarati (Female 1)" },
  { value: "gu_female_v1", label: "Gujarati (Female 2)" },
  { value: "mr_female_v1", label: "Marathi (Female)" },
  { value: "ta_female_v1", label: "Tamil (Female)" },
  { value: "kn_female_v1", label: "Kannada (Female)" },
  { value: "te_female_v1", label: "Telugu (Female)" },
  { value: "or_female_v1", label: "Oriya (Female)" },
  { value: "or_male_v1", label: "Oriya (Male)" },
  { value: "pn_female_v1", label: "Panjabi (Female)" },
  { value: "as_female_v1", label: "Assamese (Female)" },
];

// also used by the Edit popup in IVRList
export const TYPES = [
  { value: "welcome IVR", label: "Welcome IVR", hint: "When a call connects", icon: Hand, tone: "primary" },
  { value: "AfterOffice", label: "After office", hint: "Outside working hours", icon: Moon, tone: "amber" },
  { value: "moh", label: "Music on hold", hint: "While callers wait", icon: Headphones, tone: "violet" },
];

/* voices grouped by language for the dropdown: "Hindi (Male 1)" -> group "Hindi" */
const VOICE_GROUPS = LANGUAGES.reduce((acc, l) => {
  const lang = l.label.split(" (")[0];
  (acc[lang] = acc[lang] || []).push(l);
  return acc;
}, {});

const EMPTY = { file_name: "", lang: "", text: "", type: "", campaign_name: "", admin_id: "" };

/* SweetAlert that follows the CRM theme (light / dark) */
const swal = (opts) => {
  let node = document.querySelector(".iv-modal") || document.body;
  let bg = "#fff";
  let dark = false;
  while (node && node.nodeType === 1) {
    const m = String(getComputedStyle(node).backgroundColor).match(/rgba?\(([^)]+)\)/);
    if (m) {
      const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      if (a > 0.5) {
        bg = `rgb(${r}, ${g}, ${b})`;
        dark = 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
        break;
      }
    }
    node = node.parentElement;
  }
  return Swal.fire({ background: dark ? bg : "#fff", color: dark ? "#e5e7eb" : "#1f2937", confirmButtonColor: "#4f46e5", ...opts });
};

/**
 * Props
 *   open, onClose
 *   campaigns   optional [{ id, label }] (fetched here if not passed)
 *   onCreated   called with the new row after a successful create
 *   setData     still supported for older callers
 */
const AddDialog = ({ open, onClose, campaigns: campaignsProp, onCreated, setData }) => {
  const { user } = useContext(AuthContext) || {};
  const [formData, setFormData] = useState(EMPTY);
  const [error, setError] = useState({});
  const [fetchedCampaigns, setFetchedCampaigns] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const textRef = useRef(null);
  const campaignOptions = campaignsProp && campaignsProp.length ? campaignsProp : fetchedCampaigns;

  useEffect(() => {
    if (user?.user_type !== "9") return;
    const token = localStorage.getItem("token");
    axios
      .get(`https://${window.location.hostname}:4000/telephony/admin`, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => setAdmins(response.data || []))
      .catch((err) => console.error("Error fetching admins:", err));
  }, [user]);

  useEffect(() => {
    if (campaignsProp && campaignsProp.length) return;
    const token = localStorage.getItem("token");
    axios
      .get(`https://${window.location.hostname}:4000/campaigns_dropdown`, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => setFetchedCampaigns((response.data || []).map((c) => ({ id: String(c.compaign_id), label: c.compaignname }))))
      .catch((err) => console.error("Error fetching campaigns:", err));
  }, [campaignsProp]);

  const handleClose = () => {
    if (submitting) return;
    setFormData(EMPTY);
    setError({});
    onClose();
  };

  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => textRef.current?.focus(), 30);
    const onKey = (e) => e.key === "Escape" && handleClose();
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, submitting]);

  const setField = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError((prev) => ({ ...prev, [name]: value ? "" : prev[name] }));
  };
  const handleChange = (e) => setField(e.target.name, e.target.value);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    const newErrors = {
      text: formData.text.trim() ? "" : "Type what the caller should hear",
      lang: formData.lang ? "" : "Pick a voice",
      type: formData.type ? "" : "Pick where this prompt is used",
    };
    setError(newErrors);
    if (Object.values(newErrors).some(Boolean)) return;

    setSubmitting(true);
    try {
      const response = await axios.post(
        `https://${window.location.hostname}:4000/texttospeech`,
        {
          file_name: formData.file_name || `${Date.now()}_${formData.campaign_name}.wav`,
          type: formData.type,
          text: formData.text,
          lang: formData.lang,
          campaign_name: formData.campaign_name,
        },
        { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
      );
      const row = response.data?.result;
      setFormData(EMPTY);
      setError({});
      onClose();
      if (onCreated) onCreated(row);
      else if (setData && row) setData((prev) => [...prev, row]);
      swal({
        toast: true,
        position: "top-end",
        icon: "success",
        title: response.data?.message || "Speech created",
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true,
      });
    } catch (err) {
      swal({ title: "Could not create speech", text: err.response?.data?.error || "An error occurred.", icon: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;
  const charCount = formData.text.length;

  return (
    <div className="iv-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && handleClose()}>
      <form className="iv-modal iv-modal--lg" role="dialog" aria-modal="true" aria-label="Create new speech" onSubmit={handleSubmit} noValidate>
        {/* Header */}
        <div className="iv-modal__head">
          <div className="iv-modal__title">
            <span className="iv-modal__badge"><Mic size={16} /></span>
            <div>
              <h3>Create new speech</h3>
              <p>Type a message and pick a voice. It is turned into an IVR audio file.</p>
            </div>
          </div>
          <button type="button" className="iv-act" onClick={handleClose} aria-label="Close" disabled={submitting}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="iv-modal__body">
          <label className="iv-field">
            <span><Type size={13} /> Speech text <em className="iv-req">required</em></span>
            <textarea
              ref={textRef}
              name="text"
              rows={5}
              value={formData.text}
              onChange={handleChange}
              placeholder="e.g. Thank you for calling Next2Call. Press 1 for sales, press 2 for support."
              aria-invalid={!!error.text}
            />
            <span className="iv-field__foot">
              {error.text ? <em className="iv-field__error">{error.text}</em> : <small>Short sentences sound more natural.</small>}
              <small className="iv-counter">{charCount} chars</small>
            </span>
          </label>

          <div className="iv-field">
            <span>Where is it played? <em className="iv-req">required</em></span>
            <div className="iv-choice iv-choice--3" role="radiogroup" aria-label="IVR type">
              {TYPES.map((t) => {
                const on = formData.type === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className={`iv-choice__opt iv-tone--${t.tone}${on ? " is-on" : ""}`}
                    onClick={() => setField("type", t.value)}
                  >
                    <span className="iv-choice__icon"><t.icon size={15} /></span>
                    <b>{t.label}</b>
                    <small>{t.hint}</small>
                  </button>
                );
              })}
            </div>
            {error.type && <em className="iv-field__error">{error.type}</em>}
          </div>

          <div className="iv-form-grid">
            <label className="iv-field">
              <span><Languages size={13} /> Voice <em className="iv-req">required</em></span>
              <select name="lang" value={formData.lang} onChange={handleChange} aria-invalid={!!error.lang}>
                <option value="">Select a voice</option>
                {Object.entries(VOICE_GROUPS).map(([lang, voices]) => (
                  <optgroup key={lang} label={lang}>
                    {voices.map((v) => (
                      <option key={v.value} value={v.value}>{v.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {error.lang && <em className="iv-field__error">{error.lang}</em>}
            </label>

            <label className="iv-field">
              <span><Megaphone size={13} /> Campaign</span>
              <select name="campaign_name" value={formData.campaign_name} onChange={handleChange}>
                <option value="">No campaign</option>
                {campaignOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.label ? `${o.label} (#${o.id})` : o.id}</option>
                ))}
              </select>
            </label>

            {user?.user_type === "9" && (
              <label className="iv-field">
                <span><UserCog size={13} /> Assign admin</span>
                <select name="admin_id" value={formData.admin_id} onChange={handleChange}>
                  <option value="">Select admin</option>
                  {admins.map((a) => (
                    <option key={a.user_id} value={a.user_id}>{a.full_name || a.user_id}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="iv-modal__foot">
          <button type="button" className="iv-btn iv-btn--ghost" onClick={handleClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="iv-btn iv-btn--primary" disabled={submitting}>
            {submitting ? (<><Loader2 size={15} className="iv-spin" /> Creating…</>) : (<><Plus size={15} /> Create speech</>)}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddDialog;