import { describe, expect, it } from 'vitest';
import {
	computeOperationsCoherence,
	createEmptyDefinitionDraft,
	createEmptyIdentityDraft,
	createEmptyOperationsDraft,
	type FoundationDefinitionDraft,
	type FoundationIdentityDraft,
	type FoundationOperationsDraft
} from '$domain/foundation';
import type { ClockPort, FoundationDefinitionRepositoryPort, FoundationIdentityRepositoryPort, TelemetryEvent, TelemetryPort } from '../ports';
import { SaveFoundationDraftUseCase } from './save-foundation-draft';
import { SaveSimpleSectionDraftUseCase, type SimpleSectionDraftRepository } from './save-simple-section-draft';

class Store<T extends { projectId: string }> {
	readonly saved: T[] = [];
	constructor(private current: T | null = null) {}
	async load() {
		return this.current;
	}
	async save(draft: T) {
		this.saved.push(draft);
		this.current = draft;
	}
}

/** A clock that moves one second per reading. */
function ticking(): ClockPort {
	let second = 0;
	return { nowIso: () => `2026-11-18T10:00:${String(second++).padStart(2, '0')}.000Z` };
}

function setup(options: { definition?: FoundationDefinitionDraft; operationsRevision?: number | null; lang?: 'en' | 'fr' } = {}) {
	const identities = new Store<FoundationIdentityDraft>();
	const definitions = new Store<FoundationDefinitionDraft>(options.definition ?? null);
	const operationsSaved: FoundationOperationsDraft[] = [];
	const operationsStore: SimpleSectionDraftRepository<FoundationOperationsDraft> = {
		save: async (draft) => {
			if (options.operationsRevision === null) return null;
			operationsSaved.push(draft);
			return options.operationsRevision ?? 7;
		}
	};
	const events: TelemetryEvent[] = [];
	const telemetry: TelemetryPort = { emit: (event) => void events.push(event) };
	const clock = ticking();
	const languageOf = async () => options.lang ?? 'en';
	const operations = new SaveSimpleSectionDraftUseCase('foundation.operations', operationsStore, clock, telemetry, {
		coherence: (draft, lang) => computeOperationsCoherence(draft, true, lang),
		languageOf
	});
	const useCase = new SaveFoundationDraftUseCase(
		identities satisfies FoundationIdentityRepositoryPort,
		definitions satisfies FoundationDefinitionRepositoryPort,
		clock,
		telemetry,
		operations,
		languageOf
	);
	return { useCase, identities, definitions, operationsSaved, events };
}

/** An identity row written before the business objective moved to the definition. */
const legacyIdentity = (): FoundationIdentityDraft => ({ ...createEmptyIdentityDraft('p1'), productName: 'Ledger', mainProblem: 'Month-end close takes a week' });

describe('saving the Foundation identity', () => {
	it('stores it stamped and without the retired definition-era fields', async () => {
		const { useCase, identities } = setup();
		const result = await useCase.saveIdentity(legacyIdentity());
		const [stored] = identities.saved;
		expect(stored.lastSavedAt).toBe(result.savedAt);
		expect(stored.productName).toBe('Ledger');
		expect(stored).not.toHaveProperty('mainProblem');
	});

	it('moves a legacy business objective into a definition nobody wrote yet', async () => {
		const { useCase, definitions } = setup();
		await useCase.saveIdentity(legacyIdentity());
		expect(definitions.saved.map((d) => d.businessObjective.mainProblem)).toEqual(['Month-end close takes a week']);
	});

	it('never overwrites a definition someone already wrote', async () => {
		const written = createEmptyDefinitionDraft('p1');
		written.businessObjective.mainProblem = 'Invoices get lost';
		const { useCase, definitions } = setup({ definition: written });
		await useCase.saveIdentity(legacyIdentity());
		expect(definitions.saved).toEqual([]);
	});

	it('answers with the identity coherence, in the language of the spec', async () => {
		const noPattern = { ...createEmptyIdentityDraft('p1'), activatedPatterns: [] };
		const en = await setup().useCase.saveIdentity(noPattern);
		const fr = await setup({ lang: 'fr' }).useCase.saveIdentity(noPattern);
		expect(en.coherenceScore).toBe(fr.coherenceScore);
		expect(en.coherenceIssues).toHaveLength(fr.coherenceIssues.length);
		expect(en.coherenceIssues.length).toBeGreaterThan(0);
		expect(fr.coherenceIssues).not.toEqual(en.coherenceIssues);
	});
});

describe('saving the Foundation definition', () => {
	it('keeps a security question answered once, even when a later save leaves it at its default', async () => {
		const stored = createEmptyDefinitionDraft('p1');
		stored.security = { ...stored.security, answered: ['auditLogs'] };
		stored.lastSavedAt = '2026-11-17T09:00:00.000Z';
		const { useCase, definitions } = setup({ definition: stored });
		const incoming = createEmptyDefinitionDraft('p1');
		await useCase.saveDefinition(incoming);
		expect(definitions.saved[0].security.answered).toEqual(['auditLogs']);
	});
});

describe('saving the whole Foundation', () => {
	it('stores the three parts and answers with the latest stamp, the mean score and the operations revision', async () => {
		const { useCase, identities, definitions, operationsSaved } = setup({ operationsRevision: 12 });
		const identity = await setup().useCase.saveIdentity(createEmptyIdentityDraft('p1'));
		const definition = await setup().useCase.saveDefinition(createEmptyDefinitionDraft('p1'));
		const empty = createEmptyOperationsDraft('p1');
		const localized = { ...empty, i18n: { ...empty.i18n, primaryLocale: 'fr' } };
		const operations = computeOperationsCoherence(localized);
		expect(operations.score).toBeGreaterThan(0);

		const result = await useCase.execute({
			projectId: 'p1',
			identity: createEmptyIdentityDraft('p1'),
			definition: createEmptyDefinitionDraft('p1'),
			operations: localized
		});

		expect([identities.saved.length, definitions.saved.length, operationsSaved.length]).toEqual([1, 1, 1]);
		expect(result.savedAt).toBe(operationsSaved[0].lastSavedAt);
		expect(result.coherenceScore).toBe(Math.round((identity.coherenceScore + definition.coherenceScore + operations.score) / 3));
		expect(result.operationsRevision).toBe(12);
		expect(result.coherenceIssues.length).toBeLessThanOrEqual(20);
	});

	it('answers every part of its coherence in the language of the spec', async () => {
		const whole = { projectId: 'p1', identity: createEmptyIdentityDraft('p1'), definition: createEmptyDefinitionDraft('p1'), operations: createEmptyOperationsDraft('p1') };
		const fr = await setup({ lang: 'fr' }).useCase.execute(whole);
		const en = await setup().useCase.execute(whole);
		const operationsFr = computeOperationsCoherence(whole.operations, true, 'fr').issues.map((i) => i.message);
		const operationsEn = computeOperationsCoherence(whole.operations, true, 'en').issues.map((i) => i.message);
		expect(operationsFr.length).toBeGreaterThan(0);
		expect(fr.coherenceIssues).toEqual(expect.arrayContaining(operationsFr));
		expect(fr.coherenceIssues).not.toEqual(expect.arrayContaining([operationsEn[0]]));
		expect(en.coherenceIssues).toEqual(expect.arrayContaining(operationsEn));
	});

	it('fails when the operations part was changed elsewhere since it was read', async () => {
		const { useCase } = setup({ operationsRevision: null });
		await expect(
			useCase.execute({
				projectId: 'p1',
				identity: createEmptyIdentityDraft('p1'),
				definition: createEmptyDefinitionDraft('p1'),
				operations: createEmptyOperationsDraft('p1')
			})
		).rejects.toThrow('Foundation operations save was rejected');
	});
});
