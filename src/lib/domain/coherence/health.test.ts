import { describe, expect, it } from 'vitest';
import type { Gap } from './draft';
import { auditPoints, codePoints, featureCodeOf, healthReading, projectHealth, type HealthFeatureCode } from './health';

const gap = (id: string, fields: Partial<Gap> = {}): Gap => ({
	id,
	severity: 'medium',
	title: `Gap ${id}`,
	detail: 'detail',
	sourceStep: 'rules',
	blocking: false,
	...fields
});

const feature = (fields: Partial<HealthFeatureCode> = {}): HealthFeatureCode => ({
	featureId: 'f1',
	name: 'Slide the tiles',
	locatedActions: 0,
	provenActions: 0,
	criteria: null,
	drifted: false,
	...fields
});

const empty = { gaps: [], audit: [], codeLinked: false, features: [], openAnalyses: [] };

describe('project health (criteria 799e1f5b, 08324382)', () => {
	it('reads 100 when nothing is open', () => {
		expect(projectHealth(empty).headline).toMatchObject({ score: 100, verdict: 'strong', total: 0, blocking: 0 });
	});

	it('an analysis left open blocks, whether code is linked or not', () => {
		const health = projectHealth({ ...empty, openAnalyses: [{ featureId: 'f1', name: 'Slide the tiles', untraced: 2 }] });
		expect(health.headline.blocking).toBe(1);
		expect(health.headline.score).toBeLessThan(100);
		expect(health.points[0]).toMatchObject({ blocking: true, severity: 'high', featureRef: 'f1', checkId: 'code.analysis-open' });
		expect(health.points[0].detail).toContain('2 elements still have no span');
	});

	it('code not proven and criteria without result cost nothing until code is linked', () => {
		const facts = { ...empty, features: [feature({ locatedActions: 4, provenActions: 1, criteria: { total: 3, verified: 1, failing: 0 } })] };
		expect(codePoints(facts)).toEqual([]);
		const linked = codePoints({ ...facts, codeLinked: true });
		expect(linked.map((p) => [p.checkId, p.severity])).toEqual([
			['code.unproven', 'low'],
			['code.criteria-unverified', 'low']
		]);
		expect(linked[0].detail).toContain('3 of 4 located actions');
	});

	it('drift weighs medium and a failing criterion high, once code is linked', () => {
		const points = codePoints({ ...empty, codeLinked: true, features: [feature({ drifted: true, criteria: { total: 2, verified: 1, failing: 1 } })] });
		expect(points.map((p) => [p.checkId, p.severity])).toEqual([
			['code.drift', 'medium'],
			['code.criteria-failing', 'high']
		]);
	});

	it('an audit issue keeps its severity, and the coherence check of the audit is not counted twice', () => {
		const points = auditPoints([
			{ code: 'extracted-source-missing', severity: 'blocking', message: '3 features cite no source', path: 'features' },
			{ code: 'source-unreachable', severity: 'warning', message: 'A source nobody can open', path: 'documents.sources.s1' },
			{ code: 'coherence-not-ready', severity: 'blocking', message: 'Coherence is critical', path: 'coherence' }
		]);
		expect(points.map((p) => [p.checkId, p.severity, p.blocking])).toEqual([
			['audit.extracted-source-missing', 'high', true],
			['audit.source-unreachable', 'medium', false]
		]);
	});

	it('every kind of point weighs in the one score, coherence gaps included', () => {
		const onlyGaps = projectHealth({ ...empty, gaps: [gap('g1')] });
		const all = projectHealth({
			...empty,
			gaps: [gap('g1')],
			audit: [{ code: 'source-empty', severity: 'warning', message: 'An empty source', path: 'documents' }],
			codeLinked: true,
			features: [feature({ locatedActions: 2, provenActions: 0 })]
		});
		expect(all.headline.total).toBe(3);
		expect(all.headline.score).toBeLessThan(onlyGaps.headline.score);
	});
});

describe('featureCodeOf', () => {
	const located = { elements: [{ kind: 'action', location: { file: 'a.ts' } }] };
	it('counts the actions located by themselves and the proven ones', () => {
		const code = featureCodeOf(
			{
				featureId: 'f1',
				found: 5,
				actions: { a: { ...located, provenAt: '2026-11-02' }, b: located, c: { elements: [{ kind: 'rule', location: { file: 'r.ts' } }] } },
				updatedAt: '2026-11-02T10:00:00Z',
				specUpdatedAt: '2026-11-01T10:00:00Z'
			},
			'Slide'
		);
		expect(code).toMatchObject({ locatedActions: 2, provenActions: 1, drifted: false, name: 'Slide' });
	});

	it('reads drift when the spec moved after the last sync, never without code found', () => {
		const row = { featureId: 'f1', found: 1, updatedAt: '2026-11-01T10:00:00Z', specUpdatedAt: '2026-11-02T10:00:00Z' };
		expect(featureCodeOf(row, 'x').drifted).toBe(true);
		expect(featureCodeOf({ ...row, found: 0 }, 'x').drifted).toBe(false);
	});
});

describe('healthReading (criterion 7ae9b322)', () => {
	it('carries the score, the word, the counts and the first fifty points with their total', () => {
		const gaps = Array.from({ length: 60 }, (_, i) => gap(`g${i}`, { featureRef: i === 0 ? 'f1' : undefined }));
		const reading = healthReading(projectHealth({ ...empty, gaps }));
		expect(reading.points).toHaveLength(50);
		expect(reading.pointsTotal).toBe(60);
		expect(reading.points[0]).toEqual({ id: 'g0', title: 'Gap g0', severity: 'medium', blocking: false, kindLabel: 'Coherence', featureRef: 'f1' });
		expect(reading).toMatchObject({ total: 60, codeLinked: false });
		expect(typeof reading.score).toBe('number');
	});
});
