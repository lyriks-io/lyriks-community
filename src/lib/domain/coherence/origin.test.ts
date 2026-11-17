import { describe, expect, it } from 'vitest';
import { citesCode, gapOrigin, originLine, POINT_ORIGIN_LABEL } from './origin';

describe('where the problem of a point lies [criterion:c86ea441]', () => {
	it('reads a failing criterion as the product, the bookkeeping as the records, the rest as the specification', () => {
		expect(gapOrigin({ checkId: 'code.criteria-failing', detail: '' })).toBe('product');
		for (const check of ['code.drift', 'code.unproven', 'code.criteria-unverified', 'code.analysis-open', 'audit.audit-stale', 'audit.extracted-source-missing'])
			expect(gapOrigin({ checkId: check, detail: '' })).toBe('records');
		expect(gapOrigin({ checkId: 'audit.section-not-ready', detail: '' })).toBe('specification');
		expect(gapOrigin({ checkId: 'users.feature-reachable', detail: '' })).toBe('specification');
		expect(gapOrigin({ checkId: 'users.matrix-guards', detail: '' })).toBe('specification');
		expect(gapOrigin({ detail: '' })).toBe('specification');
	});

	it('reads an issue of the register that cites the code as the product', () => {
		expect(gapOrigin({ checkId: 'rules.open-issues', detail: 'Where the code says it: lyriks-platform:src/lib/a.ts:12.' })).toBe('product');
		expect(gapOrigin({ checkId: 'rules.open-issues', detail: 'Nobody decided what happens on a late payment.' })).toBe('specification');
		expect(citesCode('see src/routes/x/+server.ts:40')).toBe(true);
		expect(citesCode('A rule of the access matrix')).toBe(false);
	});

	it('opens the sheet on what the origin means, then what settles it', () => {
		expect(POINT_ORIGIN_LABEL.records).toBe("In Lyriks's records");
		expect(originLine('records', 'Ask your AI to run the coverage audit again')).toBe(
			"Nothing is known to be wrong in the product: Lyriks's own records are behind. Ask your AI to run the coverage audit again."
		);
		expect(originLine('specification')).toBe('Nothing is known to be wrong in the product: the specification does not settle this yet.');
		expect(originLine('product', 'fix the code, then record the new result.')).toBe(
			'Something is wrong in the product as it ships: the code was read or tested doing it. Fix the code, then record the new result.'
		);
	});
});
