import { afterEach, describe, expect, it, vi } from 'vitest';
import { pushToast } from '$ui/design-system';
import { applyRetrospecActs, emptyRetrospecDocument, samePersonRef, type PersonRef, type SpecElement, type TeamMember } from '$domain/retrospec';
import { SpecValidation } from './validation.svelte';

vi.mock('$app/navigation', () => ({ invalidate: vi.fn(async () => {}), goto: vi.fn() }));
vi.mock('$ui/design-system', async (original) => ({ ...await original<object>(), pushToast: vi.fn() }));

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

/**
 * "Check the retained validation page write right" (action b5f985e4 of the
 * screen Validation of a draft specification): the page controller returns
 * false with an information toast when its write right is absent and the
 * question does not wait on the reader, before queueing or posting the act.
 */

const lead: PersonRef = { id: 'lead@company.test', name: 'Lead' };
const reader: PersonRef = { id: 'reader@company.test', name: 'Reader' };
const ANCHOR = 'feature:refunds';
const elements: SpecElement[] = [{ id: ANCHOR, title: 'Refunds' }];
// The reader holds no job owning the element and was not asked: it does not wait on them (canReview false).
const team: TeamMember[] = [{ person: lead, jobIds: [] }, { person: reader, jobIds: [] }];
const doc = (() => {
	const outcome = applyRetrospecActs(emptyRetrospecDocument(), [{ op: 'start_review', total: 1 }], { actor: lead, now: '2026-11-20T09:00:00.000Z' });
	if (!outcome.ok) throw new Error(outcome.reason);
	return outcome.doc;
})();

/** The adapter: the reader asks for a change through the page controller; maySend is whether it posted. */
async function invoke(canWrite: boolean) {
	const send = vi.fn(async () => Response.json({ ok: true, revision: 2 }));
	vi.stubGlobal('fetch', send);
	const validation = new SpecValidation(() => ({ projectId: 'p', me: reader, canWrite, doc, elements, team, baselines: [] }));
	expect(validation.canReview(ANCHOR)).toBe(false);
	const returned = await validation.reject(ANCHOR);
	const standing = validation.standing(ANCHOR)!;
	const required = (p: PersonRef) => standing.required.some((r) => samePersonRef(r, p));
	return {
		returned,
		send,
		finalState: {
			'validationController.maySend': send.mock.calls.length > 0,
			'element.validations': standing.validatedBy.filter(required).length,
			'element.byMe': standing.validatedBy.some((p) => samePersonRef(p, reader))
		}
	};
}

describe('Check the retained validation page write right (b5f985e4)', () => {
	it('The retained validation page checks canWrite false [unspa:2e49df91:b5f985e4:ceb0cd95]', async () => {
		const run = await invoke(false);
		expect(run.returned).toBe(false);
		expect(run.finalState).toEqual({ 'validationController.maySend': false, 'element.validations': 0, 'element.byMe': false });
		expect(pushToast).toHaveBeenCalledWith({ level: 'info', message: 'You can read this specification, not validate it: ask a project editor.' });
	});

	it('The retained validation page checks canWrite true [unspa:2e49df91:b5f985e4:045c06d6]', async () => {
		const run = await invoke(true);
		expect(run.returned).toBe(true);
		expect(run.finalState).toEqual({ 'validationController.maySend': true, 'element.validations': 0, 'element.byMe': false });
		expect(JSON.parse(String((run.send.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ acts: [{ op: 'reject', itemId: ANCHOR }] });
		expect(pushToast).not.toHaveBeenCalledWith(expect.objectContaining({ level: 'info' }));
	});
});
