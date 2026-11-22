import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invalidate } from '$app/navigation';
import { pushToast } from '$ui/design-system';
import { applyRetrospecActs, currentRun, emptyRetrospecDocument, type PersonRef, type RetroItem, type RetrospecAct, type RetrospecDocument } from '$domain/retrospec';
import { RetroReview, sendRetrospecActs, type ReviewSource } from './review.svelte';

/**
 * The review of a Reverse-Specification on the page: an act reads at once, applied by the same domain rules the
 * server applies, and stays until the saved document is read back; a refusal takes it back and says why. Run on
 * real retrospec documents over a server stubbed at fetch.
 */

const navigation = vi.hoisted(() => ({ complete: null as Promise<void> | null }));
vi.mock('$app/state', () => ({ navigating: navigation }));
vi.mock('$app/navigation', () => ({ invalidate: vi.fn(async () => {}) }));
vi.mock('$ui/design-system', async (original) => ({ ...await original<object>(), pushToast: vi.fn() }));

const ana: PersonRef = { id: 'ana@example.test', name: 'Ana Diaz' };
const bob: PersonRef = { id: 'bob@example.test', name: 'Bob Li' };
const item = (id: string): RetroItem => ({ id, ref: 'IN-1', tab: 'features', title: `Item ${id}`, desc: '', rejectable: true });
const refunds = item('refunds');

function apply(doc: RetrospecDocument, acts: RetrospecAct[], actor = ana): RetrospecDocument {
	const result = applyRetrospecActs(doc, acts, { actor, now: '2026-11-18T03:00:00.000Z' });
	if (!result.ok) throw new Error(result.reason);
	return result.doc;
}
let saved: RetrospecDocument;
let source: ReviewSource;
const sourceOf = (over: Partial<ReviewSource> = {}): ReviewSource => ({
	projectId: 'p 1', me: bob, run: currentRun(saved), comments: saved.comments, total: 12, canWrite: true, members: [{ ...ana, job: 'product' }], ...over
});
/** The server: records what it is sent, and answers each request with the next answer queued (ok by default). */
function server() {
	const sent: { url: string; acts: unknown }[] = [];
	const answers: (() => Promise<Response>)[] = [];
	vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
		sent.push({ url, acts: JSON.parse(String(init.body)).acts });
		return (answers.shift() ?? (async () => Response.json({ ok: true })))();
	}));
	return { sent, answers };
}

beforeEach(() => {
	navigation.complete = null;
	saved = apply(emptyRetrospecDocument(), [{ op: 'validate', itemId: 'outside', title: 'outside', tab: 'features' }]);
	source = sourceOf();
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('an act reads on the page the moment it is sent', () => {
	it('shows the validation as the reader own while it is saved, and keeps it once the saved document is read back', async () => {
		const { sent, answers } = server();
		let answer!: (r: Response) => void;
		answers.push(() => new Promise<Response>((resolve) => (answer = resolve)));
		const review = new RetroReview(() => source);
		expect(review.view('refunds')).toMatchObject({ state: 'open', handled: false, mine: false });
		const pending = review.validate(refunds);
		expect(review.view('refunds')).toMatchObject({ state: 'validated', handled: true, mine: true, validators: [bob] });
		await vi.waitFor(() => expect(sent).toHaveLength(1));
		expect(sent[0]).toEqual({ url: '/api/projects/p%201/retrospec', acts: [{ op: 'validate', itemId: 'refunds', title: 'Item refunds', tab: 'features', total: 12 }] });
		// The server saved it: the page reads it from the saved document from now on.
		saved = apply(saved, [{ op: 'validate', itemId: 'refunds', title: 'Item refunds', tab: 'features' }], bob);
		source = sourceOf();
		answer(Response.json({ ok: true }));
		expect(await pending).toBe(true);
		expect(invalidate).toHaveBeenCalledTimes(1);
		expect(review.view('refunds')).toMatchObject({ state: 'validated', mine: true });
	});

	it('takes a refused act back out and says why', async () => {
		const { answers } = server();
		answers.push(async () => Response.json({ message: 'The run was closed.' }, { status: 409 }));
		const review = new RetroReview(() => source);
		expect(await review.validate(refunds)).toBe(false);
		expect(review.view('refunds').state).toBe('open');
		expect(pushToast).toHaveBeenCalledWith({ level: 'error', message: 'Your change was not saved. The run was closed.' });
		expect(invalidate).not.toHaveBeenCalled();
	});

	it('says a lost connection kept nothing', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
		const review = new RetroReview(() => source);
		expect(await review.validate(refunds)).toBe(false);
		expect(review.view('refunds').state).toBe('open');
		expect(pushToast).toHaveBeenCalledWith({ level: 'error', message: 'Your change was not saved. Check your connection.' });
	});

	it('sends nothing for a reader who may not act, and says whom to ask', async () => {
		const { sent } = server();
		source = sourceOf({ canWrite: false });
		const review = new RetroReview(() => source);
		expect(await review.validate(refunds)).toBe(false);
		expect(sent).toEqual([]);
		expect(review.view('refunds').state).toBe('open');
		expect(pushToast).toHaveBeenCalledWith(expect.objectContaining({ message: 'You can read this review, not act on it: ask a project editor.' }));
	});
});

describe('the acts of an item', () => {
	it('marks an item not wanted, then restores it', async () => {
		const { sent } = server();
		const review = new RetroReview(() => source);
		await review.toggleReject(refunds);
		expect(sent[0].acts).toEqual([{ op: 'reject', itemId: 'refunds', title: 'Item refunds', tab: 'features', total: 12 }]);
		saved = apply(saved, [{ op: 'reject', itemId: 'refunds', title: 'Item refunds', tab: 'features' }], bob);
		source = sourceOf();
		expect(review.view('refunds').state).toBe('rejected');
		await review.toggleReject(refunds);
		expect(sent[1].acts).toEqual([{ op: 'clear_flag', itemId: 'refunds', total: 12 }]);
	});

	it('withdraws the reader own validation', async () => {
		saved = apply(saved, [{ op: 'validate', itemId: 'refunds', title: 'Item refunds', tab: 'features' }], bob);
		source = sourceOf();
		const { sent } = server();
		const review = new RetroReview(() => source);
		const pending = review.withdraw(refunds);
		expect(review.view('refunds')).toMatchObject({ state: 'open', mine: false });
		await pending;
		expect(sent[0].acts).toEqual([{ op: 'withdraw', itemId: 'refunds', total: 12 }]);
	});

	it('sets an item aside and shares it, closing the menu it was chosen from', async () => {
		const { sent } = server();
		const review = new RetroReview(() => source);
		review.toggleMenu('refunds');
		expect(review.menuOpen).toBe('refunds');
		const aside = review.setAside(refunds);
		expect(review.menuOpen).toBeNull();
		expect(review.view('refunds').state).toBe('later');
		await aside;
		await review.share(refunds, ana);
		expect(sent.map((s) => (s.acts as { op: string }[])[0].op)).toEqual(['set_aside', 'share']);
		expect((sent[1].acts as { to: PersonRef }[])[0].to).toEqual(ana);
	});

	it('counts the comments nobody resolved yet', () => {
		saved = apply(saved, [
			{ op: 'comment', itemId: 'refunds', commentId: 'c1', text: 'Which refunds?' },
			{ op: 'comment', itemId: 'refunds', commentId: 'c2', text: 'Partial ones too?' },
			{ op: 'resolve_comment', itemId: 'refunds', commentId: 'c1' }
		]);
		source = sourceOf();
		const view = new RetroReview(() => source).view('refunds');
		expect(view.comments.map((c) => c.text)).toEqual(['Which refunds?', 'Partial ones too?']);
		expect(view.open).toBe(1);
	});

	it('reads the reader as a validator whatever the case or spaces of their address', () => {
		saved = apply(saved, [{ op: 'validate', itemId: 'refunds', title: 'Item refunds', tab: 'features' }], { id: 'Bob@Example.test', name: 'Bob Li' });
		source = sourceOf({ me: { id: '  bob@EXAMPLE.test ', name: 'Bob Li' } });
		expect(new RetroReview(() => source).view('refunds').mine).toBe(true);
	});
});

describe('a saved act is read back once a navigation under way has landed', () => {
	it('waits for the page being opened before reading the review again', async () => {
		server();
		let land!: () => void;
		navigation.complete = new Promise<void>((resolve) => (land = resolve));
		const done = sendRetrospecActs('p', [{ op: 'validate', itemId: 'refunds' }]);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(invalidate).not.toHaveBeenCalled();
		land();
		expect(await done).toBe(true);
		expect(invalidate).toHaveBeenCalledTimes(1);
	});
});
