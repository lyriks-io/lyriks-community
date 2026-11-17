import { describe, expect, it } from 'vitest';
import type { DataRuleReading, DataRuleVerdict } from '$application/use-cases';
import { breakingSteps, ruleStatus } from './data-rule-status';

const rule = (over: Partial<DataRuleReading>): DataRuleReading => ({
	key: 'required:f1',
	shape: 'required',
	entityId: 'e1',
	fieldId: 'f1',
	fieldName: 'status',
	ears: 'While an Order exists, the system shall ensure that it has a status.',
	check: 'solver',
	tiedTo: 'order.status',
	missing: 'nothing',
	invariantId: 'pi-1',
	href: '/x',
	...over
});
const verdict = (over: Partial<DataRuleVerdict>): DataRuleVerdict => ({
	key: 'required:f1',
	verdict: 'proved',
	summary: 'Proved for every run, whatever its length.',
	answer: {},
	href: '/x',
	...over
});
const context = { tableName: 'Order', proving: false, proofs: true };

describe('what a rule says to a person deciding', () => {
	it('never reads a field nothing carries as proved', () => {
		expect(ruleStatus(rule({ tiedTo: null, missing: 'link' }), verdict({}), context)).toMatchObject({
			label: 'Not checked yet',
			bucket: 'not-tied',
			detail: expect.stringContaining('Link status to the behaviour state that holds its value')
		});
	});

	it('says which state is missing before a required field can be checked', () => {
		const status = ruleStatus(rule({ missing: 'existence', invariantId: null }), undefined, context);
		expect(status).toMatchObject({ label: 'Unchecked', bucket: 'unchecked' });
		expect(status.detail).toContain("Say when a record of Order exists");
	});

	it('shows the solver verdict with its sentence, a broken rule first in the broken bucket', () => {
		expect(ruleStatus(rule({}), verdict({}), context)).toMatchObject({ label: 'Proved', tone: 'success', bucket: 'proved' });
		expect(ruleStatus(rule({}), verdict({ verdict: 'broken', summary: 'Broken: …' }), context)).toMatchObject({
			label: 'Broken',
			tone: 'danger',
			bucket: 'broken',
			detail: 'Broken: …'
		});
		expect(ruleStatus(rule({}), verdict({ verdict: 'unsettled' }), context).bucket).toBe('unchecked');
	});

	it('never shows a rule that only held within the bound with the mark of a proof', () => {
		const held = ruleStatus(
			rule({}),
			verdict({ verdict: 'held-within-bound', summary: 'Holds for 6 steps: no path of up to 6 steps breaks it, nothing beyond them is proven.', answer: { maxSteps: 6 } }),
			context
		);
		expect(held).toMatchObject({ label: 'Holds for 6 steps', tone: 'neutral', bucket: 'held' });
		expect(held.detail).toContain('nothing beyond them is proven');
		expect(ruleStatus(rule({}), verdict({ verdict: 'held-within-bound' }), context).label).toBe('Holds within the bound');
	});

	it('counts a rule still being proved apart from the ones that need a decision', () => {
		const status = ruleStatus(rule({}), undefined, { ...context, proving: true });
		expect(status).toMatchObject({ label: 'Proving…', bucket: 'proving' });
		expect(ruleStatus(rule({}), verdict({}), { ...context, proving: true }).bucket).toBe('proved');
	});

	it('reads a starting value by comparing it, and says the behaviour’s own', () => {
		const differs = ruleStatus(
			rule({ shape: 'starts-as', check: 'compare', startsAs: { behaviour: 'paid', same: false } }),
			undefined,
			context
		);
		expect(differs).toMatchObject({ label: 'Differs', bucket: 'broken', detail: 'The behaviour starts order.status at "paid".' });
	});

	it('names no solver where the installation does not prove', () => {
		const community = { ...context, proofs: false };
		const linked = ruleStatus(rule({}), verdict({}), community);
		expect(linked).toMatchObject({ label: 'Checked in simulation', bucket: 'simulated' });
		const unlinked = ruleStatus(rule({ tiedTo: null, missing: 'link' }), undefined, community);
		const outOfReach = ruleStatus(rule({ check: 'out-of-reach' }), undefined, community);
		for (const status of [linked, unlinked, outOfReach]) {
			expect(`${status.label} ${status.detail ?? ''}`.toLowerCase()).not.toContain('solver');
		}
	});

	it('shows the proof of a linked rule locked on Community, naming Enterprise, and runs no verdict into it', () => {
		const solverLock = { plan: 'Enterprise', sentence: 'Proving a rule for every value is part of Enterprise.' };
		const community = { ...context, proofs: false, solverLock };
		// A verdict made before a move down is not shown again as a proof.
		const linked = ruleStatus(rule({}), verdict({ verdict: 'proved' }), community);
		expect(linked).toMatchObject({ label: 'Checked in simulation', bucket: 'simulated', lockedBy: 'Enterprise' });
		expect(linked.detail).toContain(solverLock.sentence);
		expect(ruleStatus(rule({}), undefined, { ...context, proofs: false }).lockedBy).toBeUndefined();
	});

	it('writes the path that breaks a rule as feature › action (inputs)', () => {
		const broken = verdict({
			verdict: 'broken',
			answer: { brokenBy: { path: [{ featureName: 'Checkout', actionName: 'Ship order', parameters: { carrier: 'post' } }] } }
		});
		expect(breakingSteps(broken)).toEqual(['Checkout › Ship order (carrier = "post")']);
	});
});
