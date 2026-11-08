import { useEffect, useId, useRef, useState } from "react";
import { Sunrise, Sun, Utensils, Moon, Check, Trash2 } from "lucide-react";
import { SLOTS, average } from "../lib.js";

const icons = [Sunrise, Sun, Utensils, Moon];

export default function DailyView({ report, date, onSave, onEdit, onDelete }) {
  const readings = report.readings || [];
  const firstEmpty = SLOTS.find(
    (slot) => !readings.some((r) => r.slot === slot.value),
  )?.value;
  const [slot, setSlot] = useState(firstEmpty || "morning");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const input = useRef(null);
  const [focusValue, setFocusValue] = useState(false);
  useEffect(() => {
    if (focusValue) {
      input.current?.focus();
      setFocusValue(false);
    }
  }, [focusValue]);
  const id = useId();
  const selectedReading = readings.find((r) => r.slot === slot);
  async function submit(event) {
    event.preventDefault();
    if (pending) return;
    const number = Number(value);
    if (!value.trim()) {
      setError("Please enter a glucose value.");
      input.current.focus();
      return;
    }
    if (!Number.isInteger(number) || number < 40 || number > 600) {
      setError("Value must be a whole number between 40 and 600 mg/dl.");
      input.current.focus();
      return;
    }
    setError("");
    setPending(true);
    try {
      await onSave({ date, slot, value: number });
      setValue("");
    } catch (failure) {
      setError(failure.message);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="journal-layout">
      <section className="journal-entry" aria-labelledby={`${id}-title`}>
        <h2 className="eyebrow" id={`${id}-title`}>
          Add a reading
        </h2>
        <form onSubmit={submit} noValidate aria-busy={pending}>
          <fieldset className="slot-picker" disabled={pending}>
            <legend className="sr-only">Time slot</legend>
            {SLOTS.map((item, index) => {
              const reading = readings.find((r) => r.slot === item.value);
              const Icon = icons[index];
              return (
                <label
                  className={`slot-choice ${slot === item.value ? "selected" : ""}`}
                  key={item.value}
                >
                  <input
                    type="radio"
                    name={`${id}-slot`}
                    value={item.value}
                    checked={slot === item.value}
                    onChange={() => {
                      setSlot(item.value);
                      setError("");
                      setValue("");
                    }}
                  />
                  <span className="slot-icon">
                    <Icon size={25} strokeWidth={1.5} aria-hidden="true" />
                  </span>
                  <span className="slot-copy">
                    <strong>{item.label}</strong>
                    <small>
                      {reading
                        ? `Recorded: ${reading.value} mg/dl`
                        : "Not recorded"}
                    </small>
                  </span>
                  {slot === item.value && (
                    <Check
                      className="slot-check"
                      size={20}
                      aria-hidden="true"
                    />
                  )}
                </label>
              );
            })}
          </fieldset>
          {selectedReading ? (
            <div className="recorded-message" role="status">
              <p>
                This slot already has a reading of{" "}
                <strong>{selectedReading.value} mg/dl</strong>.
              </p>
              <button
                type="button"
                className="button"
                onClick={() => onEdit(selectedReading)}
              >
                Edit reading
              </button>
              <p className="field-hint">
                Choose an unrecorded slot to add a new reading.
              </p>
            </div>
          ) : (
            <>
              <label className="value-label" htmlFor={`${id}-value`}>
                Glucose value
              </label>
              <div className="journal-value">
                <input
                  id={`${id}-value`}
                  ref={input}
                  type="number"
                  inputMode="numeric"
                  min="40"
                  max="600"
                  step="1"
                  placeholder="Enter value"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  disabled={pending}
                  aria-invalid={Boolean(error)}
                  aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
                />
                <span>mg/dl</span>
              </div>
              <p className="field-hint" id={`${id}-hint`}>
                Whole number from 40 to 600.
              </p>
              {error && (
                <p className="form-error" id={`${id}-error`} role="alert">
                  {error}
                </p>
              )}
              <div className="entry-actions">
                <button className="button" disabled={pending}>
                  {pending ? "Saving…" : "Save reading"}
                </button>
                <button
                  className="button ghost"
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setValue("");
                    setError("");
                    input.current.focus();
                  }}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </form>
      </section>
      <section className="day-log" aria-labelledby={`${id}-day`}>
        <h2 id={`${id}-day`}>Your day</h2>
        <p className="day-count">{report.count} of 4 recorded</p>
        <div className="reading-list">
          {SLOTS.map((item, index) => {
            const reading = readings.find((r) => r.slot === item.value);
            const Icon = icons[index];
            return (
              <div className="reading-row" key={item.value}>
                <span className="slot-icon">
                  <Icon size={23} strokeWidth={1.5} aria-hidden="true" />
                </span>
                <strong className="reading-label">{item.label}</strong>
                {reading ? (
                  <>
                    <span className="row-value">
                      {reading.value} <small>mg/dl</small>
                    </span>
                    <div className="row-actions">
                      <button
                        className="text-button"
                        onClick={() => onEdit(reading)}
                        aria-label={`Edit ${item.label}`}
                      >
                        Edit
                      </button>
                      <button
                        className="icon-button delete-action"
                        onClick={() => onDelete(reading)}
                        aria-label={`Delete ${item.label}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    className="unrecorded"
                    onClick={() => {
                      setSlot(item.value);
                      setValue("");
                      setError("");
                      setFocusValue(true);
                    }}
                  >
                    Not recorded
                    <span className="sr-only"> — add {item.label}</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <dl className="day-stats">
          {[
            ["Average", average(report.average)],
            ["Highest", report.highest ?? "—"],
            ["Lowest", report.lowest ?? "—"],
          ].map(([label, number]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{number}</dd>
            </div>
          ))}
        </dl>
        <p className="summary-caption">
          mg/dl · Based on {report.count}{" "}
          {report.count === 1 ? "reading" : "readings"}.
        </p>
        {!report.count && (
          <p className="muted">
            Add your first reading to see your daily summary.
          </p>
        )}
      </section>
    </div>
  );
}
