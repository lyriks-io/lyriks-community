import { describe, expect, it } from 'vitest';
import { activeAppTab, projectEntryFrom, projectIdOfPath, projectNavTabs } from './app-nav';

describe('app nav', () => {
	it('links the opened tabs to the current project, in the bar’s order', () => {
		expect(projectNavTabs('fac', ['evolutions', 'spec']).map((t) => t.href)).toEqual(['/projects/fac/spec', '/projects/fac/evolution']);
	});

	it('shows every tab of a project whose opened tabs are unknown, none without a project', () => {
		expect(projectNavTabs('fac', null).map((t) => t.id)).toEqual(['retro', 'spec', 'evolutions']);
		expect(projectNavTabs(null, ['spec'])).toEqual([]);
	});

	it('reads the tab of a path, sub-pages included', () => {
		expect(activeAppTab('/')).toBe('home');
		expect(activeAppTab('/projects/fac/retrospec')).toBe('retro');
		expect(activeAppTab('/projects/fac/spec/features/abc')).toBe('spec');
		expect(activeAppTab('/projects/fac/evolution')).toBe('evolutions');
		expect(activeAppTab('/projects/fac/drift')).toBe('drift');
		expect(activeAppTab('/projects/fac/foundation')).toBeNull();
		expect(activeAppTab('/settings')).toBeNull();
	});

	it('reads the project of a path', () => {
		expect(projectIdOfPath('/projects/a%20b/spec')).toBe('a b');
		expect(projectIdOfPath('/')).toBeNull();
	});

	it('opens Home limited to the project picked, from Home as from another project (criterion 11c7c8c8)', () => {
		expect(projectEntryFrom('/projects/fac/spec/glossary', 'pay')).toBe('/?project=pay');
		expect(projectEntryFrom('/', 'pay')).toBe('/?project=pay');
		expect(projectEntryFrom('/settings', 'fac')).toBe('/?project=fac');
	});

	it('goes nowhere when the reader is already inside the project picked', () => {
		expect(projectEntryFrom('/projects/fac/spec/glossary', 'fac')).toBeNull();
	});
});
