import { describe, expect, it } from 'vitest';
import { pendingProjectClicksOf } from '$domain/evolution';
import { currentRun, promptOfRun, resumePromptOfRun } from '$domain/retrospec';
import { awaitProjectEvent, openProjectSession, sendClickOnProject } from './ai-session.server';
import { authorizeProjectAccess } from './project-access.server';
import { ADA, PRODUCT, PROJECT, retrospecWorld, type State } from './retrospec-world.fixture';

/**
 * The scenarios of Hand a run to my AI (EVO-014 spec version 1, action
 * 077fe5e2 of feat-7), run against the real session server: a click of kind
 * run or resume waits for the person's AI, counts as their act, and reaches it
 * through await_evolution_event with the prompt of the run to follow
 * (criterion 1bf80a5a). Who may write the project is the access gate's answer.
 */

interface Scenario {
	readonly id: string;
	readonly name: string;
	readonly given: State;
	readonly kind: 'run' | 'resume';
	readonly expected: 'success' | 'blocked';
}

const SCENARIOS: readonly Scenario[] = [
	{ id: 'f2b3a6fa', name: 'A run waits for the AI in session', given: { 'aiSession.status': 'open', 'aiSession.activity': 'listening' }, kind: 'run', expected: 'success' },
	{ id: 'f3d316de', name: 'A paused run is handed back to the AI', given: { 'aiSession.status': 'open', 'aiSession.activity': 'listening' }, kind: 'resume', expected: 'success' },
	{ id: '7dc404d1', name: 'A reader hands no run to an AI', given: { 'session.workspaceRole': 'viewer', 'aiSession.status': 'open' }, kind: 'run', expected: 'blocked' }
];

const title = `Reverse-Specification of ${PRODUCT}`;

describe('Hand a run to my AI, through the session of the project [criterion:1bf80a5a]', () => {
	for (const scenario of SCENARIOS) {
		it(`${scenario.name} [unspa:1f2ed844:077fe5e2:${scenario.id}]`, async () => {
			const world = retrospecWorld({ ...scenario.given, 'run.stage': 'launched' });
			if (scenario.given['aiSession.status'] === 'open') await openProjectSession(world.services, PROJECT, ADA.id);
			const canEdit = await authorizeProjectAccess(world.event('/api/evolution/live') as never, PROJECT, 'write').then(() => true, () => false);
			const sent = await sendClickOnProject(world.services, PROJECT, ADA.id, { kind: scenario.kind, page: 'drift', anchor: 'retrospec', title }, canEdit);
			expect(sent?.ok ? 'success' : 'blocked').toBe(scenario.expected);
			const pending = pendingProjectClicksOf(world.evolution(), ADA.id);
			if (scenario.expected === 'blocked') {
				expect(sent?.ok === false && sent.reason).toBe('Only who may edit the project hands a run to its AI.');
				expect(pending).toHaveLength(0);
				return;
			}
			// One more click waits, and it is the person's act of now.
			expect(pending).toHaveLength(1);
			expect(pending[0].at).toBe(world.services.clock.nowIso());
		});
	}

	it('reaches the AI in session with the prompt of the run, or the one that resumes it', async () => {
		for (const kind of ['run', 'resume'] as const) {
			const world = retrospecWorld({ 'run.stage': kind === 'run' ? 'ready' : 'launched', 'product.gathered': true });
			const opened = await openProjectSession(world.services, PROJECT, ADA.id);
			await sendClickOnProject(world.services, PROJECT, ADA.id, { kind, page: 'drift', anchor: 'retrospec', title }, true);
			const answer = await awaitProjectEvent(world.services, { projectId: PROJECT, personId: ADA.id, sessionId: opened.session.id, waitSeconds: 1 }, { aborted: () => false, onAbort: () => {} });
			expect(answer.kind).toBe('click');
			if (answer.kind !== 'click' || answer.requestId !== null) throw new Error('a click outside a request was expected');
			const run = currentRun(world.doc())!;
			const prompt = kind === 'run' ? promptOfRun(run, 0, PRODUCT, PROJECT) : resumePromptOfRun(run, PRODUCT, PROJECT);
			expect(answer.click.kind).toBe(kind);
			expect(answer.click.page).toBe('drift');
			expect(answer.click.place.href).toBe(`/projects/${PROJECT}/drift`);
			expect(answer.click.answerWith).toContain(prompt);
			expect(answer.click.answerWith).toContain(`op: "answer_click", clickId: "${answer.click.id}"`);
		}
	});

	it('tells the AI nothing waits any more when the run is gone before it takes the click', async () => {
		const world = retrospecWorld({ 'run.stage': 'published', 'product.gathered': true });
		const opened = await openProjectSession(world.services, PROJECT, ADA.id);
		await sendClickOnProject(world.services, PROJECT, ADA.id, { kind: 'run', page: 'drift', anchor: 'retrospec', title }, true);
		const answer = await awaitProjectEvent(world.services, { projectId: PROJECT, personId: ADA.id, sessionId: opened.session.id, waitSeconds: 1 }, { aborted: () => false, onAbort: () => {} });
		if (answer.kind !== 'click' || answer.requestId !== null) throw new Error('a click outside a request was expected');
		expect(answer.click.answerWith).toContain('No Reverse-Specification waits for you on this project any more');
	});
});
