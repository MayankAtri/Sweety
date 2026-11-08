import { AppError } from './errors.js';
import { today, validateDate } from './dates.js';

export const SLOT_LABELS = Object.freeze({
  morning: 'Morning (fasting)',
  after_breakfast: 'After breakfast',
  after_lunch: 'After lunch',
  after_dinner: 'After dinner',
});
export const SLOTS = Object.freeze(Object.keys(SLOT_LABELS));

export function validateReading(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(400, 'INVALID_READING', 'Please provide a reading.');
  }
  const { date, slot, value } = body;
  if (value === undefined || value === null || value === '') {
    throw new AppError(400, 'VALUE_REQUIRED', 'Please enter a glucose value.');
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 40 || value > 600) {
    throw new AppError(400, 'INVALID_VALUE', 'Value must be a whole number between 40 and 600 mg/dl.');
  }
  if (!validateDate(date)) {
    throw new AppError(400, 'INVALID_DATE', 'Please enter a valid date in YYYY-MM-DD format.');
  }
  if (date > today()) throw new AppError(400, 'FUTURE_DATE', 'Date cannot be in the future.');
  if (typeof slot !== 'string' || !SLOTS.includes(slot)) {
    throw new AppError(400, 'INVALID_SLOT', 'Please select a valid time slot.');
  }
  return { date, slot, value };
}
