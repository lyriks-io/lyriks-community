<script lang="ts">
	import { Icon } from '$ui/design-system';
	import { HISTORY_ENTRY_TYPES, timeline, type EvolutionRequest } from '$domain/evolution';

	/**
	 * The one timeline: stage crossings, waivers, accepted proposals, verdict
	 * decisions and acceptance rulings, all in the same place.
	 *
	 * It is append-only. There is no delete control here on purpose, because a
	 * history that can lose entries proves nothing; a wrong entry is superseded,
	 * and the original stays readable underneath.
	 */
	interface Props {
		request: EvolutionRequest;
	}
	let { request }: Props = $props();

	const entries = $derived(timeline(request));
	const typeLabel = (code: string) =>
		HISTORY_ENTRY_TYPES.find((t) => t.code === code)?.label ?? code;
</script>

<section class="rounded-card border border-line bg-surface">
	<header class="flex items-center gap-2 border-b border-line px-4 py-2.5">
		<Icon name="list" size={14} class="text-ink-400" />
		<span class="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
			Decision history
		</span>
		<span class="rounded-pill bg-surface-sunken px-2 py-0.5 text-[10px] font-semibold text-ink-500">
			{entries.length}
		</span>
		<span class="ml-auto text-[10px] text-ink-400">Append-only</span>
	</header>

	{#if entries.length === 0}
		<p class="px-4 py-8 text-center text-sm text-ink-500">
			Nothing has been decided on this request yet.
		</p>
	{:else}
		<ul class="divide-y divide-line">
			{#each entries as entry (entry.id)}
				<li class="flex items-start gap-3 px-4 py-2.5 {entry.supersededById ? 'opacity-60' : ''}">
					<span
						class="mt-0.5 shrink-0 rounded-pill bg-surface-sunken px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-500"
					>
						{typeLabel(entry.type)}
					</span>
					<div class="min-w-0 flex-1">
						<p class="text-sm text-ink-800">{entry.summary}</p>
						<p class="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-ink-400">
							<!-- Person or model: what a sentence questioned in six months is traced to. -->
							<span
								class="rounded-pill px-1.5 py-0.5 font-semibold {entry.authorKind === 'ai_client'
									? 'bg-accent-50 text-accent-700'
									: 'bg-info-50 text-info-600'}"
							>
								{entry.authorKind === 'ai_client' ? 'AI client' : 'person'}
							</span>
							<span>{entry.authorId}</span>
							<span>{entry.recordedAt.slice(0, 16).replace('T', ' ')}</span>
							{#if entry.proposalId}
								<span title="The proposal this value came from">from {entry.proposalId}</span>
							{/if}
							{#if entry.acceptedByPersonId}
								<span title="The person answerable for the value">signed by {entry.acceptedByPersonId}</span>
							{/if}
						</p>
					</div>
					{#if entry.supersededById}
						<span class="mt-0.5 shrink-0 text-[10px] italic text-ink-400">superseded</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>
