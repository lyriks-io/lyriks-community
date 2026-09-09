import { describe, expect, it, vi } from 'vitest';
import {
	createEmptyScopeDraft,
	SCOPE_AUDIT_LOG_LIMIT,
	type ProjectScopeDraft,
	type ScopeAuditEntry
} from '$domain/scope';
import {
	AssessProjectCompletenessUseCase,
	AuditProjectScopeUseCase,
	BuildCompletionEvidenceUseCase,
	FinishProjectUseCase,
	SaveScopeDraftUseCase
} from './project-completion';
import type { ClockPort, SectionDraftRepositoryPort, SessionPort } from '../ports';

const clock: ClockPort = { nowIso: () => '2026-07-24T09:00:00.000Z' };
const session: SessionPort = {
	current: () => ({ isAuthenticated: true, email: 'reviewer@example.com' })
};

/** A scope that passes every authored check, so only the audit gate is in play. */
function readyScope(overrides: Partial<ProjectScopeDraft> = {}): ProjectScopeDraft {
	return {
		...createEmptyScopeDraft('project-1'),
		mode: 'full_product',
		capabilities: [
			{
				id: 'cap-1',
				name: 'Send a message',
				description: '',
				sourceIds: ['source-1'],
				featureIds: ['feature-1'],
				disposition: 'included',
				rationale: '',
				approvalId: null
			}
		],
		sectionAssessments: [
			{
				section: 'features',
				applicability: 'required',
				status: 'ready',
				rationale: 'Reviewed',
				approvalId: null
			}
		],
		...overrides
	};
}

function evidenceBuilder(
	coherenceReady = true,
	experienceReady = true,
	sources: object[] = [{ id: 'source-1', url: 'https://example.test/brief', note: '' }]
) {
	return new BuildCompletionEvidenceUseCase(
		{ execute: async () => ({ sources }) } as never,
		{ execute: async () => ({ items: [] }) } as never,
		{
			execute: async () => ({
				analysis: { gaps: [], readinessScore: coherenceReady ? 95 : 10 },
				draft: { threshold: 80 }
			})
		} as never,
		{
			execute: async () => [
				{ featureId: 'feature-1', name: 'Send a message', maturity: 90, entities: ['Message'] }
			]
		} as never,
		{ execute: async () => ({ entities: [{ name: 'Message' }] }) } as never,
		{ execute: async () => ({ ready: experienceReady, blockers: ['Journey A fails'] }) } as never,
		{ fingerprint: async () => 'model-fp-1' }
	);
}

/** In-memory section store that records what was actually persisted. */
function store(initial: ProjectScopeDraft) {
	let saved = initial;
	return {
		saved: () => saved,
		port: {
			load: async () => saved,
			save: async (draft: ProjectScopeDraft) => {
				saved = draft;
				return 1;
			},
			currentRevision: async () => 1
		} as SectionDraftRepositoryPort<ProjectScopeDraft>
	};
}

function entry(overrides: Partial<ScopeAuditEntry> = {}): ScopeAuditEntry {
	return {
		performedAt: '2026-07-20T00:00:00.000Z',
		scopeFingerprint: 'a',
		modelFingerprint: 'b',
		kind: 'audit',
		actor: 'reviewer@example.com',
		score: 40,
		verdict: 'blocked',
		blockingIssues: 2,
		failedChecks: ['experience'],
		...overrides
	};
}

describe('AssessProjectCompletenessUseCase', () => {
	it('short-circuits expensive evidence for an undeclared legacy scope', async () => {
		const scope = createEmptyScopeDraft('project-1');
		const evidence = {
			execute: vi.fn()
		} as unknown as BuildCompletionEvidenceUseCase;
		const useCase = new AssessProjectCompletenessUseCase(
			{ execute: vi.fn().mockResolvedValue(scope) },
			evidence
		);

		const report = await useCase.execute('project-1');

		expect(evidence.execute).not.toHaveBeenCalled();
		expect(report.status).toBe('unverified');
		expect(report.canFinish).toBe(false);
		expect(report.issues).toContainEqual(
			expect.objectContaining({ code: 'scope-mode-unclassified' })
		);
	});
	it('reads the reachability of every registered source into the report', async () => {
		const scope = readyScope();
		const useCase = new AssessProjectCompletenessUseCase(
			{ execute: vi.fn().mockResolvedValue(scope) },
			evidenceBuilder(true, true, [
				{ id: 'source-1', title: 'Brief', url: 'https://example.test/brief', note: '' },
				{ id: 'source-2', title: 'Runbook', url: 'file:///home/me/runbook.md', note: 'summary' },
				{ id: 'source-3', title: 'Interview', url: '', note: 'verbatim excerpt' }
			])
		);

		const report = await useCase.execute('project-1');

		const warnings = report.issues.filter((issue) => issue.code.startsWith('source-'));
		expect(warnings).toEqual([
			expect.objectContaining({
				code: 'source-unreachable',
				severity: 'warning',
				path: 'documents.sources.source-2'
			})
		]);
		expect(warnings[0].message).toContain('Source "Runbook" cannot be opened');
		expect(report.checks.find((check) => check.key === 'sources')?.passed).toBe(false);
	});
});

describe('AuditProjectScopeUseCase — the audit log', () => {
	it('records a run that failed the gate, with the actor and the checks that failed', async () => {
		const scope = readyScope();
		const repo = store(scope);
		const useCase = new AuditProjectScopeUseCase(
			repo.port,
			{ execute: async () => scope },
			evidenceBuilder(true, false),
			clock,
			session
		);

		const result = await useCase.execute('project-1');

		expect(result?.report.canFinish).toBe(false);
		const log = repo.saved().auditLog;
		expect(log).toHaveLength(1);
		expect(log[0]).toMatchObject({
			kind: 'audit',
			actor: 'reviewer@example.com',
			performedAt: '2026-07-24T09:00:00.000Z',
			verdict: 'blocked'
		});
		// The failing check is named, so the row explains its own verdict.
		expect(log[0].failedChecks).toContain('experience');
		expect(log[0].blockingIssues).toBeGreaterThan(0);
	});

	it('prepends each new run and never grows past the cap', async () => {
		const existing = Array.from({ length: SCOPE_AUDIT_LOG_LIMIT }, (_, i) =>
			entry({ performedAt: `2026-07-0${(i % 9) + 1}T00:00:00.000Z` })
		);
		const scope = readyScope({ auditLog: existing });
		const repo = store(scope);
		const useCase = new AuditProjectScopeUseCase(
			repo.port,
			{ execute: async () => scope },
			evidenceBuilder(),
			clock,
			session
		);

		await useCase.execute('project-1');

		const log = repo.saved().auditLog;
		expect(log).toHaveLength(SCOPE_AUDIT_LOG_LIMIT);
		expect(log[0].performedAt).toBe('2026-07-24T09:00:00.000Z');
		expect(log[1]).toEqual(existing[0]);
	});
});

describe('FinishProjectUseCase — the audit log', () => {
	it('records a completion run once the gate passes', async () => {
		// A fresh audit is a precondition of finishing, so run one first.
		const repo = store(readyScope());
		const evidence = evidenceBuilder();
		await new AuditProjectScopeUseCase(
			repo.port,
			{ execute: async () => repo.saved() },
			evidence,
			clock,
			session
		).execute('project-1');

		const result = await new FinishProjectUseCase(
			repo.port,
			{ execute: async () => repo.saved() },
			evidence,
			clock,
			session
		).execute('project-1');

		expect(result).toMatchObject({ completed: true });
		const log = repo.saved().auditLog;
		expect(log).toHaveLength(2);
		expect(log[0]).toMatchObject({
			kind: 'completion',
			verdict: 'completed',
			actor: 'reviewer@example.com'
		});
		expect(log[0].failedChecks).toEqual([]);
	});

	it('leaves the log untouched when the gate refuses', async () => {
		const scope = readyScope();
		const repo = store(scope);

		const result = await new FinishProjectUseCase(
			repo.port,
			{ execute: async () => scope },
			evidenceBuilder(false, false),
			clock,
			session
		).execute('project-1');

		expect(result).toMatchObject({ completed: false });
		expect(repo.saved().auditLog).toEqual([]);
	});
});

describe('SaveScopeDraftUseCase — the log is server-owned', () => {
	it('ignores a client-supplied log and keeps the stored history', async () => {
		const stored = readyScope({ auditLog: [entry()] });
		const repo = store(stored);

		// A forged log claiming a clean completed run must not survive the save.
		await new SaveScopeDraftUseCase(repo.port, clock).execute({
			...stored,
			auditLog: [
				entry({ kind: 'completion', actor: 'attacker', score: 100, verdict: 'completed', blockingIssues: 0, failedChecks: [] })
			]
		});

		expect(repo.saved().auditLog).toEqual(stored.auditLog);
	});

	it('keeps the history when a content change invalidates the current audit', async () => {
		const stored = readyScope({
			audit: {
				performedAt: '2026-07-20T00:00:00.000Z',
				scopeFingerprint: 'a',
				modelFingerprint: 'b'
			},
			auditLog: [entry()]
		});
		const repo = store(stored);

		await new SaveScopeDraftUseCase(repo.port, clock).execute({ ...stored, mode: 'prototype' });

		// The snapshot is dropped (the model moved) but the record of the run is not.
		expect(repo.saved().audit).toBeNull();
		expect(repo.saved().auditLog).toHaveLength(1);
	});
});
