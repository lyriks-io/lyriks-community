import { describe, expect, it } from 'vitest';
import { createEmptyDataDraft, type ProjectDataDraft } from '$domain/data';
import type { SpecLanguage } from '$domain/language';
import type { DataDraftRepositoryPort, EngineAnswer, UnspaghettitAdvisorPort } from '../ports';
import { ProjectRulesOracleUseCase } from './project-rules-oracle';

type Oracle = Pick<UnspaghettitAdvisorPort, 'proveProjectRules' | 'whatIfProject'>;

/** The data model of project p1: invariant inv-total was generated from the required rule of field f-total. */
const data: ProjectDataDraft = {
	...createEmptyDataDraft('p1'),
	rules: { existence: {}, generated: { 'inv-total': { entityId: 'e-order', fieldId: 'f-total', kind: 'required' } } }
};
const drafts = { load: async () => data, save: async () => {} } satisfies DataDraftRepositoryPort;

/** An engine answering with two rules, in the language it was asked in. */
const engine = (answer: (language?: string) => EngineAnswer | null): Oracle => ({
	proveProjectRules: async (args) => answer(args.language),
	whatIfProject: async (args) => answer(args.language)
});
const twoRules = (language?: string): EngineAnswer => ({
	kind: 'answer',
	value: { ok: true, language, rules: [{ invariantId: 'inv-total', verdict: 'holds' }, { invariantId: 'inv-hand', verdict: 'broken' }] }
});
const oracle = (advisor: Oracle, lang: SpecLanguage = 'en') => new ProjectRulesOracleUseCase(advisor, drafts, async () => lang);

describe('the oracle on the rules that span a project', () => {
	it('links a rule generated from the data model to that rule, and a hand-written one to the Rules tab', async () => {
		const answer = await oracle(engine(twoRules)).prove('p1');
		expect(answer).toEqual({
			kind: 'answer',
			value: {
				ok: true,
				language: 'en',
				rules: [
					{ invariantId: 'inv-total', verdict: 'holds', href: '/projects/p1/infrastructure?tab=model&view=rules&rule=required%3Af-total', fromDataModel: true },
					{ invariantId: 'inv-hand', verdict: 'broken', href: '/projects/p1/features?tab=rules', fromDataModel: false }
				]
			}
		});
	});

	it('asks the engine in the language of the spec, for a proof and for a what-if alike', async () => {
		const french = oracle(engine(twoRules), 'fr');
		expect(await french.prove('p1')).toMatchObject({ value: { language: 'fr' } });
		expect(await french.whatIf('p1', [{ kind: 'remove_project_invariant', id: 'inv-hand' }])).toMatchObject({ value: { language: 'fr' } });
	});

	it('turns an engine that says the change does not validate into a refusal naming its errors', async () => {
		const invalid = oracle(engine(() => ({ kind: 'answer', value: { ok: false, errors: ['inv-x is unknown', 'maxSteps too high'] } })));
		expect(await invalid.whatIf('p1', [])).toEqual({ kind: 'refused', error: 'inv-x is unknown; maxSteps too high' });
		const silent = oracle(engine(() => ({ kind: 'answer', value: { ok: false } })));
		expect(await silent.prove('p1')).toEqual({ kind: 'refused', error: 'The change does not validate.' });
	});

	it('passes a refusal on as it came, and answers nothing when the engine cannot be asked', async () => {
		expect(await oracle(engine(() => ({ kind: 'refused', error: 'busy' }))).prove('p1')).toEqual({ kind: 'refused', error: 'busy' });
		expect(await oracle(engine(() => null)).prove('p1')).toBeNull();
		expect(await oracle({}).prove('p1')).toBeNull();
		expect(await oracle({}).whatIf('p1', [])).toBeNull();
	});
});
