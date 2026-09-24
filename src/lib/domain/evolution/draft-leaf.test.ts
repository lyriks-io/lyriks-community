import { describe, expect, it } from 'vitest';
import {
	addDraftLeafAct,
	openRequestAct,
	removeDraftLeafAct,
	setLeavesAct,
	updateDraftLeafAct,
	type ActContext,
	type ActOutcome
} from './acts';
import {
	createEvolutionRequest,
	createProposal,
	draftFor,
	isDraftLeafId,
	touchedLeafIds,
	type Actor,
	type EvolutionRequest
} from './draft';
import { isPresentational, nothingToArbitrate } from './gate';
import { canAcceptProposal } from './proposals';
import { draftCoherence, draftNodeIds, overlayGraph } from './overlay';
import { propagateImpact, type PropagationGraph } from './impact-propagation';
import { materialiseDrafts, type Tree } from './materialise';

/**
 * The change, carried as a draft, and the product read as it would be.
 *
 * What these pin: a request can propose a capability that does not exist,
 * nothing of it reaches a section before the freeze, the reports compute FROM
 * the change rather than from the hole where it would sit, and a request with
 * nothing to arbitrate gets out of its author's way.
 */

const person: Actor = { id: 'ana', kind: 'person', role: 'member', channel: 'page' };
const client: Actor = { id: 'ana', kind: 'ai_client', role: 'member', channel: 'ai_client' };

let counter = 0;
const ctxFor = (actor: Actor, soloWorkspace = false): ActContext => ({
	actor,
	at: '2026-09-22T12:00:00.000Z',
	newId: () => `id-${++counter}`,
	soloWorkspace
});
const ctx = () => ctxFor(person);

const known = new Set(['feat-a', 'feat-b']);

const ok = (outcome: ActOutcome): EvolutionRequest => {
	if (!outcome.ok) throw new Error(`refused: ${outcome.reason}`);
	return outcome.request;
};
const reasonOf = (outcome: ActOutcome): string => (outcome.ok ? '' : outcome.reason);

const opened = (): EvolutionRequest =>
	ok(
		openRequestAct(ctx(), {
			title: 'Let members cancel late',
			origin: 'customer_feedback',
			requester: 'ana',
			leafIds: [],
			knownLeafIds: known
		})
	);

describe('a request carries what it proposes', () => {
	it('drafts a capability that does not exist, and counts it as touched', () => {
		const request = ok(
			addDraftLeafAct(ctx(), opened(), { name: 'Cancel a booking', description: 'Give the seat back.' }, known)
		);
		expect(request.drafts).toHaveLength(1);
		const draft = request.drafts[0];
		expect(draft.kind).toBe('add');
		expect(isDraftLeafId(draft.id)).toBe(true);
		// ac-evo-draft-3: named among the touched features exactly like a real one.
		expect(request.leafIds).toContain(draft.id);
	});

	it('refuses an addition with no name, because nothing could call it back', () => {
		expect(reasonOf(addDraftLeafAct(ctx(), opened(), { name: '  ' }, known))).toBe(
			'A drafted feature needs a name.'
		);
	});

	it('refuses an amendment that does not say what it amends', () => {
		expect(reasonOf(addDraftLeafAct(ctx(), opened(), { kind: 'amend' }, known))).toContain(
			'name it with baseLeafId'
		);
	});

	it('refuses a draft standing for a feature that does not exist', () => {
		expect(
			reasonOf(addDraftLeafAct(ctx(), opened(), { kind: 'remove', baseLeafId: 'feat-zzz' }, known))
		).toBe('Unknown feature "feat-zzz".');
	});

	it('touches the feature an amendment stands for, as well as the draft', () => {
		const request = ok(
			addDraftLeafAct(ctx(), opened(), { kind: 'amend', baseLeafId: 'feat-a', name: 'Book a seat' }, known)
		);
		expect(request.leafIds).toContain('feat-a');
	});

	it('refuses two drafts for the same feature: the freeze could not choose', () => {
		const one = ok(addDraftLeafAct(ctx(), opened(), { kind: 'amend', baseLeafId: 'feat-a' }, known));
		expect(reasonOf(addDraftLeafAct(ctx(), one, { kind: 'remove', baseLeafId: 'feat-a' }, known))).toContain(
			'already carries a draft'
		);
	});

	it('lets set_leaves name a draft, which is the whole point of carrying one', () => {
		const request = ok(addDraftLeafAct(ctx(), opened(), { name: 'Cancel a booking' }, known));
		const draftId = request.drafts[0].id;
		expect(ok(setLeavesAct(ctx(), request, ['feat-a', draftId], known)).leafIds).toEqual([
			'feat-a',
			draftId
		]);
	});

	it('keeps the change among the touched features when someone names only the others', () => {
		// The invariant: a draft that fell out of the touched set would be invisible
		// to both readings. Naming the touched features is about the features that
		// already exist, so it can never take the change itself out.
		const request = ok(
			addDraftLeafAct(ctx(), opened(), { kind: 'amend', baseLeafId: 'feat-a', name: 'Book a seat' }, known)
		);
		const after = ok(setLeavesAct(ctx(), request, ['feat-b'], known));
		expect(after.leafIds).toContain(request.drafts[0].id);
		expect(after.leafIds).toContain('feat-a');
		expect(after.leafIds).toContain('feat-b');
	});

	it('reads an amendment and the leaf it stands for as ONE touched feature', () => {
		const amended = ok(
			addDraftLeafAct(ctx(), opened(), { kind: 'amend', baseLeafId: 'feat-a', name: 'Book a seat' }, known)
		);
		const both = ok(addDraftLeafAct(ctx(), amended, { name: 'Cancel a booking' }, known));
		const addition = both.drafts[1].id;
		// Two drafts, three ids internally, and two features a person reads: the
		// amendment IS feat-a in its proposed form, and the addition stands alone.
		expect(both.leafIds).toHaveLength(3);
		expect([...touchedLeafIds(both)]).toEqual(['feat-a', addition]);
		expect(draftFor(both, 'feat-a')?.kind).toBe('amend');
		expect(draftFor(both, addition)?.kind).toBe('add');
	});

	it('still refuses a leaf that is neither in the tree nor drafted', () => {
		expect(reasonOf(setLeavesAct(ctx(), opened(), ['feat-nope'], known))).toBe(
			'Unknown feature: feat-nope.'
		);
	});

	it('amends a draft in place, leaving what was not named alone', () => {
		const request = ok(addDraftLeafAct(ctx(), opened(), { name: 'Cancel', problem: 'Seats go empty.' }, known));
		const draftId = request.drafts[0].id;
		const after = ok(updateDraftLeafAct(ctx(), request, draftId, { name: 'Cancel a booking' }, known));
		expect(after.drafts[0].name).toBe('Cancel a booking');
		expect(after.drafts[0].problem).toBe('Seats go empty.');
	});

	it('drops a draft with what was proposed on it, and says the spec is untouched', () => {
		const request = ok(addDraftLeafAct(ctx(), opened(), { name: 'Cancel a booking' }, known));
		const draftId = request.drafts[0].id;
		const withProposal: EvolutionRequest = {
			...request,
			proposals: [createProposal({ id: 'p1', targetField: `idea.objective@${draftId}` })]
		};
		const after = ok(removeDraftLeafAct(ctx(), withProposal, draftId));
		expect(after.drafts).toHaveLength(0);
		expect(after.leafIds).not.toContain(draftId);
		expect(after.proposals).toHaveLength(0);
	});

	it('refuses to move what a frozen version already froze', () => {
		const request = ok(addDraftLeafAct(ctx(), opened(), { name: 'Cancel a booking' }, known));
		const frozen = { ...request, frozen: true, specVersion: 1 };
		expect(reasonOf(addDraftLeafAct(ctx(), frozen, { name: 'Another' }, known))).toContain(
			'frozen as version 1'
		);
	});
});

describe('the product read as it would be', () => {
	const graph: PropagationGraph = {
		nodes: [
			{ id: 'feature:feat-a', kind: 'feature', label: 'Book a seat' },
			{ id: 'feature:feat-b', kind: 'feature', label: 'See the timetable' },
			{ id: 'entity:booking', kind: 'entity', label: 'Booking' },
			{ id: 'core:c1', kind: 'core', label: 'Bookings' }
		],
		edges: [{ from: 'feature:feat-a', to: 'entity:booking', kind: 'reads' }]
	};

	const withDraft = () =>
		ok(
			addDraftLeafAct(
				ctx(),
				opened(),
				{ name: 'Cancel a booking', coreId: 'c1', dependsOn: ['feat-a'] },
				known
			)
		);

	it('puts an addition in the graph so the walk starts from the change', () => {
		const request = withDraft();
		const overlaid = overlayGraph(graph, request.drafts);
		const id = `feature:${request.drafts[0].id}`;
		expect(overlaid.nodes.some((n) => n.id === id && n.label === 'Cancel a booking')).toBe(true);
		expect(overlaid.edges.some((e) => e.from === id && e.to === 'feature:feat-a')).toBe(true);
	});

	it('reaches what the new capability would rest on, and says it came from a draft', () => {
		const request = withDraft();
		const findings = propagateImpact({
			request,
			hypothesis: 'add',
			depth: 1,
			graph: overlayGraph(graph, request.drafts),
			draftNodeIds: draftNodeIds(request.drafts)
		});
		// Without the overlay the drafted feature is not in the graph at all, so
		// the report for an addition comes back the emptiest of the three.
		const bare = propagateImpact({ request, hypothesis: 'add', depth: 1, graph });
		expect(findings.length).toBeGreaterThan(bare.length);
		// ac-evo-ovl-1: every row says which side it was reached from.
		const ground = findings.find((f) => f.nodeId === 'feature:feat-a');
		expect(ground?.fromDraft).toBe(true);
		// Under `add` nothing beyond the direct neighbourhood breaks, so the entity
		// two links away is not listed at all.
		expect(findings.some((f) => f.nodeId === 'entity:booking')).toBe(false);
	});

	it('never lets one request see the drafts of another', () => {
		const mine = withDraft();
		const theirs = ok(addDraftLeafAct(ctx(), opened(), { name: 'Refund a booking' }, known));
		const overlaid = overlayGraph(graph, mine.drafts);
		expect(overlaid.nodes.some((n) => n.label === 'Refund a booking')).toBe(false);
		expect(theirs.drafts[0].name).toBe('Refund a booking');
	});

	it('leaves the graph exactly as it was when the request drafts nothing', () => {
		expect(overlayGraph(graph, [])).toBe(graph);
	});

	it('drops an edge to a node the graph does not hold, rather than dangling', () => {
		const request = ok(
			addDraftLeafAct(ctx(), opened(), { name: 'Cancel', dependsOn: ['feat-a'], coreId: 'nope' }, known)
		);
		const overlaid = overlayGraph(graph, request.drafts);
		expect(overlaid.edges.some((e) => e.to === 'core:nope')).toBe(false);
	});
});

describe('the contradictions only a draft can introduce', () => {
	const leafNames = { 'feat-a': 'Book a seat', 'feat-b': 'See the timetable' };

	it('blocks a new capability called what something is already called', () => {
		const request = ok(addDraftLeafAct(ctx(), opened(), { name: 'book a seat' }, known));
		const findings = draftCoherence({ request, leafNames, dependsOn: {} });
		const clash = findings.find((f) => f.axis === 'semantic' && f.severity === 'blocking');
		expect(clash?.existingNodeId).toBe('feature:feat-a');
	});

	it('blocks a draft resting on a feature the same request removes', () => {
		let request = ok(addDraftLeafAct(ctx(), opened(), { kind: 'remove', baseLeafId: 'feat-a' }, known));
		request = ok(addDraftLeafAct(ctx(), request, { name: 'Cancel', dependsOn: ['feat-a'] }, known));
		const findings = draftCoherence({ request, leafNames, dependsOn: {} });
		expect(findings.some((f) => f.title.includes('this same request removes'))).toBe(true);
	});

	it('blocks a removal that leaves an existing dependent without ground', () => {
		const request = ok(addDraftLeafAct(ctx(), opened(), { kind: 'remove', baseLeafId: 'feat-a' }, known));
		const findings = draftCoherence({
			request,
			leafNames,
			dependsOn: { 'feat-b': ['feat-a'] }
		});
		expect(findings.some((f) => f.existingNodeId === 'feature:feat-b' && f.severity === 'blocking')).toBe(
			true
		);
	});

	it('flags an addition nobody could test, without holding the request', () => {
		const request = ok(addDraftLeafAct(ctx(), opened(), { name: 'Cancel a booking' }, known));
		const untestable = draftCoherence({ request, leafNames, dependsOn: {} }).find((f) =>
			f.title.includes('no acceptance criterion')
		);
		expect(untestable?.severity).toBe('minor');
	});

	it('flags a word the glossary bans, and names the word to use', () => {
		const request = ok(addDraftLeafAct(ctx(), opened(), { name: 'Empty the basket' }, known));
		const findings = draftCoherence({
			request,
			leafNames,
			dependsOn: {},
			bannedWords: [{ avoid: 'basket', prefer: 'cart' }]
		});
		expect(findings.some((f) => f.title.includes('"cart"'))).toBe(true);
	});
});

describe('the freeze is the one moment a dossier writes', () => {
	const tree = (): Tree & { features: Tree['features'] } => ({
		cores: [{ id: 'c1' }],
		features: [
			{
				id: 'feat-a',
				name: 'Book a seat',
				coreId: 'c1',
				parentFamilyId: null,
				description: 'Take a seat.',
				unspaghettitFeatureId: 'feat-a'
			},
			{
				id: 'feat-b',
				name: 'See the timetable',
				coreId: 'c1',
				parentFamilyId: null,
				description: 'Read the week.',
				unspaghettitFeatureId: 'feat-b'
			}
		],
		leafMeta: { 'feat-a': { status: 'done' } }
	});

	it('creates an addition, with what the draft carried', () => {
		const request = ok(
			addDraftLeafAct(
				ctx(),
				opened(),
				{
					name: 'Cancel a booking',
					description: 'Give the seat back.',
					objective: 'Free the seat in time.',
					acceptanceCriteria: ['Cancelling under two hours is refused.'],
					dependsOn: ['feat-a']
				},
				known
			)
		);
		const out = materialiseDrafts(tree(), request, '2026-09-22T12:00:00.000Z');
		const created = out.features.features.find((f) => f.name === 'Cancel a booking');
		expect(created?.id).toBe('feat-cancel-a-booking');
		expect(created?.unspaghettitFeatureId).toBe(created?.id);
		expect(out.features.leafMeta?.['feat-cancel-a-booking']?.objective).toBe('Free the seat in time.');
		expect(out.features.leafMeta?.['feat-cancel-a-booking']?.dependsOn).toEqual(['feat-a']);
		// The dossier stops naming an id that no longer stands for anything.
		expect(out.request.leafIds).toContain('feat-cancel-a-booking');
		expect(out.request.leafIds.some(isDraftLeafId)).toBe(false);
		expect(out.request.drafts[0].materialisedAs).toBe('feat-cancel-a-booking');
	});

	it('patches an amendment without touching what the draft left empty', () => {
		const request = ok(
			addDraftLeafAct(ctx(), opened(), { kind: 'amend', baseLeafId: 'feat-a', description: 'Take a seat, or two.' }, known)
		);
		const out = materialiseDrafts(tree(), request, '2026-09-22T12:00:00.000Z');
		const leaf = out.features.features.find((f) => f.id === 'feat-a');
		expect(leaf?.description).toBe('Take a seat, or two.');
		expect(leaf?.name).toBe('Book a seat');
		expect(out.features.leafMeta?.['feat-a']?.status).toBe('done');
	});

	it('removes what a removal stands for, and forgets its drawer', () => {
		const request = ok(addDraftLeafAct(ctx(), opened(), { kind: 'remove', baseLeafId: 'feat-a' }, known));
		const out = materialiseDrafts(tree(), request, '2026-09-22T12:00:00.000Z');
		expect(out.features.features.some((f) => f.id === 'feat-a')).toBe(false);
		expect(out.features.leafMeta?.['feat-a']).toBeUndefined();
		expect(out.request.leafIds).not.toContain('feat-a');
	});

	it('gives a second feature of the same name an id of its own', () => {
		const request = ok(addDraftLeafAct(ctx(), opened(), { name: 'Book a seat' }, known));
		const out = materialiseDrafts(
			{ ...tree(), features: [...tree().features, { id: 'feat-book-a-seat', name: 'x', coreId: 'c1', parentFamilyId: null, description: '', unspaghettitFeatureId: 'feat-book-a-seat' }] },
			request,
			'2026-09-22T12:00:00.000Z'
		);
		expect(out.features.features.some((f) => f.id === 'feat-book-a-seat-2')).toBe(true);
	});

	it('writes nothing, and says so, when the request drafted nothing', () => {
		const out = materialiseDrafts(tree(), opened(), '2026-09-22T12:00:00.000Z');
		expect(out.changed).toBe(false);
		expect(out.features).toEqual(tree());
	});

	it('never writes the same draft twice', () => {
		const request = ok(addDraftLeafAct(ctx(), opened(), { name: 'Cancel a booking' }, known));
		const once = materialiseDrafts(tree(), request, '2026-09-22T12:00:00.000Z');
		const twice = materialiseDrafts(once.features, once.request, '2026-09-22T13:00:00.000Z');
		expect(twice.changed).toBe(false);
		expect(twice.features.features.filter((f) => f.name === 'Cancel a booking')).toHaveLength(1);
	});
});

describe('a request with nothing to arbitrate gets out of the way', () => {
	const read = (request: EvolutionRequest): EvolutionRequest => ({
		...request,
		impactReport: { status: 'ready', hypothesis: 'change', depth: 1, ranAt: 'now' },
		coherenceReport: { status: 'ready', projectScore: 100, requestDelta: 0, ranAt: 'now' }
	});

	it('says nothing to arbitrate once both readings came back clean', () => {
		expect(nothingToArbitrate(read(opened()))).toBe(true);
	});

	it('will not say so before the readings have actually run', () => {
		expect(nothingToArbitrate(opened())).toBe(false);
	});

	it('says there is something the moment the coherence check publishes one', () => {
		const request = read(opened());
		expect(
			nothingToArbitrate({
				...request,
				coherenceFindings: [
					{
						id: 'c1',
						axis: 'semantic',
						severity: 'minor',
						title: 'x',
						requestNodeId: 'a',
						existingNodeId: 'b',
						fixNowTarget: 't',
						published: true
					}
				]
			})
		).toBe(false);
	});

	it('says there is something while a proposal waits for a signature', () => {
		const request = read(opened());
		expect(
			nothingToArbitrate({
				...request,
				proposals: [createProposal({ id: 'p1', decision: 'pending' })]
			})
		).toBe(false);
	});

	// Reproduced live on the sandbox on 2026-09-23 (request 8b3e9947): a drafted
	// capability whose impact walk found nothing crossed both gates alone, froze a
	// version and wrote itself into the tree, with nobody deciding anything.
	it('never lets an ADDITION through, however quiet the walk came back', () => {
		const request = ok(
			addDraftLeafAct(
				ctx(),
				opened(),
				{ kind: 'add', name: 'Une capacite neuve', description: 'Ce que le produit ne fait pas encore.' },
				known
			)
		);
		expect(request.drafts[0].kind).toBe('add');
		expect(nothingToArbitrate(read(request))).toBe(false);
	});

	it('still lets an amendment through when the walk found nothing to attend to', () => {
		const request = ok(
			addDraftLeafAct(ctx(), opened(), { kind: 'amend', baseLeafId: 'feat-a', description: 'Clearer words.' }, known)
		);
		expect(nothingToArbitrate(read(request))).toBe(true);
	});

	it('lets a correction to the wording through, however connected the feature is', () => {
		const request = ok(
			addDraftLeafAct(ctx(), opened(), { kind: 'amend', baseLeafId: 'feat-a', description: 'Clearer words.' }, known)
		);
		expect(isPresentational(request.drafts[0])).toBe(true);
		const withNeighbours: EvolutionRequest = {
			...read(request),
			impactFindings: [
				{
					id: 'i1',
					hypothesis: 'change',
					section: 'entities_and_fields',
					nodeId: 'entity:booking',
					nodeLabel: 'Booking',
					nodeKind: 'entity',
					groupPath: [],
					note: '',
					codeWork: 'change',
					depth: 1,
					severity: 'high',
					migrationImplied: false,
					ruleWork: null
				}
			]
		};
		expect(nothingToArbitrate(withNeighbours)).toBe(true);
	});

	it('holds a change of behaviour, even a small one', () => {
		const request = ok(
			addDraftLeafAct(
				ctx(),
				opened(),
				{ kind: 'amend', baseLeafId: 'feat-a', acceptanceCriteria: ['Cancelling under two hours is refused.'] },
				known
			)
		);
		expect(isPresentational(request.drafts[0])).toBe(false);
		expect(
			nothingToArbitrate({
				...read(request),
				impactFindings: [
					{
						id: 'i1',
						hypothesis: 'change',
						section: 'rules_and_scenarios',
						nodeId: 'rule:x',
						nodeLabel: 'x',
						nodeKind: 'rule',
						groupPath: [],
						note: '',
						codeWork: 'change',
						depth: 1,
						severity: 'high',
						migrationImplied: null,
						ruleWork: 'rewrite'
					}
				]
			})
		).toBe(false);
	});
});

describe('who signs follows the roster, not the size of the change', () => {
	const signable = createProposal({
		id: 'p1',
		targetField: 'idea.objective',
		canonicalPath: 'features.leafMeta.feat-a.objective',
		value: 'Free the seat in time.',
		reasoning: 'Read the brief; inferred the deadline.',
		reasoningSeparatesReadFromInferred: true,
		citedSourceIds: ['src-1']
	});

	it('closes acceptance to a client where the workspace holds several members', () => {
		const refusal = canAcceptProposal(client, signable);
		expect(refusal.ok).toBe(false);
		expect(refusal.ok === false && refusal.reason).toBe(
			'An AI client may create proposals but never accept one.'
		);
	});

	it('opens it where one person is alone with the workspace', () => {
		expect(canAcceptProposal(client, signable, { soloWorkspace: true }).ok).toBe(true);
	});

	it('keeps every quality bar even then', () => {
		const unsourced = { ...signable, citedSourceIds: [] };
		const refusal = canAcceptProposal(client, unsourced, { soloWorkspace: true });
		expect(refusal.ok === false && refusal.reason).toBe('This proposal cites no source.');
	});

	it('still refuses a person who is not signed in as one', () => {
		const request = createEvolutionRequest({ stage: 'specification' });
		expect(request.drafts).toEqual([]);
	});
});
