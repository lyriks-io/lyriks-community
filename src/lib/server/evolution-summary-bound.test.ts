import { describe, expect, it } from 'vitest';
import { boundPart, boundSummary, SUMMARY_BUDGET } from './evolution-summary-bound';

const long = (n: number, word = 'word ') => word.repeat(Math.ceil(n / word.length)).slice(0, n);
const href = (at: string) => `/projects/p/evolution?request=r1&at=${at}`;

/** A dossier in full the way requestSummary shapes it, as heavy as the request makes it. */
function fullSummary(features: number, textLength: number) {
	return {
		id: 'r1',
		title: 'A big change',
		stage: 'coherence',
		status: 'open',
		href: href('top'),
		need: {
			fields: ['description', 'situation', 'symptoms', 'cost', 'objectives', 'measures'].map((k) => ({
				path: `00-need.${k}`,
				label: k,
				value: long(textLength),
				trail: { validation: 'validated', versionCount: 3, validatedBy: ['a@x'], humanValidated: true },
				thread: { id: `t-${k}`, state: 'open', messages: Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, body: long(300) })) },
				href: href(`field__${k}`)
			})),
			owed: []
		},
		stepDescriptions: ['solution', 'functional_spec', 'technical_spec'].map((step) => ({ step, value: long(textLength), trail: { validation: 'unvalidated', versionCount: 1 } })),
		stepAnswers: ['examples', 'out_of_scope', 'refusals', 'failures', 'data', 'diagram'].map((key) => ({ step: 'solution', key, value: long(textLength), trail: { validation: 'unvalidated', versionCount: 1 } })),
		customQuestions: { max: 5, open: 5, entries: Array.from({ length: 30 }, (_, i) => ({ id: `q${i}`, step: 'solution', question: long(200), value: long(textLength) })) },
		docking: { counts: { fits: features * 7 }, total: features * 7, points: Array.from({ length: 60 }, (_, i) => ({ nodeId: `n${i}`, label: long(120), section: 'leaves', qualification: i % 9 ? 'fits' : 'friction', reason: long(200) })) },
		crossEvolutions: Array.from({ length: 20 }, (_, i) => ({ id: `x${i}`, title: long(80) })),
		journeyPaths: Object.fromEntries(Array.from({ length: features }, (_, i) => [`element.path.p${i}`, { validation: 'unvalidated', versionCount: 0 }])),
		used: Array.from({ length: features }, (_, i) => ({ id: `u${i}`, name: long(40), diagrams: ['functional'] })),
		leaves: Array.from({ length: features }, (_, i) => ({ id: `feat-${i}`, name: long(40), drafted: false, change: 'amend', draftId: `draft:${'0'.repeat(36)}`, description: long(800), behaviour: 12 })),
		drafts: { total: features, changes: Array.from({ length: features * 8 }, (_, i) => ({ kind: 'rule', label: long(300), status: 'changed', id: `r${i}`, in: 'Ban a user · Admin users table' })) },
		data: { drafts: Array.from({ length: 40 }, (_, i) => ({ id: `d${i}`, kind: 'amend', entityId: `e${i}`, name: '', addFields: [{ name: 'x' }], changeFields: [], removeFields: [] })), view: { tables: long(9000) } },
		frozenVersions: Array.from({ length: 12 }, (_, i) => ({ version: i + 1, at: '2026-10-28', by: 'a@x', snapshot: { huge: long(5000) } })),
		maturity: { score: 70, criticalEmptyFields: Array.from({ length: features * 4 }, (_, i) => `f${i}`) },
		coherence: { overall: 80, findings: Array.from({ length: features * 5 }, (_, i) => ({ id: `c${i}`, severity: 'blocking', title: long(250), scope: i % 2 ? 'inherited' : 'request', holdsGate: i === 7, fixNowTarget: long(80) })) },
		impact: { total: 900, plain: Array.from({ length: 6 }, () => long(400)), direct: Array.from({ length: 15 }, (_, i) => ({ id: `i${i}`, section: 'leaves', label: long(150), depth: 1, reason: long(200) })) },
		observations: Array.from({ length: 30 }, (_, i) => ({ id: `o${i}`, body: long(500), href: href(`observation__o${i}`) })),
		history: Array.from({ length: 15 }, (_, i) => ({ type: 'x', summary: long(120), recordedAt: `${i}` })),
		path: Array.from({ length: 8 }, (_, i) => ({ step: `s${i}`, detail: long(60) }))
	};
}

describe('the dossier an AI client reads in short stays under the cap [criterion:ac-leaf-ac-evo-llm-summary-bound]', () => {
	it('keeps a request of five features or of eighty under the budget, counts kept', () => {
		for (const [features, textLength] of [
			[5, 300],
			[14, 2000],
			[80, 20000]
		]) {
			const bounded = boundSummary(fullSummary(features, textLength));
			expect(JSON.stringify(bounded).length).toBeLessThanOrEqual(SUMMARY_BUDGET);
			expect(bounded.leavesTotal).toBe(features);
			expect((bounded.coherence as { findingsTotal: number }).findingsTotal).toBe(features * 5);
			expect((bounded.drafts as { changesTotal: number }).changesTotal).toBe(features * 8);
			expect(bounded.id).toBe('r1');
		}
	});

	it('says when a text is cut and how long it is, counts its thread, and names the part that reads it whole', () => {
		const bounded = boundSummary(fullSummary(14, 2000));
		const situation = (bounded.need as { fields: Array<Record<string, unknown>> }).fields[1];
		expect(situation).toMatchObject({ cut: true, length: 2000, thread: { id: 't-situation', messageCount: 12 } });
		expect(String(situation.value).length).toBeLessThan(2000);
		expect(bounded.texts).toEqual({ read: 'get_evolution part="texts"' });
		expect((bounded.coherence as { read: string }).read).toBe('get_evolution part="coherence"');
		// What blocks reads first.
		expect((bounded.coherence as { findings: Array<{ id: string }> }).findings[0].id).toBe('c7');
		expect((bounded.docking as { points: Array<{ qualification: string }> }).points[0].qualification).toBe('friction');
	});

	it('leaves a short text whole, without a cut mark', () => {
		const bounded = boundSummary(fullSummary(2, 40));
		const field = (bounded.need as { fields: Array<Record<string, unknown>> }).fields[0];
		expect(field.value).toBe(long(40));
		expect(field).not.toHaveProperty('cut');
	});

	it('reads whole and paged what the preview cuts: every text with its thread, every finding, every point', () => {
		const full = fullSummary(14, 2000);
		const texts = boundPart(full, 'texts', { limit: 4 }).texts as { total: number; entries: Array<Record<string, unknown>> };
		expect(texts.total).toBe(6 + 3 + 6 + 30);
		expect(texts.entries).toHaveLength(4);
		expect(String(texts.entries[1].value)).toHaveLength(2000);
		expect((texts.entries[1].thread as { messages: unknown[] }).messages).toHaveLength(12);
		const coherence = boundPart(full, 'coherence', { scope: 'inherited', offset: 2, limit: 3 }).coherence as { total: number; findings: Array<{ scope: string }> };
		expect(coherence.total).toBe(35);
		expect(coherence.findings.every((f) => f.scope === 'inherited')).toBe(true);
		const points = boundPart(full, 'points').points as { total: number; held: number };
		expect(points).toMatchObject({ total: 60, held: 98 });
	});
});

describe('the findings a request settles stay bounded in short [criterion:ac-leaf-ac-evo-draft-findings]', () => {
	const finding = (i: number) => ({
		id: `finding:gap-rules-issue-missing-issue-${i}`,
		findingId: `gap-rules-issue-missing-issue-${i}`,
		title: long(120),
		featureRef: `feat-${i}`,
		featureName: long(40),
		blocking: false,
		outcome: i % 5 ? 'fixed' : 'kept',
		reason: i % 5 ? '' : long(200),
		key: `element.finding.gap-rules-issue-missing-issue-${i}`,
		fingerprint: long(300),
		trail: { validation: i % 2 ? 'validated' : 'unvalidated', versionCount: 1 },
		landedAt: null,
		settledAs: null
	});
	const health = (n: number) => ({
		now: { score: 57, verdict: 'watch', total: 57, blocking: 13 },
		after: { score: 81, verdict: 'strong', total: 38, blocking: 13 },
		leaving: Array.from({ length: n }, (_, i) => ({ findingId: `gap-${i}`, title: long(120) })),
		expectedToLeave: [],
		undecided: 0,
		coming: []
	});
	const withFindings = (n: number) => {
		const s = fullSummary(30, 2000);
		return { ...s, findingChanges: { total: n, landed: 0, undecided: 0, entries: Array.from({ length: n }, (_, i) => finding(i)) }, coherence: { ...s.coherence, health: health(n) } };
	};

	it('counts them by outcome in short, and part "coherence" reads every one whole with Project health after', () => {
		const short = boundSummary(withFindings(60));
		expect(JSON.stringify(short).length).toBeLessThanOrEqual(SUMMARY_BUDGET);
		const changes = short.findingChanges as { total: number; byOutcome: Record<string, number>; read: string };
		expect(changes.total).toBe(60);
		expect(changes.byOutcome).toEqual({ fixed: 48, kept: 12 });
		expect(changes.read).toBe('get_evolution part="coherence"');
		const coherence = short.coherence as { health: { leaving: { total: number }; after: { score: number } } };
		expect(coherence.health.leaving.total).toBe(60);
		expect(coherence.health.after.score).toBe(81);
		const part = boundPart(withFindings(60), 'coherence', { offset: 50, limit: 20 }) as unknown as { settles: { total: number; entries: unknown[] }; coherence: { health: unknown } };
		expect(part.settles.total).toBe(60);
		expect(part.settles.entries).toHaveLength(10);
		expect(part.coherence.health).toEqual(health(60));
	});
});
