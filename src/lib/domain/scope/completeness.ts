import type { ExtractedFrom, ExtractedKind } from '$domain/documents';
import {
	scopeSectionLabel,
	type CompletionVerdict,
	type ProjectScopeDraft
} from './draft';
import { NBSP, quoteName, type SpecLanguage } from '$domain/language';

export type CompletionIssueSeverity = 'blocking' | 'warning';

export interface CompletionIssue {
	code: string;
	severity: CompletionIssueSeverity;
	message: string;
	path: string;
}

export type CompletionCheckKey =
	| 'scope'
	| 'sources'
	| 'mapping'
	| 'sections'
	| 'coherence'
	| 'behavior'
	| 'data'
	| 'experience'
	| 'audit';

export interface CompletionCheck {
	key: CompletionCheckKey;
	label: string;
	passed: boolean;
	detail: string;
}

export interface ProjectCompletionReport {
	projectId: string;
	status: CompletionVerdict;
	/** How finished the project reads: the structure's share, capped by the coherence score while the coherence check fails. */
	score: number;
	/** The structure's share alone: scope, sections and checks done (ac-leaf-ac-score-completion-coherence). */
	coverageScore: number;
	canFinish: boolean;
	auditFresh: boolean;
	coverage: {
		totalCapabilities: number;
		includedCapabilities: number;
		resolvedCapabilities: number;
		assessedSections: number;
		totalSections: number;
	};
	checks: CompletionCheck[];
	issues: CompletionIssue[];
}

export interface CompletionEvidence {
	sourceIds: readonly string[];
	featureMaturity: Readonly<Record<string, number>>;
	/** One row per entity a leaf feature's behavior model declares: the entity
	 *  name as authored in the kernel, and the declaring feature's display name.
	 *  Drives the data-coverage check (nothing the behavior knows may silently
	 *  miss from the data model). */
	behaviorEntities: ReadonlyArray<{ name: string; featureName: string }>;
	/** Names of the entities currently authored in the data section. */
	dataEntityNames: readonly string[];
	/** Names of the data entities that take part in no relation: they point at
	 *  no other entity and no entity points at them. Optional so older evidence
	 *  readers keep compiling; absent reads as "none". */
	unrelatedDataEntityNames?: readonly string[];
	/** Per table, the fields whose rules the solver could check (a required
	 *  value, a choice) that no behaviour state carries. Optional; absent reads
	 *  as "none" (no behaviour yet, or the engine did not answer). */
	unlinkedDataFields?: ReadonlyArray<{ table: string; count: number }>;
	/** Registered sources a reader other than their author cannot consult: an
	 *  address nobody else can open (a file:// path, a plain reference), or a row
	 *  with neither a link nor a note. Each carries the sentence to report.
	 *  Optional for the same reason as above; absent reads as "none". */
	unreachableSources?: ReadonlyArray<{
		id: string;
		access: 'unreachable' | 'empty';
		message: string;
	}>;
	/** In a project read from its code, documents or design, the elements that
	 *  cite no source of the register (ac-src-extracted, criterion 7a8be13f).
	 *  Optional; absent reads as "none", which is also what a project started
	 *  from scratch reports. */
	uncitedExtracted?: ReadonlyArray<{ kind: ExtractedKind; name: string }>;
	/** What those elements were read from, so the gate names it. Absent reads as the code. */
	extractedFrom?: ExtractedFrom;
	settledApprovalIds: readonly string[];
	/**
	 * Approvals deposited and under review (`in_review`). A decision that has
	 * been filed and is waiting for a human is not an omission: the gate counts
	 * it as taken and reports the wait as debt. Optional so older evidence
	 * readers keep compiling; absent reads as "none".
	 */
	pendingApprovalIds?: readonly string[];
	coherenceReady: boolean;
	coherenceDetail: string;
	/**
	 * The coherence score the Control Center shows (its headline), 0 to 100.
	 * While the coherence check fails, the report's score never reads above it
	 * (ac-leaf-ac-score-completion-coherence). Optional: absent, nothing caps.
	 */
	coherenceScore?: number;
	experienceReady: boolean;
	experienceDetail: string;
	currentScopeFingerprint: string;
	currentModelFingerprint: string;
	/**
	 * The engine could not finish every reading inside its budget, so this
	 * evidence stands on fewer signals than usual. The gate treats it like any
	 * other reading (a missing signal never blocks by itself); it is recorded so a
	 * caching tier can choose to keep such a reading only briefly.
	 */
	provisional?: boolean;
	/**
	 * The spec's language, read with the evidence: the gate writes its sentences
	 * in it. Absent reads as English.
	 */
	language?: SpecLanguage;
}

const unique = (values: readonly string[]): string[] => [...new Set(values)];

function dataCheckDetail(uncovered: number, checked: number, unrelated: number, lang: SpecLanguage = 'en'): string {
	if (lang === 'fr') {
		const parts = [
			uncovered === 0
				? `Chaque entité du comportement figure dans le modèle de données (${checked} vérifiée${checked > 1 ? 's' : ''})`
				: uncovered === 1
					? '1 entité du comportement manque au modèle de données'
					: `${uncovered} entités du comportement manquent au modèle de données`
		];
		if (unrelated > 0)
			parts.push(unrelated === 1 ? '1 entité ne participe à aucune relation' : `${unrelated} entités ne participent à aucune relation`);
		return parts.join(`${NBSP}; `);
	}
	const parts = [
		uncovered === 0
			? `Every behavior entity is represented in the data model (${checked} checked)`
			: `${uncovered} behavior entit${uncovered === 1 ? 'y is' : 'ies are'} missing from the data model`
	];
	if (unrelated > 0) {
		parts.push(`${unrelated} entit${unrelated === 1 ? 'y takes' : 'ies take'} part in no relation`);
	}
	return parts.join('; ');
}

function sourcesCheckDetail(registered: number, unreachable: number, lang: SpecLanguage = 'en'): string {
	if (lang === 'fr') {
		const base = `${registered} source${registered > 1 ? 's' : ''} enregistrée${registered > 1 ? 's' : ''}`;
		return unreachable > 0
			? `${base}${NBSP}; ${unreachable} que seul${unreachable > 1 ? 's leurs auteurs peuvent' : ' son auteur peut'} consulter`
			: base;
	}
	const base = `${registered} registered source${registered === 1 ? '' : 's'}`;
	return unreachable > 0
		? `${base}; ${unreachable} that nobody but ${unreachable === 1 ? 'its' : 'their'} author can consult`
		: base;
}

/** How a French sentence names a disposition code (a capability is feminine: « la capacité »). */
const FRENCH_DISPOSITIONS: Readonly<Record<string, string>> = {
	included: 'incluse',
	excluded: 'exclue',
	deferred: 'reportée',
	unresolved: 'non tranchée'
};

/**
 * The sentences of the gate, in the spec's language. Issue codes and check
 * keys never change; names from the model are quoted as they are.
 */
const EXTRACTED_KINDS: readonly ExtractedKind[] = ['feature', 'rule', 'edge_case', 'term', 'role', 'table'];
const EXTRACTED_PATH: Record<ExtractedKind, string> = {
	feature: 'features',
	rule: 'rules.issues',
	edge_case: 'rules.scenarios',
	term: 'glossary.terms',
	role: 'users.roles',
	table: 'data.entities'
};
const EXTRACTED_NOUN: Record<'en' | 'fr', Record<ExtractedKind, (count: number) => string>> = {
	en: {
		feature: (n) => (n === 1 ? 'feature' : 'features'),
		rule: (n) => (n === 1 ? 'rule' : 'rules'),
		edge_case: (n) => (n === 1 ? 'edge case' : 'edge cases'),
		term: (n) => (n === 1 ? 'glossary term' : 'glossary terms'),
		role: (n) => (n === 1 ? 'role' : 'roles'),
		table: (n) => (n === 1 ? 'table' : 'tables')
	},
	fr: {
		feature: (n) => (n === 1 ? 'feature' : 'features'),
		rule: (n) => (n === 1 ? 'règle' : 'règles'),
		edge_case: (n) => (n === 1 ? 'cas limite' : 'cas limites'),
		term: (n) => (n === 1 ? 'terme du glossaire' : 'termes du glossaire'),
		role: (n) => (n === 1 ? 'rôle' : 'rôles'),
		table: (n) => (n === 1 ? 'table' : 'tables')
	}
};
/** How a sentence names what the elements were read from. */
const EXTRACTED_FROM: Record<'en' | 'fr', Record<ExtractedFrom, { the: string; its: string; cite: string }>> = {
	en: {
		code: { the: 'the code', its: 'its code', cite: 'the code' },
		documents: { the: 'the documentation', its: 'its documentation', cite: 'the page or document' },
		design: { the: 'the design', its: 'its design', cite: 'the design or prototype' }
	},
	fr: {
		code: { the: 'le code', its: 'son code', cite: 'le code' },
		documents: { the: 'la documentation', its: 'sa documentation', cite: 'la page ou le document' },
		design: { the: 'la maquette', its: 'sa maquette', cite: 'la maquette ou le prototype' }
	}
};

/** The first names, then how many more. */
function listNames(names: readonly string[], count: number, lang: 'en' | 'fr' = 'en'): string {
	const shown = names.map((name) => (lang === 'fr' ? quoteName('fr', name) : `"${name}"`)).join(', ');
	const more = count - names.length;
	return more > 0 ? `${shown}${lang === 'fr' ? ` et ${more} autre${more > 1 ? 's' : ''}` : ` and ${more} more`}` : shown;
}

const TEXTS = {
	en: {
		unnamed: 'Unnamed capability',
		modeUnclassified: 'Choose whether this project covers the full product, a selected scope, or a prototype.',
		scopeEmpty: 'Add the capabilities the product is expected to cover.',
		nameMissing: 'A scope capability has no name.',
		unresolved: (c: string) => `"${c}" has not been included, excluded, or deferred.`,
		sourceMissing: (c: string) => `"${c}" is not tied to any source.`,
		sourceUnknown: (c: string) => `"${c}" references a source that no longer exists.`,
		featureMissing: (c: string) => `"${c}" is included but not mapped to a leaf feature.`,
		featureUnknown: (c: string) => `"${c}" references a feature that no longer exists.`,
		behaviorMissing: (c: string) => `"${c}" maps to a feature with no authored behavior.`,
		fullProductOmission: (c: string, disposition: string) =>
			`"${c}" cannot be ${disposition} in full-product mode. ` +
			`Either bring it into scope as "included", or switch the scope to "selected_scope", ` +
			`which allows it once it carries a rationale and an approval (in review is enough to file the decision).`,
		omissionUnapproved: (c: string, disposition: string) =>
			`"${c}" needs a rationale and an approval before it can be ${disposition}.`,
		omissionPending: (c: string, disposition: string) =>
			`"${c}" is ${disposition} on an approval still in review: the decision is filed, nobody has signed it yet.`,
		sectionNotReady: (section: string) => `${section} has not been assessed as ready.`,
		sectionFullProduct: (section: string) => `${section} cannot be marked not applicable in full-product mode.`,
		sectionUnapproved: (section: string) => `${section} needs a rationale and an approval to be not applicable.`,
		sectionPending: (section: string) =>
			`${section} is not applicable on an approval still in review: the decision is filed, nobody has signed it yet.`,
		entityUnmodeled: (name: string, features: readonly string[]) =>
			`The behavior model declares "${name}"${features.length > 0 ? ` (used by ${features.join(', ')})` : ''} but the data model has no such entity. Model it, or record why it is excluded.`,
		fieldsUnlinked: (count: number, tables: readonly string[]) =>
			`${count} data field(s) whose rules the solver could check are linked to no behaviour state${tables.length > 0 ? ` (most in ${tables.join(', ')})` : ''}, so nothing checks them against the features. Link each to the state that holds its value: get_data_links lists them with their candidate states, link_data_fields links many at once.`,
		entityUnrelated: (name: string) =>
			`The data model holds "${name}" but it relates to nothing and nothing relates to it. Model its relation to what owns it or what it references, or record in its description why it stands alone.`,
		extractedUncited: (kind: ExtractedKind, count: number, names: readonly string[], from: ExtractedFrom = 'code') =>
			`${count} ${EXTRACTED_NOUN.en[kind](count)} read from ${EXTRACTED_FROM.en[from].the} ${count === 1 ? 'cites' : 'cite'} no source (${listNames(names, count)}). A product read from ${EXTRACTED_FROM.en[from].its} says where each element comes from: cite ${EXTRACTED_FROM.en[from].cite} it was read from and every ticket, page or document that speaks of it, as rows of the documents register named in its sourceIds.`,
		auditStale: 'The project changed after its last coverage audit. Run the audit again.',
		auditMissing: 'Run a coverage audit before completing the project.',
		scopeLabel: 'Declared scope',
		scopeDetail: (resolved: number, total: number) => `${resolved}/${total} capabilities resolved`,
		sourcesLabel: 'Source traceability',
		mappingLabel: 'Feature mapping',
		mappingDetail: 'Included capabilities map to current leaf features',
		sectionsLabel: 'Section assessment',
		sectionsDetail: (ready: number, total: number) => `${ready}/${total} sections ready`,
		coherenceLabel: 'Project health',
		behaviorLabel: 'Behavior coverage',
		behaviorDetail: 'Every mapped current feature has authored behavior',
		sourcesUnchecked: 'Not checked yet: no source is registered and the scope lists no capability to trace to one',
		mappingUnchecked: 'Not checked yet: the scope includes no capability to map to a feature',
		behaviorUnchecked: (without: number, total: number) =>
			'Not checked yet: the scope includes no capability' +
			(total === 0
				? ''
				: without === 0
					? '; every feature has behavior'
					: `; ${without} of ${total} feature${total === 1 ? ' has' : 's have'} no behavior yet`),
		dataUnchecked: 'Not checked yet: no feature has behavior to hold the data model against',
		dataLabel: 'Data model coverage',
		experienceLabel: 'End-to-end experience',
		auditLabel: 'Fresh audit',
		audited: (at: string) => `Audited ${at}`,
		auditRequired: 'Audit required'
	},
	fr: {
		unnamed: 'Capacité sans nom',
		modeUnclassified:
			'Choisissez si ce projet couvre le produit complet, un périmètre choisi ou un prototype.',
		scopeEmpty: 'Ajoutez les capacités que le produit doit couvrir.',
		nameMissing: "Une capacité du périmètre n'a pas de nom.",
		unresolved: (c: string) =>
			`La capacité ${quoteName('fr', c)} n'a été ni incluse, ni exclue, ni reportée.`,
		sourceMissing: (c: string) => `La capacité ${quoteName('fr', c)} n'est rattachée à aucune source.`,
		sourceUnknown: (c: string) => `La capacité ${quoteName('fr', c)} cite une source qui n'existe plus.`,
		featureMissing: (c: string) =>
			`La capacité ${quoteName('fr', c)} est incluse, mais n'est associée à aucune fonctionnalité feuille.`,
		featureUnknown: (c: string) =>
			`La capacité ${quoteName('fr', c)} cite une fonctionnalité qui n'existe plus.`,
		behaviorMissing: (c: string) =>
			`La capacité ${quoteName('fr', c)} est associée à une fonctionnalité sans comportement écrit.`,
		fullProductOmission: (c: string, disposition: string) =>
			`La capacité ${quoteName('fr', c)} ne peut pas être ${FRENCH_DISPOSITIONS[disposition] ?? disposition} en mode produit complet. ` +
			`Faites-la entrer dans le périmètre comme ${quoteName('fr', 'included')}, ou passez le périmètre en ${quoteName('fr', 'selected_scope')}, ` +
			`qui le permet dès qu'elle porte une justification et une approbation (une approbation en revue suffit pour déposer la décision).`,
		omissionUnapproved: (c: string, disposition: string) =>
			`La capacité ${quoteName('fr', c)} a besoin d'une justification et d'une approbation avant de pouvoir être ${FRENCH_DISPOSITIONS[disposition] ?? disposition}.`,
		omissionPending: (c: string, disposition: string) =>
			`La capacité ${quoteName('fr', c)} est ${FRENCH_DISPOSITIONS[disposition] ?? disposition} sur une approbation encore en revue${NBSP}: la décision est déposée, personne ne l'a encore signée.`,
		sectionNotReady: (section: string) =>
			`La section ${quoteName('fr', section)} n'a pas été jugée prête.`,
		sectionFullProduct: (section: string) =>
			`La section ${quoteName('fr', section)} ne peut pas être marquée non applicable en mode produit complet.`,
		sectionUnapproved: (section: string) =>
			`La section ${quoteName('fr', section)} a besoin d'une justification et d'une approbation pour être non applicable.`,
		sectionPending: (section: string) =>
			`La section ${quoteName('fr', section)} est non applicable sur une approbation encore en revue${NBSP}: la décision est déposée, personne ne l'a encore signée.`,
		entityUnmodeled: (name: string, features: readonly string[]) =>
			`Le modèle de comportement déclare ${quoteName('fr', name)}${features.length > 0 ? ` (utilisé par ${features.map((f) => quoteName('fr', f)).join(', ')})` : ''}, mais le modèle de données n'a aucune entité de ce nom. Modélisez-la, ou notez pourquoi elle est exclue.`,
		fieldsUnlinked: (count: number, tables: readonly string[]) =>
			`${count} champ(s) du modèle de données dont le solveur pourrait vérifier les règles ne sont liés à aucun état du comportement${tables.length > 0 ? ` (surtout dans ${tables.map((t) => quoteName('fr', t)).join(', ')})` : ''}, donc rien ne les vérifie face aux features. Liez chacun à l'état qui porte sa valeur${NBSP}: get_data_links les liste avec leurs états candidats, link_data_fields en lie plusieurs à la fois.`,
		entityUnrelated: (name: string) =>
			`Le modèle de données contient ${quoteName('fr', name)}, mais cette entité n'est liée à rien et rien n'est lié à elle. Modélisez sa relation avec ce qui la possède ou ce qu'elle référence, ou notez dans sa description pourquoi elle est isolée.`,
		extractedUncited: (kind: ExtractedKind, count: number, names: readonly string[], from: ExtractedFrom = 'code') =>
			`${count} ${EXTRACTED_NOUN.fr[kind](count)} lu${count > 1 ? 's' : ''} dans ${EXTRACTED_FROM.fr[from].the} ne cite${count > 1 ? 'nt' : ''} aucune source (${listNames(names, count, 'fr')}). Un produit lu dans ${EXTRACTED_FROM.fr[from].its} dit d'où vient chaque élément${NBSP}: citez ${EXTRACTED_FROM.fr[from].cite} d'où il a été lu et chaque ticket, page ou document qui en parle, comme lignes du registre des documents nommées dans ses sourceIds.`,
		auditStale: "Le projet a changé depuis son dernier audit de couverture. Relancez l'audit.",
		auditMissing: 'Lancez un audit de couverture avant de terminer le projet.',
		scopeLabel: 'Périmètre déclaré',
		scopeDetail: (resolved: number, total: number) =>
			`${resolved}/${total} capacité${total > 1 ? 's' : ''} tranchée${resolved > 1 ? 's' : ''}`,
		sourcesLabel: 'Traçabilité des sources',
		mappingLabel: 'Association aux fonctionnalités',
		mappingDetail: 'Les capacités incluses sont associées à des fonctionnalités feuilles actuelles',
		sectionsLabel: 'Évaluation des sections',
		sectionsDetail: (ready: number, total: number) =>
			`${ready}/${total} section${total > 1 ? 's' : ''} prête${ready > 1 ? 's' : ''}`,
		coherenceLabel: 'Santé du projet',
		behaviorLabel: 'Couverture du comportement',
		behaviorDetail: 'Chaque fonctionnalité associée a un comportement écrit',
		sourcesUnchecked: `Pas encore vérifiée${NBSP}: aucune source enregistrée, et le périmètre ne liste aucune capacité à y rattacher`,
		mappingUnchecked: `Pas encore vérifiée${NBSP}: le périmètre n'inclut aucune capacité à associer à une fonctionnalité`,
		behaviorUnchecked: (without: number, total: number) =>
			`Pas encore vérifiée${NBSP}: le périmètre n'inclut aucune capacité` +
			(total === 0
				? ''
				: without === 0
					? `${NBSP}; chaque fonctionnalité a un comportement`
					: `${NBSP}; ${without} fonctionnalité${without > 1 ? 's' : ''} sur ${total} n'${without > 1 ? 'ont' : 'a'} encore aucun comportement`),
		dataUnchecked: `Pas encore vérifiée${NBSP}: aucune fonctionnalité n'a de comportement auquel confronter le modèle de données`,
		dataLabel: 'Couverture du modèle de données',
		experienceLabel: 'Expérience de bout en bout',
		auditLabel: 'Audit à jour',
		audited: (at: string) => `Audité le ${at}`,
		auditRequired: 'Audit requis'
	}
} as const;

/**
 * Case-, punctuation- and naive-plural-insensitive identity for entity names,
 * so "Order lines" declared in behavior matches "OrderLine" in the data model.
 * Deliberately loose: this feeds a WARNING, and a false match is cheaper than
 * a gate that nags about spelling.
 */
function entityKey(name: string): string {
	const flat = name.toLowerCase().replace(/[^a-z0-9]+/g, '');
	return flat.endsWith('s') ? flat.slice(0, -1) : flat;
}

/**
 * Where a deferral stands: signed off, filed and waiting for a person, or not
 * decided at all.
 *
 * An agent authoring a scope files the decision and cannot sign it: writing
 * `accepted_risk` itself would assert that a human accepted a risk, which is
 * false. So a rationale plus an approval under review is a decision TAKEN, and
 * the gate reports the missing signature as debt instead of blocking on it.
 * Only a deferral with no rationale or no approval at all is an omission.
 */
type ApprovalState = 'settled' | 'pending' | 'none';

function approvalState(
	item: { approvalId: string | null; rationale: string },
	settledIds: ReadonlySet<string>,
	pendingIds: ReadonlySet<string>
): ApprovalState {
	if (item.approvalId === null || item.rationale.trim().length === 0) return 'none';
	if (settledIds.has(item.approvalId)) return 'settled';
	return pendingIds.has(item.approvalId) ? 'pending' : 'none';
}

/**
 * Deterministic project completion gate. It never infers external coverage from
 * the current feature tree: the persisted scope ledger is the reference set,
 * while the authored model only supplies evidence that each item is covered.
 */
export function assessProjectCompletion(
	draft: ProjectScopeDraft,
	evidence: CompletionEvidence,
	lang: SpecLanguage = evidence.language ?? 'en'
): ProjectCompletionReport {
	const t = TEXTS[lang];
	const issues: CompletionIssue[] = [];
	const sources = new Set(evidence.sourceIds);
	const approvals = new Set(evidence.settledApprovalIds);
	const pendingApprovals = new Set(evidence.pendingApprovalIds ?? []);
	const maturity = evidence.featureMaturity;
	const capabilities = draft.capabilities;

	if (draft.mode === 'unclassified') {
		issues.push({
			code: 'scope-mode-unclassified',
			severity: 'blocking',
			message: t.modeUnclassified,
			path: 'mode'
		});
	}
	if (capabilities.length === 0) {
		issues.push({
			code: 'scope-empty',
			severity: 'blocking',
			message: t.scopeEmpty,
			path: 'capabilities'
		});
	}

	for (const capability of capabilities) {
		const path = `capabilities.${capability.id}`;
		const name = capability.name || t.unnamed;
		if (!capability.name.trim()) {
			issues.push({
				code: 'capability-name-missing',
				severity: 'blocking',
				message: t.nameMissing,
				path
			});
		}
		if (capability.disposition === 'unresolved') {
			issues.push({
				code: 'capability-unresolved',
				severity: 'blocking',
				message: t.unresolved(name),
				path
			});
		}
		if (capability.sourceIds.length === 0) {
			issues.push({
				code: 'capability-source-missing',
				severity: 'blocking',
				message: t.sourceMissing(name),
				path
			});
		} else {
			for (const sourceId of unique(capability.sourceIds)) {
				if (!sources.has(sourceId)) {
					issues.push({
						code: 'capability-source-unknown',
						severity: 'blocking',
						message: t.sourceUnknown(name),
						path
					});
				}
			}
		}

		if (capability.disposition === 'included') {
			if (capability.featureIds.length === 0) {
				issues.push({
					code: 'capability-feature-missing',
					severity: 'blocking',
					message: t.featureMissing(name),
					path
				});
			}
			for (const featureId of unique(capability.featureIds)) {
				if (!(featureId in maturity)) {
					issues.push({
						code: 'capability-feature-unknown',
						severity: 'blocking',
						message: t.featureUnknown(name),
						path
					});
				} else if (maturity[featureId] <= 0) {
					issues.push({
						code: 'capability-behavior-missing',
						severity: 'blocking',
						message: t.behaviorMissing(name),
						path
					});
				}
			}
		}

		if (capability.disposition === 'excluded' || capability.disposition === 'deferred') {
			if (draft.mode === 'full_product') {
				issues.push({
					code: 'full-product-omission',
					severity: 'blocking',
					// Naming the way out matters here: the mode is usually chosen at the
					// very first call, long before the capability that needs deferring
					// exists, and the author who meets this blocker later has no reason
					// to suspect a decision made on day one is what is holding them.
					message: t.fullProductOmission(name, capability.disposition),
					path
				});
			} else {
				const state = approvalState(capability, approvals, pendingApprovals);
				if (state === 'none') {
					issues.push({
						code: 'capability-omission-unapproved',
						severity: 'blocking',
						message: t.omissionUnapproved(name, capability.disposition),
						path
					});
				} else if (state === 'pending') {
					issues.push({
						code: 'capability-omission-approval-pending',
						severity: 'warning',
						message: t.omissionPending(name, capability.disposition),
						path
					});
				}
			}
		}
	}

	for (const assessment of draft.sectionAssessments) {
		const path = `sectionAssessments.${assessment.section}`;
		const sectionLabel = scopeSectionLabel(assessment.section);
		// A `derived` section is computed or captured server-side (Project health,
		// Baselines). It
		// carries no product decision to sign off, so demanding a verdict on it only
		// pushed the author — and any agent — to assert something it cannot know.
		if (assessment.applicability === 'derived') continue;
		if (assessment.status !== 'ready') {
			issues.push({
				code: 'section-not-ready',
				severity: 'blocking',
				message: t.sectionNotReady(sectionLabel),
				path
			});
		}
		if (assessment.applicability === 'not_applicable') {
			const state = approvalState(assessment, approvals, pendingApprovals);
			if (draft.mode === 'full_product') {
				issues.push({
					code: 'full-product-section-omission',
					severity: 'blocking',
					message: t.sectionFullProduct(sectionLabel),
					path
				});
			} else if (state === 'none') {
				issues.push({
					code: 'section-omission-unapproved',
					severity: 'blocking',
					message: t.sectionUnapproved(sectionLabel),
					path
				});
			} else if (state === 'pending') {
				issues.push({
					code: 'section-omission-approval-pending',
					severity: 'warning',
					message: t.sectionPending(sectionLabel),
					path
				});
			}
		}
	}

	if (!evidence.coherenceReady) {
		issues.push({
			code: 'coherence-not-ready',
			severity: 'blocking',
			message: evidence.coherenceDetail,
			path: 'coherence'
		});
	}
	if (!evidence.experienceReady) {
		issues.push({
			code: 'experience-not-ready',
			severity: 'blocking',
			message: evidence.experienceDetail,
			path: 'experience'
		});
	}

	// The data model must account for everything the behavior kernel knows.
	// Warning severity on purpose: name drift (a synonym, a rename in flight)
	// must not deadlock finish_project, but every uncovered entity stays on the
	// report until someone models it or records why it is excluded.
	const modeledEntities = new Set(evidence.dataEntityNames.map(entityKey));
	const uncoveredEntities = new Map<string, { name: string; features: Set<string> }>();
	for (const usage of evidence.behaviorEntities) {
		const key = entityKey(usage.name);
		if (!key || modeledEntities.has(key)) continue;
		const entry = uncoveredEntities.get(key) ?? { name: usage.name, features: new Set<string>() };
		if (usage.featureName.trim()) entry.features.add(usage.featureName.trim());
		uncoveredEntities.set(key, entry);
	}
	for (const { name, features } of uncoveredEntities.values()) {
		issues.push({
			code: 'behavior-entity-unmodeled',
			severity: 'warning',
			message: t.entityUnmodeled(name, [...features]),
			path: 'data.entities'
		});
	}
	// A table nobody points at and that points at nothing describes no record
	// of the product. Same severity as the coverage warning above, for the same
	// reason: it must be seen on every report, and it must not deadlock finish.
	const unrelatedEntities = unique(evidence.unrelatedDataEntityNames ?? []);
	for (const name of unrelatedEntities) {
		issues.push({
			code: 'data-entity-unrelated',
			severity: 'warning',
			message: t.entityUnrelated(name),
			path: 'data.entities'
		});
	}
	// A field the solver could check but no state carries is knowledge captured
	// twice and never joined: the rule reads true and nothing proves it. Warning,
	// like the two above: it must be seen on every report, never deadlock finish.
	const unlinked = evidence.unlinkedDataFields ?? [];
	const unlinkedCount = unlinked.reduce((sum, row) => sum + row.count, 0);
	if (unlinkedCount > 0) {
		issues.push({
			code: 'data-field-unlinked',
			severity: 'warning',
			message: t.fieldsUnlinked(unlinkedCount, unlinked.slice(0, 3).map((row) => row.table)),
			path: 'data.fields'
		});
	}
	// A source nobody but its author can open is a citation that cannot be
	// checked: the row looks sourced and is not. Warning severity like the two
	// above (it must not deadlock finish), but it fails the traceability check
	// and stays on every report until the row carries a web address or its content.
	// Read from the code, every element says where it comes from (ac-src-extracted):
	// blocking, one issue per section so a fresh retro-spec stays readable.
	const uncited = evidence.uncitedExtracted ?? [];
	for (const kind of EXTRACTED_KINDS) {
		const names = uncited.filter((element) => element.kind === kind).map((element) => element.name);
		if (names.length === 0) continue;
		issues.push({
			code: 'extracted-source-missing',
			severity: 'blocking',
			message: t.extractedUncited(kind, names.length, names.slice(0, 5), evidence.extractedFrom),
			path: EXTRACTED_PATH[kind]
		});
	}
	const unreachableSources = evidence.unreachableSources ?? [];
	for (const source of unreachableSources) {
		issues.push({
			code: source.access === 'empty' ? 'source-empty' : 'source-unreachable',
			severity: 'warning',
			message: source.message,
			path: `documents.sources.${source.id}`
		});
	}
	const behaviorEntityCount = new Set(
		evidence.behaviorEntities.map((usage) => entityKey(usage.name)).filter(Boolean)
	).size;

	const auditFresh =
		draft.audit !== null &&
		draft.audit.scopeFingerprint === evidence.currentScopeFingerprint &&
		draft.audit.modelFingerprint === evidence.currentModelFingerprint;
	if (!auditFresh) {
		issues.push({
			code: 'audit-stale',
			severity: 'blocking',
			message: draft.audit ? t.auditStale : t.auditMissing,
			path: 'audit'
		});
	}

	const blocking = issues.filter((issue) => issue.severity === 'blocking');
	const resolvedCapabilities = capabilities.filter(
		(capability) => capability.disposition !== 'unresolved'
	).length;
	// Derived rows are excluded from the coverage math too — counting sections
	// nobody may assess would cap a fully-authored project below 100%.
	const assessableSections = draft.sectionAssessments.filter(
		(assessment) => assessment.applicability !== 'derived'
	);
	const assessedSections = assessableSections.filter(
		(assessment) => assessment.status === 'ready'
	).length;
	const coverageUnits = capabilities.length + assessableSections.length + 3;
	const completedUnits =
		resolvedCapabilities +
		assessedSections +
		(evidence.coherenceReady ? 1 : 0) +
		(evidence.experienceReady ? 1 : 0) +
		(auditFresh ? 1 : 0);
	const coverageScore = coverageUnits === 0 ? 0 : Math.round((completedUnits / coverageUnits) * 100);
	// A completion of 99 beside a coherence of 19 cannot be read: while the
	// coherence check fails, the lower of the two is the project's truth.
	const score =
		!evidence.coherenceReady && evidence.coherenceScore !== undefined
			? Math.min(coverageScore, Math.round(evidence.coherenceScore))
			: coverageScore;
	const canFinish = blocking.length === 0;
	const stillCompleted = draft.completionStatus === 'completed' && canFinish;

	// A check with nothing to check never reads as passed (criterion 21e556fb):
	// an empty denominator says "not checked yet" and why, the way the coherence
	// and experience checks already do before the scope is declared. Otherwise
	// a fresh project shows green checks beside a health that lists the work.
	const nothingIncluded = !capabilities.some((capability) => capability.disposition === 'included');
	const leafIds = Object.keys(maturity);
	const withoutBehavior = leafIds.filter((id) => maturity[id] <= 0).length;
	const sourcesUnchecked = capabilities.length === 0 && sources.size === 0 && uncited.length === 0;
	const dataUnchecked = behaviorEntityCount === 0 && withoutBehavior === leafIds.length;

	const checks: CompletionCheck[] = [
		{
			key: 'scope',
			label: t.scopeLabel,
			passed:
				draft.mode !== 'unclassified' &&
				capabilities.length > 0 &&
				!issues.some((issue) =>
					[
						'scope-mode-unclassified',
						'scope-empty',
						'capability-name-missing',
						'capability-unresolved',
						'capability-omission-unapproved',
						'full-product-omission'
					].includes(issue.code)
				),
			detail: t.scopeDetail(resolvedCapabilities, capabilities.length)
		},
		{
			key: 'sources',
			label: t.sourcesLabel,
			passed:
				!sourcesUnchecked &&
				!issues.some((issue) => issue.code.startsWith('capability-source') || issue.code === 'extracted-source-missing') &&
				unreachableSources.length === 0,
			detail: sourcesUnchecked ? t.sourcesUnchecked : sourcesCheckDetail(sources.size, unreachableSources.length, lang)
		},
		{
			key: 'mapping',
			label: t.mappingLabel,
			passed: !nothingIncluded && !issues.some((issue) => issue.code.startsWith('capability-feature')),
			detail: nothingIncluded ? t.mappingUnchecked : t.mappingDetail
		},
		{
			key: 'sections',
			label: t.sectionsLabel,
			passed: !issues.some((issue) => issue.code.startsWith('section-') || issue.code.startsWith('full-product-section')),
			detail: t.sectionsDetail(assessedSections, assessableSections.length)
		},
		{
			key: 'coherence',
			label: t.coherenceLabel,
			passed: evidence.coherenceReady,
			detail: evidence.coherenceDetail
		},
		{
			key: 'behavior',
			label: t.behaviorLabel,
			passed:
				!nothingIncluded &&
				!issues.some(
					(issue) =>
						issue.code === 'capability-behavior-missing' ||
						issue.code === 'capability-feature-unknown'
				),
			detail: nothingIncluded ? t.behaviorUnchecked(withoutBehavior, leafIds.length) : t.behaviorDetail
		},
		{
			key: 'data',
			label: t.dataLabel,
			passed: !dataUnchecked && uncoveredEntities.size === 0 && unrelatedEntities.length === 0,
			detail: dataUnchecked
				? t.dataUnchecked
				: dataCheckDetail(uncoveredEntities.size, behaviorEntityCount, unrelatedEntities.length, lang)
		},
		{
			key: 'experience',
			label: t.experienceLabel,
			passed: evidence.experienceReady,
			detail: evidence.experienceDetail
		},
		{
			key: 'audit',
			label: t.auditLabel,
			passed: auditFresh,
			detail: auditFresh ? t.audited(draft.audit?.performedAt ?? '') : t.auditRequired
		}
	];

	return {
		projectId: draft.projectId,
		status: stillCompleted
			? 'completed'
			: canFinish
				? 'ready'
				: draft.audit
					? 'blocked'
					: 'unverified',
		score,
		coverageScore,
		canFinish,
		auditFresh,
		coverage: {
			totalCapabilities: capabilities.length,
			includedCapabilities: capabilities.filter((capability) => capability.disposition === 'included').length,
			resolvedCapabilities,
			assessedSections,
			totalSections: assessableSections.length
		},
		checks,
		issues
	};
}

function stableValue(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
	const object = value as Record<string, unknown>;
	return `{${Object.keys(object)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${stableValue(object[key])}`)
		.join(',')}}`;
}

/** Small deterministic, non-cryptographic fingerprint for stale-audit detection. */
export function fingerprint(value: unknown): string {
	const input = stableValue(value);
	let hash = 0x811c9dc5;
	for (let i = 0; i < input.length; i += 1) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function scopeContentFingerprint(
	draft: ProjectScopeDraft,
	sources: readonly { id: string; title: string; kind: string; url: string; note: string }[] = []
): string {
	const referenced = new Set(draft.capabilities.flatMap((capability) => capability.sourceIds));
	return fingerprint({
		mode: draft.mode,
		capabilities: draft.capabilities,
		sectionAssessments: draft.sectionAssessments,
		sources: sources
			.filter((source) => referenced.has(source.id))
			.slice()
			.sort((a, b) => a.id.localeCompare(b.id))
	});
}
