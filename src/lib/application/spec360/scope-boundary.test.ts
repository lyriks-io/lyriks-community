import { describe, expect, it } from 'vitest';
import { createEmptyScopeDraft, createScopeCapability, type ProjectScopeDraft } from '$domain/scope';
import { OTHER_GROUP, scopeBoundaryView } from './scope-boundary';

function scope(overrides: Partial<ProjectScopeDraft> = {}): ProjectScopeDraft {
	return { ...createEmptyScopeDraft('p1'), mode: 'selected_scope', ...overrides };
}

const app = 'Outside the application-only specification requested by the owner.';

describe('scopeBoundaryView', () => {
	it('reads what is covered, then what is left out by group, the largest first and Other last [criterion:3b04797c]', () => {
		const view = scopeBoundaryView(
			scope({
				boundary: {
					covers: 'The Lyriks application, Community and Enterprise.',
					decision: 'The owner asked to specify the application only.',
					decidedAt: '2026-11-12',
					groups: [{ name: 'Releasing and distributing', summary: 'building the images, issuing licence keys' }],
					approval: null
				},
				capabilities: [
					createScopeCapability('c1', { name: 'Read a feature', disposition: 'included' }),
					createScopeCapability('c2', { name: 'Issue licence keys', disposition: 'excluded', rationale: app, group: 'Releasing and distributing' }),
					createScopeCapability('c3', { name: 'Prove a release', disposition: 'excluded', rationale: app, group: 'Releasing and distributing' }),
					createScopeCapability('c4', { name: 'Voice input', disposition: 'deferred', rationale: 'Next release.' }),
					createScopeCapability('c5', { name: 'Read the website', disposition: 'excluded', rationale: app, group: 'The public website' })
				]
			})
		);
		expect(view).not.toBeNull();
		expect(view?.covers).toBe('The Lyriks application, Community and Enterprise.');
		expect(view?.coveredCount).toBe(1);
		expect(view?.leftOutCount).toBe(4);
		expect(view?.leftOut.map((g) => [g.name, g.items.length])).toEqual([
			['Releasing and distributing', 2],
			['The public website', 1],
			[OTHER_GROUP, 1]
		]);
		expect(view?.leftOut[0].summary).toBe('building the images, issuing licence keys');
		expect(view?.decision).toBe('The owner asked to specify the application only.');
		expect(view?.decidedAt).toBe('2026-11-12');
		expect(view?.approval).toEqual({ state: 'none', by: '', at: '' });
		expect(view?.shown).toMatch(/^fnv1a-/);
	});

	it('reads a reason the whole group shares once, and marks a deferred capability later [criterion:3b04797c]', () => {
		const view = scopeBoundaryView(
			scope({
				capabilities: [
					createScopeCapability('c2', { name: 'Issue licence keys', disposition: 'excluded', rationale: app, group: 'Releasing' }),
					createScopeCapability('c3', { name: 'Prove a release', disposition: 'excluded', rationale: app, group: 'Releasing' }),
					createScopeCapability('c4', { name: 'Voice input', disposition: 'deferred', rationale: 'Next release.', group: 'Later' }),
					createScopeCapability('c6', { name: 'Dictate', disposition: 'excluded', rationale: 'Not wanted.', group: 'Later' })
				]
			})
		);
		const [later, releasing] = [...(view?.leftOut ?? [])].sort((a, b) => a.name.localeCompare(b.name));
		expect(releasing.sharedReason).toBe(app);
		expect(releasing.items.every((i) => i.reason === '')).toBe(true);
		expect(later.sharedReason).toBeNull();
		expect(later.items).toEqual([
			{ id: 'c4', name: 'Voice input', later: true, reason: 'Next release.' },
			{ id: 'c6', name: 'Dictate', later: false, reason: 'Not wanted.' }
		]);
	});

	it('leaves the frame out while nothing is classified [criterion:9424a65d]', () => {
		expect(scopeBoundaryView(scope({ mode: 'unclassified' }))).toBeNull();
	});

	it('says a full product leaves nothing out [criterion:9424a65d]', () => {
		const view = scopeBoundaryView(
			scope({
				mode: 'full_product',
				capabilities: [createScopeCapability('c1', { name: 'Send a message', disposition: 'included' })]
			})
		);
		expect(view?.fullProduct).toBe(true);
		expect(view?.leftOut).toEqual([]);
		expect(view?.coveredCount).toBe(1);
		expect(view?.approval).toBeNull();
	});
});
