import { beforeEach, describe, expect, it, vi } from 'vitest';
const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('./evolution-view.server', async (original) => ({ ...(await original<typeof import('./evolution-view.server')>()), loadEvolutionView: async () => scene.view }));
vi.mock('$domain/evolution', async (original) => ({ ...(await original<typeof import('$domain/evolution')>()), dueReadings: () => ({ impact: [], report: false }) }));
vi.mock('./sync-bus.server', async (original) => ({ ...(await original<typeof import('./sync-bus.server')>()), publishSectionChange: vi.fn() }));
vi.mock('./evolution-touched-validation.server', () => ({ readTouchedValidation: async () => ({ readable: true, specValidated: false, lines: [], awaitingChoice: 0, validated: [] }) }));
import { REPORT_NOT_REBUILT, type ImplementationFinding } from '$domain/evolution';
import { batchScene, claude, requestAt } from './evolution-batch-scene.fixture';

/**
 * Build the implementation report (feat-25, action 5c234697), every scenario
 * through the real batch of operations. Not tested here: the viewer
 * (747b3336) and someone outside the workspace (80ab354f), refused by the
 * route's access check, which the Enterprise workspace adapter decides; and
 * the report that answers a build click (31763818), whose arranged state, a
 * build click the AI took in a live session, comes from the live session's
 * await path, which the batch does not reach.
 */
const s = batchScene(scene);
const T = (id: string) => `[unspa:55da6501:5c234697:${id}]`;
const build = () => s.run([{ op: 'build_implementation_report', requestId: 'r' }], claude);
const line: ImplementationFinding = {
	id: 'line-1', iteration: 1, verdict: 'non_conform', requirement: 'Save for later', filePath: 'src/cart.ts', lineRange: '10', specStatement: '', codeStatement: '', leafId: 'feat-1', key: 'action:a3',
	hasRequirementAnchor: true, anchorForeignLeaf: false, acceptanceTestPassing: false, specVersion: 1, scope: 'request', decision: 'validated', decidedBy: 'ana@example.test', decidedAt: '2026-11-20T00:00:00Z'
};

describe('Build the implementation report', () => {
	beforeEach(() => {
		s.engine.answers = true;
		s.show(requestAt('implementation'));
	});

	it(`the report is built at Build, judging version 1 ${T('fd0af5e4')}`, async () => {
		expect((await build()).ok).toBe(true);
		const lines = s.saved().implementationFindings;
		expect(lines.length).toBeGreaterThan(0);
		expect(lines.every((l) => l.specVersion === 1)).toBe(true);
	});

	it(`no report before a version is frozen ${T('8e9f3335')}`, async () => {
		s.show(requestAt('specification'));
		expect((await build()).ok).toBe(false);
		expect(s.save).not.toHaveBeenCalled();
	});

	it(`no report once acceptance testing started ${T('2edc2b38')}`, async () => {
		s.show(requestAt('acceptance', { implementationFindings: [line] }));
		expect(s.summaryOf(await build(), 'build_implementation_report')).toBe('The report is built at Build.');
	});

	it(`a cancelled request builds no report ${T('ef988b8c')}`, async () => {
		s.show(requestAt('implementation', { status: 'cancelled' }));
		expect(s.summaryOf(await build(), 'build_implementation_report')).toBe('This request is cancelled: reopen it first.');
	});

	it(`a closed request builds no report ${T('532a5bdb')}`, async () => {
		s.show(requestAt('delivered', { status: 'closed' }));
		expect(s.summaryOf(await build(), 'build_implementation_report')).toBe('This request is closed.');
	});

	it(`a deleted request builds no report ${T('fd4763b7')}`, async () => {
		s.show(requestAt('implementation', { status: 'deleted' }));
		expect(s.summaryOf(await build(), 'build_implementation_report')).toBe('This request is deleted.');
	});

	it(`a report is not rebuilt on drafts the engine did not answer ${T('c7a6a6b3')}`, async () => {
		s.show(requestAt('implementation', { drafts: [{ ...requestAt('implementation').drafts[0], behaviourModel: { operations: [{ kind: 'add_action', name: 'Save' }], mintedIds: [], updatedAt: '2026-11-19T10:00:00Z' } }], implementationFindings: [line] }));
		s.engine.answers = false;
		const result = await build();
		expect(s.summaryOf(result, 'build_implementation_report')).toBe(REPORT_NOT_REBUILT);
		expect(s.current().implementationFindings).toEqual([line]);
	});

	it(`while version 2 is in correction the report of version 1 stands ${T('3cef1f17')}`, async () => {
		s.show(requestAt('implementation', { implementationFindings: [line], correction: { of: 1, openedAt: '2026-11-20T00:10:00Z', openedBy: 'ana@example.test' } }));
		const result = await build();
		expect(s.summaryOf(result, 'build_implementation_report')).toBe('Version 2 is in correction and waits for its validation: the report reads version 1 until version 2 is frozen, then it is built again against it.');
		expect(s.current().implementationFindings).toEqual([line]);
	});
});
