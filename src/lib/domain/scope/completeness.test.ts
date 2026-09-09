import { describe, expect, it } from 'vitest';
import {
	assessProjectCompletion,
	createEmptyScopeDraft,
	fingerprint,
	scopeContentFingerprint,
	type CompletionEvidence,
	type ProjectScopeDraft
} from '.';

function readyDraft(overrides: Partial<ProjectScopeDraft> = {}): ProjectScopeDraft {
	const base: ProjectScopeDraft = {
		...createEmptyScopeDraft('project-1'),
		mode: 'full_product',
		capabilities: [
			{
				id: 'scope-send',
				name: 'Send a message',
				description: 'Send one message.',
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
		]
	};
	return { ...base, ...overrides };
}

function evidence(draft: ProjectScopeDraft, overrides: Partial<CompletionEvidence> = {}): CompletionEvidence {
	return {
		sourceIds: ['source-1'],
		featureMaturity: { 'feature-1': 90 },
		behaviorEntities: [],
		dataEntityNames: [],
		settledApprovalIds: [],
		coherenceReady: true,
		coherenceDetail: 'Ready',
		experienceReady: true,
		experienceDetail: 'Ready',
		currentScopeFingerprint: scopeContentFingerprint(draft),
		currentModelFingerprint: fingerprint('model-1'),
		...overrides
	};
}

describe('assessProjectCompletion', () => {
	it('never treats an empty, internally consistent model as a complete project', () => {
		const draft = createEmptyScopeDraft('project-1');
		const report = assessProjectCompletion(draft, evidence(draft));

		expect(report.canFinish).toBe(false);
		expect(report.status).toBe('unverified');
		expect(report.issues.map((issue) => issue.code)).toEqual(
			expect.arrayContaining(['scope-mode-unclassified', 'scope-empty', 'audit-stale'])
		);
	});

	it('requires a fresh audit even when every authored reading passes', () => {
		const draft = readyDraft();
		const report = assessProjectCompletion(draft, evidence(draft));

		expect(report.canFinish).toBe(false);
		expect(report.issues).toContainEqual(expect.objectContaining({ code: 'audit-stale' }));
	});

	it('allows completion only against matching scope and model fingerprints', () => {
		const draft = readyDraft();
		const current = evidence(draft);
		const audited: ProjectScopeDraft = {
			...draft,
			audit: {
				performedAt: '2026-07-23T10:00:00.000Z',
				scopeFingerprint: current.currentScopeFingerprint,
				modelFingerprint: current.currentModelFingerprint
			}
		};

		expect(assessProjectCompletion(audited, current).canFinish).toBe(true);
		expect(
			assessProjectCompletion(audited, {
				...current,
				currentModelFingerprint: fingerprint('model-2')
			}).canFinish
		).toBe(false);
	});

	it('forbids exclusions in full-product mode even when approved', () => {
		const draft = readyDraft({
			capabilities: [
				{
					id: 'scope-voice',
					name: 'Voice input',
					description: '',
					sourceIds: ['source-1'],
					featureIds: [],
					disposition: 'deferred',
					rationale: 'Next release',
					approvalId: 'approval-1'
				}
			]
		});
		const report = assessProjectCompletion(
			draft,
			evidence(draft, { settledApprovalIds: ['approval-1'] })
		);

		expect(report.issues).toContainEqual(expect.objectContaining({ code: 'full-product-omission' }));
	});

	it('warns on every behavior entity the data model does not represent, without blocking finish', () => {
		const draft = readyDraft();
		const current = evidence(draft, {
			behaviorEntities: [
				{ name: 'Invoice', featureName: 'Send invoices' },
				{ name: 'Invoice', featureName: 'Archive invoices' },
				{ name: 'Customer', featureName: 'Send invoices' }
			],
			dataEntityNames: ['Customer']
		});
		const audited: ProjectScopeDraft = {
			...draft,
			audit: {
				performedAt: '2026-08-15T10:00:00.000Z',
				scopeFingerprint: current.currentScopeFingerprint,
				modelFingerprint: current.currentModelFingerprint
			}
		};
		const report = assessProjectCompletion(audited, current);

		const warnings = report.issues.filter((issue) => issue.code === 'behavior-entity-unmodeled');
		expect(warnings).toHaveLength(1);
		expect(warnings[0].severity).toBe('warning');
		expect(warnings[0].message).toContain('"Invoice"');
		expect(warnings[0].message).toContain('Send invoices');
		expect(warnings[0].message).toContain('Archive invoices');
		expect(report.checks.find((check) => check.key === 'data')?.passed).toBe(false);
		// A warning surfaces the gap but never deadlocks completion.
		expect(report.canFinish).toBe(true);
	});

	it('matches entity names across case, punctuation and naive plurals', () => {
		const draft = readyDraft();
		const report = assessProjectCompletion(
			draft,
			evidence(draft, {
				behaviorEntities: [
					{ name: 'Order lines', featureName: 'Manage orders' },
					{ name: 'customer', featureName: 'Manage orders' }
				],
				dataEntityNames: ['OrderLine', 'Customers']
			})
		);

		expect(report.issues.some((issue) => issue.code === 'behavior-entity-unmodeled')).toBe(false);
		const check = report.checks.find((c) => c.key === 'data');
		expect(check?.passed).toBe(true);
		expect(check?.detail).toContain('2 checked');
	});
});

describe('assessProjectCompletion data relations', () => {
	it('flags every table that takes part in no relation and fails the data check', () => {
		const draft = readyDraft();
		const report = assessProjectCompletion(
			draft,
			evidence(draft, { unrelatedDataEntityNames: ['Setting', 'Setting'] })
		);
		const issues = report.issues.filter((issue) => issue.code === 'data-entity-unrelated');
		expect(issues).toHaveLength(1);
		expect(issues[0].severity).toBe('warning');
		expect(issues[0].message).toContain('Setting');
		expect(issues[0].path).toBe('data.entities');
		const check = report.checks.find((item) => item.key === 'data');
		expect(check?.passed).toBe(false);
		expect(check?.detail).toContain('1 entity takes part in no relation');
	});

	it('keeps the data check green when every table relates and reads absent evidence as none', () => {
		const draft = readyDraft();
		expect(
			assessProjectCompletion(draft, evidence(draft, { unrelatedDataEntityNames: [] })).checks.find(
				(item) => item.key === 'data'
			)?.passed
		).toBe(true);
		expect(
			assessProjectCompletion(draft, evidence(draft)).issues.some(
				(issue) => issue.code === 'data-entity-unrelated'
			)
		).toBe(false);
	});

	it('warns on every registered source nobody but its author can consult and fails the traceability check', () => {
		const draft = readyDraft();
		const report = assessProjectCompletion(
			draft,
			evidence(draft, {
				unreachableSources: [
					{ id: 'src-runbook', access: 'unreachable', message: 'Source "Runbook" cannot be opened.' },
					{ id: 'src-blank', access: 'empty', message: 'Source "src-blank" has nothing to open.' }
				]
			})
		);
		const warnings = report.issues.filter((issue) => issue.code.startsWith('source-'));
		expect(warnings.map((issue) => [issue.code, issue.severity, issue.path])).toEqual([
			['source-unreachable', 'warning', 'documents.sources.src-runbook'],
			['source-empty', 'warning', 'documents.sources.src-blank']
		]);
		expect(warnings[0].message).toBe('Source "Runbook" cannot be opened.');
		// Never a blocker: a dead reference must not deadlock finish, only stay on the report.
		expect(report.issues.filter((issue) => issue.severity === 'blocking').map((issue) => issue.code)).toEqual([
			'audit-stale'
		]);
		const check = report.checks.find((item) => item.key === 'sources');
		expect(check?.passed).toBe(false);
		expect(check?.detail).toBe('1 registered source; 2 that nobody but their author can consult');
	});

	it('keeps the traceability check green when every source is reachable and reads absent evidence as none', () => {
		const draft = readyDraft();
		const report = assessProjectCompletion(draft, evidence(draft));
		expect(report.issues.some((issue) => issue.code.startsWith('source-'))).toBe(false);
		const check = report.checks.find((item) => item.key === 'sources');
		expect(check?.passed).toBe(true);
		expect(check?.detail).toBe('1 registered source');
	});
});
