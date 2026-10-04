// Blocking flags (TZ: "Rating model" → blocking flags).
import type { Flag, FlagKind, FlagLevel, Id, Verification } from '../types';

/** Initial level. A data mismatch starts yellow ("Clarify your data") and turns red after the grace period. */
export const FLAG_LEVEL: Record<FlagKind, FlagLevel> = {
  liquidated: 'red',
  data_mismatch: 'yellow',
  fraud_blocked: 'red',
  suspected_linked: 'yellow',
};

/** Flags implied by a registry check. Not found in the registry counts as a mismatch. */
export function flagKindsFromVerification(v: Verification): FlagKind[] {
  const kinds: FlagKind[] = [];
  if (!v.record) return ['data_mismatch'];
  if (v.record.status !== undefined && v.record.status !== 'active') kinds.push('liquidated');
  if (!v.matchesProfile) kinds.push('data_mismatch');
  return kinds;
}

export function profileMatchesRecord(legalName: string, recordName: string): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  return norm(legalName) === norm(recordName);
}

export function activeFlags(flags: readonly Flag[], companyId: Id): Flag[] {
  return flags.filter((f) => f.companyId === companyId && !f.resolvedAt);
}

export function hasRedFlag(flags: readonly Flag[], companyId: Id): boolean {
  return activeFlags(flags, companyId).some((f) => f.level === 'red');
}

/** Companies whose listings are hidden by a flag ("blocked"). */
export function isBlocked(flags: readonly Flag[], companyId: Id): boolean {
  return activeFlags(flags, companyId).some((f) => f.kind === 'fraud_blocked');
}
