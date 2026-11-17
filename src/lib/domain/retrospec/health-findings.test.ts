import { describe, expect, it } from 'vitest';
import type { Gap } from '../coherence';
import { healthFindings, noticedFindings, type Finding } from './findings';

const gap = (id: string, fields: Partial<Gap> = {}): Gap => ({
	id,
	severity: 'medium',
	title: `Gap ${id}`,
	detail: `Why ${id}`,
	sourceStep: 'rules',
	blocking: false,
	...fields
});

describe('healthFindings (criterion 4189e074)', () => {
	it('lists non-blocking points too, the ones that cost the health most first', () => {
		const list = healthFindings([gap('low', { severity: 'low' }), gap('high', { severity: 'high' }), gap('mid')]);
		expect(list.map((f) => f.id)).toEqual(['point:high', 'point:mid', 'point:low']);
		expect(list[0]).toMatchObject({ tone: 'major', gapIds: ['high'], where: 'Other point to review' });
		expect(list[2].tone).toBe('minor');
	});

	it('keeps the final check reading for a blocking coherence gap', () => {
		const [first] = healthFindings([gap('b1', { blocking: true, title: 'Two rules contradict' })]);
		expect(first).toMatchObject({ id: 'check:b1', unconfirmed: true, where: 'Could not be confirmed' });
	});

	it('reads a blocking code point as itself, says who says so and what it costs', () => {
		const [point] = healthFindings([
			gap('code:analysis-open:f1', {
				blocking: true,
				severity: 'high',
				provenance: 'detected',
				checkId: 'code.analysis-open',
				kindLabel: 'Code',
				featureRef: 'f1',
				title: 'Analysis not finalized: Slide',
				action: 'Record the missing spans, then finalize the analysis'
			})
		]);
		expect(point).toMatchObject({ id: 'point:code:analysis-open:f1', blocking: true, featureId: 'f1', where: 'Not confirmed by the code', tone: 'major' });
		expect(point.sheet.kicker).toBe('NOT CONFIRMED BY THE CODE · HIGH · BLOCKS THE PROJECT HEALTH');
		const from = point.sheet.sections.find((s) => s.heading === 'WHERE IT COMES FROM');
		expect(from?.list?.[0]).toEqual({ k: 'Said by', v: 'Detected by Lyriks' });
		expect(from?.list?.[1].v).toMatch(/^Costs the project health \d/);
		expect(point.sheet.sections.find((s) => s.heading === 'WHAT YOU CAN DO')?.text).toBe('Record the missing spans, then finalize the analysis');
	});
});

describe('What Lyriks noticed lists every point once [criterion:4189e074]', () => {
	const sheet = { kicker: '', title: '', sections: [] };
	const issue = (id: string): Finding => ({
		id: `issue:${id}`,
		tone: 'minor',
		text: `Issue ${id}`,
		where: 'Use my own domain',
		kind: { label: 'Ambiguity', meaning: 'm' },
		sheet,
		decision: { issueId: id, question: 'q' },
		gapIds: [`gap-rules-issue-ambiguity-${id}`]
	});
	const computed: Finding = { id: 'computed:orphan-tables', tone: 'minor', text: 'tables', where: 'Data', kind: { label: 'Table related to nothing', meaning: 'm' }, sheet };

	it('reads an issue Project health also counts once, as the issue, where its weight places it', () => {
		const health = healthFindings([gap('gap-rules-issue-ambiguity-a', { severity: 'high' }), gap('code-1'), gap('gap-rules-issue-ambiguity-b', { severity: 'low' })]);
		const list = noticedFindings(health, [issue('a'), issue('b'), issue('c'), computed]);
		expect(list.map((f) => f.id)).toEqual(['issue:a', 'point:code-1', 'issue:b', 'issue:c', 'computed:orphan-tables']);
		// Every gap id is carried by one point only, so a request that settles it marks one line.
		const ids = list.flatMap((f) => f.gapIds ?? []);
		expect(new Set(ids).size).toBe(ids.length);
	});
});
