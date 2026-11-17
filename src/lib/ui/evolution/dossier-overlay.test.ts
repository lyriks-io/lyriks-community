import { describe, expect, it } from 'vitest';
import type { DossierReading, ProposalRow, ReportPart } from '$lib/server/evolution-view.server';
import type { ActionReading } from '$lib/server/evolution-spec-actions.server';
import { overlayActions, overlayDossier, overlayProposals, overlayReport, patchKey, type Patches } from './dossier-overlay';

const trail = (extra: Record<string, unknown> = {}) => ({ validation: 'unvalidated', versionCount: 1, ...extra });
const step = (name: string, current = false, validation: unknown = null) => ({ step: name, label: name, progress: 'in_progress', validation, skip: null, current, detail: '' });

const dossier = {
	id: 'req-1',
	stage: 'specification',
	status: 'open',
	frozen: false,
	cancellation: null,
	requester: 'local-operator',
	origin: 'internal_idea',
	gate: { next: 'coherence', ok: true, reason: null, detail: null, href: '' },
	need: {
		owed: 0,
		fields: [
			{ path: '00-need.situation', leafId: null, value: 'Bags are never picked up.', filled: true, openQuestion: false, trail: trail({ validation: 'validated', validatedBy: ['ada'], humanValidated: true }) },
			{ path: '00-need.cost', leafId: null, value: '', filled: false, openQuestion: false, trail: trail({ versionCount: 0 }) }
		]
	},
	originAnswers: [
		{ path: 'request.requester', leafId: null, value: '', filled: false, trail: trail({ versionCount: 0 }) },
		{ path: 'request.origin', leafId: null, value: 'internal_idea', filled: true, trail: trail() }
	],
	stepDescriptions: [{ step: 'solution', value: 'Count the loaves.', trail: trail() }],
	stepAnswers: [],
	fields: [
		{ path: 'ac', leafId: 'leaf-1', value: 'It counts.', filled: true, openQuestion: false, trail: trail() },
		{ path: 'ac', leafId: 'leaf-2', value: 'It warns.', filled: true, openQuestion: false, trail: trail() }
	],
	leaves: [
		{ id: 'leaf-1', name: 'Count', drafted: true, change: 'add' },
		{ id: 'leaf-2', name: 'Warn', drafted: true, change: 'add' }
	],
	leafIds: ['leaf-1', 'leaf-2'],
	journeyPaths: { 'path.a': trail() },
	data: { drafts: [], view: null, changes: [{ id: 'data:d1', key: 'element.data.d1', trail: trail() }], thread: null },
	sectionChanges: { entries: [{ id: 'section:s1', key: 'element.section.s1', summary: 'Rename', trail: trail(), landedAt: null }] },
	ruleChanges: { entries: [] },
	customQuestions: { max: 5, open: 1, entries: [{ id: 'q1', step: 'need', status: 'open', resolution: '', resolvedBy: null, resolvedAt: null }] },
	path: [
		step('need'),
		step('technical_spec', true, { validated: false, given: [], expected: [], gone: [] }),
		step('impact_analysis'),
		step('build')
	],
	aiDelegation: { request: false, project: false, since: null },
	validationsPerAnswer: 1
} as unknown as DossierReading;
const ctx = { actor: 'bo', needed: 1 };
const read = (patches: Patches) => overlayDossier(dossier, patches, ctx);

describe('the request read with the acts just sent [criterion:ac-leaf-ac-evo-form-edit-optimistic]', () => {
	it('reads the request as the server said while nothing is pending', () => {
		expect(read({})).toBe(dossier);
	});

	it('reads a change to the data or to another page validated the moment it is clicked [criterion:3d4f23dd]', () => {
		const shown = read({
			[patchKey.verdict('element.data.d1')]: { kind: 'verdict', verdict: { act: 'validate' } },
			[patchKey.verdict('element.section.s1')]: { kind: 'verdict', verdict: { act: 'validate' } }
		});
		expect(shown.data.changes?.[0].trail).toMatchObject({ validation: 'validated', validatedBy: ['bo'] });
		expect(shown.sectionChanges.entries[0].trail).toMatchObject({ validation: 'validated', validatedBy: ['bo'] });
		expect(read({ [patchKey.verdict('element.data.d1')]: { kind: 'verdict', verdict: { act: 'refuse', reason: 'No' } } }).data.changes?.[0].trail).toMatchObject({ validation: 'refused' });
	});

	it('shows a text saved at once, its validation outdated, and a text written where none was', () => {
		const shown = read({
			[patchKey.text('00-need.situation')]: { kind: 'text', value: 'Bags wait for days.' },
			[patchKey.text('00-need.cost')]: { kind: 'text', value: 'Two hours a day.' },
			[patchKey.text('step.functional_spec.refusals')]: { kind: 'text', value: 'No loaf twice.' }
		});
		expect(shown.need.fields[0]).toMatchObject({ value: 'Bags wait for days.', trail: { validation: 'outdated', outdatedBy: 'ada' } });
		expect(shown.need.fields[1]).toMatchObject({ value: 'Two hours a day.', filled: true });
		expect(shown.stepAnswers).toEqual([expect.objectContaining({ step: 'functional_spec', key: 'refusals', value: 'No loaf twice.' })]);
	});

	it('validates an answer in the reader\'s name, as a person for the step lock, the text sent with it first', () => {
		const shown = read({
			[patchKey.text('step.solution.description')]: { kind: 'text', value: 'Count every loaf.' },
			[patchKey.verdict('step.solution.description')]: { kind: 'verdict', verdict: { act: 'validate' } },
			[patchKey.verdict('ac', 'leaf-2')]: { kind: 'verdict', verdict: { act: 'validate' } }
		});
		expect(shown.stepDescriptions[0]).toMatchObject({ value: 'Count every loaf.', trail: { validation: 'validated', validatedBy: ['bo'], humanValidated: true } });
		expect(shown.fields[1].trail).toMatchObject({ validation: 'validated', validatedBy: ['bo'] });
		expect(shown.fields[0].trail).toMatchObject({ validation: 'unvalidated' });
	});

	it('ticks a step validated answer by answer once every written answer of it is, and only when an act bears on it', () => {
		const need = (patches: Patches) => read(patches).path[0].validation;
		expect(need({ [patchKey.verdict('ac', 'leaf-1')]: { kind: 'verdict', verdict: { act: 'validate' } } })).toBeNull();
		const withValidation = { ...dossier, path: [{ ...step('need', true, { validated: false, given: [], expected: [], gone: [] }), progress: 'done' }, ...dossier.path.slice(1).map((s) => ({ ...s, current: false }))] } as unknown as DossierReading;
		const all = {
			[patchKey.verdict('00-need.situation')]: { kind: 'verdict', verdict: { act: 'validate' } },
			[patchKey.verdict('request.origin')]: { kind: 'verdict', verdict: { act: 'validate' } }
		} as Patches;
		expect(overlayDossier(withValidation, all, ctx).path[0].validation).toMatchObject({ validated: true });
		// Validated, the Need no longer holds the page: it opens on the next step still owing something, as the server will.
		expect(overlayDossier(withValidation, all, ctx).path.find((s) => s.current)?.step).toBe('technical_spec');
		expect(overlayDossier(withValidation, { [patchKey.verdict('00-need.situation')]: { kind: 'verdict', verdict: { act: 'validate' } } }, ctx).path[0].validation).toMatchObject({ validated: false });
	});

	it('puts the reader behind a step validated as a whole', () => {
		const shown = read({ [patchKey.step('technical_spec')]: { kind: 'verdict', verdict: { act: 'validate' } } });
		expect(shown.path[1].validation).toMatchObject({ given: ['bo'], validated: true });
	});

	it('shows the next stage at once once a gate is crossed: the step it opens on, the version frozen past the impact analysis', () => {
		const shown = read({ [patchKey.stage]: { kind: 'stage', stage: 'implementation' } });
		expect(shown).toMatchObject({ stage: 'implementation', frozen: true, gate: { next: 'acceptance', ok: false } });
		expect(shown.path.find((s) => s.current)?.step).toBe('build');
		// The Impact analysis, which nobody validates, reads behind it at once.
		expect(shown.path.find((s) => s.step === 'impact_analysis')?.progress).toBe('done');
		expect(shown.path.find((s) => s.step === 'build')?.progress).toBe('in_progress');
		const back = read({ [patchKey.stage]: { kind: 'stage', stage: 'specification', step: 'technical_spec' } });
		expect(back.path.find((s) => s.current)?.step).toBe('technical_spec');
	});

	it('cancels, reopens and delegates at once', () => {
		expect(read({ [patchKey.status]: { kind: 'status', status: 'cancelled', reason: 'Not now', by: 'bo', at: 't' } })).toMatchObject({
			status: 'cancelled',
			cancellation: { reason: 'Not now', by: 'bo', at: 't' }
		});
		expect(read({ [patchKey.delegation('request')]: { kind: 'delegation', on: true, at: 't' } }).aiDelegation).toEqual({ request: true, project: false, since: 't' });
	});

	it('takes a feature out of the request with its answers, and settles a question answered', () => {
		const shown = read({
			[patchKey.out('leaf-1')]: { kind: 'out' },
			[patchKey.question('q1')]: { kind: 'question', resolution: 'answered', text: 'Yes', by: 'bo', at: 't' }
		});
		expect(shown.leafIds).toEqual(['leaf-2']);
		expect(shown.leaves.map((l) => l.id)).toEqual(['leaf-2']);
		expect(shown.fields.map((f) => f.leafId)).toEqual(['leaf-2']);
		expect(shown.customQuestions).toMatchObject({ open: 0, entries: [{ status: 'answered', resolution: 'Yes', resolvedBy: 'bo' }] });
	});

	it('writes who asked and where it comes from on the request and on their answers of 1.1', () => {
		const shown = read({ [patchKey.request]: { kind: 'request', requester: 'Ada', origin: 'customer' } });
		expect(shown).toMatchObject({ requester: 'Ada', origin: 'customer' });
		expect(shown.originAnswers.map((a) => a.value)).toEqual(['Ada', 'customer']);
	});

	it('validates a path of the journey', () => {
		expect(read({ [patchKey.journeyPath('path.a')]: { kind: 'verdict', verdict: { act: 'validate' } } }).journeyPaths['path.a']).toMatchObject({ validation: 'validated' });
	});
});

describe('the suggestions, the report and the actions read with the decisions just sent [criterion:ac-leaf-ac-evo-form-edit-optimistic]', () => {
	const proposal = (id: string, extra: Record<string, unknown> = {}) => ({ id, targetField: '00-need.symptoms', leafId: null, value: 'a\nb', ...extra }) as unknown as ProposalRow;

	it('drops a decided suggestion, and a decided line from its suggestion, the suggestion with it once none is left', () => {
		const rows = [proposal('p1'), proposal('p2', { delta: { added: ['c'], removed: ['d'] } }), proposal('p3')];
		const shown = overlayProposals(rows, {
			[patchKey.proposal('p1')]: { kind: 'decided' },
			[patchKey.proposalLine('p2', 'c')]: { kind: 'line-decided', proposalId: 'p2', line: 'c' },
			[patchKey.proposalLine('p3', 'a')]: { kind: 'line-decided', proposalId: 'p3', line: 'a' }
		});
		expect(shown.map((p) => p.id)).toEqual(['p2', 'p3']);
		expect((shown[0] as { delta?: unknown }).delta).toEqual({ added: [], removed: ['d'] });
		expect(shown[1].value).toBe('b');
		expect(overlayProposals([proposal('p4', { delta: { added: ['c'], removed: [] } })], { [patchKey.proposalLine('p4', 'c')]: { kind: 'line-decided', proposalId: 'p4', line: 'c' } })).toEqual([]);
	});

	it('reads a line of the report with the decision just taken on it', () => {
		const report = { lines: [{ id: 'l1', decision: 'undecided' }, { id: 'l2', decision: 'undecided' }] } as unknown as NonNullable<ReportPart['report']>;
		const shown = overlayReport(report, { [patchKey.reportLine('l2')]: { kind: 'line', decision: 'validated' } });
		expect(shown.lines.map((l) => l.decision)).toEqual(['undecided', 'validated']);
		expect(overlayReport(report, {})).toBe(report);
		expect(overlayReport(null, {})).toBeNull();
	});

	it('reads an action with the verdict just given on it', () => {
		const readings = { 'element.a@feature:f': { fingerprint: 'x', trail: trail(), thread: null } } as unknown as Record<string, ActionReading>;
		const shown = overlayActions(readings, { [patchKey.action('element.a@feature:f')]: { kind: 'verdict', verdict: { act: 'refuse', reason: 'No' } } }, ctx);
		expect(shown['element.a@feature:f'].trail).toMatchObject({ validation: 'refused', refusedBy: 'bo' });
	});
});
