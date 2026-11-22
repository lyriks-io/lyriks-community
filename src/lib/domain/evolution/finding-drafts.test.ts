import { describe, expect, it } from 'vitest';
import { addFindingDraftAct, removeFindingDraftAct, updateFindingDraftAct, withFindingsAct, type ActContext, type ActOutcome, type FindingLineContext } from './acts';
import { createEvolutionRequest, type Actor, type CoherenceFinding, type EvolutionRequest } from './draft';
import {
	findingChangeFingerprint,
	findingChangeKey,
	findingLineRefusal,
	findingsStillListed,
	findingValidationRefusal,
	projectHealthAfter,
	registerIssueIdOf,
	registerWithSettlements,
	requestSettling,
	settlementOf,
	type FindingDraft
} from './finding-drafts';
import { readVersions, snapshotOf, versionDiff } from './versions';
import { stableId } from './ids';
import { parseEvolutionDraft } from '$lib/application/evolution/parse-evolution-draft';
import type { Gap } from '$domain/coherence';
import type { Issue, ProjectRulesDraft } from '$domain/rules';

/** The findings of Project health a request settles (ac-evo-draft-findings, -read, -landing, ac-evo-coh-after, ac-cc-open-request). */

const ana: Actor = { id: 'ana', kind: 'person', role: 'member', channel: 'page' };
let n = 0;
const ctx: ActContext = { actor: ana, at: '2026-10-30T12:00:00.000Z', newId: () => `id${++n}`, soloWorkspace: true };
const ok = (o: ActOutcome): EvolutionRequest => {
	if (!o.ok) throw new Error(o.reason);
	return o.request;
};
const reason = (o: ActOutcome) => (o.ok ? '' : o.reason);
const fresh = (): EvolutionRequest => ({ ...createEvolutionRequest({ id: 'r1', title: 'Settle the findings', origin: 'technical_debt' }), stage: 'specification' as const });

const banGap: Gap = {
	id: 'gap-rules-issue-missing-issue-kutt-ban-user-error',
	checkId: 'rules.open-issues',
	severity: 'medium',
	title: 'Banning a user always shows "An error occurred."',
	detail: '',
	sourceStep: 'rules',
	blocking: false,
	provenance: 'declared',
	featureRef: 'feat-admin-users'
};
const mailGap: Gap = { ...banGap, id: 'gap-rules-issue-ambiguity-issue-kutt-signup-needs-mail', title: 'Sign-up stays closed while email is off', featureRef: 'feat-sign-in' };
const ipGap: Gap = { id: 'exp-entity-unused-ip', checkId: 'experience.plan.entity-unused', severity: 'low', title: 'Entity "IP" is read by no step', detail: '', sourceStep: 'experience', blocking: false, provenance: 'detected' };
const brokenGap: Gap = { id: 'unspa-proven-3', checkId: 'behavior.model-check', severity: 'low', title: 'A Link has an address', detail: '', sourceStep: 'features', blocking: true, provenance: 'behavior', featureRef: 'feat-manage-links' };
const gaps = [banGap, mailGap, ipGap, brokenGap];

const issue = (id: string, status: Issue['status'] = 'in_review'): Issue => ({
	id,
	kind: 'unhandled_edge',
	title: id,
	detail: '',
	severity: 'major',
	status,
	ownerRoleId: null,
	resolutionNote: '',
	relatedRuleIds: [],
	relatedFeatureId: null,
	relatedJourneyId: null,
	autoDetected: false,
	sourceIds: []
});
const register: ProjectRulesDraft = { projectId: 'p', issues: [issue('issue-kutt-ban-user-error'), issue('issue-kutt-signup-needs-mail')], scenarios: [], inventory: [], lastSavedAt: null };

const known = new Set(['feat-admin-users', 'feat-sign-in', 'feat-manage-links']);
const contextOf = (findingId: string, settledBy: string | null = null): FindingLineContext => ({ listed: gaps.find((g) => g.id === findingId) ?? null, settledBy, knownLeafIds: known });

describe('a request names the findings it settles [criterion:ac-leaf-ac-evo-draft-findings]', () => {
	it('reads the register id behind a finding of the rules register, and nothing behind one the engine detects', () => {
		expect(registerIssueIdOf(banGap.id)).toBe('issue-kutt-ban-user-error');
		expect(registerIssueIdOf('gap-rules-issue-conflict-issue-a-b')).toBe('issue-a-b');
		expect(registerIssueIdOf(ipGap.id)).toBeNull();
	});

	it('holds a finding fixed, kept with its reason, or not decided yet, and adds the feature it names', () => {
		let request = ok(addFindingDraftAct(ctx, fresh(), { findingId: banGap.id, outcome: 'fixed' }, contextOf(banGap.id)));
		expect(request.findingDrafts).toHaveLength(1);
		expect(request.findingDrafts?.[0]).toMatchObject({ id: `finding:${banGap.id}`, outcome: 'fixed', reason: '', featureRef: 'feat-admin-users', materialisedAt: null });
		expect(request.leafIds).toContain('feat-admin-users');
		request = ok(addFindingDraftAct(ctx, request, { findingId: mailGap.id, outcome: 'kept', reason: 'The account is confirmed by email.' }, contextOf(mailGap.id)));
		request = ok(addFindingDraftAct(ctx, request, { findingId: ipGap.id }, contextOf(ipGap.id)));
		expect(request.findingDrafts?.map((d) => d.outcome)).toEqual(['fixed', 'kept', 'undecided']);
		const stored = parseEvolutionDraft(JSON.parse(JSON.stringify({ projectId: 'p', requests: [request] })), 'p');
		expect(stored.requests[0].findingDrafts).toEqual(request.findingDrafts);
	});

	it('refuses a finding no longer listed, one another request settles, a blocking one kept, and a kept one without its reason', () => {
		expect(findingLineRefusal({ findingId: 'gone', listed: null, settledBy: null, outcome: 'fixed', reason: '' })).toBe('Project health no longer lists "gone": there is nothing left to settle.');
		expect(reason(addFindingDraftAct(ctx, fresh(), { findingId: banGap.id }, contextOf(banGap.id, 'EVO-002')))).toBe('EVO-002 already settles this finding.');
		expect(reason(addFindingDraftAct(ctx, fresh(), { findingId: brokenGap.id, outcome: 'kept', reason: 'r' }, contextOf(brokenGap.id)))).toBe('A blocking finding is fixed, never kept.');
		expect(reason(addFindingDraftAct(ctx, fresh(), { findingId: mailGap.id, outcome: 'kept' }, contextOf(mailGap.id)))).toBe('A finding kept as it is needs its reason.');
		const once = ok(addFindingDraftAct(ctx, fresh(), { findingId: banGap.id }, contextOf(banGap.id)));
		expect(reason(addFindingDraftAct(ctx, once, { findingId: banGap.id }, contextOf(banGap.id)))).toMatch(/^This request already settles this finding/);
		expect(reason(addFindingDraftAct(ctx, { ...fresh(), frozen: true, specVersion: 1 }, { findingId: banGap.id }, contextOf(banGap.id)))).toMatch(/^The specification is frozen as version 1/);
	});

	it('changes what becomes of a finding, drops the reason of a fix, and takes a line back', () => {
		let request = ok(addFindingDraftAct(ctx, fresh(), { findingId: mailGap.id }, contextOf(mailGap.id)));
		const id = request.findingDrafts![0].id;
		expect(reason(updateFindingDraftAct(ctx, request, id, { outcome: 'kept' }, contextOf(mailGap.id)))).toBe('A finding kept as it is needs its reason.');
		request = ok(updateFindingDraftAct(ctx, request, id, { outcome: 'kept', reason: 'Deliberate.' }, contextOf(mailGap.id)));
		expect(request.findingDrafts![0]).toMatchObject({ outcome: 'kept', reason: 'Deliberate.' });
		request = ok(updateFindingDraftAct(ctx, request, id, { outcome: 'fixed' }, contextOf(mailGap.id)));
		expect(request.findingDrafts![0]).toMatchObject({ outcome: 'fixed', reason: '' });
		// A fix already in the product says where it was made.
		request = ok(updateFindingDraftAct(ctx, request, id, { reason: 'Fixed in EVO-001, merged in 4426ba5.' }, contextOf(mailGap.id)));
		expect(request.findingDrafts![0]).toMatchObject({ outcome: 'fixed', reason: 'Fixed in EVO-001, merged in 4426ba5.' });
		// Going back to kept without a new reason is refused: the where of a fix is not the why of a keep.
		expect(reason(updateFindingDraftAct(ctx, request, id, { outcome: 'kept' }, contextOf(mailGap.id)))).toBe('A finding kept as it is needs its reason.');
		expect(reason(updateFindingDraftAct(ctx, request, '', {}, contextOf(mailGap.id)))).toMatch(/^update_finding_draft needs findingDraftId/);
		request = ok(removeFindingDraftAct(ctx, request, id));
		expect(request.findingDrafts).toEqual([]);
	});

	it('knows the live request that already settles a finding, and forgets one that closed', () => {
		const holding = ok(addFindingDraftAct(ctx, fresh(), { findingId: banGap.id }, contextOf(banGap.id)));
		expect(requestSettling([holding], banGap.id, null)?.id).toBe('r1');
		expect(requestSettling([holding], banGap.id, 'r1')).toBeNull();
		expect(requestSettling([{ ...holding, status: 'closed' }], banGap.id, null)).toBeNull();
	});

	it('is part of the frozen version, and a change of outcome reads in the comparison', () => {
		const request = ok(addFindingDraftAct(ctx, fresh(), { findingId: banGap.id }, contextOf(banGap.id)));
		const before = snapshotOf(request);
		const after = snapshotOf(ok(updateFindingDraftAct(ctx, request, request.findingDrafts![0].id, { outcome: 'fixed' }, contextOf(banGap.id))));
		expect(before.findings).toHaveLength(1);
		const rows = versionDiff(before, after);
		expect(rows).toEqual([
			expect.objectContaining({ kind: 'finding', status: 'changed', before: `${banGap.title}: outcome not chosen yet`, after: `${banGap.title}: fixed` })
		]);
		expect(readVersions({ ...request, frozenVersions: [] }).versions).toEqual([]);
	});
});

describe('a finding is validated once its outcome is chosen [criterion:ac-leaf-ac-evo-draft-findings-read]', () => {
	it('has a synthetic field whose fingerprint moves with the outcome and the reason, and refuses validation while undecided', () => {
		const draft: FindingDraft = { id: `finding:${banGap.id}`, findingId: banGap.id, title: banGap.title, featureRef: null, blocking: false, outcome: 'undecided', reason: '', sourceIds: [], materialisedAt: null };
		expect(findingChangeKey(draft)).toBe(`element.finding.${banGap.id}`);
		expect(findingValidationRefusal(draft)).toMatch(/^Choose what becomes of this finding/);
		expect(findingValidationRefusal({ outcome: 'fixed' })).toBeNull();
		expect(findingChangeFingerprint(draft)).not.toBe(findingChangeFingerprint({ ...draft, outcome: 'fixed' }));
		expect(findingChangeFingerprint({ ...draft, outcome: 'kept', reason: 'a' })).not.toBe(findingChangeFingerprint({ ...draft, outcome: 'kept', reason: 'b' }));
	});
});

describe('the landing settles what the request named [criterion:ac-leaf-ac-evo-draft-findings-landing]', () => {
	const fixed: FindingDraft = { id: `finding:${banGap.id}`, findingId: banGap.id, title: banGap.title, featureRef: null, blocking: false, outcome: 'fixed', reason: '', sourceIds: [], materialisedAt: null };
	const kept: FindingDraft = { ...fixed, id: `finding:${mailGap.id}`, findingId: mailGap.id, title: mailGap.title, outcome: 'kept', reason: 'The account is confirmed by email.' };
	const keptDetected: FindingDraft = { ...fixed, id: `finding:${ipGap.id}`, findingId: ipGap.id, title: ipGap.title, outcome: 'kept', reason: 'A later cleanup drops the table.' };
	const fixedDetected: FindingDraft = { ...fixed, id: 'finding:unspa-verify-6', findingId: 'unspa-verify-6', outcome: 'fixed' };

	it('sends a register finding to the register, a kept detected one to a decision by design, a fixed detected one to the engine', () => {
		expect(settlementOf(fixed, register)).toBe('register');
		expect(settlementOf(kept, register)).toBe('register');
		expect(settlementOf(keptDetected, register)).toBe('by_design');
		expect(settlementOf(fixedDetected, register)).toBe('engine');
		expect(settlementOf({ ...fixed, outcome: 'undecided' }, register)).toBeNull();
		// A register finding the register no longer holds is read like any other.
		expect(settlementOf({ ...fixed, findingId: 'gap-rules-issue-missing-gone' }, register)).toBe('engine');
	});

	it('resolves the register with the request and the merge commit, or as kept with its reason and who validated it', () => {
		const elsewhere = registerWithSettlements(register, [{ ...fixed, reason: 'fixed by EVO-001, merged into main in 4426ba5.' }], { requestKey: 'EVO-002', mergeCommit: null, at: '2026-10-30T12:00:00.000Z', validatorOf: () => '' });
		expect(elsewhere.rules.issues[0].resolutionNote).toBe('Settled as fixed by EVO-002: fixed by EVO-001, merged into main in 4426ba5.');
		const { rules, written } = registerWithSettlements(register, [fixed, kept, fixedDetected], {
			requestKey: 'EVO-002',
			mergeCommit: '4426ba511abdfa8bff7cfc88241fe0c0d757f389',
			at: '2026-10-30T12:00:00.000Z',
			validatorOf: () => 'Alexis'
		});
		expect(written).toEqual([fixed.id, kept.id]);
		expect(rules.issues.map((i) => [i.status, i.resolutionNote])).toEqual([
			['resolved', 'Fixed by EVO-002, merged in 4426ba5.'],
			['resolved', 'Kept as it is by Alexis on 2026-10-30 (EVO-002): The account is confirmed by email.']
		]);
	});

	it('leaves an issue somebody already settled as it is, and keeps the note it had', () => {
		const settled = { ...register, issues: [{ ...issue('issue-kutt-ban-user-error', 'resolved'), resolutionNote: 'Done by hand.' }, { ...issue('issue-kutt-signup-needs-mail'), resolutionNote: 'Transcribed.' }] };
		const { rules, written } = registerWithSettlements(settled, [fixed, kept], { requestKey: 'EVO-002', mergeCommit: null, at: '2026-10-30T12:00:00.000Z', validatorOf: () => '' });
		expect(written).toEqual([kept.id]);
		expect(rules.issues[0].resolutionNote).toBe('Done by hand.');
		expect(rules.issues[1].resolutionNote).toBe('Transcribed.\nKept as it is by a project editor on 2026-10-30 (EVO-002): The account is confirmed by email.');
	});

	it('names the findings the landing left on the list', () => {
		const landed = [{ ...fixedDetected, materialisedAt: '2026-10-30T12:00:00.000Z' }, { ...fixed, materialisedAt: '2026-10-30T12:00:00.000Z' }];
		expect(findingsStillListed(landed, [{ id: 'unspa-verify-6' }]).map((d) => d.id)).toEqual(['finding:unspa-verify-6']);
	});
});

describe('the coherence reads Project health as the change would leave it [criterion:ac-leaf-ac-evo-coh-after]', () => {
	it('takes the settled findings off, keeps a fix only the engine confirms, and adds what the drafts bring', () => {
		let request = ok(addFindingDraftAct(ctx, fresh(), { findingId: banGap.id, outcome: 'fixed' }, contextOf(banGap.id)));
		request = ok(addFindingDraftAct(ctx, request, { findingId: mailGap.id, outcome: 'kept', reason: 'Deliberate.' }, contextOf(mailGap.id)));
		request = ok(addFindingDraftAct(ctx, request, { findingId: brokenGap.id, outcome: 'fixed' }, contextOf(brokenGap.id)));
		request = ok(addFindingDraftAct(ctx, request, { findingId: ipGap.id }, contextOf(ipGap.id)));
		const brought: CoherenceFinding = { id: 'coh-x', axis: 'functional', severity: 'major', title: 'The draft contradicts a rule', requestNodeId: 'draft:a', existingNodeId: 'rule:b', fixNowTarget: 'x', published: true, scope: 'request' };
		const inherited: CoherenceFinding = { ...brought, id: 'coh-y', scope: 'inherited' };
		const health = projectHealthAfter({ gaps, findingDrafts: request.findingDrafts, register, requestFindings: [brought, inherited], requestId: request.id });
		expect(health.leaving.map((l) => l.findingId)).toEqual([banGap.id, mailGap.id]);
		expect(health.expectedToLeave.map((l) => l.findingId)).toEqual([brokenGap.id]);
		expect(health.undecided).toBe(1);
		expect(health.coming).toEqual([{ id: 'coh-x', title: 'The draft contradicts a rule' }]);
		expect(health.now.total).toBe(4);
		expect(health.after.total).toBe(3);
		expect(health.after.blocking).toBe(1);
		const stored = parseEvolutionDraft(JSON.parse(JSON.stringify({ projectId: 'p', requests: [{ ...request, coherenceReport: { status: 'ready', projectScore: 90, requestDelta: 0, ranAt: 'x', health } }] })), 'p');
		expect(stored.requests[0].coherenceReport.health).toEqual(health);
	});

	it('never counts a second time what Project health already lists now [criterion:7dd35532]', () => {
		const request = fresh();
		// The engine reads the product without the drafts: its finding of scope request is a gap listed now.
		const listed: CoherenceFinding = { id: stableId('coh', request.id, ipGap.id), axis: 'functional', severity: 'major', title: ipGap.title, requestNodeId: 'feat-sign-in', existingNodeId: 'feat-sign-in', fixNowTarget: 'x', published: true, scope: 'request' };
		const drafted: CoherenceFinding = { ...listed, id: 'coh-draft-name-x', title: 'The draft takes a name the product uses' };
		const health = projectHealthAfter({ gaps, findingDrafts: request.findingDrafts, register, requestFindings: [listed, drafted], requestId: request.id });
		expect(health.coming).toEqual([{ id: 'coh-draft-name-x', title: 'The draft takes a name the product uses' }]);
		expect(health.after.total).toBe(health.now.total + 1);
		const alone = projectHealthAfter({ gaps, findingDrafts: request.findingDrafts, register, requestFindings: [listed], requestId: request.id });
		expect(alone.after).toEqual(alone.now);
	});
});

describe('a request opens on findings picked on Project health [criterion:ac-leaf-ac-cc-open-request]', () => {
	it('starts with each finding undecided, the features they name, and a description naming them', () => {
		const request = ok(withFindingsAct(ctx, fresh(), [banGap.id, mailGap.id, banGap.id], (id) => contextOf(id)));
		expect(request.findingDrafts?.map((d) => [d.findingId, d.outcome])).toEqual([
			[banGap.id, 'undecided'],
			[mailGap.id, 'undecided']
		]);
		expect(request.leafIds).toEqual(['feat-admin-users', 'feat-sign-in']);
		expect(request.need.description).toBe(`Settle these 2 findings of Project health:\n- ${banGap.title}\n- ${mailGap.title}`);
	});

	it('refuses them all when one is already settled by another request, and refuses an empty pick', () => {
		expect(reason(withFindingsAct(ctx, fresh(), [banGap.id, mailGap.id], (id) => contextOf(id, id === mailGap.id ? 'EVO-002' : null)))).toBe('EVO-002 already settles this finding.');
		expect(reason(withFindingsAct(ctx, fresh(), [], (id) => contextOf(id)))).toBe('Pick at least one finding to open a request on.');
	});
});
