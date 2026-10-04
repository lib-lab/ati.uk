import { describe, expect, it } from 'vitest';
import { buildSeedState } from '../../seed';
import { CONFIG } from '../config';
import { freeContactsLeft } from '../rules/contactAccess';
import { detectSuspicions } from '../rules/detector';
import { activeFlags } from '../rules/flags';
import { balanceOf } from '../rules/ledger';
import { computeRating } from '../rules/rating';
import { searchListings } from '../rules/search';
import { cargo, company, emptyState, NOW, review } from '../testing/fixtures';
import { addDays } from '../time';
import { MODERATOR_ID, type AppState, type ContactAccess, type LedgerTransaction } from '../types';
import {
  applyDetector, confirmComplaint, confirmContactData, confirmFraud, fileComplaint, rejectClaim, rejectComplaint, resolveFlag, runDetector, setFlag,
} from './moderation';
import type { CommandResult } from './result';

const ok = (r: CommandResult): AppState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
const as = (s: AppState, actorId: string): AppState => ({ ...s, actorId });

function base(paidWith: ContactAccess['paidWith'] = 'balance', openedAt = NOW): AppState {
  const tx: LedgerTransaction = { id: 'tx1', companyId: 'v', type: 'contact', amount: -CONFIG.prices.contact, createdAt: openedAt, refId: 'acc' };
  return emptyState({
    companies: ['v', 'o', 'x1', 'x2', 'x3'].map((id) => company(id)),
    listings: [cargo('l1', 'o'), cargo('l2', 'o'), cargo('l3', 'o')],
    contactAccesses: [{ id: 'acc', viewerId: 'v', ownerId: 'o', firstListingId: 'l1', openedAt, paidWith, transactionId: paidWith === 'balance' ? 'tx1' : undefined }],
    transactions: [{ id: 'top', companyId: 'v', type: 'topup', amount: 1000, createdAt: addDays(NOW, -40) }, ...(paidWith === 'balance' ? [tx] : [])],
    actorId: 'v',
  });
}

describe('fileComplaint', () => {
  it('"does not answer" needs an opened contact; "outdated" does not; one per listing per reporter', () => {
    const s = base();
    expect(fileComplaint(as(s, 'x1'), 'l1', 'no_response')).toEqual({ ok: false, error: 'complaint_not_allowed' });
    const s2 = ok(fileComplaint(as(s, 'x1'), 'l1', 'outdated'));
    expect(s2.complaints[0]).toMatchObject({ reporterId: 'x1', targetId: 'o', type: 'outdated', status: 'pending' });
    expect(fileComplaint(as(s2, 'x1'), 'l1', 'outdated')).toEqual({ ok: false, error: 'complaint_not_allowed' });
    expect(fileComplaint(as(s, 'o'), 'l1', 'outdated')).toEqual({ ok: false, error: 'complaint_not_allowed' }); // own listing
    expect(ok(fileComplaint(s, 'l1', 'no_response')).complaints).toHaveLength(1);
  });
});

describe('confirming "does not answer"', () => {
  it('refunds the paid amount, notifies the reporter and logs it', () => {
    let s = ok(fileComplaint(base(), 'l1', 'no_response'));
    const before = balanceOf(s.transactions, 'v');
    expect(confirmComplaint(s, s.complaints[0]!.id)).toEqual({ ok: false, error: 'not_allowed' }); // not moderator
    s = ok(confirmComplaint(as(s, MODERATOR_ID), s.complaints[0]!.id));
    expect(balanceOf(s.transactions, 'v')).toBe(before + CONFIG.prices.contact);
    expect(s.complaints[0]).toMatchObject({ status: 'confirmed', resolvedAt: NOW });
    expect(s.contactAccesses[0]!.refundedAt).toBe(NOW);
    expect(s.notifications.map((n) => n.type)).toEqual(['refund', 'complaint_resolved']);
    expect(s.events.map((e) => e.type)).toEqual(expect.arrayContaining(['refund', 'complaint_resolved']));
  });

  it('returns the free contact in the same month, nothing in a later month', () => {
    let s = ok(fileComplaint(base('free_quota'), 'l1', 'no_response'));
    expect(freeContactsLeft(s, 'v', NOW)).toBe(2);
    s = ok(confirmComplaint(as(s, MODERATOR_ID), s.complaints[0]!.id));
    expect(freeContactsLeft(s, 'v', NOW)).toBe(3);
    expect(s.events.some((e) => e.reasonKey === 'event.refund.quota')).toBe(true);

    let old = ok(fileComplaint(base('free_quota', addDays(NOW, -40)), 'l1', 'no_response'));
    old = ok(confirmComplaint(as(old, MODERATOR_ID), old.complaints[0]!.id));
    expect(old.events.some((e) => e.type === 'refund')).toBe(false);
    expect(old.complaints[0]!.status).toBe('confirmed');
  });

  it('a rejected complaint refunds nothing', () => {
    let s = ok(fileComplaint(base(), 'l1', 'no_response'));
    const before = balanceOf(s.transactions, 'v');
    s = ok(rejectComplaint(as(s, MODERATOR_ID), s.complaints[0]!.id));
    expect(balanceOf(s.transactions, 'v')).toBe(before);
    expect(s.complaints[0]!.status).toBe('rejected');
  });
});

describe('3 confirmed complaints in 30 days', () => {
  const threeConfirmed = (s0: AppState, at = NOW): AppState => {
    let s = { ...s0, now: at };
    for (const [reporter, listing] of [['x1', 'l1'], ['x2', 'l2'], ['x3', 'l3']] as const) {
      s = ok(fileComplaint(as(s, reporter), listing, 'outdated'));
      s = ok(confirmComplaint(as(s, MODERATOR_ID), s.complaints.at(-1)!.id));
    }
    return s;
  };

  it('hides the owner’s listings until contact data is confirmed', () => {
    let s = threeConfirmed(base());
    expect(s.companies.find((c) => c.id === 'o')!.listingsHiddenUntilContactConfirmed).toBe(true);
    expect(s.notifications.some((n) => n.companyId === 'o' && n.type === 'listings_hidden')).toBe(true);
    expect(searchListings(s, { kind: 'cargo' }, s.now)).toHaveLength(0);
    s = ok(confirmContactData(as(s, 'o')));
    expect(searchListings(s, { kind: 'cargo' }, s.now)).toHaveLength(3);
  });

  it('complaints older than 30 days or before the last confirmation do not count', () => {
    let s = base();
    // two confirmed 40 days ago, one now → only 1 in the window
    s = { ...s, now: addDays(NOW, -40) };
    for (const [reporter, listing] of [['x1', 'l1'], ['x2', 'l2']] as const) {
      s = ok(fileComplaint(as(s, reporter), listing, 'outdated'));
      s = ok(confirmComplaint(as(s, MODERATOR_ID), s.complaints.at(-1)!.id));
    }
    s = { ...s, now: NOW };
    s = ok(fileComplaint(as(s, 'x3'), 'l3', 'outdated'));
    s = ok(confirmComplaint(as(s, MODERATOR_ID), s.complaints.at(-1)!.id));
    expect(s.companies.find((c) => c.id === 'o')!.listingsHiddenUntilContactConfirmed).toBe(false);
  });
});

describe('claims and flags', () => {
  it('moderator rejects a claim; the claim stops counting', () => {
    let s = emptyState({ companies: [company('a'), company('t')], claims: [{ id: 'cl', claimantId: 'a', targetId: 't', text: '', status: 'open', createdAt: NOW }] });
    const before = computeRating(s, 't', NOW).score;
    expect(rejectClaim(as(s, 'a'), 'cl')).toEqual({ ok: false, error: 'not_allowed' });
    s = ok(rejectClaim(as(s, MODERATOR_ID), 'cl'));
    expect(s.claims[0]!.status).toBe('rejected');
    expect(computeRating(s, 't', NOW).score).toBeGreaterThan(before);
  });

  it('blocking hides listings; unblocking shows them again; registry flags cannot be removed', () => {
    const seed = as(buildSeedState(), MODERATOR_ID);
    let s = ok(setFlag(seed, 'c01', 'fraud_blocked', 'test'));
    expect(searchListings(s, { kind: 'cargo' }, s.now).some((l) => l.ownerId === 'c01')).toBe(false);
    const flag = activeFlags(s.flags, 'c01')[0]!;
    s = ok(resolveFlag(s, flag.id));
    expect(searchListings(s, { kind: 'cargo' }, s.now).some((l) => l.ownerId === 'c01')).toBe(true);
    const registryFlag = activeFlags(seed.flags, 'c11')[0]!;
    expect(resolveFlag(seed, registryFlag.id)).toEqual({ ok: false, error: 'not_allowed' });
  });

  it('confirmed fraud: yellow → red, the company’s reviews are voided and rating events logged', () => {
    const seed = as(buildSeedState(), MODERATOR_ID);
    const yellow = activeFlags(seed.flags, 'c13').find((f) => f.kind === 'suspected_linked')!;
    const s = ok(confirmFraud(seed, yellow.id));
    expect(activeFlags(s.flags, 'c13').map((f) => f.kind)).toEqual(['fraud_blocked']);
    expect(s.reviews.filter((r) => r.authorId === 'c13').every((r) => r.voided)).toBe(true);
    // c14 still has its own yellow flag; resolving it would make its review count, but c13's review on c14… the review from c13 is now voided for good
    const c14flag = activeFlags(s.flags, 'c14').find((f) => f.kind === 'suspected_linked')!;
    const s2 = ok(resolveFlag(s, c14flag.id));
    expect(computeRating(s2, 'c14', s2.now).countedReviews).toBe(0);
  });
});

describe('detector: strong signals only', () => {
  it('seed: QuickRate pair by shared device, the c19–c21 ring as a closed ring; honest partners untouched', () => {
    const seed = buildSeedState();
    const found = detectSuspicions(seed, seed.now);
    expect(found.map((x) => x.companyId).sort()).toEqual(['c13', 'c14', 'c19', 'c20', 'c21']);
    expect(found.find((x) => x.companyId === 'c13')!.signals).toEqual([{ kind: 'shared_device', withIds: ['c14'] }]);
    expect(found.find((x) => x.companyId === 'c19')!.signals).toEqual([{ kind: 'closed_ring', withIds: ['c20', 'c21'] }]);
  });

  it('mutual reviews of partners with outside activity are not a signal', () => {
    const s = emptyState({
      companies: ['a', 'b', 'x', 'y'].map((id) => company(id, { joinedAt: addDays(NOW, -30) })),
      reviews: [review('a', 'b', 5, 3), review('b', 'a', 5, 2)],
      contactAccesses: [
        { id: 'a1', viewerId: 'a', ownerId: 'b', firstListingId: '', openedAt: NOW, paidWith: 'balance' },
        { id: 'a2', viewerId: 'b', ownerId: 'a', firstListingId: '', openedAt: NOW, paidWith: 'balance' },
        { id: 'a3', viewerId: 'a', ownerId: 'x', firstListingId: '', openedAt: NOW, paidWith: 'balance' },
        { id: 'a4', viewerId: 'y', ownerId: 'b', firstListingId: '', openedAt: NOW, paidWith: 'balance' },
      ],
    });
    expect(detectSuspicions(s, NOW)).toEqual([]);
  });

  it('a ring of old companies is not flagged (only new companies form a suspicious ring)', () => {
    const seed = buildSeedState();
    const aged = { ...seed, now: addDays(seed.now, 365) };
    expect(detectSuspicions(aged, aged.now).some((x) => x.signals.some((sig) => sig.kind === 'closed_ring'))).toBe(false);
  });

  it('flags new suspicions yellow and skips companies the moderator already cleared', () => {
    let s = as(buildSeedState(), MODERATOR_ID);
    s = ok(runDetector(s));
    const ringFlags = s.flags.filter((f) => ['c19', 'c20', 'c21'].includes(f.companyId) && !f.resolvedAt);
    expect(ringFlags.map((f) => [f.kind, f.source])).toEqual([
      ['suspected_linked', 'detector'], ['suspected_linked', 'detector'], ['suspected_linked', 'detector'],
    ]);
    // c13/c14 already had a flag: no duplicates
    expect(s.flags.filter((f) => f.companyId === 'c13' && f.kind === 'suspected_linked')).toHaveLength(1);
    s = ok(resolveFlag(s, ringFlags[0]!.id));
    expect(applyDetector(s).flags.filter((f) => f.companyId === ringFlags[0]!.companyId)).toHaveLength(1);
  });
});
