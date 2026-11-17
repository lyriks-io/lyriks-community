<script lang="ts">
	import { Icon, type IconName } from '$ui/design-system';
	import GlossaryText from '$ui/glossary/GlossaryText.svelte';
	import type { ProjectHealthAfter } from '$domain/evolution';

	/**
	 * Project health as the change would leave it (ac-evo-coh-after): which
	 * findings leave with it, which a fix only the engine can confirm, which it
	 * brings. Lists a person can act on, never a score (ac-evo-coh-6).
	 */
	interface Props {
		health: ProjectHealthAfter;
	}
	let { health }: Props = $props();
	const groups = $derived(
		(
			[
			{ key: 'leave', icon: 'check', tone: 'text-evo-green', title: 'Leave Project health when the change lands', rows: health.leaving.map((l) => ({ id: l.findingId, title: l.title })) },
			{ key: 'expected', icon: 'clock', tone: 'text-evo-orange', title: 'Leave once the engine reads the landed spec', rows: health.expectedToLeave.map((l) => ({ id: l.findingId, title: l.title })) },
			{ key: 'come', icon: 'plus', tone: 'text-evo-red', title: 'Come with the change', rows: health.coming.map((c) => ({ id: c.id, title: c.title })) }
			] satisfies { key: string; icon: IconName; tone: string; title: string; rows: { id: string; title: string }[] }[]
		).filter((g) => g.rows.length > 0)
	);
</script>

{#if groups.length > 0 || health.undecided > 0}
	<section aria-label="Project health after this change" class="flex flex-col gap-3 rounded-evo-card border border-transparent bg-surface p-6">
		<h3 class="text-xl leading-[1.2] font-bold tracking-[-0.02em]">Project health after this change</h3>
		{#each groups as group (group.key)}
			<details class="group rounded-xl bg-evo-sunken px-4 py-3" open={group.key !== 'leave'}>
				<summary class="flex cursor-pointer list-none items-center gap-2 text-sm font-bold {group.tone}">
					<Icon name={group.icon} size={14} />
					<span>{group.rows.length} {group.rows.length === 1 ? 'finding' : 'findings'}: {group.title}</span>
					<Icon name="chevron-down" size={14} class="ml-auto transition-transform group-open:rotate-180" />
				</summary>
				<ul class="mt-2 flex flex-col gap-1 text-sm text-evo-ink">
					{#each group.rows as row (row.id)}
						<li><GlossaryText text={row.title} /></li>
					{/each}
				</ul>
			</details>
		{/each}
		{#if health.undecided > 0}
			<p class="text-sm text-ink-3">
				{health.undecided === 1 ? 'One finding the request names has' : `${health.undecided} findings the request names have`} no outcome yet: {health.undecided === 1 ? 'it stays' : 'they stay'} until the Specification says what becomes of {health.undecided === 1 ? 'it' : 'them'}.
			</p>
		{/if}
	</section>
{/if}
