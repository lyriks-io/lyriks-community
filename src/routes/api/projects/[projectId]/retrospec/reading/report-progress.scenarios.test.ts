import { describe, expect, it } from 'vitest';
import { analysisOf, applyRetrospecActs, currentRun, runReach, scopeLine, type RetrospecDocument } from '$domain/retrospec';
import { PROJECT, answerOf, retrospecWorld, type State } from '$lib/server/retrospec-world.fixture';
import { POST } from './+server';

/**
 * The scenarios of what a run that writes nothing as it reads reports of its
 * reading (EVO-014 spec version 1, feat-145): Report the phase being read
 * (action 83ba020b) and Report a feature re-read (action ef746636), through
 * POST /api/projects/:projectId/retrospec/reading, its access gate, the
 * reading parser and the stored run; then what the board and the preview read
 * of it (criteria a9c3387c, 62846d95, faad6b0a, c54ce677).
 */

const PATH = `/api/projects/${PROJECT}/retrospec/reading`;

interface Scenario {
	readonly id: string;
	readonly name: string;
	readonly given: State;
	readonly body: Record<string, unknown>;
	readonly expected: 'success' | 'blocked';
	readonly then?: Readonly<Record<string, unknown>>;
}

/** The personas of feat-145: 91e97c18 Viewer, 6f2ae848 Outside the workspace. */
const VIEWER = { 'session.workspaceRole': 'viewer' };
const OUTSIDE = { 'session.workspaceRole': 'none' };

const stateOf = (doc: RetrospecDocument): State => {
	const run = currentRun(doc);
	return { 'run.phaseReported': run?.phaseReported ?? 'none', 'run.featuresRead': run?.featuresRead?.length ?? 0 };
};

const PHASE: readonly Scenario[] = [
	{ id: 'dabfb063', name: 'The AI says it reads the data model', given: { 'run.stage': 'launched' }, body: { phase: 'data' }, expected: 'success', then: { 'run.phaseReported': 'data' } },
	{ id: '344f08b0', name: 'No phase without a run under way', given: {}, body: { phase: 'data' }, expected: 'blocked' },
	{ id: '3a525ebc', name: "A viewer's AI reports no phase", given: { 'run.stage': 'launched', ...VIEWER }, body: { phase: 'data' }, expected: 'blocked' }
];

const READ: readonly Scenario[] = [
	{ id: 'aa9b8fa2', name: 'The AI reports a feature it re-read', given: { 'run.stage': 'launched' }, body: { read: ['feat-orders'] }, expected: 'success', then: { 'run.featuresRead': 1 } },
	{ id: '165dd06e', name: 'No feature re-read once the run is validated', given: { 'run.stage': 'published', 'product.gathered': true }, body: { read: ['feat-orders'] }, expected: 'blocked' },
	{ id: '910c3e2f', name: 'An AI outside the workspace reports no feature', given: { 'run.stage': 'launched', ...OUTSIDE }, body: { read: ['feat-orders'] }, expected: 'blocked' }
];

function suite(title: string, action: string, scenarios: readonly Scenario[]) {
	describe(title, () => {
		for (const scenario of scenarios) {
			it(`${scenario.name} [unspa:2b2afe0f:${action}:${scenario.id}]`, async () => {
				const world = retrospecWorld({ ...scenario.given, 'session.callerKind': 'ai_client' });
				const before = stateOf(world.doc());
				const answer = await answerOf(() => POST(world.event(PATH, scenario.body) as never));
				expect(answer.status === 200 ? 'success' : 'blocked').toBe(scenario.expected);
				const after = stateOf(world.doc());
				if (scenario.expected === 'success') for (const [path, value] of Object.entries(scenario.then ?? {})) expect(after[path]).toBe(value);
				else expect(after).toEqual(before);
			});
		}
	});
}

suite('Report the phase being read, through POST .../retrospec/reading [criterion:a9c3387c]', '83ba020b', PHASE);
suite('Report a feature re-read, through POST .../retrospec/reading [criterion:62846d95]', 'ef746636', READ);

describe('what the board and the preview read of a run that writes nothing [criterion:a9c3387c] [criterion:62846d95] [criterion:faad6b0a] [criterion:c54ce677]', () => {
	const facts = (doc: RetrospecDocument) => ({ doc, revisions: { features: 1 }, auditTimes: [], rebuiltFrom: null, hasSpec: true, leafFeatureIds: [] });

	it('reads done the phases before the one its AI said, and that one in progress', async () => {
		const world = retrospecWorld({ 'run.stage': 'launched', 'run.complementary': true, 'product.gathered': true, 'session.callerKind': 'ai_client' });
		await answerOf(() => POST(world.event(PATH, { phase: 'experience' }) as never));
		const phases = analysisOf(facts(world.doc())).progress.phases;
		expect(phases.map((p) => [p.key, p.state])).toEqual([
			['sources', 'done'],
			['product', 'done'],
			['features', 'done'],
			['data', 'done'],
			['experience', 'current'],
			['rules', 'pending'],
			['tech', 'pending'],
			['check', 'pending']
		]);
	});

	it('refuses a phase outside the order of work, naming the eight', async () => {
		const world = retrospecWorld({ 'run.stage': 'launched', 'session.callerKind': 'ai_client' });
		const answer = await answerOf(() => POST(world.event(PATH, { phase: 'design' }) as never));
		expect(answer.status).toBe(400);
		expect(String(answer.body.message)).toContain('sources, product, features, data, experience, rules, tech, check');
	});

	it('counts each feature once, however often it is reported', async () => {
		const world = retrospecWorld({ 'run.stage': 'launched', 'session.callerKind': 'ai_client' });
		await answerOf(() => POST(world.event(PATH, { read: ['feat-orders', 'feat-orders'] }) as never));
		await answerOf(() => POST(world.event(PATH, { read: ['feat-orders', 'feat-refunds'] }) as never));
		expect(currentRun(world.doc())?.featuresRead).toEqual(['feat-orders', 'feat-refunds']);
	});

	it('starts a Resume analysis from the phases the closed run read, and its Scope line says where it stopped', () => {
		const world = retrospecWorld({ 'run.stage': 'ready', 'run.complementary': true, 'product.gathered': true, 'run.resumable': true });
		const chosen = applyRetrospecActs(world.doc(), [{ op: 'choose_scope', scope: 'resume' }], { actor: { id: 'a', name: 'A' }, now: '2026-11-22T11:00:00.000Z' });
		if (!chosen.ok) throw new Error(chosen.reason);
		const phases = analysisOf(facts(chosen.doc)).progress.phases;
		expect(phases.filter((p) => p.state === 'done').map((p) => p.key)).toEqual(['sources', 'product', 'features', 'data']);
		const run = currentRun(chosen.doc)!;
		expect(scopeLine(run.mode, runReach(run.complementary))).toBe(
			'Where the last run stopped: Experience and design, Business rules, Tech stack, then the final check, and what changed in the code since commit 7c0d4b1. What it already read is not read again.'
		);
	});
});
