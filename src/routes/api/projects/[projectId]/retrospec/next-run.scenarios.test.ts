import { describe, expect, it, vi } from 'vitest';
import { currentRun, nextRunOffer, promptOfRun, type RetrospecScope } from '$domain/retrospec';
import { sendClickOnProject } from '$lib/server/ai-session.server';
import { readNextRun } from '$lib/server/retrospec-status.server';
import { ADA, PRODUCT, PROJECT, answerOf, retrospecWorld, stageOf, type RetrospecWorld, type State } from '$lib/server/retrospec-world.fixture';

const copied = vi.hoisted(() => ({ prompts: [] as string[] }));
vi.mock('$ui/evolution/copy-prompt', () => ({ copyPrompt: async (prompt: string) => void copied.prompts.push(prompt) }));
vi.mock('$ui/design-system', () => ({ pushToast: () => {} }));
vi.mock('$lib/server/spec-elements.server', () => ({ readSpecElements: async () => [] }));
const { POST } = await import('./+server');
const { copyRunPrompt, handRunToMyAi, handsInSession } = await import('$ui/retrospec/run-handover');

/**
 * The scenarios of the next run (EVO-014 spec version 1), run against the real
 * code: Launch the next analysis from Mismatch (action d437c7e3 of feat-146),
 * Relaunch the analysis (e24bd960) and Choose how much a later run reads
 * (8a728d7f of feat-147), through POST /api/projects/:projectId/retrospec, its
 * access gate, the acts parser, the server's reading of the next run and the
 * stored document. Mismatch's hand-over is the page's own: the prompt of the
 * option, copied before the start when no AI listens; the run click, sent
 * through the session's server once the run started when one does.
 */

const NOW = '2026-11-22T11:00:00.000Z';
const PATH = `/api/projects/${PROJECT}/retrospec`;

interface Scenario {
	readonly id: string;
	readonly name: string;
	readonly given: State;
	readonly persona?: string;
	readonly scope?: RetrospecScope;
	readonly expected: 'success' | 'blocked';
	readonly then?: Readonly<Record<string, unknown>>;
}

/** The personas of feat-146 and feat-147 and their state overrides. */
const PERSONAS: Readonly<Record<string, State>> = {
	'7996ce88': { 'session.workspaceRole': 'viewer' },
	'01a87970': { 'session.workspaceRole': 'none' },
	'7dd8686a': { 'session.workspaceRole': 'operator' },
	b17e1054: { 'session.workspaceRole': 'viewer' },
	'814d402a': { 'session.workspaceRole': 'none' },
	'3d47d323': { 'session.workspaceRole': 'operator' }
};

const given = (s: Scenario): State => ({ ...(s.persona ? PERSONAS[s.persona] : {}), ...s.given });

/** The scenario's paths as the stored document and the session's clicks read them. */
function stateOf(world: RetrospecWorld, copiedPrompt: string | null): State {
	const doc = world.doc();
	const run = currentRun(doc);
	return {
		'run.stage': stageOf(doc),
		'run.scope': run?.complementary?.scope ?? 'delta',
		'run.complementary': !!run?.complementary,
		'run.mode': run?.mode ?? 'repo',
		'run.resumable': !!run?.complementary?.resumable,
		'history.closedRuns': doc.runs.filter((r) => r.closedAt).length,
		'run.handedInSession': (world.evolution().clicks ?? []).some((c) => c.kind === 'run' && c.state === 'waiting'),
		// What was copied is the prompt the run got: the one its Source step would copy.
		'prompt.runCopied': !!run && copiedPrompt !== null && copiedPrompt === promptOfRun(run, 0, PRODUCT, PROJECT)
	};
}

const holds = (state: State, then: Readonly<Record<string, unknown>> = {}) => Object.entries(then).filter(([path, value]) => state[path] !== value).map(([path, value]) => `${path}: ${String(state[path])} instead of ${String(value)}`);

const published = { 'run.stage': 'published', 'product.gathered': true };

const LAUNCH: readonly Scenario[] = [
	{ id: 'c993f33e', name: 'An editor runs a delta analysis', given: { ...published, 'validated.commitRecorded': true }, scope: 'delta', expected: 'success', then: { 'run.stage': 'ready', 'run.scope': 'delta' } },
	{ id: 'cf734bc4', name: 'An editor runs a full analysis of a product that has a specification', given: published, scope: 'whole', expected: 'success', then: { 'run.scope': 'whole' } },
	{ id: '8e0f0a7c', name: 'The launch waits for the run the AI reads', given: { 'run.stage': 'launched' }, scope: 'delta', expected: 'blocked' },
	{ id: '22506a60', name: 'A run whose analysis is over closes', given: { 'run.stage': 'analysis_over' }, scope: 'whole', expected: 'success', then: { 'history.closedRuns': 1 } },
	{ id: 'ec4f72dd', name: 'A viewer cannot launch from Mismatch', given: published, persona: '7996ce88', scope: 'delta', expected: 'blocked' },
	{ id: '822eb092', name: 'Someone outside the workspace cannot launch from Mismatch', given: published, persona: '01a87970', scope: 'delta', expected: 'blocked' },
	{ id: 'caaa0bc8', name: 'Without sign-in a viewer launches from Mismatch', given: { ...published, 'installation.signInRequired': false, 'session.workspaceRole': 'viewer' }, scope: 'delta', expected: 'success', then: { 'run.stage': 'ready' } },
	{ id: 'f86c8094', name: 'Delta analysis is refused on a product without specification', given: { 'run.stage': 'none' }, scope: 'delta', expected: 'blocked' },
	{ id: '29534d12', name: 'A first run reads the whole product from Mismatch', given: { 'run.stage': 'none' }, scope: 'whole', expected: 'success', then: { 'run.stage': 'ready', 'run.complementary': false } },
	{ id: '3dd572f3', name: 'Resume analysis after a run closed before its final check', given: { 'run.stage': 'analysis_over', 'run.closedByHand': true, 'product.gathered': true }, scope: 'resume', expected: 'success', then: { 'run.scope': 'resume', 'run.resumable': true } },
	{ id: '20ed8f29', name: 'Resume analysis is refused when no run was closed short', given: published, scope: 'resume', expected: 'blocked' },
	{ id: 'c85f696c', name: 'In session the run goes to the AI', given: { ...published, 'session.listening': true }, scope: 'delta', expected: 'success', then: { 'run.handedInSession': true, 'prompt.runCopied': false } },
	{ id: '531d6549', name: 'Without a session the prompt is copied on the spot', given: published, scope: 'delta', expected: 'success', then: { 'prompt.runCopied': true, 'run.handedInSession': false } }
];

/** Run it with my AI, as the head of Mismatch does it: the option's prompt copied first when no AI listens, the click sent once the run started when one does. */
async function runItWithMyAi(world: RetrospecWorld, scope: RetrospecScope) {
	copied.prompts = [];
	const offer = nextRunOffer(await readNextRun(world.services, PROJECT), PRODUCT, PROJECT, 0, NOW);
	const choice = offer.choices.find((c) => c.scope === scope);
	const inSession = handsInSession({ listening: world.state['session.listening'] === true });
	if (!inSession && choice?.prompt) await copyRunPrompt('run', choice.prompt);
	const answer = await answerOf(() => POST(world.event(PATH, { acts: [{ op: 'start', mode: 'repo', scope }] }) as never));
	if (answer.status === 200 && inSession) {
		const ai = { send: async (input: Parameters<typeof sendClickOnProject>[3]) => !!(await sendClickOnProject(world.services, PROJECT, ADA.id, input, true))?.ok };
		await handRunToMyAi(ai, 'run', PRODUCT);
	}
	return { answer, copied: copied.prompts.at(-1) ?? null };
}

describe('Launch the next analysis from Mismatch, through POST /api/projects/:projectId/retrospec [criterion:d44eb4e4] [criterion:91e59d2e] [criterion:6f022f18]', () => {
	for (const scenario of LAUNCH) {
		it(`${scenario.name} [unspa:588cd874:d437c7e3:${scenario.id}]`, async () => {
			const world = retrospecWorld(given(scenario));
			const { answer, copied: prompt } = await runItWithMyAi(world, scenario.scope!);
			expect(answer.status === 200 ? 'success' : 'blocked').toBe(scenario.expected);
			if (scenario.expected === 'success') expect(holds(stateOf(world, prompt), scenario.then)).toEqual([]);
			else expect(stageOf(world.doc())).toBe(String(given(scenario)['run.stage'] ?? 'none'));
		});
	}
});

const RELAUNCH: readonly Scenario[] = [
	{ id: 'af27dd14', name: 'An editor relaunches after a validated run', given: { ...published, 'validated.commitRecorded': true }, expected: 'success', then: { 'run.stage': 'ready', 'run.complementary': true, 'run.scope': 'delta' } },
	{ id: '772810a2', name: 'A run not validated closes when the next one starts', given: { 'run.stage': 'analysis_over', 'sources.textsStored': true }, expected: 'success', then: { 'history.closedRuns': 1, 'run.complementary': true } },
	{ id: 'f28ea8e1', name: 'After a closing by hand the next run resumes where it stopped', given: { 'run.stage': 'analysis_over', 'run.closedByHand': true, 'validated.commitRecorded': true }, expected: 'success', then: { 'run.scope': 'resume', 'run.resumable': true } },
	{ id: '54cbc32b', name: 'With no commit the next run still reads what changed', given: published, expected: 'success', then: { 'run.scope': 'delta' } },
	{ id: '0d1cac3e', name: 'A run the AI is reading is not replaced', given: { 'run.stage': 'launched' }, expected: 'blocked' },
	{ id: '9bf36606', name: 'A viewer cannot relaunch', given: published, persona: '7996ce88', expected: 'blocked' },
	{ id: '84ad5dd5', name: 'Someone outside the workspace cannot relaunch', given: published, persona: '01a87970', expected: 'blocked' },
	{ id: '9f16cf47', name: 'Without sign-in a viewer relaunches', given: { ...published, 'installation.signInRequired': false, 'session.workspaceRole': 'viewer' }, expected: 'success', then: { 'run.stage': 'ready' } },
	{ id: '06456aa5', name: 'The Community operator relaunches', given: published, persona: '7dd8686a', expected: 'success', then: { 'run.stage': 'ready' } }
];

describe('Relaunch the analysis on Reverse, the default read by the server [criterion:04f3bc85]', () => {
	for (const scenario of RELAUNCH) {
		it(`${scenario.name} [unspa:588cd874:e24bd960:${scenario.id}]`, async () => {
			const world = retrospecWorld(given(scenario));
			const answer = await answerOf(() => POST(world.event(PATH, { acts: [{ op: 'start', mode: 'repo' }] }) as never));
			expect(answer.status === 200 ? 'success' : 'blocked').toBe(scenario.expected);
			if (scenario.expected === 'success') expect(holds(stateOf(world, null), scenario.then)).toEqual([]);
		});
	}
});

/** Start a Reverse-Specification on Reverse (action d1844482): `mode` is what the start names, the default read by the server. */
const START: readonly (Scenario & { readonly mode?: string })[] = [
	{ id: 'b81382eb', name: 'A designer starts the first run', given: {}, expected: 'success', then: { 'run.stage': 'ready', 'run.complementary': false, 'run.mode': 'repo' } },
	{ id: '4f3e765b', name: 'A run under way refuses a new start', given: { 'run.stage': 'launched' }, expected: 'blocked' },
	{ id: '2511f9ce', name: 'Starting closes a run whose analysis is over', given: { 'run.stage': 'analysis_over', 'product.gathered': true }, expected: 'success', then: { 'history.closedRuns': 1, 'run.stage': 'ready', 'run.complementary': true } },
	{ id: '4f58c54d', name: 'A run nobody handed to the AI is replaced', given: { 'run.stage': 'ready', 'run.mode': 'both' }, mode: 'repo', expected: 'success', then: { 'history.closedRuns': 0, 'run.mode': 'repo' } },
	{ id: 'e75d4b8c', name: 'A viewer cannot start a run', given: {}, persona: 'b17e1054', expected: 'blocked' },
	{ id: '7d13f480', name: 'Someone outside the workspace does not see the project', given: {}, persona: '814d402a', expected: 'blocked' },
	{ id: '7b6a2460', name: 'Without sign-in a viewer starts a run', given: { 'installation.signInRequired': false, 'session.workspaceRole': 'viewer' }, expected: 'success', then: { 'run.stage': 'ready' } },
	{ id: '33ef15dd', name: 'The Community operator starts a run', given: {}, persona: '3d47d323', expected: 'success', then: { 'run.stage': 'ready' } },
	{ id: 'e4984ede', name: 'A run closed without validation makes the next run complementary', given: { 'run.stage': 'analysis_over', 'product.gathered': false }, expected: 'success', then: { 'run.complementary': true, 'history.closedRuns': 1 } }
];

describe('Start a Reverse-Specification on Reverse, through POST /api/projects/:projectId/retrospec', () => {
	for (const scenario of START) {
		it(`${scenario.name} [unspa:44aca279:d1844482:${scenario.id}]`, async () => {
			const world = retrospecWorld(given(scenario));
			const answer = await answerOf(() => POST(world.event(PATH, { acts: [{ op: 'start', mode: scenario.mode ?? 'repo' }] }) as never));
			expect(answer.status === 200 ? 'success' : 'blocked').toBe(scenario.expected);
			if (scenario.expected === 'success') expect(holds(stateOf(world, null), scenario.then)).toEqual([]);
		});
	}
});

const CHOOSE: readonly Scenario[] = [
	{ id: '820bbf50', name: 'A later run reads the whole product again', given: { 'run.stage': 'ready', 'run.complementary': true, 'product.gathered': true }, scope: 'whole', expected: 'success', then: { 'run.scope': 'whole' } },
	{ id: '03e2bbb1', name: 'A first run has no delta to choose', given: { 'run.stage': 'ready' }, scope: 'delta', expected: 'blocked' },
	{ id: '79e8a9f2', name: 'A viewer cannot choose how much a run reads', given: { 'run.stage': 'ready', 'run.complementary': true, 'product.gathered': true }, persona: 'b17e1054', scope: 'whole', expected: 'blocked' },
	{ id: 'fab86a3a', name: 'Outside the workspace, the choice of scope answers not found', given: { 'run.stage': 'ready', 'run.complementary': true, 'product.gathered': true }, persona: '814d402a', scope: 'whole', expected: 'blocked' },
	{ id: '46d38ec7', name: 'How much a run reads cannot change once the prompt runs', given: { 'run.stage': 'launched', 'run.complementary': true, 'product.gathered': true }, scope: 'whole', expected: 'blocked' },
	{ id: '6b5c5822', name: 'A run started after a closing by hand resumes', given: { 'run.stage': 'ready', 'run.complementary': true, 'product.gathered': true, 'run.resumable': true }, scope: 'resume', expected: 'success', then: { 'run.scope': 'resume' } },
	{ id: '506ecc57', name: 'Resume analysis is refused when nothing is to resume', given: { 'run.stage': 'ready', 'run.complementary': true, 'product.gathered': true }, scope: 'resume', expected: 'blocked' }
];

describe('Choose how much a later run reads, on the Source step of Reverse [criterion:1f1f4ca8]', () => {
	for (const scenario of CHOOSE) {
		it(`${scenario.name} [unspa:44aca279:8a728d7f:${scenario.id}]`, async () => {
			const world = retrospecWorld(given(scenario));
			const before = currentRun(world.doc())?.complementary?.scope ?? null;
			const answer = await answerOf(() => POST(world.event(PATH, { acts: [{ op: 'choose_scope', scope: scenario.scope }] }) as never));
			expect(answer.status === 200 ? 'success' : 'blocked').toBe(scenario.expected);
			if (scenario.expected === 'success') expect(holds(stateOf(world, null), scenario.then)).toEqual([]);
			else expect(currentRun(world.doc())?.complementary?.scope ?? null).toBe(before);
		});
	}
});

describe('what each option of the next run asks and hands the AI [criterion:bf0ea80c] [criterion:04f3bc85] [criterion:0fb33bf2]', () => {
	it('ticks Full analysis on a product with no specification, Delta greyed with its reason', async () => {
		const offer = nextRunOffer(await readNextRun(retrospecWorld({ 'run.stage': 'none' }).services, PROJECT), PRODUCT, PROJECT, 0, NOW);
		expect(offer.scope).toBe('whole');
		expect(offer.choices.map((c) => [c.scope, c.unavailable])).toEqual([
			['delta', 'Nothing to compare yet: the product has no specification.'],
			['whole', null]
		]);
		expect(offer.choices.find((c) => c.scope === 'whole')?.question.title).toBe('Launch a new Reverse-Specification?');
	});

	it('ticks Delta analysis on a specification, with or without a commit, and says what it reads', async () => {
		const offer = nextRunOffer(await readNextRun(retrospecWorld({ ...published, 'validated.commitRecorded': true }).services, PROJECT), PRODUCT, PROJECT, 0, NOW);
		expect(offer.scope).toBe('delta');
		expect(offer.choices.find((c) => c.scope === 'delta')?.question.message).toContain('it reads what changed in the code since commit 7c0d4b1 and the changes made in the spec by hand.');
		expect(offer.choices.find((c) => c.scope === 'whole')?.question.message).toContain('it reads the whole product again');
		const noCommit = nextRunOffer(await readNextRun(retrospecWorld(published).services, PROJECT), PRODUCT, PROJECT, 0, NOW);
		expect(noCommit.scope).toBe('delta');
		expect(noCommit.choices.find((c) => c.scope === 'delta')?.question.message).toContain('it reads only what is new or changed since in the code and the documentation its elements cite.');
	});

	it('ticks Resume analysis after a run closed before its final check, and its prompt says where to pick up', async () => {
		const world = retrospecWorld({ 'run.stage': 'analysis_over', 'run.closedByHand': true, 'validated.commitRecorded': true });
		const offer = nextRunOffer(await readNextRun(world.services, PROJECT), PRODUCT, PROJECT, 0, NOW);
		expect(offer.scope).toBe('resume');
		const resume = offer.choices.find((c) => c.scope === 'resume')!;
		expect(resume.question.message).toContain('it resumes where the last run stopped');
		expect(resume.question.message).toContain('The last run is not validated: it closes and stays in the history');
		expect(resume.prompt).toContain('resume the Reverse-Specification of Shop (Lyriks project shop) where its last run stopped before its final check');
		expect(resume.prompt).toContain('Also read what changed in the code since commit 7c0d4b1aa');
		expect(resume.prompt).toContain('report_retrospec_reading, phase:');
	});
});
