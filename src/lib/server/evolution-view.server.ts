import { proofImpactHeadline } from '$lib/domain/evolution/proof-impact';
import { boardOrderOf, crossEvolutionsOf, landingOrderReading } from './evolution-cross.server';
import type { SpecLanguage } from '$domain/language';
import type { AppServices } from '$composition/container.server';
import { codeReadingOf, deferredCarriers, deferredSuggestions, freezeHeldOf, withBuildCodeGate } from '$domain/evolution';
import { correctionReading } from '$domain/evolution';
import { assistantAvailable } from '$domain/settings';
import {
	ALL_BLOCK_FIELDS,
	DESCRIBED_STEPS,
	MAX_OPEN_CUSTOM_QUESTIONS,
	fieldValidationOf,
	flaggedWordsIn,
	openCustomQuestions,
	openQuestionsOnField,
	stepDescriptionKey,
	stepAnswerKey,
	FUNCTIONAL_DIAGRAM_KEY,
	journeyPaths,
	liveSectionDrafts,
	liveRuleDrafts,
	ruleChangeKey,
	ruleChangeFingerprint,
	liveFindingDrafts,
	findingChangeKey,
	findingChangeFingerprint,
	liveDataDrafts,
	dataChangeKey,
	dataChangeFingerprint,
	DATAMAP_THREAD_KEY,
	sectionChangeKey,
	sectionChangeFingerprint,
	SPEC_PAGES,
	readFunctionalDiagram,
	functionalDiagramWords,
	technicalDiagramWords,
	diagramBehindTexts,
	behindSince,
	textsBehindDiagram,
	STEP_QUESTIONS,
	skippedQuestionOf,
	versionsOf,
	NEED_BLOCK,
	dockingCounts,
	dockingMap,
	withDraftNames,
	NEED_FIELDS,
	isAskedOn,
	needCriticalEmpty,
	needKeyOf,
	ORIGIN_ANSWER_KEYS,
	ORIGIN_FIELDS,
	readPath,
	subjectKindOf,
	blocksFor,
	capabilityReadings,
	fieldKey,
	lastSessionOf,
	openProjectSessionOf,
	subjectHolder,
	type LiveSession,
	stepPrefillOf,
	filledKeysOfReadings,
	gateReading,
	concurrentHoldOf,
	specificationHold,
	specificationLeft,
	describingDraft,
	DESCRIPTION_PATH,
	isDescriptionPath,
	landedDescription,
	specificationStanding,
	type SpecificationHold,
	type SpecificationItemKind,
	type SpecificationActions,
	NO_ACTIONS_COUNTED,
	holdsValue,
	latestThread,
	leafOf,
	openWaiver,
	pendingProposals,
	publishedFindings,
	readCoherence,
	REQUEST_ORIGINS,
	readRequestMaturity,
	supportedStage,
	undecidedCount,
	toBuildCount,
	awaitingCodeCount,
	awaitingPersonCount,
	fieldOrigin,
	dataChangeView,
	readVersions,
	draftChangeNodes,
	behaviourElementNames,
	type ElementNames,
	stepSinceOf,
	inheritedUndecidedCount,
	isRequestLine,
	blockFieldByPath,
	canCloseReport,
	canAcceptProposal,
	findRequestByRef,
	requestKeyOf,
	requestSeenBy,
	currentLines,
	draftFor,
	listDelta,
	requestPagePath,
	sessionsInProgress,
	touchedLeafIds,
	usedFeatures,
	acceptanceDebt,
	findingsForCurrentHypothesis,
	impactInPlainWords,
	emptyImpactReason,
	impactSummaryLine,
	impactVerb,
	isNothingMovesLine,
	timeline,
	type Actor,
	type CapabilityReading,
	type EdgeCaseSentence,
	type EvolutionRequest,
	type FindingScope,
	type ImpactHypothesis,
	type LeafBehaviour,
	type MaturityReading,
	type ProjectEvolutionDraft,
	type Proposal,
	isDraftLeafId,
	behaviourOperationCount,
	findingHoldsGate,
	coachOf,
	awaitedAmong,
	goneFrom,
	personKey,
	type AiDelegation,
	stepOfTarget,
	validationOf,
	withoutGoneValidators
} from '$domain/evolution';
import type { PersonJobs } from '$application/ports';
import { draftCarriedValue, readDossierField, readHeldField, readTouchedField } from '$application/evolution/save-dossier-field';
import { resolveWalkTarget } from '$application/analysis/simulate-behavior';
import { leafFeatures, type ProjectFeaturesDraft } from '$domain/features';
import type { ProjectDataDraft } from '$domain/data';
import type { GlossaryTerm } from '$domain/glossary';
import type { FeatureImplementationCoverage } from '$application/use-cases';
import { boundPart, boundSummary } from './evolution-summary-bound';

/** One member of the workspace, as the dossier reads them. */
export interface EvolutionMember {
	readonly id: string;
	readonly name: string;
	readonly role: string;
	/** What they do on the project, by name; absent where nobody said (ac-team-jobs-shown). */
	readonly jobs?: readonly string[];
	/** The same jobs by id: what the suggestions read (ac-evo-req-validator-suggestions). */
	readonly jobIds?: readonly string[];
}

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
	readonly readings: Readonly<Record<string, CapabilityReading[]>>;
	/**
	 * The workspace roster a proposal can be handed to, and the people who can
	 * be named to validate (id = email, the name the actor carries), each with
	 * what they do on the project where the workspace says it (ac-team-jobs-shown).
	 * Empty where one member is alone: no reviewer to tag.
	 */
	readonly members: readonly EvolutionMember[];
	/** The data model as it stands, read only: what a request's data changes are drawn against (ac-evo-imp-erd). */
	readonly data: ProjectDataDraft;
	/** The language the spec is written in: the texts the dossier generates follow it. */
	readonly language: SpecLanguage;
	/** Whether the installation's built-in assistant is switched on and connected (ac-evo-diagram-assistant). */
	readonly assistantAvailable: boolean;
	/** The names of each touched feature's behaviour elements, by id, so a draft's changes read by name (ac-evo-draft-changes-named). */
	readonly elementNames?: Readonly<Record<string, ElementNames>>;
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

/**
 * A value carried by the DRAFT itself, for a field the owning section has not
 * been written for yet.
 *
 * A draft opened with an objective, a problem and a value holds them on its own
 * row, and the maturity used to read only the section, so it reported those
 * fields empty and asked a person to sign values that already existed. Read from
 * both, and the count says what is actually written.
 */

/**
 * What the request PROPOSES, read from its own drafts.
 *
 * The impact report used to print three columns, one per hypothesis, and ask the
 * reader to pick. That question is already answered: a draft declares its kind.
 * On a request that both adds and amends, which is the ordinary case, none of the
 * three columns described what the request does, and the reader could not choose.
 *
 * `byLeaf` gives the verb a touched feature carries; `main` is what the request
 * does overall, used for the nodes the walk merely reached, which belong to no
 * draft of their own.
 */
export function proposedKinds(request: EvolutionRequest): {
	byLeaf: Record<string, ImpactHypothesis>;
	main: ImpactHypothesis;
} {
	const verbOf = (kind: string): ImpactHypothesis =>
		kind === 'add' ? 'add' : kind === 'remove' ? 'remove' : 'change';
	const byLeaf: Record<string, ImpactHypothesis> = {};
	for (const draft of request.drafts) {
		byLeaf[draft.id] = verbOf(draft.kind);
		// An amendment stands for the feature it amends, so that feature reads with
		// the draft's verb rather than with the request's overall one.
		if (draft.baseLeafId) byLeaf[draft.baseLeafId] = verbOf(draft.kind);
		if (draft.materialisedAs) byLeaf[draft.materialisedAs] = verbOf(draft.kind);
	}
	const kinds = new Set(Object.values(byLeaf));
	// Removing is the most consequential, then adding; a request that only amends
	// reads as a change, which is also the fallback when it drafts nothing at all.
	const main: ImpactHypothesis = kinds.has('remove')
		? 'remove'
		: kinds.has('add')
			? 'add'
			: 'change';
	return { byLeaf, main };
}

/** The inline fields of a request that hold a value, in their owning section or on the draft. */
export function filledInlineKeys(features: ProjectFeaturesDraft, request: EvolutionRequest): string[] {
	const keys: string[] = [];
	for (const leafId of touchedLeafIds(request)) {
		for (const field of ALL_BLOCK_FIELDS) {
			if (field.editor !== 'inline') continue;
			const written = readTouchedField(features, request, field.path, leafId).value;
			const value = holdsValue(field, written) ? written : draftCarriedValue(request, leafId, field.path);
			if (holdsValue(field, value)) keys.push(fieldKey(field.path, leafId));
		}
	}
	return keys;
}

/**
 * The reachable roster of the project's owning workspace, or nothing where one member is
 * alone, each with what they do on the project. A job that cannot be read
 * leaves the roster as it is: it only orders suggestions.
 */
export async function loadEvolutionMembers(
	services: AppServices,
	projectId: string
): Promise<EvolutionView['members']> {
	try {
		const link = await services.backLinks.find(projectId);
		if (!link) return [];
		const workspaces = await services.workspaces.listForCaller();
		const active = workspaces.find((workspace) => workspace.id === link.backWorkspaceId);
		if (!active) return [];
		if (services.teamJobs.participantsForProject) {
			const people = await services.teamJobs.participantsForProject(active.id, projectId);
			return people.length > 1 ? people.map((person) => ({
				id: person.email, name: person.name, role: person.role ?? 'viewer', jobs: person.names, jobIds: person.jobIds
			})) : [];
		}
		const [listed, jobs] = await Promise.all([
			services.workspaces.listMembers(active.id),
			services.teamJobs.forProject(active.id, projectId).catch((err: unknown) => {
				console.warn('[evolution] team jobs unavailable:', err);
				return new Map<string, PersonJobs>();
			})
		]);
		const members = listed.filter((member) => member.role !== 'mcp').map((m): EvolutionMember => {
			const held = jobs.get(personKey(m.email));
			return {
				id: m.email,
				name: m.name?.trim() || m.email,
				role: m.role,
				...(held && held.names.length > 0 ? { jobs: held.names, jobIds: held.jobIds } : {})
			};
		});
		return members.length > 1 ? members : [];
	} catch (err) {
		console.warn('[evolution] workspace roster unavailable:', err);
		return [];
	}
}

/** What a draft's behaviour model makes, as a reading; null when it has none or it no longer applies. */
async function draftBehaviour(
	services: AppServices,
	evolution: ProjectEvolutionDraft,
	draftId: string
): Promise<LeafBehaviour | null> {
	const target = resolveWalkTarget(draftId, evolution, false);
	if (!target.ok || target.target.kind !== 'draft' || !target.target.model) return null;
	const answer = await services.simulateBehavior.draftFeatureWalk(evolution.projectId, target.target);
	const walk = answer?.kind === 'walk' ? (answer.walk as { ok?: unknown; feature?: unknown }) : null;
	if (walk?.ok !== true || !walk.feature || typeof walk.feature !== 'object') return null;
	// The engine computes the draft over an empty or base feature and stamps it
	// with that feature's date; the model's own date is when the draft last moved.
	const feature = { ...(walk.feature as Record<string, unknown>), updatedAt: target.target.model.updatedAt };
	return leafBehaviourOf(feature, { maturity: null, coverage: null });
}

/** What the Changes board reads: see loadBoardView. */
export type BoardView = Pick<EvolutionView, 'projectId' | 'draft' | 'leaves' | 'members'>;

/**
 * What the Changes board reads, and nothing more: the requests as this reader
 * may see them, the product's features by name and the roster. The board shows
 * each request's key, title, standing and whose AI is at work on it; none of the
 * readings a request's page computes (the behaviour of each feature it touches,
 * its drafts replayed by the engine, the sections its blocks point at) reaches
 * it, so a restart or a write never makes the list wait on the engine.
 */
export async function loadBoardView(
	services: AppServices,
	projectId: string,
	opts: { readonly readerId?: string } = {}
): Promise<BoardView> {
	const [stored, features, members] = await Promise.all([
		services.loadEvolutionDraft.execute(projectId),
		services.loadFeaturesDraft.execute(projectId),
		loadEvolutionMembers(services, projectId)
	]);
	// Projected for the reader like the full view, though the board sends no exchange.
	const draft: ProjectEvolutionDraft = opts.readerId === undefined
		? stored
		: { ...stored, requests: stored.requests.map((r) => requestSeenBy(r, opts.readerId!)) };
	return { projectId, draft, leaves: leafFeatures(features).map((f) => ({ id: f.id, name: f.name })), members };
}

export interface EvolutionViewOptions {
	readonly readerId?: string;
	/**
	 * The requests whose readings a page shows (the behaviour of the features
	 * they touch, their drafts computed by the engine). Every request's by
	 * default: an AI client's board reads each one's maturity. A request's page
	 * reads its own, a comparison none.
	 */
	readonly readingsOf?: (requests: readonly EvolutionRequest[]) => readonly EvolutionRequest[];
}

export async function loadEvolutionView(
	services: AppServices,
	projectId: string,
	opts: EvolutionViewOptions = {}
): Promise<EvolutionView> {
	const [storedDraft, features, register, initDraft, revision, users, data, glossary, architecture, definition, coverage, advice, rules, members, specLanguage, assistant] =
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
			// The maturity-score cache. A leaf the engine has not scored yet reads
			// as unknown, never as zero.
			services.featureAdvice.get(projectId),
			// The edge cases, read as sentences under the Edge cases block.
			services.loadRulesDraft.execute(projectId),
			loadEvolutionMembers(services, projectId),
			services.loadSpecLanguage.execute(projectId),
			// Whether a person can have the built-in assistant draw a diagram (ac-evo-diagram-assistant).
			services.loadAssistantSettings.execute()
		]);
	// A person named who left the workspace is no longer waited on (ac-evo-req-named-validators).
	// Read only against a roster that loaded: one that failed never clears a name.
	const roster = new Set(members.map((m) => personKey(m.id)));
	const rosterDraft: ProjectEvolutionDraft =
		members.length > 1
			? { ...storedDraft, requests: storedDraft.requests.map((r) => withoutGoneValidators(r, roster)) }
			: storedDraft;
	// Project before computing readings: filtering only the serialized draft
	// would still expose private exchanges through its derived page data.
	const draft: ProjectEvolutionDraft = opts.readerId === undefined
		? rosterDraft
		: { ...rosterDraft, requests: rosterDraft.requests.map((r) => requestSeenBy(r, opts.readerId!)) };
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
		// Free security requirements now live in Requirements › Constraints, under their theme.
		[
			'stated expectations',
			definition.definition.constraints.items.filter((c) => /^(security|compliance)$/i.test(c.theme))
		]
	].filter(([, value]) => filledValue(value));

	const held: Record<string, { summary: string; names: string[] }> = {
		'users.roles': summary(users.roles.length, users.roles.map((r) => r.name), 'role'),
		// A grant is one access (role, capability), so a count of grants alone says
		// little a reader can use. What they want to know: which roles hold grants,
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

	// The readings of every request read: what the touched features hold in the
	// behaviour model, the access matrix, the data model and the dependencies,
	// and what the impact report moves. Nothing on the dossier is ticked by
	// hand; an empty reading is what the completion goes and writes.
	const read = opts.readingsOf ? opts.readingsOf(draft.requests) : draft.requests;
	const touchedLeafIds = [...new Set(read.flatMap((r) => r.leafIds))];
	const behaviourByLeaf: Record<string, LeafBehaviour | null> = {};
	// The names a draft's id-only operations are read with (ac-evo-draft-changes-named).
	const elementNames: Record<string, ElementNames> = {};
	await Promise.all(
		touchedLeafIds.map(async (leafId) => {
			try {
				// A draft holds no stored feature: when it carries a behaviour model, the
				// engine computes the feature that model makes, and the reading reads it.
				if (isDraftLeafId(leafId)) {
					behaviourByLeaf[leafId] = await draftBehaviour(services, draft, leafId);
					return;
				}
				const snapshot = await services.behaviorPort.readFeature(projectId, leafId);
				const score = advice.find((a) => a.featureId === leafId)?.score ?? null;
				const cov = coverage[leafId];
				if (snapshot) elementNames[leafId] = behaviourElementNames(snapshot.feature);
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
		grants: users.permissions.map((g) => ({ roleId: g.roleId, capabilityId: g.capabilityId })),
		roles: users.roles.map((r) => ({ id: r.id, name: r.name })),
		dataEntities: data.entities.map((e) => e.name),
		dependsOnByLeaf: Object.fromEntries(
			touchedLeafIds.map((id) => [id, features.leafMeta?.[id]?.dependsOn ?? []])
		),
		held
	};
	const readings: Record<string, CapabilityReading[]> = {};
	for (const request of read) {
		readings[request.id] = capabilityReadings(request, readingInputs, blocksFor(request));
	}

	return {
		data,
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
		readings,
		members,
		language: specLanguage.generated,
		assistantAvailable: assistantAvailable(assistant),
		elementNames
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

/**
 * How much of what the maturity counts this request answered itself, and how
 * much it inherited from the features it touches (2a9716f2). A value is the
 * request's own when it was typed or accepted on this dossier, or when only a
 * draft of this request carries it; anything else the touched feature already
 * held. An inherited value still counts against the holes, because it is not a
 * hole, but it is never an answer the request gave.
 */
export function inheritanceOf(
	features: ProjectFeaturesDraft,
	request: EvolutionRequest
): { answeredHere: number; inherited: number } {
	const answered = new Set(request.answeredKeys);
	let answeredHere = 0;
	let inherited = 0;
	for (const leafId of request.leafIds) {
		for (const field of ALL_BLOCK_FIELDS) {
			if (field.editor !== 'inline') continue;
			const key = fieldKey(field.path, leafId);
			const written = readTouchedField(features, request, field.path, leafId).value;
			const heldBySection = holdsValue(field, written);
			if (!heldBySection && !holdsValue(field, draftCarriedValue(request, leafId, field.path))) continue;
			if (answered.has(key) || !heldBySection) answeredHere += 1;
			else inherited += 1;
		}
	}
	return { answeredHere, inherited };
}

export function maturityOf(
	view: EvolutionView,
	features: ProjectFeaturesDraft,
	request: EvolutionRequest
): MaturityReading {
	// Over the touched FEATURES: an amendment and the leaf it stands for are one
	// feature, as the fields list already reads them. Counted twice, the draft's
	// own id asked for the problem and the value the leaf already held, and the
	// gate into Verify refused a request whose every field was filled.
	return readRequestMaturity(request, filledKeysOf(view, features, request), blocksFor(request));
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
	'sections',
	'drafts',
	'fields',
	'proposals',
	'impact',
	'report',
	'readings',
	'history',
	// Every frozen version kept whole, and what changed from one to the next.
	'versions',
	// The data model a data change is declared against: tables and fields, names and types.
	'data',
	// Computed on demand by the engine: the request as its own graph.
	'graph',
	// The same graph laid on the project's knowledge graph: what the request docks on.
	'docking',
	// In full what the dossier in short cuts to stay under the answer cap (ac-evo-llm-summary-bound):
	// every text of the request with its thread, every coherence finding, every docking point.
	'texts',
	'coherence',
	'points',
	// Every item the Specification gate counts, each with the key validate_field takes (criterion 2df61e72).
	'specification',
	// Without a request: the board's own lists.
	'leaves',
	'sources'
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
	/** report: the request's own lines, or what the touched features already held. */
	readonly scope?: FindingScope;
	/**
	 * summary: the trails of the actions the Specification offers to validate,
	 * read with the engine's graph by an async caller (specificationActionTrails),
	 * or why they could not be read. Without them the Specification's hold counts
	 * its answers and its journey.
	 */
	readonly specificationActions?: SpecificationActions;
}

/** One page of a long list, with what a reader needs to ask for the next one. */
function page<T>(items: readonly T[], opts: DossierOptions) {
	const offset = Math.max(0, Math.floor(opts.offset ?? 0));
	const limit = Math.max(1, Math.floor(opts.limit ?? PAGE_DEFAULT));
	return { offset, limit, returned: items.slice(offset, offset + limit) };
}

/** The plain lines of a report, with the reason it is empty in place of a calm "nothing moves". */
const withEmptyReason = (lines: string[], reason: string | null): string[] =>
	reason ? lines.map((line) => (isNothingMovesLine(line) ? reason : line)) : lines;

/** One impacted node, short: what it is, how far, what the code has to do; the rest only when it says something. */
const compactFinding = (f: EvolutionRequest['impactFindings'][number]) => ({
	id: f.id,
	section: f.section,
	kind: f.nodeKind,
	nodeId: f.nodeId,
	label: f.nodeLabel,
	depth: f.depth,
	...(f.fromLeafId ? { from: f.fromLeafId } : {}),
	...(f.fromChange ? { fromChange: f.fromChange } : {}),
	verb: impactVerb(f),
	// Why this node is in the list at all. The walk computes the sentence; a row
	// that shows only a verb leaves the reader to guess what joined this node to
	// the change, which is the one thing they cannot guess.
	note: f.note,
	work: f.codeWork,
	...(f.migrationImplied !== null ? { migration: f.migrationImplied } : {}),
	...(f.ruleWork !== null ? { rules: f.ruleWork } : {}),
	...(f.depth > 1 && f.groupPath.length > 0 ? { via: f.groupPath[f.groupPath.length - 1] } : {})
});

const compactLine = (l: EvolutionRequest['implementationFindings'][number], href: string) => ({
	id: l.id,
	verdict: l.verdict,
	requirement: l.requirement,
	filePath: l.filePath,
	lineRange: l.lineRange,
	leafId: l.leafId ?? null,
	specStatement: l.specStatement,
	codeStatement: l.codeStatement,
	acceptanceTestPassing: l.acceptanceTestPassing,
	decision: l.decision,
	scope: l.scope ?? 'request',
	// Where a person decides this line.
	href
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
/**
 * One row per inline field per touched feature.
 *
 * `excerpt` belongs to the CALLER, not to the reading. A tool answer has to stay
 * one size whatever the request touches, so it shortens a long value; a screen has
 * room and a reader has eyes, so the page asks for the value whole. Serving the
 * page the shortened one showed an acceptance criterion cut in mid-word, and a
 * reader cannot tell a truncation from a badly written criterion.
 */
const VERSION_EXCERPT = 160;

/** Every field's versions, newest first, each value excerpted unless the caller reads them whole (ac-evo-hist-field-versions). */
function fieldVersionsByKey(request: EvolutionRequest, { excerpt = true }: { excerpt?: boolean } = {}) {
	const keys = [...new Set(request.fieldVersions.map((v) => v.key))];
	return Object.fromEntries(
		keys.map((key) => [
			key,
			versionsOf(request, key).map((v) => ({
				id: v.id,
				value: excerpt && v.value.length > VERSION_EXCERPT ? `${v.value.slice(0, VERSION_EXCERPT - 3)}...` : v.value,
				by: v.by,
				byKind: v.byKind,
				source: v.source,
				at: v.at,
				validatedBy: request.fieldValidations.filter((x) => x.versionId === v.id).map((x) => x.by)
			}))
		])
	);
}

/**
 * The trail of one field (ac-evo-hist-field-versions, -validation, -outside,
 * ac-evo-coach-custom-4, ac-evo-form-glossary): where its current version
 * stands, how many versions it went through, the questions asked of it, and
 * what the glossary says of the value it holds.
 */
export function fieldTrail(view: EvolutionView, request: EvolutionRequest, key: string, value: string) {
	const reading = fieldValidationOf(request, key, value);
	const bannedWords = view.glossaryTerms.flatMap((t) => (t.synonymsAvoid ?? []).map((avoid) => ({ avoid, prefer: t.term })));
	const asked = openQuestionsOnField(request, key).map((q) => ({ id: q.id, question: q.question, why: q.why }));
	// The glossary reads the diagram's words, never its keywords (ac-evo-func-uml-text).
	const glossary = flaggedWordsIn(
		key === stepAnswerKey('functional_spec', FUNCTIONAL_DIAGRAM_KEY)
			? functionalDiagramWords(value)
			: key === stepAnswerKey('technical_spec', FUNCTIONAL_DIAGRAM_KEY)
				? technicalDiagramWords(value)
				: value,
		bannedWords
	);
	// Only what the field actually carries travels, so an untouched field costs
	// a few bytes and the summary stays one size (the versions are part "history").
	return {
		validation: reading.status,
		versionCount: reading.versionCount,
		...(reading.validations.length > 0 ? { validatedBy: reading.validations.map((v) => v.by) } : {}),
		// A person stands behind the current version, not only an AI client that validated it itself (ac-evo-form-step-lock).
		// A person stands behind it, themselves or through their AI under delegation (ac-evo-form-step-lock, ac-evo-llm-delegation-marks).
		...(reading.status !== 'changed_outside' && reading.validations.some((v) => v.byKind === 'person' || v.delegated) ? { humanValidated: true } : {}),
		// Whose validation their AI gave, so the stamp carries the AI sparkle (ac-evo-llm-delegation-marks).
		...(reading.validations.some((v) => v.byKind === 'ai_client') ? { validatedByAi: reading.validations.filter((v) => v.byKind === 'ai_client').map((v) => v.by) } : {}),
		...(reading.refusal ? { refusedBy: reading.refusal.by, refusalReason: reading.refusal.reason ?? '' } : {}),
		...(reading.outdatedValidation ? { outdatedBy: reading.outdatedValidation.by } : {}),
		// The people named on the answer, and how many of them stand behind it (ac-evo-req-named-validators).
		...(reading.expected.length > 0 ? { expected: reading.expected, counted: reading.counted } : {}),
		...(goneFrom(request, key).length > 0 ? { gone: goneFrom(request, key) } : {}),
		...(asked.length > 0 ? { asked } : {}),
		...(glossary.length > 0 ? { glossary } : {})
	};
}

/** The reader's delegation of validation to their own AI, and since when (ac-evo-llm-delegation). */
function aiDelegationOf(view: EvolutionView, request: EvolutionRequest, actor: Actor) {
	const mine = (list: readonly AiDelegation[] | undefined) => (list ?? []).find((d) => personKey(d.personId) === personKey(actor.id)) ?? null;
	const onRequest = mine(request.aiDelegations);
	const onProject = mine(view.draft.aiDelegations);
	return { request: !!onRequest, project: !!onProject, since: onRequest?.at ?? onProject?.at ?? null };
}

/**
 * How much of the Specification a person stands behind (ac-evo-form-step-lock):
 * each written answer of a touched feature, the values an AI typed on a draft
 * included, each path of the journey, each change to the data and, when the
 * caller read them with the engine's graph, each action it offers. The freeze
 * and the Simulation wait for all of it.
 */
export function specificationHoldOf(
	view: EvolutionView,
	request: EvolutionRequest,
	actions: SpecificationActions = NO_ACTIONS_COUNTED,
	rows = dossierFieldRows(view, request)
): SpecificationHold {
	// Actions the engine could not read are not counted as none: the hold says why it cannot count them (criterion c623df9c).
	const items = actions.status === 'read' ? actions.items : [];
	return specificationHold([...specificationEntriesOf(view, request, rows).map((e) => e.trail), ...items], actions.status === 'unread' ? actions.reason : undefined);
}

/**
 * One item the Specification asks to be validated, with the key validate_field
 * takes for it (`fieldPath`, and `leafId` when it has one): what the gate counts,
 * listed so a client never builds a key from a diagram or the code (criterion 2df61e72).
 */
export interface SpecificationEntry {
	readonly fieldPath: string;
	readonly leafId: string | null;
	readonly kind: SpecificationItemKind;
	readonly label: string;
	readonly trail: ReturnType<typeof fieldTrail>;
	readonly href: string;
}

/**
 * Every item of the Specification but the actions, which only the engine's graph
 * names (specificationActionEntries), in the order the gate counts them: the
 * answers of the touched features, the paths of the journey, then the changes to
 * the other pages, to the rules, the findings settled and the data changes.
 */
export function specificationEntriesOf(view: EvolutionView, request: EvolutionRequest, rows = dossierFieldRows(view, request)): SpecificationEntry[] {
	const page = requestPagePath(view.projectId, request.id);
	const leafName = (id: string) => view.leaves.find((l) => l.id === id)?.name || request.drafts.find((d) => d.id === id)?.name || id;
	const tableName = (id: string | null) => (id ? (view.data.entities.find((e) => e.id === id)?.name ?? id) : '');
	const entry = (key: string, kind: SpecificationItemKind, label: string, trail: ReturnType<typeof fieldTrail>): SpecificationEntry => ({ fieldPath: key, leafId: null, kind, label, trail, href: page });
	const drawing = request.stepAnswers.functional_spec?.[FUNCTIONAL_DIAGRAM_KEY] ?? '';
	const paths = journeyPathTrails(view, request);
	const sections = sectionChangeTrails(view, request);
	const rules = ruleChangeTrails(view, request);
	const findings = findingChangeTrails(view, request);
	const data = dataChangeTrails(view, request);
	return [
		...rows
			.filter((f) => f.leafId !== null && f.filled)
			.map((f): SpecificationEntry => ({ fieldPath: f.path, leafId: f.leafId, kind: isDescriptionPath(f.path) ? 'description' : 'answer', label: `${leafName(f.leafId!)} › ${f.label}`, trail: f.trail, href: f.href })),
		...journeyPaths(readFunctionalDiagram(drawing).diagram).map((p) => entry(p.key, 'path', `Path of the journey › ${p.useCase}`, paths[p.key])),
		...liveSectionDrafts(request.sectionDrafts).map((d) => entry(sectionChangeKey(d), 'section_change', `${SPEC_PAGES[d.page].name} › ${d.summary}`, sections[sectionChangeKey(d)])),
		...liveRuleDrafts(request.ruleDrafts).map((d) => entry(ruleChangeKey(d), 'rule_change', `Rules › ${d.summary}`, rules[ruleChangeKey(d)])),
		...liveFindingDrafts(request.findingDrafts).map((d) => entry(findingChangeKey(d), 'finding', `Finding › ${d.title || d.findingId}`, findings[findingChangeKey(d)])),
		...liveDataDrafts(request.dataDrafts).map((d) =>
			entry(dataChangeKey(d), 'data_change', `Data › ${d.kind} table "${d.name || tableName(d.entityId)}"`, data[dataChangeKey(d)])
		)
	];
}

/**
 * The items the Specification gate counts, one page of them, each with its key
 * as validate_field takes it, its kind, where it stands and who validated it
 * (criterion 2df61e72). `total`, `validated` and `left` are the gate's own counts.
 */
export function specificationPart(
	view: EvolutionView,
	request: EvolutionRequest,
	actions: { readonly status: 'read'; readonly entries: readonly SpecificationEntry[] } | { readonly status: 'unread'; readonly reason: string },
	opts: DossierOptions = {}
) {
	// Actions the engine could not read are not listed as none: the part says why (criterion c623df9c).
	const all = [...specificationEntriesOf(view, request), ...(actions.status === 'read' ? actions.entries : [])];
	const hold = specificationHold(all.map((e) => e.trail), actions.status === 'unread' ? actions.reason : undefined);
	// An action is keyed on its feature node of the graph (feature:<leaf id>).
	const kept = opts.leaf ? all.filter((e) => e.leafId === opts.leaf || e.leafId === `feature:${opts.leaf}`) : all;
	const paged = page(kept, opts);
	return {
		...headOf(request),
		specification: {
			total: hold.total,
			validated: hold.validated,
			left: specificationLeft(hold),
			...(hold.unread ? { unread: hold.unread } : {}),
			leaf: opts.leaf ?? null,
			matched: kept.length,
			offset: paged.offset,
			limit: paged.limit,
			items: paged.returned.map((e) => ({
				key: fieldKey(e.fieldPath, e.leafId),
				fieldPath: e.fieldPath,
				leafId: e.leafId,
				kind: e.kind,
				label: e.label,
				standing: specificationStanding(e.trail),
				validatedBy: e.trail.validatedBy ?? [],
				...(e.trail.refusedBy ? { refusedBy: e.trail.refusedBy, refusalReason: e.trail.refusalReason } : {}),
				...(e.trail.outdatedBy ? { outdatedBy: e.trail.outdatedBy } : {}),
				href: e.href
			}))
		}
	};
}

/** What 3.4 Datamap validates and discusses, each only when the request holds it (criterion 3d4f23dd). */
function dataValidationOf(view: EvolutionView, request: EvolutionRequest): {
	changes?: { id: string; key: string; trail: ReturnType<typeof fieldTrail> | null }[];
	thread?: { id: string; state: string; messages: NonNullable<ReturnType<typeof latestThread>>['messages'] };
} {
	const trails = dataChangeTrails(view, request);
	const changes = liveDataDrafts(request.dataDrafts).map((d) => ({ id: d.id, key: dataChangeKey(d), trail: trails[dataChangeKey(d)] ?? null }));
	const thread = latestThread(request, DATAMAP_THREAD_KEY);
	return {
		...(changes.length > 0 ? { changes } : {}),
		...(thread ? { thread: { id: thread.id, state: thread.state, messages: thread.messages } } : {})
	};
}

/** The trail of each change to the data, keyed by its synthetic field (3.4 Datamap, criterion 3d4f23dd). */
function dataChangeTrails(view: EvolutionView, request: EvolutionRequest) {
	return Object.fromEntries(liveDataDrafts(request.dataDrafts).map((d) => [dataChangeKey(d), fieldTrail(view, request, dataChangeKey(d), dataChangeFingerprint(d))]));
}

/** The trail of each change to the rules the whole product keeps, keyed by its synthetic field (ac-evo-draft-rules). */
function ruleChangeTrails(view: EvolutionView, request: EvolutionRequest) {
	return Object.fromEntries(liveRuleDrafts(request.ruleDrafts).map((d) => [ruleChangeKey(d), fieldTrail(view, request, ruleChangeKey(d), ruleChangeFingerprint(d))]));
}

/** The trail of each finding the request settles, keyed by its synthetic field (ac-evo-draft-findings-read). */
function findingChangeTrails(view: EvolutionView, request: EvolutionRequest) {
	return Object.fromEntries(liveFindingDrafts(request.findingDrafts).map((d) => [findingChangeKey(d), fieldTrail(view, request, findingChangeKey(d), findingChangeFingerprint(d))]));
}

/** The findings of Project health the request settles, each with what becomes of it and its validation (ac-evo-draft-findings-read). */
function findingChangesOf(view: EvolutionView, request: EvolutionRequest) {
	const drafts = request.findingDrafts ?? [];
	const trails = findingChangeTrails(view, request);
	const nameOf = (id: string | null) => (id ? (view.leaves.find((l) => l.id === id)?.name ?? null) : null);
	return {
		total: drafts.length,
		landed: drafts.filter((d) => d.materialisedAt !== null).length,
		undecided: drafts.filter((d) => d.materialisedAt === null && d.outcome === 'undecided').length,
		entries: drafts.map((d) => ({
			id: d.id,
			findingId: d.findingId,
			title: d.title,
			featureRef: d.featureRef,
			featureName: nameOf(d.featureRef),
			blocking: d.blocking,
			outcome: d.outcome,
			reason: d.reason,
			key: findingChangeKey(d),
			fingerprint: findingChangeFingerprint(d),
			trail: trails[findingChangeKey(d)] ?? null,
			landedAt: d.materialisedAt,
			settledAs: d.settledAs ?? null
		}))
	};
}

/** The changes to the rules the whole product keeps in short; each rule before and after is one part away (part:"sections"). */
function ruleChangesOf(view: EvolutionView, request: EvolutionRequest) {
	const drafts = request.ruleDrafts ?? [];
	const trails = ruleChangeTrails(view, request);
	return {
		total: drafts.length,
		landed: drafts.filter((d) => d.materialisedAt !== null).length,
		entries: drafts.slice(0, 20).map((d) => ({
			id: d.id,
			summary: d.summary,
			operationCount: d.operations.length,
			key: ruleChangeKey(d),
			fingerprint: ruleChangeFingerprint(d),
			trail: trails[ruleChangeKey(d)] ?? null,
			landedAt: d.materialisedAt
		})),
		...(drafts.length > 20 ? { more: drafts.length - 20 } : {}),
		read: 'get_evolution part:"sections" lists every change to the rules whole, each rule before and after as one EARS sentence.'
	};
}

/** The trail of each change to another page of the spec, keyed by its synthetic field (ac-evo-draft-section-read). */
function sectionChangeTrails(view: EvolutionView, request: EvolutionRequest) {
	return Object.fromEntries(
		liveSectionDrafts(request.sectionDrafts).map((d) => [sectionChangeKey(d), fieldTrail(view, request, sectionChangeKey(d), sectionChangeFingerprint(d))])
	);
}

/** The changes to the other pages of the spec in short: what each changes, the full before / after one part away (part:"sections"). */
function sectionChangesOf(view: EvolutionView, request: EvolutionRequest) {
	const drafts = request.sectionDrafts ?? [];
	const trails = sectionChangeTrails(view, request);
	return {
		total: drafts.length,
		landed: drafts.filter((d) => d.materialisedAt !== null).length,
		entries: drafts.slice(0, 20).map((d) => ({
			id: d.id,
			page: d.page,
			pageName: SPEC_PAGES[d.page].name,
			summary: d.summary,
			editCount: d.edits.length,
			key: sectionChangeKey(d),
			fingerprint: sectionChangeFingerprint(d),
			trail: trails[sectionChangeKey(d)] ?? null,
			landedAt: d.materialisedAt
		})),
		...(drafts.length > 20 ? { more: drafts.length - 20 } : {}),
		read: 'get_evolution part:"sections" lists every change whole, each value before and after.'
	};
}

/** The trail of each path of the Functional spec's drawing, keyed by its synthetic field (ac-evo-spec-journey-paths). */
function journeyPathTrails(view: EvolutionView, request: EvolutionRequest) {
	const drawing = request.stepAnswers.functional_spec?.[FUNCTIONAL_DIAGRAM_KEY] ?? '';
	return Object.fromEntries(journeyPaths(readFunctionalDiagram(drawing).diagram).map((path) => [path.key, fieldTrail(view, request, path.key, path.fingerprint)]));
}

/** The requester and the source as answers of 1.1, each with its trail (ac-evo-form-origin-validated). */
export function originAnswersOf(view: EvolutionView, request: EvolutionRequest) {
	// The operator's placeholder names nobody: the requester is not said.
	const requester = request.requester && request.requester !== 'local-operator' ? request.requester : '';
	const origin = request.origin ?? '';
	return [
		{ path: ORIGIN_ANSWER_KEYS.requester, leafId: null, value: requester, filled: requester.trim() !== '', trail: fieldTrail(view, request, ORIGIN_ANSWER_KEYS.requester, requester) },
		{ path: ORIGIN_ANSWER_KEYS.origin, leafId: null, value: origin, filled: origin !== '', trail: fieldTrail(view, request, ORIGIN_ANSWER_KEYS.origin, origin) }
	];
}

export function dossierFieldRows(
	view: EvolutionView,
	request: EvolutionRequest,
	{ excerpt = true }: { excerpt?: boolean } = {}
) {
	const features = view.features;
	const pending = pendingProposals(request);
	const rows = blocksFor(request).flatMap((block) =>
		block.fields.flatMap((field) => {
			if (field.editor !== 'inline') return [];
			// One home per touched FEATURE: an amendment and the leaf it stands for
			// are one feature, so the five questions are asked once, on the leaf
			// that exists and already holds the answers.
			const touched = touchedLeafIds(request);
			// A subject is asked only what is its own (ac-evo-form-9); a field with
			// a proposal still waiting stays, so a signature is never hidden.
			const homes = (touched.length > 0 ? [...touched] : [null]).filter(
				(leafId) =>
					leafId === null ||
					isAskedOn(field, subjectKindOf(request.drafts, leafId)) ||
					pending.some((p) => p.targetField === field.path && leafOf(p) === leafId)
			);
			return homes.map((leafId) => {
				const key = fieldKey(field.path, leafId);
				// What the amendment carries counts too: the freeze writes it on this leaf. The value
				// is the one a validation stands behind, the behaviour criteria it changes included (criterion 52c53f0c).
				const read = leafId ? readHeldField(features, request, field.path, leafId) : { value: '', sourceIds: [] };
				const proposal = pending.find((p) => p.targetField === field.path && leafOf(p) === leafId) ?? null;
				const thread = latestThread(request, key) ?? null;
				const excerpted = excerpt && read.value.length > FIELD_EXCERPT;
				// Whose each part of the answer is (ac-evo-mat-split-bar): what this request
				// brings (its draft, the value signed on it) and what the feature already held.
				const holding = leafId ? request.drafts.find((d) => (d.id === leafId || d.baseLeafId === leafId) && d.materialisedAs === null) : undefined;
				const origin = leafId
					? fieldOrigin({
							kind: field.kind === 'list' ? 'list' : 'text',
							requestValues: [
								draftCarriedValue(request, leafId, field.path),
								...(holding ? [readDossierField(features, field.path, holding.id).value] : [])
							],
							featureValue: isDraftLeafId(leafId) ? '' : readDossierField(features, field.path, leafId).value
						})
					: null;
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
					...(origin ? { origin } : {}),
					openQuestion: request.openQuestionKeys.includes(key),
					...skipOn(request, key),
					trail: fieldTrail(view, request, key, read.value),
					pendingProposalId: proposal?.id ?? null,
					thread: thread ? { id: thread.id, state: thread.state, messages: thread.messages } : null,
					// Where a person answers or signs this field: the proposal when one
					// waits, the field itself otherwise.
					href: requestPagePath(
						view.projectId,
						request.id,
						proposal ? { kind: 'proposal', id: proposal.id } : { kind: 'field', leafId, path: field.path }
					)
				};
			});
		})
	);
	// The description a draft writes is read and validated with the feature, after its answers, which carry
	// the feature's conversation (criterion e384d594).
	const described: (typeof rows)[number][] = touchedLeafIds(request).flatMap((leafId) => {
		const draft = describingDraft(request.drafts, leafId);
		if (!draft) return [];
		const value = landedDescription(draft, features.features.find((f) => f.id === draft.baseLeafId)?.description ?? '');
		const key = fieldKey(DESCRIPTION_PATH, leafId);
		const thread = latestThread(request, key) ?? null;
		const excerpted = excerpt && value.length > FIELD_EXCERPT;
		return [
			{
				path: DESCRIPTION_PATH,
				block: 'description',
				label: 'Description',
				critical: false,
				leafId,
				value: excerpted ? `${value.slice(0, FIELD_EXCERPT - 3)}...` : value,
				...(excerpted ? { valueLength: value.length } : {}),
				filled: value.trim() !== '',
				openQuestion: false,
				trail: fieldTrail(view, request, key, value),
				pendingProposalId: null,
				thread: thread ? { id: thread.id, state: thread.state, messages: thread.messages } : null,
				href: requestPagePath(view.projectId, request.id)
			}
		];
	});
	return [...rows, ...described];
}

/**
 * One row per question of the need (ac-evo-need-1..5), shaped like a field row
 * so the page signs it the way it signs a feature value. The values live on the
 * request, never in a section.
 */
export function needFieldRows(view: EvolutionView, request: EvolutionRequest) {
	const pending = pendingProposals(request);
	return NEED_FIELDS.map((field) => {
		const key = fieldKey(field.path);
		const needKey = needKeyOf(field.path);
		const value = needKey ? request.need[needKey] : '';
		const proposal = pending.find((p) => p.targetField === field.path) ?? null;
		const thread = latestThread(request, key) ?? null;
		return {
			path: field.path,
			block: NEED_BLOCK.id,
			label: field.label,
			critical: field.critical,
			leafId: null,
			value,
			filled: holdsValue(field, value),
			openQuestion: request.openQuestionKeys.includes(key),
			...skipOn(request, key),
			trail: fieldTrail(view, request, key, value),
			pendingProposalId: proposal?.id ?? null,
			thread: thread ? { id: thread.id, state: thread.state, messages: thread.messages } : null,
			href: requestPagePath(
				view.projectId,
				request.id,
				proposal ? { kind: 'proposal', id: proposal.id } : { kind: 'field', leafId: null, path: field.path }
			)
		};
	});
}

/**
 * The answers a step validated input by input holds, and how many of them are
 * validated at their current version (ac-evo-req-19, ac-evo-form-validate-each):
 * Need and Solution. A step with no answer at all has nothing to validate input
 * by input, and is validated as a whole.
 */
/** How many of the reader's clicks a reading carries: the pending ones and the latest answered. */
const LIVE_CLICKS_SHOWN = 20;

/**
 * The reader's own session with their AI and the clicks it owes them, never
 * anyone else's: one agent per person (ac-evo-live-one-agent). A click shows
 * where it was made while it waits, while the AI holds it, and once answered
 * in the session that answered it (ac-evo-live-click-state).
 */
function liveOf(request: EvolutionRequest, personId: string, project: LiveSession | null) {
	// The session of the whole project covers the request even before it reached it (ac-ai-session-project).
	const own = lastSessionOf(request, personId);
	const last = project && own?.id !== project.id && (!own || own.startedAt <= project.startedAt) ? project : own;
	// The reader's latest prefill of a whole step and the section it is on (ac-evo-live-prefill-step).
	const run = stepPrefillOf(request, personId);
	const mine = request.aiClicks.filter(
		(c) =>
			personKey(c.personId) === personKey(personId) &&
			(c.state === 'waiting' || c.state === 'taken' || ((c.state === 'answered' || c.state === 'cancelled') && !!last && c.at >= last.startedAt))
	);
	return {
		session: last
			? { id: last.id, open: !last.endedAt, startedAt: last.startedAt, endedAt: last.endedAt ?? null, endReason: last.endReason ?? null }
			: null,
		clicks: mine.slice(-LIVE_CLICKS_SHOWN).map((c) => ({
			id: c.id,
			kind: c.kind,
			fieldKey: fieldKey(c.fieldPath, c.leafId),
			step: c.step ?? null,
			messageId: c.messageId ?? null,
			state: c.state,
			// Let go of with nothing written, it reads 'Nothing written', never answered (ac-evo-live-click-state).
			answeredNothing: !!c.answeredNothing,
			at: c.at
		})),
		stepPrefill: run
			? {
					id: run.id,
					step: run.step,
					state: run.state,
					section: run.index + 1,
					of: run.sections.length,
					sectionId: run.sections[run.index].id,
					clickId: run.clickId
				}
			: null
	};
}

/**
 * The thread and the postponing of a text of a step of prose, carried only when
 * there is one, so an untouched text costs nothing (ac-evo-form-question-acts).
 */
function proseThread(request: EvolutionRequest, key: string) {
	const thread = latestThread(request, key);
	return {
		...(thread ? { thread: { id: thread.id, state: thread.state, messages: thread.messages } } : {}),
		...(request.openQuestionKeys.includes(key) ? { openQuestion: true } : {}),
		...skipOn(request, key)
	};
}

/** Who skipped a question on purpose and why, carried only when it is skipped (ac-evo-form-question-skip). */
function skipOn(request: EvolutionRequest, key: string): { skipped?: { by: string; reason: string } } {
	const skip = skippedQuestionOf(request, key);
	return skip ? { skipped: { by: skip.by, reason: skip.reason } } : {};
}

export function inputValidation(view: EvolutionView, request: EvolutionRequest, step: 'need' | 'solution') {
	// The Solution is prose: its description and its answers, never the features it touches (ac-evo-sol-prose).
	const texts: [string, string][] =
		step === 'need'
			? []
			: [
					[stepDescriptionKey('solution'), request.stepDescriptions.solution],
					...STEP_QUESTIONS.filter((q) => q.step === 'solution').map((q): [string, string] => [stepAnswerKey(q.step, q.key), request.stepAnswers.solution[q.key] ?? ''])
				];
	const trails =
		step === 'need'
			? needFieldRows(view, request).filter((f) => f.filled).map((f) => f.trail)
			: texts.filter(([, value]) => value.trim() !== '').map(([key, value]) => fieldTrail(view, request, key, value));
	return { total: trails.length, validated: trails.filter((t) => t.validation === 'validated').length };
}

const DOCKING_SHOWN = 60;

/** The docking map of a request, read against the tree as the features section holds it. */
export function dockingOf(view: EvolutionView, request: EvolutionRequest) {
	const leafMeta = (view.features.leafMeta ?? {}) as Record<string, { dependsOn?: unknown }>;
	const nameOf = (id: string) => view.leaves.find((l) => l.id === id)?.name ?? id;
	return dockingMap(request, {
		knownLeafIds: new Set(view.leaves.map((l) => l.id)),
		dependentsOf: (leafId) =>
			view.leaves.filter((l) => {
				const deps = leafMeta[l.id]?.dependsOn;
				return Array.isArray(deps) && deps.includes(leafId);
			}),
		nameOf
	});
}

/** Keeps what belongs to one touched feature, when the reader named one. */
const forLeaf = <T extends { leafId: string | null }>(items: readonly T[], leaf?: string) =>
	leaf ? items.filter((item) => item.leafId === leaf) : items;

/**
 * What the request proposes, in full.
 *
 * A draft is the only thing on a dossier a client has to read back WHOLE before
 * it can amend it: everything else on the page is a reading of a section that
 * can be read where it lives. Paged like the other lists, for the same reason.
 */
export function draftsPart(
	view: EvolutionView,
	request: EvolutionRequest,
	opts: DossierOptions = {}
) {
	const all = request.drafts;
	const kept = opts.leaf ? all.filter((d) => d.id === opts.leaf || d.baseLeafId === opts.leaf) : all;
	const paged = page(kept, opts);
	return {
		...headOf(request),
		drafts: {
			leaf: opts.leaf ?? null,
			total: all.length,
			matched: kept.length,
			offset: paged.offset,
			limit: paged.limit,
			entries: paged.returned.map((draft) => ({
				id: draft.id,
				kind: draft.kind,
				baseLeafId: draft.baseLeafId,
				baseLeafName: draft.baseLeafId
					? (view.leaves.find((l) => l.id === draft.baseLeafId)?.name ?? draft.baseLeafId)
					: null,
				name: draft.name,
				description: draft.description,
				coreId: draft.coreId,
				parentFamilyId: draft.parentFamilyId,
				objective: draft.objective,
				problem: draft.problem,
				expectedEffect: draft.expectedEffect,
				value: draft.value,
				acceptanceCriteria: draft.acceptanceCriteria,
				...(draft.retireCriteria ? { retireCriteria: draft.retireCriteria } : {}),
				...(draft.changeCriteria ? { changeCriteria: draft.changeCriteria } : {}),
				...(draft.descriptionPatch ? { descriptionPatch: draft.descriptionPatch } : {}),
				...(draft.descriptionAppend ? { descriptionAppend: draft.descriptionAppend } : {}),
				dependsOn: draft.dependsOn,
				sourceIds: draft.sourceIds,
				behaviour: draft.behaviour,
				// What its behaviour model creates, changes and removes, each element by name (ac-evo-draft-changes-named).
				changes: draftChangeNodes([draft], (leafId) => view.elementNames?.[leafId]),
				materialisedAs: draft.materialisedAs,
				materialisedAt: draft.materialisedAt
			}))
		}
	};
}

/** The fields of a request, narrowed to one touched feature and paged. */
export function fieldsPart(
	view: EvolutionView,
	request: EvolutionRequest,
	opts: DossierOptions & { excerpt?: boolean } = {}
) {
	const all = dossierFieldRows(view, request, { excerpt: opts.excerpt });
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
/**
 * What a proposal would CHANGE about a field made of statements.
 *
 * Computed here because the full held value lives here: a field row carries an
 * excerpt, and a delta measured against an excerpt invents additions. Prose
 * fields get nothing: there is no statement to line up.
 */
function listProposalDelta(
	view: EvolutionView,
	request: EvolutionRequest,
	p: { readonly targetField: string; readonly leafId: string | null; readonly value: string }
) {
	// A list of the need is decided line by line too (ac-evo-llm-line-decision): it reads against the request's own answer.
	const needKey = needKeyOf(p.targetField);
	const field = blockFieldByPath(p.targetField) ?? NEED_FIELDS.find((f) => f.path === p.targetField);
	if (!field || field.kind !== 'list' || (!needKey && !p.leafId)) return null;
	const held = needKey ? request.need[needKey] : readTouchedField(view.features, request, p.targetField, p.leafId ?? '').value;
	const delta = listDelta(held, p.value);
	return {
		delta: {
			added: delta.added,
			removed: delta.removed,
			keptCount: delta.kept.length,
			identical: delta.identical
		}
	};
}

/** The pending proposals a person could not accept yet, grouped by the reason. */
function blockedProposals(pending: readonly Proposal[], actor: Actor) {
	const because: Record<string, number> = {};
	let count = 0;
	for (const p of pending) {
		const verdict = canAcceptProposal({ ...actor, kind: 'person' }, p);
		if (verdict.ok) continue;
		count++;
		because[verdict.reason] = (because[verdict.reason] ?? 0) + 1;
	}
	return { count, because: Object.entries(because).map(([reason, n]) => ({ reason, count: n })) };
}

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
				// What the proposal would CHANGE, on a field made of statements. It is
				// computed here because the full held value lives here: the field row
				// carries an excerpt, and a delta against an excerpt invents additions.
				...(listProposalDelta(view, request, p) ?? {}),
				reasoning: p.reasoning,
				citedSourceIds: p.citedSourceIds,
				bannedSynonymDetected: p.bannedSynonymDetected,
				// Each flagged word with the agreed term it stands in for: the flag warns
				// and names the sense it guards, it never blocks the decision.
				flaggedWords: p.flaggedWords,
				keptWordingSense: p.keptWordingSense,
				decision: p.decision,
				reviewerIds: p.reviewerIds,
				reviewers: reviewersOf(view, p),
				acceptable: canAcceptProposal({ ...actor, kind: 'person' }, p),
				// The one fact the AI is missing, asked in the card, and what earlier answers it folds in (ac-evo-live-card-ask).
				ask: p.ask ?? null,
				dialogue: p.dialogue ?? [],
				// Where a person signs it, opening on the card itself.
				href: requestPagePath(view.projectId, request.id, { kind: 'proposal', id: p.id })
			}))
		}
	};
}

/** Every impacted node under one hypothesis (the current one by default), filtered by section and paged. */
export function impactPart(
	request: EvolutionRequest,
	opts: DossierOptions = {},
	lang: SpecLanguage = 'en'
) {
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
			emptyBecause: all.length === 0 && (current ? request.impactReport.status === 'ready' : false) ? emptyImpactReason(request, lang) : null,
			total: all.length,
			bySection: countBy(all, (f) => f.section),
			summary: impactSummaryLine(all, hypothesis, lang),
			plain: withEmptyReason(
				impactInPlainWords(all, hypothesis, lang),
				all.length === 0 && current && request.impactReport.status === 'ready' ? emptyImpactReason(request, lang) : null
			),
			section: opts.section ?? null,
			matched: kept.length,
			offset: paged.offset,
			limit: paged.limit,
			findings: paged.returned.map(compactFinding),
			// What each draft does to the solver's proofs: one line, then the lists.
			proofs: (request.proofImpact ?? []).map((p) => ({ headline: proofImpactHeadline(p, lang), ...p }))
		}
	};
}

/** Every line of the current iteration's report, filtered by verdict and paged. */
/**
 * A report's counts, the request's own lines apart from what the touched
 * features already held. Only the first hold the report open; the second are
 * the features' backlog, shown so nobody mistakes them for this change.
 */
function reportCounts(request: EvolutionRequest, lines: readonly EvolutionRequest['implementationFindings'][number][]) {
	const own = lines.filter(isRequestLine);
	const inherited = lines.filter((l) => !isRequestLine(l));
	return {
		counts: countBy(own, (l) => l.verdict),
		undecided: undecidedCount(request),
		inherited: {
			counts: countBy(inherited, (l) => l.verdict),
			undecided: inheritedUndecidedCount(request),
			gates: false
		},
		baseline: request.baselineKeys
			? "Lines about what the touched features hold that this request's drafts neither bring nor change (what they held at the first freeze, or what a direct change added since) are the features' backlog: listed for information, they never block the request."
			: request.specVersion === 0
				? 'The baseline is taken at the first freeze: until then there is no report.'
				: 'This request was frozen before the baseline existed, so every line is counted as its own.'
	};
}

export function reportPart(projectId: string, request: EvolutionRequest, opts: DossierOptions = {}) {
	const all = currentLines(request);
	const kept = all.filter(
		(l) =>
			(!opts.verdict || l.verdict === opts.verdict) &&
			(!opts.scope || (opts.scope === 'inherited') === !isRequestLine(l))
	);
	const paged = page(kept, opts);
	const canClose = canCloseReport(request);
	return {
		...headOf(request),
		iteration: request.iteration,
		specVersion: request.specVersion,
		report: {
			status: request.iterations.find((i) => i.number === request.iteration)?.reportStatus ?? 'building',
			...reportCounts(request, all),
			canClose: canClose.ok ? null : canClose.reason,
			verdict: opts.verdict ?? null,
			scope: opts.scope ?? null,
			matched: kept.length,
			offset: paged.offset,
			limit: paged.limit,
			lines: paged.returned.map((l) => compactLine(l, requestPagePath(projectId, request.id, { kind: 'line', id: l.id })))
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

/** The whole timeline, newest first; the page reads the versions whole, a tool answer their excerpts. */
export function historyPart(request: EvolutionRequest, { excerpt = true }: { excerpt?: boolean } = {}) {
	return {
		...headOf(request),
		history: timeline(request).map((h) => ({
			type: h.type,
			summary: h.summary,
			authorId: h.authorId,
			authorKind: h.authorKind,
			channel: h.channel,
			recordedAt: h.recordedAt
		})),
		fieldVersions: fieldVersionsByKey(request, { excerpt })
	};
}

/**
 * The versions of a request (ac-evo-freeze-5, -versions-access, -diff): each
 * frozen version newest first, with the copy it kept and what changed from the
 * one before, and what changed since the last freeze when the request was
 * reopened. Read-only: a version is never made the one the code is built against.
 */
export function versionsPart(view: EvolutionView, request: EvolutionRequest) {
	const names = new Map([...view.features.features.map((f) => [f.id, f.name] as const), ...view.data.entities.map((e) => [e.id, e.name] as const)]);
	return {
		...headOf(request),
		specVersion: request.specVersion,
		frozen: request.frozen,
		// A subject that amends or removes a feature reads with that feature's name, never its id.
		leafNames: Object.fromEntries(request.frozenVersions.flatMap((v) => v.snapshot?.subjects ?? []).flatMap((s) => (s.baseLeafId && names.has(s.baseLeafId) ? [[s.baseLeafId, names.get(s.baseLeafId)!]] : []))),
		...readVersions(request, (id) => names.get(id) ?? id)
	};
}

/**
 * The data model a request declares its data changes against (ac-evo-draft-data):
 * every table and its fields, names and types only, with the request's own
 * changes and how they read (ac-evo-imp-erd).
 */
export function dataPart(view: EvolutionView, request: EvolutionRequest) {
	return {
		...headOf(request),
		model: {
			entities: view.data.entities.map((e) => ({ id: e.id, name: e.name })),
			fields: view.data.fields.map((f) => ({ id: f.id, entityId: f.entityId, name: f.name, type: f.type, parentFieldId: f.parentFieldId ?? null }))
		},
		drafts: request.dataDrafts,
		view: dataChangeView(view.data, request.dataDrafts)
	};
}

/** One heavy part of a dossier, on demand. */
export function requestPart(
	view: EvolutionView,
	request: EvolutionRequest,
	actor: Actor,
	opts: DossierOptions & { part: Exclude<DossierPart, 'summary' | 'leaves' | 'sources' | 'graph' | 'docking' | 'sections' | 'specification'> }
) {
	switch (opts.part) {
		case 'drafts':
			return draftsPart(view, request, opts);
		case 'fields':
			return fieldsPart(view, request, opts);
		case 'proposals':
			return proposalsPart(view, request, actor, opts);
		case 'impact':
			return impactPart(request, opts, view.language);
		case 'report':
			return reportPart(view.projectId, request, opts);
		case 'readings':
			return readingsPart(view, request, opts);
		case 'history':
			return historyPart(request);
		case 'versions':
			return versionsPart(view, request);
		case 'data':
			return dataPart(view, request);
		// In full what the dossier in short cuts (ac-evo-llm-summary-bound).
		case 'texts':
		case 'coherence':
		case 'points':
			return boundPart(requestSummary(view, request, actor, opts.specificationActions), opts.part, opts);
	}
}

/**
 * One request in short: what a person or a client needs to act on it, in
 * numbers. Every list it counts is one part away, narrowed to one touched
 * feature and paged, so this answer is the same size whether the request
 * touches one feature or twenty.
 */
/** Absent while no evolution carries a line of the request, so a dossier keeps its size. */
function carriersOf(view: EvolutionView, request: EvolutionRequest): { deferredCarriers?: ReturnType<typeof deferredCarriers> } {
	const carriers = deferredCarriers(view.draft.requests, request);
	return Object.keys(carriers).length > 0 ? { deferredCarriers: carriers } : {};
}

export function requestSummary(view: EvolutionView, request: EvolutionRequest, actor: Actor, specificationActions: SpecificationActions = NO_ACTIONS_COUNTED) {
	const head = headOf(request);
	const features = view.features;
	const maturity = maturityOf(view, features, request);
	const coherence = readCoherence(request);
	// The Build's gate reads its branch too: Start acceptance testing says what holds it (EVO-011, criterion 3cf58130).
	const gate = withBuildCodeGate(
		gateReading(request, maturity.criticalEmptyCount, specificationHoldOf(view, request, specificationActions), concurrentHoldOf(request, view.draft.requests)),
		request,
		view.draft.deploymentBranch ?? ''
	);
	const pending = pendingProposals(request);
	const readings = view.readings[request.id] ?? [];
	const fields = dossierFieldRows(view, request);

	const impactAll = findingsForCurrentHypothesis(request);
	const lines = currentLines(request);
	const canClose = canCloseReport(request);

	const needRows = needFieldRows(view, request);
	const docking = dockingOf(view, request);
	const owedOnSubjects = fields.filter((f) => (!f.filled || f.openQuestion) && f.pendingProposalId === null && !f.skipped).length;
	const path = readPath(request, { questionsOwed: owedOnSubjects, pendingProposals: pending.length });

	return {
		...head,
		// The key a person quotes it by, like a ticket number.
		key: requestKeyOf(view.draft.requests, request.id),
		// The request's page, for a person to open it.
		href: requestPagePath(view.projectId, request.id),
		// Why the change exists, asked once (ac-evo-need-1..5).
		need: { fields: needRows, owed: needCriticalEmpty(request) },
		// The description each step opens on, with its trail (ac-evo-form-step-description).
		// The evolutions that carry a deferred omission of this request, by line (criterion 03b7eacf).
		...carriersOf(view, request),
		stepDescriptions: DESCRIBED_STEPS.map((step) => ({
			step,
			value: request.stepDescriptions[step],
			trail: fieldTrail(view, request, stepDescriptionKey(step), request.stepDescriptions[step]),
			...proseThread(request, stepDescriptionKey(step))
		})),
		// The answers to the questions the steps of prose ask after their description
		// (ac-evo-sol-prose, ac-evo-func-prose, ac-evo-tech-prose); the questions
		// themselves are the domain's, and an untouched answer is not sent at all, so
		// the summary stays one size.
		stepAnswers: STEP_QUESTIONS.flatMap((q) => {
			const key = stepAnswerKey(q.step, q.key);
			const value = request.stepAnswers[q.step][q.key] ?? '';
			const trail = fieldTrail(view, request, key, value);
			const talk = proseThread(request, key);
			return value !== '' || trail.versionCount > 0 || Object.keys(talk).length > 0 ? [{ step: q.step, key: q.key, value, trail, ...talk }] : [];
		}),
		// Whether the diagram follows the texts of its step, since when it does not, and the texts it moved past (ac-evo-func-uml-sync).
		functionalDiagram: { behind: diagramBehindTexts(request), since: behindSince(request), textsBehind: textsBehindDiagram(request) },
		technicalDiagram: {
			behind: diagramBehindTexts(request, 'technical_spec'),
			since: behindSince(request, 'technical_spec'),
			textsBehind: textsBehindDiagram(request, 'technical_spec')
		},
		// Whether the page may have the built-in assistant draw a diagram behind its texts (ac-evo-diagram-assistant).
		assistant: { available: view.assistantAvailable },
		// The reader's live session with their AI and the clicks it still owes them (ac-evo-live-start, -click-state).
		live: liveOf(request, actor.id, openProjectSessionOf(view.draft, actor.id, subjectHolder(view.draft, actor.id, { kind: 'request', requestId: request.id }) ?? undefined)),
		// What was asked of this request in particular, open ones first (ac-evo-coach-custom-1).
		customQuestions: {
			max: MAX_OPEN_CUSTOM_QUESTIONS,
			open: openCustomQuestions(request).length,
			entries: [...request.customQuestions].sort((a, b) => Number(a.status !== 'open') - Number(b.status !== 'open'))
		},
		// The eight steps, each with its progress, its validators and its skip (ac-evo-req-6, -16, -19).
		path,
		// Need and Solution are validated answer by answer (ac-evo-form-validate-each).
		inputValidation: { need: inputValidation(view, request, 'need'), solution: inputValidation(view, request, 'solution') },
		currentStep: path.find((s) => s.current)?.step ?? 'need',
		// What to do next, said to whoever drives the request: the questions to put
		// to the person now, the operations that follow, what only a person decides.
		next: coachFor(view, request, specificationActions),
		// The language the spec is written in: the questions of the steps of prose read in it (ac-evo-form-spec-language).
		language: view.language,
		// Whether each piece of the change fits the product as it stands (ac-evo-dock-1, -7, -8).
		docking: { counts: dockingCounts(docking), points: docking.slice(0, DOCKING_SHOWN), total: docking.length },
		// The other evolutions in progress, read against this one: what both touch, and whether it conflicts.
		crossEvolutions: crossEvolutionsOf(view, request),
		// Which requests it lands after, the conflicts still undecided, and the landings it was read again after (EVO-005).
		landingOrder: landingOrderReading(view, request),
		deployment: request.deployment,
		// Where its code stands in git, from its branch to its merge; null where the project names no deployment branch (feat-evo-code-branch).
		code: codeReadingOf(request, requestKeyOf(view.draft.requests, request.id) ?? 'EVO', view.draft.deploymentBranch ?? ''),
		// The index entries still held for the change, when there are any: once it is live, a sync resolves them (ac-evo-branch-merge-syncs).
		...heldEntriesOf(request),
		// Why, by whom and when it was cancelled, while it is (ac-evo-req-cancel).
		cancellation: request.cancellation ?? null,
		origin: request.origin,
		requester: request.requester,
		// Who asked and where it comes from, two answers of 1.1 validated like the need (ac-evo-form-origin-validated).
		originAnswers: originAnswersOf(view, request),
		// Where each path of the journey stands (ac-evo-spec-journey-paths); the page reads its steps from the drawing.
		journeyPaths: journeyPathTrails(view, request),
		// The other pages of the spec the request changes (ac-evo-draft-section-read).
		sectionChanges: sectionChangesOf(view, request),
		// The rules the whole product keeps the request changes (ac-evo-draft-rules).
		ruleChanges: ruleChangesOf(view, request),
		// The findings of Project health the request settles (ac-evo-draft-findings-read), only when it names some: the summary stays one size.
		...((request.findingDrafts ?? []).length > 0 ? { findingChanges: findingChangesOf(view, request) } : {}),
		// Whether the reader's AI validates here, on this request or on every evolution (ac-evo-llm-delegation).
		aiDelegation: aiDelegationOf(view, request, actor),
		// Who opened the request and through what: an AI that read a ticket pre-fills it, and the page says so once.
		openedThrough: request.history[0]?.channel ?? null,
		// How many people each answer needs (ac-evo-req-validations-per-answer).
		validationsPerAnswer: request.validationsPerAnswer,
		shownStage: supportedStage(request, maturity.criticalEmptyCount),
		createdAt: request.createdAt,
		leafIds: [...touchedLeafIds(request)],
		// What the diagrams use as it stands (ac-evo-imp-used): read with what the
		// change touches, never asked anything; a name of null is a feature gone.
		used: usedFeatures(request).map((u) => ({ id: u.featureId, name: view.leaves.find((l) => l.id === u.featureId)?.name ?? null, diagrams: u.diagrams })),
		leaves: touchedLeafIds(request).map((id) => {
			const draft = draftFor(request, id);
			const existing = view.leaves.find((l) => l.id === id);
			return {
				id,
				// An amendment that renames says the new name; one that does not keeps
				// the name the leaf already has, which is what the freeze will keep too.
				name: draft?.name || existing?.name || id,
				// A touched feature that does not exist yet says so, so a reader never
				// goes looking for it in the tree.
				drafted: existing === undefined,
				// What the request would do to it, so a feature that exists is never
				// read as a proposal, nor a proposal as a feature that exists.
				change: draft?.kind ?? null,
				// What the subject changes, shown on the subject (ac-evo-draft-subject-2).
				// Only a drafted subject carries it, so the index of touched features
				// stays about a hundred bytes per feature.
				...(draft
					? {
							draftId: draft.id,
							description: draft.kind === 'add' ? draft.description : (draft.changeSummary ?? ''),
							behaviour: draft.behaviour.length + behaviourOperationCount(draft.behaviourModel)
						}
					: {})
			};
		}),
		// ac-evo-draft-6: what the request proposes, counted here and read in full
		// through part "drafts".
		drafts: {
			total: request.drafts.length,
			added: request.drafts.filter((d) => d.kind === 'add').length,
			amended: request.drafts.filter((d) => d.kind === 'amend').length,
			removed: request.drafts.filter((d) => d.kind === 'remove').length,
			written: request.drafts.filter((d) => d.materialisedAs !== null).length,
			// What the drafts create, change and remove, written or not: the decision card ranks its size from it.
			changes: draftChangeNodes(request.drafts, (leafId) => view.elementNames?.[leafId])
		},
		// The data the request changes (ac-evo-draft-data) and how it reads against the model (ac-evo-imp-erd):
		// only the tables it touches and their neighbours, so the answer stays one size.
		data: {
			drafts: request.dataDrafts,
			view: dataChangeView(view.data, request.dataDrafts),
			// Each change still to land, validated on 3.4 Datamap as one section, and its one discussion
			// (criterion 3d4f23dd): carried only when there is one, so the summary stays one size.
			...dataValidationOf(view, request)
		},
		iteration: request.iteration,
		specVersion: request.specVersion,
		frozen: request.frozen,
		// Version N+1 in correction in the Build, the code still built against N (EVO-012).
		correction: correctionReading(request),
		frozenVersions: request.frozenVersions,
		maturity: {
			score: maturity.score,
			tier: maturity.tier,
			criticalEmptyFields: maturity.criticalEmptyFields,
			openQuestionCount: maturity.openQuestionCount,
			// A reading, never a gate: the path above is how far the request went.
			// The per-block detail is one part away (part:"fields").
			statement: maturity.statement,
			...inheritanceOf(features, request)
		},
		coherence: {
			available: coherence.available,
			overall: coherence.overall,
			delta: coherence.delta,
			blockingUndecided: coherence.blockingUndecided,
			ranAt: request.coherenceReport.ranAt,
			// Project health now and as the change would leave it (ac-evo-coh-after): the page lists what leaves, stays and comes, never a score.
			...(request.coherenceReport.health ? { health: request.coherenceReport.health } : {}),
			findings: publishedFindings(request).map((f) => ({
				id: f.id,
				axis: f.axis,
				severity: f.severity,
				// A draft is read by its name, never its id (ac-evo-draft-3).
				title: withDraftNames(request, { nameOf: (id) => view.leaves.find((l) => l.id === id)?.name ?? id }).say(f.title),
				requestNodeId: f.requestNodeId,
				existingNodeId: f.existingNodeId,
				fixNowTarget: f.fixNowTarget,
				// `inherited`: the product carried it before this request; it never holds the gate.
				scope: f.scope ?? 'request',
				holdsGate: findingHoldsGate(f),
				risk: f.risk ?? null
			}))
		},
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
			// Why a report that ran came back empty (c62c57a6): "nothing was
			// declared" and "nothing follows" must never read alike, so the plain
			// line says the reason instead of a calm "nothing moves".
			plain: withEmptyReason(
				impactInPlainWords(impactAll, undefined, view.language),
				request.impactReport.status === 'ready' && impactAll.length === 0 ? emptyImpactReason(request, view.language) : null
			),
			emptyBecause:
				request.impactReport.status === 'ready' && impactAll.length === 0 ? emptyImpactReason(request, view.language) : null,
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
			blocked: blockedProposals(pending, actor).count,
			// Why, in the sentence the refusal would give, with how many it holds
			// back: a bare count sent readers accepting them one by one to learn it.
			blockedBecause: blockedProposals(pending, actor).because,
			// Where a person starts signing: the first proposal that waits.
			href: pending[0] ? requestPagePath(view.projectId, request.id, { kind: 'proposal', id: pending[0].id }) : null
		},
		gate: {
			next: gate.next,
			ok: gate.verdict.ok,
			reason: gate.verdict.ok ? null : gate.verdict.reason,
			detail: gate.verdict.ok ? null : gate.verdict.detail,
			// Where a person crosses it, or waives it with a reason.
			href: requestPagePath(view.projectId, request.id, { kind: 'next-step' })
		},
		// What held the freeze after the last validation of the Specification, said by the foot (EVO-011, criterion c39cfe76).
		freezeHeld: freezeHeldOf(request),
		waiver: openWaiver(request),
		// The report in short; the lines are one part away (part=report, optionally per verdict).
		report: {
			iteration: request.iteration,
			status: request.iterations.find((i) => i.number === request.iteration)?.reportStatus ?? 'building',
			...reportCounts(request, lines),
			total: lines.length,
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
			foldedBackLeafId: o.foldedBackLeafId,
			href: requestPagePath(view.projectId, request.id, { kind: 'observation', id: o.id })
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
	// The board's lists have no meaning on one request: its summary names its own.
	// The parts read with the engine (graph, docking, sections, specification) are served by the route.
	return part === 'summary' || part === 'leaves' || part === 'sources' || part === 'graph' || part === 'docking' || part === 'sections' || part === 'specification'
		? requestSummary(view, request, actor, opts.specificationActions)
		: requestPart(view, request, actor, { ...opts, part });
}

/** Said only when the request holds entries: the summary stays its size in the common case. */
function heldEntriesOf(request: EvolutionRequest): { heldEntries?: number } {
	const held = Object.keys(request.heldImplementation ?? {}).length;
	return held > 0 ? { heldEntries: held } : {};
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
export type VersionsPart = ReturnType<typeof versionsPart>;

/** The board: one card per live request. */
export type RequestCardView = ReturnType<typeof requestCard>;
export type BoardCardView = ReturnType<typeof boardCard>;
export type SuggestionCardView = ReturnType<typeof suggestionCards>[number];

/** What to do next on a request, from the readings its dossier holds (see coachOf). */
export function coachFor(view: EvolutionView, request: EvolutionRequest, specificationActions: SpecificationActions = NO_ACTIONS_COUNTED) {
	const maturity = maturityOf(view, view.features, request);
	const rows = dossierFieldRows(view, request);
	// The Specification as the step lock reads it: its answers, its journey and the actions read with the graph (ac-evo-form-step-lock).
	const specification = specificationHoldOf(view, request, specificationActions, rows);
	const gate = withBuildCodeGate(gateReading(request, maturity.criticalEmptyCount, specification, concurrentHoldOf(request, view.draft.requests)), request, view.draft.deploymentBranch ?? '');
	const pending = pendingProposals(request).length;
	const owed = rows.filter((f) => (!f.filled || f.openQuestion) && f.pendingProposalId === null).length;
	const counts = dockingCounts(dockingOf(view, request));
	return coachOf(request, {
		path: readPath(request, { questionsOwed: owed, pendingProposals: pending }),
		pendingProposals: pending,
		questionsOwed: owed,
		gate: { ok: gate.verdict.ok, reason: gate.verdict.ok ? null : gate.verdict.reason },
		collisions: counts.collision,
		frictions: counts.friction,
		// The lines a person decides, apart from those a test closes (criterion 4913a449).
		undecidedLines: awaitingPersonCount(request),
		linesAwaitingCode: awaitingCodeCount(request),
		solo: view.members.length <= 1,
		inputs: { need: inputValidation(view, request, 'need'), solution: inputValidation(view, request, 'solution') },
		specification
	});
}

/**
 * The people named on an answer or a step that waits for them, who have not
 * validated its current version yet (ac-evo-req-waiting-on-you): answers and
 * the steps of specification until the freeze, the Approval while it is due.
 */
export function waitingOnOf(request: EvolutionRequest): string[] {
	const specification = request.stage === 'draft' || request.stage === 'specification';
	const waiting = new Set<string>();
	for (const named of request.namedValidators) {
		const step = stepOfTarget(named.target);
		if (!step || named.people.length === 0) continue;
		if (step === 'approval' ? request.stage !== 'acceptance' : !specification) continue;
		let given: readonly string[];
		if (named.target.startsWith('step:')) {
			given = validationOf(request, step).validations.map((v) => v.by);
		} else {
			// An answer nobody wrote yet waits on its author, not on the people named.
			const reading = fieldValidationOf(request, named.target);
			if (reading.versionCount === 0) continue;
			given = reading.validations.map((v) => v.by);
		}
		for (const person of awaitedAmong(named.people, given)) waiting.add(person);
	}
	return [...waiting];
}

/** The card of a request: the board's, and the one every batch answers with, its next move included. */
/** The code of a request as a card carries it: enough for a tool to find the request by its branch and check its merge. */
function codeCardOf(request: EvolutionRequest, key: string, deploymentBranch: string) {
	const code = codeReadingOf(request, key, deploymentBranch);
	if (!code) return null;
	const { commits: _commits, history: _history, createCommand: _create, ...card } = code;
	return card;
}

/** The deferred omissions the Evolutions list offers, each with its line and the operation that starts it (criteria 35991202, 03b7eacf). */
export function suggestionCards(view: Pick<EvolutionView, 'projectId' | 'draft'>) {
	return deferredSuggestions(view.draft.requests).map((suggestion) => ({
		...suggestion,
		href: requestPagePath(view.projectId, suggestion.fromRequestId, { kind: 'line', id: suggestion.lineId }),
		startWith: { op: 'open_request', deferredLineId: suggestion.lineId }
	}));
}

/**
 * A row of the Changes board: what it shows (key, title, standing) and whose AI
 * is at work on the request now. The full card (requestCard) is what an AI
 * client reads of the board; it needs the request's readings, the page does not.
 */
export function boardCard(view: Pick<EvolutionView, 'draft'>, request: EvolutionRequest, now: number) {
	return {
		id: request.id,
		key: requestKeyOf(view.draft.requests, request.id),
		title: request.title,
		status: request.status,
		stage: request.stage,
		inSession: sessionsInProgress(request, now).map((s) => s.personId),
		// After which requests not landed it lands, and which it conflicts with (EVO-005).
		order: boardOrderOf(view, request)
	};
}

export function requestCard(view: EvolutionView, request: EvolutionRequest, opts: { readonly withNext?: boolean; readonly now?: number } = {}) {
	const maturity = maturityOf(view, view.features, request);
	return {
		id: request.id,
		// The key a person quotes it by, like a ticket number.
		key: requestKeyOf(view.draft.requests, request.id),
		title: request.title,
		origin: request.origin,
		status: request.status,
		stage: request.stage,
		shownStage: supportedStage(request, maturity.criticalEmptyCount),
		// Its branch, its validated commit and its merge, in short (feat-evo-code-branch).
		code: codeCardOf(request, requestKeyOf(view.draft.requests, request.id) ?? 'EVO', view.draft.deploymentBranch ?? ''),
		leafIds: request.leafIds,
		specVersion: request.specVersion,
		maturity: maturity.score,
		criticalEmpty: maturity.criticalEmptyCount,
		openQuestions: request.openQuestionKeys.length,
		pendingProposals: pendingProposals(request).length,
		coherenceDelta: request.coherenceReport.requestDelta,
		blockingFindings: publishedFindings(request).filter(findingHoldsGate).length,
		undecidedLines: undecidedCount(request),
		// Of those, the lines that only wait on the code (ac-evo-board-overview).
		linesToBuild: toBuildCount(request),
		acceptanceDebt: acceptanceDebt(request),
		waived: openWaiver(request) !== null,
		// After which requests not landed it lands, and which it conflicts with (EVO-005).
		order: boardOrderOf(view, request),
		// When the request last moved a step: the board reads how long it has stood there.
		stepSince: stepSinceOf(request),
		// The step the card reads at, and the steps marked not applicable with their reasons (ac-evo-req-16).
		step: readPath(request, { questionsOwed: 0, pendingProposals: pendingProposals(request).length }).find((s) => s.current)?.step ?? 'need',
		skippedSteps: request.skippedSteps,
		// Who the request waits on, by email: the board reads "Waiting on you" from it (ac-evo-board-waiting-on-you).
		waitingOn: waitingOnOf(request),
		href: requestPagePath(view.projectId, request.id),
		// Whose AI is at work on it right now, read only by a page that tells the time.
		...(opts.now !== undefined ? { inSession: sessionsInProgress(request, opts.now).map((s) => s.personId) } : {}),
		...(opts.withNext && request.status === 'open' ? { next: coachFor(view, request) } : {})
	};
}

export function evolutionAggregate(
	view: EvolutionView,
	actor: Actor,
	requestId?: string,
	opts: DossierOptions = {}
) {
	const live = view.draft.requests.filter((r) => r.status !== 'deleted');
	const lookup = requestId ? findRequestByRef(live, requestId) : null;
	const one = lookup?.kind === 'found' ? lookup.request : null;
	// One part of one dossier: nothing else travels with it.
	if (one && opts.part && opts.part !== 'summary' && opts.part !== 'leaves' && opts.part !== 'sources' && opts.part !== 'graph' && opts.part !== 'docking') {
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
			// The roster a proposal can be handed to and who can be named to validate,
			// with what each does on the project; empty where one member is alone.
			members: view.members,
			requests: [],
			// Bounded for a tool answer: what grows with the request is counted and previewed, read whole through its part (ac-evo-llm-summary-bound).
			request: boundSummary(requestSummary(view, one, actor, opts.specificationActions))
		};
	}
	// The board's own lists, one at a time and paged, when asked for by name.
	if (!requestId && (opts.part === 'leaves' || opts.part === 'sources')) {
		const all: readonly { id: string; name?: string; title?: string }[] =
			opts.part === 'leaves'
				? view.leaves
				: view.sources.map((s) => ({ id: s.id, title: s.title }));
		const paged = page(all, opts);
		return {
			projectId: view.projectId,
			revision: view.revision,
			requests: [],
			request: null,
			[opts.part]: { total: all.length, offset: paged.offset, limit: paged.limit, entries: paged.returned }
		};
	}
	// The board: the requests FIRST, because "is there already a request for
	// this?" is what it is read for. Every leaf and every source used to come
	// before them, and on a real project the answer was capped with the requests
	// cut at fourteen of twenty-one. The two lists are counted here and read
	// with part=leaves or part=sources.
	return {
		projectId: view.projectId,
		productName: view.productName,
		revision: view.revision,
		requests: live.map((r) => requestCard(view, r)),
		suggestions: suggestionCards(view),
		request: null,
		actor: { id: actor.id, kind: actor.kind, role: actor.role, channel: actor.channel ?? 'page' },
		leaves: { total: view.leaves.length, read: 'get_evolution part=leaves' },
		sources: { total: view.sources.length, read: 'get_evolution part=sources' },
		fieldsAvailable: fieldsAvailable(),
		originsAvailable: originsAvailable()
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
	return [...ORIGIN_FIELDS, ...NEED_FIELDS, ...ALL_BLOCK_FIELDS.filter((f) => f.editor === 'inline')].map((f) => ({
		path: f.path,
		label: f.label,
		question: f.question,
		critical: f.critical,
		kind: f.kind,
		leafScoped: f.canonicalPath.includes('{leaf}')
	}));
}
