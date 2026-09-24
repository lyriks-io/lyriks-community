import { describe, expect, it } from 'vitest';
import { createEvolutionRequest } from './draft';
import { propagateImpact, reachedSentence, withImpactReading } from './impact-propagation';
import { mapCoherenceAnalysis, touchedLeafOf, withCoherenceReading } from './coherence-mapping';
import { deriveImplementationReport, withDerivedReport } from './report-derivation';
import { stableId } from './ids';
import { deriveCodeImpact, impactInPlainWords, impactSummaryLine, impactVerb, reachedFeatures, shownImpactSentence } from './code-impact';

/**
 * The three reports are DERIVED: from the knowledge graph, from the engine's
 * analysis, from the implementation index. These tests pin what each row says
 * and where it comes from, so a client can never be the source of a finding.
 */

const graph = {
	nodes: [
		{ id: 'feature:feat-a', kind: 'feature', label: 'Checkout' },
		{ id: 'feature:beh:feat-a', kind: 'feature', label: 'Checkout (behaviour)' },
		{ id: 'screen:s1', kind: 'screen', label: 'Cart page' },
		{ id: 'entity:e1', kind: 'entity', label: 'Order' },
		{ id: 'field:f1', kind: 'field', label: 'Order.total' },
		{ id: 'rule:r1', kind: 'rule', label: 'Total never negative' },
		{ id: 'role:admin', kind: 'role', label: 'Admin' },
		{ id: 'feature:feat-b', kind: 'feature', label: 'Invoicing' },
		{ id: 'host:h1', kind: 'host', label: 'eu-west' },
		{ id: 'feature:feat-c', kind: 'feature', label: 'Reporting' },
		{ id: 'core:c1', kind: 'core', label: 'Sales' }
	],
	edges: [
		{ from: 'step:x', to: 'screen:s1', kind: 'shows' },
		{ from: 'feature:feat-a', to: 'screen:s1', kind: 'contains' },
		{ from: 'screen:s1', to: 'entity:e1', kind: 'reads' },
		{ from: 'entity:e1', to: 'field:f1', kind: 'contains' },
		{ from: 'rule:r1', to: 'feature:feat-a', kind: 'derives' },
		{ from: 'role:admin', to: 'feature:feat-a', kind: 'accesses' },
		{ from: 'feature:feat-b', to: 'entity:e1', kind: 'reads' },
		{ from: 'feature:feat-a', to: 'host:h1', kind: 'contains' },
		// A role and a core reach everything they hold: never a path.
		{ from: 'role:admin', to: 'feature:feat-c', kind: 'accesses' },
		{ from: 'core:c1', to: 'feature:feat-a', kind: 'contains' },
		{ from: 'core:c1', to: 'feature:feat-c', kind: 'contains' }
	]
};

describe('propagateImpact', () => {
	const request = createEvolutionRequest({ id: 'req-1', leafIds: ['feat-a'] });

	it('lists what a path of at most `depth` links reaches, never the touched feature itself', () => {
		const findings = propagateImpact({ request, hypothesis: 'change', depth: 1, graph });
		const ids = findings.map((f) => f.nodeId);
		expect(ids).toContain('screen:s1');
		expect(ids).toContain('rule:r1');
		expect(ids).toContain('role:admin');
		expect(ids).not.toContain('entity:e1');
		expect(ids).not.toContain('feature:feat-a');
		expect(ids).not.toContain('feature:beh:feat-a');
	});

	it('under add only the direct neighbourhood moves: nothing that exists breaks', () => {
		const add = propagateImpact({ request, hypothesis: 'add', depth: 3, graph });
		expect(add.every((f) => f.depth === 1)).toBe(true);
		expect(add.map((f) => f.nodeId)).not.toContain('entity:e1');
		expect(impactSummaryLine(add, 'add')).toBe('Nothing that exists breaks. 1 screen to extend, 1 role to grant, 1 rule to replay.');
		const remove = propagateImpact({ request, hypothesis: 'remove', depth: 3, graph });
		expect(impactSummaryLine(remove, 'remove')).toBe(
			'1 screen to strip, 1 role to revoke, 1 rule to rewrite or retire, 2 entities to migrate, 3 knock-ons that may break.'
		);
		expect(impactVerb(remove.find((f) => f.nodeId === 'screen:s1')!)).toBe('strip');
		expect(impactVerb(remove.find((f) => f.nodeId === 'entity:e1')!)).toBe('migrate');
		expect(impactVerb(add.find((f) => f.nodeId === 'role:admin')!)).toBe('grant');
	});

	it('goes deeper when asked and keeps the path on the row', () => {
		const findings = propagateImpact({ request, hypothesis: 'change', depth: 3, graph });
		const total = findings.find((f) => f.nodeId === 'field:f1');
		expect(total?.depth).toBe(3);
		expect(total?.groupPath).toEqual(['Checkout', 'Cart page', 'Order']);
		expect(total?.section).toBe('entities_and_fields');
		expect(total?.severity).toBe('low');
		expect(total?.codeWork).toBe('at_risk');
		// A neighbour feature reached through a shared entity is a knock-on.
		expect(findings.find((f) => f.nodeId === 'feature:feat-b')?.depth).toBe(3);
	});

	it('stops on a role or a core: what they hold is the product, not the change', () => {
		const findings = propagateImpact({ request, hypothesis: 'change', depth: 3, graph });
		const ids = findings.map((f) => f.nodeId);
		expect(ids).toContain('role:admin');
		expect(ids).toContain('core:c1');
		expect(ids).not.toContain('feature:feat-c');
	});

	it('leaves out what the six sections do not describe', () => {
		const findings = propagateImpact({ request, hypothesis: 'add', depth: 2, graph });
		expect(findings.some((f) => f.nodeId === 'host:h1')).toBe(false);
	});

	it('reads entities and rules under the hypothesis', () => {
		const remove = propagateImpact({ request, hypothesis: 'remove', depth: 2, graph });
		expect(remove.find((f) => f.nodeId === 'entity:e1')?.migrationImplied).toBe(true);
		expect(remove.find((f) => f.nodeId === 'rule:r1')?.ruleWork).toBe('rewrite');
		expect(remove.find((f) => f.nodeId === 'rule:r1')?.codeWork).toBe('remove');
		// A knock-on loses its ground under remove: a high risk, not a medium one.
		expect(remove.find((f) => f.nodeId === 'entity:e1')?.severity).toBe('high');
		const add = propagateImpact({ request, hypothesis: 'add', depth: 2, graph });
		expect(add.find((f) => f.nodeId === 'rule:r1')?.ruleWork).toBe('replay');
		// An addition reaches no knock-on: the entity two links out is not listed.
		expect(add.find((f) => f.nodeId === 'entity:e1')).toBeUndefined();
		const change = propagateImpact({ request, hypothesis: 'change', depth: 2, graph });
		expect(change.find((f) => f.nodeId === 'rule:r1')?.ruleWork).toBe('rewrite');
		expect(change.find((f) => f.nodeId === 'entity:e1')?.migrationImplied).toBe(false);
	});

	it('names the agreed words the change touches', () => {
		const findings = propagateImpact({
			request,
			hypothesis: 'change',
			depth: 1,
			graph,
			terms: [
				{ id: 't1', term: 'Cart', synonymsAllowed: ['basket'] },
				{ id: 't2', term: 'Refund' },
				{ id: 't3', term: 'Order' }
			]
		});
		// "Order" names a knock-on node only (depth 2), so it is not listed.
		expect(findings.filter((f) => f.section === 'glossary_terms').map((f) => f.nodeLabel)).toEqual(['Cart']);
	});

	it('keeps a stable id per node so a re-run does not orphan a decision', () => {
		const a = propagateImpact({ request, hypothesis: 'change', depth: 1, graph });
		const b = propagateImpact({ request, hypothesis: 'change', depth: 2, graph });
		const screenA = a.find((f) => f.nodeId === 'screen:s1');
		const screenB = b.find((f) => f.nodeId === 'screen:s1');
		expect(screenA?.id).toBe(screenB?.id);
		expect(screenA?.id).toBe(stableId('imp', 'req-1', 'change', 'screen:s1'));
	});

	it('replaces one hypothesis and keeps the others side by side', () => {
		const add = propagateImpact({ request, hypothesis: 'add', depth: 1, graph });
		let next = withImpactReading(request, 'add', 1, add, 't1');
		const change = propagateImpact({ request, hypothesis: 'change', depth: 2, graph });
		next = withImpactReading(next, 'change', 2, change, 't2');
		expect(next.impactReport).toEqual({ status: 'ready', hypothesis: 'change', depth: 2, ranAt: 't2' });
		expect(next.impactFindings.filter((f) => f.hypothesis === 'add')).toHaveLength(add.length);
		expect(next.impactFindings.filter((f) => f.hypothesis === 'change')).toHaveLength(change.length);
	});
});

describe('mapCoherenceAnalysis', () => {
	const request = createEvolutionRequest({ id: 'req-1', leafIds: ['feat-a'] });
	const leafNames = { 'feat-a': 'Checkout' };

	it('keeps only the gaps that name a touched feature, by id or by name', () => {
		expect(touchedLeafOf({ id: 'g', title: 'x', featureRef: 'feat-a' }, ['feat-a'], leafNames)).toBe('feat-a');
		expect(touchedLeafOf({ id: 'g', title: 'Checkout has no role' }, ['feat-a'], leafNames)).toBe('feat-a');
		expect(touchedLeafOf({ id: 'g', title: 'Invoicing has no role' }, ['feat-a'], leafNames)).toBeNull();
	});

	it('places each finding on an axis with a severity the gate reads, and names both nodes', () => {
		const mapping = mapCoherenceAnalysis({
			request,
			analysis: {
				readinessScore: 71.6,
				gaps: [
					{ id: 'g1', title: 'Checkout has no role', severity: 'high', blocking: true, sourceStep: 'users', subject: 'role:admin', fixAnchor: 'admin' },
					{ id: 'g2', title: 'Checkout duplicates Invoicing', severity: 'medium', kind: 'duplicate', sourceStep: 'features', subject: 'feat-b' },
					{ id: 'g3', title: 'Unrelated', severity: 'low', sourceStep: 'data' },
					{ id: 'g4', title: 'Checkout state unreachable', severity: 'low', provenance: 'behavior', featureRef: 'feat-a' }
				]
			},
			leafNames,
			at: 'now'
		});
		expect(mapping.report).toEqual({ status: 'ready', projectScore: 72, requestDelta: 0, ranAt: 'now' });
		expect(mapping.findings.map((f) => [f.axis, f.severity, f.existingNodeId, f.published])).toEqual([
			['access_and_data', 'blocking', 'role:admin', true],
			['structural', 'minor', 'feat-b', true],
			['behavioural', 'minor', 'g4', true]
		]);
		expect(mapping.findings[0].fixNowTarget).toBe('capability:users/admin');
		expect(mapping.findings[0].requestNodeId).toBe('feat-a');
	});

	it('reads the delta as the movement since the previous check on the request', () => {
		const checked = withCoherenceReading(
			{ ...request, coherenceGateClosed: true },
			mapCoherenceAnalysis({ request, analysis: { readinessScore: 60, gaps: [] }, leafNames, at: 't1' })
		);
		expect(checked.coherenceGateClosed).toBe(false);
		const again = mapCoherenceAnalysis({
			request: checked,
			analysis: { readinessScore: 66, gaps: [] },
			leafNames,
			at: 't2'
		});
		expect(again.report.requestDelta).toBe(6);
	});
});

describe('deriveImplementationReport', () => {
	const request = { id: 'req-1', iteration: 1, specVersion: 2, leafIds: ['feat-a'] };
	const leafNames = { 'feat-a': 'Checkout', 'feat-b': 'Invoicing' };
	const status = {
		actions: [
			{
				actionId: 'a1',
				actionName: 'Pay',
				expectedEntities: [
					{ entityType: 'action', entityId: 'a1', entityName: 'Pay' },
					{ entityType: 'rule', entityId: 'r1', entityName: 'Card must be valid' },
					{ entityType: 'rule', entityId: 'r2', entityName: 'Total never negative' }
				],
				foundEntities: [
					{ entityType: 'action', entityId: 'a1', entityName: 'Pay', locations: [{ file: 'src/pay.ts', line: 10, snippet: 'export function pay()' }] },
					{ entityType: 'rule', entityId: 'r2', entityName: 'Total never negative', locations: [{ file: 'src/pay.ts', line: 30, unverified: true }] }
				],
				missingEntities: [{ entityType: 'rule', entityId: 'r1', entityName: 'Card must be valid' }],
				extraTags: [{ tag: '@unspa:pay#discount', locations: [{ file: 'src/discount.ts', line: 3 }] }],
				auditMeta: { testFile: 'src/pay.test.ts' }
			}
		]
	};

	it('crosses what was expected with what was located, and files the rest', () => {
		const lines = deriveImplementationReport({
			request,
			statuses: { 'feat-a': status },
			neighbours: {
				'feat-b': {
					actions: [
						{
							actionId: 'b1',
							actionName: 'Issue invoice',
							foundEntities: [
								{ entityType: 'action', entityId: 'b1', locations: [{ file: 'src/pay.ts', line: 80, stale: true }] },
								{ entityType: 'rule', entityId: 'b2', locations: [{ file: 'src/invoice.ts', line: 5, stale: true }] }
							]
						}
					]
				}
			},
			leafNames
		});
		const byVerdict = (v: string) => lines.filter((l) => l.verdict === v).map((l) => l.requirement);
		expect(byVerdict('conform')).toEqual(['Checkout › Pay › action "Pay"']);
		expect(byVerdict('missing')).toEqual(['Checkout › Pay › rule "Card must be valid"']);
		// Located but the signature no longer matches: not proven, so not conform.
		expect(byVerdict('non_conform')).toEqual(['Checkout › Pay › rule "Total never negative"']);
		expect(byVerdict('out_of_scope')).toEqual(['Checkout › tag "@unspa:pay#discount" in the code']);
		// Only the neighbour span in a file the change touches counts as a regression.
		expect(byVerdict('regression')).toEqual(['Invoicing › Issue invoice › action "b1"']);
		for (const line of lines) {
			expect(line.iteration).toBe(1);
			expect(line.specVersion).toBe(2);
			expect(line.decision).toBe('undecided');
		}
		expect(lines.find((l) => l.verdict === 'conform')?.filePath).toBe('src/pay.ts');
		expect(lines.find((l) => l.verdict === 'conform')?.lineRange).toBe('10');
	});

	it('reads a missing index as everything missing, without a test as non-conform', () => {
		const lines = deriveImplementationReport({
			request,
			statuses: {
				'feat-a': {
					actions: [
						{
							actionId: 'a1',
							actionName: 'Pay',
							foundEntities: [{ entityType: 'action', entityId: 'a1', locations: [{ file: 'src/pay.ts', line: 1 }] }],
							missingEntities: [{ entityType: 'rule', entityId: 'r1' }]
						}
					]
				},
				'feat-c': null
			},
			neighbours: {},
			leafNames
		});
		expect(lines.map((l) => l.verdict)).toEqual(['missing', 'non_conform']);
	});

	it('keeps the decision taken on a line that is derived again', () => {
		const first = deriveImplementationReport({ request, statuses: { 'feat-a': status }, neighbours: {}, leafNames });
		let full = createEvolutionRequest({ id: 'req-1', iteration: 1, specVersion: 2, frozen: true, leafIds: ['feat-a'] });
		full = withDerivedReport(full, first, 't1');
		expect(full.iterations).toEqual([{ number: 1, startedAt: 't1', brief: '', protectedLineIds: [], reportStatus: 'ready' }]);
		const decided = {
			...full,
			implementationFindings: full.implementationFindings.map((l) =>
				l.verdict === 'conform' ? { ...l, decision: 'validated' as const, decidedBy: 'ana', decidedAt: 't1' } : l
			)
		};
		const second = deriveImplementationReport({ request, statuses: { 'feat-a': status }, neighbours: {}, leafNames });
		const again = withDerivedReport(decided, second, 't2');
		expect(again.implementationFindings.find((l) => l.verdict === 'conform')?.decision).toBe('validated');
		expect(again.implementationFindings).toHaveLength(first.length);
	});
});

describe('deriveCodeImpact', () => {
	const statuses = {
		'feat-a': {
			actions: [
				{
					actionId: 'a1',
					actionName: 'Pay',
					foundEntities: [
						{ entityType: 'action', entityId: 'a1', entityName: 'Pay', locations: [{ file: 'src/pay.ts', line: 10 }] },
						{ entityType: 'rule', entityId: 'r1', entityName: 'Card valid', locations: [{ file: 'src/pay.ts', line: 30 }, { file: 'src/rules.ts', line: 3 }] }
					]
				}
			]
		},
		'feat-b': {
			surfaces: [
				{ surfaceId: 's1', surfaceName: 'Invoice', foundEntities: [{ entityType: 'state', entityId: 'st1', entityName: 'invoice.total', locations: [{ file: 'src/rules.ts', line: 40 }] }] }
			]
		},
		'feat-c': null
	};
	const leafNames = { 'feat-a': 'Checkout', 'feat-b': 'Invoicing' };

	it('reads one finding per file, naming the features and elements it holds, nearest first', () => {
		const findings = deriveCodeImpact({
			request: { id: 'req-1', leafIds: ['feat-a'] },
			hypothesis: 'add',
			statuses,
			depthByFeature: { 'feat-a': 1, 'feat-b': 2 },
			leafNames
		});
		expect(findings.map((f) => [f.nodeLabel, f.depth, f.codeWork, f.groupPath])).toEqual([
			['src/pay.ts', 1, 'change', ['Checkout']],
			['src/rules.ts', 1, 'change', ['Checkout', 'Invoicing']]
		]);
		expect(findings[0].section).toBe('code');
		expect(findings[0].nodeKind).toBe('file');
		expect(findings[0].note).toBe('2 elements of Checkout live here: action "Pay", rule "Card valid".');
		expect(findings[1].note).toContain('state "invoice.total"');
	});

	it('reads the reached features off the spec plane, nearest depth wins', () => {
		expect(
			reachedFeatures([
				{ section: 'leaves', nodeKind: 'feature', nodeId: 'feature:feat-b', depth: 2 },
				{ section: 'leaves', nodeKind: 'feature', nodeId: 'feature:beh:feat-b', depth: 1 },
				{ section: 'leaves', nodeKind: 'core', nodeId: 'core:c1', depth: 1 },
				{ section: 'screens_and_journeys', nodeKind: 'screen', nodeId: 'screen:s', depth: 1 }
			] as never)
		).toEqual({ 'feat-b': 1 });
	});

	it('says the report in plain words, one line per plane', () => {
		const request = createEvolutionRequest({ id: 'req-1', leafIds: ['feat-a'] });
		const spec = propagateImpact({ request, hypothesis: 'change', depth: 1, graph });
		const code = deriveCodeImpact({ request, hypothesis: 'change', statuses, depthByFeature: { 'feat-a': 1, 'feat-b': 2 }, leafNames });
		const lines = impactInPlainWords([...spec, ...code]);
		expect(lines).toEqual([
			'1 screen or journey to rework: Cart page.',
			'1 rule to rewrite: Total never negative.',
			'1 role to set: Admin.',
			'2 files across 2 features: 2 to change, 0 at risk.'
		]);
		// The verb follows the hypothesis (ac-evo-imp-12).
		const removed = propagateImpact({ request, hypothesis: 'remove', depth: 1, graph });
		expect(impactInPlainWords(removed)).toEqual([
			'1 screen or journey to strip: Cart page.',
			'1 rule to rewrite or retire: Total never negative.',
			'1 role to revoke: Admin.',
			'No file is anchored on the touched features yet: sync the implementation index from the checkout to read the code plane.'
		]);
		expect(impactInPlainWords([])).toEqual([
			'Nothing in the specification moves beyond the touched features.',
			'No file is anchored on the touched features yet: sync the implementation index from the checkout to read the code plane.'
		]);
	});
});

/**
 * What a row two links out asks OF THE READER.
 *
 * It answered "re-check" for every node whatever it was, which named the
 * distance the walk had covered and left the reader to guess the work. Replaying
 * a rule and rereading a definition are not the same afternoon.
 */
describe('a knock-on says what it takes to trust it again', () => {
	const at = (section: string, hypothesis: 'add' | 'change' | 'remove' = 'change') =>
		impactVerb({
			id: 'f',
			hypothesis,
			section,
			nodeId: 'n',
			nodeLabel: 'Whatever',
			nodeKind: 'screen',
			groupPath: ['Something'],
			note: '',
			codeWork: null,
			depth: 2,
			severity: 'low',
			migrationImplied: null,
			ruleWork: null
		} as Parameters<typeof impactVerb>[0]);

	it('names the work, and a different one per kind of node', () => {
		expect(at('screens_and_journeys')).toBe('walk it again');
		expect(at('rules_and_scenarios')).toBe('replay it');
		expect(at('permissions')).toBe('check who may');
		expect(at('glossary_terms')).toBe('read the definition again');
		expect(at('entities_and_fields')).toBe('check the shape holds');
		expect(at('leaves')).toBe('read its spec again');
	});

	it('never says re-check again, which named the distance and not the work', () => {
		const everywhere = ['screens_and_journeys', 'rules_and_scenarios', 'permissions', 'glossary_terms', 'entities_and_fields', 'leaves'];
		expect(everywhere.map((s) => at(s))).not.toContain('re-check');
	});

	it('still says a removal may break it, which is the one case that is not work but risk', () => {
		expect(at('screens_and_journeys', 'remove')).toBe('may break');
	});
});

/**
 * Seen on the screen on 2026-09-24, with the merged dossier work: a feature
 * reached through "depends_on" read "write it", the line under it read
 * `feature reached in 1 link from X, through "depends_on"`, and five roles
 * reached from an AMENDED feature read "grant" because the same request also
 * added something.
 */
describe('a reached row says what is true of it, in words', () => {
	const request = createEvolutionRequest({ id: 'req-2', leafIds: ['feat-a'] });

	it('never tells the reader to write, edit or delete a feature the request does not touch', () => {
		for (const hypothesis of ['add', 'change', 'remove'] as const) {
			const invoicing = propagateImpact({ request, hypothesis, depth: 3, graph }).find(
				(f) => f.nodeId === 'feature:feat-b'
			);
			if (!invoicing) continue;
			expect(['write it', 'edit it', 'delete it']).not.toContain(impactVerb(invoicing));
		}
		const change = propagateImpact({ request, hypothesis: 'change', depth: 3, graph });
		expect(impactVerb(change.find((f) => f.nodeId === 'feature:feat-b')!)).toBe('read its spec again');
		const remove = propagateImpact({ request, hypothesis: 'remove', depth: 3, graph });
		expect(impactVerb(remove.find((f) => f.nodeId === 'feature:feat-b')!)).toBe('may break');
	});

	it('says what joined a node to the change without the name of a graph relation', () => {
		const change = propagateImpact({ request, hypothesis: 'change', depth: 2, graph });
		const admin = change.find((f) => f.nodeId === 'role:admin')!;
		expect(admin.note).toBe('Next to "Checkout": this role can use it.');
		const order = change.find((f) => f.nodeId === 'entity:e1')!;
		expect(order.note).toBe('Rests on "Cart page", which is next to "Checkout".');
		expect(change.every((f) => !/depends_on|accesses|contains|reached in/.test(f.note))).toBe(true);
		expect(reachedSentence(['X'], 1, 'some_new_link')).toBe('Next to "X": linked as "some new link".');
	});

	it('remembers which touched feature a node was reached from', () => {
		const change = propagateImpact({ request, hypothesis: 'change', depth: 2, graph });
		expect(change.find((f) => f.nodeId === 'role:admin')!.fromLeafId).toBe('feat-a');
	});

	it('counts on top exactly the rows it shows, verb by verb', () => {
		expect(
			shownImpactSentence([
				{ section: 'leaves', verb: 'read its spec again' },
				{ section: 'leaves', verb: 'read its spec again' },
				{ section: 'screens_and_journeys', verb: 'extend' },
				{ section: 'permissions', verb: 'set who may' },
				{ section: 'permissions', verb: 'set who may' },
				{ section: 'code', verb: 'change' }
			])
		).toBe('Nothing that exists breaks. 2 features to read their spec again, 1 screen to extend, 2 roles to set who may, 1 file to change.');
		expect(shownImpactSentence([{ section: 'leaves', verb: 'may break' }])).toBe('1 feature that may break.');
	});
});
