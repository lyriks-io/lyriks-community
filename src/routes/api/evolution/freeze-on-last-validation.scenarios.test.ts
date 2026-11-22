import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTION_KEY, REQUEST, assertionsHold, atImpactOf, stateOf, stateOfRequest, world, type Scenario } from './evo011-scenarios.fixture';

/**
 * The scenarios of "Freeze the version on a person's last validation" (action
 * 85460780 of feat-31, as EVO-011 spec version 2 has them), run against the
 * real code: the validation that leaves nothing of the Specification waiting
 * goes through POST /api/evolution and the real batch, which freezes the
 * version in the same act or says what holds the freeze. Succeeds when the
 * request stands frozen in Build afterwards; is refused when it does not.
 */

const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('$lib/server/evolution-view.server', async (original) => ({ ...(await original<typeof import('$lib/server/evolution-view.server')>()), loadEvolutionView: async () => scene.view }));
vi.mock('$domain/evolution', async (original) => ({ ...(await original<typeof import('$domain/evolution')>()), dueReadings: () => ({ impact: [], report: false }) }));
vi.mock('$lib/server/sync-bus.server', async (original) => ({ ...(await original<typeof import('$lib/server/sync-bus.server')>()), publishSectionChange: vi.fn() }));
vi.mock('$lib/server/evolution-touched-validation.server', () => ({ readTouchedValidation: async () => ({ readable: true, specValidated: false, lines: [], awaitingChoice: 0, validated: [] }) }));
const { POST } = await import('./+server');

const SURFACE = '13e955f6';
const ACTION = '85460780';
const atImpact = { 'request.stage': 'coherence', 'coherence.ready': true, 'specification.held': true };

const SCENARIOS: readonly Scenario[] = [
	{
		id: 'c0e602be',
		name: "A person's last validation freezes version 1",
		given: atImpact,
		expected: 'success',
		then: [
			{ path: 'request.stage', operator: 'equals', value: 'implementation' },
			{ path: 'request.frozen', operator: 'is_true' },
			{ path: 'request.frozenVersion', operator: 'equals', value: 1 }
		]
	},
	{
		id: 'a025595a',
		name: 'A request sent back freezes version 2 on its last validation',
		given: { ...atImpact, 'request.frozenVersion': 1 },
		expected: 'success',
		then: [{ path: 'request.frozenVersion', operator: 'equals', value: 2 }]
	},
	// Delegated, so the AI's validation counts as the person's: it still freezes nothing.
	{ id: '53638137', name: 'A validation an AI gives freezes nothing', given: { ...atImpact, 'session.callerKind': 'ai_client', 'ai.delegated': true }, expected: 'blocked' },
	{ id: '86ca73fa', name: 'No freeze before the readings ran', given: { 'request.stage': 'coherence', 'specification.held': true }, expected: 'blocked', holds: 'The coherence check has not been run on this request.' },
	{ id: '9cffff23', name: 'An undecided blocking finding freezes nothing', given: { ...atImpact, 'coherence.blockingOpen': true }, expected: 'blocked', holds: 'A blocking finding this change brings is still undecided.' },
	{ id: '4bc60061', name: 'A critical answer still empty freezes nothing', given: atImpact, params: { criticalAnswerEmpty: true }, expected: 'blocked', holds: 'Critical fields are still empty.' },
	{ id: '025a0f96', name: 'A drafted behaviour that no longer applies freezes nothing', given: atImpact, params: { draftModelsApply: false }, expected: 'blocked', holds: 'The behaviour model of draft "draft:r-1" does not apply: action a9 does not exist.' },
	{ id: 'b2dcbbfa', name: 'The engine silent freezes nothing', given: { ...atImpact, 'specification.actionsReadable': false }, expected: 'blocked', holds: 'The engine did not answer, so the actions of the Specification cannot be read now.' }
];

const engine = { answers: true, applies: true };
const door = world(scene, engine);

beforeEach(() => {
	engine.answers = true;
	engine.applies = true;
});

describe('Freeze the version on a person\'s last validation, through POST /api/evolution', () => {
	for (const scenario of SCENARIOS) {
		it(`${scenario.name} [unspa:${SURFACE}:${ACTION}:${scenario.id}]`, async () => {
			const state = stateOf(scenario);
			const request = atImpactOf(state);
			door.seed(state, request);
			// Every item validated but the last answer, the engine answering; then the last answer, the engine as the scenario says.
			const items = [{ op: 'validate_field', requestId: REQUEST, ...ACTION_KEY }, ...door.answersOf(request)];
			const last = items.pop()!;
			expect((await door.post(POST, items)).ok).toBe(true);
			expect(door.stored().stage).toBe('coherence');
			engine.answers = state['specification.actionsReadable'] !== false;
			engine.applies = state['$draftModelsApply'] !== false;
			const posted = await door.post(POST, [last]);
			// The validation itself always stands: a freeze that does not follow is said, never a refusal of the act.
			expect(posted.ok).toBe(true);
			const stored = door.stored();
			const final = stateOfRequest(stored);
			const frozen = final['request.stage'] === 'implementation' && final['request.frozen'] === true;
			expect(frozen ? 'success' : 'blocked').toBe(scenario.expected);
			if (scenario.expected === 'success') {
				expect(assertionsHold(scenario, final)).toEqual([]);
				// The history names the person whose validation froze it.
				expect(stored.history.find((h) => h.type === 'spec_frozen')?.authorId).toBe('ana@example.test');
			} else {
				// Nothing froze: the request stands at the Impact analysis, the validation given kept.
				expect(final['request.stage']).toBe('coherence');
				expect(stored.fieldValidations.some((v) => v.key.split('@')[0] === last.fieldPath)).toBe(true);
				// The batch says what holds the freeze; after an AI's validation it says nothing of one.
				const said = posted.results.filter((r) => r.summary.startsWith('Automatic:')).map((r) => r.summary);
				if (scenario.holds) expect(said).toEqual([expect.stringContaining(`Automatic: Nothing was frozen: ${scenario.holds}`)]);
				else expect(said).toEqual([]);
			}
		});
	}
});
