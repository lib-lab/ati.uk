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
  | 'template_not_found';

export type CommandResult = { ok: true; state: AppState } | { ok: false; error: CommandError };
