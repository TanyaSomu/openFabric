import { UserPermission } from '../types/authorization.types';

export interface MatchEvaluation {
  permission: UserPermission;
  matches: boolean;
  specificity: number;
}

/**
 * Checks if a permission resource pattern matches a normalized target resource path.
 *
 * Matching semantics:
 * 1. Global wildcard '*': Matches any target path regardless of depth or segment count.
 * 2. Exact & Segment-Wildcard Match: When pattern and target have the same number of segments,
 *    each segment must match literally or via '*' wildcard.
 * 3. Wildcard Collection-Write Match: When a pattern ends with '/*' (e.g. 'wallets/*\/transactions/*')
 *    representing items in a collection, it matches requests targeting the parent collection
 *    itself (e.g. 'wallets/wallet-789/transactions').
 * 4. Hierarchical Parent-to-Child Inheritance: Permissions defined on a collection
 *    (e.g. 'transactions', 'accounts', 'wallets', 'wallets/:walletId/transactions')
 *    apply to member entity items within that collection (e.g. 'transactions/txn-456',
 *    'accounts/acc-456', 'wallets/wallet-789/transactions/txn-456').
 *    - Patterns ending in '/*' are item wildcards and do not inherit to deeper descendants.
 *    - Entity-level permissions on single wallet instances ('wallets/:walletId') do not cross
 *      into independent child collections ('transactions').
 * 5. Strict Segment Boundaries: Substring or prefix matches across segment boundaries
 *    (e.g. 'wallets/wallet-789' vs 'wallets/wallet-7899') are strictly forbidden.
 */
export function matchesResource(pattern: string, targetPath: string): boolean {
  if (!pattern || typeof pattern !== 'string') {
    return false;
  }
  if (!targetPath || typeof targetPath !== 'string') {
    return false;
  }

  const cleanPattern = pattern.trim();
  const cleanTarget = targetPath.trim();

  // 1. Global wildcard matches any resource
  if (cleanPattern === '*') {
    return true;
  }

  const patternSegments = cleanPattern.split('/');
  const targetSegments = cleanTarget.split('/');

  // 2. Exact or segment-wildcard match (same segment count)
  if (patternSegments.length === targetSegments.length) {
    return segmentsMatch(patternSegments, targetSegments);
  }

  // 3. Wildcard Collection Match:
  // Pattern ends with '/*' (e.g. 'wallets/*/transactions/*') and target is the collection (e.g. 'wallets/wallet-789/transactions')
  // Pattern has 1 more segment than target, and pattern's last segment is '*'
  if (
    patternSegments.length === targetSegments.length + 1 &&
    patternSegments[patternSegments.length - 1] === '*'
  ) {
    const patternPrefix = patternSegments.slice(0, -1);
    if (segmentsMatch(patternPrefix, targetSegments)) {
      return true;
    }
  }

  // 4. Hierarchical Parent-to-Child Inheritance:
  // When pattern has fewer segments than target (pattern is an ancestor)
  if (patternSegments.length < targetSegments.length) {
    // Patterns ending in a wildcard '*' represent item-level matches at a specific depth,
    // and do not inherit down into deeper descendants.
    if (patternSegments[patternSegments.length - 1] === '*') {
      return false;
    }

    // Check if pattern is a prefix of target
    const targetPrefix = targetSegments.slice(0, patternSegments.length);
    if (!segmentsMatch(patternSegments, targetPrefix)) {
      return false;
    }

    // Boundary check: A wallet entity instance (wallets/:id, 2 segments)
    // cannot inherit into a separate sub-collection (transactions, segment index 2).
    // Transactions within a wallet require collection-level permissions.
    if (
      patternSegments[0] === 'wallets' &&
      patternSegments.length === 2 &&
      targetSegments[2] === 'transactions'
    ) {
      return false;
    }

    // Top-level collection inheritance (e.g., 'transactions' -> 'transactions/txn-456',
    // 'accounts' -> 'accounts/acc-456', 'wallets' -> 'wallets/wallet-789')
    // or sub-collection inheritance ('wallets/:id/transactions' -> 'wallets/:id/transactions/txn-456')
    return true;
  }

  return false;
}

/**
 * Compares two segment arrays element-by-element with segment wildcard '*' support.
 */
function segmentsMatch(patternSegments: string[], targetSegments: string[]): boolean {
  if (patternSegments.length !== targetSegments.length) {
    return false;
  }

  for (let i = 0; i < patternSegments.length; i++) {
    const pSeg = patternSegments[i];
    const tSeg = targetSegments[i];

    if (pSeg === '*') {
      if (!tSeg || tSeg.length === 0) {
        return false;
      }
      continue;
    }

    if (pSeg !== tSeg) {
      return false;
    }
  }

  return true;
}

/**
 * Calculates a deterministic specificity score for a pattern matching a target resource.
 *
 * Specificity scoring:
 * - Global wildcard '*': score = 0
 * - Segmented patterns:
 *   - Wildcard segment '*': 1 point
 *   - Exact segment match: 10 points
 *
 * Examples:
 *   - '*' -> score 0
 *   - 'transactions' -> score 10 (parent collection)
 *   - 'transactions/*' -> score 11 (child wildcard)
 *   - 'transactions/txn-456' -> score 20 (child exact)
 *   - 'wallets/*' -> score 11
 *   - 'wallets/wallet-789' -> score 20
 *   - 'wallets/*\/transactions/*' -> score 22
 *   - 'wallets/wallet-789/transactions' -> score 30
 *   - 'wallets/wallet-789/transactions/txn-456' -> score 40
 */
export function calculateSpecificity(pattern: string): number {
  const cleanPattern = pattern.trim();
  if (cleanPattern === '*') {
    return 0;
  }

  const segments = cleanPattern.split('/');
  let score = 0;

  for (const seg of segments) {
    if (seg === '*') {
      score += 1;
    } else {
      score += 10;
    }
  }

  return score;
}

/**
 * Evaluates a list of permissions against a target resource path.
 * Filters matching permissions and computes their specificity.
 */
export function evaluatePermissions(
  permissions: UserPermission[],
  targetPath: string,
): MatchEvaluation[] {
  return permissions
    .filter((perm) => matchesResource(perm.resource, targetPath))
    .map((perm) => ({
      permission: perm,
      matches: true,
      specificity: calculateSpecificity(perm.resource),
    }));
}
