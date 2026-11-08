import { CalendarDays, CalendarRange, Calendar } from "lucide-react";
import MonthlyChart from "./MonthlyChart.jsx";
import { average, formatDate } from "../lib.js";

const periods = [
  {
    key: "daily",
    title: "Daily",
    description: "Your selected day",
    Icon: Calendar,
  },
  {
    key: "monthToDate",
    title: "Month to date",
    description: "From the first day through your selected date",
    Icon: CalendarDays,
  },
  {
    key: "monthly",
    title: "Previous month",
    description: "The full month before your selected date",
    Icon: CalendarRange,
  },
];

export default function ReportsView({ reports, trend }) {
  return (
    <section aria-labelledby="reports-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">The bigger picture</p>
          <h2 id="reports-title">Your reports</h2>
          <p className="muted">
            A clear summary of the readings you’ve recorded.
          </p>
        </div>
      </div>
      <div className="report-grid">
        {periods.map(({ key, title, description, Icon }) => {
          const report = reports[key];
          return (
            <article
              className="report-card"
              key={key}
              aria-labelledby={`report-${key}`}
            >
              <div className="report-topline">
                <Icon size={22} strokeWidth={1.5} aria-hidden="true" />
                <span className="reading-count">
                  {report.count} {report.count === 1 ? "reading" : "readings"}
                </span>
              </div>
              <h3 id={`report-${key}`}>{title}</h3>
              <p className="report-date">
                {report.startDate === report.endDate
                  ? formatDate(report.startDate)
                  : `${formatDate(report.startDate)} – ${formatDate(report.endDate)}`}
              </p>
              <p className="muted report-description">{description}</p>
              <div className="report-average">
                <span className="muted">Average glucose</span>
                <p className="reading-value">
                  {average(report.average)}
                  <span>mg/dl</span>
                </p>
              </div>
              <dl className="report-stats">
                <div>
                  <dt>Highest</dt>
                  <dd>
                    {report.highest ?? "—"} <span>mg/dl</span>
                  </dd>
                </div>
                <div>
                  <dt>Lowest</dt>
                  <dd>
                    {report.lowest ?? "—"} <span>mg/dl</span>
                  </dd>
                </div>
              </dl>
              {report.count === 0 && (
                <p className="muted report-empty">
                  No readings in this period yet.
                </p>
              )}
            </article>
          );
        })}
      </div>
      <MonthlyChart trend={trend} />
      <p className="muted report-footnote">
        All reports follow the selected date. Averages are rounded to one
        decimal place.
      </p>
    </section>
  );
}
