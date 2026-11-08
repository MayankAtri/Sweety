import { lazy, Suspense, useEffect, useState } from "react";
import { RefreshCw, Users } from "lucide-react";
import { api, formatDate, SLOTS } from "../lib.js";
import DateNavigation from "./DateNavigation.jsx";
import "./doctor.css";

const ReportsView = lazy(() => import("./ReportsView.jsx"));

export default function DoctorView({
  userId,
  date,
  today,
  onDateChange,
  dateError,
  onExpired,
}) {
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [listResult, setListResult] = useState(null);
  const [listError, setListError] = useState("");
  const [patientId, setPatientId] = useState("");
  const [reportResult, setReportResult] = useState(null);
  const [reportError, setReportError] = useState("");
  const listKey = `${userId}/${page}/${version}`;
  const list = listResult?.key === listKey ? listResult.data : null;
  const patient = list?.patients.find((item) => item.id === patientId);
  const reportKey = `${userId}/${patient?.id}/${date}/${version}`;
  const data = reportResult?.key === reportKey ? reportResult.data : null;

  useEffect(() => {
    const controller = new AbortController();
    setListError("");
    api(`/doctor/patients?page=${page}&limit=12`, { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        if (!response.patients.length && page > 1 && response.total > 0) {
          setPage(Math.ceil(response.total / 12));
          return;
        }
        setListResult({ key: listKey, data: response });
        setPatientId((current) =>
          response.patients.some((item) => item.id === current) ? current : "",
        );
      })
      .catch((error) => {
        if (controller.signal.aborted || error.name === "AbortError") return;
        if (error.status === 401) onExpired();
        else setListError(error.message);
      });
    return () => controller.abort();
  }, [userId, page, version, listKey, onExpired]);

  useEffect(() => {
    if (!patient) return;
    const controller = new AbortController();
    setReportError("");
    const path = `/doctor/patients/${patient.id}`;
    Promise.all([
      api(`${path}/reports?date=${date}`, { signal: controller.signal }),
      api(`${path}/trends?date=${date}`, { signal: controller.signal }),
    ])
      .then(([reports, trend]) => {
        if (!controller.signal.aborted)
          setReportResult({ key: reportKey, data: { reports, trend } });
      })
      .catch((error) => {
        if (controller.signal.aborted || error.name === "AbortError") return;
        if (error.status === 401) onExpired();
        else setReportError(error.message);
      });
    return () => controller.abort();
  }, [patient?.id, date, version, reportKey, onExpired]);

  const refresh = () => {
    setReportResult(null);
    setVersion((value) => value + 1);
  };
  return (
    <div className="doctor-workspace">
      <header className="page-header">
        <div>
          <p className="eyebrow">Doctor workspace · Read only</p>
          <h1>Your assigned patients</h1>
          <p className="muted">
            Review recorded readings and reports for patients assigned to you.
          </p>
        </div>
        <button className="button secondary" onClick={refresh}>
          <RefreshCw size={17} aria-hidden="true" />
          Refresh
        </button>
      </header>
      {listError ? (
        <div className="empty-state" role="alert">
          <h2>We couldn’t load your patients.</h2>
          <p>{listError}</p>
          <button className="button secondary" onClick={refresh}>
            Try again
          </button>
        </div>
      ) : !list ? (
        <p className="loading-panel" role="status">
          Loading assigned patients…
        </p>
      ) : !list.total ? (
        <div className="empty-state">
          <Users size={30} aria-hidden="true" />
          <h2>No assigned patients yet</h2>
          <p>
            Patients will appear here when an administrator assigns them to your
            account.
          </p>
        </div>
      ) : (
        <>
          <section
            className="doctor-patient-picker"
            aria-label="Assigned patients"
          >
            <div className="field">
              <label htmlFor="doctor-patient">Patient</label>
              <select
                id="doctor-patient"
                value={patientId}
                onChange={(event) => {
                  setPatientId(event.target.value);
                  setReportError("");
                }}
              >
                <option value="">Choose a patient</option>
                {list.patients.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="doctor-list-pages">
              <p className="muted">
                {list.total} assigned{" "}
                {list.total === 1 ? "patient" : "patients"}
              </p>
              <nav
                className="pagination-controls"
                aria-label="Assigned patient pages"
              >
                <button
                  className="button secondary small"
                  disabled={page <= 1}
                  onClick={() => {
                    setPatientId("");
                    setPage(page - 1);
                  }}
                >
                  Previous
                </button>
                <span className="page-count">
                  Page {page} of {Math.max(1, Math.ceil(list.total / 12))}
                </span>
                <button
                  className="button secondary small"
                  disabled={page * 12 >= list.total}
                  onClick={() => {
                    setPatientId("");
                    setPage(page + 1);
                  }}
                >
                  Next
                </button>
              </nav>
            </div>
          </section>
          {!patient ? (
            <div className="empty-state">
              <h2>Choose a patient to view their reports</h2>
              <p>
                Only assigned patients are available. Readings can be changed by
                the patient in their own account.
              </p>
            </div>
          ) : (
            <section aria-label={`Reports for ${patient.name}`}>
              <div className="doctor-patient-heading">
                <div>
                  <p className="eyebrow">Selected patient</p>
                  <h2>{patient.name}</h2>
                  <p className="muted">{patient.email}</p>
                </div>
                <span className="reading-count">Read-only access</span>
              </div>
              <DateNavigation
                date={date}
                today={today}
                onChange={onDateChange}
              />
              {dateError && (
                <p role="alert" className="form-error">
                  {dateError}
                </p>
              )}
              {reportError ? (
                <div className="empty-state" role="alert">
                  <h2>Reports are unavailable.</h2>
                  <p>{reportError}</p>
                  <button className="button secondary" onClick={refresh}>
                    Refresh access and retry
                  </button>
                </div>
              ) : !data ? (
                <p className="loading-panel" role="status">
                  Loading patient reports…
                </p>
              ) : (
                <>
                  <section
                    className="doctor-daily"
                    aria-labelledby="doctor-daily-title"
                  >
                    <div className="section-heading">
                      <h2 id="doctor-daily-title">
                        Readings for {formatDate(date)}
                      </h2>
                      <span className="reading-count">
                        {data.reports.daily.count} of 4 recorded
                      </span>
                    </div>
                    <div className="table-wrap">
                      <table className="history-table">
                        <caption className="sr-only">
                          Selected patient daily readings
                        </caption>
                        <thead>
                          <tr>
                            <th scope="col">Time slot</th>
                            <th scope="col">Glucose</th>
                          </tr>
                        </thead>
                        <tbody>
                          {SLOTS.map((slot) => {
                            const reading = data.reports.daily.readings.find(
                              (item) => item.slot === slot.value,
                            );
                            return (
                              <tr key={slot.value}>
                                <th scope="row">{slot.label}</th>
                                <td>
                                  {reading ? (
                                    <>
                                      <strong>{reading.value}</strong>{" "}
                                      <span className="table-unit">mg/dl</span>
                                    </>
                                  ) : (
                                    <span className="muted">Not recorded</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                  <Suspense fallback={<p role="status">Loading reports…</p>}>
                    <ReportsView reports={data.reports} trend={data.trend} />
                  </Suspense>
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
