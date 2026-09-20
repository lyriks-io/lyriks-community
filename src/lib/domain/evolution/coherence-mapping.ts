import type { CoherenceAxis, FindingSeverity } from './enums';
import type { CoherenceFinding, EvolutionRequest } from './draft';
import { canPublishFinding } from './coherence';
import { stableId } from './ids';

/**
 * The coherence report of a request, read off the engine's analysis of the
 * WHOLE project (ac-evo-coh-5, ac-evo-coh-8).
 *
 * The engine does not know about requests: it reports gaps over the project.
 * What this module does is pick the gaps that name one of the touched
 * features, name the other node at fault, and place each on an axis with a
 * severity the gate understands. A gap that names no node of the request is
 * not a finding of the request.
 */

/** The slice of an engine gap this mapping reads; the rest of the gap is ignored. */
export interface AnalysedGap {
	readonly id: string;
	readonly title: string;
	readonly detail?: string;
	readonly severity?: string;
	readonly blocking?: boolean;
	readonly sourceStep?: string;
	readonly kind?: string;
	readonly provenance?: string;
	readonly subject?: string;
	readonly fixAnchor?: string;
	readonly featureRef?: string;
}

export interface AnalysedProject {
	readonly readinessScore: number;
	readonly gaps: readonly AnalysedGap[];
}

export interface CoherenceMappingInput {
	readonly request: Pick<EvolutionRequest, 'id' | 'leafIds' | 'coherenceReport'>;
	readonly analysis: AnalysedProject;
	/** Leaf id -> name, so a gap that names a feature by its name is matched too. */
	readonly leafNames: Readonly<Record<string, string>>;
	readonly at: string;
}

export interface CoherenceMapping {
	readonly report: EvolutionRequest['coherenceReport'];
	readonly findings: CoherenceFinding[];
}

function axisOf(gap: AnalysedGap): CoherenceAxis {
	const step = (gap.sourceStep ?? '').toLowerCase();
	const provenance = (gap.provenance ?? '').toLowerCase();
	if (provenance === 'behavior' || provenance === 'proven' || step === 'behavior' || step === 'engine')
		return 'behavioural';
	if (step === 'users' || step === 'data' || step === 'architecture') return 'access_and_data';
	if (step === 'glossary' || step === 'foundation' || step === 'scope') return 'semantic';
	switch (gap.kind) {
		case 'duplicate':
		case 'orphan':
		case 'dangling':
			return 'structural';
		default:
			return 'functional';
	}
}

function severityOf(gap: AnalysedGap): FindingSeverity {
	const raw = (gap.severity ?? '').toLowerCase();
	if (gap.blocking || raw === 'critical' || raw === 'blocking') return 'blocking';
	if (raw === 'high' || raw === 'major') return 'major';
	return 'minor';
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The touched feature a gap names, by id or by name, or null. */
export function touchedLeafOf(
	gap: AnalysedGap,
	leafIds: readonly string[],
	leafNames: Readonly<Record<string, string>>
): string | null {
	if (gap.featureRef && leafIds.includes(gap.featureRef)) return gap.featureRef;
	if (gap.subject && leafIds.includes(gap.subject)) return gap.subject;
	const text = `${gap.title}\n${gap.detail ?? ''}\n${gap.subject ?? ''}`;
	for (const leafId of leafIds) {
		if (text.includes(leafId)) return leafId;
		const name = (leafNames[leafId] ?? '').trim();
		if (name.length > 2 && new RegExp(`\\b${escape(name)}\\b`, 'i').test(text)) return leafId;
	}
	return null;
}

export function mapCoherenceAnalysis(input: CoherenceMappingInput): CoherenceMapping {
	const { request, analysis } = input;
	const findings: CoherenceFinding[] = [];
	for (const gap of analysis.gaps) {
		const requestNodeId = touchedLeafOf(gap, request.leafIds, input.leafNames);
		if (!requestNodeId) continue;
		// The other node at fault: what the gap is about when that is not the
		// touched feature itself, else the gap's own anchor.
		const other = [gap.subject, gap.featureRef, gap.fixAnchor].find(
			(v): v is string => typeof v === 'string' && v.trim() !== '' && v !== requestNodeId
		);
		const existingNodeId = other ?? gap.id;
		const step = gap.sourceStep && gap.sourceStep.trim() !== '' ? gap.sourceStep : 'coherence';
		const finding: CoherenceFinding = {
			id: stableId('coh', request.id, gap.id),
			axis: axisOf(gap),
			severity: severityOf(gap),
			title: gap.title,
			requestNodeId,
			existingNodeId,
			fixNowTarget: `capability:${step}/${gap.fixAnchor ?? existingNodeId}`,
			published: false
		};
		findings.push({ ...finding, published: canPublishFinding(finding).ok });
	}
	const order: Record<FindingSeverity, number> = { blocking: 0, major: 1, minor: 2 };
	findings.sort((a, b) => order[a.severity] - order[b.severity] || a.title.localeCompare(b.title));

	const score = Math.max(0, Math.min(100, Math.round(analysis.readinessScore)));
	const previous = request.coherenceReport.status === 'ready' ? request.coherenceReport.projectScore : null;
	return {
		report: {
			status: 'ready',
			projectScore: score,
			// The movement of the project score since the previous check on this
			// request: what the work done since then did to the whole.
			requestDelta: previous === null ? 0 : score - previous,
			ranAt: input.at
		},
		findings
	};
}

/** The request with a fresh coherence reading; the gate reopens on it. */
export function withCoherenceReading(
	request: EvolutionRequest,
	mapping: CoherenceMapping
): EvolutionRequest {
	return {
		...request,
		coherenceReport: mapping.report,
		coherenceFindings: mapping.findings,
		coherenceGateClosed: false
	};
}
