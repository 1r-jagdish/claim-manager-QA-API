'use strict';

/**
 * claim-manager-v2-api
 *
 * Minimal Node.js/Express service for managing insurance claims.
 * Claims are held in an in-memory store (no database is configured for this service yet).
 */

const express = require('express');
const { randomUUID } = require('node:crypto');

const SERVICE_NAME = 'claim-manager-v2-api';
const CLAIM_STATUSES = ['submitted', 'under_review', 'approved', 'denied'];

function createStore() {
  const claims = new Map();

  function seed({ policyNumber, claimantName, amount, status }) {
    const now = new Date().toISOString();
    const claim = {
      id: randomUUID(),
      claimNumber: `CLM-${String(claims.size + 1).padStart(4, '0')}`,
      policyNumber,
      claimantName,
      amount,
      status,
      createdAt: now,
      updatedAt: now,
    };
    claims.set(claim.id, claim);
    return claim;
  }

  seed({ policyNumber: 'POL-1001', claimantName: 'A. Rivera', amount: 1250.5, status: 'submitted' });
  seed({ policyNumber: 'POL-1002', claimantName: 'J. Chen', amount: 480, status: 'under_review' });

  return {
    list() {
      return [...claims.values()];
    },
    get(id) {
      return claims.get(id);
    },
    create({ policyNumber, claimantName, amount }) {
      return seed({ policyNumber, claimantName, amount, status: 'submitted' });
    },
    setStatus(id, status) {
      const claim = claims.get(id);
      if (!claim) return undefined;
      claim.status = status;
      claim.updatedAt = new Date().toISOString();
      return claim;
    },
    get size() {
      return claims.size;
    },
  };
}

function createApp(options = {}) {
  const store = options.store ?? createStore();
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json());

  app.get('/', (req, res) => {
    res.json({
      service: SERVICE_NAME,
      version: '1.0.0',
      endpoints: [
        'GET /health',
        'GET /api/claims',
        'GET /api/claims/:id',
        'POST /api/claims',
        'PATCH /api/claims/:id/status',
      ],
    });
  });

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service: SERVICE_NAME,
      claims: store.size,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/claims', (req, res) => {
    const { status } = req.query;
    let claims = store.list();
    if (typeof status === 'string' && status.length > 0) {
      claims = claims.filter((claim) => claim.status === status);
    }
    res.json({ count: claims.length, claims });
  });

  app.get('/api/claims/:id', (req, res) => {
    const claim = store.get(req.params.id);
    if (!claim) {
      return res.status(404).json({ error: 'claim_not_found', id: req.params.id });
    }
    res.json(claim);
  });

  app.post('/api/claims', (req, res) => {
    const { policyNumber, claimantName, amount } = req.body ?? {};
    const errors = [];

    if (typeof policyNumber !== 'string' || policyNumber.trim() === '') {
      errors.push('policyNumber is required');
    }
    if (typeof claimantName !== 'string' || claimantName.trim() === '') {
      errors.push('claimantName is required');
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      errors.push('amount must be a positive number');
    }
    if (errors.length > 0) {
      return res.status(400).json({ error: 'validation_failed', details: errors });
    }

    const claim = store.create({
      policyNumber: policyNumber.trim(),
      claimantName: claimantName.trim(),
      amount,
    });
    res.status(201).json(claim);
  });

  app.patch('/api/claims/:id/status', (req, res) => {
    const { status } = req.body ?? {};
    if (!CLAIM_STATUSES.includes(status)) {
      return res.status(400).json({
        error: 'validation_failed',
        details: [`status must be one of: ${CLAIM_STATUSES.join(', ')}`],
      });
    }
    const claim = store.setStatus(req.params.id, status);
    if (!claim) {
      return res.status(404).json({ error: 'claim_not_found', id: req.params.id });
    }
    res.json(claim);
  });

  app.use((req, res) => {
    res.status(404).json({ error: 'not_found', path: req.originalUrl });
  });

  app.use((err, req, res, next) => {
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'invalid_json' });
    }
    console.error('unhandled error:', err);
    res.status(500).json({ error: 'internal_error' });
  });

  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, '0.0.0.0', () => {
    console.log(`${SERVICE_NAME} listening on 0.0.0.0:${port}`);
  });
}

module.exports = { createApp, createStore, SERVICE_NAME, CLAIM_STATUSES };
