import { useEffect, useMemo, useRef, useState } from "react";
import { FileAudio, Upload, Trash2, X, Music2, Play, Pause, RotateCcw, Loader2, AlertCircle } from "lucide-react";
import Swal from "sweetalert2";
import axios from "axios";

const IVR_FIELDS = [
  { label: "Welcome IVR", name: "welcome_ivr", help: "Plays first when a call connects." },
  { label: "After Office IVR", name: "after_office_ivr", help: "Plays outside the call time." },
  { label: "Music On Hold", name: "music_on_hold", help: "Plays while the caller waits." },
  { label: "Ring Tone Music", name: "ring_tone_music", help: "Plays while it rings on an agent." },
  { label: "No Agent IVR", name: "no_agent_ivr", help: "Plays when no agent is free." },
  { label: "Week Off IVR", name: "week_off_ivr", help: "Plays on the week-off day." },
];

const ALLOWED = /\.(wav|mp3)$/i;
const MAX_MB = 20;

const API = () => `https://${window.location.hostname}:4000`;
const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

const isEmpty = (v) => v === null || v === undefined || String(v).trim() === "";
const audioUrl = (path) => {
  if (isEmpty(path)) return null;
  const p = String(path).trim();
  if (/^https?:\/\//i.test(p)) return p;
  return `${API()}/${p.replace(/^\/+/, "")}`;
};
const fileName = (path) => String(path || "").split(/[\\/]/).pop();
const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const fmtTime = (s) => (!Number.isFinite(s) || s < 0 ? "0:00" : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`);

/* SweetAlert that follows the CRM theme (reads the real background behind the dialog) */
const surfaceOf = (el) => {
  let node = el;
  while (node && node.nodeType === 1) {
    const m = String(getComputedStyle(node).backgroundColor).match(/rgba?\(([^)]+)\)/);
    if (m) {
      const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      if (a > 0.5) return { bg: `rgb(${r}, ${g}, ${b})`, dark: 0.2126 * r + 0.7152 * g + 0.0722 * b < 128 };
    }
    node = node.parentElement;
  }
  return { bg: "#fff", dark: false };
};
const swal = (opts) => {
  const { bg, dark } = surfaceOf(document.querySelector(".cpm-modal") || document.querySelector(".cp-card") || document.body);
  return Swal.fire({
    background: dark ? bg : "#ffffff",
    color: dark ? "#e5e7eb" : "#1f2937",
    confirmButtonColor: "#4f46e5",
    cancelButtonColor: dark ? "#374151" : "#64748b",
    customClass: { popup: dark ? "swal-crm-dark" : "", container: "swal-container-front" },
    ...opts,
  });
};
const toast = (icon, title) =>
  swal({ toast: true, position: "top-end", icon, title, showConfirmButton: false, timer: 2500, timerProgressBar: true });

/**
 * Props:
 *  - open, campaign
 *  - onClose(changed: boolean)   changed = true when something was saved or removed
 *  - refreshCampaign(id)         optional; the page refetches on onClose(true) anyway
 */
const IVRDialog = ({ open, onClose, campaign, refreshCampaign }) => {
  const [files, setFiles] = useState({}); // field name -> File
  const [errors, setErrors] = useState({});
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(null); // field name | "all"
  const [removed, setRemoved] = useState({}); // fields cleared while the dialog is open
  const [changed, setChanged] = useState(false);

  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(null);
  const [loadedKey, setLoadedKey] = useState(null);
  const [progress, setProgress] = useState({ cur: 0, dur: 0 });

  // Previews for newly picked files
  const previews = useMemo(() => {
    const out = {};
    Object.entries(files).forEach(([k, f]) => { if (f) out[k] = URL.createObjectURL(f); });
    return out;
  }, [files]);
  useEffect(() => () => Object.values(previews).forEach((u) => URL.revokeObjectURL(u)), [previews]);

  // Start fresh for every campaign (picked files used to carry over)
  useEffect(() => {
    setFiles({});
    setErrors({});
    setRemoved({});
    setChanged(false);
  }, [campaign?.compaign_id, open]);

  useEffect(() => {
    const a = new Audio();
    const onTime = () => setProgress({ cur: a.currentTime, dur: a.duration || 0 });
    const onEnd = () => { setPlaying(null); setProgress((p) => ({ ...p, cur: 0 })); };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onTime);
    a.addEventListener("ended", onEnd);
    audioRef.current = a;
    return () => {
      a.pause();
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onTime);
      a.removeEventListener("ended", onEnd);
    };
  }, []);

  const stopAudio = () => {
    audioRef.current?.pause();
    setPlaying(null);
    setLoadedKey(null);
  };

  useEffect(() => {
    if (!open) stopAudio();
  }, [open]);

  const busy = uploading || !!removing;
  const pending = Object.keys(files).length;

  const close = (didChange = changed) => {
    if (busy) return;
    stopAudio();
    onClose(didChange);
  };

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && !Swal.isVisible() && close();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  });

  if (!open) return null;

  const toggle = (key, url) => {
    const a = audioRef.current;
    if (!a) return;
    if (playing === key) { a.pause(); setPlaying(null); return; }
    if (loadedKey !== key) {
      a.src = url;
      setLoadedKey(key);
      setProgress({ cur: 0, dur: 0 });
    }
    a.play().then(() => setPlaying(key)).catch(() => setPlaying(null));
  };

  const seek = (e) => {
    const a = audioRef.current;
    if (!a || !a.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * a.duration;
  };

  const pick = (name, file) => {
    if (!file) return;
    if (!ALLOWED.test(file.name)) {
      setErrors((p) => ({ ...p, [name]: "Use an MP3 or WAV file" }));
      return;
    }
    if (file.size > MAX_MB * 1048576) {
      setErrors((p) => ({ ...p, [name]: `Keep it under ${MAX_MB} MB` }));
      return;
    }
    if (loadedKey === name) stopAudio();
    setErrors((p) => ({ ...p, [name]: undefined }));
    setFiles((p) => ({ ...p, [name]: file }));
  };

  const unpick = (name) => {
    if (loadedKey === name) stopAudio();
    setFiles((p) => {
      const next = { ...p };
      delete next[name];
      return next;
    });
  };

  const current = (name) => (removed[name] ? null : campaign?.[name]);

  const handleUpdate = async () => {
    if (!pending) return;
    const formData = new FormData();
    Object.entries(campaign).forEach(([key, value]) => {
      if (value !== null && value !== undefined && !removed[key]) formData.append(key, value);
    });
    Object.entries(files).forEach(([key, file]) => { if (file) formData.set(key, file); });

    try {
      setUploading(true);
      stopAudio();
      await axios.put(`${API()}/campaigns/editCampaign/${campaign.compaign_id}`, formData, {
        headers: { "Content-Type": "multipart/form-data", ...authHeader() },
      });
      toast("success", pending === 1 ? "Audio file saved" : `${pending} audio files saved`);
      setUploading(false);
      onClose(true);
    } catch (error) {
      console.error("IVR update failed:", error);
      setUploading(false);
      swal({ icon: "error", title: "Upload failed", text: "The audio files couldn't be saved. Please try again." });
    }
  };

  const afterRemove = async () => {
    setChanged(true);
    // Optional; older callers passed nothing here, which used to make every
    // successful delete show "Failed to remove".
    if (typeof refreshCampaign === "function") {
      try { await refreshCampaign(campaign.compaign_id); } catch { /* page refetches on close */ }
    }
  };

  const handleRemoveAll = async () => {
    const result = await swal({
      title: "Remove all audio?",
      text: `All IVR and music files for ${campaign?.compaignname || "this campaign"} will be deleted.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Remove all",
      confirmButtonColor: "#dc2626",
    });
    if (!result.isConfirmed) return;
    try {
      setRemoving("all");
      stopAudio();
      await axios.put(`${API()}/campaigns/clearIvr/${campaign.compaign_id}`, {}, { headers: authHeader() });
      setRemoved(Object.fromEntries(IVR_FIELDS.map((f) => [f.name, true])));
      setFiles({});
      await afterRemove();
      toast("success", "All audio removed");
    } catch (err) {
      console.error(err);
      swal({ icon: "error", title: "Couldn't remove", text: "Failed to remove the audio files." });
    } finally {
      setRemoving(null);
    }
  };

  const handleRemoveSingle = async (fieldName, label) => {
    const result = await swal({
      title: `Delete ${label}?`,
      text: "This audio file will be permanently removed.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#dc2626",
    });
    if (!result.isConfirmed) return;
    try {
      setRemoving(fieldName);
      if (loadedKey === fieldName) stopAudio();
      await axios.put(`${API()}/campaigns/removeSingleIvr/${campaign.compaign_id}`, { field: fieldName }, { headers: authHeader() });
      setRemoved((p) => ({ ...p, [fieldName]: true }));
      await afterRemove();
      toast("success", `${label} removed`);
    } catch (err) {
      console.error(err);
      swal({ icon: "error", title: "Couldn't remove", text: `Failed to remove ${label}.` });
    } finally {
      setRemoving(null);
    }
  };

  const uploadedCount = IVR_FIELDS.filter((f) => !isEmpty(current(f.name))).length;

  return (
    <div className="cpm-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="cpm-modal cpm-modal--xl" role="dialog" aria-modal="true" aria-labelledby="cpi-title">
        <div className="cpm-head">
          <div className="cpm-head__main">
            <span className="cpm-badge"><Music2 size={17} /></span>
            <div className="cpm-head__text">
              <span className="cpm-eyebrow">Manage IVRs</span>
              <h3 id="cpi-title" title={campaign?.compaignname}>{campaign?.compaignname || "Campaign"}</h3>
              <p className="cpm-sub">
                {uploadedCount} of {IVR_FIELDS.length} uploaded. MP3 or WAV, up to {MAX_MB} MB each.
              </p>
            </div>
          </div>
          <button type="button" className="cpm-x" onClick={() => close()} aria-label="Close" disabled={busy}>
            <X size={16} />
          </button>
        </div>

        {(uploading || removing) && <div className="cpm-loader"><i /></div>}

        {!campaign ? (
          <div className="cpm-body"><p className="cpv-empty">Loading campaign details...</p></div>
        ) : (
          <div className="cpm-body">
            <div className="cpi-grid">
              {IVR_FIELDS.map((field) => {
                const saved = current(field.name);
                const picked = files[field.name];
                const url = picked ? previews[field.name] : audioUrl(saved);
                const isPlaying = playing === field.name;
                const isLoaded = loadedKey === field.name;
                const pct = isLoaded && progress.dur ? (progress.cur / progress.dur) * 100 : 0;
                const state = picked ? "new" : saved ? "ok" : "none";
                return (
                  <div className={`cpi-card is-${state}${errors[field.name] ? " is-invalid" : ""}`} key={field.name}>
                    <div className="cpi-card__head">
                      <div>
                        <strong>{field.label}</strong>
                        <span>{field.help}</span>
                      </div>
                      {state === "new" ? (
                        <span className="cpm-badge-sm is-new">New</span>
                      ) : state === "ok" ? (
                        <span className="cpm-badge-sm is-ok">Uploaded</span>
                      ) : (
                        <span className="cpm-badge-sm">Empty</span>
                      )}
                    </div>

                    <div className="cpi-file">
                      {url ? (
                        <button type="button" className="cpm-play" onClick={() => toggle(field.name, url)} aria-label={isPlaying ? "Pause" : "Play"}>
                          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                        </button>
                      ) : (
                        <span className="cpm-play is-off"><FileAudio size={14} /></span>
                      )}
                      <div className="cpi-file__body">
                        <span className="cpi-file__name" title={picked ? picked.name : fileName(saved)}>
                          {picked ? picked.name : saved ? fileName(saved) : "No audio yet"}
                        </span>
                        {isLoaded ? (
                          <div className="cpm-progress">
                            <button type="button" className="cpm-progress__bar" onClick={seek} aria-label="Seek"><i style={{ width: `${pct}%` }} /></button>
                            <span>{fmtTime(progress.cur)}</span>
                          </div>
                        ) : (
                          <span className="cpi-file__meta">
                            {picked ? `${fmtSize(picked.size)}, not saved yet` : saved ? "Saved on the server" : "Choose a file below"}
                          </span>
                        )}
                      </div>
                    </div>

                    {errors[field.name] && <em className="cpm-error"><AlertCircle size={12} /> {errors[field.name]}</em>}

                    <div className="cpi-card__actions">
                      <label className={`cp-btn cp-btn--ghost cpi-upload${busy ? " is-disabled" : ""}`}>
                        <Upload size={14} />
                        {picked ? "Choose another" : saved ? "Replace" : "Upload"}
                        <input
                          type="file"
                          accept=".wav,.mp3,audio/wav,audio/mpeg"
                          disabled={busy}
                          onChange={(e) => { pick(field.name, e.target.files[0]); e.target.value = ""; }}
                        />
                      </label>
                      {picked ? (
                        <button type="button" className="cpm-icon" onClick={() => unpick(field.name)} title="Undo, keep the current file" disabled={busy}>
                          <RotateCcw size={14} />
                        </button>
                      ) : saved ? (
                        <button
                          type="button"
                          className="cpm-icon cpm-icon--danger"
                          onClick={() => handleRemoveSingle(field.name, field.label)}
                          title={`Delete ${field.label}`}
                          disabled={busy}
                        >
                          {removing === field.name ? <Loader2 size={14} className="cpm-spin" /> : <Trash2 size={14} />}
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="cpm-foot">
          <button
            type="button"
            className="cp-btn cpm-btn--danger-ghost"
            onClick={handleRemoveAll}
            disabled={busy || uploadedCount === 0}
            title={uploadedCount ? "Remove every audio file" : "Nothing to remove"}
          >
            <Trash2 size={14} /> Remove all
          </button>
          <span className="cpm-foot__spacer" />
          <span className="cpm-foot__note">
            {pending ? `${pending} file${pending > 1 ? "s" : ""} ready to upload` : ""}
          </span>
          <button type="button" className="cp-btn cp-btn--ghost" onClick={() => close()} disabled={busy}>
            {changed && !pending ? "Done" : "Cancel"}
          </button>
          <button type="button" className="cp-btn cp-btn--primary" disabled={busy || !pending} onClick={handleUpdate}>
            {uploading ? <><Loader2 size={15} className="cpm-spin" /> Saving</> : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default IVRDialog;