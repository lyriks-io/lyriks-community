import { describe, expect, it } from 'vitest';
import { architectureContext } from './architecture-context';
import { parseArchitectureDraft } from './parse-architecture-draft';
import { parseDocumentsDraft } from './parse-documents-draft';
import { architectureCanAdvance, computeArchitectureCoherence, createEmptyArchitectureDraft, createTechChoice } from '$domain/architecture';

describe('progressive architecture and source evidence', () => {
	it('starts logical and allows useful design without making a stack choice', () => {
		const draft = createEmptyArchitectureDraft('p');
		expect(draft.stage).toBe('logical');
		expect(architectureCanAdvance(draft)).toBe(false);
		draft.techChoices.push(createTechChoice('backend', { name: 'World simulation', role: 'Own persistent world state' }));
		draft.sourceIds = ['request'];
		draft.constraints = [{ id: 'c', title: 'Authoritative world', detail: 'Clients cannot change balances', category: 'access' }];
		expect(architectureCanAdvance(draft)).toBe(true);
		expect(computeArchitectureCoherence(draft).issues.map((i) => i.code)).not.toContain('unreferenced-tech');
		expect(computeArchitectureCoherence(draft).issues.map((i) => i.code)).not.toContain('thin-layers');
	});
	it('preserves legacy populated boards and explicitly selected stages', () => {
		const techChoices = [createTechChoice('backend', { name: 'Existing runtime' })];
		expect(parseArchitectureDraft({ techChoices }, 'p').stage).toBe('implementation');
		expect(parseArchitectureDraft({ stage: 'logical', techChoices }, 'p').stage).toBe('logical');
		expect(parseArchitectureDraft({}, 'p').stage).toBe('logical');
	});
	it('exports the canonical source note, decision status and unresolved references', () => {
		const draft = createEmptyArchitectureDraft('p');
		draft.sourceIds = ['decision', 'missing'];
		const documents = parseDocumentsDraft({ sources: [{ id: 'decision', title: 'World persistence',
			note: 'Use the selected database because transactions protect stock.', url: '', decision: { status: 'accepted' } }] }, 'p');
		const brief = architectureContext(draft, documents);
		expect(brief).toContain('Logical design only');
		expect(brief).toContain('Decision: accepted');
		expect(brief).toContain('transactions protect stock');
		expect(brief).toContain('Unresolved source: missing');
	});
	it('round trips reported test metadata without promoting it to verified coverage', () => {
		const evidence = { kind: 'e2e', result: 'passed', buildId: 'commit-123', artifact: 'test-results/run',
			command: 'pnpm test:e2e', observedAt: '2026-09-13T15:00:00Z', provenance: 'local browser',
			criterionIds: ['criterion-1'] };
		const parsed = parseDocumentsDraft({ sources: [{ id: 'proof', note: 'Observed result', evidence }] }, 'p');
		expect(parsed.sources[0].evidence).toEqual(evidence);
		const draft = createEmptyArchitectureDraft('p');
		draft.sourceIds = ['proof'];
		expect(architectureContext(draft, parsed)).toContain('not independently verified');
		expect(parsed.sources[0]).not.toHaveProperty('coverage');
	});
	it('does not accept unsupported decision or result values', () => {
		const parsed = parseDocumentsDraft({ sources: [{ id: 'bad', decision: { status: 'automatic' },
			evidence: { kind: 'runtime', result: 'verified' } }] }, 'p');
		expect(parsed.sources[0].decision).toBeUndefined();
		expect(parsed.sources[0].evidence).toBeUndefined();
	});
});
