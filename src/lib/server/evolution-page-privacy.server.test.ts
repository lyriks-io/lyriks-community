import { describe, expect, it } from 'vitest';
import { createEmptyArchitectureDraft } from '$domain/architecture';
import { createEmptyDataDraft } from '$domain/data';
import { createEmptyDocumentsDraft } from '$domain/documents';
import { createEvolutionRequest, type FieldThreadMessage } from '$domain/evolution';
import { createEmptyFeaturesDraft } from '$domain/features';
import { createEmptyDefinitionDraft, createEmptyIdentityDraft } from '$domain/foundation';
import { createEmptyGlossaryDraft } from '$domain/glossary';
import { createEmptyRulesDraft } from '$domain/rules';
import { createEmptyUsersDraft } from '$domain/users';
import { loadEvolutionTab } from './evolution-tab.server';

const reader = 'reader@team.test';
const other = 'other@team.test';
const message = (id: string, privateTo?: string): FieldThreadMessage => ({
	id, body: id, author: privateTo ?? other, authorKind: 'person',
	postedAt: '2026-11-13T00:00:00.000Z', ...(privateTo ? { privateTo } : {})
});

function fixture() {
	const request = createEvolutionRequest({
		id: 'request-1', title: 'A shared change', stage: 'specification',
		fieldThreads: [
			{
				id: 'mixed', key: '00-need.situation', state: 'open',
				messages: [message('public-comment'), message('own-question', reader), message('other-secret', other)],
				changeValue: null, changedBy: null, changedAt: null
			},
			{
				id: 'other-only', key: '00-need.objective', state: 'open',
				messages: [message('another-secret', other)],
				changeValue: null, changedBy: null, changedAt: null
			}
		]
	});
	const execute = <T>(value: T) => ({ execute: async () => value });
	const services = {
		currentSession: () => ({ email: reader }),
		resolveActiveMemberName: execute('Reader'),
		loadEvolutionDraft: execute({ projectId: 'p', requests: [request], lastSavedAt: null }),
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
		workspaces: { listForCaller: async () => [] },
		loadSpecLanguage: execute({ generated: 'en' }),
		loadAssistantSettings: execute({ enabled: false, keyHint: null })
	};
	return { services, request };
}

describe('Evolution page privacy', () => {
	it.each([
		['board', '', false],
		['named request', '&request=request-1', true],
		['full dossier', '&request=request-1&view=full', true],
		['concurrent reading', '&concurrent=request-1', false]
	])('projects the %s before serializing any payload [unspa:10aab187:324f5567:97cc7e64]', async (_name, query, showsTheRequest) => {
		const { services, request } = fixture();
		const page = await loadEvolutionTab(services as never, 'p', new URL(`http://x/?tab=evolution${query}`), { get: () => undefined } as never);
		const payload = JSON.stringify(page);
		expect(payload).not.toContain('other-secret');
		expect(payload).not.toContain('another-secret');
		if (showsTheRequest) {
			// The request's page carries what this reader may read of its exchanges, and only that.
			const situation = page.reading?.dossier.need.fields.find((f) => f.path === '00-need.situation');
			expect(situation?.thread?.messages.map((m) => m.id)).toEqual(['public-comment', 'own-question']);
		} else {
			// The board and a comparison carry no exchange at all: the raw dossiers stay on the server.
			expect(payload).not.toContain('public-comment');
			expect(payload).not.toContain('own-question');
		}
		// The projection is per reader; it never erases the stored exchange.
		expect(request.fieldThreads[0].messages).toHaveLength(3);
		expect(request.fieldThreads).toHaveLength(2);
	});
});
