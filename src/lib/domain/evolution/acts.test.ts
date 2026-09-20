import { describe, expect, it } from 'vitest';
import {
	answerOpenQuestionAct,
	buildReportAct,
	closeRequestAct,
	crossStageAct,
	decideLineAct,
	decideProposalAct,
	deleteRequestAct,
	foldBackAct,
	gateReading,
	leafOf,
	liftWaiverAct,
	markOpenQuestionAct,
	openRequestAct,
	postOnFieldAct,
	proposeAct,
	rebriefAct,
	ruleObservationAct,
	runCoherenceAct,
	runImpactAct,
	setLeavesAct,
	tagReviewersAct,
	updateRequestAct,
	usesBannedWord,
	type ActContext,
	type ActOutcome
} from './acts';
import { createEvolutionRequest, createObservation, type Actor, type EvolutionRequest } from './draft';
import { ALLOW } from './guard';

/**
 * The server's copy of the lifecycle guards, the one an AI client goes
 * through. What these tests pin: a client writes and reports, a person
 * decides, a relayed decision lands as the person's with the channel stamped,
 * and every refusal is the sentence the specification wrote.
 */

const person: Actor = { id: 'ana', kind: 'person', role: 'member', channel: 'page' };
const admin: Actor = { id: 'bo', kind: 'person', role: 'admin', channel: 'page' };
const client: Actor = { id: 'ana', kind: 'ai_client', role: 'member', channel: 'ai_client' };
const relay: Actor = { id: 'ana', kind: 'person', role: 'member', channel: 'ai_client' };

let counter = 0;
const ctxFor = (actor: Actor): ActContext => ({
	actor,
	at: '2026-09-10T12:00:00.000Z',
	newId: () => `id-${++counter}`
});

const known = new Set(['feat-a', 'feat-b']);
const checks = { sourceExists: (id: string) => id === 'src-1', bannedWords: ['basket'] };

const ok = (outcome: ActOutcome): EvolutionRequest => {
	if (!outcome.ok) throw new Error(`refused: ${outcome.reason}`);
	return outcome.request;
};
const reasonOf = (outcome: ActOutcome): string => (outcome.ok ? '' : outcome.reason);

const opened = (actor: Actor = client): EvolutionRequest =>
	ok(
		openRequestAct(ctxFor(actor), {
			title: 'Coupons at checkout',
			origin: 'customer_feedback',
			requester: '',
			leafIds: ['feat-a'],
			knownLeafIds: known
		})
	);

describe('opening and describing a request', () => {
	it('a client opens a request on existing features and the timeline says so', () => {
		const request = opened();
		expect(request.stage).toBe('specification');
		expect(request.status).toBe('open');
		expect(request.leafIds).toEqual(['feat-a']);
		expect(request.requester).toBe('ana');
		expect(request.history.map((h) => [h.type, h.authorKind, h.channel])).toEqual([
			['stage_crossing', 'ai_client', 'ai_client']
		]);
	});

	it('refuses a request without a title or an origin, in the spec words', () => {
		expect(
			reasonOf(
				openRequestAct(ctxFor(client), { title: ' ', origin: 'regulatory', requester: '', leafIds: [], knownLeafIds: known })
			)
		).toBe('A request needs a title before it can be opened.');
		expect(
			reasonOf(
				openRequestAct(ctxFor(client), { title: 'x', origin: null, requester: '', leafIds: [], knownLeafIds: known })
			)
		).toBe('Pick where this change comes from before opening it.');
	});

	it('never creates a feature: an unknown leaf is refused', () => {
		const outcome = openRequestAct(ctxFor(client), {
			title: 'x',
			origin: 'internal_idea',
			requester: '',
			leafIds: ['feat-a', 'feat-new'],
			knownLeafIds: known
		});
		expect(reasonOf(outcome)).toBe('Unknown feature: feat-new.');
		const request = opened();
		expect(reasonOf(setLeavesAct(ctxFor(client), request, ['feat-a', 'feat-zzz'], known))).toBe('Unknown feature: feat-zzz.');
		expect(ok(setLeavesAct(ctxFor(client), request, ['feat-b', 'feat-b', 'feat-a'], known)).leafIds).toEqual(['feat-b', 'feat-a']);
	});

	it('updates the title and origin, but not on a closed request', () => {
		const request = opened();
		expect(ok(updateRequestAct(ctxFor(client), request, { title: 'Coupons' })).title).toBe('Coupons');
		expect(reasonOf(updateRequestAct(ctxFor(client), { ...request, status: 'closed' }, { title: 'x' }))).toBe('This request is closed.');
	});
});

describe('proposals: a client proposes, a person decides', () => {
	const propose = (request: EvolutionRequest, actor: Actor = client, over: Partial<Parameters<typeof proposeAct>[2]> = {}) =>
		proposeAct(
			ctxFor(actor),
			request,
			{
				fieldPath: '01-origin.objective',
				leafId: 'feat-a',
				value: 'Let a shopper apply a coupon before paying.',
				reasoning: 'Read in the support tickets; inferred the wording from the glossary.',
				citedSourceIds: ['src-1'],
				...over
			},
			checks
		);

	it('a proposal names its field, its canonical home, its sources, and is flagged on a banned word', () => {
		const request = ok(propose(opened()));
		const proposal = request.proposals[0];
		expect(proposal.decision).toBe('pending');
		expect(proposal.canonicalSection).toBe('features');
		expect(proposal.canonicalPath).toContain('feat-a');
		expect(leafOf(proposal)).toBe('feat-a');
		expect(proposal.reasoningSeparatesReadFromInferred).toBe(true);
		const flagged = ok(propose(opened(), client, { fieldPath: '02-problem.statement', value: 'The basket loses the code.' }));
		expect(flagged.proposals[0].bannedSynonymDetected).toBe(true);
		expect(usesBannedWord('A Basket.', ['basket'])).toBe(true);
	});

	it('refuses a proposal with no source, an unknown source, an unknown field or a reading', () => {
		const request = opened();
		expect(reasonOf(propose(request, client, { citedSourceIds: [] }))).toBe('A proposal cites at least one source of the evidence register.');
		expect(reasonOf(propose(request, client, { citedSourceIds: ['src-9'] }))).toBe('Unknown source: src-9.');
		expect(reasonOf(propose(request, client, { fieldPath: 'nope.field' }))).toBe('This field does not exist on the page.');
		expect(reasonOf(propose(request, client, { fieldPath: '06-behavioural.rules' }))).toBe(
			'This block is a reading, not a field: author it in the section that owns it.'
		);
		expect(reasonOf(propose(request, client, { leafId: 'feat-b' }))).toBe('Name the feature this value belongs to: one of feat-a.');
	});

	it('one proposal per field: a second one waits for the decision', () => {
		const request = ok(propose(opened()));
		expect(reasonOf(propose(request))).toBe(
			'A proposal is already waiting on this field. The person decides it first (accept, refuse or reword).'
		);
	});

	it('a client cannot accept, refuse or reword; a person can; a relayed person can', () => {
		const request = ok(propose(opened()));
		const id = request.proposals[0].id;
		let written = 0;
		const write = () => {
			written += 1;
			return ALLOW;
		};
		expect(reasonOf(decideProposalAct(ctxFor(client), request, id, { decision: 'accept' }, write))).toBe(
			'An AI client may create proposals but never accept one.'
		);
		expect(reasonOf(decideProposalAct(ctxFor(client), request, id, { decision: 'refuse', comment: 'no' }, write))).toBe(
			'An AI client may create proposals but never decide on one.'
		);
		expect(reasonOf(decideProposalAct(ctxFor(client), request, id, { decision: 'reword', value: 'x' }, write))).toBe(
			'An AI client cannot reword a proposal.'
		);
		expect(written).toBe(0);
		const accepted = ok(decideProposalAct(ctxFor(relay), request, id, { decision: 'accept' }, write));
		expect(written).toBe(1);
		expect(accepted.proposals[0]).toMatchObject({ decision: 'accepted', acceptedBy: 'ana', acceptedAt: '2026-09-10T12:00:00.000Z' });
		const entry = accepted.history.at(-1);
		expect(entry).toMatchObject({
			type: 'accepted_proposal',
			authorId: 'ana',
			authorKind: 'person',
			channel: 'ai_client',
			proposalId: id,
			acceptedByPersonId: 'ana'
		});
		expect(reasonOf(decideProposalAct(ctxFor(person), accepted, id, { decision: 'accept' }, write))).toBe(
			'This proposal has already been decided.'
		);
	});

	it('an accepted value answers the open question on its field, and a refused write leaves everything as it was', () => {
		const request = ok(propose(ok(markOpenQuestionAct(ctxFor(person), opened(), '01-origin.objective', 'feat-a'))));
		expect(request.openQuestionKeys).toEqual(['01-origin.objective@feat-a']);
		const id = request.proposals[0].id;
		const refused = decideProposalAct(ctxFor(person), request, id, { decision: 'accept' }, () => ({
			ok: false,
			reason: 'The section that owns this field refused the value.',
			detail: 'validation'
		}));
		expect(reasonOf(refused)).toBe('The section that owns this field refused the value.');
		const accepted = ok(decideProposalAct(ctxFor(person), request, id, { decision: 'accept' }, () => ALLOW));
		expect(accepted.openQuestionKeys).toEqual([]);
	});

	it('a person rewords a pending proposal, which clears the glossary flag', () => {
		const request = ok(propose(opened(), client, { value: 'The basket keeps the code.' }));
		const id = request.proposals[0].id;
		const reworded = ok(decideProposalAct(ctxFor(person), request, id, { decision: 'reword', value: 'The cart keeps the code.' }, () => ALLOW));
		expect(reworded.proposals[0]).toMatchObject({ decision: 'reworded', bannedSynonymDetected: false, value: 'The cart keeps the code.' });
	});
});

describe('proposals handed to tagged reviewers', () => {
	const roster = new Set(['ana', 'bo', 'cy']);
	const bo: Actor = { id: 'bo', kind: 'person', role: 'member', channel: 'page' };
	const cy: Actor = { id: 'cy', kind: 'person', role: 'member', channel: 'page' };
	const proposed = () =>
		ok(
			proposeAct(
				ctxFor(client),
				opened(),
				{
					fieldPath: '01-origin.objective',
					leafId: 'feat-a',
					value: 'Let a shopper apply a coupon before paying.',
					reasoning: 'Read in the tickets; inferred the wording.',
					citedSourceIds: ['src-1']
				},
				checks
			)
		);

	it('tags reviewers from the roster, as a person, only where a roster exists', () => {
		const request = proposed();
		const id = request.proposals[0].id;
		expect(reasonOf(tagReviewersAct(ctxFor(client), request, id, ['bo'], roster))).toBe('An AI client cannot tag reviewers.');
		expect(reasonOf(tagReviewersAct(ctxFor(person), request, id, ['bo'], null))).toBe(
			'Reviewers can be tagged only where the workspace holds more than one member.'
		);
		expect(reasonOf(tagReviewersAct(ctxFor(person), request, id, ['bo', 'zed'], roster))).toBe('Not a member of the workspace: zed.');
		const tagged = ok(tagReviewersAct(ctxFor(relay), request, id, ['bo', 'cy', 'bo'], roster));
		expect(tagged.proposals[0].reviewerIds).toEqual(['bo', 'cy']);
	});

	it('writes the value once every reviewer validated, and refuses a person who is not tagged', () => {
		let request = proposed();
		const id = request.proposals[0].id;
		request = ok(tagReviewersAct(ctxFor(person), request, id, ['bo', 'cy'], roster));
		let written = 0;
		const write = () => {
			written += 1;
			return ALLOW;
		};
		expect(reasonOf(decideProposalAct(ctxFor(person), request, id, { decision: 'accept' }, write))).toBe(
			'This proposal waits for its tagged reviewers: bo, cy.'
		);
		request = ok(decideProposalAct(ctxFor(bo), request, id, { decision: 'accept' }, write));
		expect(written).toBe(0);
		expect(request.proposals[0].decision).toBe('pending');
		expect(request.proposals[0].verdicts).toEqual([{ by: 'bo', verdict: 'validated', comment: '', at: '2026-09-10T12:00:00.000Z' }]);
		expect(request.history.at(-1)).toMatchObject({ type: 'proposal_verdict', authorId: 'bo' });
		request = ok(decideProposalAct(ctxFor(cy), request, id, { decision: 'accept' }, write));
		expect(written).toBe(1);
		expect(request.proposals[0]).toMatchObject({ decision: 'accepted', acceptedBy: 'cy' });
		expect(request.proposals[0].verdicts).toHaveLength(2);
	});

	it('one invalidation refuses it, and a rewording clears the verdicts', () => {
		let request = proposed();
		const id = request.proposals[0].id;
		request = ok(tagReviewersAct(ctxFor(person), request, id, ['bo', 'cy'], roster));
		request = ok(decideProposalAct(ctxFor(bo), request, id, { decision: 'accept' }, () => ALLOW));
		const reworded = ok(decideProposalAct(ctxFor(person), request, id, { decision: 'reword', value: 'A coupon, before paying.' }, () => ALLOW));
		expect(reworded.proposals[0].verdicts).toEqual([]);
		const refused = ok(decideProposalAct(ctxFor(cy), request, id, { decision: 'refuse', comment: 'Not this wording.' }, () => ALLOW));
		expect(refused.proposals[0]).toMatchObject({ decision: 'refused', comment: 'Not this wording.' });
		expect(refused.proposals[0].verdicts.find((v) => v.by === 'cy')).toMatchObject({ verdict: 'invalidated', comment: 'Not this wording.' });
		expect(refused.history.at(-1)).toMatchObject({ type: 'proposal_verdict', authorId: 'cy' });
	});
});

describe('open questions and threads', () => {
	it('an open question is the author\'s, taken back by a person; a client posts but never rules', () => {
		const request = opened();
		expect(reasonOf(markOpenQuestionAct(ctxFor(client), request, '01-origin.objective', 'feat-a'))).toBe(
			'An AI client cannot declare an open question.'
		);
		const marked = ok(markOpenQuestionAct(ctxFor(relay), request, '01-origin.objective', 'feat-a'));
		expect(reasonOf(markOpenQuestionAct(ctxFor(person), marked, '01-origin.objective', 'feat-a'))).toBe(
			'This field is already an open question.'
		);
		expect(ok(answerOpenQuestionAct(ctxFor(person), marked, '01-origin.objective', 'feat-a')).openQuestionKeys).toEqual([]);
		const posted = ok(postOnFieldAct(ctxFor(client), marked, '01-origin.objective', 'feat-a', 'Is the coupon per order or per line?'));
		expect(posted.fieldThreads).toHaveLength(1);
		expect(posted.fieldThreads[0].messages[0]).toMatchObject({ author: 'ana', authorKind: 'ai_client' });
		const again = ok(postOnFieldAct(ctxFor(person), posted, '01-origin.objective', 'feat-a', 'Per order.'));
		expect(again.fieldThreads[0].messages).toHaveLength(2);
		expect(reasonOf(postOnFieldAct(ctxFor(person), posted, '01-origin.objective', 'feat-a', '  '))).toBe('A message needs a body.');
	});
});

describe('the reports are computed, and the gates decide', () => {
	const finding = (severity: 'blocking' | 'minor') => ({
		id: `coh-${severity}`,
		axis: 'functional' as const,
		severity,
		title: 't',
		requestNodeId: 'feat-a',
		existingNodeId: 'x',
		fixNowTarget: 'capability:features/x',
		published: true
	});

	it('an impact run keeps the hypothesis reading; a coherence run reopens the gate', () => {
		const request = opened();
		const impacted = ok(runImpactAct(ctxFor(client), request, 'change', 2, []));
		expect(impacted.impactReport).toMatchObject({ status: 'ready', hypothesis: 'change', depth: 2 });
		expect(reasonOf(runImpactAct(ctxFor(client), request, 'change', 9, []))).toBe('The propagation stops at 5 steps.');
		const checked = ok(
			runCoherenceAct(ctxFor(client), { ...request, coherenceGateClosed: true }, {
				report: { status: 'ready', projectScore: 80, requestDelta: 0, ranAt: 'now' },
				findings: [finding('minor')]
			})
		);
		expect(checked.coherenceGateClosed).toBe(false);
		expect(checked.coherenceFindings).toHaveLength(1);
	});

	it('a client cannot cross; a relayed person crosses gate by gate, and Verify freezes the spec', () => {
		let request = opened();
		expect(reasonOf(crossStageAct(ctxFor(client), request, { criticalEmptyCount: 0 }))).toBe(
			'An AI client cannot move a request between stages.'
		);
		request = ok(crossStageAct(ctxFor(relay), request, { criticalEmptyCount: 0 }));
		expect(request.stage).toBe('coherence');
		// Verify needs the check run and no critical hole.
		expect(reasonOf(crossStageAct(ctxFor(relay), request, { criticalEmptyCount: 2 }))).toBe(
			'Critical fields are still empty. The rail names them: fill them, or waive the gate with a stated reason.'
		);
		expect(reasonOf(crossStageAct(ctxFor(relay), request, { criticalEmptyCount: 0 }))).toBe(
			'The coherence check has not been run on this request.'
		);
		request = ok(
			runCoherenceAct(ctxFor(client), request, {
				report: { status: 'ready', projectScore: 80, requestDelta: 0, ranAt: 'now' },
				findings: [finding('blocking')]
			})
		);
		expect(reasonOf(crossStageAct(ctxFor(relay), request, { criticalEmptyCount: 0 }))).toBe(
			'A blocking finding is still undecided. Fix it, accept it as a risk, or waive the gate with a stated reason.'
		);
		expect(gateReading(request, 0).next).toBe('implementation');
		expect(gateReading(request, 0).verdict.ok).toBe(false);
		request = ok(
			runCoherenceAct(ctxFor(client), request, {
				report: { status: 'ready', projectScore: 82, requestDelta: 2, ranAt: 'now' },
				findings: [finding('minor')]
			})
		);
		request = ok(crossStageAct(ctxFor(relay), request, { criticalEmptyCount: 0 }));
		expect(request.stage).toBe('implementation');
		expect(request.frozen).toBe(true);
		expect(request.specVersion).toBe(1);
		expect(request.frozenVersions).toEqual([{ version: 1, at: '2026-09-10T12:00:00.000Z', by: 'ana' }]);
		expect(request.history.map((h) => h.type)).toEqual(['stage_crossing', 'stage_crossing', 'stage_crossing', 'spec_frozen']);
		expect(reasonOf(setLeavesAct(ctxFor(client), request, ['feat-b'], known))).toBe(
			'The specification is frozen as version 1. Rebrief the request before changing what it touches.'
		);
	});

	it('a waiver crosses an unmet gate with a reason, freezes too, and only an admin lifts it', () => {
		let request = ok(crossStageAct(ctxFor(relay), opened(), { criticalEmptyCount: 0 }));
		expect(reasonOf(crossStageAct(ctxFor(client), request, { criticalEmptyCount: 1, waiverReason: 'demo' }))).toBe(
			'An AI client cannot move a request between stages.'
		);
		expect(reasonOf(crossStageAct(ctxFor(relay), request, { criticalEmptyCount: 1, waiverReason: ' ' }))).toBe(
			'A waiver needs a stated reason. Without one it is indistinguishable from an oversight.'
		);
		request = ok(crossStageAct(ctxFor(relay), request, { criticalEmptyCount: 1, waiverReason: 'Demo on Thursday' }));
		expect(request.stage).toBe('implementation');
		expect(request.frozen).toBe(true);
		expect(request.waivers[0]).toMatchObject({ stage: 'implementation', reason: 'Demo on Thursday', grantedBy: 'ana', liftedAt: null });
		expect(reasonOf(liftWaiverAct(ctxFor(relay), request))).toBe('Only a Workspace Admin or Owner may lift a waiver.');
		expect(reasonOf(liftWaiverAct(ctxFor({ ...client, role: 'admin' }), request))).toBe('An AI client cannot lift a waiver.');
		expect(ok(liftWaiverAct(ctxFor(admin), request)).waivers[0].liftedBy).toBe('bo');
	});

	it('the report is built in Verify against the frozen version, then decided line by line by a person', () => {
		let request = ok(crossStageAct(ctxFor(relay), opened(), { criticalEmptyCount: 0 }));
		const line = {
			id: 'l1',
			iteration: 1,
			verdict: 'missing' as const,
			requirement: 'r',
			filePath: '',
			lineRange: '',
			specStatement: '',
			codeStatement: '',
			hasRequirementAnchor: true,
			anchorForeignLeaf: false,
			acceptanceTestPassing: false,
			specVersion: 1,
			decision: 'undecided' as const,
			decidedBy: null,
			decidedAt: null
		};
		expect(reasonOf(buildReportAct(ctxFor(client), request, [line]))).toBe('There is no frozen version to report against.');
		request = ok(
			runCoherenceAct(ctxFor(client), request, { report: { status: 'ready', projectScore: 80, requestDelta: 0, ranAt: 'now' }, findings: [] })
		);
		request = ok(crossStageAct(ctxFor(relay), request, { criticalEmptyCount: 0 }));
		request = ok(buildReportAct(ctxFor(client), request, [line, { ...line, id: 'l2', verdict: 'out_of_scope', hasRequirementAnchor: false }]));
		expect(request.iterations[0].reportStatus).toBe('ready');
		expect(reasonOf(crossStageAct(ctxFor(relay), request, { criticalEmptyCount: 0 }))).toBe('Lines of this report are still undecided.');
		expect(reasonOf(decideLineAct(ctxFor(client), request, { lineId: 'l1', decision: 'validated' }))).toBe('An AI client cannot decide a report line.');
		expect(reasonOf(decideLineAct(ctxFor(relay), request, { lineId: 'l1', decision: 'adopted' }))).toBe('Only an out-of-scope line can be adopted into the spec.');
		expect(reasonOf(decideLineAct(ctxFor(relay), request, { lineId: 'nope', decision: 'validated' }))).toBe('This line does not exist on the report.');
		request = ok(decideLineAct(ctxFor(relay), request, { lineId: 'l1', decision: 'invalidated' }));
		request = ok(decideLineAct(ctxFor(relay), request, { verdict: 'out_of_scope', decision: 'removed' }));
		expect(request.implementationFindings.map((l) => l.decision)).toEqual(['invalidated', 'removed']);
		request = ok(crossStageAct(ctxFor(relay), request, { criticalEmptyCount: 0 }));
		expect(request.stage).toBe('acceptance');
		expect(request.iterations[0].reportStatus).toBe('closed');
	});

	it('a rebrief goes back to Specify and amends a frozen spec', () => {
		let request = ok(crossStageAct(ctxFor(relay), opened(), { criticalEmptyCount: 0 }));
		request = ok(runCoherenceAct(ctxFor(client), request, { report: { status: 'ready', projectScore: 80, requestDelta: 0, ranAt: 'now' }, findings: [] }));
		request = ok(crossStageAct(ctxFor(relay), request, { criticalEmptyCount: 0 }));
		expect(reasonOf(rebriefAct(ctxFor(client), request))).toBe('An AI client cannot rebrief a request.');
		const back = ok(rebriefAct(ctxFor(relay), request));
		expect(back.stage).toBe('specification');
		expect(back.frozen).toBe(false);
		expect(back.coherenceGateClosed).toBe(true);
		expect(back.history.at(-1)?.type).toBe('spec_amended');
	});
});

describe('acceptance and closing', () => {
	const delivered = (): EvolutionRequest => ({
		...opened(),
		stage: 'delivered',
		observations: [createObservation({ id: 'o1', body: 'The code field is hidden on mobile.', screenId: 's', elementId: 'e', status: 'logged' })]
	});

	it('a client cannot rule; a person rules; a validated observation blocks closing until folded back', () => {
		let request = delivered();
		expect(reasonOf(ruleObservationAct(ctxFor(client), request, 'o1', 'validated', ''))).toBe(
			'The model can reply in the thread, but a ruling is a human decision.'
		);
		expect(reasonOf(ruleObservationAct(ctxFor(relay), request, 'o1', 'invalidated', ''))).toBe('Write the reason before invalidating this observation.');
		request = ok(ruleObservationAct(ctxFor(relay), request, 'o1', 'validated', ''));
		expect(reasonOf(closeRequestAct(ctxFor(relay), request))).toBe('An accepted observation has not been written back into the spec yet.');
		expect(reasonOf(foldBackAct(ctxFor(client), request, { observationId: 'o1', leafId: 'feat-a', kind: 'acceptance_criterion', text: 'x' }, () => ALLOW))).toBe(
			'An AI client cannot fold an observation back into the spec.'
		);
		expect(reasonOf(foldBackAct(ctxFor(relay), request, { observationId: 'o1', leafId: 'feat-b', kind: 'acceptance_criterion', text: 'x' }, () => ALLOW))).toBe(
			'The criterion is written on a touched feature: one of feat-a.'
		);
		let written = 0;
		request = ok(
			foldBackAct(ctxFor(relay), request, { observationId: 'o1', leafId: 'feat-a', kind: 'acceptance_criterion', text: 'The code field stays visible on mobile.' }, () => {
				written += 1;
				return ALLOW;
			})
		);
		expect(written).toBe(1);
		expect(request.observations[0]).toMatchObject({ foldedBackBy: 'ana', foldedBackKind: 'acceptance_criterion', foldedBackLeafId: 'feat-a' });
		expect(reasonOf(closeRequestAct(ctxFor(client), request))).toBe('An AI client cannot close a request.');
		expect(ok(closeRequestAct(ctxFor(relay), request)).status).toBe('closed');
	});

	it('deleting is a person act, and only the dossier goes', () => {
		const request = opened();
		expect(reasonOf(deleteRequestAct(ctxFor(client), request))).toBe('An AI client cannot delete a request.');
		expect(reasonOf(deleteRequestAct(ctxFor({ ...person, role: 'viewer' }), request))).toBe('A viewer cannot delete an evolution request.');
		const gone = ok(deleteRequestAct(ctxFor(relay), request));
		expect(gone.status).toBe('deleted');
		expect(reasonOf(deleteRequestAct(ctxFor(relay), gone))).toBe('This request is already deleted.');
	});
});
