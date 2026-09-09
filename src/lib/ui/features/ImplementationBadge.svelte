<script lang="ts">
	/**
	 * Code-implementation chip: what share of a SPEC scope (a feature, or one of
	 * its actions) the last code adoption sync actually located in the
	 * implementation repo. Deliberately a separate chip from the maturity badge:
	 * maturity says how deeply the scope is specified, this says how much of
	 * that spec is found in code. Rendered only when a coverage record exists
	 * (never adopted = no chip, no noise).
	 */

	/** Minimal shape the chip reads; feature- and action-level rows both fit. */
	interface CoverageLike {
		found: number;
		expected: number;
		/** 0-100, rounded. */
		percent: number;
		/** ISO timestamp of the last report push; absent on per-action rows. */
		updatedAt?: string | null;
	}

	interface Props {
		/** Absent (undefined/null) renders nothing: no coverage record, no chip. */
		coverage?: CoverageLike | null;
		size?: 'sm' | 'md';
	}
	let { coverage = null, size = 'sm' }: Props = $props();

	const px = $derived(size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs');

	// Same red → green ramp as the maturity badge, read on the percent.
	function tone(percent: number): string {
		if (percent >= 75) return 'bg-success-50 text-success-600';
		if (percent >= 40) return 'bg-warning-50 text-warning-600';
		return 'bg-danger-50 text-danger-500';
	}

	const syncedOn = $derived(coverage?.updatedAt ? coverage.updatedAt.slice(0, 10) : null);
	const title = $derived(
		coverage
			? [
					`Implementation: ${coverage.found}/${coverage.expected} spec elements located in code (${coverage.percent}%)`,
					syncedOn ? `Last code sync: ${syncedOn}` : '',
					'Recorded by code adoption (sync_implementation_index); re-sync to refresh.'
				]
					.filter(Boolean)
					.join('\n')
			: ''
	);
</script>

{#if coverage}
	<span
		class="inline-flex shrink-0 cursor-help items-center gap-1 rounded-pill font-semibold {px} {tone(
			coverage.percent
		)}"
		{title}
	>
		<span class="font-mono text-[0.9em] leading-none">&lt;/&gt;</span>
		{coverage.percent}%
	</span>
{/if}
