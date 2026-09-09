<script lang="ts">
	import type { FeatureGap, FeatureScore, FeatureSummary } from '$application/ports';
	import { MATURITY_STAGE_COUNT, stageFromScore, stageFromTrl, stageLabel, stageMeans } from '$ui/design-system';

	interface Props {
		summary: FeatureSummary | null;
		score: FeatureScore | null;
		gaps?: FeatureGap[];
		/** Manual readiness override, stored on the legacy 1-9 scale. When set,
		    it wins over the engine score. */
		manualTrl?: number | null;
		/** In-process maturity % (same engine formula, computed from the leaf's
		    snapshot). Used for the stage only while the advisor score is absent,
		    so the badge never sits empty on a feature that IS scored. */
		fallbackPercentage?: number | null;
		size?: 'sm' | 'md';
	}
	let {
		summary,
		score,
		gaps = [],
		manualTrl = null,
		fallbackPercentage = null,
		size = 'sm'
	}: Props = $props();

	const px = $derived(size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs');

	// Spec maturity as a named stage: manual override wins; then the engine
	// advice; then the in-process maturity snapshot. Null only when none exists
	// (feature the engine can't read yet). This is depth of SPEC only; whether
	// code exists is the implementation chip's story.
	const level = $derived<number | null>(
		manualTrl != null
			? stageFromTrl(manualTrl)
			: score
				? stageFromScore(score.percentage)
				: fallbackPercentage != null
					? stageFromScore(fallbackPercentage)
					: null
	);

	// Early stage = shallow spec (red) → top stage = fully specified (green).
	function stageTone(l: number): string {
		if (l >= 4) return 'bg-success-50 text-success-600';
		if (l >= 2) return 'bg-warning-50 text-warning-600';
		return 'bg-danger-50 text-danger-500';
	}

	/** A hover explanation: the maturity stage, what's authored (right), and what's missing (wrong). */
	const explanation = $derived.by(() => {
		const lines: string[] = [];
		if (level) {
			lines.push(
				`Spec maturity: ${stageLabel(level)} (${level}/${MATURITY_STAGE_COUNT}) · ${stageMeans(level)}${manualTrl != null ? ' · set by hand' : ''}`
			);
		}
		if (score) {
			lines.push(
				`Maturity ${score.percentage}%  (${score.score}/${score.maxScore} · ${score.criticalCount} critical, ${score.recommendedCount} recommended)`
			);
		} else if (fallbackPercentage != null) {
			lines.push(`Maturity ${fallbackPercentage}% (spec snapshot; engine advice pending)`);
		}
		if (summary) {
			const have = [
				summary.surfaceCount > 0 ? `${summary.surfaceCount} surface(s)` : '',
				summary.actionCount > 0 ? `${summary.actionCount} action(s)` : '',
				summary.stateCount > 0 ? `${summary.stateCount} state(s)` : '',
				summary.entityCount > 0 ? `${summary.entityCount} entit(ies)` : '',
				summary.eventCount > 0 ? `${summary.eventCount} event(s)` : '',
				summary.personaCount > 0 ? `${summary.personaCount} persona(s)` : ''
			].filter(Boolean);
			lines.push(
				have.length ? `✓ Authored: ${have.join(' · ')}` : '✗ No behavior authored yet (0 surfaces / actions)'
			);
		}
		if (gaps.length > 0) {
			lines.push('Needs:');
			for (const g of gaps.slice(0, 6)) lines.push(`  • ${g.type}: ${g.name} - ${g.reason}`);
		} else if (summary && summary.surfaceCount === 0) {
			lines.push('To raise maturity: add a surface, an action, and a success scenario.');
		}
		return lines.join('\n');
	});
</script>

{#if level}
	<span
		class="inline-flex min-w-0 max-w-full cursor-help items-center gap-1 rounded-pill font-semibold {px} {stageTone(
			level
		)}"
		title={explanation}
	>
		<span class="size-1.5 shrink-0 rounded-full bg-current"></span>
		<span class="truncate">{stageLabel(level)}{manualTrl != null ? ' ✎' : ''}</span>
	</span>
{:else if summary}
	<!-- Engine sees the feature but no score yet — show structural counts. -->
	<span
		class="inline-flex cursor-help items-center gap-1 rounded-pill {px} bg-surface-sunken text-ink-500"
		title={explanation}
	>
		<span class="size-1.5 rounded-full bg-current"></span>
		{summary.surfaceCount}s · {summary.actionCount}a
	</span>
{:else}
	<span
		class="inline-flex cursor-help items-center gap-1 rounded-pill {px} bg-surface-sunken text-ink-400"
		title="Readiness unavailable for this feature right now."
	>
		<span class="size-1.5 rounded-full bg-ink-300"></span>
		-
	</span>
{/if}
