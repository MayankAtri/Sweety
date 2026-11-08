import { useId, useState } from "react";
import { ChartNoAxesCombined, ChevronDown, ChevronUp } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { SLOTS, formatDate, slotLabel } from "../lib.js";

function ReadingTooltip({ active, payload }) {
  const reading = payload?.[0]?.payload;
  if (!active || !reading || reading.value == null) return null;
  return (
    <div className="trend-tooltip">
      <strong>{reading.value} mg/dl</strong>
      <span>{formatDate(reading.date)}</span>
      <span>{slotLabel(reading.slot)}</span>
    </div>
  );
}

export default function MonthlyChart({ trend }) {
  const id = useId();
  const [showTable, setShowTable] = useState(false);
  const { startDate, endDate, readings } = trend;
  const days = Number(endDate.slice(8));
  const indexed = new Map(
    readings.map((reading) => [`${reading.date}/${reading.slot}`, reading]),
  );
  // One position per named slot preserves gaps, rather than plotting missing
  // readings as zero or implying an uninterrupted measurement series.
  const points = Array.from({ length: days }, (_, day) => {
    const date = `${startDate.slice(0, 7)}-${String(day + 1).padStart(2, "0")}`;
    return SLOTS.map((slot, index) => ({
      date,
      slot: slot.value,
      position: day * 4 + index,
      value: indexed.get(`${date}/${slot.value}`)?.value ?? null,
    }));
  }).flat();
  const tickDays = new Set([1, days]);
  const tickInterval = Math.max(1, Math.ceil(days / 6));
  for (let day = 1; day <= days; day += tickInterval) tickDays.add(day);
  const ticks = [...tickDays].sort((a, b) => a - b).map((day) => (day - 1) * 4);
  const values = readings.map((reading) => reading.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);

  return (
    <section className="trend-card" aria-labelledby={`${id}-title`}>
      <div className="trend-heading">
        <div>
          <p className="eyebrow">Across the month</p>
          <h2 id={`${id}-title`}>Monthly readings</h2>
          <p className="muted">
            {formatDate(startDate)} – {formatDate(endDate)}
          </p>
        </div>
        <span className="reading-count">
          {readings.length} {readings.length === 1 ? "reading" : "readings"}
        </span>
      </div>
      {readings.length === 0 ? (
        <div className="trend-empty">
          <ChartNoAxesCombined size={30} strokeWidth={1.5} aria-hidden="true" />
          <h3>Your month starts with one reading</h3>
          <p>
            No readings from the start of this month through your selected date
            yet.
          </p>
        </div>
      ) : (
        <>
          <p id={`${id}-summary`} className="sr-only">
            {readings.length} glucose readings from {formatDate(startDate)} to{" "}
            {formatDate(endDate)}. Lowest {minimum} mg/dl; highest {maximum}{" "}
            mg/dl. A data table is available below.
          </p>
          <div
            className="trend-chart"
            style={{ width: "100%", height: 280, minWidth: 0 }}
            role="img"
            aria-label="Blood glucose readings by date and time slot"
            aria-describedby={`${id}-summary`}
          >
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart
                data={points}
                margin={{ top: 12, right: 14, bottom: 8, left: -10 }}
                accessibilityLayer
              >
                <CartesianGrid
                  stroke="#d9dece"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="position"
                  type="number"
                  domain={[0, Math.max(3, points.length - 1)]}
                  ticks={ticks}
                  tickFormatter={(position) =>
                    String(Math.floor(position / 4) + 1)
                  }
                  tick={{ fill: "#58634f", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={15}
                />
                <YAxis
                  domain={[
                    Math.max(40, minimum - 20),
                    Math.min(600, maximum + 20),
                  ]}
                  allowDecimals={false}
                  tick={{ fill: "#58634f", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                />
                <Tooltip
                  content={<ReadingTooltip />}
                  cursor={{ stroke: "#aebad1" }}
                />
                <Line
                  type="linear"
                  dataKey="value"
                  name="Glucose"
                  unit=" mg/dl"
                  stroke="#183e25"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#183e25", strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="trend-note">
            Glucose in mg/dl · Day of the month. Points follow daily slot order.
            Gaps mean a reading wasn’t recorded, not a value of zero.
          </p>
          <button
            className="button ghost small"
            type="button"
            aria-expanded={showTable}
            aria-controls={`${id}-table`}
            onClick={() => setShowTable((value) => !value)}
          >
            {showTable ? "Hide chart data" : "View chart data"}
            {showTable ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {showTable && (
            <div className="trend-table-wrap" id={`${id}-table`}>
              <table className="history-table">
                <caption className="sr-only">Monthly chart readings</caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Time slot</th>
                    <th scope="col">Glucose</th>
                  </tr>
                </thead>
                <tbody>
                  {readings.map((reading) => (
                    <tr key={reading.id}>
                      <td>
                        <time dateTime={reading.date}>
                          {formatDate(reading.date)}
                        </time>
                      </td>
                      <td>{slotLabel(reading.slot)}</td>
                      <td>{reading.value} mg/dl</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
