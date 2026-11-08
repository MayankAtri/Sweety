import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  Droplet,
  History,
  LayoutDashboard,
  LogOut,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import {
  api,
  formatDate,
  slotLabel,
  SLOTS,
  validDate,
  trapDialogFocus,
} from "./lib.js";
import AuthScreen from "./components/AuthScreen.jsx";
import ReadingDialog from "./components/ReadingDialog.jsx";
import DailyView from "./components/DailyView.jsx";
import DateNavigation from "./components/DateNavigation.jsx";
const ReportsView = lazy(() => import("./components/ReportsView.jsx"));
import HistoryView from "./components/HistoryView.jsx";
const DoctorView = lazy(() => import("./components/DoctorView.jsx"));

function DeleteDialog({ reading, onClose, onConfirm }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    ref.current.showModal();
  }, []);
  return (
    <dialog
      className="dialog"
      ref={ref}
      onKeyDown={trapDialogFocus}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      aria-labelledby="delete-title"
    >
      <div className="dialog-heading">
        <h2 id="delete-title">Delete this reading?</h2>
        <button
          className="icon-button"
          aria-label="Close delete confirmation"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <p className="muted">
        {slotLabel(reading.slot)} on {formatDate(reading.date)} ·{" "}
        {reading.value} mg/dl
      </p>
      <p>
        This reading will be removed from your reports. This cannot be undone.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button
          className="button secondary"
          autoFocus
          disabled={busy}
          onClick={onClose}
        >
          Keep reading
        </button>
        <button
          className="button danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await onConfirm();
            } catch (err) {
              setError(err.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Deleting…" : "Delete reading"}
        </button>
      </div>
    </dialog>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState(null);
  const [boot, setBoot] = useState(true);
  const [bootError, setBootError] = useState("");
  const [bootVersion, setBootVersion] = useState(0);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [date, setDate] = useState("");
  const [view, setView] = useState("daily");
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [dateError, setDateError] = useState("");
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const requestKey = `${user?.id}/${view}/${view === "history" ? `history/${page}` : `reports/${date}`}/${version}`;
  const data = result?.key === requestKey ? result.data : null;
  const expire = useCallback(() => {
    setUser(null);
    setResult(null);
    setEditing(null);
    setDeleting(null);
    setNotice("Your session has expired. Please log in again.");
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setBoot(true);
    setBootError("");
    Promise.all([
      api("/config", { signal: controller.signal }),
      api("/auth/me", { signal: controller.signal }).catch((error) => {
        if (error.status === 401) return { user: null };
        throw error;
      }),
    ])
      .then(([config, session]) => {
        if (controller.signal.aborted) return;
        setSettings(config);
        setDate(config.today);
        setUser(session.user);
      })
      .catch((error) => {
        if (!controller.signal.aborted && error.name !== "AbortError")
          setBootError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBoot(false);
      });
    return () => controller.abort();
  }, [bootVersion]);

  useEffect(() => {
    if (!user || user.role === "doctor" || !date) return;
    const controller = new AbortController();
    setLoadError("");
    const path =
      view === "history"
        ? `/readings?page=${page}&limit=12`
        : `/reports?date=${date}`;
    const request =
      view === "reports"
        ? Promise.all([
            api(path, { signal: controller.signal }),
            api(`/trends?date=${date}`, { signal: controller.signal }),
          ]).then(([reports, trend]) => ({ ...reports, trend }))
        : api(path, { signal: controller.signal });
    request
      .then((response) => {
        if (!controller.signal.aborted)
          setResult({ key: requestKey, data: response });
      })
      .catch((error) => {
        if (controller.signal.aborted || error.name === "AbortError") return;
        if (error.status === 401) expire();
        else setLoadError(error.message);
      });
    return () => controller.abort();
  }, [requestKey, user, date, view, page]);

  // Refresh the server's calendar day after midnight or returning to the app.
  useEffect(() => {
    if (!settings) return;
    const refreshToday = () => {
      if (document.visibilityState === "visible")
        api("/config")
          .then(setSettings)
          .catch(() => {});
    };
    const timer = setInterval(refreshToday, 60_000);
    document.addEventListener("visibilitychange", refreshToday);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshToday);
    };
  }, [Boolean(settings)]);

  function changeDate(value) {
    if (!validDate(value)) {
      setDateError("Please select a valid date.");
      return;
    }
    if (value > settings.today) {
      setDateError("Date cannot be in the future.");
      return;
    }
    setDateError("");
    setDate(value);
    setNotice("");
  }
  async function saveReading(body) {
    try {
      await api(
        editing?.reading ? `/readings/${editing.reading.id}` : "/readings",
        { method: editing?.reading ? "PUT" : "POST", body },
      );
      setEditing(null);
      setDate(body.date);
      setDateError("");
      setVersion((value) => value + 1);
      setNotice("Reading saved. Your reports are up to date.");
    } catch (error) {
      if (error.status === 401) expire();
      throw error;
    }
  }
  async function deleteReading() {
    try {
      await api(`/readings/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      if (view === "history" && data?.readings.length === 1 && page > 1)
        setPage(page - 1);
      setVersion((value) => value + 1);
      setNotice("Reading deleted. Your reports are up to date.");
    } catch (error) {
      if (error.status === 401) expire();
      throw error;
    }
  }
  const onEdit = (reading) => {
    setNotice("");
    setEditing({ reading, date: reading.date, slot: reading.slot });
  };
  const onAdd = (slot) => {
    setNotice("");
    setEditing({ reading: null, date, slot });
  };
  const navigate = (next) => {
    setView(next);
    setPage(1);
    setNotice("");
    setActionError("");
    setDateError("");
    setLoadError("");
  };

  if (boot)
    return (
      <main className="boot-screen">
        <Droplet size={34} />
        <h1>Sweety</h1>
        <p role="status">Getting things ready…</p>
      </main>
    );
  if (bootError)
    return (
      <main className="boot-screen">
        <Droplet size={34} />
        <h1>Let’s reconnect.</h1>
        <p role="alert">{bootError}</p>
        <button
          className="button"
          onClick={() => setBootVersion((value) => value + 1)}
        >
          Try again
        </button>
      </main>
    );
  if (!user)
    return (
      <AuthScreen
        notice={notice}
        onAuthenticated={(account) => {
          setUser(account);
          setView("daily");
          setPage(1);
          setDate(settings.today);
          setNotice("");
          setResult(null);
        }}
      />
    );
  const title = {
    daily: "A moment for your daily record.",
    reports: "A clearer picture",
    history: "Your reading history",
  }[view];
  const isDoctor = user.role === "doctor";
  const navItems = isDoctor
    ? [["daily", "Patients", LayoutDashboard]]
    : [
        ["daily", "Overview", LayoutDashboard],
        ["reports", "Reports", ChartNoAxesCombined],
        ["history", "History", History],
      ];
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <a
          href="#"
          className="brand"
          onClick={(event) => {
            event.preventDefault();
            navigate("daily");
          }}
        >
          <span className="brand-mark">
            <Droplet size={23} strokeWidth={1.8} />
          </span>
          Sweety<span className="brand-dot">.</span>
        </a>

        <nav aria-label="Main navigation">
          {navItems.map(([key, label, Icon]) => (
            <button
              key={key}
              className={`nav-item ${view === key ? "active" : ""}`}
              aria-current={view === key ? "page" : undefined}
              onClick={() => navigate(key)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {view === key && <span className="nav-indicator" />}
            </button>
          ))}
        </nav>
        <details className="account-menu">
          <summary aria-label={`Account menu for ${user.name}`}>
            <span className="avatar">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="account-name">{user.name}</span>
            <ChevronDown size={16} aria-hidden="true" />
          </summary>
          <div className="account-popover">
            <div className="account">
              <span className="avatar">
                {user.name.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <strong>{user.name}</strong>
                <span>{user.email}</span>
              </div>
            </div>
            <button
              className="logout"
              disabled={loggingOut}
              onClick={async () => {
                setLoggingOut(true);
                setActionError("");
                try {
                  await api("/auth/logout", { method: "POST" });
                  setUser(null);
                  setResult(null);
                  setNotice("You’ve been logged out.");
                } catch (error) {
                  setActionError(error.message);
                } finally {
                  setLoggingOut(false);
                }
              }}
            >
              <LogOut size={17} />
              {loggingOut ? "Logging out…" : "Log out"}
            </button>
          </div>
        </details>
      </header>
      <main id="main" className="workspace">
        {isDoctor ? (
          <>
            {actionError && (
              <p className="form-error" role="alert">
                {actionError}
              </p>
            )}
            <Suspense
              fallback={
                <p className="loading-panel" role="status">
                  Loading doctor workspace…
                </p>
              }
            >
              <DoctorView
                key={user.id}
                userId={user.id}
                date={date}
                today={settings.today}
                onDateChange={changeDate}
                dateError={dateError}
                onExpired={expire}
              />
            </Suspense>
          </>
        ) : (
          <>
            <header className="page-header">
              <div>
                <p className="eyebrow">
                  {view === "daily"
                    ? formatDate(date, { weekday: "long", month: "long" })
                    : "Your glucose journal"}
                </p>
                <h1>{title}</h1>
                <p className="muted">
                  {view === "daily"
                    ? "Record the number shown on your glucose meter."
                    : view === "reports"
                      ? "Your readings, summarized over time."
                      : "Your readings, organized by date."}
                </p>
              </div>
              {view !== "daily" && (
                <button
                  className="button"
                  onClick={() =>
                    onAdd(
                      SLOTS.find(
                        (item) =>
                          !data?.daily?.readings?.some(
                            (reading) => reading.slot === item.value,
                          ),
                      )?.value || "morning",
                    )
                  }
                >
                  <Plus size={18} />
                  Add reading
                </button>
              )}
            </header>
            {actionError && (
              <p className="form-error" role="alert">
                {actionError}
              </p>
            )}
            {notice && (
              <div className="notice" role="status">
                <Check size={17} />
                <span>{notice}</span>
                <button
                  className="icon-button"
                  aria-label="Dismiss notification"
                  onClick={() => setNotice("")}
                >
                  <X size={16} />
                </button>
              </div>
            )}
            {view !== "history" && (
              <DateNavigation
                date={date}
                today={settings.today}
                onChange={changeDate}
              />
            )}
            {dateError && (
              <p className="form-error" role="alert">
                {dateError}
              </p>
            )}
            {loadError ? (
              <div className="empty-state error-state" role="alert">
                <h2>We couldn’t load your readings.</h2>
                <p>{loadError}</p>
                <button
                  className="button secondary"
                  onClick={() => setVersion((value) => value + 1)}
                >
                  <RefreshCw size={17} />
                  Try again
                </button>
              </div>
            ) : !data ? (
              <div className="loading-panel" role="status">
                <span className="loading-dot" />
                Loading your {view === "history" ? "history" : "readings"}…
              </div>
            ) : view === "daily" ? (
              <DailyView
                key={`${user.id}/${date}/${version}`}
                report={data.daily}
                date={date}
                onSave={saveReading}
                onEdit={onEdit}
                onDelete={setDeleting}
              />
            ) : view === "reports" ? (
              <Suspense
                fallback={
                  <div className="loading-panel" role="status">
                    Loading reports…
                  </div>
                }
              >
                <ReportsView reports={data} trend={data.trend} />
              </Suspense>
            ) : (
              <HistoryView
                data={data}
                onPage={setPage}
                onEdit={onEdit}
                onDelete={setDeleting}
                loading={false}
              />
            )}
          </>
        )}
        <footer className="workspace-footer">
          <span>
            <Droplet size={13} />
            {isDoctor
              ? "Sweety · Assigned-patient reports"
              : user.email === "demo@sweety.example"
                ? "Demo account · Sample readings"
                : "Sweety · Your private glucose journal"}
          </span>
          <span>Dates follow {settings.timeZone.replaceAll("_", " ")}</span>
        </footer>
      </main>
      {!isDoctor && editing && (
        <ReadingDialog
          reading={editing.reading}
          date={editing.date}
          slot={editing.slot}
          today={settings.today}
          onClose={() => setEditing(null)}
          onSave={saveReading}
        />
      )}
      {!isDoctor && deleting && (
        <DeleteDialog
          reading={deleting}
          onClose={() => setDeleting(null)}
          onConfirm={deleteReading}
        />
      )}
    </div>
  );
}
