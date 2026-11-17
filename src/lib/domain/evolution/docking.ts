import type { ImpactSection } from './enums';
import type { EvolutionRequest } from './draft';

/**
 * The docking map: whether each piece of the change can be attached to the
 * product as it stands (feat-evo-docking-map). The impact report says what
 * moves; this says whether it fits.
 *
 * Every point carries one qualification and the sentence that justifies it
 * (ac-evo-dock-1, -7, -8):
 *
 * - a collision comes from a blocking coherence finding that names the point,
 *   or from removing a feature another feature depends on;
 * - a friction from a non-blocking finding that names it;
 * - a missing anchor from a new feature with no place in the tree, or from a
 *   dependency on something the product does not hold;
 * - any other point the change reaches fits.
 *
 * Computed on read from what the request already holds; nothing is persisted
 * (ac-evo-dock-5).
 */
export const DOCKING_QUALIFICATIONS = [
	{ code: 'collision', label: 'Collides', hint: 'Something in the product forbids this as it stands.' },
	{ code: 'missing_anchor', label: 'Missing anchor', hint: 'There is nothing to attach it to yet.' },
	{ code: 'friction', label: 'Rubs', hint: 'It fits, with a disagreement somebody has to settle.' },
	{ code: 'fits', label: 'Fits', hint: 'Nothing in the product opposes it.' }
] as const;
export type DockingQualification = (typeof DOCKING_QUALIFICATIONS)[number]['code'];

export interface DockingPoint {
	readonly nodeId: string;
	readonly label: string;
	/** The impact section the point belongs to; null for a point only the drafts name. */
	readonly section: ImpactSection | null;
	readonly qualification: DockingQualification;
	/** Why, in one sentence a person reads without the spec open. */
	readonly reason: string;
	/** Where the fix is made, when a coherence finding names the point. */
	readonly fixTarget?: string;
	/** The coherence finding behind the point, so a person can accept it as a risk. */
	readonly findingId?: string;
	/** Set once a person accepted that finding as a known risk. */
	readonly risk?: { by: string; at: string; reason: string } | null;
}

export interface DockingContext {
	/** The leaves of the tree, so a dependency on something absent is caught. */
	readonly knownLeafIds: ReadonlySet<string>;
	/** The existing features that declare a dependency on a leaf, by name. */
	readonly dependentsOf: (leafId: string) => readonly { id: string; name: string }[];
	/** A leaf's name, for the sentences. */
	readonly nameOf: (leafId: string) => string;
}

const RANK: Record<DockingQualification, number> = { collision: 0, missing_anchor: 1, friction: 2, fits: 3 };
const SEVERITY_RANK: Record<string, number> = { blocking: 0, major: 1, minor: 2 };

/** Points no leaf names, read by what the page calls them (ac-evo-dock-8). */
const PLACE_NAMES: Readonly<Record<string, string>> = { 'project:rules': 'Rules the whole product keeps' };

/** The docking points of a request, worst first. */
export function dockingMap(request: EvolutionRequest, input: DockingContext): DockingPoint[] {
	const ctx = { ...input, ...withDraftNames(request, input) };
	const points = new Map<string, DockingPoint>();
	const keep = (point: DockingPoint) => {
		const held = points.get(point.nodeId);
		if (!held || RANK[point.qualification] < RANK[held.qualification]) points.set(point.nodeId, point);
	};
	// What the product already carried before the request is not a contact point
	// of the change, nor a note on how it gets proved; an accepted risk still
	// rubs, it no longer collides.
	const findings = request.coherenceFindings.filter((f) => f.published && f.scope !== 'inherited' && !f.note);
	const collides = (f: (typeof findings)[number]) => f.severity === 'blocking' && !f.risk;
	const qualify = (f: (typeof findings)[number]): DockingQualification => (collides(f) ? 'collision' : 'friction');
	const findingOn = (nodeId: string) =>
		findings
			.filter((f) => f.requestNodeId === nodeId || f.existingNodeId === nodeId)
			.sort((a, b) => (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3))[0];

	for (const f of request.impactFindings) {
		if (f.nodeKind === 'core') continue;
		const finding = findingOn(f.nodeId);
		keep({
			nodeId: f.nodeId,
			label: f.nodeLabel,
			section: f.section,
			qualification: finding ? qualify(finding) : 'fits',
			reason: finding
				? ctx.say(finding.title)
				: f.note.trim() || 'Nothing in the specification opposes it.',
			...(finding?.fixNowTarget ? { fixTarget: finding.fixNowTarget } : {}),
			...(finding ? { findingId: finding.id, risk: finding.risk ?? null } : {})
		});
	}

	// A finding on a node the walk did not list still names a contact point.
	for (const finding of findings) {
		const nodeId = finding.existingNodeId || finding.requestNodeId;
		if (!nodeId || points.has(nodeId)) continue;
		keep({
			nodeId,
			label: PLACE_NAMES[nodeId] ?? ctx.nameOf(nodeId),
			section: null,
			qualification: qualify(finding),
			reason: ctx.say(finding.title),
			...(finding.fixNowTarget ? { fixTarget: finding.fixNowTarget } : {}),
			findingId: finding.id,
			risk: finding.risk ?? null
		});
	}

	const drafted = new Set(request.drafts.map((d) => d.id));
	const removed = new Set(request.drafts.filter((d) => d.kind === 'remove' && d.baseLeafId).map((d) => d.baseLeafId as string));
	for (const draft of request.drafts) {
		const name = draft.name || (draft.baseLeafId ? ctx.nameOf(draft.baseLeafId) : draft.id);
		if (draft.kind === 'remove' && draft.baseLeafId) {
			// A removal is qualified like an addition (ac-evo-dock-3): what rests on
			// the removed feature collides with its absence.
			for (const dependent of ctx.dependentsOf(draft.baseLeafId)) {
				if (removed.has(dependent.id)) continue;
				keep({
					nodeId: dependent.id,
					label: dependent.name,
					section: 'leaves',
					qualification: 'collision',
					reason: `"${dependent.name}" depends on "${name}", which this request removes.`
				});
			}
			continue;
		}
		if (draft.kind === 'add' && !draft.coreId && !draft.parentFamilyId) {
			keep({
				nodeId: draft.id,
				label: name,
				section: 'leaves',
				qualification: 'missing_anchor',
				reason: `"${name}" has no place in the tree yet: name the core or the family it belongs to.`
			});
		}
		for (const dependency of draft.dependsOn) {
			if (ctx.knownLeafIds.has(dependency) || drafted.has(dependency)) continue;
			keep({
				nodeId: `${draft.id}->${dependency}`,
				label: name,
				section: 'leaves',
				qualification: 'missing_anchor',
				reason: `"${name}" depends on "${dependency}", which the product does not hold.`
			});
		}
	}

	return [...points.values()].sort((a, b) => RANK[a.qualification] - RANK[b.qualification]);
}

/** How many points fall under each qualification, the line the report opens on (ac-evo-imp-docking). */
export function dockingCounts(points: readonly DockingPoint[]): Record<DockingQualification, number> {
	const counts: Record<DockingQualification, number> = { collision: 0, missing_anchor: 0, friction: 0, fits: 0 };
	for (const p of points) counts[p.qualification] += 1;
	return counts;
}

/**
 * A person never reads a draft id where a name belongs (ac-evo-draft-3): the
 * engine names nodes `feature:<id>` and a draft that does not rename says its
 * id in a finding, so both are read back as the name of what they stand for.
 */
export function withDraftNames(
	request: Pick<EvolutionRequest, 'drafts'>,
	ctx: Pick<DockingContext, 'nameOf'>
): Pick<DockingContext, 'nameOf'> & { say: (text: string) => string } {
	const draftName = (id: string): string | null => {
		const draft = request.drafts.find((d) => d.id === id);
		if (!draft) return null;
		return draft.name || (draft.baseLeafId ? ctx.nameOf(draft.baseLeafId) : 'a drafted feature');
	};
	const nameOf = (raw: string): string => {
		const id = raw.replace(/^feature:/, '');
		return draftName(id) ?? ctx.nameOf(id);
	};
	const say = (text: string): string =>
		request.drafts.reduce((out, d) => out.split(`feature:${d.id}`).join(draftName(d.id) ?? d.id).split(d.id).join(draftName(d.id) ?? d.id), text);
	return { nameOf, say };
}
