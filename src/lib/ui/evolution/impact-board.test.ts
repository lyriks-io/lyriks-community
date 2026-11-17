import { describe, expect, it } from 'vitest';
import { concurrentSummary, crossWords, crossWordsNamed, executiveSummary, gradedItems, impactItems, impactZones, nameList, nextDecision, simulationAreas, type CrossLike, simulationTop } from './impact-board';

const row = (nodeId: string, section: string, extra: Partial<{ depth: number; via: string; note: string }> = {}) => ({
	nodeId,
	label: nodeId.toUpperCase(),
	section,
	verb: 'change',
	depth: extra.depth ?? 1,
	via: extra.via,
	note: extra.note ?? ''
});
const point = (nodeId: string, qualification: 'collision' | 'friction' | 'missing_anchor' | 'fits', extra: { section?: string; findingId?: string; risk?: object } = {}) => ({
	nodeId,
	label: nodeId.toUpperCase(),
	qualification,
	reason: `${nodeId} ${qualification}`,
	...extra
});

describe('the Simulation tab as a board', () => {
	it('joins every thing that moves with its docking, fitting when nothing opposes it', () => {
		const items = impactItems([row('a', 'leaves'), row('b', 'rules_and_scenarios', { depth: 2, via: 'Pay' })], [point('a', 'collision')]);
		expect(items.map((i) => [i.nodeId, i.qualification])).toEqual([
			['a', 'collision'],
			['b', 'fits']
		]);
		expect(items[1].note).toBe('rests on "Pay"');
		expect(items[1].point).toBeNull();
	});

	it('keeps a point the walk did not list, in the part the docking placed it in', () => {
		const items = impactItems([row('a', 'leaves')], [point('z', 'missing_anchor', { section: 'leaves' }), point('y', 'friction')]);
		expect(items.map((i) => [i.nodeId, i.section, i.qualification])).toEqual([
			['a', 'leaves', 'fits'],
			['z', 'leaves', 'missing_anchor'],
			['y', null, 'friction']
		]);
	});

	it('counts the items by section, in the order of the sections, empty sections left out', () => {
		const items = impactItems(
			[row('a', 'leaves'), row('b', 'leaves'), row('c', 'permissions')],
			[point('a', 'collision'), point('b', 'friction'), point('y', 'missing_anchor')]
		);
		const zones = impactZones(items, [
			{ code: 'leaves', label: 'Features' },
			{ code: 'screens_and_journeys', label: 'Screens' },
			{ code: 'permissions', label: 'Permissions' }
		]);
		expect(zones).toEqual([
			{ code: 'leaves', label: 'Features', counts: { collision: 1, friction: 1, missing_anchor: 0, fits: 0 } },
			{ code: 'permissions', label: 'Permissions', counts: { collision: 0, friction: 0, missing_anchor: 0, fits: 1 } },
			{ code: '', label: 'Elsewhere', counts: { collision: 0, friction: 0, missing_anchor: 1, fits: 0 } }
		]);
		expect(simulationAreas(zones).map((a) => [a.label, a.major, a.minor, a.compatible])).toEqual([
			['Features', 2, 0, 0],
			['Permissions', 0, 0, 1],
			['Elsewhere', 0, 1, 0]
		]);
	});

	it('grades what blocks or is to decide as major, what has no anchor as minor, the rest as compatible, each numbered', () => {
		const items = impactItems([], [point('f', 'friction'), point('c', 'collision'), point('m', 'missing_anchor'), point('o', 'fits')]);
		const graded = gradedItems(items);
		expect(graded.major.map((i) => [i.code, i.nodeId])).toEqual([
			['M1', 'c'],
			['M2', 'f']
		]);
		expect(graded.minor.map((i) => i.code)).toEqual(['N1']);
		expect(graded.compatible.map((i) => i.code)).toEqual(['O1']);
	});

	it('points the next best action at the first major impact a person can still decide', () => {
		const majors = [
			{ code: 'M1', point: { findingId: 'f1', risk: { by: 'x' } } },
			{ code: 'M2', point: null },
			{ code: 'M3', point: { findingId: 'f3', risk: null } }
		];
		expect(nextDecision(majors)).toBe('M3');
		expect(nextDecision(majors.slice(0, 2))).toBeNull();
	});
});

const cross = (key: string, verdict: CrossLike['verdict'], extra: Partial<CrossLike> = {}): CrossLike => ({
	key,
	title: `Title ${key}`,
	stage: verdict === 'spec_pending' ? 'specification' : 'implementation',
	verdict,
	shared: [],
	theirs: [],
	...extra
});

describe('the executive summary, composed from the counts and the names', () => {
	const base = {
		key: 'EVO-016',
		leaves: [
			{ name: 'Pay online', change: 'add' as const },
			{ name: 'Order online', change: 'amend' as const },
			{ name: 'Pick up', change: null }
		],
		total: 7,
		compatible: 6,
		minor: 1,
		majors: [],
		cross: []
	};

	it('says what the request does, then how it reads against the existing system', () => {
		const [first] = executiveSummary(base);
		expect(first).toBe('EVO-016 adds “Pay online” and changes “Order online” and “Pick up”. Against the existing system, 6 of 7 items fit as is, 1 needs a light adjustment and none requires a decision.');
	});

	it('names the decisions left, then says once they are all made', () => {
		const majors = [
			{ label: 'Where the currency lives', decided: false },
			{ label: 'Revenue', decided: false }
		];
		expect(executiveSummary({ ...base, minor: 3, compatible: 5, total: 10, majors })[0]).toContain(
			'5 of 10 items fit as is, 3 need light adjustments and 2 require a decision: “Where the currency lives” and “Revenue”.'
		);
		expect(executiveSummary({ ...base, majors: majors.map((m) => ({ ...m, decided: true })) })[0]).toContain(', and both major decisions have been made.');
	});

	it('reads the evolutions in progress: conflicts, overlaps on what is shared, compatible ones, and the ones not checked yet', () => {
		const [, second] = executiveSummary({
			...base,
			cross: [
				cross('EVO-046', 'conflict', { title: 'SEPA direct debit' }),
				cross('EVO-047', 'overlap', { shared: [{ kind: 'table', name: 'Invoice', here: 'amend', there: 'amend', conflict: false }] }),
				cross('EVO-050', 'compatible'),
				cross('EVO-048', 'compatible'),
				cross('EVO-043', 'spec_pending')
			]
		});
		expect(second).toBe(
			'Against the evolutions in progress, it conflicts with SEPA direct debit (EVO-046), and it overlaps with 1 evolution on the table “Invoice”. 2 other evolutions are compatible. EVO-043 is still in Specification and could not be checked yet: this part of the simulation will be completed once its spec is validated.'
		);
		expect(executiveSummary({ ...base, cross: [cross('EVO-050', 'compatible')] })[1]).toBe('It fits with every validated evolution in progress.');
		expect(executiveSummary(base)[1]).toBe('No other evolution is in progress.');
	});
});

describe('an in-progress evolution, in words', () => {
	it('says what each side writes into what they share, and that different rules do not contradict', () => {
		const words = crossWords(
			'EVO-016',
			cross('EVO-010', 'overlap', {
				shared: [
					{
						kind: 'feature',
						name: 'Pick up',
						here: 'amend',
						there: 'amend',
						conflict: false,
						hereWrites: { summary: 'A paid order that is cancelled is refunded.', items: [{ id: 'c-9', act: 'add', text: 'A refund is made in full.' }] },
						thereWrites: { summary: null, items: [{ id: 'c-1', act: 'reword', text: 'A bag waits until closing.', was: 'A bag waits an hour.' }] },
						common: []
					},
					{ kind: 'table', name: 'Order', here: 'amend', there: 'amend', conflict: false, hereWrites: null, thereWrites: null, common: [] }
				]
			})
		);
		expect(words).toMatchObject({ issue: true, head: 'EVO-010 also changes “Pick up” and the table “Order”', sub: 'Both change “Pick up” and the table “Order”', step: 'Implementation' });
		expect(words.meets[0]).toMatchObject({
			what: '“Pick up”',
			here: ['A paid order that is cancelled is refunded.'],
			there: ['Rewrites the rule “A bag waits an hour.” as “A bag waits until closing.”'],
			clash: false,
			label: 'Where they meet',
			point: 'Both change “Pick up”, but not the same rules: nothing contradicts on paper.'
		});
		expect(words.meets[0].todo).toContain('Once EVO-010 is delivered');
		expect(words.meets[1]).toMatchObject({
			what: 'The table “Order”',
			here: ['Lists it among what it changes, without saying how yet.'],
			label: 'Not comparable yet',
			point: 'Neither evolution names yet the fields it changes in the table “Order”: Lyriks cannot tell whether the two contradict.'
		});
	});

	it('names the rule both write, who adds it and who rewrites it', () => {
		const rule = 'A customer cancels an order not ready yet.';
		const words = crossWords(
			'EVO-016',
			cross('EVO-002', 'overlap', {
				shared: [
					{
						kind: 'feature',
						name: 'Pick up',
						here: 'amend',
						there: 'amend',
						conflict: false,
						hereWrites: { summary: null, items: [{ id: 'c-1', act: 'reword', text: 'A classic order is cancelled until ready.', was: rule }] },
						thereWrites: {
							summary: null,
							items: [
								{ id: 'c-1', act: 'add', text: rule, was: rule },
								{ id: 'c-2', act: 'add', text: 'A ready order stays.', was: null },
								{ id: 'c-3', act: 'retire', text: 'Old rule.', was: 'Old rule.' }
							]
						},
						common: ['c-1']
					}
				]
			})
		);
		expect(words.head).toBe('EVO-002 and this evolution write the same rule of “Pick up”');
		expect(words.meets[0]).toMatchObject({
			clash: true,
			label: 'Same rule',
			there: ['Adds the rule “A customer cancels an order not ready yet.”', 'Adds the rule “A ready order stays.”', 'Retires the rule “Old rule.”'],
			point: 'This evolution rewrites the rule “A customer cancels an order not ready yet.” that EVO-002 adds, as “A classic order is cancelled until ready.” Only one wording can stay.'
		});
		expect(words.meets[0].todo).toBe(
			'EVO-002 is already being built on its own wording. Agree with whoever carries it on which wording stays, so its code does not implement a rule this evolution rewrites.'
		);
	});

	it('names who removes what the other changes', () => {
		const words = crossWords('EVO-016', cross('EVO-046', 'conflict', { shared: [{ kind: 'feature', name: 'Collect', here: 'amend', there: 'remove', conflict: true }] }));
		expect(words.head).toBe('EVO-046 removes “Collect”, which this evolution changes');
		expect(words.sub).toBe('One removes “Collect”, the other changes it');
		expect(words.meets[0]).toMatchObject({
			here: ['Lists it among what it changes, without saying how yet.'],
			there: ['Removes it from the product.'],
			label: 'Conflict',
			point: 'EVO-046 removes “Collect”, which this evolution changes: once EVO-046 is delivered, what this evolution changes there no longer exists.'
		});
	});

	it('explains a compatible one by what it changes, and one not checked yet by the step it stands at', () => {
		const compatible = crossWords('EVO-010', cross('EVO-001', 'compatible', { theirs: [{ kind: 'feature', change: 'amend', name: 'Order online' }] }));
		expect(compatible.sub).toBe('Nothing shared with EVO-010: no friction.');
		expect(compatible.explain).toBe('EVO-001 changes “Order online”. EVO-010 changes none of it: the two fit as is.');
		const pending = crossWords('EVO-010', cross('EVO-005', 'spec_pending'));
		expect(pending.sub).toBe('Still in Specification: not checked yet. Lyriks will check it once its spec is validated.');
		expect(pending.explain).toContain('EVO-005 is still in the Specification step');
	});

	it('lists names, counting the rest once there are too many', () => {
		expect(nameList(['A'])).toBe('A');
		expect(nameList(['A', 'B', 'C'])).toBe('A, B and C');
		expect(nameList(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C and 2 others');
	});
});

describe('the top of the Simulation never says less than its details [criterion:ac-leaf-ac-evo-sim-top-cross]', () => {
	const cross = (verdict: 'conflict' | 'overlap' | 'compatible' | 'spec_pending') => ({ verdict });

	it('lights green and reads Implementable only with every decision made and nothing in progress in the way', () => {
		expect(simulationTop({ ready: true, decided: true, cross: [cross('compatible')] })).toMatchObject({ green: true, implementable: true, issues: [] });
		expect(simulationTop({ ready: true, decided: true, cross: [cross('overlap')] })).toMatchObject({ green: false, implementable: false });
		expect(simulationTop({ ready: true, decided: true, cross: [cross('conflict'), cross('compatible')] }).issues).toHaveLength(1);
	});

	it('leaves an evolution not checked yet out of the status', () => {
		expect(simulationTop({ ready: true, decided: true, cross: [cross('spec_pending')] })).toMatchObject({ green: true, implementable: true });
	});

	it('keeps the green light off while a decision on the product waits', () => {
		expect(simulationTop({ ready: false, decided: false, cross: [] })).toMatchObject({ green: false, implementable: false });
	});
});

describe('the concurrent impact report names each side [criterion:f70b2e9f]', () => {
	const cross = (verdict: CrossLike['verdict'], shared: CrossLike['shared'] = []): CrossLike => ({ key: 'EVO-002', title: 'Blur faces', stage: 'specification', verdict, shared, theirs: [] }) as CrossLike;

	it('never says this evolution where no evolution is this one', () => {
		const words = crossWordsNamed('EVO-001', cross('conflict', [{ kind: 'feature', id: 'f', name: 'Report', here: 'remove', there: 'amend', conflict: true, hereWrites: null, thereWrites: null, common: [] }] as unknown as CrossLike['shared']));
		expect(words.head).toBe('EVO-001 removes “Report”, which EVO-002 changes');
		expect(JSON.stringify(words).toLowerCase()).not.toContain('this evolution');
	});

	it('names the pair of a row that shares nothing, and speaks of the report', () => {
		const words = crossWordsNamed('EVO-001', cross('spec_pending'));
		expect(words.head).toBe('EVO-001 and EVO-002');
		expect(words.explain).toContain('This report');
		expect(words.explain).not.toContain('This simulation');
	});

	it('says what it read and what it found, and warns on a conflict or an overlap', () => {
		expect(concurrentSummary(['EVO-001'], ['conflict', 'compatible'])).toEqual({ pill: '1 conflict', warns: true, sentence: 'EVO-001 read against 2 other evolutions in progress: 1 conflict, 0 overlaps, 1 compatible, 0 not checked yet.' });
		expect(concurrentSummary(['EVO-001', 'EVO-002'], [])).toEqual({ pill: 'Nothing to compare', warns: false, sentence: '2 evolutions read against each other: nothing to compare yet.' });
		expect(concurrentSummary(['EVO-001'], ['compatible'])).toMatchObject({ pill: 'No conflict', warns: false });
	});

	it('never says no conflict over pairs it could not check', () => {
		expect(concurrentSummary(['EVO-001', 'EVO-002', 'EVO-003'], ['spec_pending', 'compatible'])).toMatchObject({ pill: '1 not checked yet', warns: true });
	});
});
