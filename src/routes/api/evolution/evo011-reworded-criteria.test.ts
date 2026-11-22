import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import { codeReadingOf, placeKey, type Actor, type EvolutionRequest } from '$domain/evolution';
import { requestSummary, type DossierCounts, type DossierReading, type EvolutionView } from '$lib/server/evolution-view.server';
import CodeBranchCard from '$lib/ui/evolution/CodeBranchCard.svelte';
import FinalReport from '$lib/ui/evolution/FinalReport.svelte';
import ImpactReading from '$lib/ui/evolution/ImpactReading.svelte';
import { TouchedValidationState } from '$lib/ui/evolution/touched-validation.svelte';
import { ANA, BO, BRANCH, CODE_HEAD, DEFAULTS, REQUEST, atImpactOf, requestOf, world, type State } from './evo011-scenarios.fixture';

/**
 * The criteria EVO-011 version 2 reworded, against the real code: the request
 * is arranged in the stores the real door reads, its acts go through
 * POST /api/evolution and the real batch, and what the page shows is rendered
 * from the components the request page mounts, fed with the summary the
 * server gives them (requestSummary). Server rendering reaches what the page
 * prints; a click that moves between tabs or opens a folded list is the
 * browser's and is not driven here.
 */

const scene = vi.hoisted(() => ({ view: null as unknown, url: new URL('http://localhost/evolution') }));
vi.mock('$app/state', () => ({ page: { get url() { return scene.url; }, data: { projectName: 'Shop' } } }));
vi.mock('$app/navigation', () => ({ invalidate: vi.fn(async () => {}), invalidateAll: vi.fn(async () => {}), goto: vi.fn() }));
vi.mock('$lib/server/evolution-view.server', async (original) => ({ ...(await original<typeof import('$lib/server/evolution-view.server')>()), loadEvolutionView: async () => scene.view }));
vi.mock('$domain/evolution', async (original) => ({ ...(await original<typeof import('$domain/evolution')>()), dueReadings: () => ({ impact: [], report: false }) }));
vi.mock('$lib/server/sync-bus.server', async (original) => ({ ...(await original<typeof import('$lib/server/sync-bus.server')>()), publishSectionChange: vi.fn() }));
vi.mock('$lib/server/evolution-touched-validation.server', () => ({ readTouchedValidation: async () => ({ readable: true, specValidated: false, lines: [], awaitingChoice: 0, validated: [] }) }));
const { POST } = await import('./+server');

const door = world(scene, { answers: true, applies: true });
const ana: Actor = { id: ANA, kind: 'person', role: 'member', channel: 'page' };
const MEMBERS = [
	{ id: ANA, name: 'Ana' },
	{ id: BO, name: 'Bo' }
];
const state = (over: State): State => ({ ...DEFAULTS, ...over });
/** The summary the server gives the page for the request as the dossier holds it now. */
const summary = () => requestSummary(scene.view as EvolutionView, door.stored(), ana) as unknown as DossierReading;
const seeded = (over: State, request: EvolutionRequest = requestOf(state(over))) => {
	door.seed(state(over), request);
	return summary();
};

/** The Verification tab opened on its details, as a link to one of its lines does: its foot is there. */
const verification = (dossier: DossierReading) => {
	scene.url = new URL(`http://localhost/evolution?at=${placeKey({ kind: 'line', id: 'settled' })}`);
	const lines = [{ id: 'settled', verdict: 'conform', decision: 'validated', scope: 'request', requirement: 'Cart › rule "At most 20 items"', specStatement: '', codeStatement: 'located', filePath: 'src/cart.ts', lineRange: '', acceptanceTestPassing: true, href: '' }];
	return render(FinalReport, {
		props: { projectId: 'shop', canEdit: true, highlighted: null, onDevelopment: () => {}, actorId: ANA, dossier, report: { status: 'ready', lines }, members: MEMBERS } as never
	}).body;
};

describe('the foot of Verification says how the request finishes [criterion:46c3625e]', () => {
	const built = { 'request.stage': 'implementation', 'request.frozenVersion': 1, 'report.builtForVersion': 1 };
	const walked = { 'request.stage': 'acceptance', 'request.frozenVersion': 1, 'report.builtForVersion': 1, 'report.closed': true };

	it('at Build it says what holds the gate beside Start acceptance testing, and offers nothing once the gate is met, the request moving on its own [criterion:46c3625e]', async () => {
		const held = verification(seeded({ ...built, 'report.linesToDecide': 1 }));
		expect(held).toContain('Lines of this report are still undecided.');
		expect(held).toContain('Start acceptance testing →');
		const met = verification(seeded(built));
		expect(met).not.toContain('Start acceptance testing →');
		// The act that settled the report moves the request into acceptance testing, nobody clicking.
		door.seed(state({ ...built, 'report.linesToDecide': 1 }), requestOf(state({ ...built, 'report.linesToDecide': 1 })));
		const settled = await door.post(POST, [{ op: 'decide_line', requestId: REQUEST, lineId: 'undecided-0', decision: 'validated' }]);
		expect(settled.ok).toBe(true);
		expect(door.stored().stage).toBe('acceptance');
	});

	it('in acceptance testing it says what the approval waits for, beside Approve the evolution [criterion:46c3625e]', () => {
		const walk = verification(seeded(walked));
		expect(walk).toContain('Walk the change in acceptance testing, then approve it.');
		expect(walk).toContain('Approve the evolution →');
		const waiting = verification(seeded({ ...walked, 'approval.mine': true, 'approval.othersAwaited': 1 }));
		expect(waiting).toContain('Waiting for Bo to approve.');
		// Every approval given and nothing holding the gate: the change can be closed.
		const given = requestOf(state({ ...walked, 'approval.mine': true }));
		const approved = verification(seeded({}, { ...given, namedValidators: [{ target: 'step:approval', people: [ANA], gone: [] }] }));
		expect(approved).toContain('Approved: the evolution can be closed.');
		expect(approved).toContain('Approve the evolution →');
	});

	it('once approved it names the cycles and who approved, then Close the evolution, or the merge of the branch when the project names one [criterion:46c3625e]', () => {
		const approved = { 'request.stage': 'delivered', 'request.frozenVersion': 1, 'report.builtForVersion': 1, 'report.closed': true, 'approval.mine': true };
		const closing = verification(seeded(approved));
		expect(closing).toContain('The evolution complies with the spec');
		expect(closing).toContain('1 cycle(s), approved by Ana.');
		expect(closing).toContain('Close the evolution');
		const merging = verification(seeded({ ...approved, 'project.deploymentBranchNamed': true, 'code.branchBound': true, 'code.validated': true }));
		expect(merging).toContain(`Merge ${BRANCH} into main, then report the merge: the executive summary gives the commands.`);
		expect(merging).not.toContain('Close the evolution');
	});
});

const card = (dossier: DossierReading) => render(CodeBranchCard, { props: { projectId: 'shop', canEdit: false, dossier, members: MEMBERS } }).body;
const HISTORY = {
	count: 3,
	commits: [
		{ sha: 'aaaa0030cccc', subject: 'chore(index): sync', author: 'Ana', at: '2026-11-20T11:00:00Z', code: false },
		{ sha: 'c0de0030dddd', subject: 'feat: save a cart for later', author: 'Ana', at: '2026-11-20T10:30:00Z', code: true },
		{ sha: 'c0de0020bbbb', subject: 'feat: keep the prices', author: 'Ana', at: '2026-11-20T10:00:00Z', code: true }
	]
};
const reportFromBranch = (codeHead: string) => ({
	op: 'report_code_state',
	requestId: REQUEST,
	repository: { name: 'shop', url: 'https://git.example.test/shop.git' },
	history: HISTORY,
	branch: BRANCH,
	baseCommit: 'b45e0000aaaa',
	head: 'aaaa0030cccc',
	codeHead,
	clean: true,
	proofsChecked: 4,
	proofsOnOtherCommits: 0
});

describe('the card of the code names its branch and its commits [criterion:e958b1e6]', () => {
	it('names the branch to create with its command, then the repository, the commits, where it started, the last commit of code and its tests [criterion:e958b1e6]', async () => {
		const building = { 'request.stage': 'implementation', 'request.frozenVersion': 1, 'project.deploymentBranchNamed': true };
		const toCreate = card(seeded(building));
		expect(toCreate).toContain(BRANCH);
		expect(toCreate).toContain(`git switch -c ${BRANCH} main`);
		expect(toCreate).toContain('not created yet');
		// The index sync reports the branch from git.
		expect((await door.post(POST, [reportFromBranch('c0de0030dddd')])).ok).toBe(true);
		const reported = card(summary());
		expect(reported).toContain('shop');
		expect(reported).toContain('History · 3 commits');
		expect(reported).toContain('Started from');
		expect(reported).toContain('main@b45e000');
		expect(reported).toContain('Last commit of code');
		expect(reported).toContain('Tests');
		expect(reported).toContain('4 passed on this commit');
		expect(reported).not.toContain('Validated commit');
		expect(reported).not.toContain(`git switch -c ${BRANCH} main`);
		// The commits the folded list shows on a click, each with its copyable id and whether it changes code.
		const reading = codeReadingOf(door.stored(), 'EVO-001', 'main')!;
		expect(reading.history.map((c) => [c.sha, c.code])).toEqual([
			['aaaa0030cccc', false],
			['c0de0030dddd', true],
			['c0de0020bbbb', true]
		]);
		expect(reading.codeHead).toBe('c0de0030dddd');
	});

	it('reads Validated commit approved by its person once approved, Approval asked again after a later commit, then Merged and official [criterion:e958b1e6]', async () => {
		const walked = { 'request.stage': 'acceptance', 'request.frozenVersion': 1, 'report.builtForVersion': 1, 'report.closed': true, 'project.deploymentBranchNamed': true, 'code.branchBound': true };
		seeded(walked);
		// The last approval awaited fixes the branch's last commit of code.
		expect((await door.post(POST, [{ op: 'validate_step', requestId: REQUEST, step: 'approval' }, { op: 'cross_stage', requestId: REQUEST }])).ok).toBe(true);
		const approved = card(summary());
		expect(approved).toContain('Validated commit');
		expect(approved).toContain(CODE_HEAD.slice(0, 7));
		expect(approved).toContain('approved by Ana');
		// A commit of code after it sets the approval aside.
		expect((await door.post(POST, [reportFromBranch('c0de0040eeee')])).ok).toBe(true);
		const moved = card(summary());
		expect(moved).toContain('the branch moved since the approval: approve again');
		expect(moved).not.toContain('Validated commit');
		// Approved again on the new commit, then merged with it.
		expect((await door.post(POST, [{ op: 'validate_step', requestId: REQUEST, step: 'approval' }, { op: 'cross_stage', requestId: REQUEST }])).ok).toBe(true);
		expect(door.stored().code?.validated?.commit).toBe('c0de0040eeee');
		expect((await door.post(POST, [{ op: 'report_merge', requestId: REQUEST, branch: BRANCH, into: 'main', mergeCommit: 'm3r6e0050ffff', containsValidated: true }])).ok).toBe(true);
		const merged = card(summary());
		expect(merged).toContain('Merged');
		expect(merged).toContain('main@m3r6e00');
		expect(merged).toContain('official');
	});
});

const ready = { status: 'ready', findings: [], total: 0 } as never;
const touched = (): TouchedValidationState => {
	const known = new TouchedValidationState('shop', REQUEST);
	known.reading = { readable: true, specValidated: true, lines: [], awaitingChoice: 0, validated: [] };
	return known;
};
const simulationFoot = (dossier: DossierCounts) =>
	render(ImpactReading, {
		props: { projectId: 'shop', dossier, impacts: { add: ready, change: ready, remove: ready }, proposes: { byLeaf: {}, main: 'change' }, canEdit: true, onFixNow: () => {}, onStart: () => {}, onNext: () => {}, knowledge: touched() }
	}).body;

/**
 * A request at the Impact analysis whose Specification a person stands behind:
 * every item validated through the door while the readings had not run (so no
 * validation froze it), then the readings back.
 */
async function standingBehind(): Promise<void> {
	const unread = state({ 'request.stage': 'coherence' });
	const request = atImpactOf(unread);
	door.seed(unread, request);
	expect((await door.post(POST, [{ op: 'validate_field', requestId: REQUEST, fieldPath: 'element.action:a3', leafId: 'feature:feat-1' }, ...door.answersOf(request)])).ok).toBe(true);
	const met = state({ 'request.stage': 'coherence', 'coherence.ready': true });
	door.seed(met, { ...door.stored(), coherenceReport: atImpactOf(met).coherenceReport, freezeHeld: undefined });
}

describe('the way on says what holds the gate [criterion:c511fc9b]', () => {
	it('reads Freeze version N while the gate into the Build is met and nothing froze yet, no freeze once frozen, and the reason while the gate holds [criterion:c511fc9b]', async () => {
		await standingBehind();
		expect(summary().gate.ok).toBe(true);
		expect(simulationFoot(summary())).toContain('Freeze version 1 →');
		// Once frozen nothing offers the freeze; the way on of the details tab then reads Go to Implementation, a click away.
		const frozen = seeded({ 'request.stage': 'implementation', 'request.frozenVersion': 1 });
		expect(simulationFoot(frozen)).not.toContain('Freeze version');
		const unread = state({ 'request.stage': 'coherence' });
		door.seed(unread, atImpactOf(unread));
		expect(simulationFoot(summary())).toContain('The coherence check has not been run on this request.');
	});

	it('Freeze version N crosses the gate when it is met; a crossing the server refuses gives the reason the page said before sending [criterion:c511fc9b]', async () => {
		const unread = state({ 'request.stage': 'coherence' });
		door.seed(unread, atImpactOf(unread));
		const said = summary().gate.reason;
		expect(said).toBe('The coherence check has not been run on this request.');
		const refused = await door.post(POST, [{ op: 'cross_stage', requestId: REQUEST }]);
		expect(refused.ok).toBe(false);
		expect(refused.results.map((r) => r.summary)).toContain(said);
		expect(door.stored().stage).toBe('coherence');
		await standingBehind();
		const crossed = await door.post(POST, [{ op: 'cross_stage', requestId: REQUEST }]);
		expect(crossed.ok).toBe(true);
		expect(door.stored()).toMatchObject({ stage: 'implementation', frozen: true, specVersion: 1 });
	});
});
