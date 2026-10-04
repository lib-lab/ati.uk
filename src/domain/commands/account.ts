// Inactive companies (TZ: "Against outdated data"): hidden from search after 6 months without login,
// rating and history kept, warning 2 weeks before; return by login + contact confirmation.
import { CONFIG } from '../config';
import { logEvent } from '../events';
import { addNotification } from '../notifications';
import { addDays, addMonths, isBefore } from '../time';
import type { AppState, Company, IsoDate } from '../types';
import type { TimeProcess } from './time';

export function hideAt(company: Pick<Company, 'lastLoginAt'>): IsoDate {
  return addMonths(company.lastLoginAt, CONFIG.inactivity.hideAfterMonths);
}

export const inactivityProcess: TimeProcess = {
  reasonKey: 'event.company.hidden',
  run(state, _from, to) {
    let s: AppState = state;
    for (const c of state.companies) {
      if (c.status === 'deactivated') continue;
      const hide = hideAt(c);
      if (!isBefore(to, hide)) {
        s = { ...s, companies: s.companies.map((x) => (x.id === c.id ? { ...x, status: 'deactivated' } : x)) };
        s = logEvent(s, {
          type: 'company_deactivated',
          actor: 'system',
          subjectIds: [c.id],
          reasonKey: 'event.company.hidden',
          params: { target: c.id, months: CONFIG.inactivity.hideAfterMonths },
        });
        s = addNotification(s, c.id, 'deactivated', {});
        continue;
      }
      const warnFrom = addDays(hide, -CONFIG.inactivity.warnDaysBefore);
      if (!isBefore(to, warnFrom) && !c.inactivityWarnedAt) {
        s = { ...s, companies: s.companies.map((x) => (x.id === c.id ? { ...x, inactivityWarnedAt: to } : x)) };
        s = addNotification(s, c.id, 'inactivity_warning', { until: hide });
      }
    }
    return s;
  },
};
