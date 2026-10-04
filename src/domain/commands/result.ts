import type { AppState } from '../types';

/** Error codes are i18n keys under "error.". */
export type CommandError =
  | 'company_not_found'
  | 'listing_not_found'
  | 'not_allowed'
  | 'insufficient_funds'
  | 'invalid_listing'
  | 'role_cannot_post'
  | 'listing_not_active'
  | 'already_open'
  | 'already_priority'
  | 'template_not_found'
  | 'invalid_review'
  | 'review_not_allowed'
  | 'review_too_soon'
  | 'invalid_claim'
  | 'claim_not_allowed'
  | 'complaint_not_allowed'
  | 'not_found'
  | 'daily_limit'
  | 'human_check_required'
  | 'slow_down'
  | 'collection_blocked'
  | 'no_history'
  | 'refund_not_available'
  | 'account_deleted'
  | 'confirmation_mismatch'
  | 'subscription_exists'
  | 'invalid_registration'
  | 'consent_required'
  | 'already_registered'
  | 'package_active';

/**
 * A failed command may still carry a state to keep (e.g. a failed human check is counted):
 * the store persists `state` when present.
 */
export type CommandResult = { ok: true; state: AppState } | { ok: false; error: CommandError; state?: AppState };
