// All user-facing strings. Sentence case. Placeholders: {name}.
export const en = {
  'app.title': 'Freight board',
  'app.prototypeBadge': 'prototype',

  'nav.companies': 'Log in as',

  'topbar.actingAs': 'Acting as',
  'topbar.today': 'Today',
  'topbar.reset': 'Reset data',
  'topbar.resetConfirm': 'Reset all data to the initial seed? Everything you changed will be lost.',
  'topbar.balance': 'Balance',

  'role.shipper': 'Shipper',
  'role.carrier': 'Carrier',
  'role.forwarder': 'Forwarder',
  'role.moderator': 'Moderator',

  'flag.liquidated': 'Not recommended',
  'flag.data_mismatch': 'Data not confirmed',
  'flag.fraud_blocked': 'Blocked',
  'flag.suspected_linked': 'Under review',

  'companies.title': 'Log in as',
  'companies.hint': 'Pick any company to act on its behalf. Switching counts as a login.',
  'companies.col.company': 'Company',
  'companies.col.role': 'Role',
  'companies.col.country': 'Country',
  'companies.col.balance': 'Balance',
  'companies.col.flags': 'Flags',
  'companies.col.scenario': 'Seed profile',
  'companies.loginButton': 'Log in',
  'companies.current': 'Current',
  'companies.moderatorNote': 'Reviews complaints, claims and flags',

  'event.seeded': 'Data seeded: {companies} companies, {listings} listings',
  'event.login': 'Logged in',

  'error.company_not_found': 'Company not found',
  'error.listing_not_found': 'Listing not found',
  'error.not_allowed': 'This action is not allowed',
  'error.insufficient_funds': 'Not enough balance',
} as const;

export type MessageKey = keyof typeof en;
