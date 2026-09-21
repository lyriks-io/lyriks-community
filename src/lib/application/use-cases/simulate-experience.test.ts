import { describe, expect, it } from 'vitest';
import { SimulateExperienceUseCase, UnknownPersonaError } from './simulate-experience';
import type { LoadExperienceDraftUseCase } from './load-experience-draft';
import type { LoadUsersDraftUseCase } from './load-users-draft';
import { createEmptyExperienceDraft, emptyWiring } from '$domain/experience';

const experienceWithOneGatedButton = () => {
	const draft = createEmptyExperienceDraft('p1');
	draft.builder.nodes = {
		'scr-members': { id: 'scr-members', kind: 'group', label: 'Members', surfaceId: 'scr-members', childIds: ['btn-suspend'], direction: 'col' },
		'btn-suspend': {
			id: 'btn-suspend',
			kind: 'element',
			elementKind: 'button',
			label: 'Suspend',
			surfaceId: 'scr-members',
			wiring: { ...emptyWiring(), gate: { personaIds: ['role-admin'], mode: 'enabled', allow: true } }
		}
	} as unknown as typeof draft.builder.nodes;
	draft.builder.screenRoots = { 'scr-members': 'scr-members' } as Record<string, string>;
	draft.builder.entryScreenId = 'scr-members';
	return draft;
};

const useCase = (roles: { id: string; name: string }[], draft = experienceWithOneGatedButton()) =>
	new SimulateExperienceUseCase(
		{ execute: async () => draft } as unknown as LoadExperienceDraftUseCase,
		{ execute: async () => ({ roles }) } as unknown as LoadUsersDraftUseCase
	);

describe('SimulateExperienceUseCase', () => {
	it('refuses a persona the project never declared, and names the roles it has', async () => {
		const uc = useCase([{ id: 'role-admin', name: 'Administrator' }]);
		await expect(uc.execute('p1', { personaId: 'ceci-nexiste-pas', actions: [] })).rejects.toBeInstanceOf(
			UnknownPersonaError
		);
		await expect(uc.execute('p1', { personaId: 'ceci-nexiste-pas', actions: [] })).rejects.toThrow(
			/role-admin \(Administrator\)/
		);
	});

	it('runs as a declared role, and an author run needs no persona at all', async () => {
		const uc = useCase([{ id: 'role-admin', name: 'Administrator' }, { id: 'role-member', name: 'Member' }]);
		const run = await uc.execute('p1', {
			personaId: 'role-member',
			actions: [{ nodeId: 'btn-suspend', trigger: 'click', expectError: true }]
		});
		// The gate refuses the member: a proven negative path, so the run is green.
		expect(run.ok).toBe(true);
		expect(run.actions[0].expectedErrorMet).toBe(true);
		expect(run.persona).toEqual({ id: 'role-member', gatedElementsTouched: 1 });
		expect(await uc.execute('p1', { actions: [] })).toMatchObject({ persona: { id: null } });
	});

	it('says a persona run proved nothing about permissions when no element it touched carries a gate', async () => {
		const draft = experienceWithOneGatedButton();
		const button = draft.builder.nodes['btn-suspend'];
		if (button.kind === 'element') button.wiring = emptyWiring();
		const uc = useCase([{ id: 'role-member', name: 'Member' }], draft);
		const run = await uc.execute('p1', {
			personaId: 'role-member',
			actions: [{ nodeId: 'btn-suspend', trigger: 'click' }]
		});
		expect(run.persona.gatedElementsTouched).toBe(0);
		expect(run.warnings.map((w) => w.message).join('\n')).toContain('proves nothing about permissions');
	});
});
