import { describe, expect, it, vi } from 'vitest';
import { createEmptyArchitectureDraft } from '$domain/architecture';
import { createEmptyDataDraft } from '$domain/data';
import { createEmptyDocumentsDraft } from '$domain/documents';
import { createEvolutionRequest } from '$domain/evolution';
import { createEmptyFeaturesDraft } from '$domain/features';
import { createEmptyDefinitionDraft, createEmptyIdentityDraft } from '$domain/foundation';
import { createEmptyGlossaryDraft } from '$domain/glossary';
import { createEmptyRulesDraft } from '$domain/rules';
import { createEmptyUsersDraft } from '$domain/users';
import { loadEvolutionTab } from './evolution-tab.server';
import { loadEvolutionView } from './evolution-view.server';

function fixture() {
	const requests = [
		createEvolutionRequest({ id: 'request-1', title: 'One', stage: 'specification', leafIds: ['feat-a'] }),
		createEvolutionRequest({ id: 'request-2', title: 'Two', stage: 'specification', leafIds: ['feat-b'] })
	];
	const execute = <T>(value: T) => ({ execute: async () => value });
	const readFeature = vi.fn(async () => null);
	const services = {
		currentSession: () => ({ email: 'reader@team.test' }),
		resolveActiveMemberName: execute('Reader'),
		loadEvolutionDraft: execute({ projectId: 'p', requests, lastSavedAt: null }),
		loadFeaturesDraft: execute(createEmptyFeaturesDraft('p')),
		loadDocumentRegister: execute(createEmptyDocumentsDraft('p')),
		loadFoundationDraft: {
			loadIdentity: async () => createEmptyIdentityDraft('p'),
			execute: async () => ({ definition: createEmptyDefinitionDraft('p') })
		},
		sectionDocuments: { currentRevision: async () => 1 },
		loadUsersDraft: execute(createEmptyUsersDraft('p')),
		loadDataDraft: execute(createEmptyDataDraft('p')),
		loadGlossaryDraft: execute(createEmptyGlossaryDraft('p')),
		loadArchitectureDraft: execute(createEmptyArchitectureDraft('p')),
		implementationCoverage: { get: async () => ({}) },
		featureAdvice: { get: async () => [] },
		loadRulesDraft: execute(createEmptyRulesDraft('p')),
		behaviorPort: { readFeature },
		workspaces: { listForCaller: async () => [] },
		loadSpecLanguage: execute({ generated: 'en' }),
		loadAssistantSettings: execute({ enabled: false, keyHint: null })
	};
	return { services, readFeature };
}

const cookies = { get: () => undefined } as never;

describe('Evolution readings', () => {
	it('reads every request by default, the way an AI client reads the board', async () => {
		const { services, readFeature } = fixture();
		const view = await loadEvolutionView(services as never, 'p');
		expect(Object.keys(view.readings).sort()).toEqual(['request-1', 'request-2']);
		expect(readFeature.mock.calls.map((call) => (call as unknown[])[1]).sort()).toEqual(['feat-a', 'feat-b']);
	});

	it("reads only the open request's features on its page, and none on the board or in a comparison", async () => {
		const { services, readFeature } = fixture();
		await loadEvolutionTab(services as never, 'p', new URL('http://x/?request=request-1'), cookies);
		expect(readFeature.mock.calls.map((call) => (call as unknown[])[1])).toEqual(['feat-a']);
		readFeature.mockClear();
		await loadEvolutionTab(services as never, 'p', new URL('http://x/'), cookies);
		await loadEvolutionTab(services as never, 'p', new URL('http://x/?concurrent=request-1,request-2'), cookies);
		expect(readFeature).not.toHaveBeenCalled();
	});
});
