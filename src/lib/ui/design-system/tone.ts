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
 * implementation coverage's story, never this ladder's. Presentational only:
 * hand-set overrides and the skills' "stop at TRL x" grammar still store and
 * speak the legacy 1-9 rungs, and every stage maps to them losslessly
 * (stage = ceil(rung / 2)), so nothing persisted changes meaning.
 */
export interface MaturityStage {
	level: number;
	label: string;
	/** What being at this stage concretely means, for tooltips. */
	means: string;
}

export const MATURITY_STAGES: readonly MaturityStage[] = [
	{ level: 1, label: 'Idea', means: 'named, behavior not modeled yet' },
	{ level: 2, label: 'Outlined', means: 'screens and actions are posed' },
	{ level: 3, label: 'Specified', means: 'rules, states and data are written' },
	{ level: 4, label: 'Simulated', means: 'scenarios run in the simulator' },
	{ level: 5, label: 'Complete', means: 'full depth: invariants, edge cases, goals' }
];

export const MATURITY_STAGE_COUNT = MATURITY_STAGES.length;

const clampStage = (level: number): number =>
	Math.max(1, Math.min(MATURITY_STAGE_COUNT, Math.round(level)));

/** The legacy 1-9 projection of a 0-100 score; the STORED form of hand-set
 *  overrides and the target-TRL skill grammar. Internal: presentation reads
 *  it through the stage helpers. */
function trlFromScore(score: number): number {
	return Math.max(1, Math.min(9, Math.round((score / 100) * 9)));
}

/** A 0-100 maturity score as a stage (1-MATURITY_STAGE_COUNT). */
export function stageFromScore(score: number): number {
	return stageFromTrl(trlFromScore(score));
}

/** Read a stored 1-9 readiness value (hand-set override) as a stage. */
export function stageFromTrl(trl: number): number {
	return Math.ceil(Math.max(1, Math.min(9, Math.round(trl))) / 2);
}

/** The 1-9 value to STORE for a stage picked by hand (its representative
 *  rung: 1, 3, 5, 7, 9), keeping persisted overrides on the legacy scale. */
export function trlOfStage(level: number): number {
	return clampStage(level) * 2 - 1;
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
