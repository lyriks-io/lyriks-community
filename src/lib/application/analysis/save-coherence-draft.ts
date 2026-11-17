import {
	computeCoherenceLocal,
	keepActionablePreparations,
	type PreparedDecision,
	type ProjectCoherenceDraft
} from '$domain/coherence';
import type {
	ClockPort,
	CoherenceDraftRepositoryPort,
	GlobalCoherenceCheckerPort,
	SectionDraftSaveOptions,
	TelemetryPort
} from '../ports';

export interface SaveCoherenceDraftResult {
	savedAt: string;
	coherenceScore: number;
	/** Issue messages behind the score (first 20) — so API/MCP callers see what drives it. */
	coherenceIssues: string[];
	readinessScore: number;
	revision: number;
}

/**
 * Keep the identity of a preparation that already existed, stamp the new ones.
 *
 * Matched on the gap, not the id: a client rewriting its own preparation for
 * the same finding is the same preparation, freshly argued. Rewriting it does
 * re-stamp the author, which is right: whoever wrote the reason now standing is
 * who the person is reading.
 */
function stamp(
	incoming: readonly PreparedDecision[],
	stored: readonly PreparedDecision[],
	by: { id: string; kind: 'person' | 'ai_client' },
	now: string
): PreparedDecision[] {
	const before = new Map(stored.map((p) => [p.gapId, p]));
	return incoming.map((p) => {
		const known = before.get(p.gapId);
		const unchanged = known && known.status === p.status && known.reason === p.reason;
		return unchanged
			? known
			: { ...p, preparedById: by.id, preparedByKind: by.kind, preparedAt: now };
	});
}

export class SaveCoherenceDraftUseCase {
	constructor(
		private readonly drafts: CoherenceDraftRepositoryPort,
		private readonly checker: GlobalCoherenceCheckerPort,
		private readonly clock: ClockPort,
		private readonly telemetry: TelemetryPort
	) {}

	/**
	 * Save the AUTHORED state of the section: the threshold, the generated
	 * artifacts, the generation flags.
	 *
	 * Decisions and acknowledgements are deliberately NOT authored state. They
	 * take findings out of every score, so they are appended only by the
	 * decisions endpoint, which stamps the caller's own identity and refuses
	 * what the domain refuses (a blocking gap, a missing reason, anything but a
	 * person). Whatever a payload carries for them is dropped here and the
	 * stored trace is carried over instead. Without this the section is a second
	 * door onto the same register, wide enough for a client to settle every
	 * finding and sign it as a person, and a rule enforced on one door is a rule
	 * the product does not have.
	 *
	 * PREPARED decisions do come through here, because they settle nothing. What
	 * the payload does not get to choose is who prepared them: `by` comes from
	 * the request. A preparation whose gap is gone, or has turned blocking, is
	 * dropped rather than kept as a card nobody can act on.
	 */
	async execute(
		draft: ProjectCoherenceDraft,
		save: SectionDraftSaveOptions,
		by: { id: string; kind: 'person' | 'ai_client' }
	): Promise<SaveCoherenceDraftResult | null> {
		const [stored, analysis] = await Promise.all([
			this.drafts.load(draft.projectId),
			this.checker.analyze(draft.projectId)
		]);
		return this.#save(
			{
				...draft,
				decisions: stored?.decisions ?? [],
				acknowledgedGapIds: stored?.acknowledgedGapIds ?? [],
				prepared: keepActionablePreparations(
					stamp(draft.prepared, stored?.prepared ?? [], by, this.clock.nowIso()),
					analysis
				)
			},
			save
		);
	}

	/**
	 * The decisions endpoint's own path: the draft handed over here already went
	 * through `canSettle` with a server-side author, so its decisions ARE the
	 * new trace. Nothing else may call it.
	 */
	async executeDecided(
		draft: ProjectCoherenceDraft,
		save: SectionDraftSaveOptions
	): Promise<SaveCoherenceDraftResult | null> {
		return this.#save(draft, save);
	}

	async #save(
		draft: ProjectCoherenceDraft,
		save: SectionDraftSaveOptions
	): Promise<SaveCoherenceDraftResult | null> {
		const savedAt = this.clock.nowIso();
		const stamped: ProjectCoherenceDraft = { ...draft, lastSavedAt: savedAt };
		const revision = await this.drafts.save(stamped, save);
		if (revision === null) return null;

		const analysis = await this.checker.analyze(draft.projectId);
		const local = computeCoherenceLocal(stamped, analysis);
		const telemetry = this.telemetry;
		telemetry.emit({ type: 'coherence.autosaved', savedAt });
		telemetry.emit({
			type: 'coherence.local_coherence.computed',
			score: local.score,
			issues: local.issues.map((i) => i.message)
		});

		return {
			savedAt,
			coherenceScore: local.score,
			coherenceIssues: local.issues.slice(0, 20).map((i) => i.message),
			readinessScore: analysis.readinessScore,
			revision
		};
	}
}
