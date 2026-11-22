import { anchorDomId, placeOfAnchor } from '$domain/discussions';
import type { EvolutionRequest, ImplementationFinding } from './draft';
import { currentLines } from './implementation';
import { isDataChangeRequirement } from './report-requirement';
import type { SpecPage } from './section-drafts';

/**
 * Which elements of Knowledge a landing wrote, and whether the code proved
 * each of them (EVO-002). An element of Knowledge is named by its anchor
 * (`feature:<featureId>`, `action:<featureId>:<actionId>`,
 * `rule:<featureId>:<ruleId>`, `term:<id>`...); a line of the Verification
 * report by the engine's key (`action:<id>`, `rule:<id>`, `criterion:<id>`...)
 * on its feature. The mapping is total: a line no element can claim holds every
 * element of its feature, and an element without a line is proved only when
 * it holds nothing for the code.
 */

/** What a landing did in Knowledge, kept on the request for its success dialog and its history. */
export interface KnowledgeLanding {
	readonly at: string;
	/** Elements validated in Knowledge through the request. */
	readonly validated: readonly string[];
	/** Elements the landing wrote that read To review. */
	readonly toReview: readonly string[];
	/** The specification was validated definitively: nothing was validated element by element. */
	readonly specValidated?: boolean;
	/** Why Knowledge could not be written; the landing stands and the elements read To review. */
	readonly failure?: string;
}

/** The elements of Knowledge the behaviour of a feature makes: what the Features pages show of it. */
const FEATURE_KINDS = new Set(['feature', 'action', 'rule', 'flow']);

/** The kinds of element each page of the spec shows, which a change to that page writes. */
const PAGE_KINDS: Readonly<Record<SpecPage, readonly string[]>> = {
	glance: ['product', 'problem', 'target'],
	users: ['role', 'permissions'],
	experience: ['branding', 'journey', 'component'],
	requirements: ['requirements', 'constraint'],
	architecture: ['stack', 'constraint'],
	glossary: ['term']
};

interface ElementRef {
	readonly kind: string;
	/** The feature it belongs to, for an element of the Features pages. */
	readonly featureId: string;
	/** The action or rule id, for those. */
	readonly own: string;
}

function refOf(elementId: string): ElementRef {
	const [kind, ...rest] = elementId.split(':');
	if (kind === 'action' || kind === 'rule') return { kind, featureId: rest.slice(0, -1).join(':'), own: rest.at(-1) ?? '' };
	return { kind, featureId: rest.join(':'), own: '' };
}

/** A rule the whole product keeps: rule:project:<id>, written by a request's rule changes. */
const isProductRule = (ref: ElementRef) => ref.kind === 'rule' && ref.featureId === 'project';

/** The features a request's drafts write, under the ids they carry once landed. */
function featuresOf(request: Pick<EvolutionRequest, 'drafts'>): Set<string> {
	return new Set(request.drafts.flatMap((d) => [d.materialisedAs, d.baseLeafId].filter((id): id is string => !!id)));
}

/** Whether the request carries a change to this element: only such an element is one its landing wrote. */
export function carriesElement(request: Pick<EvolutionRequest, 'drafts' | 'dataDrafts' | 'sectionDrafts' | 'ruleDrafts'>, elementId: string): boolean {
	const ref = refOf(elementId);
	if (isProductRule(ref)) return request.ruleDrafts.length > 0;
	if (FEATURE_KINDS.has(ref.kind)) return featuresOf(request).has(ref.featureId);
	if (ref.kind === 'datamap' || ref.kind === 'data') return request.dataDrafts.length > 0;
	return request.sectionDrafts.some((d) => PAGE_KINDS[d.page].includes(ref.kind));
}

/** A line about a rule of an action: its own element of Knowledge, never its action's. */
const isRuleKey = (key: string) => key.startsWith('rule:') || key.startsWith('invariant:');
const actionLine = (line: ImplementationFinding) => !!line.key && (line.key.startsWith('action:') || (!!line.owner?.startsWith('action:') && !isRuleKey(line.key)));
const isDataLine = (line: ImplementationFinding) => line.id.startsWith('data-line:') || isDataChangeRequirement(line.requirement);

/** The lines of the report an element of Knowledge stands on. */
export function linesOfElement(lines: readonly ImplementationFinding[], elementId: string): ImplementationFinding[] {
	const ref = refOf(elementId);
	if (ref.kind === 'datamap' || ref.kind === 'data') return lines.filter(isDataLine);
	if (!FEATURE_KINDS.has(ref.kind) || isProductRule(ref)) return [];
	return lines.filter((line) => {
		if (line.leafId !== ref.featureId) return false;
		// A line derived before lines named their element holds every element of its feature.
		if (!line.key) return true;
		switch (ref.kind) {
			case 'action':
				return line.key === `action:${ref.own}` || (line.owner === `action:${ref.own}` && !isRuleKey(line.key));
			case 'rule':
				return line.key === `rule:${ref.own}` || line.key === `invariant:${ref.own}`;
			case 'flow':
				return actionLine(line);
			default:
				return line.key.startsWith('criterion:') || line.key.startsWith('surface:') || !!line.owner?.startsWith('surface:');
		}
	});
}

/** The code proves the line, or a person stood behind it: validated, or an addition adopted into the spec. */
export function lineProved(line: ImplementationFinding): boolean {
	if (line.decision === 'validated' || line.decision === 'adopted') return true;
	return line.verdict === 'conform' && line.decision === 'undecided';
}

/** Whether the element holds something the code implements: what the index locates. */
const holdsCode = (ref: ElementRef) => FEATURE_KINDS.has(ref.kind) && !isProductRule(ref);

/**
 * Every line the element stands on is proved, or it holds nothing for the code
 * (a term of the glossary, a text of the Overview): the approval covered it.
 */
export function elementProved(lines: readonly ImplementationFinding[], elementId: string): boolean {
	const own = linesOfElement(lines, elementId);
	if (own.length === 0) return !holdsCode(refOf(elementId));
	return own.every(lineProved);
}

/**
 * The lines of the version that landed, each on the feature it was written into:
 * a feature a draft added reads its lines under the id the landing gave it.
 */
export function landedLines(request: Pick<EvolutionRequest, 'drafts' | 'implementationFindings' | 'iteration'>): ImplementationFinding[] {
	const landedAs = new Map(request.drafts.flatMap((d) => (d.materialisedAs ? [[d.id, d.materialisedAs] as const] : [])));
	return currentLines(request).map((line) => (line.leafId && landedAs.has(line.leafId) ? { ...line, leafId: landedAs.get(line.leafId) } : line));
}

/** What the success dialog counts of Knowledge (criterion eb7b058a), with a link to the elements that stay to review. */
export interface KnowledgeReading {
	readonly validated: number;
	readonly toReview: number;
	readonly specValidated: boolean;
	readonly failure: string | null;
	/** Opens Knowledge on the first element that stays to review; null when none stays. */
	readonly reviewHref: string | null;
}

/** The landing's outcome in Knowledge as the dialog reads it. */
export function knowledgeReadingOf(projectId: string, landing: KnowledgeLanding | undefined): KnowledgeReading | null {
	if (!landing) return null;
	const first = landing.toReview[0];
	const place = first ? placeOfAnchor(first) : '';
	return {
		validated: landing.validated.length,
		toReview: landing.toReview.length,
		specValidated: landing.specValidated === true,
		failure: landing.failure ?? null,
		reviewHref: first ? `/projects/${encodeURIComponent(projectId)}/spec${place ? `/${place}` : ''}#${anchorDomId(first)}` : null
	};
}
