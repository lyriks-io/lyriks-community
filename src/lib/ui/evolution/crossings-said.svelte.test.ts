import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import { placeKey } from '$domain/evolution';
import type { DossierCounts, DossierReading } from '$lib/server/evolution-view.server';
import { freezeHolding, freezeLabel, stageMoveNote, stageMoveToast } from './crossings-said';
import CodeBranchCard from './CodeBranchCard.svelte';
import FinalReport from './FinalReport.svelte';
import ImpactReading from './ImpactReading.svelte';
import { TouchedValidationState } from './touched-validation.svelte';

const address = vi.hoisted(() => ({ url: new URL('http://localhost/evolution') }));
vi.mock('$app/state', () => ({ page: { get url() { return address.url; }, data: { projectName: 'Bakery' } } }));
vi.mock('$app/navigation', () => ({ invalidate: vi.fn(async () => {}), invalidateAll: vi.fn(async () => {}), goto: vi.fn() }));

/**
 * What the request page says of the crossings a computation settles (EVO-011),
 * rendered from the components the page mounts: the toast once the request
 * moves on, the foot of the freeze, Start acceptance testing while the Build is
 * held, and the card of the code before and after the approval.
 */

const DRAFTED_BEHAVIOUR = 'The behaviour model of draft "Save for later" does not apply: action a9 does not exist.';

describe('the page says the request moving on in an act', () => {
	it('the freeze that followed the last validation reads Version N frozen: the evolution moves into development [criterion:ac-leaf-b84841c8-e413-4dfb-82d9-ee8476ba4ef6]', () => {
		expect(stageMoveNote({ stage: 'coherence', specVersion: 1 }, { stage: 'implementation', specVersion: 2 })).toEqual({
			message: 'Version 2 frozen: the evolution moves into development',
			offer: 'development'
		});
		expect(stageMoveNote({ stage: 'coherence', specVersion: 0 }, { stage: 'coherence', specVersion: 0 })).toBeNull();
	});

	it('when the last validation freezes the version, the toast offers Implementation and the page stays where the reader is [criterion:ac-leaf-eca6943c-109e-49c3-b6e0-35b8e6d32c25]', () => {
		const moved = stageMoveNote({ stage: 'coherence', specVersion: 0 }, { stage: 'implementation', specVersion: 1 })!;
		const opened: string[] = [];
		const toast = stageMoveToast(moved, 'specification', (tab) => opened.push(tab));
		expect(toast).toMatchObject({ level: 'success', message: 'Version 1 frozen: the evolution moves into development', action: { label: 'Open Implementation' } });
		// Saying it moves nobody: only the reader's click on the link opens Implementation.
		expect(opened).toEqual([]);
		toast.action?.run();
		expect(opened).toEqual(['development']);
		// A reader already on Implementation is offered nothing more.
		expect(stageMoveToast(moved, 'development', () => {})).not.toHaveProperty('action');
		// The Build settled offers no step to open.
		expect(stageMoveToast(stageMoveNote({ stage: 'implementation', specVersion: 1 }, { stage: 'acceptance', specVersion: 1 })!, 'final_report', () => {})).not.toHaveProperty('action');
	});

	it('the Build settled reads Verification closed: the evolution moves to acceptance testing [criterion:ac-leaf-21b6ca55-d413-44f5-8677-dc2a007fe954]', () => {
		expect(stageMoveNote({ stage: 'implementation', specVersion: 1 }, { stage: 'acceptance', specVersion: 1 })).toEqual({
			message: 'Verification closed: the evolution moves to acceptance testing',
			offer: null
		});
		expect(stageMoveNote({ stage: 'acceptance', specVersion: 1 }, { stage: 'delivered', specVersion: 1 })).toBeNull();
	});
});

const touched = (): TouchedValidationState => {
	const state = new TouchedValidationState('p', 'r');
	state.reading = { readable: true, specValidated: true, lines: [], awaitingChoice: 0, validated: [] };
	return state;
};
const ready = { status: 'ready', findings: [], total: 0 } as never;
const atImpact = (over: Record<string, unknown> = {}) =>
	({
		id: 'r',
		key: 'EVO-011',
		title: 'Freeze',
		stage: 'coherence',
		status: 'open',
		specVersion: 1,
		leaves: [],
		gate: { ok: true, next: 'implementation', reason: null, detail: null },
		freezeHeld: null,
		docking: { points: [] },
		crossEvolutions: [],
		coherence: { findings: [], health: null },
		...over
	}) as unknown as DossierCounts;
const simulation = (dossier: DossierCounts) =>
	render(ImpactReading, {
		props: { projectId: 'p', dossier, impacts: { add: ready, change: ready, remove: ready }, proposes: { byLeaf: {}, main: 'change' }, canEdit: true, onFixNow: () => {}, onStart: () => {}, onNext: () => {}, knowledge: touched() }
	}).body;

describe('the foot of the freeze', () => {
	it('says what holds the freeze: the gate, or what only the freeze read after the last validation [criterion:ac-leaf-c39cfe76-a3c8-4f02-98cc-5e48071a3cab]', () => {
		const held = simulation(atImpact({ gate: { ok: false, next: 'implementation', reason: 'The coherence check has not been run on this request.', detail: null } }));
		expect(held).toContain('The coherence check has not been run on this request.');
		const stale = simulation(atImpact({ freezeHeld: { reason: DRAFTED_BEHAVIOUR, at: '2026-11-20T10:00:00Z', by: 'ana@example.test' } }));
		expect(stale).toContain(`Nothing was frozen: ${DRAFTED_BEHAVIOUR}`);
		// Out of the Impact analysis, nothing is said of the freeze.
		expect(freezeHolding({ stage: 'implementation', status: 'open', gate: { ok: true, reason: null }, freezeHeld: { reason: DRAFTED_BEHAVIOUR } })).toBeNull();
	});

	it('offers Freeze version N to a person while the gate is met and nothing froze yet [criterion:ac-leaf-195da3fa-c756-47bb-b857-9aa95d073565]', () => {
		expect(freezeLabel(1)).toBe('Freeze version 2 →');
		expect(simulation(atImpact())).toContain('Freeze version 2 →');
		// Once frozen, the way on only opens the next step.
		expect(simulation(atImpact({ stage: 'implementation', specVersion: 2, gate: { ok: false, next: 'acceptance', reason: 'No report has been built for this iteration yet.', detail: null } }))).not.toContain('Freeze version');
	});

	it('a validation an AI gave under delegation leaves the freeze to a person: the foot reads Freeze version N [criterion:ac-leaf-16778a7e-921c-44ff-bf07-9b80dd837e61]', () => {
		// The AI's validation completed the Specification, the gate is met and nothing froze: the page offers the freeze to the person.
		const html = simulation(atImpact({ specVersion: 0 }));
		expect(html).toContain('Freeze version 1 →');
		expect(html).not.toContain('Nothing was frozen');
	});
});

const line = (id: string, verdict: string, decision = 'undecided') => ({
	id,
	verdict,
	decision,
	scope: 'request',
	requirement: `Cart › rule "Requirement ${id}"`,
	specStatement: `Spec of ${id}`,
	codeStatement: 'located',
	filePath: 'src/cart.js',
	lineRange: '',
	acceptanceTestPassing: verdict === 'conform',
	href: ''
});
const atBuild = (gate: Record<string, unknown>) =>
	({
		id: 'r',
		key: 'EVO-011',
		title: 'Freeze',
		stage: 'implementation',
		status: 'open',
		specVersion: 1,
		iteration: 1,
		docking: { points: [] },
		gate,
		path: [{ step: 'approval', validation: { validated: false, given: [], expected: [], gone: [] } }],
		deployment: null,
		waiver: null,
		code: null
	}) as never;
/** Opens the Verification on its details, as a link to one of its lines does: the foot of the Build is there. */
const verification = (dossier: never) => {
	address.url = new URL(`http://localhost/evolution?at=${placeKey({ kind: 'line', id: 'a' })}`);
	return render(FinalReport, {
		props: { projectId: 'p', canEdit: true, highlighted: null, onDevelopment: () => {}, actorId: 'me', dossier, report: { status: 'ready', lines: [line('a', 'conform'), line('b', 'non_conform')] } } as never
	}).body;
};

describe('Start acceptance testing', () => {
	it('is offered only while the gate of the Build holds, saying what holds it [criterion:ac-leaf-3cf58130-d019-4d9c-bac6-597661e5f3e7]', () => {
		const held = verification(atBuild({ next: 'acceptance', ok: false, reason: 'The branch holds uncommitted code: commit it, run the tests again, then validate.' }));
		expect(held).toContain('Start acceptance testing →');
		expect(held).toContain('The branch holds uncommitted code: commit it, run the tests again, then validate.');
		const settled = verification(atBuild({ next: 'acceptance', ok: true, reason: null }));
		expect(settled).not.toContain('Start acceptance testing →');
	});
});

const code = (over: Record<string, unknown> = {}) => ({
	repository: null,
	deploymentBranch: 'main',
	expectedBranch: 'evo/EVO-011-freeze',
	createCommand: 'git switch -c evo/EVO-011-freeze main',
	branch: 'evo/EVO-011-freeze',
	baseCommit: 'b45e0001',
	head: 'aaaa0002',
	codeHead: 'c0de0001aa',
	clean: true,
	proofsChecked: 9,
	proofsOnOtherCommits: 0,
	reportedAt: '2026-11-20T09:00:00Z',
	commits: [],
	history: [],
	commitCount: 0,
	validatedCommit: null,
	validatedAt: null,
	validatedBy: null,
	validationSetAside: false,
	mergedCommit: null,
	mergedInto: null,
	mergedAt: null,
	deleteCommand: null,
	...over
});
const card = (over: Record<string, unknown> = {}) =>
	render(CodeBranchCard, { props: { projectId: 'p', canEdit: false, dossier: { code: code(over) } as unknown as DossierReading, members: [{ id: 'ana@example.test', name: 'Ana' }] } }).body;

describe('the card of the code', () => {
	it('reads Validated commit once the change is approved, naming the commit the approval fixed and who approved it [criterion:ac-leaf-e33a838a-b7c5-4ee9-8fd7-faa909308298]', () => {
		const html = card({ validatedCommit: 'c0de0001aa', validatedAt: '2026-11-20T10:00:00Z', validatedBy: 'ana@example.test' });
		expect(html).toContain('Validated commit');
		expect(html).toContain('c0de000');
		expect(html).toContain('approved by Ana');
		expect(html).toContain('The commit the approval fixed');
	});

	it('before the approval reads Last commit of code and Tests, and no validated commit [criterion:ac-leaf-225154a2-ea55-445c-84c6-861e992f8bc1]', () => {
		const before = card();
		expect(before).toContain('Last commit of code');
		expect(before).toContain('Tests');
		expect(before).not.toContain('Validated commit');
		// A commit after the approval asks for it again: the card reads no validated commit until then.
		const setAside = card({ validatedCommit: 'c0de0001aa', validatedBy: 'ana@example.test', validationSetAside: true, codeHead: 'c0de0002bb' });
		expect(setAside).not.toContain('Validated commit');
		expect(setAside).toContain('the branch moved since the approval: approve again');
	});
});
