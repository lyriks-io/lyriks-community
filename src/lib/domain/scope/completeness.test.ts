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

describe('assessProjectCompletion data links', () => {
	it('counts the checkable fields no state carries in one warning that names the call listing them', () => {
		const draft = readyDraft();
		const report = assessProjectCompletion(
			draft,
			evidence(draft, {
				unlinkedDataFields: [
					{ table: 'World', count: 5 },
					{ table: 'Region', count: 4 },
					{ table: 'Location', count: 3 },
					{ table: 'Tree', count: 1 }
				]
			})
		);
		const issues = report.issues.filter((issue) => issue.code === 'data-field-unlinked');
		expect(issues).toHaveLength(1);
		expect(issues[0]).toMatchObject({ severity: 'warning', path: 'data.fields' });
		expect(issues[0].message).toContain('13 data field(s)');
		expect(issues[0].message).toContain('(most in World, Region, Location)');
		expect(issues[0].message).toContain('get_data_links');
		// Consultative: it never fails the data check.
		expect(report.checks.find((item) => item.key === 'data')?.passed).toBe(true);
	});

	it('says nothing when every checkable field is linked, or when nothing was read', () => {
		const draft = readyDraft();
		for (const unlinkedDataFields of [[], undefined]) {
			const report = assessProjectCompletion(draft, evidence(draft, unlinkedDataFields ? { unlinkedDataFields } : {}));
			expect(report.issues.some((issue) => issue.code === 'data-field-unlinked')).toBe(false);
		}
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

	it('blocks on every element read from the code that cites no source, one issue per section (ac-src-extracted)', () => {
		const draft = readyDraft();
		const report = assessProjectCompletion(
			draft,
			evidence(draft, {
				uncitedExtracted: [
					{ kind: 'feature', name: 'Send a message' },
					{ kind: 'rule', name: 'One draft per thread' },
					{ kind: 'rule', name: 'Archived threads read only' },
					{ kind: 'term', name: 'Thread' }
				]
			})
		);
		const uncited = report.issues.filter((issue) => issue.code === 'extracted-source-missing');
		expect(uncited.map((issue) => [issue.severity, issue.path])).toEqual([
			['blocking', 'features'],
			['blocking', 'rules.issues'],
			['blocking', 'glossary.terms']
		]);
		expect(uncited[1].message).toBe(
			'2 rules read from the code cite no source ("One draft per thread", "Archived threads read only"). A product read from its code says where each element comes from: cite the code it was read from and every ticket, page or document that speaks of it, as rows of the documents register named in its sourceIds.'
		);
		expect(report.canFinish).toBe(false);
		expect(report.checks.find((item) => item.key === 'sources')?.passed).toBe(false);
		// A project read otherwise reports nothing of the kind.
		expect(assessProjectCompletion(draft, evidence(draft)).issues.some((issue) => issue.code === 'extracted-source-missing')).toBe(false);
	});

	it('blocks on a table read from the code that cites no source, named in the data section [criterion:ac-leaf-ac-src-extracted]', () => {
		const draft = readyDraft();
		const report = assessProjectCompletion(draft, evidence(draft, { uncitedExtracted: [{ kind: 'table', name: 'Users' }] }));
		const uncited = report.issues.filter((issue) => issue.code === 'extracted-source-missing');
		expect(uncited.map((issue) => [issue.severity, issue.path])).toEqual([['blocking', 'data.entities']]);
		expect(uncited[0].message).toMatch(/^1 table read from the code cites no source \("Users"\)\./);
	});

	it('names the documentation or the design a project was read from, in English and in French [criterion:7a8be13f]', () => {
		const draft = readyDraft();
		const fromDesign = assessProjectCompletion(
			draft,
			evidence(draft, { uncitedExtracted: [{ kind: 'feature', name: 'Start the day' }], extractedFrom: 'design' })
		);
		const issue = fromDesign.issues.find((item) => item.code === 'extracted-source-missing');
		expect(issue?.severity).toBe('blocking');
		expect(issue?.message).toBe(
			'1 feature read from the design cites no source ("Start the day"). A product read from its design says where each element comes from: cite the design or prototype it was read from and every ticket, page or document that speaks of it, as rows of the documents register named in its sourceIds.'
		);
		const fromPages = assessProjectCompletion(
			draft,
			evidence(draft, { uncitedExtracted: [{ kind: 'term', name: 'Statut' }], extractedFrom: 'documents', language: 'fr' })
		);
		// French typography puts a no-break space inside the quotes and before the colon.
		const french = fromPages.issues.find((item) => item.code === 'extracted-source-missing')?.message.replace(/[\u00a0\u202f]/g, ' ');
		expect(french).toMatch(
			/^1 terme du glossaire lu dans la documentation ne cite aucune source \(« Statut »\)\. Un produit lu dans sa documentation dit d'où vient chaque élément : citez la page ou le document d'où il a été lu/
		);
	});

	it('never reads a check with nothing to check as passed: it says not checked yet and why [criterion:21e556fb]', () => {
		// LYRIKS BY DYLAN on 2026-11-06: forty features, none with behaviour, no
		// capability in the scope, no source registered.
		const draft = createEmptyScopeDraft('project-1');
		const featureMaturity = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`feature-${i}`, 0]));
		const report = assessProjectCompletion(draft, evidence(draft, { sourceIds: [], featureMaturity }));
		const check = (key: string) => report.checks.find((item) => item.key === key);
		expect(check('mapping')).toMatchObject({ passed: false, detail: 'Not checked yet: the scope includes no capability to map to a feature' });
		expect(check('sources')).toMatchObject({
			passed: false,
			detail: 'Not checked yet: no source is registered and the scope lists no capability to trace to one'
		});
		expect(check('behavior')).toMatchObject({
			passed: false,
			detail: 'Not checked yet: the scope includes no capability; 40 of 40 features have no behavior yet'
		});
		expect(check('data')).toMatchObject({ passed: false, detail: 'Not checked yet: no feature has behavior to hold the data model against' });

		const french = assessProjectCompletion(draft, evidence(draft, { sourceIds: [], featureMaturity, language: 'fr' }));
		expect(french.checks.find((item) => item.key === 'behavior')?.detail).toBe(
			"Pas encore vérifiée\u00a0: le périmètre n'inclut aucune capacité\u00a0; 40 fonctionnalités sur 40 n'ont encore aucun comportement"
		);

		// A check that has something to read keeps its verdict.
		const ready = readyDraft();
		const kept = assessProjectCompletion(ready, evidence(ready));
		for (const key of ['mapping', 'sources', 'behavior']) expect(kept.checks.find((item) => item.key === key)?.passed).toBe(true);
		expect(kept.checks.find((item) => item.key === 'data')).toMatchObject({ passed: true });
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

describe('project completion in French (spec language)', () => {
	const NB = ' ';
	it('writes messages, labels and details in French with codes unchanged', () => {
		const draft = readyDraft({
			capabilities: [
				{ ...readyDraft().capabilities[0], name: 'Send a message', disposition: 'unresolved', sourceIds: [] }
			]
		});
		const report = assessProjectCompletion(draft, evidence(draft), 'fr');
		const byCode = (code: string) => report.issues.find((issue) => issue.code === code)!;
		expect(byCode('capability-unresolved').message).toBe(
			`La capacité «${NB}Send a message${NB}» n'a été ni incluse, ni exclue, ni reportée.`
		);
		expect(byCode('capability-source-missing').message).toBe(
			`La capacité «${NB}Send a message${NB}» n'est rattachée à aucune source.`
		);
		expect(report.checks.find((check) => check.key === 'scope')!.label).toBe('Périmètre déclaré');
		expect(report.checks.find((check) => check.key === 'sections')!.detail).toBe('1/1 section prête');
	});

	it('reads the language from the evidence when none is passed', () => {
		const draft = readyDraft({ mode: 'full_product' });
		draft.capabilities[0].disposition = 'deferred';
		const report = assessProjectCompletion(draft, evidence(draft, { language: 'fr' }));
		expect(report.issues.find((issue) => issue.code === 'full-product-omission')!.message).toContain(
			`ne peut pas être reportée en mode produit complet. Faites-la entrer dans le périmètre comme «${NB}included${NB}»`
		);
	});

	it('keeps English byte-identical when no language is given', () => {
		const draft = readyDraft({ capabilities: [{ ...readyDraft().capabilities[0], disposition: 'unresolved' }] });
		expect(assessProjectCompletion(draft, evidence(draft))).toEqual(assessProjectCompletion(draft, evidence(draft), 'en'));
		expect(
			assessProjectCompletion(draft, evidence(draft)).issues.find((i) => i.code === 'capability-unresolved')!.message
		).toBe('"Send a message" has not been included, excluded, or deferred.');
	});
});
