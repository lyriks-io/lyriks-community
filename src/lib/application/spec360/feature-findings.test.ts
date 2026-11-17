import { describe, expect, it } from 'vitest';
import type { Gap } from '$domain/coherence';
import { finalCheckFindings, type Finding } from '$domain/retrospec';
import { findingsNamingFeature } from './feature-findings';

const unconfirmed = (subject: string, more: Partial<Gap> = {}): Gap =>
	({
		id: `proven-${subject}`,
		checkId: 'behavior.model-check',
		severity: 'high',
		blocking: true,
		sourceStep: 'features',
		subject,
		title: 'The system shall always ensure that While a Link exists, the system shall ensure that it has an address..',
		detail: 'Given nothing has happened yet, when Shorten, then it no longer holds.',
		...more
	}) as Gap;

const plain = (id: string): Finding => ({ id, tone: 'minor', text: id, where: 'Features', kind: { label: 'Features', meaning: 'm' }, sheet: { kicker: '', title: id, sections: [] } });

describe('findingsNamingFeature', () => {
	const gaps = [unconfirmed('Shorten a link'), unconfirmed('Manage links'), unconfirmed('Other', { id: 'g-ref', title: 'A screen is unreachable', checkId: 'x', featureRef: 'f-short' })];
	const noticed = [plain('issue:i1'), plain('issue:i2'), ...finalCheckFindings(gaps), plain('computed:features-without-behavior'), plain('computed:orphan-tables')];

	it('keeps the issues related to the feature, the final check points about it and the list of bare features it is in', () => {
		const mine = findingsNamingFeature({
			noticed,
			feature: { id: 'f-short', name: 'Shorten a link' },
			issues: [
				{ id: 'i1', relatedFeatureId: 'f-short' },
				{ id: 'i2', relatedFeatureId: 'f-other' }
			],
			gaps,
			authored: false
		});
		expect(mine.map((f) => f.id)).toEqual(['issue:i1', noticed[2].id, 'check:g-ref', 'computed:features-without-behavior']);
		// The point reads as it does on At a glance: one point for every feature it holds in.
		expect(mine[1].text).toContain('(2 features)');
	});

	it('keeps nothing for a feature nothing names', () => {
		expect(findingsNamingFeature({ noticed, feature: { id: 'f-calm', name: 'Calm' }, issues: [], gaps, authored: true })).toEqual([]);
	});

	it('names a feature by its id first: a gap tied to another feature never matches by name', () => {
		const tied = [unconfirmed('Shorten a link', { id: 'g-tied', title: 'Tied elsewhere', checkId: 'x', featureRef: 'f-elsewhere' })];
		expect(findingsNamingFeature({ noticed: finalCheckFindings(tied), feature: { id: 'f-short', name: 'Shorten a link' }, issues: [], gaps: tied, authored: true })).toEqual([]);
	});
});
