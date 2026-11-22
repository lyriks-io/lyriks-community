import { describe, expect, it } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import BlockControls, { type Stamp, type ValidateControl } from './BlockControls.svelte';

/**
 * The controls of one block, the one validation control of the product (criterion aba60be7), as the reader reads
 * them: what each says and does, in which order, never how it is painted. Who an element waits on is computed by
 * SpecValidation and proved in validation-control.svelte.test.ts; here the control is handed its state.
 */

const stamp = (name: string, ok: boolean, me = false, onclick: (() => void) | null = null): Stamp => ({
	id: name.toLowerCase().replace(' ', '-'),
	initials: name.split(' ').map((w) => w[0]).join(''),
	title: `${name} · ${ok ? 'validated' : 'pending, click to send a reminder'}`,
	ok,
	name,
	me,
	onclick
});
const control = (over: Partial<ValidateControl> = {}): ValidateControl => ({ look: 'grey', title: 'Validate this element', run: () => {}, stamps: [], settled: false, ...over });
const comments = { count: 0, resolvedOnly: false, open: false, toggle: () => {} };
const body = (props: Record<string, unknown>) => render(BlockControls, { props: props as never }).body.replace(/<!--.*?-->/g, '');
const crossSnippet = createRawSnippet(() => ({ render: () => '<button type="button" aria-label="Request a change">x</button>' }));

describe('a Validate button says Validate until the reader validated it [criterion:ac-leaf-ac-evo-form-validate-grey]', () => {
	it('is a button that says Validate while the reader is awaited', () => {
		const html = body({ validate: control() });
		expect(html).toMatch(/<button[^>]*data-validation-state="validate"[^>]*>[\s\S]*Validate</);
	});

	it('reads Validated once validated, by the reader or by everyone named on it', () => {
		expect(body({ validate: control({ look: 'mine' }) })).toMatch(/data-validation-state="validated"[^>]*>[\s\S]*Validated/);
		expect(body({ validate: control({ look: 'done', settled: true, run: null }) })).toMatch(/data-validation-state="validated"[^>]*>[\s\S]*Validated/);
	});
});

describe('the avatars only say who validated [criterion:ac-leaf-ac-evo-form-validators]', () => {
	const withStamps = (stamps: Stamp[]) => body({ validate: control({ look: 'done', stamps, settled: true }) });

	it("draws an avatar that does nothing as plain text, never a button, the reader's own included", () => {
		const html = withStamps([stamp('Dev Eloper', true)]);
		expect(html).toMatch(/<span[^>]*role="img"[^>]*aria-label="Dev Eloper · validated"/);
		expect(html).not.toMatch(/<button[^>]*aria-label="Dev Eloper · validated"/);
	});

	it('keeps a button only for an avatar that does something else, such as a reminder', () => {
		expect(withStamps([stamp('Ana Diaz', false, false, () => {})])).toMatch(/<button[^>]*aria-label="Ana Diaz · pending, click to send a reminder"/);
	});
});

describe('a block shows its sources behind an icon with their number [criterion:b0ea9889]', () => {
	const withSources = (sources: { count: number; open: boolean; toggle: () => void } | null, compact = false) => body({ comments, sources, compact });

	it('offers the icon with the count beside the comments, saying what it holds', () => {
		const html = withSources({ count: 7, open: false, toggle: () => {} });
		expect(html).toMatch(/<button[^>]*aria-label="7 sources"[^>]*aria-expanded="false"/);
		expect(html.indexOf('aria-label="Comments"')).toBeLessThan(html.indexOf('aria-label="7 sources"'));
	});

	it('reads open while its sources show, in the strip that follows a long section too', () => {
		expect(withSources({ count: 1, open: true, toggle: () => {} })).toMatch(/aria-label="Hide the sources"[^>]*aria-expanded="true"/);
		expect(withSources({ count: 1, open: false, toggle: () => {} }, true)).toContain('aria-label="1 source"');
	});

	it('shows no icon on a block that cites nothing', () => {
		expect(withSources(null)).not.toMatch(/aria-label="\d+ sources?"/);
	});
});

describe('one validation control, the same on every page [criterion:aba60be7]', () => {
	const NAMES = ['Ana Diaz', 'Bob Li', 'Chloe Roy', 'Dan Ito', 'Eve Kim', 'Finn Moe', 'Gus Orr', 'Hana Pei'];
	const pill = (awaits: 'me' | 'others' | null, stamps: Stamp[], over: Partial<ValidateControl> = {}) => body({ validate: control({ stamps, settled: awaits === null, awaits, ...over }) });

	it('says Validate while the reader is awaited, and whom else it waits on', () => {
		const html = pill('me', [stamp('Dev Lyriks', false, true), stamp('Ana Diaz', false)]);
		expect(html).toMatch(/<button[^>]*data-validation-state="validate"[^>]*>[\s\S]*Validate</);
		expect(html).toContain('title="Waiting for your validation, and for Ana Diaz"');
	});

	it('says Waiting for N, quiet and never a button, while only others are awaited', () => {
		const html = pill('others', [stamp('Ana Diaz', false), stamp('Bob Li', false), stamp('Chloe Roy', true)], { run: null });
		expect(html).toMatch(/<span[^>]*role="status"[^>]*data-validation-state="waiting"[^>]*>Waiting for 2</);
		expect(html).not.toMatch(/<button[^>]*data-validation-state/);
		expect(html).toContain('title="Waiting for Ana Diaz and Bob Li"');
	});

	it('says Validated once everyone it waits on validated', () => {
		const html = pill(null, [stamp('Ana Diaz', true), stamp('Bob Li', true)], { run: null, look: 'done' });
		expect(html).toMatch(/data-validation-state="validated"[^>]*>[\s\S]*Validated<\/span>/);
		expect(html).toContain('title="Validated by everyone it waits on"');
	});

	it('names the first two people it still waits on and counts the others, every one named somewhere', () => {
		const html = pill('others', NAMES.map((n, i) => stamp(n, i < 2)), { run: null });
		for (const n of NAMES) expect(html).toContain(n);
		expect(html).toContain('title="Waiting for Chloe Roy, Dan Ito and 4 others"');
		expect(pill('others', NAMES.map((n) => stamp(n, false)), { run: null })).toContain('title="Waiting for Ana Diaz, Bob Li and 6 others"');
	});
});

describe('every element of the Specification 360° offers its four acts while a draft [criterion:a4ef7658]', () => {
	const acts = (validate: ValidateControl, sources = 0) =>
		body({ icons: true, validate, reject: crossSnippet, comments: { ...comments, count: 2 }, sources: { count: sources, open: false, toggle: () => {} } });

	it('draws the cross, the check, the comments, the sources, then the people, in that order, with no word on the check', () => {
		const html = acts(control({ stamps: [stamp('Me Too', false, true)], awaits: 'me' }), 3);
		const order = ['aria-label="Request a change"', 'data-evo-validate', 'aria-label="Comments"', 'aria-label="3 sources"', 'data-stamp-ok'].map((s) => html.indexOf(s));
		expect(order.every((i) => i >= 0)).toBe(true);
		expect([...order].sort((a, b) => a - b)).toEqual(order);
		expect(html).not.toContain('>Validate<');
	});

	it('greys the book of an element that cites nothing, rather than leave a gap, and never writes a 0', () => {
		const html = acts(control(), 0);
		expect(html).toMatch(/<button[^>]*aria-label="No source cited"[^>]*disabled/);
		expect(html).not.toMatch(/<\/svg>\s*0\s*<\/button>/);
	});

	it("offers the reader's own check back as a withdrawal once they validated, and no check while only others are awaited", () => {
		const mine = acts(control({ look: 'mine', withdraws: true, stamps: [stamp('Me Too', true, true)], settled: true, awaits: null }));
		expect(mine).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*data-evo-validate/);
		const others = acts(control({ run: null, stamps: [stamp('Ana Diaz', false)], awaits: 'others' }));
		expect(others).toContain('data-validation-state="waiting"');
		expect(others).not.toContain('data-evo-validate');
	});
});

describe("the reader's own check asks before it takes their validation back, with no wait of the pointer [criterion:ac-leaf-d0867b26-692b-453f-9d01-e5cb8fa6da31] [criterion:00d0d300]", () => {
	const mine = (over: Partial<ValidateControl> = {}) =>
		body({
			icons: true,
			validate: control({
				look: 'mine',
				withdraws: true,
				title: 'You validated this element · click to withdraw',
				withdrawConfirm: { question: 'Withdraw your validation of Branding?', act: 'Withdraw' },
				stamps: [stamp('Me Too', true, true)],
				settled: true,
				awaits: null,
				...over
			})
		});

	it('reads You validated this element · click to withdraw, a button that opens a confirmation', () => {
		const html = mine();
		const check = html.match(/<button[^>]*data-evo-validate[^>]*>/)?.[0] ?? '';
		expect(check).toContain('title="You validated this element · click to withdraw"');
		expect(check).toContain('aria-haspopup="dialog"');
		expect(check).toContain('aria-expanded="false"');
		expect(check).toContain('aria-label="Validated: Validated by everyone it waits on. Click to withdraw yours"');
	});

	it('never arms on rest: no Withdraw swap waits for the pointer, the confirmation stays closed until a click', () => {
		const html = mine();
		expect(html).not.toContain('withdraw-swap');
		expect(html).not.toContain('withdrawable');
		expect(html).not.toContain('role="dialog"');
	});

	it('offers nothing to withdraw while the withdrawal is being saved', () => {
		const html = mine({ run: null, saving: true, title: 'Saving your validation' });
		expect(html).not.toContain('aria-haspopup="dialog"');
		expect(html).toContain('data-validation-state="saving"');
	});
});
