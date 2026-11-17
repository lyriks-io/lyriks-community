import { describe, expect, it } from 'vitest';
import { collectProse, LoadSpecCorpusUseCase } from './load-spec-corpus';

describe('collectProse', () => {
	it('keeps the words people wrote and drops identifiers, addresses and styling', () => {
		const prose = collectProse({
			id: 'feat-1',
			name: 'Move a project',
			roleIds: ['r1'],
			description: 'A domain board groups projects.',
			url: 'https://example.com/docs',
			color: '#7c3aed',
			nested: [{ message: 'That domain no longer exists.', updatedAt: '2026-10-13' }],
			uuid: '0172a5be-b497-47f4-8a8c-f55afbb015b3',
			count: 3
		});

		expect(prose).toEqual([
			'Move a project',
			'A domain board groups projects.',
			'That domain no longer exists.'
		]);
	});
});

describe('LoadSpecCorpusUseCase', () => {
	it('reads every section and every behavior feature, and survives one that fails', async () => {
		const corpus = await new LoadSpecCorpusUseCase(
			[
				async () => ({ brief: 'Teams scatter their specs.' }),
				async () => {
					throw new Error('section unavailable');
				}
			],
			{
				readProject: async () => ({ project: { featureIds: ['f1'] } }) as never,
				readFeature: async () => ({ feature: { rules: [{ message: 'A ticket is never lost.' }] } }) as never
			}
		).execute('p1');

		expect(corpus).toContain('Teams scatter their specs.');
		expect(corpus).toContain('A ticket is never lost.');
	});
});
