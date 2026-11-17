import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import StepValidateAll from './StepValidateAll.svelte';

const html = (count: number) => render(StepValidateAll, { props: { step: 'Briefing', parts: [{ count, one: 'section' }], onclick: () => {} } }).body;

describe("a whole step's Validate all", () => {
	it('shows only while something of the step waits on the reader, with how many', () => {
		expect(html(0)).not.toContain('Validate all');
		expect(html(2)).toContain('Validate all (2)');
	});

	it('says in its tooltip what it validates', () => {
		expect(html(2)).toContain('title="Validate in your name the 2 sections of the Briefing still waiting on you, in one go"');
	});
});
