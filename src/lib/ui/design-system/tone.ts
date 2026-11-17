/**
 * Maps a 0–100 score to a status tone and its token-backed classes. Single
 * source for the coherence ring, readiness ring, and any status chip so the
 * thresholds never drift apart. Thresholds mirror domain `computeCoherence`.
 */
export type Tone = 'critical' | 'at-risk' | 'strong';

export function scoreToTone(score: number): Tone {
	if (score < 34) return 'critical';
	if (score < 67) return 'at-risk';
	return 'strong';
}

export function toneLabel(tone: Tone): string {
	return tone === 'critical' ? 'Critical' : tone === 'at-risk' ? 'At risk' : 'Strong';
}

/**
 * A 0-100 behavior-maturity score read as one of five SPEC MATURITY stages.
 * The stages speak only about how deeply the spec is authored (what the
 * engine actually measures); whether any of it reached code is the
 * implementation coverage's story, never this ladder's. A stage set by hand is
 * stored as the stage itself (1-5).
 */
export interface MaturityStage {
	level: number;
	label: string;
	/** What being at this stage concretely means, for tooltips. */
	means: string;
}

export const MATURITY_STAGES: readonly MaturityStage[] = [
	{ level: 1, label: 'Idea', means: 'named, behavior not modeled yet' },
	{ level: 2, label: 'Outlined', means: 'surfaces and actions are posed' },
	{ level: 3, label: 'Specified', means: 'rules, states and data are written' },
	{ level: 4, label: 'Simulated', means: 'behavior scenarios run on the model' },
	{ level: 5, label: 'Complete', means: 'full depth: invariants, edge cases, goals' }
];

export const MATURITY_STAGE_COUNT = MATURITY_STAGES.length;

const clampStage = (level: number): number =>
	Math.max(1, Math.min(MATURITY_STAGE_COUNT, Math.round(level)));

/** A 0-100 maturity score as a stage (1-MATURITY_STAGE_COUNT): Idea below
 *  about 27.8, Outlined below 50, Specified below about 72.3, Simulated below
 *  about 94.5, Complete from there. The score is cut in nine equal steps and
 *  each stage spans two of them, the last one alone. */
export function stageFromScore(score: number): number {
	const step = Math.max(1, Math.min(9, Math.round((score / 100) * 9)));
	return Math.ceil(step / 2);
}

/** A stage set by hand, clamped to the five stages. */
export function clampStageLevel(level: number): number {
	return clampStage(level);
}

/** The stage's short name (clamps out-of-range input). */
export function stageLabel(level: number): string {
	return MATURITY_STAGES[clampStage(level) - 1].label;
}

/** The stage's one-line meaning, for tooltips. */
export function stageMeans(level: number): string {
	return MATURITY_STAGES[clampStage(level) - 1].means;
}

/** Foreground (text + currentColor stroke) class per tone. */
export const toneText: Record<Tone, string> = {
	critical: 'text-danger-500',
	'at-risk': 'text-warning-500',
	strong: 'text-success-500'
};

/** Soft background + text, for chips. */
export const toneSoft: Record<Tone, string> = {
	critical: 'bg-danger-50 text-danger-500',
	'at-risk': 'bg-warning-50 text-warning-500',
	strong: 'bg-success-50 text-success-500'
};
