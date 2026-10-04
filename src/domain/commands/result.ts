import type { AppState } from '../types';

/** Error codes are i18n keys under "error.". */
export type CommandError = 'company_not_found' | 'listing_not_found' | 'not_allowed' | 'insufficient_funds';

export type CommandResult = { ok: true; state: AppState } | { ok: false; error: CommandError };
