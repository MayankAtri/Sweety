import { ArrowLeft, ArrowRight } from "lucide-react";
import { formatDate } from "../lib.js";

export default function DateNavigation({ date, today, onChange }) {
  const selected = new Date(`${date}T12:00:00Z`);
  const monday = new Date(selected);
  monday.setUTCDate(selected.getUTCDate() - ((selected.getUTCDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setUTCDate(monday.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
  const move = (amount) => {
    const next = new Date(selected);
    next.setUTCDate(next.getUTCDate() + amount);
    const value = next.toISOString().slice(0, 10);
    onChange(
      value > today ? today : value < "0001-02-01" ? "0001-02-01" : value,
    );
  };
  return (
    <div className="date-navigation">
      <div className="date-tools">
        <label className="month-picker">
          <span>
            {new Intl.DateTimeFormat("en-GB", {
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            }).format(selected)}
          </span>
          <input
            aria-label="Report date"
            type="date"
            min="0001-02-01"
            max={today}
            value={date}
            onChange={(event) => onChange(event.target.value)}
          />
        </label>
        <div className="date-arrows">
          <button
            className="icon-button"
            aria-label="Previous week"
            disabled={date <= "0001-02-07"}
            onClick={() => move(-7)}
          >
            <ArrowLeft size={17} />
          </button>
          <button
            className="icon-button"
            aria-label="Next week"
            disabled={days[6] >= today}
            onClick={() => move(7)}
          >
            <ArrowRight size={17} />
          </button>
          <button
            className="button ghost small"
            disabled={date === today}
            onClick={() => onChange(today)}
          >
            Today
          </button>
        </div>
      </div>
      <div className="week-strip" role="group" aria-label="Choose a day">
        {days.map((day) => (
          <button
            key={day}
            aria-label={formatDate(day)}
            aria-pressed={day === date}
            disabled={day > today || day < "0001-02-01"}
            className={day === date ? "selected" : ""}
            onClick={() => onChange(day)}
          >
            <span>
              {formatDate(day, {
                weekday: "short",
                day: undefined,
                month: undefined,
                year: undefined,
              })}
            </span>
            <strong>{Number(day.slice(8))}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}
