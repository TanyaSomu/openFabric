import { describe, it, expect } from 'vitest';
import {
  calculateSpecificity,
  evaluatePermissions,
  matchesResource,
} from '../../src/utils/permission-matcher';
import { UserPermission } from '../../src/types/authorization.types';

describe('Wildcard Matching and Specificity Engine', () => {
  describe('matchesResource - Exact and Segment Wildcards', () => {
    it('matches exact resources', () => {
      expect(matchesResource('transactions', 'transactions')).toBe(true);
      expect(matchesResource('wallets/wallet-789', 'wallets/wallet-789')).toBe(true);
      expect(
        matchesResource('wallets/wallet-789/transactions', 'wallets/wallet-789/transactions'),
      ).toBe(true);
    });

    it('does not match different resources or partial prefixes', () => {
      expect(matchesResource('transactions', 'accounts')).toBe(false);
      // Ensure wallet-789 does not match wallet-7899 or wallet-78
      expect(matchesResource('wallets/wallet-789', 'wallets/wallet-7899')).toBe(false);
      expect(matchesResource('wallets/wallet-789', 'wallets/wallet-78')).toBe(false);
      expect(matchesResource('wallets', 'wallets-archive')).toBe(false);
      expect(matchesResource('transactions', 'transactions-backup')).toBe(false);
      expect(matchesResource('accounts', 'account')).toBe(false);
    });

    it('matches single global wildcard * to any path', () => {
      expect(matchesResource('*', 'transactions')).toBe(true);
      expect(matchesResource('*', 'wallets/wallet-789')).toBe(true);
      expect(matchesResource('*', 'wallets/wallet-789/transactions')).toBe(true);
      expect(matchesResource('*', 'accounts/acc-123/settings')).toBe(true);
      expect(matchesResource('*', 'any/deeply/nested/path/here')).toBe(true);
    });

    it('matches segment wildcards within the same segment count', () => {
      expect(matchesResource('wallets/*', 'wallets/wallet-789')).toBe(true);
      expect(matchesResource('wallets/*', 'wallets/wallet-999')).toBe(true);
      // wallets/* has 2 segments; wallets/wallet-789/transactions has 3 segments -> should NOT match
      expect(matchesResource('wallets/*', 'wallets/wallet-789/transactions')).toBe(false);
    });

    it('matches nested multi-segment wildcards with equal segment counts', () => {
      const pattern = 'wallets/*/transactions/*';
      expect(matchesResource(pattern, 'wallets/wallet-123/transactions/tx-456')).toBe(true);
      expect(matchesResource(pattern, 'wallets/wallet-456/transactions/txn-999')).toBe(true);
      // Mismatched intermediate segment
      expect(matchesResource(pattern, 'wallets/wallet-123/transfers/tx-456')).toBe(false);
      expect(matchesResource(pattern, 'accounts/acc-123/transactions/tx-456')).toBe(false);
    });

    it('handles empty or malformed inputs safely', () => {
      expect(matchesResource('', 'transactions')).toBe(false);
      expect(matchesResource('transactions', '')).toBe(false);
      expect(matchesResource(null as unknown as string, 'transactions')).toBe(false);
      expect(matchesResource('transactions', undefined as unknown as string)).toBe(false);
    });
  });

  describe('matchesResource - Wildcard Collection-Write Matching (Scenario 4b)', () => {
    it('allows item-level wildcard pattern to match its parent collection', () => {
      // user789 POST /wallets/wallet-789/transactions allowed via wallets/*/transactions/*
      expect(
        matchesResource('wallets/*/transactions/*', 'wallets/wallet-789/transactions'),
      ).toBe(true);
      expect(
        matchesResource('wallets/*/transactions/*', 'wallets/wallet-456/transactions'),
      ).toBe(true);
      expect(matchesResource('wallets/*', 'wallets')).toBe(true);
      expect(matchesResource('transactions/*', 'transactions')).toBe(true);
    });

    it('rejects collection-write matching for unrelated resource names or depths', () => {
      expect(
        matchesResource('wallets/*/transactions/*', 'wallets/wallet-789/transfers'),
      ).toBe(false);
      expect(matchesResource('wallets/*/transactions/*', 'wallets/wallet-789')).toBe(false);
      expect(
        matchesResource('wallets/*/transactions/*', 'wallets/wallet-789/transactions/tx-1/extra'),
      ).toBe(false);
      expect(
        matchesResource('wallets/*/transactions/*', 'accounts/acc-123/transactions'),
      ).toBe(false);
    });
  });

  describe('matchesResource - Hierarchical Parent-to-Child Inheritance (Rule 4)', () => {
    it('inherits parent collection permissions to member entity items', () => {
      // transactions applies to transactions/txn-456 (Scenario 2)
      expect(matchesResource('transactions', 'transactions/txn-456')).toBe(true);
      // transactions applies to transactions/txn-123
      expect(matchesResource('transactions', 'transactions/txn-123')).toBe(true);
      // accounts applies to accounts/acc-456
      expect(matchesResource('accounts', 'accounts/acc-456')).toBe(true);
      // wallets applies to wallets/wallet-789
      expect(matchesResource('wallets', 'wallets/wallet-789')).toBe(true);
      // nested sub-collection applies to nested items
      expect(
        matchesResource(
          'wallets/wallet-789/transactions',
          'wallets/wallet-789/transactions/txn-456',
        ),
      ).toBe(true);
      expect(
        matchesResource(
          'wallets/*/transactions',
          'wallets/wallet-789/transactions/txn-456',
        ),
      ).toBe(true);
    });

    it('enforces sub-collection isolation so wallet instance does not grant transaction access', () => {
      // wallets/wallet-789 is a single wallet instance; it must NOT match wallets/wallet-789/transactions
      expect(
        matchesResource('wallets/wallet-789', 'wallets/wallet-789/transactions'),
      ).toBe(false);
      expect(matchesResource('wallets/*', 'wallets/wallet-789/transactions')).toBe(false);
    });

    it('strictly checks segment boundaries during inheritance', () => {
      expect(matchesResource('transactions', 'transactions-archived/txn-123')).toBe(false);
      expect(matchesResource('accounts', 'accounts-old/acc-123')).toBe(false);
    });
  });

  describe('calculateSpecificity', () => {
    it('ranks global wildcard lower than any segmented pattern', () => {
      expect(calculateSpecificity('*')).toBe(0);
      expect(calculateSpecificity('wallets/*')).toBe(11); // 10 + 1
      expect(calculateSpecificity('transactions')).toBe(10); // 10
    });

    it('ranks exact patterns higher than patterns with wildcard segments', () => {
      const exactScore = calculateSpecificity('wallets/wallet-789'); // 10 + 10 = 20
      const wildcardScore = calculateSpecificity('wallets/*'); // 10 + 1 = 11
      const globalScore = calculateSpecificity('*'); // 0

      expect(exactScore).toBeGreaterThan(wildcardScore);
      expect(wildcardScore).toBeGreaterThan(globalScore);
    });

    it('ranks child exact higher than child wildcard and parent collection', () => {
      const childExact = calculateSpecificity('transactions/txn-456'); // 20
      const childWildcard = calculateSpecificity('transactions/*'); // 11
      const parentCollection = calculateSpecificity('transactions'); // 10
      const globalWildcard = calculateSpecificity('*'); // 0

      expect(childExact).toBeGreaterThan(childWildcard);
      expect(childWildcard).toBeGreaterThan(parentCollection);
      expect(parentCollection).toBeGreaterThan(globalWildcard);
    });

    it('ranks 3-segment exact higher than 4-segment wildcard collection', () => {
      const exactCollection = calculateSpecificity('wallets/wallet-789/transactions'); // 30
      const wildcardCollection = calculateSpecificity('wallets/*/transactions/*'); // 22

      expect(exactCollection).toBeGreaterThan(wildcardCollection);
    });
  });

  describe('evaluatePermissions', () => {
    it('evaluates and filters matching permissions with correct specificity', () => {
      const permissions: UserPermission[] = [
        { user_id: 'user456', action: 'read', resource: 'wallets/*', effect: 'allow' },
        { user_id: 'user456', action: 'read', resource: 'wallets/wallet-789', effect: 'allow' },
        { user_id: 'user456', action: 'read', resource: 'accounts', effect: 'allow' },
      ];

      const matches = evaluatePermissions(permissions, 'wallets/wallet-789');

      expect(matches).toHaveLength(2);
      expect(matches.find((m) => m.permission.resource === 'wallets/wallet-789')?.specificity).toBe(
        20,
      );
      expect(matches.find((m) => m.permission.resource === 'wallets/*')?.specificity).toBe(11);
    });

    it('matches inherited parent permissions with parent specificity', () => {
      const permissions: UserPermission[] = [
        { user_id: 'user123', action: 'delete', resource: 'transactions', effect: 'deny' },
        { user_id: 'user123', action: 'delete', resource: '*', effect: 'allow' },
      ];

      const matches = evaluatePermissions(permissions, 'transactions/txn-456');

      expect(matches).toHaveLength(2);
      expect(matches.find((m) => m.permission.resource === 'transactions')?.specificity).toBe(10);
      expect(matches.find((m) => m.permission.resource === '*')?.specificity).toBe(0);
    });
  });
});
