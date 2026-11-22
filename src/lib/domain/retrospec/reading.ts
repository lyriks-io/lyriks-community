import type { ProjectArchitectureDraft } from '../architecture';
import type { ProjectDataDraft } from '../data';
import { unrelatedEntities } from '../data';
import type { ProjectDocumentsDraft } from '../documents';
import type { ProjectExperienceDraft } from '../experience';
import type { ProjectFeaturesDraft } from '../features';
import type { ProjectFoundationDraft } from '../foundation';
import type { ProjectGlossaryDraft } from '../glossary';
import type { ProjectRulesDraft } from '../rules';
import type { ProjectScopeDraft } from '../scope';
import type { ProjectUsersDraft, RoleTone } from '../users';
import { isRelation, dataLayout } from './reading-data';
import { experienceItems } from './reading-experience';
import { actionLayout, featureLayout } from './reading-features';
import { foundationItems } from './reading-foundations';
import { infraItems, techItems } from './reading-infra';
import { usersLayout } from './reading-users';
import { plural } from './reading-text';

/**
 * What the AI rebuilt, read section by section the way a person reviews it:
 * eight tabs (Foundations, Features, Actions, Users, Experience, Tech, Data,
 * Infra), each holding the items a person validates, rejects, sets aside or
 * shares. Every item is read from the specification as it stands; an item the
 * specification holds nothing for is left out rather than shown empty, so the
 * review counts only what was rebuilt.
 *
 * Item ids are the specification's own ids (a feature, an action, a role), so
 * a verdict keeps pointing at the same element whatever is added around it.
 * Pure: the sections arrive already read.
 */

export type RetroTabKey = 'foundations' | 'features' | 'actions' | 'users' | 'experience' | 'tech' | 'data' | 'infra';

export const RETRO_TABS: readonly { key: RetroTabKey; label: string; todo: string }[] = [
	{ key: 'foundations', label: 'Foundations', todo: 'Validate the foundations of the tool.' },
	{ key: 'features', label: 'Features', todo: 'Validate or reject each feature.' },
	{ key: 'actions', label: 'Actions', todo: 'Validate each action and its rules.' },
	{ key: 'users', label: 'Users', todo: 'Validate the users, then their permissions.' },
	{ key: 'experience', label: 'Experience', todo: 'Validate the branding, journeys and components.' },
	{ key: 'tech', label: 'Tech', todo: 'Validate the tech stack.' },
	{ key: 'data', label: 'Data', todo: 'Validate the data model.' },
	{ key: 'infra', label: 'Infra', todo: 'Validate the infrastructure.' }
];

/** The behaviour the AI authored, as the reading needs it: a feature's actions and each action's rules. */
export interface RetrospecBehavior {
	readonly actionsByFeature: Readonly<Record<string, readonly { readonly id: string; readonly name: string; readonly intent: string }[]>>;
	/** Keyed `${featureId}:${actionId}`. */
	readonly rulesByAction: Readonly<Record<string, readonly { readonly id: string; readonly text: string }[]>>;
	/** Leaf features holding any authored behaviour. */
	readonly authoredFeatureIds: readonly string[];
}

export interface RetrospecSpec {
	readonly foundation: ProjectFoundationDraft;
	readonly scope: ProjectScopeDraft;
	readonly users: ProjectUsersDraft;
	readonly features: ProjectFeaturesDraft;
	readonly data: ProjectDataDraft;
	readonly experience: ProjectExperienceDraft;
	readonly rules: ProjectRulesDraft;
	readonly glossary: ProjectGlossaryDraft;
	readonly architecture: ProjectArchitectureDraft;
	readonly documents: ProjectDocumentsDraft;
	readonly behavior: RetrospecBehavior;
}

export interface LexiconRow {
	readonly term: string;
	readonly definition: string;
	readonly synonyms: readonly string[];
	readonly banned: readonly string[];
}

/** One element a person reviews. Only the blocks its content holds are set. */
export interface RetroItem {
	readonly id: string;
	/** How the page numbers it: "1.2" in Foundations, "IN-1" elsewhere. */
	readonly ref: string;
	readonly tab: RetroTabKey;
	readonly title: string;
	readonly desc: string;
	/** Reject is offered: the element can be removed from the specification. */
	readonly rejectable: boolean;
	readonly tiles?: readonly { readonly k: string; readonly v: string }[];
	readonly lead?: { readonly kicker: string; readonly text: string };
	readonly symptoms?: readonly string[];
	readonly outcomes?: readonly { readonly label: string; readonly from: string; readonly to: string }[];
	readonly formFactors?: readonly { readonly group: string; readonly options: readonly string[] }[];
	readonly chips?: readonly string[];
	readonly steps?: readonly string[];
	readonly swatches?: readonly { readonly name: string; readonly color: string }[];
	readonly lexicon?: readonly LexiconRow[];
	readonly typography?: { readonly family: string; readonly detail: string };
	/** The item stands for the whole data model, drawn from `RetroTab.datamap`. */
	readonly datamap?: boolean;
}

export interface FeatureGroup {
	readonly id: string;
	readonly title: string;
	readonly desc: string;
	readonly items: readonly RetroItem[];
}

export interface ActionFeature {
	readonly id: string;
	readonly core: string;
	readonly name: string;
	readonly actions: readonly { readonly item: RetroItem; readonly rules: readonly RetroItem[] }[];
}

export interface RoleItem {
	readonly item: RetroItem;
	readonly tone: RoleTone;
}

export interface PermissionMatrix {
	readonly item: RetroItem;
	/** One column per role, in the roster's order. */
	readonly roles: readonly { readonly id: string; readonly name: string }[];
	/** A heading row names a feature; a row holds one capability and whether each role may use it. */
	readonly rows: readonly ({ readonly head: string } | { readonly label: string; readonly access: readonly boolean[] })[];
}

export interface UsersLayout {
	readonly groups: readonly { readonly label: string; readonly roles: readonly RoleItem[] }[];
	readonly permissions: PermissionMatrix | null;
}

export interface DataTable {
	readonly id: string;
	readonly name: string;
	readonly rows: readonly { readonly key: 'PK' | 'FK' | ''; readonly name: string; readonly type: string }[];
}

export interface DataMapLayout {
	/** Where the data lives: each host with its databases and their tables. */
	readonly hosts: readonly {
		readonly id: string;
		readonly name: string;
		readonly kind: string;
		readonly where: string;
		readonly databases: readonly { readonly id: string; readonly name: string; readonly engine: string; readonly tables: readonly DataTable[] }[];
	}[];
	/** Tables filed under no database. */
	readonly loose: readonly DataTable[];
	readonly tableCount: number;
}

export interface RetroTab {
	readonly key: RetroTabKey;
	readonly label: string;
	readonly todo: string;
	/** Every item of the tab in the order a person goes through them (the next one to validate is the first left). */
	readonly items: readonly RetroItem[];
	readonly featureGroups?: readonly FeatureGroup[];
	readonly actionFeatures?: readonly ActionFeature[];
	readonly users?: UsersLayout;
	readonly datamap?: DataMapLayout;
}

/** What the specification holds, counted once for the summary, the phases and the note. */
export interface SpecCounts {
	readonly sources: number;
	readonly capabilities: number;
	readonly roles: number;
	readonly cores: number;
	readonly features: number;
	readonly featuresWithBehavior: number;
	readonly actions: number;
	readonly rules: number;
	readonly entities: number;
	readonly relations: number;
	readonly orphanTables: number;
	readonly screens: number;
	readonly journeys: number;
	readonly steps: number;
	readonly stepsOnScreen: number;
	readonly scenarios: number;
	readonly openIssues: number;
	readonly terms: number;
	readonly technologies: number;
}

export interface RetroReading {
	readonly tabs: readonly RetroTab[];
	readonly counts: SpecCounts;
}

function numbered(tabIndex: number, items: Omit<RetroItem, 'ref'>[]): RetroItem[] {
	return items.map((item, i) => ({ ...item, ref: `${tabIndex}.${i + 1}` }));
}

function prefixed(prefix: string, items: Omit<RetroItem, 'ref'>[]): RetroItem[] {
	return items.map((item, i) => ({ ...item, ref: `${prefix}-${i + 1}` }));
}

export function specCounts(spec: RetrospecSpec): SpecCounts {
	const actions = Object.values(spec.behavior.actionsByFeature).reduce((n, list) => n + list.length, 0);
	const rules = Object.values(spec.behavior.rulesByAction).reduce((n, list) => n + list.length, 0);
	const leafIds = new Set(spec.features.features.map((f) => f.id));
	const steps = spec.experience.steps;
	return {
		sources: spec.documents.sources.length,
		capabilities: spec.scope.capabilities.length,
		roles: spec.users.roles.length,
		cores: spec.features.cores.length,
		features: spec.features.features.length,
		featuresWithBehavior: spec.behavior.authoredFeatureIds.filter((id) => leafIds.has(id)).length,
		actions,
		rules,
		entities: spec.data.entities.length,
		relations: spec.data.fields.filter(isRelation).length,
		orphanTables: unrelatedEntities(spec.data).length,
		screens: spec.experience.screens.length,
		journeys: spec.experience.journeys.length,
		steps: steps.length,
		stepsOnScreen: steps.filter((s) => s.linkedScreenId).length,
		scenarios: spec.rules.scenarios.length,
		openIssues: spec.rules.issues.filter((i) => i.status === 'open' || i.status === 'in_review').length,
		terms: spec.glossary.terms.length,
		technologies: spec.architecture.techChoices.length
	};
}

export function readRetrospec(spec: RetrospecSpec, productName: string): RetroReading {
	const counts = specCounts(spec);
	const features = featureLayout(spec);
	const actions = actionLayout(spec);
	const users = usersLayout(spec);
	const data = dataLayout(spec);
	const meta = (key: RetroTabKey) => RETRO_TABS.find((t) => t.key === key)!;
	const foundations = numbered(1, foundationItems(spec, productName, counts));
	const tabs: RetroTab[] = [
		{ ...meta('foundations'), todo: `Validate the ${plural(foundations.length, 'foundation')} of the tool.`, items: foundations },
		{ ...meta('features'), items: features.items, featureGroups: features.groups },
		{ ...meta('actions'), items: actions.items, actionFeatures: actions.features },
		{ ...meta('users'), items: users.items, users: users.layout },
		{ ...meta('experience'), items: prefixed('EX', experienceItems(spec)) },
		{ ...meta('tech'), items: prefixed('TC', techItems(spec)) },
		{ ...meta('data'), items: prefixed('DT', data.items), datamap: data.map },
		{ ...meta('infra'), items: prefixed('IN', infraItems(spec)) }
	];
	return { tabs: tabs.filter((t) => t.items.length > 0), counts };
}

/** The tab an item id belongs to, read from the id alone (a notification links to it without the reading). */
export function tabOfItem(itemId: string): RetroTabKey | null {
	const kind = itemId.split(':', 1)[0];
	const byKind: Readonly<Record<string, RetroTabKey>> = {
		fd: 'foundations',
		feature: 'features',
		action: 'actions',
		rule: 'actions',
		role: 'users',
		users: 'users',
		exp: 'experience',
		journey: 'experience',
		tech: 'tech',
		data: 'data',
		infra: 'infra'
	};
	return byKind[kind] ?? null;
}
