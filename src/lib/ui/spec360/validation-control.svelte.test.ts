import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { applyRetrospecActs, type RetrospecAct } from '$domain/retrospec';
import { emptyRetrospecDocument, type RetrospecDocument } from '$domain/retrospec';
import type { SpecElement } from '$domain/retrospec';
import type { TeamMember } from '$domain/retrospec';
import BlockControls from '$ui/evolution/BlockControls.svelte';
import { validationView } from '$ui/evolution/validation-view';
import { SpecValidation } from './validation.svelte';
import { pushToast } from '$ui/design-system';

vi.mock('$app/navigation', () => ({ invalidate: vi.fn(), goto: vi.fn() }));
vi.mock('$ui/design-system', async (original) => ({ ...await original<object>(), pushToast: vi.fn() }));

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

const ana = { id: 'ana@acme.io', name: 'Ana Diaz' };
const bob = { id: 'bob@acme.io', name: 'Bob Li' };
const cleo = { id: 'cleo@acme.io', name: 'Cleo Roy' };
const elements: SpecElement[] = [{ id: 'branding', title: 'Branding' }];

function validated(doc: RetrospecDocument, by: typeof ana): RetrospecDocument {
	const act: RetrospecAct = { op: 'validate', itemId: 'branding', title: 'Branding', tab: 'spec360' };
	const out = applyRetrospecActs(doc, [act], { actor: by, now: '2026-11-05T10:00:00.000Z' });
	if (!out.ok) throw new Error(out.reason);
	return out.doc;
}
// Ana leads the run (her first act), design is Bob's job, Cleo holds none.
const started = () => {
	const out = applyRetrospecActs(emptyRetrospecDocument(), [{ op: 'validate', itemId: 'other', title: 'Other', tab: 'spec360' }], { actor: ana, now: '2026-11-05T09:00:00.000Z' });
	return out.ok ? out.doc : emptyRetrospecDocument();
};
const controlFor = (me: typeof ana, doc: RetrospecDocument, team: TeamMember[], canWrite = true) =>
	new SpecValidation(() => ({ projectId: 'p', me, canWrite, doc, elements, team, baselines: [] })).control('branding');

describe('the Specification 360° says whose validation an element awaits [criterion:aba60be7]', () => {
	const team: TeamMember[] = [
		{ person: ana, jobIds: ['product'] },
		{ person: bob, jobIds: ['design'] },
		{ person: cleo, jobIds: [] }
	];

	it('offers Validate to someone it waits on', () => {
		const c = controlFor(bob, started(), team)!;
		expect(c.awaits).toBe('me');
		expect(validationView(c)).toMatchObject({ state: 'validate', label: 'Validate' });
		expect(c.run).not.toBeNull();
	});

	it('reads Waiting for N, with nothing to click, to someone it does not wait on', () => {
		const c = controlFor(cleo, started(), team)!;
		expect(c.awaits).toBe('others');
		expect(c.run).toBeNull();
		expect(validationView(c)).toMatchObject({ state: 'waiting', label: 'Waiting for 2', title: 'Waiting for Ana Diaz and Bob Li' });
	});

	it('reads Waiting for the others once the reader validated, and Validated once everyone did', () => {
		const one = validated(started(), ana);
		const mine = controlFor(ana, one, team)!;
		expect(validationView(mine)).toMatchObject({ state: 'waiting', label: 'Waiting for 1', title: 'Waiting for Bob Li. Click your box to withdraw yours' });
		const both = validated(one, bob);
		expect(validationView(controlFor(cleo, both, team)!)).toMatchObject({ state: 'validated', label: 'Validated' });
	});

	it('simulates eight people to validate: three boxes, then +6, one line', () => {
		const eight = ['Bob Li', 'Chloe Roy', 'Dan Ito', 'Eve Kim', 'Finn Moe', 'Gus Orr', 'Hana Pei', 'Ivo Sa'].map((name) => ({ id: `${name.split(' ')[0].toLowerCase()}@acme.io`, name }));
		const big: TeamMember[] = [{ person: ana, jobIds: ['product'] }, ...eight.map((person) => ({ person, jobIds: ['design'] }))];
		const c = controlFor(cleo, started(), big)!;
		expect(c.stamps).toHaveLength(9);
		const body = render(BlockControls, { props: { validate: c } }).body;
		expect(body.match(/data-stamp-ok=/g)?.length).toBe(3);
		expect(body).toMatch(/data-stamp-more[^>]*>\+6</);
		expect(body).not.toContain('data-own-box');
	});
});

describe("the reader takes their own validation back from its check, and is told when it was not saved [criterion:ac-leaf-f0cea75a-a9d9-4f27-996c-32900a613fa8] [criterion:00d0d300]", () => {
	const team: TeamMember[] = [{ person: ana, jobIds: ['product'] }, { person: bob, jobIds: ['design'] }];
	const mine = () => new SpecValidation(() => ({ projectId: 'p', me: bob, canWrite: true, doc: validated(started(), bob), elements, team, baselines: [] }));

	it('asks Withdraw your validation of <element>? on the check, with the tooltip of the action', () => {
		const control = mine().control('branding')!;
		expect(control.title).toBe('You validated this element · click to withdraw');
		expect(control.withdrawConfirm).toEqual({ question: 'Withdraw your validation of Branding?', act: 'Withdraw' });
		// Nothing to take back on an element the reader has not validated.
		expect(new SpecValidation(() => ({ projectId: 'p', me: bob, canWrite: true, doc: started(), elements, team, baselines: [] })).control('branding')!.withdrawConfirm).toBeNull();
	});

	it("counts the withdrawal on the band at once, then takes the count back and says why when the server refuses", async () => {
		let release!: (response: Response) => void;
		vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { release = resolve; })));
		const validation = mine();
		const sent = validation.withdraw('branding');
		expect(validation.shownBoard.standings.branding.validatedBy).toEqual([]);
		// The check keeps the confirmed validation while it is saved.
		expect(validation.mine('branding')).toBe(true);
		await vi.waitFor(() => expect(release).toBeTypeOf('function'));
		release(Response.json({ message: 'The project team is unavailable. Try again when it is available.' }, { status: 503 }));
		expect(await sent).toBe(false);
		expect(validation.mine('branding')).toBe(true);
		expect(validation.shownBoard.standings.branding.validatedBy).toEqual([bob]);
		expect(pushToast).toHaveBeenCalledWith({ level: 'error', message: 'Your withdrawal was not saved. The project team is unavailable. Try again when it is available.' });
	});

	it('says to check the connection when the server cannot be reached', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
		const validation = mine();
		expect(await validation.withdraw('branding')).toBe(false);
		expect(validation.mine('branding')).toBe(true);
		expect(pushToast).toHaveBeenCalledWith({ level: 'error', message: 'Your withdrawal was not saved. Check your connection.' });
	});

	it('says it was not saved, then why, when the page refuses it itself', async () => {
		const send = vi.fn();
		vi.stubGlobal('fetch', send);
		const gone = new SpecValidation(() => ({ projectId: 'p', me: bob, canWrite: true, doc: validated(started(), bob), elements: [], team, baselines: [] }));
		expect(await gone.withdraw('branding')).toBe(false);
		expect(send).not.toHaveBeenCalled();
		expect(pushToast).toHaveBeenCalledWith(expect.objectContaining({ message: 'Your withdrawal was not saved. This element is no longer in the specification. Reload the page.' }));
	});
});

describe('validation waits for the server before claiming success [criterion:3d83e291]', () => {
	const team: TeamMember[] = [{ person: ana, jobIds: ['product'] }, { person: bob, jobIds: ['design'] }];
	const make = (doc = started(), canWrite = true, me = bob) => new SpecValidation(() => ({ projectId: 'p', me, canWrite, doc, elements, team, baselines: [] }));

	it('explains missing elements and readonly access before sending a request', async () => {
		const send = vi.fn();
		vi.stubGlobal('fetch', send);
		expect(await make().validate('removed', false)).toBe(false);
		expect(await make(started(), false, cleo).validate('branding', false)).toBe(false);
		expect(send).not.toHaveBeenCalled();
		expect(pushToast).toHaveBeenCalledWith(expect.objectContaining({ message: 'This element is no longer in the specification. Reload the page.' }));
	});

	it('lets a required readonly reviewer approve their own element without assigning another person', async () => {
		const send = vi.fn().mockResolvedValue(Response.json({ ok: true }));
		vi.stubGlobal('fetch', send);
		const validation = make(started(), false);
		expect(validation.canReview('branding')).toBe(true);
		expect(validation.control('branding')?.run).not.toBeNull();
		expect(await validation.requestValidation('branding', cleo)).toBe(false);
		expect(send).not.toHaveBeenCalled();
		expect(await validation.validate('branding', false)).toBe(true);
		expect(send).toHaveBeenCalledTimes(1);
		expect(JSON.parse(send.mock.calls[0][1].body)).toEqual({ acts: [{ op: 'validate', itemId: 'branding' }] });
	});

	it('does not make an unassigned reader the lead of a specification nobody started [criterion:787a9fec]', async () => {
		const send = vi.fn();
		vi.stubGlobal('fetch', send);
		const validation = make(emptyRetrospecDocument(), false, cleo);
		expect(validation.canReview('branding')).toBe(false);
		expect(validation.control('branding')?.run).toBeNull();
		expect(await validation.validate('branding', false)).toBe(false);
		expect(send).not.toHaveBeenCalled();
	});

	it('keeps validation unavailable while the project team cannot be checked [criterion:e52cfcd9]', async () => {
		const send = vi.fn();
		vi.stubGlobal('fetch', send);
		const validation = new SpecValidation(() => ({
			projectId: 'p', me: bob, canWrite: true, teamAvailable: false,
			doc: validated(validated(started(), ana), bob), elements, team, baselines: []
		}));
		expect(validation.board.complete).toBe(false);
		expect(validation.control('branding')?.run).toBeNull();
		expect(await validation.finalize()).toBe(false);
		expect(send).not.toHaveBeenCalled();
		expect(pushToast).toHaveBeenCalledWith(expect.objectContaining({ message: 'The project team is unavailable. Try again when it is available.' }));
	});

	it('shows saving, prevents duplicate submission and preserves the confirmed stamps on refusal', async () => {
		let release!: (response: Response) => void;
		const send = vi.fn(() => new Promise<Response>((resolve) => { release = resolve; }));
		vi.stubGlobal('fetch', send);
		const validation = make();
		const first = validation.validate('branding', false);
		expect(validation.mine('branding')).toBe(false);
		expect(validationView(validation.control('branding')!)).toMatchObject({ state: 'saving', label: 'Saving…' });
		expect(validation.control('branding')?.run).toBeNull();
		expect(await validation.validate('branding', false)).toBe(false);
		await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
		release(Response.json({ message: 'The project permissions changed.' }, { status: 403 }));
		expect(await first).toBe(false);
		expect(validation.mine('branding')).toBe(false);
		expect(validation.control('branding')?.saving).toBe(false);
		expect(pushToast).toHaveBeenCalledWith(expect.objectContaining({ message: 'Your validation was not saved. The project permissions changed.' }));
	});

	it('does not send an incomplete definitive validation [criterion:e52cfcd9]', async () => {
		const send = vi.fn();
		vi.stubGlobal('fetch', send);
		const validation = make();
		expect(await validation.finalize()).toBe(false);
		expect(send).not.toHaveBeenCalled();
		expect(validation.celebrating).toBe(false);
		expect(pushToast).toHaveBeenCalledWith(expect.objectContaining({ message: 'Validate every element before validating the specification definitively.' }));
	});

	it('keeps DRAFT and the celebration closed while finalization is pending or refused [criterion:376dc172]', async () => {
		let release!: (response: Response) => void;
		const send = vi.fn(() => new Promise<Response>((resolve) => { release = resolve; }));
		vi.stubGlobal('fetch', send);
		const validation = make(validated(validated(started(), ana), bob));
		const pending = validation.finalize();
		expect(validation.finalizing).toBe(true);
		expect(validation.draft).toBe(true);
		expect(validation.celebrating).toBe(false);
		expect(await validation.finalize()).toBe(false);
		await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
		release(Response.json({ message: 'The baselines changed at the same time. Try again.' }, { status: 409 }));
		expect(await pending).toBe(false);
		expect(validation.draft).toBe(true);
		expect(validation.celebrating).toBe(false);
		expect(validation.finalizing).toBe(false);
	});

	it('celebrates only after the server accepted and the saved specification was refreshed [criterion:376dc172]', async () => {
		let doc = validated(validated(started(), ana), bob);
		const validation = new SpecValidation(() => ({ projectId: 'p', me: bob, canWrite: true, doc, elements, team, baselines: [] }));
		vi.stubGlobal('fetch', vi.fn(async () => {
			const outcome = applyRetrospecActs(doc, [{ op: 'publish', baselineId: 'baseline-1', notify: [] }], { actor: bob, now: '2026-11-13T00:00:00.000Z' });
			if (!outcome.ok) throw new Error(outcome.reason);
			doc = outcome.doc;
			return Response.json({ ok: true });
		}));
		expect(validation.celebrating).toBe(false);
		expect(await validation.finalize()).toBe(true);
		expect(validation.draft).toBe(false);
		expect(validation.celebrating).toBe(true);
	});
});
