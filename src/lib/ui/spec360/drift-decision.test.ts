import { describe, expect, it } from 'vitest';
import { applyRetrospecActs, type PersonRef, type RetrospecDocument } from '$domain/retrospec';
import { driftDecisionOf } from './drift-decision';

const me: PersonRef = { id: 'me@x.io', name: 'Me' };
const ctx = { actor: me, now: '2026-10-27T10:00:00.000Z' };

function published(): RetrospecDocument {
	const out = applyRetrospecActs({ version: 1, runs: [], comments: {} }, [{ op: 'start_review', total: 1 }, { op: 'publish', baselineId: 'b1' }], ctx);
	if (!out.ok) throw new Error(out.reason);
	return out.doc;
}

describe('the decision a code change reads with', () => {
	it('reads a keep made a moment ago on this very code, and none for code that moved since', () => {
		const code = 'src/a.ts\t3\tconst x = 1';
		const kept = applyRetrospecActs(published(), [{ op: 'keep_drift', key: 'f1|a1|rule:r1', code, baselineId: null }], ctx);
		if (!kept.ok) throw new Error(kept.reason);
		expect(driftDecisionOf(kept.doc, { key: 'f1|a1|rule:r1', code })).toMatchObject({ decision: 'kept' });
		expect(driftDecisionOf(kept.doc, { key: 'f1|a1|rule:r1', code: 'src/a.ts\t3\tconst x = 2' })).toBeNull();
		expect(driftDecisionOf(published(), { key: 'f1|a1|rule:r1', code })).toBeNull();
	});
});
