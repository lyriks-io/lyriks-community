import { describe, expect, it } from 'vitest';
import { throughBadge } from './through-request';

describe('an element validated through a landed request on the Specification 360°', () => {
	it('reads Validated through EVO-xxx with who approved the request and when, the key opening the request [criterion:ac-leaf-a6174f4b-8515-4ad9-8422-2bab9feab3e1]', () => {
		const badge = throughBadge('p 1', {
			requestId: 'e8aa92ee-db47',
			requestKey: 'EVO-002',
			approvedBy: [
				{ id: 'ada@company.test', name: 'Ada' },
				{ id: 'bob@company.test', name: 'Bob' }
			],
			at: '2026-11-20T10:00:00.000Z',
			fingerprint: 'f-1'
		});
		expect(badge).toEqual({ label: 'Validated through', key: 'EVO-002', href: '/projects/p%201/evolution?request=e8aa92ee-db47', detail: 'approved by Ada, Bob on Nov 20' });
	});
});
