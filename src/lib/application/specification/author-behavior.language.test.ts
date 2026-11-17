import { describe, expect, it, vi } from 'vitest';
import type { BehaviorBatchResult, UnspaghettitAdvisorPort } from '$application/ports';
import { NBSP } from '$domain/language';
import { AuthorBehaviorUseCase } from './author-behavior';

const applied: BehaviorBatchResult = {
	ok: true,
	dryRun: false,
	appliedCount: 1,
	refs: {},
	errors: [],
	maturityPercentage: 90,
	commitToken: null,
	raw: {}
};
const advisor = { applyBehaviorBatch: async () => applied } as unknown as Pick<
	UnspaghettitAdvisorPort,
	'applyBehaviorBatch'
>;
const declaring = (primaryLocale: string) => ({
	loadOperations: vi.fn(async () => ({ i18n: { primaryLocale } }))
});

const FRENCH = "Le client est refusé quand il n'est pas connecté et que la commande est déjà dans le panier.";
const batch = [
	{ kind: 'add_action', ref: 'act', name: 'checkout', intent: 'Turn the cart into an order' },
	{
		kind: 'add_action_rule',
		actionRef: 'act',
		rule: { category: 'permissions', description: FRENCH, effect: { type: 'allow_action' } }
	},
	{ kind: 'add_scenario', actionRef: 'act', name: 'guest is refused' }
];

describe('a behavior batch that writes prose in another language (80ad0a4c)', () => {
	it('warns once per offending piece, naming it, and still applies the batch', async () => {
		const result = await new AuthorBehaviorUseCase(advisor, undefined, declaring('en-US')).execute({
			projectId: 'p1',
			featureId: 'feat-1',
			operations: batch
		});
		expect(result.batch?.ok).toBe(true);
		expect(result.warnings).toEqual([
			'op[1] (add_action_rule), rule description: this text reads in French while the spec is written in English: ' +
				`"Le client est refusé quand il n'est pas connecté et que la…". It is saved as is; rewrite it in English so the spec stays in one language.`
		]);
	});

	it('says it in French on a French spec', async () => {
		const result = await new AuthorBehaviorUseCase(advisor, undefined, declaring('fr')).execute({
			projectId: 'p1',
			featureId: 'feat-1',
			operations: [
				{
					kind: 'add_scenario',
					actionRef: 'act',
					name: 'The guest is refused when the cart is empty and the order is not created'
				}
			]
		});
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toContain(
			`ce texte se lit en anglais alors que la spec est écrite en français${NBSP}:`
		);
	});

	it('says nothing when no language is declared, on a commit, or when the locale cannot be read', async () => {
		const undeclared = await new AuthorBehaviorUseCase(advisor, undefined, declaring('')).execute({
			projectId: 'p1',
			featureId: 'feat-1',
			operations: batch
		});
		expect(undeclared.warnings).toEqual([]);
		const commit = await new AuthorBehaviorUseCase(advisor, undefined, declaring('en')).execute({
			projectId: 'p1',
			featureId: 'feat-1',
			operations: [],
			commit: 'token'
		});
		expect(commit.warnings).toEqual([]);
		const failing = { loadOperations: vi.fn(async () => Promise.reject(new Error('down'))) };
		const unread = await new AuthorBehaviorUseCase(advisor, undefined, failing).execute({
			projectId: 'p1',
			featureId: 'feat-1',
			operations: batch
		});
		expect(unread.warnings).toEqual([]);
	});
});
