import { describe, expect, it } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import BlockControls, { type Stamp, type ValidateControl } from './BlockControls.svelte';
import { STEP_SETTLED } from './step-settled';

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

describe("the reader validates in their own box, there is no Validate apart from the people [criterion:8d6c8ec0] [criterion:c035755f]", () => {
	it('draws their box, dashed, as a button that asks first while they are awaited', () => {
		const html = body({ validate: control() });
		const own = html.match(/<button[^>]*data-own-box[^>]*>/)?.[0] ?? '';
		expect(own).toContain('data-validation-state="validate"');
		expect(own).toContain('title="You · click to validate"');
		expect(own).toContain('aria-haspopup="dialog"');
		expect(own).toContain('data-stamp-ok="false"');
		expect(html).toContain('>YOU<');
		expect(html).not.toMatch(/>\s*Validate\s*</);
		expect(html.match(/data-evo-validate/g)).toHaveLength(1);
	});

	it('reads green once they validated, and draws no box of theirs where they never had one', () => {
		expect(body({ validate: control({ look: 'mine', withdraws: true }) })).toMatch(/<button[^>]*data-validation-state="validated"[^>]*data-stamp-ok="true"[^>]*data-own-box/);
		expect(body({ validate: control({ look: 'done', settled: true, run: null }) })).not.toContain('data-own-box');
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

describe('one box per person, the same on every page [criterion:8d6c8ec0] [criterion:32265cea]', () => {
	const NAMES = ['Ana Diaz', 'Bob Li', 'Chloe Roy', 'Dan Ito', 'Eve Kim', 'Finn Moe', 'Gus Orr', 'Hana Pei'];
	const boxes = (awaits: 'me' | 'others' | null, stamps: Stamp[], over: Partial<ValidateControl> = {}) => body({ validate: control({ stamps, settled: awaits === null, awaits, ...over }) });

	it("puts the reader's box first, then the others still awaited", () => {
		const html = boxes('me', [stamp('Ana Diaz', false), stamp('Dev Lyriks', false, true)]);
		expect(html.indexOf('data-own-box')).toBeLessThan(html.indexOf('aria-label="Ana Diaz · pending, click to send a reminder"'));
		expect(html).toMatch(/<button[^>]*aria-label="Validate: You · click to validate"/);
	});

	it('draws no box of the reader and no Validate while only others are awaited', () => {
		const html = boxes('others', [stamp('Ana Diaz', false), stamp('Bob Li', false), stamp('Chloe Roy', true)], { run: null });
		expect(html).not.toContain('data-own-box');
		expect(html).not.toContain('data-evo-validate');
		expect(html).toMatch(/aria-label="Ana Diaz · pending, click to send a reminder"[^>]*data-stamp-ok="false"/);
		expect(html).toMatch(/aria-label="Chloe Roy · validated"[^>]*data-stamp-ok="true"/);
	});

	it('reads every box green, on green, once everyone it waits on validated', () => {
		const html = boxes(null, [stamp('Ana Diaz', true), stamp('Bob Li', true)], { run: null, look: 'done' });
		expect(html).not.toContain('data-stamp-ok="false"');
		expect(html).toContain('bg-green-tint');
	});

	it('shows three boxes then +N, every one named somewhere', () => {
		const html = boxes('others', NAMES.map((n, i) => stamp(n, i < 2)), { run: null });
		for (const n of NAMES) expect(html).toContain(n);
		expect(html).toMatch(/data-stamp-more[^>]*>\+5</);
	});
});

describe('every element of the Specification 360° offers its four acts while a draft [criterion:a4ef7658]', () => {
	const acts = (validate: ValidateControl, sources = 0) =>
		body({ icons: true, validate, reject: crossSnippet, comments: { ...comments, count: 2 }, sources: { count: sources, open: false, toggle: () => {} } });

	it('draws the cross, the comments, the sources, then the boxes, in that order, with no check apart (criterion c035755f)', () => {
		const html = acts(control({ stamps: [stamp('Me Too', false, true)], awaits: 'me' }), 3);
		const order = ['aria-label="Request a change"', 'aria-label="Comments"', 'aria-label="3 sources"', 'data-own-box'].map((s) => html.indexOf(s));
		expect(order.every((i) => i >= 0)).toBe(true);
		expect([...order].sort((a, b) => a - b)).toEqual(order);
		expect(html.match(/data-evo-validate/g)).toHaveLength(1);
		expect(html).not.toContain('>Validate<');
	});

	it('greys the book of an element that cites nothing, rather than leave a gap, and never writes a 0', () => {
		const html = acts(control(), 0);
		expect(html).toMatch(/<button[^>]*aria-label="No source cited"[^>]*disabled/);
		expect(html).not.toMatch(/<\/svg>\s*0\s*<\/button>/);
	});

	it("offers the reader's own box back as a withdrawal once they validated, and nothing of theirs while only others are awaited", () => {
		const mine = acts(control({ look: 'mine', withdraws: true, stamps: [stamp('Me Too', true, true)], settled: true, awaits: null }));
		expect(mine).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*data-evo-validate/);
		const others = acts(control({ run: null, stamps: [stamp('Ana Diaz', false)], awaits: 'others' }));
		expect(others).toContain('aria-label="Ana Diaz · pending, click to send a reminder"');
		expect(others).not.toContain('data-evo-validate');
	});
});

describe("the reader's own green box asks before it takes their validation back, with no wait of the pointer [criterion:ac-leaf-d0867b26-692b-453f-9d01-e5cb8fa6da31] [criterion:00d0d300]", () => {
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
		expect(check).toContain('aria-label="Validated: You validated this element · click to withdraw"');
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

describe('a block of a validated step shows who stands behind it and nothing to click [criterion:f97d4509]', () => {
	const settledBody = (props: Record<string, unknown>) =>
		render(BlockControls, { props: props as never, context: new Map([[STEP_SETTLED, () => true]]) }).body.replace(/<!--.*?-->/g, '');
	const validated = control({ look: 'done', settled: true, stamps: [stamp('Ann Lee', true), stamp('Bob Ray', true)] });

	it('keeps the initials, without Validate nor Validated, in every form of the controls', () => {
		for (const form of [{}, { icons: true }, { compact: true }]) {
			const html = settledBody({ validate: validated, ...form });
			expect(html, JSON.stringify(form)).not.toContain('data-evo-validate');
			expect(html, JSON.stringify(form)).not.toMatch(/>\s*Validated?\s*</);
		}
		const html = settledBody({ validate: validated });
		expect(html).toContain('AL');
		expect(html).toContain('BR');
		expect(html).toContain('Ann Lee · validated');
	});

	it("keeps the reader's own box as a reading, never a box to press", () => {
		const mine = control({ look: 'mine', settled: true, withdraws: true, stamps: [stamp('Ann Lee', true, true), stamp('Bob Ray', true)] });
		for (const form of [{}, { icons: true }, { compact: true }]) {
			const html = settledBody({ validate: mine, ...form });
			expect(html, JSON.stringify(form)).not.toContain('data-evo-validate');
			expect(html, JSON.stringify(form)).toContain('data-own-box');
		}
		expect(body({ validate: mine })).toContain('data-evo-validate');
	});

	it('still draws the green row while the step is not validated', () => {
		expect(body({ validate: validated })).toContain('data-validate-wash');
		expect(settledBody({ validate: validated })).not.toContain('data-validate-wash');
	});
});
