import { describe, expect, it } from 'vitest';
import { findRequestByRef, unresolvedRequestReason } from './request-ref';

const requests = [
	{ id: 'b8456fd3-e4ce-4d2a-9a51-000000000001' },
	{ id: 'b8456fd3-aaaa-4d2a-9a51-000000000002' },
	{ id: '47804bbb-1f31-4576-a382-85934a44a15a' }
];

describe('a request is named the way the board shortens it', () => {
	it('finds the exact id', () => {
		const found = findRequestByRef(requests, '47804bbb-1f31-4576-a382-85934a44a15a');
		expect(found.kind === 'found' && found.request.id).toBe('47804bbb-1f31-4576-a382-85934a44a15a');
	});

	it('finds a unique eight-character prefix, whatever its case', () => {
		const found = findRequestByRef(requests, '47804BBB');
		expect(found.kind === 'found' && found.request.id).toBe('47804bbb-1f31-4576-a382-85934a44a15a');
	});

	it('names the candidates of an ambiguous prefix instead of guessing', () => {
		const found = findRequestByRef(requests, 'b8456fd3');
		expect(found.kind).toBe('ambiguous');
		expect(unresolvedRequestReason('b8456fd3', found)).toContain('b8456fd3-e4ce-4d2a-9a51-000000000001');
	});

	it('does not match a prefix too short to be deliberate', () => {
		expect(findRequestByRef(requests, '478').kind).toBe('none');
	});

	it('says an unknown id does not exist', () => {
		const found = findRequestByRef(requests, 'ffffffff');
		expect(found.kind).toBe('none');
		expect(unresolvedRequestReason('ffffffff', found)).toBe('Request "ffffffff" does not exist on this project.');
	});
});
