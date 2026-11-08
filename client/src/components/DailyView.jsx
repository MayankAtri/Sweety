import {
  Plus,
  Pencil,
  Trash2,
  Sun,
  Sunrise,
  Sunset,
  Moon,
  Check,
} from "lucide-react";
import { SLOTS, average, formatDate } from "../lib.js";

const slotIcons = [Sunrise, Sun, Sunset, Moon];

export default function DailyView({ report, date, onAdd, onEdit, onDelete }) {
  const readings = report.readings || [];
  return (
    <section aria-labelledby="daily-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Your daily log</p>
          <h2 id="daily-title">Daily readings</h2>
          <p className="muted">Four moments in your day. One simple record.</p>
        </div>
        <div
          className="daily-progress"
          aria-label={`${report.count} of 4 readings recorded`}
        >
          <span>
            <strong>{report.count}</strong> / 4 recorded
          </span>
          <div className="completion-track" aria-hidden="true">
            {SLOTS.map((slot) => (
              <span
                key={slot.value}
                className={
                  readings.some((r) => r.slot === slot.value) ? "complete" : ""
                }
              />
            ))}
          </div>
        </div>
      </div>

      <div className="slot-grid">
        {SLOTS.map((slot, index) => {
          const reading = readings.find((item) => item.slot === slot.value);
          const Icon = slotIcons[index];
          return (
            <article
              className={`slot-card${reading ? " recorded" : ""}`}
              key={slot.value}
              aria-labelledby={`slot-${slot.value}`}
            >
              <div className="slot-topline">
                <Icon size={23} strokeWidth={1.5} aria-hidden="true" />
                <span className="slot-number">0{index + 1}</span>
              </div>
              <h3 id={`slot-${slot.value}`}>{slot.short}</h3>
              <p className="muted slot-detail">
                {index === 0 ? "Fasting reading" : "After your meal"}
              </p>
              {reading ? (
                <>
                  <p className="reading-value">
                    {reading.value}
                    <span>mg/dl</span>
                  </p>
                  <p className="reading-status">
                    <Check size={14} aria-hidden="true" /> Recorded
                  </p>
                  <div className="slot-actions">
                    <button
                      type="button"
                      className="button ghost"
                      onClick={() => onEdit(reading)}
                      aria-label={`Edit ${slot.label}`}
                    >
                      <Pencil size={15} aria-hidden="true" /> Edit
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => onDelete(reading)}
                      aria-label={`Delete ${slot.label}`}
                      title={`Delete ${slot.label}`}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p
                    className="reading-value empty-value"
                    aria-label="Not recorded"
                  >
                    —<span>mg/dl</span>
                  </p>
                  <p className="reading-status muted">Not recorded yet</p>
                  <div className="slot-actions">
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => onAdd(slot.value)}
                      aria-label={`Add ${slot.label}`}
                    >
                      <Plus size={16} aria-hidden="true" /> Add reading
                    </button>
                  </div>
                </>
              )}
            </article>
          );
        })}
      </div>

      <div className="daily-summary">
        <div className="section-heading compact">
          <div>
            <h3>Day at a glance</h3>
            <p className="muted">
              {formatDate(date)} · {report.count}{" "}
              {report.count === 1 ? "reading" : "readings"}
            </p>
          </div>
        </div>
        <dl className="stats-grid">
          <div className="stat">
            <dt>Average</dt>
            <dd>
              {average(report.average)}
              <span>mg/dl</span>
            </dd>
          </div>
          <div className="stat">
            <dt>Highest</dt>
            <dd>
              {report.highest ?? "—"}
              <span>mg/dl</span>
            </dd>
          </div>
          <div className="stat">
            <dt>Lowest</dt>
            <dd>
              {report.lowest ?? "—"}
              <span>mg/dl</span>
            </dd>
          </div>
        </dl>
        {report.count === 0 && (
          <p className="muted summary-note">
            No readings for this day yet. Add your first reading to see your
            daily summary.
          </p>
        )}
      </div>
    </section>
  );
}
