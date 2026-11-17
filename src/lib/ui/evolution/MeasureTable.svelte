<script lang="ts">
	import type { ParsedMeasure } from '$domain/evolution';

	/**
	 * Measures read as three columns, what is measured, its value today, its
	 * target (ac-evo-need-measure-shape): "6 per Saturday, 1 at most targeted"
	 * written as prose made a reader stop and parse it.
	 */
	interface Props {
		measures: readonly ParsedMeasure[];
	}
	let { measures }: Props = $props();
</script>

{#if measures.length > 0}
	<div class="overflow-x-auto">
		<table class="w-full text-xs">
			<thead>
				<tr class="text-left font-mono text-[0.6875rem] tracking-[0.06em] text-ink-500 uppercase">
					<th class="py-1 pr-3 font-normal">What</th>
					<th class="px-2 py-1 font-normal">Today</th>
					<th class="py-1 pl-2 font-normal">Target</th>
				</tr>
			</thead>
			<tbody>
				{#each measures as m, i (i)}
					<tr class="border-t border-line align-top">
						<td class="py-1 pr-3 text-ink-800">{m.what}</td>
						<td class="whitespace-nowrap px-2 py-1 font-mono text-ink-600">{m.today}</td>
						<td class="whitespace-nowrap py-1 pl-2 font-mono font-bold text-ink-900">{m.target}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
