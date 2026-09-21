import type { AppServices } from '$composition/container.server';
import {
	ALL_BLOCK_FIELDS,
	blocksFor,
	capabilityReadings,
	fieldKey,
	filledKeysOfReadings,
	gateReading,
	holdsValue,
	latestThread,
	leafOf,
	openWaiver,
	pendingProposals,
	publishedFindings,
	readCoherence,
	REQUEST_ORIGINS,
	readMaturity,
	readReadiness,
	supportedStage,
	trlFromMaturityScore,
	undecidedCount,
	canCloseReport,
	canAcceptProposal,
	currentLines,
	acceptanceDebt,
	findingsForCurrentHypothesis,
	impactInPlainWords,
	impactSummaryLine,
	impactVerb,
	timeline,
	type Actor,
	type CapabilityReading,
	type EdgeCaseSentence,
	type EvolutionRequest,
	type ImpactHypothesis,
	type LeafBehaviour,
	type MaturityReading,
	type ProjectEvolutionDraft,
	type Proposal
} from '$domain/evolution';
import { readDossierField } from '$application/use-cases/save-dossier-field';
import { leafFeatures, type ProjectFeaturesDraft } from '$domain/features';
import type { GlossaryTerm } from '$domain/glossary';
import type { FeatureImplementationCoverage } from '$application/use-cases';

/**
 * Everything the Evolution board and its dossiers are read from, loaded once.
 *
 * The page and the API (the MCP behind it) read the SAME view: the features
 * draft the dossier fields resolve against, the evidence register a value can
 * cite, what the other sections hold for the capability blocks, the code
 * coverage and the maturity scores, and the readings derived from all of it.
 * Nothing the dossier shows is stored twice: every specification value lives in
 * the section that owns it and is read here.
 */
export interface EvolutionView {
	readonly projectId: string;
	readonly draft: ProjectEvolutionDraft;
	readonly features: ProjectFeaturesDraft;
	readonly leaves: readonly { id: string; name: string }[];
	readonly sources: readonly { id: string; title: string; url: string; note: string }[];
	readonly glossaryTerms: readonly GlossaryTerm[];
	readonly productName: string;
	readonly revision: number;
	readonly held: Readonly<Record<string, { summary: string; names: string[] }>>;
	readonly coverage: Readonly<Record<string, FeatureImplementationCoverage>>;
	/** Inline fields that hold a value, per request, keyed by `fieldKey`. */
	readonly filled: Readonly<Record<string, string[]>>;
	readonly trlByLeaf: Readonly<Record<string, number | null>>;
	readonly readings: Readonly<Record<string, CapabilityReading[]>>;
	/**
	 * The workspace roster a proposal can be handed to (id = email, the name the
	 * actor carries). Empty where one member is alone: no reviewer to tag.
	 */
	readonly members: readonly { id: string; name: string; role: string }[];
}

/**
 * What a leaf's behaviour model says, tolerant of the loose snapshot shape:
 * the counts the maturity reads, and the names a reviewer reads. A guard is
 * read by the reason it refuses with, which is the sentence the product shows.
 */
export function leafBehaviourOf(
	feature: unknown,
	extra: {
		maturity: { percentage: number; criticalCount: number } | null;
		coverage: { found: number; expected: number; percent: number } | null;
	}
): LeafBehaviour {
	const f = (feature ?? {}) as Record<string, unknown>;
	const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
	const listOf = (o: Record<string, unknown>, key: string) =>
		Array.isArray(o[key]) ? (o[key] as Record<string, unknown>[]) : [];
	const surfaces = listOf(f, 'surfaces');
	const actions = surfaces.flatMap((s) => listOf(s, 'actions'));
	// A guard reads as the action it gates and what refuses it: the rule's own
	// sentence, which names the condition, rather than the message shown at the
	// refusal, which three actions may share word for word.
	const guardsOf = (owner: Record<string, unknown>, ownerName: string) =>
		listOf(owner, 'rules')
			.filter((r) => (r.effect as Record<string, unknown> | undefined)?.type === 'block_action')
			.map((r) => {
				const what = str(r.description) || str((r.effect as Record<string, unknown>).reason);
				return what ? `${ownerName}: ${what}` : '';
			});
	const guardReasons = [
		...new Set([
			...actions.flatMap((a) => guardsOf(a, str(a.name) || 'unnamed action')),
			...surfaces.flatMap((s) => guardsOf(s, str(s.name) || 'unnamed surface'))
		])
	].filter((g) => g !== '');
	const rules =
		actions.reduce((n, a) => n + listOf(a, 'rules').length, 0) +
		surfaces.reduce((n, s) => n + listOf(s, 'rules').length, 0);
	const invariantRows = [
		...surfaces.flatMap((s) => listOf(s, 'invariants')),
		...actions.flatMap((a) => listOf(a, 'invariants')),
		...listOf(f, 'featureInvariants')
	];
	const entities = listOf(f, 'entities')
		.map((e) => str(e.namespace) || str(e.name))
		.filter((name) => name !== '');
	return {
		surfaces: surfaces.length,
		actions: actions.length,
		rules,
		invariants: invariantRows.length,
		entities,
		surfaceNames: surfaces.map((s) => ({
			name: str(s.name) || 'unnamed surface',
			actions: listOf(s, 'actions')
				.map((a) => str(a.name))
				.filter((n) => n !== '')
		})),
		guardReasons,
		invariantNames: invariantRows.map((i) => str(i.name)).filter((n) => n !== ''),
		updatedAt: str(f.updatedAt) || null,
		maturity: extra.maturity,
		coverage: extra.coverage
	};
}

/**
 * A count and the first names, keyed by the canonical path a block writes to.
 *
 * A row with no name is counted and said, never quietly dropped: "2 roles"
 * beside a single name is the kind of arithmetic that makes a reader distrust
 * everything else on the page.
 */
const summary = (count: number, allNames: string[], noun: string) => {
	const names = allNames.map((n) => (n ?? '').trim()).filter(Boolean);
	const unnamed = count - names.length;
	const plural = `${count} ${count === 1 ? noun : `${noun}s`}`;
	return {
		summary: unnamed > 0 ? `${plural}, ${unnamed} still unnamed` : plural,
		names: names.slice(0, 8)
	};
};

const filledValue = (value: unknown): boolean =>
	Array.isArray(value)
		? value.length > 0
		: typeof value === 'string'
			? value.trim() !== '' && value !== 'none'
			: false;

/** The inline fields of a request that hold a value in their owning section. */
export function filledInlineKeys(features: ProjectFeaturesDraft, request: EvolutionRequest): string[] {
	const keys: string[] = [];
	for (const leafId of request.leafIds) {
		for (const field of ALL_BLOCK_FIELDS) {
			if (field.editor !== 'inline') continue;
			if (holdsValue(field, readDossierField(features, field.path, leafId).value))
				keys.push(fieldKey(field.path, leafId));
		}
	}
	return keys;
}

/** The roster of the caller's active workspace, or nothing where one member is alone. */
async function loadMembers(
	services: AppServices,
	activeWorkspaceId: string | undefined
): Promise<EvolutionView['members']> {
	try {
		const workspaces = await services.workspaces.listForCaller();
		const active = (activeWorkspaceId && workspaces.find((w) => w.id === activeWorkspaceId)) || workspaces[0];
		if (!active) return [];
		const members = (await services.workspaces.listMembers(active.id)).map((m) => ({
			id: m.email,
			name: m.name?.trim() || m.email,
			role: m.role
		}));
		return members.length > 1 ? members : [];
	} catch (err) {
		console.warn('[evolution] workspace roster unavailable:', err);
		return [];
	}
}

export async function loadEvolutionView(
	services: AppServices,
	projectId: string,
	opts: { readonly activeWorkspaceId?: string } = {}
): Promise<EvolutionView> {
	const [draft, features, register, initDraft, revision, users, data, glossary, architecture, definition, coverage, advice, rules, members] =
		await Promise.all([
			services.loadEvolutionDraft.execute(projectId),
			services.loadFeaturesDraft.execute(projectId),
			// The evidence register: what a value on the dossier can cite.
			services.loadDocumentRegister.execute(projectId),
			services.loadFoundationDraft.loadIdentity(projectId),
			services.sectionDocuments.currentRevision(projectId, 'evolution'),
			// The sections the dossier's capability blocks point at, read only: the
			// dossier owns none of it.
			services.loadUsersDraft.execute(projectId),
			services.loadDataDraft.execute(projectId),
			services.loadGlossaryDraft.execute(projectId),
			services.loadArchitectureDraft.execute(projectId),
			services.loadFoundationDraft.execute(projectId),
			// What the code is known to hold, per feature: an instant read from the
			// cache; an empty snapshot is the honest answer that no index has been
			// synced from a checkout yet.
			services.implementationCoverage.get(projectId),
			// The maturity-score cache, for readiness. A leaf the engine has not
			// scored yet reads as unknown, never as zero.
			services.featureAdvice.get(projectId),
			// The edge cases, read as sentences under the Edge cases block.
			services.loadRulesDraft.execute(projectId),
			loadMembers(services, opts.activeWorkspaceId)
		]);
	const leaves = leafFeatures(features).map((f) => ({ id: f.id, name: f.name }));
	const sources = register.sources.map((s) => ({
		id: s.id,
		title: s.title,
		url: s.url ?? '',
		note: s.note ?? ''
	}));
	const productName = initDraft.productName.trim() || 'Untitled project';

	const security = definition.definition.security;
	const securitySlices = [
		['access control', security.authorization],
		['authentication', security.authentication],
		['encryption', security.encryption],
		['audit logs', security.auditLogs],
		['certifications', security.expectedCertifications],
		['data retention', security.dataRetention],
		['stated expectations', security.custom]
	].filter(([, value]) => filledValue(value));

	const held: Record<string, { summary: string; names: string[] }> = {
		'users.roles': summary(users.roles.length, users.roles.map((r) => r.name), 'role'),
		// A grant row is one (role, capability, verb) triple, so counting rows says
		// nothing a reader can use. What they want to know: which roles hold grants,
		// and over how many capabilities.
		'users.permissions': (() => {
			const roleIds = [...new Set(users.permissions.map((g) => g.roleId))];
			const capabilities = new Set(users.permissions.map((g) => g.capabilityId)).size;
			const roleName = (id: string) => users.roles.find((r) => r.id === id)?.name?.trim() || id;
			return {
				summary: `${roleIds.length} ${roleIds.length === 1 ? 'role holds' : 'roles hold'} grants over ${capabilities} ${capabilities === 1 ? 'capability' : 'capabilities'}`,
				names: roleIds.map(roleName).slice(0, 8)
			};
		})(),
		'data.entities': summary(data.entities.length, data.entities.map((e) => e.name), 'entity'),
		'architecture.constraints': summary(
			architecture.constraints.length,
			architecture.constraints.map((c) => c.title),
			'constraint'
		),
		'glossary.terms': summary(glossary.terms.length, glossary.terms.map((t) => t.term), 'term'),
		'foundation.definition.security': summary(
			securitySlices.length,
			securitySlices.map(([name]) => String(name)),
			'security area'
		)
	};

	// Which inline dossier fields already hold a value, per request, read from
	// the sections that own them. Read server-side so the maturity score never
	// paints a third of the truth and walks a request backwards on reload.
	const filled: Record<string, string[]> = {};
	for (const request of draft.requests) {
		const keys = filledInlineKeys(features, request);
		if (keys.length > 0) filled[request.id] = keys;
	}

	// Every leaf's TRL, for the readiness average: a hand-set override on the
	// leaf when there is one, otherwise the engine maturity projected onto the
	// 1-9 scale, otherwise unknown. Displayed, never typed on the dossier.
	const scoreByLeaf = new Map(advice.map((a) => [a.featureId, a.score?.percentage ?? null]));
	const trlByLeaf: Record<string, number | null> = {};
	for (const leaf of leaves) {
		const override = features.leafMeta?.[leaf.id]?.trl;
		if (typeof override === 'number' && Number.isFinite(override)) {
			trlByLeaf[leaf.id] = Math.max(1, Math.min(9, Math.round(override)));
			continue;
		}
		const score = scoreByLeaf.get(leaf.id);
		trlByLeaf[leaf.id] = typeof score === 'number' ? trlFromMaturityScore(score) : null;
	}

	// The readings of every request: what the touched features hold in the
	// behaviour model, the access matrix, the data model and the dependencies,
	// and what the impact report moves. Nothing on the dossier is ticked by
	// hand; an empty reading is what the completion goes and writes.
	const touchedLeafIds = [...new Set(draft.requests.flatMap((r) => r.leafIds))];
	const behaviourByLeaf: Record<string, LeafBehaviour | null> = {};
	await Promise.all(
		touchedLeafIds.map(async (leafId) => {
			try {
				const snapshot = await services.behaviorPort.readFeature(projectId, leafId);
				const score = advice.find((a) => a.featureId === leafId)?.score ?? null;
				const cov = coverage[leafId];
				behaviourByLeaf[leafId] = snapshot
					? leafBehaviourOf(snapshot.feature, {
							maturity: score ? { percentage: score.percentage, criticalCount: score.criticalCount } : null,
							coverage: cov ? { found: cov.found, expected: cov.expected, percent: cov.percent } : null
						})
					: null;
			} catch {
				behaviourByLeaf[leafId] = null;
			}
		})
	);
	// An edge case hangs under an issue, and an issue names its feature: that is
	// the only path from a touched feature to the Given / When / Then it must hold.
	const edgeCasesByLeaf: Record<string, EdgeCaseSentence[]> = {};
	for (const leafId of touchedLeafIds) {
		const issueIds = new Set(rules.issues.filter((i) => i.relatedFeatureId === leafId).map((i) => i.id));
		edgeCasesByLeaf[leafId] = rules.scenarios
			.filter((s) => s.relatedIssueId !== null && issueIds.has(s.relatedIssueId))
			.map((s) => ({
				title: s.title,
				given: s.given,
				when: s.whenText,
				then: s.then,
				expectedOutcome: s.expectedOutcome
			}));
	}
	const readingInputs = {
		behaviourByLeaf,
		edgeCasesByLeaf,
		grants: users.permissions.map((g) => ({ roleId: g.roleId, capabilityId: g.capabilityId, action: g.action })),
		roles: users.roles.map((r) => ({ id: r.id, name: r.name })),
		dataEntities: data.entities.map((e) => e.name),
		dependsOnByLeaf: Object.fromEntries(
			touchedLeafIds.map((id) => [id, features.leafMeta?.[id]?.dependsOn ?? []])
		),
		held
	};
	const readings: Record<string, CapabilityReading[]> = {};
	for (const request of draft.requests) {
		readings[request.id] = capabilityReadings(request, readingInputs, blocksFor(request));
	}

	return {
		projectId,
		draft,
		features,
		leaves,
		sources,
		glossaryTerms: glossary.terms,
		productName,
		revision,
		held,
		coverage,
		filled,
		trlByLeaf,
		readings,
		members
	};
}

/**
 * Everything the dossier holds as filled for one request: what its sections
 * answered for the inline fields (read LIVE off `features`, which a batch may
 * have just written), plus what the readings answered for the blocks edited
 * in a capability of their own.
 */
export function filledKeysOf(
	view: EvolutionView,
	features: ProjectFeaturesDraft,
	request: EvolutionRequest
): Set<string> {
	return new Set([
		...filledKeysOfReadings(view.readings[request.id] ?? []),
		...filledInlineKeys(features, request)
	]);
}

export function maturityOf(
	view: EvolutionView,
	features: ProjectFeaturesDraft,
	request: EvolutionRequest
): MaturityReading {
	return readMaturity(filledKeysOf(view, features, request), request.openQuestionKeys, request.leafIds, blocksFor(request));
}

/* ───────────────────────── The aggregate the MCP reads ───────────────────────── */

const HISTORY_SHOWN = 15;
const DIRECT_IMPACT_SHOWN = 15;
/** A field value longer than this is shown as an excerpt; the section holds it in full. */
const FIELD_EXCERPT = 160;
const PAGE_DEFAULT = 150;
/**
 * Every row of a list, for the page: it renders a whole request at once and is
 * not capped, unlike a tool answer read by an agent runtime.
 */
export const ALL_ROWS = Number.MAX_SAFE_INTEGER;

/**
 * Which part of a dossier a reader asks for. The summary counts what the
 * dossier holds; the lists themselves (every field, every proposal, every
 * impacted node, every report line, the readings, the timeline) come one part
 * at a time, narrowed to one touched feature and paged, so an answer stays
 * readable by an agent runtime that caps tool results and so the same read
 * answers the same size whether the request touches one feature or twenty.
 */
export const DOSSIER_PARTS = [
	'summary',
	'fields',
	'proposals',
	'impact',
	'report',
	'readings',
	'history'
] as const;
export type DossierPart = (typeof DOSSIER_PARTS)[number];
export const isDossierPart = (v: unknown): v is DossierPart =>
	typeof v === 'string' && (DOSSIER_PARTS as readonly string[]).includes(v);

export interface DossierOptions {
	readonly part?: DossierPart;
	/** impact: keep one section of the list (leaves, screens_and_journeys, ...). */
	readonly section?: string;
	/** report: keep one verdict bucket (conform, non_conform, missing, out_of_scope, regression). */
	readonly verdict?: string;
	/**
	 * fields, readings, proposals: keep what belongs to one touched feature.
	 * These three lists hold one row per field per leaf, so a request touching
	 * twenty features answers twenty times a one-feature request; the leaf is
	 * the unit the work is done in, five questions at a time.
	 */
	readonly leaf?: string;
	/** fields, proposals, impact, report, readings: page through a long list. */
	readonly offset?: number;
	readonly limit?: number;
	/** impact: read one hypothesis instead of the current one. */
	readonly hypothesis?: ImpactHypothesis;
}

/** One page of a long list, with what a reader needs to ask for the next one. */
function page<T>(items: readonly T[], opts: DossierOptions) {
	const offset = Math.max(0, Math.floor(opts.offset ?? 0));
	const limit = Math.max(1, Math.floor(opts.limit ?? PAGE_DEFAULT));
	return { offset, limit, returned: items.slice(offset, offset + limit) };
}

/** One impacted node, short: what it is, how far, what the code has to do; the rest only when it says something. */
const compactFinding = (f: EvolutionRequest['impactFindings'][number]) => ({
	id: f.id,
	section: f.section,
	kind: f.nodeKind,
	nodeId: f.nodeId,
	label: f.nodeLabel,
	depth: f.depth,
	verb: impactVerb(f),
	work: f.codeWork,
	...(f.migrationImplied !== null ? { migration: f.migrationImplied } : {}),
	...(f.ruleWork !== null ? { rules: f.ruleWork } : {}),
	...(f.depth > 1 && f.groupPath.length > 0 ? { via: f.groupPath[f.groupPath.length - 1] } : {})
});

const compactLine = (l: EvolutionRequest['implementationFindings'][number]) => ({
	id: l.id,
	verdict: l.verdict,
	requirement: l.requirement,
	filePath: l.filePath,
	lineRange: l.lineRange,
	specStatement: l.specStatement,
	codeStatement: l.codeStatement,
	acceptanceTestPassing: l.acceptanceTestPassing,
	decision: l.decision
});

const countBy = <T,>(items: readonly T[], key: (item: T) => string): Record<string, number> => {
	const out: Record<string, number> = {};
	for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1;
	return out;
};

const headOf = (request: EvolutionRequest) => ({
	id: request.id,
	title: request.title,
	stage: request.stage,
	status: request.status
});

/** Who was tagged on a proposal and what each one said, by name where the roster knows it. */
function reviewersOf(view: EvolutionView, p: Proposal) {
	const nameOf = (id: string) => view.members.find((m) => m.id === id)?.name ?? id;
	return p.reviewerIds.map((id) => {
		const verdict = p.verdicts.find((v) => v.by === id) ?? null;
		return { id, name: nameOf(id), verdict: verdict?.verdict ?? null, comment: verdict?.comment ?? '', at: verdict?.at ?? null };
	});
}

/**
 * One row per inline field per touched leaf: what the owning section holds
 * today, whether it counts as filled, the question left open on it, the
 * proposal waiting on it and the thread it carries.
 *
 * This is the list that makes a dossier grow: five questions on twenty
 * features is a hundred rows, which is why it is read a leaf at a time
 * (fieldsPart) and only counted in the summary.
 */
export function dossierFieldRows(view: EvolutionView, request: EvolutionRequest) {
	const features = view.features;
	const pending = pendingProposals(request);
	return blocksFor(request).flatMap((block) =>
		block.fields.flatMap((field) => {
			if (field.editor !== 'inline') return [];
			const homes = request.leafIds.length > 0 ? request.leafIds : [null];
			return homes.map((leafId) => {
				const key = fieldKey(field.path, leafId);
				const read = leafId ? readDossierField(features, field.path, leafId) : { value: '', sourceIds: [] };
				const proposal = pending.find((p) => p.targetField === field.path && leafOf(p) === leafId) ?? null;
				const thread = latestThread(request, key) ?? null;
				const excerpted = read.value.length > FIELD_EXCERPT;
				return {
					path: field.path,
					block: block.id,
					label: field.label,
					critical: field.critical,
					leafId,
					// The value as the section holds it, or an excerpt when it is long:
					// get_section(features) carries it in full, and a proposal is written
					// against that full value.
					value: excerpted ? `${read.value.slice(0, FIELD_EXCERPT - 3)}...` : read.value,
					...(excerpted ? { valueLength: read.value.length } : {}),
					filled: holdsValue(field, read.value),
					openQuestion: request.openQuestionKeys.includes(key),
					pendingProposalId: proposal?.id ?? null,
					thread: thread ? { id: thread.id, state: thread.state, messages: thread.messages } : null
				};
			});
		})
	);
}

/** Keeps what belongs to one touched feature, when the reader named one. */
const forLeaf = <T extends { leafId: string | null }>(items: readonly T[], leaf?: string) =>
	leaf ? items.filter((item) => item.leafId === leaf) : items;

/** The fields of a request, narrowed to one touched feature and paged. */
export function fieldsPart(view: EvolutionView, request: EvolutionRequest, opts: DossierOptions = {}) {
	const all = dossierFieldRows(view, request);
	const kept = forLeaf(all, opts.leaf);
	const paged = page(kept, opts);
	return {
		...headOf(request),
		fields: {
			leaf: opts.leaf ?? null,
			total: all.length,
			matched: kept.length,
			offset: paged.offset,
			limit: paged.limit,
			entries: paged.returned
		}
	};
}

/** The pending proposals in full: value, reasoning, sources, reviewers, and whether a person may accept each as it stands. */
export function proposalsPart(
	view: EvolutionView,
	request: EvolutionRequest,
	actor: Actor,
	opts: DossierOptions = {}
) {
	const all = request.proposals
		.filter((p) => p.decision === 'pending' || p.decision === 'reworded')
		.map((p) => ({ ...p, leafId: leafOf(p) }));
	const kept = forLeaf(all, opts.leaf);
	const paged = page(kept, opts);
	return {
		...headOf(request),
		proposals: {
			leaf: opts.leaf ?? null,
			total: all.length,
			matched: kept.length,
			offset: paged.offset,
			limit: paged.limit,
			entries: paged.returned.map((p) => ({
				id: p.id,
				targetField: p.targetField,
				leafId: p.leafId,
				canonicalPath: p.canonicalPath,
				value: p.value,
				reasoning: p.reasoning,
				citedSourceIds: p.citedSourceIds,
				bannedSynonymDetected: p.bannedSynonymDetected,
				decision: p.decision,
				reviewerIds: p.reviewerIds,
				reviewers: reviewersOf(view, p),
				acceptable: canAcceptProposal({ ...actor, kind: 'person' }, p)
			}))
		}
	};
}

/** Every impacted node under one hypothesis (the current one by default), filtered by section and paged. */
export function impactPart(request: EvolutionRequest, opts: DossierOptions = {}) {
	const hypothesis = opts.hypothesis ?? request.impactReport.hypothesis;
	const all = request.impactFindings.filter((f) => f.hypothesis === hypothesis);
	const current = hypothesis === request.impactReport.hypothesis;
	const kept = opts.section ? all.filter((f) => f.section === opts.section) : all;
	const paged = page(kept, opts);
	return {
		...headOf(request),
		impact: {
			status: current ? request.impactReport.status : all.length > 0 ? ('ready' as const) : ('not_run' as const),
			hypothesis,
			depth: request.impactReport.depth,
			ranAt: current ? request.impactReport.ranAt : null,
			total: all.length,
			bySection: countBy(all, (f) => f.section),
			summary: impactSummaryLine(all, hypothesis),
			plain: impactInPlainWords(all, hypothesis),
			section: opts.section ?? null,
			matched: kept.length,
			offset: paged.offset,
			limit: paged.limit,
			findings: paged.returned.map(compactFinding)
		}
	};
}

/** Every line of the current iteration's report, filtered by verdict and paged. */
export function reportPart(request: EvolutionRequest, opts: DossierOptions = {}) {
	const all = currentLines(request);
	const kept = opts.verdict ? all.filter((l) => l.verdict === opts.verdict) : all;
	const paged = page(kept, opts);
	const canClose = canCloseReport(request);
	return {
		...headOf(request),
		iteration: request.iteration,
		specVersion: request.specVersion,
		report: {
			status: request.iterations.find((i) => i.number === request.iteration)?.reportStatus ?? 'building',
			counts: countBy(all, (l) => l.verdict),
			undecided: undecidedCount(request),
			canClose: canClose.ok ? null : canClose.reason,
			verdict: opts.verdict ?? null,
			matched: kept.length,
			offset: paged.offset,
			limit: paged.limit,
			lines: paged.returned.map(compactLine)
		}
	};
}

/** The readings of the blocks edited elsewhere, narrowed to one touched feature and paged. */
export function readingsPart(view: EvolutionView, request: EvolutionRequest, opts: DossierOptions = {}) {
	const all = view.readings[request.id] ?? [];
	const kept = forLeaf(all, opts.leaf);
	const paged = page(kept, opts);
	return {
		...headOf(request),
		readings: {
			leaf: opts.leaf ?? null,
			total: all.length,
			matched: kept.length,
			offset: paged.offset,
			limit: paged.limit,
			entries: paged.returned.map((r) => ({
				key: r.key,
				fieldPath: r.fieldPath,
				leafId: r.leafId,
				filled: r.filled,
				summary: r.summary,
				names: r.names,
				moving: r.moving.map((m) => ({ kind: m.kind, label: m.label, work: m.work }))
			}))
		}
	};
}

/** The whole timeline, newest first. */
export function historyPart(request: EvolutionRequest) {
	return {
		...headOf(request),
		history: timeline(request).map((h) => ({
			type: h.type,
			summary: h.summary,
			authorId: h.authorId,
			authorKind: h.authorKind,
			channel: h.channel,
			recordedAt: h.recordedAt
		}))
	};
}

/** One heavy part of a dossier, on demand. */
export function requestPart(
	view: EvolutionView,
	request: EvolutionRequest,
	actor: Actor,
	opts: DossierOptions & { part: Exclude<DossierPart, 'summary'> }
) {
	switch (opts.part) {
		case 'fields':
			return fieldsPart(view, request, opts);
		case 'proposals':
			return proposalsPart(view, request, actor, opts);
		case 'impact':
			return impactPart(request, opts);
		case 'report':
			return reportPart(request, opts);
		case 'readings':
			return readingsPart(view, request, opts);
		case 'history':
			return historyPart(request);
	}
}

/**
 * One request in short: what a person or a client needs to act on it, in
 * numbers. Every list it counts is one part away, narrowed to one touched
 * feature and paged, so this answer is the same size whether the request
 * touches one feature or twenty.
 */
export function requestSummary(view: EvolutionView, request: EvolutionRequest, actor: Actor) {
	const head = headOf(request);
	const features = view.features;
	const maturity = maturityOf(view, features, request);
	const coherence = readCoherence(request);
	const readiness = readReadiness(request, view.trlByLeaf);
	const gate = gateReading(request, maturity.criticalEmptyCount);
	const pending = pendingProposals(request);
	const readings = view.readings[request.id] ?? [];
	const fields = dossierFieldRows(view, request);

	const impactAll = findingsForCurrentHypothesis(request);
	const lines = currentLines(request);
	const canClose = canCloseReport(request);

	return {
		...head,
		origin: request.origin,
		requester: request.requester,
		shownStage: supportedStage(request, maturity.criticalEmptyCount),
		createdAt: request.createdAt,
		leafIds: request.leafIds,
		leaves: request.leafIds.map((id) => ({ id, name: view.leaves.find((l) => l.id === id)?.name ?? id })),
		iteration: request.iteration,
		specVersion: request.specVersion,
		frozen: request.frozen,
		frozenVersions: request.frozenVersions,
		maturity: {
			score: maturity.score,
			tier: maturity.tier,
			criticalEmptyFields: maturity.criticalEmptyFields,
			openQuestionCount: maturity.openQuestionCount,
			statement: maturity.statement,
			blocks: maturity.perBlock.map((b) => ({
				id: b.block.id,
				title: b.block.title,
				state: b.state,
				percent: b.percent,
				filled: b.filled,
				of: b.block.fields.length,
				openQuestions: b.openQuestions
			}))
		},
		coherence: {
			available: coherence.available,
			overall: coherence.overall,
			delta: coherence.delta,
			blockingUndecided: coherence.blockingUndecided,
			ranAt: request.coherenceReport.ranAt,
			findings: publishedFindings(request).map((f) => ({
				id: f.id,
				axis: f.axis,
				severity: f.severity,
				title: f.title,
				requestNodeId: f.requestNodeId,
				existingNodeId: f.existingNodeId,
				fixNowTarget: f.fixNowTarget
			}))
		},
		readiness: { average: readiness.average, leaves: readiness.leaves },
		// The impact in short: how much moves per section, and the direct hits.
		// The whole list is one part away (part=impact, optionally per section).
		impact: {
			status: request.impactReport.status,
			hypothesis: request.impactReport.hypothesis,
			depth: request.impactReport.depth,
			ranAt: request.impactReport.ranAt,
			total: impactAll.length,
			// Every hypothesis that was run, with what it moves: the three read
			// differently (add extends, change reworks, remove strips) and each run
			// keeps its own findings, so a reader sees the three side by side and
			// reads any of them in full with part:"impact" + hypothesis.
			byHypothesis: countBy(request.impactFindings, (f) => f.hypothesis),
			bySection: countBy(impactAll, (f) => f.section),
			// One line per plane, read without the spec open (ac-evo-imp-10).
			plain: impactInPlainWords(impactAll),
			direct: impactAll.filter((f) => f.depth <= 1).slice(0, DIRECT_IMPACT_SHOWN).map(compactFinding)
		},
		// The fields in numbers. The rows themselves are one part away
		// (part=fields, one leaf at a time): a hundred of them would make this
		// answer grow with the number of features the request touches.
		fields: {
			total: fields.length,
			filled: fields.filter((f) => f.filled).length,
			empty: fields.filter((f) => !f.filled).length,
			critical: fields.filter((f) => f.critical).length,
			criticalEmpty: fields.filter((f) => f.critical && !f.filled).length,
			openQuestions: fields.filter((f) => f.openQuestion).length,
			awaitingProposal: fields.filter((f) => f.pendingProposalId !== null).length,
			discussed: fields.filter((f) => f.thread !== null).length
		},
		// The readings in numbers; each one, with its names and what moves, is
		// one part away (part=readings, one leaf at a time).
		readings: {
			total: readings.length,
			filled: readings.filter((r) => r.filled).length,
			unfilled: readings.filter((r) => !r.filled).length,
			moving: readings.filter((r) => r.moving.length > 0).length
		},
		openQuestions: request.openQuestionKeys.length,
		// The proposals waiting for a signature, in numbers: one per empty field
		// per leaf, so the list belongs to its own part (part=proposals, one
		// leaf at a time), where each carries its value, reasoning and sources.
		proposals: {
			pending: pending.length,
			flagged: pending.filter((p) => p.bannedSynonymDetected).length,
			tagged: pending.filter((p) => p.reviewerIds.length > 0).length,
			blocked: pending.filter((p) => !canAcceptProposal({ ...actor, kind: 'person' }, p).ok).length
		},
		gate: {
			next: gate.next,
			ok: gate.verdict.ok,
			reason: gate.verdict.ok ? null : gate.verdict.reason,
			detail: gate.verdict.ok ? null : gate.verdict.detail
		},
		waiver: openWaiver(request),
		// The report in short; the lines are one part away (part=report, optionally per verdict).
		report: {
			iteration: request.iteration,
			status: request.iterations.find((i) => i.number === request.iteration)?.reportStatus ?? 'building',
			counts: countBy(lines, (l) => l.verdict),
			total: lines.length,
			undecided: undecidedCount(request),
			canClose: canClose.ok ? null : canClose.reason
		},
		observations: request.observations.map((o) => ({
			id: o.id,
			type: o.type,
			body: o.body,
			screenId: o.screenId,
			ruling: o.ruling,
			rulingReason: o.rulingReason,
			foldedBackAt: o.foldedBackAt,
			foldedBackLeafId: o.foldedBackLeafId
		})),
		acceptanceDebt: acceptanceDebt(request),
		history: timeline(request)
			.slice(0, HISTORY_SHOWN)
			.map((h) => ({
				type: h.type,
				summary: h.summary,
				authorId: h.authorId,
				authorKind: h.authorKind,
				channel: h.channel,
				recordedAt: h.recordedAt
			}))
	};
}


/** One dossier in short, or one heavy part of it. */
export function requestDossier(
	view: EvolutionView,
	request: EvolutionRequest,
	actor: Actor,
	opts: DossierOptions = {}
) {
	const part = opts.part ?? 'summary';
	return part === 'summary'
		? requestSummary(view, request, actor)
		: requestPart(view, request, actor, { ...opts, part });
}

export type DossierSummary = ReturnType<typeof requestSummary>;
export type FieldsPart = ReturnType<typeof fieldsPart>;
export type ProposalsPart = ReturnType<typeof proposalsPart>;
/** One field of a request: what the page renders and what part="fields" returns. */
export type DossierFieldRow = ReturnType<typeof dossierFieldRows>[number];
/** One pending proposal: what the page renders and what part="proposals" returns. */
export type ProposalRow = ProposalsPart['proposals']['entries'][number];
/** A dossier without its field rows: what every reader of it shares. */
export type DossierCounts = Omit<DossierSummary, 'fields'>;
/**
 * The dossier as the page reads it: the same reading, except that the page is
 * not capped, so it shows the field rows themselves where a tool answer shows
 * how many there are.
 */
export type DossierReading = DossierCounts & { readonly fields: readonly DossierFieldRow[] };
export type ImpactPart = ReturnType<typeof impactPart>;
export type ReportPart = ReturnType<typeof reportPart>;
export type HistoryPart = ReturnType<typeof historyPart>;

/** The board: one card per live request. */
export type RequestCardView = ReturnType<typeof requestCard>;

export function requestCard(view: EvolutionView, request: EvolutionRequest) {
	const maturity = maturityOf(view, view.features, request);
	return {
		id: request.id,
		title: request.title,
		origin: request.origin,
		status: request.status,
		stage: request.stage,
		shownStage: supportedStage(request, maturity.criticalEmptyCount),
		leafIds: request.leafIds,
		specVersion: request.specVersion,
		maturity: maturity.score,
		criticalEmpty: maturity.criticalEmptyCount,
		openQuestions: request.openQuestionKeys.length,
		pendingProposals: pendingProposals(request).length,
		coherenceDelta: request.coherenceReport.requestDelta,
		blockingFindings: publishedFindings(request).filter((f) => f.severity === 'blocking').length,
		undecidedLines: undecidedCount(request),
		acceptanceDebt: acceptanceDebt(request),
		waived: openWaiver(request) !== null
	};
}

export function evolutionAggregate(
	view: EvolutionView,
	actor: Actor,
	requestId?: string,
	opts: DossierOptions = {}
) {
	const live = view.draft.requests.filter((r) => r.status !== 'deleted');
	const one = requestId ? live.find((r) => r.id === requestId) ?? null : null;
	// One part of one dossier: nothing else travels with it.
	if (one && opts.part && opts.part !== 'summary') {
		return { projectId: view.projectId, revision: view.revision, requests: [], request: requestDossier(view, one, actor, opts) };
	}
	// One dossier in short: the board's lists (every leaf, every source) stay on
	// the board, so a request touching several features still fits one answer.
	if (one) {
		return {
			projectId: view.projectId,
			productName: view.productName,
			revision: view.revision,
			actor: { id: actor.id, kind: actor.kind, role: actor.role, channel: actor.channel ?? 'page' },
			fieldsAvailable: fieldsAvailable(),
			originsAvailable: originsAvailable(),
			// The roster a proposal can be handed to; empty where one member is alone.
			members: view.members,
			requests: [],
			request: requestSummary(view, one, actor)
		};
	}
	return {
		projectId: view.projectId,
		productName: view.productName,
		revision: view.revision,
		actor: { id: actor.id, kind: actor.kind, role: actor.role, channel: actor.channel ?? 'page' },
		leaves: view.leaves,
		sources: view.sources.map((s) => ({ id: s.id, title: s.title })),
		fieldsAvailable: fieldsAvailable(),
		originsAvailable: originsAvailable(),
		requests: live.map((r) => requestCard(view, r)),
		request: null
	};
}

/**
 * Where a change may come from: the six codes `open_request` takes. Served with
 * the board and with every dossier, because this is where a client looks before
 * opening a request, and an enumeration nobody can read is an enumeration
 * nobody can pick from.
 */
function originsAvailable() {
	return REQUEST_ORIGINS.map((origin) => ({ code: origin.code, label: origin.label }));
}

/** The field paths a client may propose on, with the question each one answers. */
function fieldsAvailable() {
	return ALL_BLOCK_FIELDS.filter((f) => f.editor === 'inline').map((f) => ({
		path: f.path,
		label: f.label,
		question: f.question,
		critical: f.critical,
		kind: f.kind,
		leafScoped: f.canonicalPath.includes('{leaf}')
	}));
}
