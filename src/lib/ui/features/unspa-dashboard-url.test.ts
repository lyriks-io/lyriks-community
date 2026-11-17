import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: false, dev: false }));
vi.mock('$app/state', () => ({ page: { data: {} } }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

const { unspaActionElementPath } = await import('./unspa-dashboard-url');

describe('unspaActionElementPath', () => {
	it('opens a scenario or a parameter in its action card, on its surface', () => {
		expect(unspaActionElementPath('f1', 's1', { kind: 'scenario', id: 'sc1' })).toBe(
			'/features/f1?surface=s1&focus=scenario%3Asc1'
		);
		expect(unspaActionElementPath('f1', 's1', { kind: 'parameter', id: 'p1' })).toBe(
			'/features/f1?surface=s1&focus=parameter%3Ap1'
		);
	});

	it('opens a state, an event and a transition on their own tab', () => {
		expect(unspaActionElementPath('f1', 's1', { kind: 'state', path: 'room.status' })).toBe(
			'/features/f1?tab=states&focus=state%3Aroom.status'
		);
		expect(unspaActionElementPath('f1', 's1', { kind: 'event', name: 'room.booked' })).toBe(
			'/features/f1?tab=events&focus=event%3Aroom.booked'
		);
		expect(unspaActionElementPath('f1', 's1', { kind: 'transition', toSurfaceId: 's2' })).toBe(
			'/features/f1?tab=transitions&focus=transition%3As1%3As2'
		);
	});
});
