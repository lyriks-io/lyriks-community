import { readableName } from '$domain/features';
import { actionCapabilityId, type ProjectUsersDraft } from '$domain/users';
import type { ProjectFeaturesDraft } from '$domain/features';
import type { FeatureAction, FeatureActionIndex } from '../specification/index-feature-actions';
import type { KernelRulesReadModel } from '../specification/index-feature-rules';
import type { VariableHint } from '$domain/rules';
import { sharedRefusalLead } from '../specification/nest-kernel-rules';
import { counted, text } from './labels';
import type { OutlineCore, SpecOutline } from './outline';
import { endUsersFirst, holdersIndex, userClassOf, type UserClass } from './users';

/**
 * The features of the Specification 360°: every core feature with its
 * features, a core feature's page, one feature's page with the path a person
 * goes through, and each of its actions with who may do it and the rules it
 * obeys. Everything is read from the feature tree and the behavior model;
 * nothing is authored here.
 */

export interface JourneyNode {
	readonly kind: 'SCREEN' | 'ACTION';
	readonly label: string;
	/** The action an ACTION node is. */
	readonly actionId?: string;
}

export interface FeatureSummary {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	/** How many actions it declares: the size its row's bar shows. */
	readonly actionCount: number;
}

export interface CoreSummary {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly features: readonly FeatureSummary[];
}

export interface ActionRule {
	readonly id: string;
	/** The whole requirement sentence: what the rule is named by wherever it is discussed. */
	readonly text: string;
	/** A rule decides on the action; an invariant is a statement its effects keep true. */
	readonly kind: 'rule' | 'invariant';
	/** The rule refuses the action (under its condition, when it has one). */
	readonly blocks: boolean;
	/** The kernel's category of a rule (permissions, validation...): permissions decide who may (criterion 6dd2906e). */
	readonly category?: string;
	/** Read-only spans from the canonical sentence's actual source references. */
	readonly variables?: readonly VariableHint[];
	/** Under its action's `refusalLead`: the condition that refuses the action and the message it shows. */
	readonly refusal?: { readonly case: string; readonly message: string; readonly variables?: readonly VariableHint[] };
}

export interface ActionWho {
	readonly id: string;
	readonly name: string;
	readonly tone: string;
	readonly userClass: UserClass;
}

export interface FeatureActionView {
	readonly id: string;
	readonly name: string;
	/** What the action is for (the kernel's intent), '' when the model says nothing. */
	readonly description: string;
	readonly who: readonly ActionWho[];
	readonly rulesCount: string;
	/**
	 * The sentence its refusals share, read once above them, when two or more
	 * rules refuse the action: they then start the same way, and only their
	 * condition and message differ.
	 */
	readonly refusalLead: string | null;
	readonly rules: readonly ActionRule[];
}

export interface FeatureView extends FeatureSummary {
	/** The feature's own description, whole: what editing it changes. */
	readonly description: string;
	readonly coreId: string;
	readonly coreName: string;
	readonly actions: readonly FeatureActionView[];
}

/**
 * What a feature lets a person go through: each screen it owns, then the
 * actions taken there, in the order the behavior model declares them. The
 * names are the stored ones: a validation of the list of actions is taken
 * from this shape, so changing it would drop the validations already given.
 */
export function journeyOf(actions: readonly FeatureAction[]): JourneyNode[] {
	const nodes: JourneyNode[] = [];
	let surface: string | null = null;
	for (const a of actions) {
		if (a.surfaceId !== surface) {
			surface = a.surfaceId;
			if (text(a.surfaceName)) nodes.push({ kind: 'SCREEN', label: text(a.surfaceName) });
		}
		nodes.push({ kind: 'ACTION', label: text(a.name) || a.id, actionId: a.id });
	}
	return nodes;
}

function descriptionOf(features: ProjectFeaturesDraft, id: string): string {
	return features.features.find((f) => f.id === id)?.description ?? '';
}

/** A core feature with its features, each with how many actions it declares: a row of the list, and its own page. */
export function coreView(core: OutlineCore, actions: FeatureActionIndex): CoreSummary {
	return {
		id: core.id,
		name: core.name,
		description: core.description,
		features: core.features.map((f) => ({ id: f.id, name: f.name, description: f.description, actionCount: (actions[f.id] ?? []).length }))
	};
}

export function coreSummaries(outline: SpecOutline, actions: FeatureActionIndex): CoreSummary[] {
	return outline.cores.map((core) => coreView(core, actions));
}

export function featureView(input: {
	core: OutlineCore;
	featureId: string;
	features: ProjectFeaturesDraft;
	actions: FeatureActionIndex;
	rules: KernelRulesReadModel;
	/** The users draft with its grants carried onto the per-action rows. */
	users: ProjectUsersDraft;
}): FeatureView {
	const { core, featureId, features, actions, rules, users } = input;
	const feature = core.features.find((f) => f.id === featureId);
	const own = actions[featureId] ?? [];
	const description = descriptionOf(features, featureId);
	const holders = holdersIndex(users);
	const roleById = new Map(users.roles.map((r) => [r.id, r]));
	const featureRules = rules.groups.find((g) => g.featureId === featureId)?.rules ?? [];

	const actionViews = own.map((a) => {
		const mine = featureRules.filter((r) => r.origin.kind === 'action' && r.origin.actionId === a.id);
		const who = endUsersFirst(
			holders(actionCapabilityId(featureId, a.id))
				.map((id) => roleById.get(id))
				.filter((r) => r !== undefined && text(r.name))
				.map((r) => ({ id: r!.id, name: text(r!.name), tone: r!.tone, userClass: userClassOf(r!.tone) }))
		);
		const refusalLead = sharedRefusalLead(mine);
		return {
			id: a.id,
			name: readableName(text(a.name) || a.id),
			description: text(a.intent),
			who,
			rulesCount: counted(mine.length, 'rule'),
			refusalLead,
			rules: mine.map((r) => ({
				id: r.nodeId,
				text: r.statement,
				kind: r.kind,
				blocks: r.effect === 'block',
				...(r.category ? { category: r.category } : {}),
				...(r.variables ? { variables: r.variables } : {}),
				...(refusalLead && r.refusal ? { refusal: { case: r.refusal.case, message: r.refusal.message, ...(r.refusal.variables ? { variables: r.refusal.variables } : {}) } } : {})
			}))
		};
	});

	return {
		id: featureId,
		name: feature?.name ?? featureId,
		actionCount: own.length,
		description: text(description),
		coreId: core.id,
		coreName: core.name,
		actions: actionViews
	};
}
