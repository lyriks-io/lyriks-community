import { describe, it, expect, vi } from 'vitest';

// No env → memory backend; also stops pg-database from needing a real connection.
vi.mock('$env/dynamic/private', () => ({ env: {} }));

import { publishSectionChange, subscribeSectionChanges, type SectionChange } from './sync-bus.server';

describe('sync-bus (memory backend)', () => {
	it('delivers published changes to subscribers', () => {
		const received: SectionChange[] = [];
		const off = subscribeSectionChanges((c) => received.push(c));
		publishSectionChange({ projectId: 'p1', section: 'foundation', origin: 'tab-a' });
		off();
		expect(received).toEqual([{ projectId: 'p1', section: 'foundation', origin: 'tab-a' }]);
	});

	it('stops delivering after unsubscribe', () => {
		const received: SectionChange[] = [];
		const off = subscribeSectionChanges((c) => received.push(c));
		off();
		publishSectionChange({ projectId: 'p1', section: 'users', origin: null });
		expect(received).toHaveLength(0);
	});

	it('fans out to multiple subscribers', () => {
		let a = 0;
		let b = 0;
		const offA = subscribeSectionChanges(() => (a += 1));
		const offB = subscribeSectionChanges(() => (b += 1));
		publishSectionChange({ projectId: 'p2', section: 'data', origin: null });
		offA();
		offB();
		expect([a, b]).toEqual([1, 1]);
	});
});
