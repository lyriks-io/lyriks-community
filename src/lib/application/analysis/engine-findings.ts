import { earsOfInvariant, featureStatements, type Constants } from '$lib/unspa-schema/requirement-sentences';
import type { BrokenStatement, ScenarioReport } from '../ports';

/**
 * What the behavior engine found wrong, written for a person without any
 * solver: each statement the bounded exploration broke reads as its EARS
 * requirement with the shortest path to the break as Given / When / Then, and
 * each failing scenario reads as its own Given / When / Then with what the
 * engine saw instead.
 */
export interface EngineFinding {
	readonly key: string;
	readonly label: string;
	/** The requirement at stake, as an EARS sentence (or the scenario's name). */
	readonly requirement: string;
	readonly given: string;
	readonly when: readonly string[];
	readonly then: string;
	/** What the engine reports, in one line. */
	readonly detail: string;
	readonly fix: string;
}

/** One statement broken in one feature: what the project-wide grouping is built from. */
export interface BrokenInFeature {
	readonly featureId: string;
	readonly featureName: string;
	/** The statement's name as the engine holds it: the grouping key. */
	readonly name: string;
	/** The statement as an EARS sentence. */
	readonly requirement: string;
	/** The shortest action path that breaks it in this feature. */
	readonly path: readonly string[];
}

type Node = Record<string, unknown>;
const node = (v: unknown): Node => (v && typeof v === 'object' ? (v as Node) : {});
const arr = (v: unknown): Node[] => (Array.isArray(v) ? v.map(node) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Every statement of the feature (feature, surface and action level) by name, as EARS. */
function invariantsByName(feature: unknown): Map<string, string> {
	const f = node(feature);
	const constants: Constants = Object.fromEntries(arr(f.constants).map((c) => [str(c.name), c.value]));
	const out = new Map<string, string>();
	const add = (inv: Node) => {
		const name = str(inv.name);
		if (name && !out.has(name)) out.set(name, earsOfInvariant(inv, constants));
	};
	arr(f.featureInvariants).forEach(add);
	for (const surface of arr(f.surfaces)) {
		arr(surface.invariants).forEach(add);
		for (const action of arr(surface.actions)) arr(action.invariants).forEach(add);
	}
	return out;
}

/**
 * A project statement is held by no feature, so its logic is not at hand; the
 * data rules Lyriks generates are already named by their EARS sentence. Any
 * other name is read as what the system shall always ensure.
 */
const READS_AS_EARS = /^(The system shall|While |When |If |Where )[\s\S]*\.$/;
const asRequirement = (name: string): string =>
	READS_AS_EARS.test(name) ? name : `The system shall always ensure that ${name.replace(/\.$/, '')}.`;

/**
 * The statements one feature's exploration broke, once each: the engine
 * reports a statement once per action that breaks it, and a person fixes a
 * statement, so only its shortest path is kept.
 */
export function brokenStatements(
	feature: unknown,
	where: { readonly featureId: string; readonly featureName: string },
	broken: readonly BrokenStatement[]
): BrokenInFeature[] {
	const own = invariantsByName(feature);
	const shortest = new Map<string, BrokenStatement>();
	for (const b of broken) {
		const known = shortest.get(b.name);
		if (!known || b.path.length < known.path.length) shortest.set(b.name, b);
	}
	return [...shortest.values()].map((b) => ({
		...where,
		name: b.name,
		requirement: own.get(b.name) ?? asRequirement(b.name),
		path: b.path
	}));
}

/**
 * One card per broken statement across the project. A project statement (a
 * data rule) breaks in every feature that can run without the record it
 * speaks of; one card naming each of them reads as one thing to fix, where a
 * card per feature would bury the Control Center under copies.
 */
export function groupBrokenStatements(
	rows: readonly BrokenInFeature[]
): (EngineFinding & { readonly features: readonly { featureId: string; featureName: string }[] })[] {
	const byName = new Map<string, BrokenInFeature[]>();
	for (const r of rows) byName.set(r.name, [...(byName.get(r.name) ?? []), r]);
	return [...byName.entries()].map(([name, all]) => {
		const first = all.reduce((a, b) => (b.path.length < a.path.length ? b : a));
		const others = all.filter((r) => r !== first);
		const steps = first.path.map((step) => `${first.featureName} › ${step}`);
		return {
			key: `violation:${name}`,
			label: 'Broken',
			requirement: first.requirement,
			given: 'the starting state',
			when: steps.length > 0 ? steps : [first.featureName],
			then: 'the requirement above no longer holds',
			detail:
				others.length === 0
					? `Found by exploring the reachable states of ${first.featureName}.`
					: `Found by exploring the reachable states of ${all.length} features: ${all.map((r) => r.featureName).join(', ')}.`,
			fix: 'Refuse the last step in that case, or stop an earlier step from letting it through.',
			features: all.map((r) => ({ featureId: r.featureId, featureName: r.featureName }))
		};
	});
}

const strip = (line: string | undefined, word: string): string =>
	(line ?? '').replace(new RegExp(`^${word}\\s+`), '').trim();

/** Each failing scenario of one feature, as its own Given / When / Then. */
export function scenarioFindings(feature: unknown, scenarios: ScenarioReport | null): EngineFinding[] {
	const gwt = feature ? featureStatements(feature) : {};
	return (scenarios?.results ?? [])
		.filter((r) => !r.pass)
		.map((r) => {
			const lines = (gwt[`scenario:${r.scenarioId}`] ?? '').split('\n');
			const expected = r.expectedStatus === 'blocked' ? 'it is refused' : 'it succeeds';
			return {
				key: `scenario:${r.scenarioId}`,
				label: 'Scenario fails',
				requirement: `Scenario "${r.scenarioName}" of ${r.actionName}`,
				given: strip(lines[0], 'Given') || 'the starting state',
				when: [strip(lines[1], 'When') || r.actionName],
				then: strip(lines[2], 'Then') || expected,
				detail: r.summary,
				fix: 'Fix the rule or effect the scenario contradicts, or the scenario if it is the one that is wrong.'
			};
		});
}
