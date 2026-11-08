import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError, average, formatDate, validDate } from '../src/lib.js';

test('API requests retain browser credentials and serialize mutation bodies', async t => {
  const controller = new AbortController();
  const body = { date: '2024-02-29', slot: 'morning', value: 100 };
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ reading: { id: '42', ...body } }), { status: 201 }));
  const response = await api('/readings', { method: 'POST', body, signal: controller.signal });
  assert.equal(response.reading.id, '42');
  const [path, options] = fetch.mock.calls[0].arguments;
  assert.equal(path, '/api/readings');
  assert.equal(options.credentials, 'include');
  assert.equal(options.method, 'POST');
  assert.equal(options.signal, controller.signal);
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(options.body), body);
});

test('fetch cancellation propagates unchanged rather than becoming a network error', async t => {
  const cancellation = new DOMException('Cancelled', 'AbortError');
  t.mock.method(globalThis, 'fetch', async () => { throw cancellation; });
  await assert.rejects(api('/reports?date=2024-02-29'), error => error === cancellation);
});

test('cancellation while reading a successful response body propagates unchanged', async t => {
  const cancellation = new DOMException('Body cancelled', 'AbortError');
  t.mock.method(globalThis, 'fetch', async () => ({ status: 200, ok: true, json: async () => { throw cancellation; } }));
  await assert.rejects(api('/reports?date=2024-02-29'), error => error === cancellation);
});

test('cancelled unauthorized response does not become a false session-expiry error', async t => {
  const cancellation = new DOMException('Old response cancelled', 'AbortError');
  t.mock.method(globalThis, 'fetch', async () => ({ status: 401, ok: false, json: async () => { throw cancellation; } }));
  await assert.rejects(api('/auth/me'), error => error === cancellation);
});

test('network failures expose a helpful message without raw transport details', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('private transport details'); });
  await assert.rejects(api('/readings'), error => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 0);
    assert.equal(error.code, 'NETWORK_ERROR');
    assert.match(error.message, /Check your connection/);
    assert.doesNotMatch(error.message, /private transport/);
    return true;
  });
});

test('server validation messages and status codes reach forms unchanged', async t => {
  const message = 'You already have an After lunch reading for this date.';
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: { code: 'DUPLICATE_SLOT', message } }), { status: 409 }));
  await assert.rejects(api('/readings', { method: 'POST', body: {} }), error => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 409);
    assert.equal(error.code, 'DUPLICATE_SLOT');
    assert.equal(error.message, message);
    return true;
  });
});

test('non-JSON success and error responses use safe fallback messages', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>Unexpected page</html>', { status: 200 }));
  await assert.rejects(api('/reports'), error => error.status === 502 && error.code === 'INVALID_RESPONSE');
  globalThis.fetch.mock.mockImplementation(async () => new Response('<html>Internal detail</html>', { status: 500 }));
  await assert.rejects(api('/readings'), error => {
    assert.equal(error.status, 500);
    assert.equal(error.message, 'Something went wrong. Please try again.');
    return true;
  });
});

test('204 logout/delete responses do not attempt to parse an empty body', async t => {
  t.mock.method(globalThis, 'fetch', async () => ({ status: 204, ok: true, json() { throw new Error('Body must not be parsed'); } }));
  assert.equal(await api('/auth/logout', { method: 'POST' }), null);
});

test('calendar validation handles leap centuries, supported minimum and malformed dates', () => {
  for (const date of ['2000-02-29', '2024-02-29', '0001-02-01', '2024-12-31']) assert.equal(validDate(date), true, date);
  for (const date of ['1900-02-29', '2100-02-29', '2024-02-30', '2024-13-01', '0001-01-31', '2024-2-01', '', null, [], {}, '2024-02-29\n']) assert.equal(validDate(date), false, String(date));
});

test('display helpers keep calendar dates stable and averages to one decimal', () => {
  assert.equal(formatDate('2024-02-29'), '29 Feb 2024');
  assert.equal(formatDate('2024-12-31', { weekday: 'short' }), 'Tue, 31 Dec 2024');
  assert.equal(average(null), '—');
  assert.equal(average(0), '0.0');
  assert.equal(average(100), '100.0');
  assert.equal(average(117.3), '117.3');
});
