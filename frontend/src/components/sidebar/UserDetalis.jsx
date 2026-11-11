import { useState } from "react";
import "./UserDetailsTabs.css";
import DateFilterComponent from "../datatable/Agent_Break";
import AgentReport from "../datatable/AgentReport";
import LoginReport from "../datatable/LoginReport";

const Svg = ({ children }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

const TABS = [
  {
    key: "breaks",
    label: "Agent Breaks",
    hint: "Break time per agent",
    tone: "amber",
    Component: DateFilterComponent,
    icon: (
      <Svg>
        <path d="M17 8h1a4 4 0 010 8h-1" />
        <path d="M3 8h14v9a4 4 0 01-4 4H7a4 4 0 01-4-4V8z" />
        <line x1="6" y1="2" x2="6" y2="4" />
        <line x1="10" y1="2" x2="10" y2="4" />
        <line x1="14" y1="2" x2="14" y2="4" />
      </Svg>
    ),
  },
  {
    key: "agent",
    label: "Agent Report",
    hint: "Calls and talk time per agent",
    tone: "primary",
    Component: AgentReport,
    icon: (
      <Svg>
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </Svg>
    ),
  },
  {
    key: "login",
    label: "Login Report",
    hint: "Login and logout sessions",
    tone: "good",
    Component: LoginReport,
    icon: (
      <Svg>
        <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" />
        <polyline points="10 17 15 12 10 7" />
        <line x1="15" y1="12" x2="3" y2="12" />
      </Svg>
    ),
  },
];

const UserDetailsTabs = () => {
  const [activeTab, setActiveTab] = useState(0);
  const tab = TABS[activeTab];
  const Active = tab.Component;

  // arrow keys move between tabs, like a normal tab list
  const onKeyDown = (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (activeTab + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length;
    setActiveTab(next);
    document.getElementById(`ur-tab-${TABS[next].key}`)?.focus();
  };

  return (
    <div className="ur-page">
      {/* Header */}
      <div className="ur-header">
        <div>
          <h1 className="ur-title">User Activity Reports</h1>
          <p className="ur-subtitle">Monitor agent breaks, performance and login sessions.</p>
        </div>
      </div>

      {/* One card: report picker on top, report below */}
      <div className="ur-card">
        <div className="ur-tabs" role="tablist" aria-label="User activity reports" onKeyDown={onKeyDown}>
          {TABS.map((t, idx) => {
            const on = activeTab === idx;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`ur-tab-${t.key}`}
                aria-selected={on}
                aria-controls="ur-panel"
                tabIndex={on ? 0 : -1}
                className={`ur-tab ur-tone--${t.tone}${on ? " is-active" : ""}`}
                onClick={() => setActiveTab(idx)}
              >
                <span className="ur-tab__icon">{t.icon}</span>
                <span className="ur-tab__text">
                  <span className="ur-tab__label">{t.label}</span>
                  <span className="ur-tab__hint">{t.hint}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="ur-panel" key={tab.key} id="ur-panel" role="tabpanel" aria-labelledby={`ur-tab-${tab.key}`}>
          <Active />
        </div>
      </div>
    </div>
  );
};

export default UserDetailsTabs;