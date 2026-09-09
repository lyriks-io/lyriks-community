import { describe, it, expect } from 'vitest';
import { SaveUsersDraftUseCase } from './save-users-draft';
import { createEmptyUsersDraft } from '$domain/users';
import type {
	ClockPort,
	TelemetryPort,
	UpstreamCapabilityProviderPort,
	UsersDraftRepositoryPort
} from '../ports';

const clock: ClockPort = { nowIso: () => '2026-07-19T00:00:00.000Z' };
const telemetry = { emit: () => {} } as unknown as TelemetryPort;

/** One role that grants nothing — so any capability the score sees is "uncovered". */
function draftWithBareRole() {
	const d = createEmptyUsersDraft('p1');
	d.roles = [{ id: 'role-a', name: 'Admin', description: '', permissions: [] } as unknown as (typeof d.roles)[number]];
	return d;
}

describe('SaveUsersDraftUseCase — scores the full capability universe', () => {
	it('counts feature/journey/surface capabilities (matching the coherence dimension), not just the section-local ones', async () => {
		const drafts = { save: async () => {}, load: async () => null } as unknown as UsersDraftRepositoryPort;
		// The upstream provider is the single seam for the capability universe: one
		// leaf feature and one dialog the matrix must cover.
		const upstream = {
			listCapabilityIds: async () => ['feat-x', 'surface:feat-x:dlg-confirm']
		} as unknown as UpstreamCapabilityProviderPort;

		const uc = new SaveUsersDraftUseCase(drafts, clock, telemetry, upstream);
		const res = await uc.execute(draftWithBareRole());

		// The derived capabilities are part of the coverage universe, so a role that
		// grants nothing is flagged for leaving them ungranted — proof the section
		// score sees the same capabilities the dashboard does.
		const totals = res.coherenceIssues.find((m) => /capabilities have no role granted/.test(m));
		expect(totals).toBeTruthy();
	});
});
