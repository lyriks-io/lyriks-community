import { describe, expect, it } from 'vitest';
import { inferKind } from './incoherence';

describe('inferKind', () => {
	it('does not classify a missing official reference as a workflow action', () => {
		expect(
			inferKind({
				id: 'gap-architecture-refs',
				severity: 'low',
				title: '6 tech choices without an official reference',
				detail: '',
				sourceStep: 'architecture',
				blocking: false
			})
		).toBe('dangling');
	});

	it('honors the explicit kind emitted by deterministic checkers', () => {
		expect(
			inferKind({
				id: 'opaque-engine-id',
				kind: 'missing',
				severity: 'high',
				title: 'Opaque finding',
				detail: '',
				sourceStep: 'features',
				blocking: true
			})
		).toBe('missing');
	});
});
