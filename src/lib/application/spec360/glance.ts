import {
	ALL_FORM_FACTORS,
	MARKET_TYPES,
	PRODUCT_TYPES,
	industryLabelOf,
	type FoundationDefinitionDraft,
	type FoundationIdentityDraft
} from '$domain/foundation';
import { ARCH_LAYERS, type ProjectArchitectureDraft } from '$domain/architecture';
import type { ProjectUsersDraft } from '$domain/users';
import { counted, labelOf, labelsOf, leadSentence, withUnit, text } from './labels';
import type { SpecOutline } from './outline';
import { endUsersFirst, userClassOf, type UserClass } from './users';
import { classificationOf, type ProductClassification } from './classification';

/**
 * At a glance: the software in two minutes, read from the spec as it stands.
 * Every block comes from one place of the spec (the brief and its identity,
 * the business objective, the personas, the feature tree, the stack); a block
 * whose source is empty is left out by the page rather than filled in.
 */

export interface GlanceOutcome {
	readonly label: string;
	/** What it is today, '' when the spec gives no current value. */
	readonly from: string;
	/** The value aimed at, '' when the spec names the result without a value. */
	readonly to: string;
}

export interface GlanceUser {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly tone: string;
	readonly userClass: UserClass;
}

export interface GlanceCore {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly featureCount: string;
	/** How many features it holds: the length of its bar on the Overview (criterion 416e4885). */
	readonly features: number;
}

export interface GlanceCounts {
	readonly features: number;
	readonly actions: number;
	readonly rules: number;
	readonly users: number;
	readonly entities: number;
	readonly terms: number;
}

export interface GlanceView {
	readonly pitch: string;
	/** The whole brief the pitch leads: what editing the summary changes. */
	readonly brief: string;
	readonly meta: readonly ClassificationChips[];
	/** The choices behind the meta chips, for the product's editor. */
	readonly classification: ProductClassification;
	readonly problem: string;
	readonly symptoms: readonly string[];
	readonly target: string;
	readonly outcomes: readonly GlanceOutcome[];
	readonly users: readonly GlanceUser[];
	readonly cores: readonly GlanceCore[];
	readonly stack: readonly string[];
	/** "83 features · 210 actions · …", the line Go deeper and Features open on. */
	readonly numbers: string;
}

/** The stack chips a reader scans first: one per technology, in layer order, versions kept. */
const STACK_CHIPS = 8;

export function stackChips(architecture: ProjectArchitectureDraft, limit = STACK_CHIPS): string[] {
	const order = ARCH_LAYERS.map((l) => l.code as string);
	return [...architecture.techChoices]
		.filter((t) => text(t.name))
		.sort((a, b) => order.indexOf(a.layer) - order.indexOf(b.layer))
		.map((t) => (text(t.version) ? `${text(t.name)} ${text(t.version)}` : text(t.name)))
		.slice(0, limit);
}

export function countsLine(c: GlanceCounts): string {
	return [
		counted(c.features, 'feature'),
		counted(c.actions, 'action'),
		counted(c.rules, 'rule'),
		counted(c.users, 'user'),
		counted(c.entities, 'entity', 'entities'),
		counted(c.terms, 'term')
	].join(' · ');
}

/** One group of the product's chips: what it fills in the product's profile, and its chosen labels. */
export interface ClassificationChips {
	readonly dimension: 'Market' | 'Industry' | 'Product type' | 'Form factors';
	readonly labels: readonly string[];
}

/**
 * The chips the product's type reads as, grouped by what each fills in the product's profile (criterion 3bb5b091):
 * its market, industry, product type and form factors, each once chosen; a group with nothing chosen is left out.
 */
export function classificationChips(c: ProductClassification): ClassificationChips[] {
	const groups: ClassificationChips[] = [
		{ dimension: 'Market', labels: [c.marketType ? labelOf(MARKET_TYPES, c.marketType) : ''] },
		{ dimension: 'Industry', labels: [c.industry ? industryLabelOf(c.industry) : ''] },
		{ dimension: 'Product type', labels: [c.productType ? labelOf(PRODUCT_TYPES, c.productType) : ''] },
		{ dimension: 'Form factors', labels: labelsOf(ALL_FORM_FACTORS, c.formFactors) }
	];
	return groups.map((g) => ({ ...g, labels: g.labels.filter((m) => text(m) !== '') })).filter((g) => g.labels.length > 0);
}

export function glanceView(input: {
	identity: FoundationIdentityDraft;
	definition: FoundationDefinitionDraft;
	users: ProjectUsersDraft;
	outline: SpecOutline;
	architecture: ProjectArchitectureDraft;
	counts: GlanceCounts;
}): GlanceView {
	const { identity, definition, users, outline, architecture, counts } = input;
	const objective = definition.businessObjective;
	// A definition never saved holds the form's defaults (B2B, RBAC...), not answers.
	const answered = definition.lastSavedAt !== null;
	const named = identity.lastSavedAt !== null;
	const meta = classificationChips({
		marketType: answered ? definition.market.marketType : null,
		industry: named ? identity.industry : null,
		productType: named ? identity.productType : null,
		formFactors: identity.formFactors
	});

	// A pain point held both linked and plain reads once.
	const symptoms = [
		...new Set([
			...objective.painPointLinks.map((p) => text(p.text)),
			...objective.painPoints.map((p) => text(p))
		])
	].filter(Boolean);

	// Every named result reads, its values when the spec gives them (criterion 416e4885): a result is a KPI.
	const outcomes = objective.kpis
		.filter((k) => text(k.name))
		.map((k) => ({
			label: text(k.name),
			from: withUnit(k.currentValue, k.unit),
			to: withUnit(k.targetValue, k.unit)
		}));

	return {
		pitch: leadSentence(identity.brief),
		brief: text(identity.brief),
		meta,
		classification: classificationOf(identity, definition),
		problem: text(objective.mainProblem),
		symptoms,
		target: text(objective.expectedOutcome),
		outcomes,
		users: endUsersFirst(
			users.roles
				.filter((r) => text(r.name))
				.map((r) => ({ id: r.id, name: text(r.name), description: text(r.description), tone: r.tone, userClass: userClassOf(r.tone) }))
		),
		cores: outline.cores.map((c) => ({
			id: c.id,
			name: c.name,
			description: c.description,
			featureCount: counted(c.features.length, 'feature'),
			features: c.features.length
		})),
		stack: stackChips(architecture),
		numbers: countsLine(counts)
	};
}
