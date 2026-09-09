import {
	blockingGapCount,
	canGenerateSpecs,
	coherenceCanAdvance,
	computeCoherenceLocal,
	isGreen,
	missingCoherenceRequirements,
	openGaps,
	type CoherenceAnalysis,
	type Gap,
	type GeneratedArtifact,
	type ProjectCoherenceDraft
} from '$domain/coherence';
import { coherenceScoreOf } from '$domain/coherence/incoherence';
import type { CoherenceResult } from '$domain/shared';
import type { Session, ToastNotifierPort } from '$application/ports';
import { SectionAutosave, type SaveStatus } from '$ui/shell/section-autosave.svelte';
import { clientId } from '$ui/shell/live-sync.client';
import { REVISION_HEADER } from '$lib/shared/draft-revision';
import { invalidate } from '$app/navigation';
import { projectSyncKey } from '$lib/shared/section-sync';

export type { SaveStatus };

/**
 * Step 09 store — orchestrator for the Maturity gate. Authored state
 * (threshold, acknowledgements, generated artifacts) autosaves via PUT; the
 * live analysis (dimensions/gaps/readiness) is recomputed by the server and
 * replaced wholesale by Run Coherence Check; Generate Specs is a server POST.
 */
export class CoherenceStore {
	draft = $state<ProjectCoherenceDraft>(null as unknown as ProjectCoherenceDraft);
	analysis = $state<CoherenceAnalysis>(null as unknown as CoherenceAnalysis);
	checking = $state(false);
	generating = $state(false);

	coherence = $derived.by<CoherenceResult>(() => computeCoherenceLocal(this.draft, this.analysis));
	canAdvance = $derived.by<boolean>(() => coherenceCanAdvance(this.draft, this.analysis));
	missing = $derived.by<string[]>(() => missingCoherenceRequirements(this.draft, this.analysis));

	readiness = $derived.by<number>(() => this.analysis.readinessScore);
	/** Product correctness (0–100) — same formula as the Control Center's Coherence ring. */
	coherenceScore = $derived.by<number>(() => coherenceScoreOf(this.analysis.gaps));
	green = $derived.by<boolean>(() => isGreen(this.draft, this.analysis));
	canGenerate = $derived.by<boolean>(() => canGenerateSpecs(this.draft, this.analysis));
	blockingCount = $derived.by<number>(() => blockingGapCount(this.analysis));
	gaps = $derived.by<Gap[]>(() => openGaps(this.draft, this.analysis));

	readonly session: Session;
	readonly notifier: ToastNotifierPort;
	readonly #autosave: SectionAutosave<ProjectCoherenceDraft>;

	constructor(
		draft: ProjectCoherenceDraft,
		analysis: CoherenceAnalysis,
		session: Session,
		notifier: ToastNotifierPort,
		revision = 0
	) {
		this.draft = draft;
		this.analysis = analysis;
		this.session = session;
		this.notifier = notifier;
		this.#autosave = new SectionAutosave({
			endpoint: '/api/draft/coherence',
			session,
			notifier,
			getDraft: () => this.draft,
			applyRemote: (draft) => (this.draft = draft),
			onSaved: (savedAt) => (this.draft.lastSavedAt = savedAt),
			revision
		});
	}

	get saveStatus(): SaveStatus {
		return this.#autosave.status;
	}

	get lastError(): string | null {
		return this.#autosave.lastError;
	}

	/** The live `analysis` is server-recomputed and wired separately. */
	hydrate = (incoming: ProjectCoherenceDraft, revision = 0) =>
		this.#autosave.hydrate(incoming, revision);

	#touch = (_path: string) => this.#autosave.touch();

	flushNow = () => this.#autosave.flushNow();

	/* ─────────────────────────── AUTHORED STATE ────────────────────────── */
	setThreshold = (value: number) => {
		this.draft.threshold = Math.max(0, Math.min(100, Math.round(value)));
		this.#touch('coherence.threshold');
	};

	/**
	 * Settle a gap with a traced decision (risk accepted or won't fix), or reopen
	 * one. Server-side: the author is the session, the reason is mandatory, a
	 * blocking gap is refused. The chrome and this page re-read on success.
	 */
	decideGap = async (
		gap: Pick<Gap, 'id' | 'title'>,
		status: 'accepted_risk' | 'wont_fix' | 'reopened',
		reason: string
	): Promise<boolean> => {
		try {
			const res = await fetch(`/api/projects/${encodeURIComponent(this.draft.projectId)}/coherence/decisions`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', 'x-lyriks-client': clientId },
				body: JSON.stringify({ gapId: gap.id, gapTitle: gap.title, status, reason })
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { message?: string };
				this.notifier.notify('error', body.message ?? `The decision was refused (${res.status}).`);
				return false;
			}
			this.notifier.notify(
				'info',
				status === 'reopened' ? 'Reopened: the gap counts again.' : 'Decision kept with your name; the gap no longer counts.'
			);
			await invalidate(projectSyncKey(this.draft.projectId));
			return true;
		} catch (e) {
			this.notifier.notify('error', e instanceof Error ? e.message : 'The decision could not be saved.');
			return false;
		}
	};

	acknowledgeGap = (gapId: string) => {
		const gap = this.analysis.gaps.find((g) => g.id === gapId);
		if (!gap || gap.blocking) {
			this.notifier.notify('error', 'Blocking gaps cannot be acknowledged; fix them at the source.');
			return;
		}
		if (!this.draft.acknowledgedGapIds.includes(gapId)) {
			this.draft.acknowledgedGapIds = [...this.draft.acknowledgedGapIds, gapId];
			this.#touch('coherence.acknowledgedGapIds');
		}
	};

	/* ──────────────────────── ANALYSIS / GENERATION ────────────────────── */
	runCoherenceCheck = async () => {
		this.checking = true;
		try {
			// The explicit button forces a fresh synchronous DPO recompute (force=1);
			// automatic page loads read the cheap cached verdict.
			const res = await fetch(
				`/api/draft/coherence?projectId=${encodeURIComponent(this.draft.projectId)}&force=1`
			);
			if (!res.ok) throw new Error(`check failed (${res.status})`);
			const { analysis } = (await res.json()) as { analysis: CoherenceAnalysis };
			this.analysis = analysis;
			this.notifier.notify(
				'info',
				`Coherence re-checked: readiness ${analysis.readinessScore}, ${blockingGapCount(analysis)} blocking.`
			);
		} catch (e) {
			this.notifier.notify('error', e instanceof Error ? e.message : 'check failed');
		} finally {
			this.checking = false;
		}
	};

	generateSpecs = async () => {
		if (!this.canGenerate) {
			this.notifier.notify('error', 'Reach the threshold and clear blocking gaps first.');
			return;
		}
		this.generating = true;
		try {
			const res = await fetch('/api/draft/coherence/generate', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'x-lyriks-client': clientId,
					[REVISION_HEADER]: String(this.#autosave.revision)
				},
				body: JSON.stringify({ projectId: this.draft.projectId })
			});
			const body = (await res.json()) as {
				ok: boolean;
				reason?: string;
				draft?: ProjectCoherenceDraft;
				revision?: number;
			};
			if (!res.ok || !body.ok || !body.draft || body.revision === undefined)
				throw new Error(body.reason || 'generation failed');
			this.#autosave.adoptSaved(body.draft, body.revision);
			this.notifier.notify('info', `Generated ${body.draft.artifacts.length} specification artifacts.`);
		} catch (e) {
			this.notifier.notify('error', e instanceof Error ? e.message : 'generation failed');
		} finally {
			this.generating = false;
		}
	};

	/* ─────────────────────── ARTIFACT VIEW / EXPORT ────────────────────── */
	/** Filename + mime for a generated artifact (md for docs, json for graph). */
	artifactFile = (art: GeneratedArtifact): { name: string; mime: string } => {
		const json = art.kind === 'coherence_graph';
		const slug = art.kind.replace(/_/g, '-');
		return {
			name: `${this.draft.projectId}.${slug}.${json ? 'json' : 'md'}`,
			mime: json ? 'application/json' : 'text/markdown'
		};
	};

	downloadArtifact = (art: GeneratedArtifact) => {
		const { name, mime } = this.artifactFile(art);
		const blob = new Blob([art.content], { type: `${mime};charset=utf-8` });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = name;
		a.click();
		URL.revokeObjectURL(url);
		this.notifier.notify('info', `Downloaded ${name}.`);
	};

	copyArtifact = async (art: GeneratedArtifact) => {
		try {
			await navigator.clipboard.writeText(art.content);
			this.notifier.notify('info', `${art.title} copied.`);
		} catch {
			this.notifier.notify('error', 'Copy failed.');
		}
	};

	/* ─────────────────────────────── RESET ─────────────────────────────── */
	reset = () => {
		this.draft.specsGenerated = false;
		this.draft.artifacts = [];
		this.draft.acknowledgedGapIds = [];
		this.draft.generatedAt = null;
		this.#touch('coherence.reset');
	};
}
