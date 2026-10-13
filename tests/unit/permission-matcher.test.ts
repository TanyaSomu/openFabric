import { describe, it, expect } from 'vitest';
import {
  calculateSpecificity,
  evaluatePermissions,
  matchesResource,
} from '../../src/utils/permission-matcher';
import { UserPermission } from '../../src/types/authorization.types';

describe('Wildcard Matching and Specificity Engine', () => {
  describe('matchesResource', () => {
    it('matches exact resources', () => {
      expect(matchesResource('transactions', 'transactions')).toBe(true);
      expect(matchesResource('wallets/wallet-789', 'wallets/wallet-789')).toBe(true);
      expect(
        matchesResource('wallets/wallet-789/transactions', 'wallets/wallet-789/transactions'),
      ).toBe(true);
    });

    it('does not match different resources or partial prefixes', () => {
      expect(matchesResource('transactions', 'accounts')).toBe(false);
      // Ensure wallet-789 does not match wallet-7899
      expect(matchesResource('wallets/wallet-789', 'wallets/wallet-7899')).toBe(false);
      expect(matchesResource('wallets/wallet-789', 'wallets/wallet-78')).toBe(false);
    });

    it('matches single global wildcard * to any path', () => {
      expect(matchesResource('*', 'transactions')).toBe(true);
      expect(matchesResource('*', 'wallets/wallet-789')).toBe(true);
      expect(matchesResource('*', 'wallets/wallet-789/transactions')).toBe(true);
      expect(matchesResource('*', 'any/deeply/nested/path/here')).toBe(true);
    });

    it('matches segment wildcards within the same segment count', () => {
      expect(matchesResource('wallets/*', 'wallets/wallet-789')).toBe(true);
      expect(matchesResource('wallets/*', 'wallets/wallet-999')).toBe(true);
      // wallets/* has 2 segments; wallets/wallet-789/transactions has 3 segments -> should NOT match
      expect(matchesResource('wallets/*', 'wallets/wallet-789/transactions')).toBe(false);
    });

    it('matches nested multi-segment wildcards', () => {
      const pattern = 'wallets/*/transactions/*';
      expect(matchesResource(pattern, 'wallets/wallet-123/transactions/tx-456')).toBe(true);
      expect(matchesResource(pattern, 'wallets/wallet-999/transactions/tx-001')).toBe(true);
      // Mismatched intermediate segment or segment count
      expect(matchesResource(pattern, 'wallets/wallet-123/transfers/tx-456')).toBe(false);
      expect(matchesResource(pattern, 'wallets/wallet-123/transactions')).toBe(false);
    });

    it('handles empty or malformed inputs safely', () => {
      expect(matchesResource('', 'transactions')).toBe(false);
      expect(matchesResource('transactions', '')).toBe(false);
      expect(matchesResource(null as unknown as string, 'transactions')).toBe(false);
      expect(matchesResource('transactions', undefined as unknown as string)).toBe(false);
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

    it('ranks 3-segment exact higher than 3-segment with wildcards', () => {
      const allExact = calculateSpecificity('wallets/wallet-789/transactions'); // 30
      const oneWildcard = calculateSpecificity('wallets/*/transactions'); // 21
      const twoWildcards = calculateSpecificity('wallets/*/*'); // 12

      expect(allExact).toBeGreaterThan(oneWildcard);
      expect(oneWildcard).toBeGreaterThan(twoWildcards);
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
  });
});
