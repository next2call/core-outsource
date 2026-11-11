import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./ivr.css";
import axios from "axios";
import Swal from "sweetalert2";
import dayjs from "dayjs";
import AddDialog, { TYPES } from "./AddIVR";

const NA = "–";
const API = `https://${window.location.hostname}:4000`;
const backendBaseUrl = `${API}/ivr/`;
const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

/* ---------- inline SVG icons ---------- */
const S = ({ size = 16, children, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    {children}
  </svg>
);
const Icon = {
  Search: (p) => <S {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></S>,
  Plus: (p) => <S {...p}><path d="M12 5v14M5 12h14" /></S>,
  Edit: (p) => <S {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></S>,
  Trash: (p) => <S {...p}><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></S>,
  Close: (p) => <S {...p}><path d="M18 6 6 18M6 6l12 12" /></S>,
  Audio: (p) => <S {...p}><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></S>,
  Play: (p) => <S {...p}><polygon points="7 4 20 12 7 20 7 4" fill="currentColor" /></S>,
  Pause: (p) => <S {...p}><rect x="6" y="4" width="4" height="16" fill="currentColor" /><rect x="14" y="4" width="4" height="16" fill="currentColor" /></S>,
  Download: (p) => <S {...p}><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></S>,
  Refresh: (p) => <S {...p}><polyline points="23 4 23 10 17 10" /><path d="M20.5 15a9 9 0 1 1-2.1-9.4L23 10" /></S>,
  Hand: (p) => <S {...p}><path d="M7 11V7a2 2 0 1 1 4 0v4" /><path d="M11 10V5a2 2 0 1 1 4 0v5" /><path d="M15 10V7a2 2 0 1 1 4 0v7a7 7 0 0 1-7 7h-1a7 7 0 0 1-6-3.5L3 14a2 2 0 0 1 3.4-2l.6 1" /></S>,
  Moon: (p) => <S {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></S>,
  Hold: (p) => <S {...p}><path d="M3 14v-2a9 9 0 0 1 18 0v2" /><path d="M21 19a2 2 0 0 1-2 2h-1v-7h3z" /><path d="M3 19a2 2 0 0 0 2 2h1v-7H3z" /></S>,
  List: (p) => <S {...p}><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></S>,
  Chevron: (p) => <S size={15} {...p}><path d="m9 6 6 6-6 6" /></S>,
};

/* the three IVR types from AddIVR, with a colour and icon each */
const TYPE_META = {
  "welcome ivr": { label: "Welcome IVR", tone: "primary", icon: Icon.Hand },
  afteroffice: { label: "After office", tone: "amber", icon: Icon.Moon },
  moh: { label: "Music on hold", tone: "violet", icon: Icon.Hold },
};
const typeKey = (t) => String(t || "").trim().toLowerCase();
const typeMeta = (t) => TYPE_META[typeKey(t)] || { label: t || NA, tone: "muted", icon: Icon.Audio };

/* SweetAlert that follows the CRM theme (light / dark) */
const surface = () => {
  let node = document.querySelector(".iv-card") || document.body;
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
export const swal = (opts) => {
  const { bg, dark } = surface();
  return Swal.fire({
    background: dark ? bg : "#fff",
    color: dark ? "#e5e7eb" : "#1f2937",
    confirmButtonColor: "#4f46e5",
    cancelButtonColor: dark ? "#374151" : "#64748b",
    ...opts,
  });
};
const toast = (icon, title) =>
  swal({ toast: true, position: "top-end", showConfirmButton: false, timer: 3000, timerProgressBar: true, icon, title });

const fmtClock = (sec) => {
  if (!isFinite(sec) || sec < 0) return "0:00";
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
};
const shortName = (f = "") => String(f).split("/").pop();

/* ---------- page ---------- */
const IVRList = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [campaigns, setCampaigns] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editIVR, setEditIVR] = useState({ id: "", type: "", campaign_name: "", file_name: "", date: "" });

  /* one shared audio element for the whole table */
  const audioRef = useRef(null);
  if (!audioRef.current && typeof Audio !== "undefined") {
    audioRef.current = new Audio();
    audioRef.current.preload = "none";
  }
  const [playing, setPlaying] = useState({ id: null, on: false, t: 0, d: 0 });

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return undefined;
    const sync = () => setPlaying((p) => ({ ...p, t: a.currentTime || 0, d: isFinite(a.duration) ? a.duration : 0 }));
    const onPlay = () => setPlaying((p) => ({ ...p, on: true }));
    const onPause = () => setPlaying((p) => ({ ...p, on: false }));
    const onEnd = () => setPlaying((p) => ({ ...p, on: false, t: 0 }));
    const onErr = () => {
      if (a.src) toast("error", "This file could not be played");
      setPlaying({ id: null, on: false, t: 0, d: 0 });
    };
    a.addEventListener("timeupdate", sync);
    a.addEventListener("loadedmetadata", sync);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnd);
    a.addEventListener("error", onErr);
    return () => {
      a.pause();
      a.removeEventListener("timeupdate", sync);
      a.removeEventListener("loadedmetadata", sync);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("error", onErr);
    };
  }, []);

  const togglePlay = (row) => {
    const a = audioRef.current;
    if (!a || !row.file_name) return;
    if (playing.id === row.id) {
      if (a.paused) a.play().catch(() => {});
      else a.pause();
      return;
    }
    a.pause();
    a.src = `${backendBaseUrl}${row.file_name}`;
    setPlaying({ id: row.id, on: false, t: 0, d: 0 });
    a.play().catch((e) => console.error("Play failed:", e));
  };
  const seek = (e) => {
    const a = audioRef.current;
    if (!a || !playing.d) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * playing.d;
  };

  /* data */
  const fetchIVRs = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/ivrConverter`, { headers: authHeader() });
      setData(res.data || []);
      setError("");
    } catch (err) {
      console.error("Error fetching data", err);
      setError("An error occurred while fetching IVR files.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    fetchIVRs();
  }, [fetchIVRs]);

  useEffect(() => {
    axios
      .get(`${API}/campaigns_dropdown`, { headers: authHeader() })
      .then((res) => setCampaigns((res.data || []).map((c) => ({ id: String(c.compaign_id), label: c.compaignname }))))
      .catch((err) => console.error("Error fetching campaigns:", err));
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    await fetchIVRs();
    setRefreshing(false);
  };

  /* campaign_name may hold the campaign ID (from Create) or the name (from older edits) */
  const campaignOf = (v) => {
    if (!v) return null;
    const s = String(v);
    return campaigns.find((c) => c.id === s) || campaigns.find((c) => c.label === s) || { id: s, label: null };
  };

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return data.filter((r) => {
      if (typeFilter !== "all" && typeKey(r.type) !== typeFilter) return false;
      if (!q) return true;
      const camp = campaignOf(r.campaign_name);
      return [r.file_name, r.type, typeMeta(r.type).label, r.campaign_name, camp?.label, r.date]
        .some((v) => String(v || "").toLowerCase().includes(q));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, searchQuery, typeFilter, campaigns]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  useEffect(() => setPage(1), [searchQuery, pageSize, typeFilter]);
  const fromRow = filtered.length ? (currentPage - 1) * pageSize + 1 : 0;
  const toRow = Math.min(currentPage * pageSize, filtered.length);

  const counts = useMemo(() => {
    const c = { all: data.length, "welcome ivr": 0, afteroffice: 0, moh: 0 };
    data.forEach((r) => {
      const k = typeKey(r.type);
      if (k in c) c[k] += 1;
    });
    return c;
  }, [data]);

  /* actions */
  const handleDelete = (row) => {
    swal({
      title: `Delete ${shortName(row.file_name) || "this IVR"}?`,
      text: "The audio file will be removed. This can't be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Yes, delete it!",
      cancelButtonText: "Cancel",
    }).then(async (result) => {
      if (!result.isConfirmed) return;
      try {
        await axios.delete(`${API}/deleteIVR/${row.id}`, { headers: authHeader() });
        if (playing.id === row.id) {
          audioRef.current?.pause();
          setPlaying({ id: null, on: false, t: 0, d: 0 });
        }
        setData((prev) => prev.filter((i) => i.id !== row.id));
        toast("success", "IVR deleted successfully!");
      } catch (e) {
        console.error(e);
        toast("error", "Failed to delete IVR.");
      }
    });
  };

  const handleEdit = (row) => {
    // store the campaign as its ID, the same way Create does
    const camp = campaignOf(row.campaign_name);
    setEditIVR({ ...row, campaign_name: camp?.id || "" });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    try {
      await axios.put(
        `${API}/updateSpeech/${editIVR.id}`,
        { type: editIVR.type, campaign_name: editIVR.campaign_name },
        { headers: authHeader() }
      );
      setData((prev) => prev.map((i) => (i.id === editIVR.id ? { ...i, type: editIVR.type, campaign_name: editIVR.campaign_name } : i)));
      setEditDialogOpen(false);
      toast("success", "IVR updated successfully!");
    } catch (e) {
      console.error(e);
      toast("error", "Failed to update IVR.");
    }
  };

  const stats = [
    { key: "all", label: "Total IVR files", value: counts.all, tone: "primary", icon: Icon.Audio, sub: "audio prompts on the dialer" },
    { key: "welcome ivr", label: "Welcome IVR", value: counts["welcome ivr"], tone: "info", icon: Icon.Hand, sub: "played when a call connects" },
    { key: "afteroffice", label: "After office", value: counts.afteroffice, tone: "amber", icon: Icon.Moon, sub: "played outside working hours" },
    { key: "moh", label: "Music on hold", value: counts.moh, tone: "violet", icon: Icon.Hold, sub: "played while callers wait" },
  ];

  return (
    <div className="iv-page">
      {/* Header */}
      <div className="iv-header">
        <div>
          <h1 className="iv-title">IVR Converter</h1>
          <p className="iv-subtitle">Create text-to-speech prompts and manage IVR audio files.</p>
        </div>
        <div className="iv-actions">
          <label className="iv-search">
            <span className="iv-search__icon"><Icon.Search size={15} /></span>
            <input type="text" placeholder="Search file, type, campaign…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            {searchQuery && (
              <button type="button" className="iv-search__clear" onClick={() => setSearchQuery("")} title="Clear search">
                <Icon.Close size={13} />
              </button>
            )}
          </label>
          <button type="button" className={`iv-icon-btn${refreshing ? " is-spinning" : ""}`} onClick={refresh} title="Refresh">
            <Icon.Refresh size={15} />
          </button>
          <button type="button" className="iv-btn iv-btn--primary" onClick={() => setAddDialogOpen(true)}>
            <Icon.Plus size={16} strokeWidth={2.4} /> Create Speech
          </button>
        </div>
      </div>

      {/* Stats (click = filter by type) */}
      <div className="iv-stats">
        {stats.map((s) => (
          <button
            type="button"
            key={s.key}
            className={`iv-stat iv-tone--${s.tone}${typeFilter === s.key ? " is-active" : ""}`}
            onClick={() => setTypeFilter(s.key)}
            title={s.key === "all" ? "Show all files" : `Show only ${s.label}`}
          >
            <span className="iv-stat__top">
              <span className="iv-stat__label">{s.label}</span>
              <span className="iv-stat__icon"><s.icon size={16} /></span>
            </span>
            <span className="iv-stat__value">{loading ? <span className="iv-skel iv-skel--val" /> : s.value}</span>
            <span className="iv-stat__sub">{s.sub}</span>
          </button>
        ))}
      </div>

      {/* Table card */}
      <div className="iv-card">
        <div className="iv-card__head">
          <div className="iv-card__title">
            <span className="iv-card__icon"><Icon.List size={15} /></span>
            <h3>{typeFilter === "all" ? "All IVR files" : typeMeta(typeFilter).label}</h3>
            <span className="iv-count">{filtered.length}</span>
          </div>
          {typeFilter !== "all" && (
            <button type="button" className="iv-link" onClick={() => setTypeFilter("all")}>Show all</button>
          )}
        </div>

        {loading ? (
          <div className="iv-loading">
            {[0, 1, 2, 3].map((i) => (
              <div className="iv-loading__row" key={i}>
                <span className="iv-skel iv-skel--avatar" />
                <span className="iv-skel" style={{ width: "22%" }} />
                <span className="iv-skel" style={{ width: "12%" }} />
                <span className="iv-skel" style={{ width: "14%" }} />
                <span className="iv-skel" style={{ width: "10%", marginLeft: "auto" }} />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="iv-empty is-error">
            <span className="iv-empty__icon"><Icon.Close size={20} /></span>
            <strong>Could not load IVR files</strong>
            <span>{error}</span>
            <button type="button" className="iv-btn iv-btn--ghost" onClick={refresh}><Icon.Refresh size={15} /> Retry</button>
          </div>
        ) : pageRows.length === 0 ? (
          <div className="iv-empty">
            <span className="iv-empty__icon">{data.length ? <Icon.Search size={20} /> : <Icon.Audio size={20} />}</span>
            <strong>{data.length ? "No files match" : "No IVR files yet"}</strong>
            <span>{data.length ? "Try a different search or type." : "Type a message and pick a voice to create your first prompt."}</span>
            {data.length ? (
              <button type="button" className="iv-btn iv-btn--ghost" onClick={() => { setSearchQuery(""); setTypeFilter("all"); }}>Clear filters</button>
            ) : (
              <button type="button" className="iv-btn iv-btn--primary" onClick={() => setAddDialogOpen(true)}><Icon.Plus size={16} /> Create Speech</button>
            )}
          </div>
        ) : (
          <>
            <div className="iv-table-wrap">
              <table className="iv-table">
                <thead>
                  <tr>
                    <th className="iv-c-index">#</th>
                    <th>Audio file</th>
                    <th>Type</th>
                    <th>Campaign</th>
                    <th>Created</th>
                    <th className="iv-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row, idx) => {
                    const meta = typeMeta(row.type);
                    const camp = campaignOf(row.campaign_name);
                    const isCur = playing.id === row.id;
                    const pct = isCur && playing.d ? (playing.t / playing.d) * 100 : 0;
                    const url = row.file_name ? `${backendBaseUrl}${row.file_name}` : "";
                    return (
                      <tr key={row.id} className={isCur ? "is-playing" : ""}>
                        <td className="iv-c-index iv-muted iv-mono">{(currentPage - 1) * pageSize + idx + 1}</td>
                        <td className="iv-c-name">
                          {url ? (
                            <div className="iv-player">
                              <button
                                type="button"
                                className={`iv-player__btn${isCur && playing.on ? " is-on" : ""}`}
                                onClick={() => togglePlay(row)}
                                title={isCur && playing.on ? "Pause" : "Play"}
                              >
                                {isCur && playing.on ? <Icon.Pause size={12} /> : <Icon.Play size={12} />}
                              </button>
                              <div className="iv-player__body">
                                <span className="iv-player__name" title={row.file_name}>{shortName(row.file_name)}</span>
                                {isCur ? (
                                  <span className="iv-player__row">
                                    <span className="iv-player__bar" onClick={seek} role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.round(playing.d)} aria-valuenow={Math.round(playing.t)}>
                                      <i style={{ width: `${pct}%` }} />
                                    </span>
                                    <span className="iv-player__time">{fmtClock(playing.t)} / {fmtClock(playing.d)}</span>
                                  </span>
                                ) : (
                                  <span className="iv-player__hint">Click play to listen</span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="iv-muted">No file</span>
                          )}
                        </td>
                        <td data-label="Type">
                          <span className={`iv-type iv-tone--${meta.tone}`}><meta.icon size={13} />{meta.label}</span>
                        </td>
                        <td data-label="Campaign">
                          {camp ? (
                            <span className="iv-camp">
                              {camp.label && <span className="iv-camp__name">{camp.label}</span>}
                              <span className="iv-id">#{camp.id}</span>
                            </span>
                          ) : <span className="iv-dash">{NA}</span>}
                        </td>
                        <td data-label="Created">
                          {row.date ? (
                            <span className="iv-time">
                              <span>{dayjs(row.date).format("DD MMM YYYY")}</span>
                              <small>{dayjs(row.date).format("hh:mm a")}</small>
                            </span>
                          ) : <span className="iv-dash">{NA}</span>}
                        </td>
                        <td className="iv-c-actions">
                          <div className="iv-row-actions">
                            {url && (
                              <a className="iv-act" href={url} download={shortName(row.file_name)} target="_blank" rel="noopener noreferrer" title="Download">
                                <Icon.Download size={15} />
                              </a>
                            )}
                            <button type="button" className="iv-act" title="Edit" onClick={() => handleEdit(row)}>
                              <Icon.Edit size={15} />
                            </button>
                            <span className="iv-row-actions__sep" />
                            <button type="button" className="iv-act iv-act--danger" title="Delete" onClick={() => handleDelete(row)}>
                              <Icon.Trash size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="iv-pagination">
              <label className="iv-page-size">
                <span>Rows per page</span>
                <span className="iv-select">
                  <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                    {[10, 25, 50, 100].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </span>
              </label>
              <div className="iv-page-info">
                Showing <b>{fromRow}</b> to <b>{toRow}</b> of <b>{filtered.length}</b>
              </div>
              <div className="iv-page-nav">
                <button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} aria-label="Previous page">
                  <Icon.Chevron style={{ transform: "rotate(180deg)" }} />
                </button>
                <span className="iv-page-nav__cur">{currentPage} <i>/ {totalPages}</i></span>
                <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)} aria-label="Next page">
                  <Icon.Chevron />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Create speech */}
      <AddDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        campaigns={campaigns}
        onCreated={(row) => {
          // show the new file straight away, then sync with the server
          if (row && row.id != null) setData((prev) => [...prev, row]);
          fetchIVRs();
        }}
      />

      {/* Edit */}
      {editDialogOpen && (
        <EditModal
          ivr={editIVR}
          campaigns={campaigns}
          onClose={() => setEditDialogOpen(false)}
          onChange={(name, value) => setEditIVR((p) => ({ ...p, [name]: value }))}
          onSave={handleSaveEdit}
        />
      )}
    </div>
  );
};

/* ---------- Edit modal ---------- */
const EditModal = ({ ivr, campaigns, onClose, onChange, onSave }) => {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="iv-modal-backdrop" onClick={onClose}>
      <div className="iv-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Edit IVR">
        <div className="iv-modal__head">
          <div className="iv-modal__title">
            <span className="iv-modal__badge"><Icon.Edit size={16} /></span>
            <div>
              <h3>Assign speech</h3>
              <p title={ivr.file_name}>{shortName(ivr.file_name) || "Change the type or campaign of this file."}</p>
            </div>
          </div>
          <button type="button" className="iv-act" onClick={onClose} title="Close">
            <Icon.Close size={16} />
          </button>
        </div>

        <div className="iv-modal__body">
          <div className="iv-field">
            <span>IVR type</span>
            <div className="iv-choice iv-choice--3" role="radiogroup" aria-label="IVR type">
              {TYPES.map((t) => {
                const meta = typeMeta(t.value);
                const on = typeKey(ivr.type) === typeKey(t.value);
                return (
                  <button
                    key={t.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className={`iv-choice__opt iv-tone--${meta.tone}${on ? " is-on" : ""}`}
                    onClick={() => onChange("type", t.value)}
                  >
                    <span className="iv-choice__icon"><meta.icon size={15} /></span>
                    <b>{t.label}</b>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="iv-field">
            <span>Campaign</span>
            <select value={ivr.campaign_name || ""} onChange={(e) => onChange("campaign_name", e.target.value)}>
              <option value="">No campaign</option>
              {campaigns.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label} (#{o.id})
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="iv-modal__foot">
          <button type="button" className="iv-btn iv-btn--ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="iv-btn iv-btn--primary" onClick={onSave}>Save</button>
        </div>
      </div>
    </div>
  );
};

export default IVRList;