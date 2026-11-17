import { describe, expect, it } from 'vitest';
import {
	actionFingerprint,
	createEvolutionRequest,
	elementPath,
	featureActions,
	reviewActions,
	withFieldVersion,
	fieldKey,
	fieldValidationOf,
	isDossierQuestion,
	isElementPath,
	refuseFieldAct,
	touchedFeatureNodes,
	validateFieldAct,
	withdrawFieldVerdictAct,
	type ActContext,
	type ActOutcome,
	type Actor,
	type EvolutionRequest,
	type LocalGraph,
	type LocalNode
} from '.';

const node = (id: string, kind: LocalNode['kind'], parentId: string | null, status: LocalNode['status'] = 'added', label = id): LocalNode => ({
	id,
	kind,
	label,
	status,
	parentId,
	folded: false,
	featureId: null,
	variant: null
});

const graph = (nodes: LocalNode[]): LocalGraph => ({ nodes, counts: { existing: 0, added: 0, changed: 0, removed: 0, reached: 0 } });

describe('the actions of the specification, validated like answers', () => {
	const g = graph([
		node('core:c', 'core', null, 'existing'),
		node('feature:f', 'feature', 'core:c'),
		node('surface:s', 'surface', 'feature:f'),
		node('action:a', 'action', 'surface:s', 'added', 'Subscribe'),
		node('rule:r1', 'rule', 'action:a', 'added', 'At most 20 items'),
		node('action:b', 'action', 'surface:s', 'existing', 'Pay'),
		node('feature:g', 'feature', 'core:c', 'reached'),
		node('surface:t', 'surface', 'feature:g'),
		node('action:c', 'action', 'surface:t')
	]);

	it('reads the actions under a feature, each with its rules, in the order of the graph', () => {
		const actions = featureActions(g, 'feature:f');
		expect(actions.map((a) => a.action.id)).toEqual(['action:a', 'action:b']);
		expect(actions[0].rules.map((r) => r.id)).toEqual(['rule:r1']);
		expect(actions[1].rules).toEqual([]);
	});

 it('reviews only actual action changes, while keeping an explicit inherited refusal reachable [criterion:041586c7]', () => {
  expect(reviewActions(g, 'feature:f').map((s) => s.action.id)).toEqual(['action:a']);
  expect(reviewActions(g, 'feature:f', (id) => id === 'action:b').map((s) => s.action.id)).toEqual(['action:a', 'action:b']);
  const modifiedRule = graph([...g.nodes, node('changed', 'rule', 'action:b', 'changed')]);
  expect(reviewActions(modifiedRule, 'feature:f').map((s) => s.action.id)).toEqual(['action:a', 'action:b']);
 });

	it('gives each action a fingerprint that moves when one of its rules does', () => {
		const [a] = featureActions(g, 'feature:f');
		const reworded = { ...a.rules[0], label: 'At most 25 items' };
		expect(actionFingerprint(a.action, [reworded])).not.toBe(a.fingerprint);
		expect(actionFingerprint(a.action, a.rules)).toBe(a.fingerprint);
	});

	it('names the touched features only, never the ones the impact merely reaches', () => {
		expect(touchedFeatureNodes(g).map((n) => n.id)).toEqual(['feature:f']);
	});

	it('names the synthetic field an action is validated on', () => {
		expect(elementPath('action:a')).toBe('element.action:a');
		expect(isElementPath(elementPath('action:a'))).toBe(true);
		expect(isElementPath('objective')).toBe(false);
	});
});

describe('an action is validated, rejected and restored like an answer', () => {
	const ana: Actor = { id: 'ana@team.test', kind: 'person', role: 'member', channel: 'page' };
	let counter = 0;
	const ctx: ActContext = { actor: ana, at: '2026-10-23T09:00:00.000Z', newId: () => `id-${++counter}`, soloWorkspace: true, validators: null };
	const ok = (outcome: ActOutcome): EvolutionRequest => {
		if (!outcome.ok) throw new Error(`refused: ${outcome.reason}`);
		return outcome.request;
	};
	const request = createEvolutionRequest({ id: 'req-1', title: 'Weekend baskets', origin: 'customer_feedback', stage: 'specification' });
	const key = fieldKey(elementPath('action:a'), 'feature:f');
	const said = JSON.stringify(['Subscribe', 'added', []]);

	it('stands validated on the fingerprint the page read, and goes stale once the action reads otherwise', () => {
		const validated = ok(validateFieldAct(ctx, request, { key, liveValue: said }));
		expect(fieldValidationOf(validated, key, said).status).toBe('validated');
		expect(fieldValidationOf(validated, key, JSON.stringify(['Subscribe weekly', 'added', []])).status).not.toBe('validated');
	});

	it('is rejected as not wanted, then restored', () => {
		const rejected = ok(refuseFieldAct(ctx, request, { key, liveValue: said, reason: 'Not wanted in the specification' }));
		expect(fieldValidationOf(rejected, key, said).status).toBe('refused');
		const restored = ok(withdrawFieldVerdictAct(ctx, rejected, { key }));
		expect(fieldValidationOf(restored, key, said).status).not.toBe('refused');
	});

 it('a refusal survives changed fingerprints, new versions and rereads until explicit Restore [criterion:7c214ba8]', () => {
  const refused = ok(refuseFieldAct(ctx, request, { key, liveValue: said, reason: 'Not wanted' }));
  const rewritten = withFieldVersion(refused, { id: 'rewrite', key, value: 'Changed action', actor: ana, at: ctx.at });
  expect(fieldValidationOf(rewritten, key, 'Yet another rewrite').status).toBe('refused');
  const restored = ok(withdrawFieldVerdictAct(ctx, rewritten, { key }));
  expect(fieldValidationOf(restored, key).status).not.toBe('refused');
  expect(restored.fieldVersions).toHaveLength(2);
 });
 it('validation cannot silently restore a rejected action [unspa:ead2111a:5597cde0:a348481c]', () => {
  const refused = ok(refuseFieldAct(ctx, request, { key, liveValue: said, reason: 'Not wanted' }));
  const result = validateFieldAct(ctx, refused, { key, liveValue: 'Rewritten' });
  expect(result).toMatchObject({ ok: false, reason: 'Restore this rejected action before validating it.' });
 });
 it('even delegated AI approval cannot bypass Restore [unspa:ead2111a:5597cde0:8ee92761]', () => {
  const refused = ok(refuseFieldAct(ctx, request, { key, liveValue: said, reason: 'Not wanted' }));
  expect(validateFieldAct({ ...ctx, actor: { ...ana, kind: 'ai_client' }, delegation: true } as ActContext, refused, { key, liveValue: 'Rewritten' }).ok).toBe(false);
 });
 it('preserves a legitimate approval given after refusal under the earlier contract', () => {
  const refused = ok(refuseFieldAct(ctx, request, { key, liveValue: said, reason: 'Not wanted' }));
  const approved = { ...refused, fieldValidations: [...refused.fieldValidations, { key, versionId: refused.fieldVersions[0].id, by: ana.id, byKind: 'person' as const, at: ctx.at }] };
  expect(fieldValidationOf(approved, key, said).status).toBe('validated');
  const withdrawal = ok(withdrawFieldVerdictAct(ctx, approved, { key }));
  expect(withdrawal.fieldValidations.some((v) => v.verdict !== 'refused')).toBe(false);
 });

 it('restoring only ones own refusal preserves another persons rejection', () => {
  const refused = ok(refuseFieldAct(ctx, request, { key, liveValue: said, reason: 'Not wanted' }));
  const otherCtx = { ...ctx, actor: { ...ana, id: 'ben@team.test' } };
  const twice = ok(refuseFieldAct(otherCtx, refused, { key, liveValue: said, reason: 'Also not wanted' }));
  const mineRestored = ok(withdrawFieldVerdictAct(ctx, twice, { key }));
  expect(fieldValidationOf(mineRestored, key).refusal?.by).toBe(otherCtx.actor.id);
 });

	it('carries comments like any answer', () => {
		expect(isDossierQuestion(elementPath('action:a'))).toBe(true);
	});
});
