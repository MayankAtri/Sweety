export const SLOTS = [
  { value: 'morning', label: 'Morning (fasting)', short: 'Morning', detail: 'Before breakfast' },
  { value: 'after_breakfast', label: 'After breakfast', short: 'After breakfast', detail: 'Your breakfast reading' },
  { value: 'after_lunch', label: 'After lunch', short: 'After lunch', detail: 'Your lunch reading' },
  { value: 'after_dinner', label: 'After dinner', short: 'After dinner', detail: 'Your dinner reading' },
];
export const slotLabel = slot => SLOTS.find(item => item.value === slot)?.label || slot;
export const formatDate = (date, options = {}) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC', ...options }).format(new Date(`${date}T12:00:00Z`));
export const average = value => value == null ? '—' : Number(value).toFixed(1);
export function validDate(date) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= '0001-02-01' && !Number.isNaN(Date.parse(`${date}T12:00:00Z`)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;
}
export class ApiError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}
export async function api(path, { method = 'GET', body, signal } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, { method, credentials: 'include', signal, headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('We couldn’t reach the server. Check your connection and try again.', 0, 'NETWORK_ERROR');
  }
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(data?.error?.message || 'Something went wrong. Please try again.', response.status, data?.error?.code);
  if (response.status !== 204 && !data) throw new ApiError('The server returned an unexpected response. Please try again.', 502, 'INVALID_RESPONSE');
  return data;
}
