import { describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { requireEvolutionAccess, requireEvolutionBatchAccess } from './community-locks.server';

const on = (edition: string | undefined) => ({ installEdition: () => edition });

function refusal(run: () => void): { status: number; message: string; body: App.Error } | null {
	try {
		run();
		return null;
	} catch (e) {
		if (isHttpError(e)) return { status: e.status, message: e.body.message, body: e.body };
		throw e;
	}
}

describe('requireEvolutionAccess', () => {
	it('refuses every Evolution operation on Community with the offer of Solo Builder, the plans and the plan [criterion:ac-leaf-14ef9bc4-cba7-4e8a-97eb-4138ee43b8bd]', () => {
		const refused = refusal(() => requireEvolutionAccess(on('community')));
		expect(refused?.status).toBe(403);
		expect(refused?.body).toEqual({
			message: 'Evolutions are available from the Solo Builder plan. Upgrade to keep building.',
			detail: 'See https://lyriks.io/pricing.',
			plan: 'solo_builder'
		});
	});

	it('words every refused request batch the same way, whatever it reads or drives [criterion:ac-leaf-14ef9bc4-cba7-4e8a-97eb-4138ee43b8bd]', () => {
		for (const op of ['open_request', 'post_on_field', 'decide_line', 'cross_stage', 'build_implementation_report'])
			expect(refusal(() => requireEvolutionBatchAccess(on('community'), [{ op, requestId: 'r1' }]))?.body).toMatchObject({
				message: 'Evolutions are available from the Solo Builder plan. Upgrade to keep building.',
				plan: 'solo_builder'
			});
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
