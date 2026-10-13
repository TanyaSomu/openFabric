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
 * - '*' (single global wildcard): Matches any resource path regardless of segment count.
 * - Segment-based patterns: Evaluated segment-by-segment.
 *   - The number of segments must match exactly.
 *   - An exact segment 'transactions' matches only 'transactions'.
 *   - A wildcard segment '*' matches any single non-empty segment at that position.
 *   - Slashes or malformed substrings do not cross segment boundaries.
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

  // Global wildcard matches any resource
  if (cleanPattern === '*') {
    return true;
  }

  const patternSegments = cleanPattern.split('/');
  const targetSegments = cleanTarget.split('/');

  // Segment count must match
  if (patternSegments.length !== targetSegments.length) {
    return false;
  }

  for (let i = 0; i < patternSegments.length; i++) {
    const pSeg = patternSegments[i];
    const tSeg = targetSegments[i];

    if (pSeg === '*') {
      // Wildcard matches any non-empty single segment
      if (!tSeg || tSeg.length === 0) {
        return false;
      }
      continue;
    }

    // Exact segment match
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
 * Higher score indicates higher specificity.
 * For example, for target 'wallets/wallet-789':
 *   - '*' -> score 0
 *   - 'wallets/*' -> score 11 (10 + 1)
 *   - 'wallets/wallet-789' -> score 20 (10 + 10)
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
