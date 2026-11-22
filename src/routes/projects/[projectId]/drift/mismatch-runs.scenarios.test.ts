import { describe, expect, it, vi } from 'vitest';
import { createEmptyGlossaryDraft } from '$domain/glossary';
import { currentRun, previewStatus, resumeOffered, resumePromptOfRun, runPaused, type PreviewStatus } from '$domain/retrospec';
import { sendClickOnProject } from '$lib/server/ai-session.server';
import { authorizeProjectAccess, requireProjectAccess } from '$lib/server/project-access.server';
import { ADA, PRODUCT, PROJECT, answerOf, retrospecWorld, type RetrospecWorld, type State } from '$lib/server/retrospec-world.fixture';
import type { DriftPageData } from '$lib/shared/code-drift-page';

const scene = vi.hoisted(() => ({ admin: false, role: 'designer', copied: [] as string[] }));
vi.mock('$lib/server/admin.server', () => ({ isAdmin: (event: { locals: { authRequired?: boolean } }) => !event.locals.authRequired || scene.admin }));
vi.mock('$lib/server/evolution-actor.server', async (original) => ({ ...(await original<typeof import('$lib/server/evolution-actor.server')>()), resolveRole: async () => scene.role }));
vi.mock('$lib/server/spec-code-drift.server', () => ({ readCodeChanges: async () => ({ changes: [], lastSyncAt: null, followed: 0 }) }));
vi.mock('$lib/server/spec-elements.server', () => ({ readSpecElements: async () => [] }));
vi.mock('$lib/server/behavior-read.server', () => ({ readBehavior: async () => ({ actions: {}, kernelRules: { total: 0 } }) }));
vi.mock('$ui/evolution/copy-prompt', () => ({ copyPrompt: async (prompt: string) => void scene.copied.push(prompt) }));
vi.mock('$ui/design-system', () => ({ pushToast: () => {} }));
const { load } = await import('./+page.server');
const { copyRunPrompt, handRunToMyAi, handsInSession } = await import('$ui/retrospec/run-handover');

/**
 * The scenarios of Mismatch while runs come and go (EVO-014 spec version 1,
 * feat-119): Open Mismatch (action 3caa7ebc), the load of the page behind the
 * project's access gate, reading the preview of the run under way, the next
 * analysis ticked by default and the history; and Resume the run with my AI
 * from Mismatch (action e0c218de), offered on a paused run to who may write,
 * handed to the AI in session or its prompt copied. The page reads a run
 * paused from when it last heard the AI, the way Reverse does.
 */

interface Scenario {
	readonly id: string;
	readonly name: string;
	readonly given: State;
	readonly persona?: string;
	readonly expected: 'success' | 'blocked';
	readonly then?: Readonly<Record<string, unknown>>;
}

const PERSONAS: Readonly<Record<string, State>> = {
	'11dadcdf': { 'session.workspaceRole': 'viewer' },
	'7929d661': { 'session.workspaceRole': 'none' },
	'2b7ba910': { 'session.workspaceRole': 'owner' },
	fc650400: { 'session.workspaceRole': 'admin' },
	a8506e87: { 'session.isInstallationAdmin': true }
};
const given = (s: Scenario): State => ({ ...(s.persona ? PERSONAS[s.persona] : {}), ...s.given });

const NOW_MS = Date.parse('2026-11-22T11:00:00.000Z');
/** When the page last heard the AI, as ai.presence reads it. */
const SEEN: Readonly<Record<string, string | null>> = { working: new Date(NOW_MS - 10_000).toISOString(), quiet: new Date(NOW_MS - 90_000).toISOString(), disconnected: null };

function worldOf(state: State): RetrospecWorld {
	scene.admin = state['session.isInstallationAdmin'] === true;
	scene.role = String(state['session.workspaceRole'] ?? 'designer');
	return retrospecWorld(state, {
		loadBaselinesDraft: { execute: async () => ({ baselines: [] }) as never },
		loadGlossaryDraft: { execute: async () => createEmptyGlossaryDraft(PROJECT) }
	});
}

/** Opening Mismatch: the project's gate, as its layout runs it, then the page's load. */
async function openMismatch(world: RetrospecWorld): Promise<{ drift: DriftPageData; history: unknown } | null> {
	const event = { ...world.event(`/projects/${PROJECT}/drift`, undefined, 'GET'), params: { projectId: PROJECT }, depends: () => {} };
	const opened = await answerOf(async () => {
		await requireProjectAccess(event as never, PROJECT, 'read');
		return Response.json(await load(event as never));
	});
	return opened.status === 200 ? (opened.body as never) : null;
}

/** What the preview says, the page reading the run paused once the AI went silent. */
function shownStatus(drift: DriftPageData, state: State): PreviewStatus | 'first_written' | 'none' {
	if (drift.firstWritten) return 'first_written';
	if (!drift.preview) return 'none';
	const seenAt = SEEN[String(state['ai.presence'] ?? 'disconnected')] ?? drift.preview.aiLastSeenAt;
	return previewStatus({ status: drift.preview.status === 'waiting' ? 'source' : 'running' } as never, runPaused(seenAt, NOW_MS)) ?? 'none';
}

const OPEN: readonly Scenario[] = [
	{ id: 'd37b5947', name: 'A designer opens Mismatch without the history', given: {}, expected: 'success', then: { 'history.shown': false } },
	{ id: 'da90f393', name: 'A workspace owner reads the history', given: {}, persona: '2b7ba910', expected: 'success', then: { 'history.shown': true } },
	{ id: 'bc379f75', name: 'A workspace admin reads the history', given: {}, persona: 'fc650400', expected: 'success', then: { 'history.shown': true } },
	{ id: '77bc6b77', name: 'An installation administrator reads the history', given: {}, persona: 'a8506e87', expected: 'success', then: { 'history.shown': true } },
	{ id: '3f245221', name: 'Without sign-in the single operator reads the history', given: { 'installation.signInRequired': false }, expected: 'success', then: { 'history.shown': true } },
	{ id: '56369c70', name: 'A viewer opens Mismatch to read it', given: {}, persona: '11dadcdf', expected: 'success', then: { 'history.shown': false } },
	{ id: 'cb3bd1a9', name: 'Someone outside the workspace does not see the project', given: {}, persona: '7929d661', expected: 'blocked' },
	{ id: '1c5ad721', name: 'The preview waits for the AI', given: { 'run.stage': 'ready', 'product.gathered': true }, expected: 'success', then: { 'preview.status': 'waiting' } },
	{ id: 'b554b514', name: 'The preview follows the AI as it reads', given: { 'run.stage': 'launched', 'ai.presence': 'working' }, expected: 'success', then: { 'preview.status': 'reading' } },
	{ id: 'f0092541', name: 'The preview reads paused when the AI is silent', given: { 'run.stage': 'launched', 'ai.presence': 'disconnected' }, expected: 'success', then: { 'preview.status': 'paused' } },
	{ id: '51ec16d5', name: 'After a first analysis Mismatch leads to Knowledge', given: { 'run.stage': 'analysis_over', 'product.gathered': true }, expected: 'success', then: { 'preview.status': 'first_written' } },
	{ id: '0b174201', name: 'A product without specification ticks Full analysis', given: {}, expected: 'success', then: { 'next.defaultScope': 'whole' } },
	{ id: '4b0138d0', name: 'A specification ticks Delta analysis', given: { 'run.stage': 'published', 'product.gathered': true }, expected: 'success', then: { 'next.defaultScope': 'delta', 'preview.status': 'none' } },
	{
		id: 'd2652508',
		name: 'A run closed before its final check ticks Resume analysis',
		given: { 'run.stage': 'analysis_over', 'run.complementary': true, 'product.gathered': true, 'run.closedByHand': true },
		expected: 'success',
		then: { 'next.defaultScope': 'resume' }
	}
];

describe('Open Mismatch, behind the project gate, through the page load [criterion:63d6ffe7] [criterion:79b3cf4f] [criterion:59f2294c]', () => {
	for (const scenario of OPEN) {
		it(`${scenario.name} [unspa:2cd99b29:3caa7ebc:${scenario.id}]`, async () => {
			const state = given(scenario);
			const opened = await openMismatch(worldOf(state));
			expect(opened ? 'success' : 'blocked').toBe(scenario.expected);
			if (!opened) return;
			const read: State = { 'history.shown': opened.history !== null, 'preview.status': shownStatus(opened.drift, state), 'next.defaultScope': opened.drift.next?.scope ?? null };
			for (const [path, value] of Object.entries(scenario.then ?? {})) expect(read[path], path).toBe(value);
		});
	}
});

const RESUME: readonly Scenario[] = [
	{ id: 'f3976027', name: 'In session the paused run goes back to the AI', given: { 'run.stage': 'launched', 'ai.presence': 'disconnected', 'session.listening': true }, expected: 'success', then: { 'run.resumeHandedInSession': true, 'prompt.resumeCopied': false } },
	{ id: '4c801547', name: 'Without a session the resume prompt is copied', given: { 'run.stage': 'launched', 'ai.presence': 'disconnected' }, expected: 'success', then: { 'prompt.resumeCopied': true } },
	{ id: '714de760', name: 'A run its AI still reads is not resumed', given: { 'run.stage': 'launched', 'ai.presence': 'working' }, expected: 'blocked' },
	{ id: 'ef956aa1', name: 'A reader cannot resume the run', given: { 'run.stage': 'launched', 'ai.presence': 'disconnected' }, persona: '11dadcdf', expected: 'blocked' }
];

describe('Resume the run with my AI from Mismatch [criterion:939851b5] [criterion:32e221a6]', () => {
	for (const scenario of RESUME) {
		it(`${scenario.name} [unspa:2cd99b29:e0c218de:${scenario.id}]`, async () => {
			scene.copied = [];
			const state = given(scenario);
			const world = worldOf(state);
			const opened = await openMismatch(world);
			const event = world.event(`/projects/${PROJECT}/drift`, undefined, 'GET');
			const canWrite = await authorizeProjectAccess(event as never, PROJECT, 'write').then(() => true, () => false);
			const status = opened ? shownStatus(opened.drift, state) : 'none';
			const offered = status !== 'first_written' && status !== 'none' && resumeOffered(status, canWrite);
			expect(offered ? 'success' : 'blocked').toBe(scenario.expected);
			if (!offered || !opened?.drift.preview) return;
			if (handsInSession({ listening: state['session.listening'] === true })) {
				const ai = { send: async (input: Parameters<typeof sendClickOnProject>[3]) => !!(await sendClickOnProject(world.services, PROJECT, ADA.id, input, canWrite))?.ok };
				await handRunToMyAi(ai, 'resume', PRODUCT);
			} else await copyRunPrompt('resume', opened.drift.preview.resumePrompt);
			const run = currentRun(world.doc())!;
			const read: State = {
				'run.resumeHandedInSession': (world.evolution().clicks ?? []).some((c) => c.kind === 'resume' && c.state === 'waiting'),
				'prompt.resumeCopied': scene.copied.at(-1) === resumePromptOfRun(run, PRODUCT, PROJECT)
			};
			for (const [path, value] of Object.entries(scenario.then ?? {})) expect(read[path], path).toBe(value);
		});
	}
});

describe('the head of Mismatch and its preview [criterion:59f2294c] [criterion:63d6ffe7] [criterion:79b3cf4f] [criterion:32e221a6]', () => {
	it('offers the next analysis before the specification is validated, and none while a run is under way', async () => {
		const empty = await openMismatch(worldOf({}));
		expect(empty?.drift.state).toBe('draft');
		expect(empty?.drift.next?.choices.map((c) => c.title)).toEqual(['Delta analysis', 'Full analysis']);
		const running = await openMismatch(worldOf({ 'run.stage': 'launched' }));
		expect(running?.drift.next).toBeNull();
		expect(running?.drift.preview).not.toBeNull();
	});

	it('says what the run under way reads and what it found', async () => {
		const opened = await openMismatch(worldOf({ 'run.stage': 'launched', 'run.complementary': true, 'product.gathered': true }));
		const preview = opened!.drift.preview!;
		expect(preview.scopeTitle).toBe('Delta analysis');
		expect(preview.scope).toContain('Nothing is written before you validate it on Mismatch');
		expect(preview.found).toEqual([
			{ n: 0, label: 'features re-read' },
			{ n: 0, label: 'differences reported' }
		]);
		expect(preview.phases.map((p) => p.key)).toEqual(['sources', 'product', 'features', 'data', 'experience', 'rules', 'tech', 'check']);
	});

	it('leads to Knowledge after a first analysis, with no report', async () => {
		const opened = await openMismatch(worldOf({ 'run.stage': 'analysis_over', 'product.gathered': true }));
		expect(opened?.drift.firstWritten).toBe(true);
		expect(opened?.drift.report).toBeNull();
	});

	it('offers Resume it with my AI only on a paused run, to who may write', () => {
		expect(resumeOffered('paused', true)).toBe(true);
		expect(resumeOffered('paused', false)).toBe(false);
		expect(resumeOffered('reading', true)).toBe(false);
		expect(resumeOffered('waiting', true)).toBe(false);
	});
});
