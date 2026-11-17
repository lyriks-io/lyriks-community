import type { ProjectDataDraft } from '../data';
import { unrelatedEntities } from '../data';
import type { DocumentSource } from '../documents';
import type { ProjectExperienceDraft } from '../experience';
import type { ProjectFeaturesDraft } from '../features';
import type { ProjectRulesDraft } from '../rules';
import { earsOfDetectedEdge, readsAsEars } from '../rules';
import type { Gap } from '../coherence';
import { effectivePenalties } from '../coherence/incoherence';
import { isBlockingIssue, issueGapId } from '../coherence/issue-gap';
import { unconfirmedReason } from './summary';
import { isKeptIssue } from './finding-decision';
import { checkKind, FINAL_CHECK_KIND, gapKind, issueKind, UNRELATED_TABLES_KIND, type FindingKind } from './finding-kinds';

/**
 * What Lyriks noticed in the rebuilt specification, each with the problem sheet
 * a person opens beside the analysis. Two origins, both real: the issues the
 * AI recorded while reading the code (contradictions, unhandled cases, missing
 * rules), and the gaps Lyriks computes on the specification itself (tables
 * related to nothing, journey steps on no screen, features with no behaviour).
 * Pure.
 */

export type FindingTone = 'major' | 'minor';

export interface FindingSheetSection {
	/** The heading, in capitals as the design writes it. */
	readonly heading: string;
	readonly text?: string;
	readonly list?: readonly { readonly k: string; readonly v: string }[];
}

export interface Finding {
	readonly id: string;
	readonly tone: FindingTone;
	/** The final check could not confirm it: listed apart, before what was read from the code. */
	readonly unconfirmed?: true;
	readonly text: string;
	/** The point as an EARS statement, when Lyriks can write it without an AI: the list reads it, its keywords standing out (criterion ad34b2f4). */
	readonly ears?: string;
	/** The description behind the point (the one its AI wrote, or Lyriks' own), shown on hover. */
	readonly hint?: string;
	/** How far an unconfirmed point reaches ("6 features"), read beside it. */
	readonly reach?: string;
	/** The zone it belongs to, as a short tag. */
	readonly where: string;
	/** Its type, which What Lyriks noticed groups by and explains on hover (criterion 4996a6b4). */
	readonly kind: FindingKind;
	readonly sheet: { readonly kicker: string; readonly title: string; readonly sections: readonly FindingSheetSection[] };
	/**
	 * An issue a person settles from its sheet: the question its kind raises, answered by keeping it as it is
	 * (the issue resolved) or by asking for a change in its thread (criterion e0f69b3c).
	 */
	readonly decision?: { readonly issueId: string; readonly question: string };
	/**
	 * The ids Project health gives the point (one per gap it stands for), so an
	 * evolution request names it (criterion e0f69b3c); absent when Project health
	 * does not list it as such (a gap Lyriks computes for this list alone).
	 */
	readonly gapIds?: readonly string[];
	/** The feature it concerns, when it names one that exists: the drawer opens it. */
	readonly featureId?: string;
	/** It holds the build gate (a critical contradiction): fixed through an evolution, never rejected. */
	readonly blocking?: true;
}

export interface FindingsInput {
	readonly rules: ProjectRulesDraft;
	readonly features: ProjectFeaturesDraft;
	readonly data: ProjectDataDraft;
	readonly experience: ProjectExperienceDraft;
	readonly sources: readonly DocumentSource[];
	/** Leaf features holding any authored behaviour. */
	readonly authoredFeatureIds: readonly string[];
}

const clean = (s: string | null | undefined) => (s ?? '').trim();

/**
 * Nothing is settled from the analysis: a finding is read now and acted on
 * later. Each one says what can be done with it, and where it waits meanwhile.
 */
const FIND_IT_AGAIN: FindingSheetSection = {
	heading: 'WHERE YOU FIND IT AGAIN',
	text: 'It stays in Health until someone settles it.'
};

/** The one question each kind of issue raises; its two answers are on the sheet (criterion e0f69b3c). */
const QUESTION: Readonly<Record<string, string>> = {
	contradiction: 'Is what the specification says now the right behaviour?',
	missing_rule: 'Is the product right without this rule?',
	ambiguity: 'Is this how the product should behave?',
	overlap: 'Can both rules stay as they are?',
	dead_rule: 'Should this rule stay as it is?',
	unreachable_state: 'Should this state stay as it is?',
	unhandled_edge: 'Is this how the product should behave here?'
};
const questionOf = (kind: string) => QUESTION[kind] ?? 'Is this how the product should behave?';
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type IssueInput = Pick<FindingsInput, 'rules' | 'features' | 'experience' | 'sources'>;
type Issue = ProjectRulesDraft['issues'][number];

function issueFindings(input: IssueInput, keep: (issue: Issue) => boolean): Finding[] {
	const featureName = new Map(input.features.features.map((f) => [f.id, clean(f.name)]));
	const journeyName = new Map(input.experience.journeys.map((j) => [j.id, clean(j.name)]));
	const source = new Map(input.sources.map((s) => [s.id, s]));
	return input.rules.issues
		.filter((i) => keep(i) && clean(i.title))
		.map((issue): Finding => {
			const tone: FindingTone = issue.severity === 'minor' ? 'minor' : 'major';
			const kind = issueKind(issue.kind);
			const feature = issue.relatedFeatureId ? featureName.get(issue.relatedFeatureId) : undefined;
			const journey = issue.relatedJourneyId ? journeyName.get(issue.relatedJourneyId) : undefined;
			const where = [
				...(feature ? [{ k: 'Feature', v: feature }] : []),
				...(journey ? [{ k: 'Journey', v: journey }] : []),
				...input.rules.inventory.filter((r) => issue.relatedRuleIds.includes(r.id)).map((r) => ({ k: 'Rule', v: clean(r.statement) || clean(r.label) }))
			];
			const cited = issue.sourceIds.map((id) => source.get(id)).filter((s): s is DocumentSource => !!s);
			const sections: FindingSheetSection[] = [
				{ heading: 'IN SHORT', text: clean(issue.detail) || clean(issue.title) },
				...(where.length > 0 ? [{ heading: 'WHERE IT APPLIES', list: where }] : []),
				...(cited.length > 0 ? [{ heading: 'WHERE IT COMES FROM', list: cited.map((s) => ({ k: s.kind === 'code' ? 'Code' : 'Source', v: clean(s.title) || clean(s.url) })) }] : []),
				...(clean(issue.resolutionNote) ? [{ heading: 'NOTE', text: clean(issue.resolutionNote) }] : []),
				FIND_IT_AGAIN
			];
			return {
				id: `issue:${issue.id}`,
				tone,
				text: clean(issue.title),
				// A missing failure path the detection raised reads as the requirement it leaves open; anything an AI wrote keeps its title.
				...(issue.kind === 'unhandled_edge' && earsOfDetectedEdge(issue.title) ? { ears: earsOfDetectedEdge(issue.title)! } : {}),
				...(clean(issue.detail) ? { hint: clean(issue.detail) } : {}),
				where: feature || kind.label,
				kind,
				sheet: { kicker: `PROBLEM SHEET · ${kind.label.toUpperCase()} · ${tone === 'major' ? 'MAJOR' : 'MINOR'} IMPACT`, title: clean(issue.title), sections },
				decision: { issueId: issue.id, question: questionOf(issue.kind) },
				gapIds: [issueGapId(issue.kind, issue.id)],
				...(feature && issue.relatedFeatureId ? { featureId: issue.relatedFeatureId } : {}),
				...(isBlockingIssue(issue) ? { blocking: true as const } : {})
			};
		});
}

const stillOpen = (issue: Issue) => issue.status === 'open' || issue.status === 'in_review';

/**
 * The issues a person rejected from the Overview, kept as they are (criterion
 * e0f69b3c): read like the open ones, so their row stays listed, struck
 * through, with the Undo that puts them back to review. Major first.
 */
export function keptIssueFindings(input: IssueInput): Finding[] {
	const all = issueFindings(input, isKeptIssue);
	return [...all.filter((f) => f.tone === 'major'), ...all.filter((f) => f.tone === 'minor')];
}

function computedFindings(input: FindingsInput): Finding[] {
	const out: Finding[] = [];
	const orphans = unrelatedEntities(input.data);
	if (orphans.length > 0) {
		out.push({
			id: 'computed:orphan-tables',
			tone: 'minor',
			text: `${plural(orphans.length, 'table')} related to nothing: possibly dead code`,
			where: 'Data',
			kind: UNRELATED_TABLES_KIND,
			sheet: {
				kicker: 'PROBLEM SHEET · DATA MODEL · MINOR IMPACT',
				title: `${plural(orphans.length, 'table')} related to nothing`,
				sections: [
					{ heading: 'IN SHORT', text: 'No other table points at these, and they point at none. Either the product never uses them, or the code relates them in a way the specification has not captured yet.' },
					{ heading: 'THE TABLES', list: orphans.map((e) => ({ k: 'Table', v: clean(e.name) || e.id })) },
					{ heading: 'WHAT YOU CAN DO', text: 'Relate each table to what owns it, or mark it as standing alone with the reason: your LLM does either in the data model.' },
					FIND_IT_AGAIN
				]
			}
		});
	}
	const steps = input.experience.steps;
	const loose = steps.filter((s) => !s.linkedScreenId);
	if (steps.length > 0 && loose.length > 0) {
		const journeyName = new Map(input.experience.journeys.map((j) => [j.id, clean(j.name)]));
		out.push({
			id: 'computed:steps-off-screen',
			tone: 'minor',
			text: `${plural(loose.length, 'journey step')} on no screen`,
			where: 'Experience',
			// The same type the coherence check names, so both read in one group.
			kind: checkKind('Step without a screen', 'experience.plan.step-unlinked'),
			sheet: {
				kicker: 'PROBLEM SHEET · EXPERIENCE · MINOR IMPACT',
				title: `${plural(loose.length, 'journey step')} on no screen`,
				sections: [
					{ heading: 'IN SHORT', text: 'A step a person takes should happen on a screen of the product. These steps name none, so the journey cannot be followed screen by screen.' },
					{ heading: 'THE STEPS', list: loose.map((s) => ({ k: journeyName.get(s.journeyId) || 'Journey', v: clean(s.name) || s.id })) },
					{ heading: 'WHAT YOU CAN DO', text: 'Name the screen each step happens on: your LLM adds it to the journey.' },
					FIND_IT_AGAIN
				]
			}
		});
	}
	const authored = new Set(input.authoredFeatureIds);
	const bare = input.features.features.filter((f) => !authored.has(f.id));
	if (input.features.features.length > 0 && bare.length > 0) {
		out.push({
			id: 'computed:features-without-behavior',
			tone: bare.length === input.features.features.length ? 'major' : 'minor',
			text: `${plural(bare.length, 'feature')} with no action described`,
			where: 'Features',
			kind: checkKind('Behavior not authored', 'features.maturity'),
			sheet: {
				kicker: `PROBLEM SHEET · FEATURES · ${bare.length === input.features.features.length ? 'MAJOR' : 'MINOR'} IMPACT`,
				title: `${plural(bare.length, 'feature')} with no action described`,
				sections: [
					{ heading: 'IN SHORT', text: 'These features are named, but nothing says what a person can do in them yet: no action, no rule, nothing to validate below the name.' },
					{ heading: 'THE FEATURES', list: bare.map((f) => ({ k: 'Feature', v: clean(f.name) || f.id })) },
					{ heading: 'WHAT YOU CAN DO', text: 'Ask your LLM to describe what a person does in each one, from the code.' },
					FIND_IT_AGAIN
				]
			}
		});
	}
	return out;
}

/** Major first, then in the order they were recorded. */
export function retrospecFindings(input: FindingsInput): Finding[] {
	const all = [...issueFindings(input, stillOpen), ...computedFindings(input)];
	return [...all.filter((f) => f.tone === 'major'), ...all.filter((f) => f.tone === 'minor')];
}

// ── What the final check could not confirm ─────────────────────────────────

/** "The system shall always ensure that While a Link exists, the system shall ensure that it has an address.." → the rule itself. */
function ruleOf(title: string): string {
	return clean(title)
		.replace(/^The system shall always ensure that\s+/i, '')
		.replace(/\.+$/, '')
		.trim();
}

/** "While a Link exists, the system shall ensure that it has an address" → "every Link has an address". */
function plainRule(rule: string): string {
	const has = /^While an? (.+?) exists, the system shall ensure that it has (.+)$/i.exec(rule);
	if (has) return `every ${has[1]} has ${has[2]}`;
	return rule.charAt(0).toLowerCase() + rule.slice(1);
}

/** The step of the counterexample that breaks the rule ("when See my links, then …" → "See my links"). */
const breakingStep = (detail: string) =>
	(/\bwhen (.+?), then\b/i.exec(detail)?.[1] ?? '')
		// The inputs of the step ("(expireInMinutes 1)") are the engine's names, not the reader's.
		.replace(/\s*\([^()]*\)\s*$/, '')
		.trim();
const fromTheStart = (detail: string) => /^Given nothing has happened yet\b/i.test(clean(detail));

/**
 * The blocking points of the final check, as findings a person reads without
 * asking anyone: a rule the engine could not confirm in some features is ONE
 * finding naming the rule, the features and the step that breaks it in each,
 * what it means and what can be done. Any other blocking point is one finding
 * in its own words. Nothing is settled here; they wait with the rest.
 */
export function finalCheckFindings(gaps: readonly Gap[]): Finding[] {
	const blocking = gaps.filter((g) => g.blocking);
	const byRule = new Map<string, Gap[]>();
	const others: Gap[] = [];
	for (const gap of blocking) {
		if (gap.checkId === 'behavior.model-check' && /^The system shall always ensure that/i.test(clean(gap.title))) {
			const rule = ruleOf(gap.title);
			byRule.set(rule, [...(byRule.get(rule) ?? []), gap]);
		} else others.push(gap);
	}
	const out: Finding[] = [];
	for (const [rule, list] of byRule) {
		const features = [...new Set(list.map((g) => clean(g.subject)).filter(Boolean))];
		const start = list.every((g) => fromTheStart(g.detail));
		const plain = plainRule(rule);
		const title = `Not confirmed: ${plain}`;
		const reach = plural(features.length || list.length, 'feature');
		const inShort =
			`The specification says ${plain}. Lyriks plays every feature step by step and checks that rule after each step. ` +
			(start
				? `In ${plural(features.length, 'feature')} it does not hold from the very start: the feature works on a ${/^every (.+?) has/i.exec(plain)?.[1] ?? 'record'} without describing it fully, so nothing shows the rule holds there.`
				: `In ${plural(features.length, 'feature')} it found a path after which the rule no longer holds.`) +
			' Until it is settled, the project health stays blocked.';
		out.push({
			id: `check:${rule}`,
			tone: 'major',
			unconfirmed: true,
			gapIds: list.map((g) => g.id),
			text: `${title} (${reach})`,
			// The requirement the check holds, as the engine wrote it (criterion ad34b2f4).
			ears: readsAsEars(rule) ? rule.charAt(0).toUpperCase() + rule.slice(1) : `The system shall always ensure that ${rule}`,
			hint: inShort,
			reach,
			where: FINAL_CHECK_KIND.label,
			kind: FINAL_CHECK_KIND,
			sheet: {
				kicker: 'NOT CONFIRMED · FINAL CHECK · BLOCKS THE PROJECT HEALTH',
				title,
				sections: [
					{ heading: 'IN SHORT', text: inShort },
					{ heading: 'WHERE IT APPLIES', list: list.map((g) => ({ k: clean(g.subject) || 'Feature', v: breakingStep(g.detail) ? `breaks after "${breakingStep(g.detail)}"` : clean(g.detail) })) },
					{ heading: 'WHERE IT COMES FROM', list: [{ k: 'Check', v: 'Final check, project health' }, { k: 'Rule', v: rule }] },
					{
						heading: 'WHAT YOU CAN DO',
						text: start
							? 'Nothing to change in the product: the gap is in how these features are described. Your LLM completes their description (the specification only, no code), then the final check runs again.'
							: 'Replay the path with your LLM: either the product really lets it happen, and it is a bug to fix in the code, or the specification misses the guard that stops it, and your LLM adds it.'
					},
					FIND_IT_AGAIN
				]
			}
		});
	}
	for (const gap of others) {
		out.push({
			id: `check:${gap.id}`,
			tone: 'major',
			unconfirmed: true,
			gapIds: [gap.id],
			text: `Not confirmed: ${clean(gap.title)}`,
			...(readsAsEars(gap.title) ? { ears: clean(gap.title) } : {}),
			...(clean(gap.detail) ? { hint: clean(gap.detail) } : {}),
			where: FINAL_CHECK_KIND.label,
			kind: FINAL_CHECK_KIND,
			sheet: {
				kicker: 'NOT CONFIRMED · FINAL CHECK · BLOCKING',
				title: clean(gap.title),
				sections: [
					{ heading: 'IN SHORT', text: clean(gap.detail) || clean(gap.title) },
					...(clean(gap.subject) ? [{ heading: 'WHERE IT APPLIES', list: [{ k: 'Element', v: clean(gap.subject) }] }] : []),
					{ heading: 'WHAT YOU CAN DO', text: clean(gap.action) || 'Your LLM settles it in the specification, then the final check runs again.' },
					FIND_IT_AGAIN
				]
			}
		});
	}
	return out;
}

/**
 * The other checks the final audit failed (project health is read gap by gap
 * above): one finding each, so a blocked check never hides behind a score.
 */
export function failedCheckFindings(failedChecks: readonly string[]): Finding[] {
	return failedChecks
		.filter((key) => key !== 'coherence')
		.map((key): Finding => ({
			id: `check:${key}`,
			tone: 'major',
			unconfirmed: true,
			text: `Not confirmed: ${unconfirmedReason(key).charAt(0).toLowerCase()}${unconfirmedReason(key).slice(1)}`,
			where: FINAL_CHECK_KIND.label,
			kind: FINAL_CHECK_KIND,
			sheet: {
				kicker: 'NOT CONFIRMED · FINAL CHECK · BLOCKING',
				title: unconfirmedReason(key),
				sections: [
					{ heading: 'IN SHORT', text: `The final check could not confirm this part: ${unconfirmedReason(key).toLowerCase()}.` },
					{ heading: 'WHAT YOU CAN DO', text: 'Your LLM completes this part of the specification, then the final check runs again.' },
					FIND_IT_AGAIN
				]
			}
		}));
}

/** Who says so, in the reader's words: the guarantee behind a point. */
const SAID_BY: Readonly<Record<string, string>> = {
	declared: 'Declared by a person',
	detected: 'Detected by Lyriks',
	proven: 'Proven by the formal engine',
	reviewed: 'Found by the AI review',
	behavior: 'Found by the behavior engine'
};

/** A point Lyriks adds for the health itself: the completeness audit or the code. */
const isHealthPoint = (gap: Gap) => (gap.checkId ?? '').startsWith('audit.') || (gap.checkId ?? '').startsWith('code.');

/**
 * Every open point of the project health as What Lyriks noticed lists it
 * (criteria 4189e074 and 799e1f5b): a blocking coherence gap keeps the final
 * check's own reading, and every other point (non-blocking gaps, the
 * completeness audit, what the code says) reads as itself. The points that cost
 * the health most come first; a point that costs nothing comes last.
 */
export function healthFindings(points: readonly Gap[]): Finding[] {
	const finalCheck = points.filter((g) => g.blocking && !isHealthPoint(g));
	const penalties = effectivePenalties(points);
	const costOf = new Map(points.map((g, i) => [g.id, penalties[i]]));
	const rest = points
		.filter((g) => !(g.blocking && !isHealthPoint(g)))
		.sort((a, b) => (costOf.get(b.id) ?? 0) - (costOf.get(a.id) ?? 0) || a.id.localeCompare(b.id));
	return [...finalCheckFindings(finalCheck), ...rest.map((gap) => pointFinding(gap, costOf.get(gap.id) ?? 0))];
}

/**
 * What Lyriks noticed: the points of Project health, then what the
 * retrospecification noticed, every point once (criterion 4189e074). An open
 * issue of the rules register is a point of Project health too; it reads once,
 * as the register's issue (which carries its decision and the feature it
 * names), at the place its weight gives it.
 */
export function noticedFindings(health: readonly Finding[], retrospec: readonly Finding[]): Finding[] {
	const issueOf = new Map<string, Finding>();
	for (const finding of retrospec) if (finding.decision) for (const id of finding.gapIds ?? []) issueOf.set(id, finding);
	const placed = new Set<Finding>();
	const points = health.flatMap((point) => {
		const issue = point.gapIds?.length === 1 ? issueOf.get(point.gapIds[0]) : undefined;
		if (!issue) return [point];
		if (placed.has(issue)) return [];
		placed.add(issue);
		return [issue];
	});
	return [...points, ...retrospec.filter((f) => !placed.has(f))];
}

/**
 * Every open point of What Lyriks noticed, read from the points of a reading
 * of Project health and the specification: the one list the Overview sums
 * up, Notices and a feature's page list, and the Reverse page shows
 * (criterion 1b4a3935), so a point counts and reads the same everywhere.
 */
export function noticedPoints(healthPoints: readonly Gap[], spec: FindingsInput): Finding[] {
	return noticedFindings(healthFindings(healthPoints), retrospecFindings(spec));
}

function pointFinding(gap: Gap, cost: number): Finding {
	const title = clean(gap.title);
	const kind = gapKind(gap);
	const saidBy = SAID_BY[gap.provenance ?? 'detected'] ?? SAID_BY.detected;
	const weighs =
		cost > 0
			? `Costs the project health ${Math.round(cost * 10) / 10} point${cost === 1 ? '' : 's'} before saturation.`
			: gap.weighs === 'unverified'
				? 'Costs nothing: the engine could not reach it, which proves no fault.'
				: 'Costs nothing: it follows from a point already counted.';
	return {
		id: `point:${gap.id}`,
		tone: gap.blocking || gap.severity === 'high' ? 'major' : 'minor',
		gapIds: [gap.id],
		text: title,
		...(readsAsEars(gap.title) ? { ears: title } : {}),
		...(clean(gap.detail) && clean(gap.detail) !== title ? { hint: clean(gap.detail) } : {}),
		where: kind.label,
		kind,
		...(gap.featureRef ? { featureId: gap.featureRef } : {}),
		...(gap.blocking ? { blocking: true as const } : {}),
		sheet: {
			kicker: [kind.label.toUpperCase(), gap.severity.toUpperCase(), gap.blocking ? 'BLOCKS THE PROJECT HEALTH' : 'WEIGHS ON THE PROJECT HEALTH'].join(' · '),
			title,
			sections: [
				{ heading: 'IN SHORT', text: clean(gap.detail) || title },
				...(clean(gap.subject) ? [{ heading: 'WHERE IT APPLIES', list: [{ k: 'Element', v: clean(gap.subject) }] }] : []),
				{ heading: 'WHERE IT COMES FROM', list: [{ k: 'Said by', v: saidBy }, { k: 'Weight', v: weighs }] },
				{ heading: 'WHAT YOU CAN DO', text: clean(gap.action) || 'Settle it in the specification; the project health reads it again at once.' },
				FIND_IT_AGAIN
			]
		}
	};
}
