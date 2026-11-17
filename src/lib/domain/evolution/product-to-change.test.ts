import { describe, expect, it } from 'vitest';
import { hasProductToChange, productToChange, NO_PRODUCT_YET } from './product-to-change';
import { openRequestAct, type ActContext } from './acts';

describe('an evolution needs a product to change [criterion:ac-leaf-40bef6da]', () => {
	it('refuses a request while the specification holds no feature, saying where to start', () => {
		const refused = productToChange(0);
		expect(refused.ok).toBe(false);
		if (!refused.ok) {
			expect(refused.reason).toBe(NO_PRODUCT_YET);
			expect(refused.detail).toMatch(/in Knowledge/);
			expect(refused.detail).toMatch(/Reverse-Specification/);
		}
	});

	it('lets one open once the specification holds a feature', () => {
		expect(productToChange(1).ok).toBe(true);
		expect(hasProductToChange(12)).toBe(true);
		expect(hasProductToChange(0)).toBe(false);
	});
});

describe('the server refuses the request too, an AI client included [criterion:ac-leaf-40bef6da]', () => {
	const ctx = (kind: 'person' | 'ai_client'): ActContext => ({
		actor: { id: 'dylan@team.test', kind, role: 'admin', channel: kind === 'person' ? 'page' : 'ai_client' },
		at: '2026-10-30T09:00:00.000Z',
		newId: () => 'evo-1',
		soloWorkspace: true,
		validators: null
	});
	const open = (kind: 'person' | 'ai_client', known: readonly string[]) =>
		openRequestAct(ctx(kind), { title: 'Jouer à 2', origin: 'internal_idea', requester: '', leafIds: [], knownLeafIds: new Set(known) });

	it('opens nothing on a project whose specification holds no feature', () => {
		for (const kind of ['person', 'ai_client'] as const) {
			const refused = open(kind, []);
			expect(refused.ok).toBe(false);
			if (!refused.ok) expect(refused.reason).toBe(NO_PRODUCT_YET);
		}
	});

	it('opens it once the specification holds a feature', () => {
		expect(open('ai_client', ['feat-play']).ok).toBe(true);
	});
});
