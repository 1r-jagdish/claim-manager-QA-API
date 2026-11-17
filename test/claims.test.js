'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../server.js');

let server;
let baseUrl;

test.before(async () => {
  const app = createApp();
  await new Promise((resolve) => {
    // Bind on all interfaces, matching the production server, so the same code
    // path is exercised in the container as it is locally.
    server = app.listen(0, '0.0.0.0', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('GET /health reports ok', async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.service, 'claim-manager-v2-api');
  assert.ok(body.claims >= 2);
});

test('GET /api/claims lists seeded claims', async () => {
  const res = await fetch(`${baseUrl}/api/claims`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.count, body.claims.length);
  assert.ok(body.count >= 2);
});

test('GET /api/claims filters by status', async () => {
  const res = await fetch(`${baseUrl}/api/claims?status=under_review`);
  const body = await res.json();
  assert.ok(body.claims.length >= 1);
  assert.ok(body.claims.every((claim) => claim.status === 'under_review'));
});

test('POST /api/claims creates a claim', async () => {
  const res = await fetch(`${baseUrl}/api/claims`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ policyNumber: 'POL-2001', claimantName: 'M. Okafor', amount: 999.99 }),
  });
  assert.equal(res.status, 201);
  const claim = await res.json();
  assert.ok(claim.id);
  assert.equal(claim.status, 'submitted');
  assert.equal(claim.amount, 999.99);

  const fetched = await fetch(`${baseUrl}/api/claims/${claim.id}`);
  assert.equal(fetched.status, 200);
  assert.equal((await fetched.json()).claimNumber, claim.claimNumber);
});

test('POST /api/claims rejects invalid payloads', async () => {
  const res = await fetch(`${baseUrl}/api/claims`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ policyNumber: '', amount: -5 }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, 'validation_failed');
  assert.ok(body.details.length >= 2);
});

test('PATCH /api/claims/:id/status updates status', async () => {
  const created = await (
    await fetch(`${baseUrl}/api/claims`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ policyNumber: 'POL-3001', claimantName: 'L. Novak', amount: 150 }),
    })
  ).json();

  const res = await fetch(`${baseUrl}/api/claims/${created.id}/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'approved' }),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, 'approved');
});

test('PATCH rejects an unknown status and unknown claim ids', async () => {
  const badStatus = await fetch(`${baseUrl}/api/claims/anything/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'lost' }),
  });
  assert.equal(badStatus.status, 400);

  const missing = await fetch(`${baseUrl}/api/claims/does-not-exist/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'approved' }),
  });
  assert.equal(missing.status, 404);
});

test('unknown routes return a JSON 404', async () => {
  const res = await fetch(`${baseUrl}/nope`);
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, 'not_found');
});
