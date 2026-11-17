import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import BlockControls from './BlockControls.svelte';

const pill = (look: 'grey' | 'mine' | 'done') =>
	render(BlockControls, { props: { validate: { look, title: 'Validate', run: () => {}, stamps: [], settled: look === 'done' } } }).body;

describe('a Validate button reads as the filled blue button until the reader validated it [criterion:ac-leaf-ac-evo-form-validate-grey]', () => {
	it('reads filled blue with paper text, never a sand fill nor a white outline, while not validated', () => {
		const body = pill('grey');
		expect(body).toContain('border-ink bg-evo-violet text-white');
		expect(body).not.toContain('bg-evo-grey');
		expect(body).not.toContain('bg-transparent font-evo tracking-[0.07em] text-ink');
		expect(body).toContain('>Validate<');
	});

	it('reads green once validated, by the reader or by everyone named on it', () => {
		expect(pill('mine')).toMatch(/data-validation-state="validated"[^>]*>.*Validated/s);
		expect(pill('done')).toContain('Validated');
		expect(pill('done')).toContain('text-evo-green');
	});
});

describe('the avatars only say who validated [criterion:ac-leaf-ac-evo-form-validators]', () => {
	const withStamps = (stamps: { id: string; initials: string; title: string; ok: boolean; onclick?: (() => void) | null }[]) =>
		render(BlockControls, { props: { validate: { look: 'done', title: 'Validate', run: () => {}, stamps, settled: true } } }).body;

	it("draws an avatar that does nothing as plain text, never a button, the reader's own included", () => {
		const body = withStamps([{ id: 'de', initials: 'DE', title: 'Dev · validated', ok: true }]);
		expect(body).toMatch(/<span[^>]*role="img"[^>]*aria-label="Dev · validated"/);
		expect(body).not.toMatch(/<button[^>]*aria-label="Dev · validated"/);
	});

	it('keeps a button only for an avatar that does something else, such as a reminder', () => {
		const body = withStamps([{ id: 'ana', initials: 'AN', title: 'Ana · pending, click to send a reminder', ok: false, onclick: () => {} }]);
		expect(body).toMatch(/<button[^>]*aria-label="Ana · pending, click to send a reminder"/);
	});
});

describe('a block shows its sources behind an icon with their number [criterion:b0ea9889]', () => {
	const withSources = (sources: { count: number; open: boolean; toggle: () => void } | null, compact = false) =>
		render(BlockControls, { props: { comments: { count: 0, resolvedOnly: false, open: false, toggle: () => {} }, sources, compact } }).body;

	it('offers the icon with the count beside the comments, saying what it holds', () => {
		const body = withSources({ count: 7, open: false, toggle: () => {} });
		expect(body).toMatch(/<button[^>]*aria-label="7 sources"[^>]*aria-expanded="false"/);
		expect(body.indexOf('aria-label="Comments"')).toBeLessThan(body.indexOf('aria-label="7 sources"'));
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
	const person = (name: string, ok: boolean, me = false) => ({
		id: name.toLowerCase().replace(' ', '-'),
		initials: name.split(' ').map((w) => w[0]).join(''),
		title: `${name} · ${ok ? 'validated' : 'pending, click to send a reminder'}`,
		ok,
		name,
		me
	});
	const control = (awaits: 'me' | 'others' | null, stamps: ReturnType<typeof person>[], extra: Record<string, unknown> = {}) =>
		render(BlockControls, { props: { validate: { look: 'grey' as const, title: 'Validate', run: () => {}, stamps, settled: awaits === null, awaits, ...extra } } }).body;

	it('says Validate as a filled blue button while the reader is awaited, in words', () => {
		const body = control('me', [person('Dev Lyriks', false, true), person('Ana Diaz', false)]);
		expect(body).toMatch(/<button[^>]*bg-evo-violet[^>]*data-validation-state="validate"/);
		expect(body).toContain('>Validate<');
		expect(body).toContain('title="Waiting for your validation, and for Ana Diaz"');
	});

	it('says Waiting for N, quiet and never a button, while only others are awaited', () => {
		const body = control('others', [person('Ana Diaz', false), person('Bob Li', false), person('Chloe Roy', true)], { run: null });
		expect(body).toMatch(/<span[^>]*role="status"[^>]*data-validation-state="waiting"[^>]*>(<!--[^>]*-->)*Waiting for 2</);
		expect(body).not.toMatch(/<button[^>]*data-validation-state/);
		expect(body).toContain('title="Waiting for Ana Diaz and Bob Li"');
	});

	it('says Validated in green with its check once everyone it waits on validated', () => {
		const body = control(null, [person('Ana Diaz', true), person('Bob Li', true)], { run: null });
		expect(body).toMatch(/data-validation-state="validated"[^>]*>.*<svg.*Validated<\/span>/s);
		expect(body).toContain('bg-green-tint');
		expect(body).toContain('title="Validated by everyone it waits on"');
	});

	it('shows eight people as three initials then +5, every one of them named in its tooltip, on one line', () => {
		const body = control('others', NAMES.map((n, i) => person(n, i < 2)), { run: null });
		expect(body.match(/data-stamp-ok=/g)?.length).toBe(3);
		expect(body).toMatch(/data-stamp-more[^>]*>\+5</);
		for (const n of NAMES) expect(body).toContain(n);
		expect(body).toContain('title="Waiting for Chloe Roy, Dan Ito and 4 others"');
		// The pill never wraps: its people sit in one row that does not shrink.
		expect(body).toContain('relative isolate flex flex-none items-center gap-2');
		expect(body).not.toMatch(/isolate[^"]*flex-wrap/);
	});

	it('names six others the way the owner reads them: Waiting for Ana, Bob and 6 others', () => {
		const body = control('others', NAMES.map((n) => person(n, false)), { run: null });
		expect(body).toContain('Waiting for 8');
		expect(body).toContain('title="Waiting for Ana Diaz, Bob Li and 6 others"');
	});

	it('sits at the end of its row when asked to', () => {
		const at = render(BlockControls, { props: { validate: { look: 'grey', title: 'Validate', run: () => {}, stamps: [], settled: false }, end: true } }).body;
		expect(at).toContain('<span class="flex items-center gap-1.5 ml-auto min-w-0 max-w-full flex-[0_1_auto] flex-wrap justify-end gap-y-1">');
	});
});
