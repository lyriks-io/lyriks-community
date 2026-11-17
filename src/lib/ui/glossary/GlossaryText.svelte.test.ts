import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import type { GlossaryTerm } from '$domain/glossary';
import EarsText from './EarsText.svelte';
import GlossaryText from './GlossaryText.svelte';
import MentionText from '$ui/evolution/MentionText.svelte';
import { glossaryContextOf } from './glossary-context';

const terms = [
	{ id: 't-expire', term: 'Expire in', definition: 'How long a link lives.', synonymsAllowed: ['expiration time'], synonymsAvoid: [] },
	{ id: 't-view', term: 'View', definition: 'A counted visit.', synonymsAllowed: ['visit'], synonymsAvoid: ['click'] }
] as unknown as GlossaryTerm[];
const context = glossaryContextOf(terms);
const marks = (body: string) => [...body.matchAll(/<span[^>]*class="gloss-mark[^"]*"[^>]*>([^<]*)<\/span>/g)].map((m) => ({ word: m[1], dashed: /decoration-dashed/.test(m[0]) }));

describe('the glossary marks every running text a person reads [criterion:ac-leaf-ac-glos-underline-only]', () => {
	it('underlines a term dotted and a word to avoid dashed red, with no icon beside them', () => {
		const { body } = render(GlossaryText, { props: { text: 'Each click counts as a view.' }, context });
		expect(marks(body)).toEqual([
			{ word: 'click', dashed: true },
			{ word: 'view', dashed: false }
		]);
		expect(body).toContain('decoration-dotted');
		expect(body).toContain('decoration-danger-400');
	});

	it('marks the words of a requirement too, its EARS keywords still standing out', () => {
		const { body } = render(EarsText, { props: { text: 'When a link expires in an hour, the system shall count no view.' }, context });
		expect(marks(body).map((m) => m.word)).toEqual(['expires in', 'view']);
		expect(body).toMatch(/<strong[^>]*>When<\/strong>/);
	});

	it('marks the prose of a Functional spec around its citations', () => {
		const { body } = render(MentionText, { props: { text: 'A click on @[Shorten a link](feature:f1) is a view.' }, context });
		expect(marks(body).map((m) => m.word)).toEqual(['click', 'view']);
		expect(body).toContain('Shorten a link');
	});

	it('leaves a text plain outside a project, where no vocabulary is provided', () => {
		expect(render(GlossaryText, { props: { text: 'Each click counts as a view.' } }).body).not.toContain('gloss-mark');
	});
});
