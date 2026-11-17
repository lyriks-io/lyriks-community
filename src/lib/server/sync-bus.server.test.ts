import { getServices } from '$composition/container.server';
import { describe, it, expect, vi } from 'vitest';

// No env → memory backend; also stops pg-database from needing a real connection.
vi.mock('$env/dynamic/private', () => ({ env: {} }));

import {
	publishAiActivity,
	publishSectionChange,
	subscribeAiActivity,
	subscribeSectionChanges,
	type ProjectAiActivity,
	type SectionChange
} from './sync-bus.server';
import { signalAiActivity } from './ai-activity.server';

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

	it('carries the AI activity apart from the section changes, so it reloads nothing', () => {
		const activities: ProjectAiActivity[] = [];
		const changes: SectionChange[] = [];
		const offA = subscribeAiActivity((a) => activities.push(a));
		const offC = subscribeSectionChanges((c) => changes.push(c));
		publishAiActivity({ projectId: 'p1', requestId: 'r1', act: 'read' });
		offA();
		offC();
		expect(activities).toEqual([{ projectId: 'p1', requestId: 'r1', act: 'read' }]);
		expect(changes).toHaveLength(0);
	});

	it('signals only the calls the MCP makes, once per request', () => {
		const activities: ProjectAiActivity[] = [];
		const off = subscribeAiActivity((a) => activities.push(a));
		const call = (headers: Record<string, string>) => ({ request: new Request('http://x/api/evolution', { headers }), locals: { services: getServices() } } as never);
		signalAiActivity(call({}), 'p1', ['r1'], 'read');
		signalAiActivity(call({ 'x-lyriks-actor': 'ai_client' }), 'p1', ['r1', 'r1', 'r2'], 'write');
		off();
		expect(activities).toEqual([
			{ projectId: 'p1', requestId: 'r1', act: 'write' },
			{ projectId: 'p1', requestId: 'r2', act: 'write' }
		]);
	});
});
