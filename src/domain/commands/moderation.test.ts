import { describe, expect, it } from 'vitest';
import { buildSeedState } from '../../seed';
import { CONFIG } from '../config';
import { complaintShare, complaintWeight } from '../rules/complaints';
import { freeContactsLeft } from '../rules/contactAccess';
import { detectSuspicions } from '../rules/detector';
import { activeFlags } from '../rules/flags';
import { balanceOf } from '../rules/ledger';
import { computeRating, countedReviews } from '../rules/rating';
import { searchListings } from '../rules/search';
import { cargo, company, emptyState, NOW } from '../testing/fixtures';
import { addDays, addMonths } from '../time';
import { MODERATOR_ID, type AppState, type ContactAccess, type ComplaintType } from '../types';
import { canDispute, openDispute, openDisputeFor, resolveDispute } from './disputes';
import {
  applyDetector, confirmClaim, confirmComplaint, confirmContactData, confirmFraud, fileComplaint, fixProfileData,
  rejectClaim, rejectComplaint, resolveFlag, respondToComplaint, runDetector, setFlag,
} from './moderation';
import type { CommandResult } from './result';
import { loginAs } from './session';
import { advanceTime } from './time';

const ok = (r: CommandResult): AppState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
const as = (s: AppState, actorId: string): AppState => ({ ...s, actorId });

const REPORTERS = ['v1', 'v2', 'v3', 'v4'];

/** Owner "o" with listings l1..l4; reporters v1..v4 each opened o's contact for €5. */
function base(paidWith: ContactAccess['paidWith'] = 'balance', openedAt = NOW): AppState {
  return emptyState({
    companies: ['o', ...REPORTERS].map((id) => company(id)),
    listings: ['l1', 'l2', 'l3', 'l4'].map((id) => cargo(id, 'o')),
    contactAccesses: REPORTERS.map((v) => ({
      id: `acc-${v}`, viewerId: v, ownerId: 'o', firstListingId: 'l1', openedAt, paidWith, transactionId: paidWith === 'balance' ? `tx-${v}` : undefined,
    })),
    transactions: REPORTERS.flatMap((v) => [
      { id: `top-${v}`, companyId: v, type: 'topup' as const, amount: 1000, createdAt: addDays(NOW, -40) },
      ...(paidWith === 'balance' ? [{ id: `tx-${v}`, companyId: v, type: 'contact' as const, amount: -CONFIG.prices.contact, createdAt: openedAt, refId: `acc-${v}` }] : []),
    ]),
  });
}

function complainAndConfirm(s0: AppState, reporter: string, listing: string, type: ComplaintType): AppState {
  let s = ok(fileComplaint(as(s0, reporter), listing, type));
  s = ok(confirmComplaint(as(s, MODERATOR_ID), s.complaints.at(-1)!.id));
  return s;
}

describe('fileComplaint and the answer', () => {
  it('"does not answer" and "wrong data" need an opened contact; "outdated" does not; one per listing per reporter', () => {
    const s = { ...base(), companies: [...base().companies, company('x')] };
    expect(fileComplaint(as(s, 'x'), 'l1', 'no_response')).toEqual({ ok: false, error: 'complaint_not_allowed' });
    expect(fileComplaint(as(s, 'x'), 'l1', 'wrong_contact')).toEqual({ ok: false, error: 'complaint_not_allowed' });
    const s2 = ok(fileComplaint(as(s, 'x'), 'l1', 'outdated'));
    expect(fileComplaint(as(s2, 'x'), 'l1', 'outdated')).toEqual({ ok: false, error: 'complaint_not_allowed' });
    expect(fileComplaint(as(s, 'o'), 'l1', 'outdated')).toEqual({ ok: false, error: 'complaint_not_allowed' });
  });

  it('the company is notified and can answer once before the decision', () => {
    let s = ok(fileComplaint(as(base(), 'v1'), 'l1', 'no_response'));
    expect(s.notifications.find((n) => n.companyId === 'o')).toMatchObject({ type: 'complaint_received' });
    const id = s.complaints[0]!.id;
    expect(respondToComplaint(as(s, 'v1'), id, 'x')).toEqual({ ok: false, error: 'not_allowed' });
    s = ok(respondToComplaint(as(s, 'o'), id, 'We answer from 8 to 17'));
    expect(s.complaints[0]!.response?.text).toBe('We answer from 8 to 17');
    expect(respondToComplaint(as(s, 'o'), id, 'again')).toEqual({ ok: false, error: 'not_allowed' });
    s = ok(confirmComplaint(as(s, MODERATOR_ID), id));
    expect(respondToComplaint(as(s, 'o'), id, 'late')).toEqual({ ok: false, error: 'not_allowed' });
  });
});

describe('refunds', () => {
  it('objectively wrong data: the reporter gets the money back at once', () => {
    const before = balanceOf(base().transactions, 'v1');
    const s = complainAndConfirm(base(), 'v1', 'l1', 'wrong_contact');
    expect(balanceOf(s.transactions, 'v1')).toBe(before + CONFIG.prices.contact);
    expect(s.notifications.filter((n) => n.companyId === 'v1').map((n) => n.type)).toEqual(['complaint_resolved', 'refund']);
  });

  it('"does not answer": no refund for a single reporter; refunds for all once two independent companies confirm', () => {
    let s = complainAndConfirm(base(), 'v1', 'l1', 'no_response');
    expect(balanceOf(s.transactions, 'v1')).toBe(500);
    s = complainAndConfirm(s, 'v2', 'l2', 'no_response');
    expect(balanceOf(s.transactions, 'v1')).toBe(1000);
    expect(balanceOf(s.transactions, 'v2')).toBe(1000);
    expect(s.events.filter((e) => e.reasonKey === 'event.refund.money')).toHaveLength(2);
  });

  it('reporters sharing a device count once', () => {
    const shared = { ...base(), companies: base().companies.map((c) => (c.id === 'v1' || c.id === 'v2' ? { ...c, deviceId: 'same' } : c)) };
    let s = complainAndConfirm(shared, 'v1', 'l1', 'no_response');
    s = complainAndConfirm(s, 'v2', 'l2', 'no_response');
    expect(balanceOf(s.transactions, 'v1')).toBe(500);
  });

  it('the free contact returns to the quota in the same month, nothing in a later month', () => {
    let s = complainAndConfirm(base('free_quota'), 'v1', 'l1', 'wrong_contact');
    expect(freeContactsLeft(s, 'v1', NOW)).toBe(3);
    s = complainAndConfirm(base('free_quota', addDays(NOW, -40)), 'v1', 'l1', 'wrong_contact');
    expect(s.events.some((e) => e.type === 'refund')).toBe(false);
  });

  it('refunds per account are limited; reporters with a high refund share weigh less', () => {
    const many = emptyState({
      companies: ['v', 'a', 'b', 'c', 'd'].map((id) => company(id)),
      listings: ['a', 'b', 'c', 'd'].map((o) => cargo(`l-${o}`, o)),
      contactAccesses: ['a', 'b', 'c', 'd'].map((o) => ({ id: `acc-${o}`, viewerId: 'v', ownerId: o, firstListingId: `l-${o}`, openedAt: NOW, paidWith: 'balance' as const, transactionId: `tx-${o}` })),
      transactions: [
        { id: 'top', companyId: 'v', type: 'topup', amount: 2000, createdAt: addDays(NOW, -40) },
        ...['a', 'b', 'c', 'd'].map((o) => ({ id: `tx-${o}`, companyId: 'v', type: 'contact' as const, amount: -500, createdAt: NOW, refId: `acc-${o}` })),
      ],
    });
    let s = many;
    for (const o of ['a', 'b', 'c', 'd']) s = complainAndConfirm(s, 'v', `l-${o}`, 'wrong_contact');
    expect(balanceOf(s.transactions, 'v')).toBe(CONFIG.complaints.refundLimitPerWindow * 500);
    expect(s.events.some((e) => e.reasonKey === 'event.refund.limit')).toBe(true);
    expect(complaintWeight(s, 'v')).toBe(CONFIG.complaints.highRefundWeight);
  });

  it('a rejected complaint refunds nothing', () => {
    let s = ok(fileComplaint(as(base(), 'v1'), 'l1', 'wrong_contact'));
    s = ok(rejectComplaint(as(s, MODERATOR_ID), s.complaints[0]!.id));
    expect(balanceOf(s.transactions, 'v1')).toBe(500);
  });
});

describe('hiding by the share of confirmed complaints', () => {
  it('3 confirmed out of 4 opened contacts (75 %) hide the listings until contact data is confirmed', () => {
    let s = base();
    for (const [v, l] of [['v1', 'l1'], ['v2', 'l2'], ['v3', 'l3']] as const) s = complainAndConfirm(s, v, l, 'outdated');
    expect(complaintShare(s, 'o', s.now)).toMatchObject({ count: 3, contacts: 4, hides: true });
    expect(searchListings(s, { kind: 'cargo' }, s.now)).toHaveLength(0);
    expect(s.notifications.some((n) => n.companyId === 'o' && n.type === 'listings_hidden')).toBe(true);
    s = ok(confirmContactData(as(s, 'o')));
    expect(searchListings(s, { kind: 'cargo' }, s.now)).toHaveLength(4);
  });

  it('3 confirmed complaints are not enough when the company had many contacts (share below 20 %)', () => {
    let s = base();
    const extra = Array.from({ length: 16 }, (_, i) => `w${i}`);
    s = {
      ...s,
      companies: [...s.companies, ...extra.map((id) => company(id))],
      contactAccesses: [...s.contactAccesses, ...extra.map((w) => ({ id: `acc-${w}`, viewerId: w, ownerId: 'o', firstListingId: 'l1', openedAt: NOW, paidWith: 'balance' as const }))],
    };
    for (const [v, l] of [['v1', 'l1'], ['v2', 'l2'], ['v3', 'l3']] as const) s = complainAndConfirm(s, v, l, 'outdated');
    expect(complaintShare(s, 'o', s.now)).toMatchObject({ count: 3, contacts: 20, hides: false });
    expect(searchListings(s, { kind: 'cargo' }, s.now)).toHaveLength(4);
  });
});

describe('claims', () => {
  it('the moderator confirms (keeps counting after 30 days) or rejects (stops counting)', () => {
    let s = emptyState({
      companies: [company('a'), company('t')],
      contactAccesses: [{ id: 'x', viewerId: 'a', ownerId: 't', firstListingId: '', openedAt: NOW, paidWith: 'balance' }],
      claims: [{ id: 'cl', claimantId: 'a', targetId: 't', text: '', status: 'open', createdAt: NOW }],
    });
    const clean = computeRating({ ...s, claims: [] }, 't', NOW).score;
    expect(confirmClaim(as(s, 'a'), 'cl')).toEqual({ ok: false, error: 'not_allowed' });
    s = ok(confirmClaim(as(s, MODERATOR_ID), 'cl'));
    expect(computeRating(s, 't', addDays(NOW, 40)).score).toBeLessThan(computeRating({ ...s, claims: [] }, 't', addDays(NOW, 40)).score);
    s = ok(rejectClaim(s, 'cl'));
    expect(computeRating(s, 't', NOW).score).toBe(clean);
  });
});

describe('flags', () => {
  it('blocking hides listings; unblocking shows them again; registry flags cannot be removed by the moderator', () => {
    const seed = as(buildSeedState(), MODERATOR_ID);
    let s = ok(setFlag(seed, 'c01', 'fraud_blocked', 'test'));
    expect(searchListings(s, { kind: 'cargo' }, s.now).some((l) => l.ownerId === 'c01')).toBe(false);
    s = ok(resolveFlag(s, activeFlags(s.flags, 'c01')[0]!.id));
    expect(searchListings(s, { kind: 'cargo' }, s.now).some((l) => l.ownerId === 'c01')).toBe(true);
    expect(resolveFlag(seed, activeFlags(seed.flags, 'c11')[0]!.id)).toEqual({ ok: false, error: 'not_allowed' });
  });

  it('data mismatch: yellow "clarify your data", red after 14 days unless fixed', () => {
    const seed = buildSeedState(); // c12's mismatch was found 5 days ago
    const flagOf = (s: AppState) => activeFlags(s.flags, 'c12').find((f) => f.kind === 'data_mismatch');
    expect(flagOf(seed)?.level).toBe('yellow');
    const week = ok(advanceTime(seed, addDays(seed.now, 7)));
    expect(flagOf(week)?.level).toBe('yellow');
    const later = ok(advanceTime(week, addDays(seed.now, 10)));
    expect(flagOf(later)?.level).toBe('red');
    expect(later.notifications.some((n) => n.companyId === 'c12' && n.type === 'flag_escalated')).toBe(true);
    const fixed = ok(fixProfileData(as(seed, 'c12')));
    expect(flagOf(fixed)).toBeUndefined();
    expect(fixed.companies.find((c) => c.id === 'c12')!.verification.matchesProfile).toBe(true);
  });
});

describe('closed ring detector', () => {
  it('seed: only the c19–c21 ring; a shared device (c13/c14) and honest mutual reviews give no flag', () => {
    const seed = buildSeedState();
    const found = detectSuspicions(seed);
    expect(found.map((x) => x.companyId).sort()).toEqual(['c19', 'c20', 'c21']);
    expect(found.find((x) => x.companyId === 'c19')!.ringWith).toEqual(['c20', 'c21']);
  });

  it('the ring flag excludes only reviews inside the ring; confirmed fraud voids them for good', () => {
    let s = ok(runDetector(as(buildSeedState(), MODERATOR_ID)));
    const flag = activeFlags(s.flags, 'c19').find((f) => f.kind === 'suspected_linked')!;
    expect(flag).toMatchObject({ level: 'yellow', source: 'detector', relatedIds: ['c20', 'c21'] });
    expect(countedReviews(s, 'c20')).toHaveLength(0);
    // a review from a ring member about an outside company still counts
    s = { ...s, contactAccesses: [...s.contactAccesses, { id: 'ext', viewerId: 'c19', ownerId: 'c01', firstListingId: '', openedAt: s.now, paidWith: 'balance' }] };
    s = { ...s, reviews: [...s.reviews, { id: 'ext-r', authorId: 'c19', targetId: 'c01', stars: 4, dealHappened: true, text: '', createdAt: s.now }] };
    expect(countedReviews(s, 'c01').some((r) => r.id === 'ext-r')).toBe(true);
    s = ok(confirmFraud(s, flag.id));
    expect(activeFlags(s.flags, 'c19').map((f) => f.kind)).toEqual(['fraud_blocked']);
    expect(s.reviews.filter((r) => r.authorId === 'c19' && r.targetId !== 'c01').every((r) => r.voided)).toBe(true);
    expect(s.reviews.find((r) => r.id === 'ext-r')!.voided).toBeUndefined();
  });

  it('companies the moderator cleared are not flagged again', () => {
    let s = ok(runDetector(as(buildSeedState(), MODERATOR_ID)));
    const f = activeFlags(s.flags, 'c19').find((x) => x.kind === 'suspected_linked')!;
    s = ok(resolveFlag(s, f.id));
    expect(applyDetector(s).flags.filter((x) => x.companyId === 'c19' && x.kind === 'suspected_linked')).toHaveLength(1);
  });
});

describe('inactivity', () => {
  it('warning 2 weeks before, hidden after 6 months, rating kept, return by login + contact confirmation', () => {
    const seed = buildSeedState(); // c17: last login 165 days ago
    const hideAt = addMonths(seed.companies.find((c) => c.id === 'c17')!.lastLoginAt, 6);
    const scoreBefore = computeRating(seed, 'c17', seed.now).score;
    let s = ok(advanceTime(seed, addDays(seed.now, 7)));
    expect(s.notifications.some((n) => n.companyId === 'c17' && n.type === 'inactivity_warning')).toBe(true);
    expect(s.companies.find((c) => c.id === 'c17')!.status).toBe('active');
    s = ok(advanceTime(s, addDays(hideAt, 1)));
    expect(s.companies.find((c) => c.id === 'c17')!.status).toBe('deactivated');
    expect(searchListings(s, { kind: 'truck' }, s.now).some((l) => l.ownerId === 'c17')).toBe(false);
    expect(computeRating(s, 'c17', s.now).score).toBeGreaterThan(0);
    expect(Math.abs(computeRating(s, 'c17', s.now).score - scoreBefore)).toBeLessThan(15);
    s = ok(loginAs(s, 'c17'));
    expect(s.companies.find((c) => c.id === 'c17')!.status).toBe('deactivated'); // login alone does not return
    s = ok(confirmContactData(s));
    expect(s.companies.find((c) => c.id === 'c17')!.status).toBe('active');
    expect(s.events.at(-1)!.reasonKey).toBe('event.company.reactivated');
  });
});

describe('disputes', () => {
  it('only the company concerned disputes, once at a time; the moderator queue resolves it', () => {
    let s = ok(fileComplaint(as(base(), 'v1'), 'l1', 'outdated'));
    s = ok(confirmComplaint(as(s, MODERATOR_ID), s.complaints[0]!.id));
    const id = s.complaints[0]!.id;
    expect(canDispute(s, 'complaint', id, 'v1')).toBe(false);
    expect(canDispute(s, 'complaint', id, 'o')).toBe(true);
    s = ok(openDispute(as(s, 'o'), 'complaint', id, 'The listing was up to date'));
    expect(openDisputeFor(s, 'complaint', id)).toBeDefined();
    expect(openDispute(as(s, 'o'), 'complaint', id, 'again')).toEqual({ ok: false, error: 'not_allowed' });
    s = ok(resolveDispute(as(s, MODERATOR_ID), s.disputes[0]!.id, true));
    expect(s.complaints[0]!.status).toBe('rejected');
    expect(s.notifications.at(-1)).toMatchObject({ companyId: 'o', type: 'dispute_resolved' });
  });

  it('accepting a dispute on a flag removes it; on a claim rejects it; rating events can be disputed by the rated company', () => {
    let s = as(buildSeedState(), MODERATOR_ID);
    s = ok(setFlag(s, 'c01', 'fraud_blocked'));
    const flag = activeFlags(s.flags, 'c01')[0]!;
    s = ok(openDispute(as(s, 'c01'), 'flag', flag.id, 'Mistake'));
    s = ok(resolveDispute(as(s, MODERATOR_ID), s.disputes.at(-1)!.id, true));
    expect(activeFlags(s.flags, 'c01')).toHaveLength(0);

    const claim = s.claims.find((c) => c.targetId === 'c09' && c.status === 'open')!;
    s = ok(openDispute(as(s, 'c09'), 'claim', claim.id, 'Delivered in time'));
    s = ok(resolveDispute(as(s, MODERATOR_ID), s.disputes.at(-1)!.id, true));
    expect(s.claims.find((c) => c.id === claim.id)!.status).toBe('rejected');

    const ratingEvent = s.events.find((e) => e.type === 'rating_changed')!;
    const rated = ratingEvent.subjectIds[0]!;
    expect(canDispute(s, 'event', ratingEvent.id, rated)).toBe(true);
    expect(canDispute(s, 'event', ratingEvent.id, rated === 'c02' ? 'c03' : 'c02')).toBe(false);
  });
});
