import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import BlockControls from '$ui/evolution/BlockControls.svelte';
import type { ValidateControl } from '$ui/evolution/BlockControls.svelte';
import { sendChangeRequest } from './change-request';
import type { SpecDiscussions } from './discussions.svelte';
import type { SpecValidation } from './validation.svelte';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const stamp = (ok: boolean, me = false) => ({ id: me ? 'me' : 'ana', initials: me ? 'ME' : 'AN', title: me ? 'Me · to validate' : 'Ana · validated', ok, name: me ? 'Me' : 'Ana', me });
const control = (over: Partial<ValidateControl>): ValidateControl => ({ look: 'grey', title: 'Validate this element', run: () => {}, stamps: [stamp(false, true)], settled: false, awaits: 'me', ...over });
const acts = (validate: ValidateControl, sources = 0) =>
	render(BlockControls, {
		props: { icons: true, validate, comments: { count: 2, resolvedOnly: false, open: false, toggle: () => {} }, sources: { count: sources, open: false, toggle: () => {} } }
	}).body;

describe('every element of the Specification 360° offers its four acts while a draft [criterion:a4ef7658]', () => {
	it('draws the check, then the comments, then the sources, the people after them', () => {
		const body = acts(control({}), 3);
		const check = body.indexOf('data-evo-validate');
		const comments = body.indexOf('aria-label="Comments"');
		const sources = body.indexOf('aria-label="3 sources"');
		const people = body.indexOf('data-stamp-ok');
		expect(check).toBeGreaterThan(-1);
		expect(check).toBeLessThan(comments);
		expect(comments).toBeLessThan(sources);
		expect(sources).toBeLessThan(people);
		expect(body).not.toContain('>Validate<');
	});

	it('greys the book of an element that cites nothing, rather than leave a gap, and never writes a 0', () => {
		const body = acts(control({}), 0);
		expect(body).toContain('title="No source cited"');
		expect(body).toMatch(/aria-label="No source cited"[^>]*disabled/);
		expect(body).not.toMatch(/<\/svg>\s*0\s*<\/button>/);
	});

	it('fills the check green once the reader validated, and reads it grey while only others are awaited', () => {
		const mine = acts(control({ look: 'mine', withdraws: true, run: () => {}, stamps: [stamp(true, true)], settled: true, awaits: null }));
		expect(mine).toContain('bg-green');
		expect(mine).toContain('withdraw-swap');
		const others = acts(control({ look: 'grey', run: null, stamps: [stamp(false)], awaits: 'others' }));
		expect(others).toContain('data-validation-state="waiting"');
		expect(others).toContain('text-ink-4');
		expect(others).not.toContain('data-evo-validate');
	});

	it('puts the cross before the check on every element: SpecControls and the rows of profiles', () => {
		const controls = read('src/lib/ui/spec360/SpecControls.svelte');
		expect(controls).toContain('{#if validates}<RejectAct {anchor} {title} small />{/if}');
		expect(controls.match(/<BlockControls icons /g)?.length).toBe(2);
		const row = read('src/lib/ui/spec360/users/UserRow.svelte');
		expect(row.match(/<BlockControls icons \{validate\} \{reject\} \/>/g)?.length).toBe(2);
		const blocks = read('src/lib/ui/evolution/BlockControls.svelte');
		const order = ['{@render reject?.()}', 'data-evo-validate', '{#if comments}', '{#if sources}'].map((s) => blocks.indexOf(s, blocks.indexOf('{#snippet acts()}')));
		expect([...order].sort((a, b) => a - b)).toEqual(order);
	});
});

describe('the cross requests a change [criterion:a4ef7658]', () => {
	it('rejects the element and opens a discussion saying what should change, the box keeping what was typed', async () => {
		const reject = vi.fn(() => Promise.resolve(true));
		const posted: string[] = [];
		const discussions = {
			drafts: { 'rule:f1:r1': 'half a thought' } as Record<string, string>,
			post: vi.fn(function (this: { drafts: Record<string, string> }, anchor: string) {
				posted.push(this.drafts[anchor]);
				return Promise.resolve(null);
			})
		};
		discussions.post = discussions.post.bind(discussions);
		const ok = await sendChangeRequest({ reject } as unknown as SpecValidation, discussions as unknown as SpecDiscussions, 'rule:f1:r1', 'Refuse to save', 'The admin may save too');
		expect(ok).toBe(true);
		expect(reject).toHaveBeenCalledWith('rule:f1:r1');
		expect(posted).toEqual(['Change requested: The admin may save too']);
		expect(discussions.drafts['rule:f1:r1']).toBe('half a thought');
	});
});
