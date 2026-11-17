import { describe, expect, it } from 'vitest';
import { KNOWLEDGE_TABS, specTip, standingBand, versionLine } from './knowledge-bar';

describe('the band at the top of Knowledge says where the specification stands [criterion:8e942b12]', () => {
	it('calls a validated specification the reference', () => {
		expect(standingBand('validated', { validated: 40, total: 40 })).toEqual({
			pill: 'Validated',
			text: 'This specification is the reference. To change it, propose a change.',
			pct: 100
		});
	});

	it('says how far a draft went, and what is left to do', () => {
		expect(standingBand('draft', { validated: 12, total: 40 })).toEqual({
			pill: 'Draft · to validate',
			text: '12 of 40 elements validated. Review every element, then validate the specification.',
			pct: 30
		});
		expect(standingBand('draft', { validated: 0, total: 0 }).pct).toBe(0);
		expect(standingBand('draft', { validated: 1, total: 1 }).text).toMatch(/^1 of 1 element validated/);
	});

	it('says how far a draft went in its status tag', () => {
		expect(specTip('draft', { validated: 3, total: 10 })).toBe('Draft: 3 of 10 elements validated');
		expect(specTip('draft', { validated: 10, total: 10 })).toMatch(/definitive validation/);
		expect(specTip('validated', null)).toBe('Every element of the specification is validated');
	});

	it('gives the version and the last code check, and the count changed by hand', () => {
		const now = new Date('2026-11-04T12:00:00Z');
		const line = versionLine({ version: 'v1.1', checkedAt: '2026-10-29T10:00:00Z', changedByHand: 6 }, now);
		expect(line.text).toBe('v1.1 · code checked 29 Oct');
		expect(line.title).toBe('Reverse-Specification · code checked on 29 Oct');
		expect(line.byHand).toBe('6 changed by hand since');
		expect(versionLine({ version: 'v1.0', checkedAt: null, changedByHand: 0 }, now)).toEqual({ text: 'v1.0 · no code checked yet', title: 'The Reverse-Specifications of the product', byHand: null });
		expect(versionLine(null, now).text).toBe('Reverse-Specifications');
	});
});

describe('the tab bar of Knowledge lists its six chapters [action:60364635]', () => {
	it('names them in order, Technology & data opening on the Data map', () => {
		expect(KNOWLEDGE_TABS.map((t) => t.label)).toEqual(['Overview', 'Features', 'Users', 'Experience', 'Technology & data', 'Glossary']);
		expect(KNOWLEDGE_TABS.find((t) => t.id === 'tech')?.path).toBe('/tech/data-map');
	});
});
