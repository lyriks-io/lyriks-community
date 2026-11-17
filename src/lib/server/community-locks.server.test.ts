import { describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { requireEvolutionAccess, requireEvolutionBatchAccess } from './community-locks.server';

const on = (edition: string | undefined) => ({ installEdition: () => edition });

function refusal(run: () => void): { status: number; message: string } | null {
	try {
		run();
		return null;
	} catch (e) {
		if (isHttpError(e)) return { status: e.status, message: e.body.message };
		throw e;
	}
}

describe('requireEvolutionAccess', () => {
	it('refuses every Evolution operation on Community, naming Solo Builder and the plans', () => {
		const refused = refusal(() => requireEvolutionAccess(on('community')));
		expect(refused?.status).toBe(403);
		expect(refused?.message).toContain('Solo Builder');
		expect(refused?.message).toContain('https://lyriks.io/pricing');
	});

	it('lets every other edition through, and an install that declares none', () => {
		for (const edition of ['enterprise', undefined]) expect(refusal(() => requireEvolutionAccess(on(edition)))).toBeNull();
	});
});

describe('requireEvolutionBatchAccess (EVO-001 regression)', () => {
	const answer = [{ op: 'answer_click', clickId: 'c1', text: 'Because the run is under way.' }];

	it('lets the AI answer a question of Ask my AI on Community: the session of the whole project stays there', () => {
		// The unconditional lock refused it: a person could ask, and the answer came back 403.
		expect(refusal(() => requireEvolutionAccess(on('community')))?.status).toBe(403);
		expect(refusal(() => requireEvolutionBatchAccess(on('community'), answer))).toBeNull();
	});

	it('still refuses on Community any batch that carries an act of a request', () => {
		expect(refusal(() => requireEvolutionBatchAccess(on('community'), [...answer, { op: 'post_on_field', requestId: 'r1' }]))?.status).toBe(403);
		expect(refusal(() => requireEvolutionBatchAccess(on('community'), [{ op: 'open_request', title: 'x' }]))?.status).toBe(403);
	});

	it('lets every batch through on another edition', () => {
		expect(refusal(() => requireEvolutionBatchAccess(on('enterprise'), [{ op: 'open_request', title: 'x' }]))).toBeNull();
	});
});
