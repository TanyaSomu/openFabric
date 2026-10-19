import { Router, Request, Response, NextFunction } from 'express';
import { getDatabase } from '../config/database';
import { mintDevToken, getDevIssuer, getDevAudience } from '../services/dev-keys';
import { decodeJwt } from 'jose';
import fs from 'fs';
import path from 'path';

export const apiRouter = Router();

// Test Personas Definition
export const PERSONAS = [
  {
    id: 'user123',
    name: 'Standard User (user123)',
    role: 'Standard User',
    description: 'Allowed to read/write transactions and read accounts, but explicitly denied deleting transactions.',
    avatar: '👤',
    color: '#3B82F6',
  },
  {
    id: 'user456',
    name: 'Wallet Operator (user456)',
    role: 'Wallet Operator',
    description: 'Allowed to read wallets/* and write wallets/wallet-789, read wallets/wallet-789/transactions.',
    avatar: '💼',
    color: '#10B981',
  },
  {
    id: 'user789',
    name: 'Ledger Service (user789)',
    role: 'Transaction Writer',
    description: 'Allowed to write nested transactions (wallets/*/transactions/*).',
    avatar: '⚡',
    color: '#8B5CF6',
  },
  {
    id: 'admin789',
    name: 'Super Admin (admin789)',
    role: 'Global Administrator',
    description: 'Has global wildcard access (*) for read, write, and delete across all resources.',
    avatar: '👑',
    color: '#F59E0B',
  },
];

// Verbatim Assignment Scenarios
export const ASSIGNMENT_SCENARIOS = [
  {
    id: 'scenario-1',
    scenarioNumber: 'Scenario 1',
    title: 'user123 Read Transactions',
    personaId: 'user123',
    method: 'GET',
    path: '/transactions',
    expectedDecision: 'ALLOW',
    rationale: 'user123 has explicit allow rule for action=read, resource=transactions.',
  },
  {
    id: 'scenario-2',
    scenarioNumber: 'Scenario 2',
    title: 'user123 Delete Transactions (Explicit Deny)',
    personaId: 'user123',
    method: 'DELETE',
    path: '/transactions',
    expectedDecision: 'DENY',
    rationale: 'user123 has explicit deny rule for action=delete, resource=transactions.',
  },
  {
    id: 'scenario-3',
    scenarioNumber: 'Scenario 3',
    title: 'user456 Read Single Wallet (Segment Wildcard)',
    personaId: 'user456',
    method: 'GET',
    path: '/wallets/wallet-123',
    expectedDecision: 'ALLOW',
    rationale: 'Matches segment wildcard pattern wallets/* for action=read.',
  },
  {
    id: 'scenario-4a',
    scenarioNumber: 'Scenario 4a',
    title: 'user456 Write Specific Wallet',
    personaId: 'user456',
    method: 'POST',
    path: '/wallets/wallet-789',
    expectedDecision: 'ALLOW',
    rationale: 'Matches exact resource wallets/wallet-789 for action=write.',
  },
  {
    id: 'scenario-4b',
    scenarioNumber: 'Scenario 4b',
    title: 'user789 Write Nested Transactions (Collection Write Wildcard)',
    personaId: 'user789',
    method: 'POST',
    path: '/wallets/wallet-789/transactions',
    expectedDecision: 'ALLOW',
    rationale: 'Rule wallets/*/transactions/* allows writes to immediate parent collection endpoint.',
  },
  {
    id: 'scenario-5',
    scenarioNumber: 'Scenario 5',
    title: 'user123 Read Unauthorized Wallet (Default Deny)',
    personaId: 'user123',
    method: 'GET',
    path: '/wallets/wallet-123',
    expectedDecision: 'DENY',
    rationale: 'No matching permission rule found for user123 on wallets. Default Deny applied.',
  },
  {
    id: 'scenario-6',
    scenarioNumber: 'Scenario 6',
    title: 'admin789 Delete Arbitrary Wallet (Global Wildcard)',
    personaId: 'admin789',
    method: 'DELETE',
    path: '/wallets/wallet-999',
    expectedDecision: 'ALLOW',
    rationale: 'admin789 possesses global wildcard rule (*) granting delete on all paths.',
  },
];

// GET /api/personas
apiRouter.get('/api/personas', (_req: Request, res: Response) => {
  res.json({ personas: PERSONAS });
});

// GET /api/scenarios
apiRouter.get('/api/scenarios', (_req: Request, res: Response) => {
  res.json({ scenarios: ASSIGNMENT_SCENARIOS });
});

// GET /api/permissions
apiRouter.get('/api/permissions', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const rows = db.prepare('SELECT id, user_id, action, resource, effect FROM user_permissions ORDER BY id ASC').all();
    res.json({ permissions: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/permissions
apiRouter.post('/api/permissions', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user_id, action, resource, effect } = req.body;
    if (!user_id || !action || !resource || !effect) {
      return res.status(400).json({ error: 'Missing required fields: user_id, action, resource, effect' });
    }
    if (!['allow', 'deny'].includes(effect)) {
      return res.status(400).json({ error: 'Effect must be "allow" or "deny"' });
    }
    if (!['read', 'write', 'delete'].includes(action)) {
      return res.status(400).json({ error: 'Action must be "read", "write", or "delete"' });
    }

    const db = getDatabase();
    const stmt = db.prepare(
      'INSERT INTO user_permissions (user_id, action, resource, effect) VALUES (?, ?, ?, ?)'
    );
    const result = stmt.run(user_id.trim(), action.trim(), resource.trim(), effect.trim());

    res.status(201).json({
      message: 'Permission created',
      permission: {
        id: result.lastInsertRowid,
        user_id,
        action,
        resource,
        effect,
      },
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/permissions/:id
apiRouter.delete('/api/permissions/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(String(rawId), 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid permission ID' });
    }
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM user_permissions WHERE id = ?');
    const result = stmt.run(id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Permission not found' });
    }

    res.json({ message: 'Permission deleted', id });
  } catch (err) {
    next(err);
  }
});

// POST /api/permissions/reset
apiRouter.post('/api/permissions/reset', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const initSqlPath = path.resolve(__dirname, '../../database/init.sql');
    if (fs.existsSync(initSqlPath)) {
      db.exec('DELETE FROM user_permissions');
      const sql = fs.readFileSync(initSqlPath, 'utf8');
      db.exec(sql);
    }
    const rows = db.prepare('SELECT id, user_id, action, resource, effect FROM user_permissions ORDER BY id ASC').all();
    res.json({ message: 'Permissions reset to initial seed data', permissions: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/tokens/mint
apiRouter.post('/api/tokens/mint', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId = 'user123', expiresIn = '2h', customClaims } = req.body;
    const token = await mintDevToken({
      userId,
      expiresIn,
      customClaims,
    });
    const decoded = decodeJwt(token);

    res.json({
      access_token: token,
      decoded,
      issuer: getDevIssuer(),
      audience: getDevAudience(),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/stats
apiRouter.get('/api/stats', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const countRow = db.prepare('SELECT COUNT(*) as count FROM user_permissions').get() as { count: number };
    const distinctUsers = db.prepare('SELECT COUNT(DISTINCT user_id) as count FROM user_permissions').get() as { count: number };
    res.json({
      totalPermissions: countRow.count,
      uniqueUsers: distinctUsers.count,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});
