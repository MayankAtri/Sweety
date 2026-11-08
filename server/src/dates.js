import { config } from './config.js';

export function today(timeZone = config.appTimezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function validateDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  // January in year 1 has no representable previous month in our YYYY-MM-DD API.
  if (value < '0001-02-01') return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function reportRanges(date) {
  const monthStart = `${date.slice(0, 7)}-01`;
  const previousEnd = new Date(`${monthStart}T00:00:00.000Z`);
  previousEnd.setUTCDate(0);
  const endDate = previousEnd.toISOString().slice(0, 10);
  return {
    daily: { startDate: date, endDate: date },
    monthToDate: { startDate: monthStart, endDate: date },
    monthly: { startDate: `${endDate.slice(0, 7)}-01`, endDate },
  };
}
