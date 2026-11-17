import { describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { requireEvolutionAccess } from './community-locks.server';

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
