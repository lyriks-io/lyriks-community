import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import FinalizeDialog from './FinalizeDialog.svelte';

/** Every element validated while the Specification 360° is still a DRAFT: one question, one button. */
const base = { busy: false, onFinalize: () => {}, onLater: () => {} };

describe('the question once everything is validated', () => {
	it('counts the elements validated and offers to validate the specification definitively', () => {
		const { body } = render(FinalizeDialog, { props: { ...base, total: 174 } });
		expect(body).toContain('aria-label="Everything is validated"');
		expect(body).toContain('Everything is validated');
		expect(body).toContain('All 174 elements of the specification are validated.');
		expect(body).toContain('DRAFT');
		expect(body).toContain('VALIDATED');
		expect(body).toContain('and evolutions open.');
		expect(body.match(/>Validate definitively</g)).toHaveLength(1);
	});

	it('says one element in the singular', () => {
		const { body } = render(FinalizeDialog, { props: { ...base, total: 1 } });
		expect(body).toContain('The one element of the specification is validated.');
	});

	it('holds its button while the validation is on its way', () => {
		const { body } = render(FinalizeDialog, { props: { ...base, total: 3, busy: true } });
		expect(body).toMatch(/<button[^>]*disabled[^>]*aria-busy="true"[^>]*>Saving…</);
	});
});
