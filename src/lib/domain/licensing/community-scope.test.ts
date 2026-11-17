import { describe, expect, it } from 'vitest';
import { activeProjectAccess, defaultActiveProject, evolutionAccess, lockedSentence, projectCreation } from './community-scope';

describe('the Community scope (EVO-001)', () => {
	it('refuses a second project on Community only, naming Solo Builder', () => {
		const refused = projectCreation('community', 1);
		expect(refused).toMatchObject({ ok: false, plan: 'solo_builder' });
		expect(!refused.ok && refused.reason).toContain('Community holds one project');
		expect(projectCreation('community', 0).ok).toBe(true);
		expect(projectCreation('enterprise', 5).ok).toBe(true);
		expect(projectCreation(undefined, 5).ok).toBe(true);
	});

	it('locks every Evolution operation on Community, naming Solo Builder', () => {
		expect(evolutionAccess('community')).toMatchObject({ ok: false, plan: 'solo_builder' });
		expect(evolutionAccess('enterprise').ok).toBe(true);
	});

	it('names the plan that opens each locked capability', () => {
		expect(lockedSentence('sharing')).toContain('Team');
		expect(lockedSentence('solver')).toContain('Enterprise');
	});

	it('holds an inactive project shut on a Community installation moved down from a paid plan', () => {
		const input = { projectId: 'b', activeProjectId: 'a', projectCount: 3 };
		expect(activeProjectAccess('community', input)).toMatchObject({ ok: false });
		expect(activeProjectAccess('community', { ...input, projectId: 'a' }).ok).toBe(true);
		expect(activeProjectAccess('community', { ...input, projectCount: 1 }).ok).toBe(true);
		expect(activeProjectAccess('enterprise', input).ok).toBe(true);
	});

	it('takes the project saved last as active when none was chosen', () => {
		expect(defaultActiveProject([])).toBeNull();
		expect(
			defaultActiveProject([
				{ id: 'old', lastSavedAt: '2026-01-01T00:00:00Z' },
				{ id: 'new', lastSavedAt: '2026-11-01T00:00:00Z' },
				{ id: 'never', lastSavedAt: null }
			])
		).toBe('new');
	});
});
