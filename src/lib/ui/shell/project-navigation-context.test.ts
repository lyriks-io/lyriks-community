import { describe, expect, it } from 'vitest';
import { EMPTY_APP_CHROME } from '$lib/shared/app-chrome';
import { navigationContextScope, projectNavigationContext, type NavigationContextReading } from './project-navigation-context';
const reading: NavigationContextReading = { scope: 'ana:workspace-a', project: { id: 'p', name: 'Known project' }, chrome: EMPTY_APP_CHROME, requestedProjectId: 'p', addressedProjectId: 'p', unavailable: false, denied: false };
const confirmed = projectNavigationContext(null, reading)!;
describe('retained navigation context never grants access [criterion:f090189e]', () => {
	it('keeps only previously confirmed metadata during an availability failure', () => {
		expect(projectNavigationContext(confirmed, { ...reading, project: null, unavailable: true })).toBe(confirmed);
	});
	it('a fresh page has no unverified project name', () => {
		expect(projectNavigationContext(null, { ...reading, project: null, unavailable: true })).toBeNull();
	});
	it.each([
		{ scope: 'ben:workspace-a' }, { scope: 'ana:workspace-b' }, { scope: null }, { requestedProjectId: 'other' }, { addressedProjectId: 'other' }, { denied: true }
	])('clears metadata when its identity or permission context changes: %o', (change) => {
		expect(projectNavigationContext(confirmed, { ...reading, project: null, unavailable: true, ...change })).toBeNull();
	});
	it('a definite missing project clears the previous one, while successful recovery replaces it', () => {
		expect(projectNavigationContext(confirmed, { ...reading, project: null })).toBeNull();
		expect(projectNavigationContext(confirmed, { ...reading, project: { id: 'p', name: 'Freshly read name' } })?.project.name).toBe('Freshly read name');
	});
});

describe('navigation snapshots exclude content and follow the real identity boundary', () => {
	it('drops notification bodies, request texts, live messages and specification details on unavailability', () => {
		const privateChrome = { ...EMPTY_APP_CHROME,
			notifications: [{ id: 'private-notice', body: [{ text: 'Private notification body' }] }],
			evolutions: [{ t: 'Private request title', href: '/private' }], live: [{ label: 'Private run message', href: '/private' }],
			spec: { version: 'Private specification value' }, openEvolutions: 2, drift: { pending: 3 }
		} as unknown as typeof EMPTY_APP_CHROME;
		const saved = projectNavigationContext(null, { ...reading, chrome: privateChrome });
		const held = projectNavigationContext(saved, { ...reading, project: null, unavailable: true });
		expect(held?.chrome.openEvolutions).toBe(2); expect(held?.chrome.drift?.pending).toBe(3);
		const serialized = JSON.stringify(held);
		for (const content of ['Private notification body', 'Private request title', 'Private run message', 'Private specification value']) expect(serialized).not.toContain(content);
	});
});

it('same email with a different session or requested workspace cannot reuse the context', () => {
	const identity = { authRequired: true, isAuthenticated: true, email: 'ana@example.test', sessionBoundary: 'session-a', workspaceId: 'workspace-a' };
	const firstScope = navigationContextScope(identity);
	const saved = projectNavigationContext(null, { ...reading, scope: firstScope });
	for (const scope of [navigationContextScope({ ...identity, sessionBoundary: 'session-b' }), navigationContextScope({ ...identity, workspaceId: 'workspace-b' }), navigationContextScope({ ...identity, isAuthenticated: false })]) {
		expect(projectNavigationContext(saved, { ...reading, project: null, unavailable: true, scope })).toBeNull();
	}
});
