<script lang="ts">
	import { Button, Icon } from '$ui/design-system';
	import { DEVICES, type DeviceKind } from '$domain/experience';
	import type { ExperienceStore } from '../draft-store.svelte';

	interface Props {
		store: ExperienceStore;
	}
	let { store }: Props = $props();

	// Screens are named, not drawn: the inventory says what each one is, where it
	// lives and which journey steps visit it. Layouts authored before stay stored
	// for AI clients; nothing here edits them.
	const screens = $derived(store.draft.screens);

	const visitsByScreen = $derived.by(() => {
		const journeyName = new Map(store.draft.journeys.map((j) => [j.id, j.name]));
		const visits = new Map<string, string[]>();
		for (const step of store.draft.steps) {
			if (!step.linkedScreenId) continue;
			const list = visits.get(step.linkedScreenId) ?? [];
			list.push(`${journeyName.get(step.journeyId) ?? 'Journey'} › ${step.name}`);
			visits.set(step.linkedScreenId, list);
		}
		return visits;
	});

	const input =
		'w-full rounded-field border border-line bg-surface px-2 py-1 text-sm text-ink-900 focus:border-brand-400 focus:outline-none';
</script>

<section class="rounded-card border border-line bg-surface">
	<header class="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
		<div>
			<p class="text-[0.625rem] font-bold uppercase tracking-widest text-brand-400">Screens</p>
			<p class="text-xs text-ink-500">Every screen of the product, its route and the journey steps that visit it.</p>
		</div>
		<Button variant="outline" size="sm" onclick={() => store.addScreen({ name: 'New screen' })}>
			<Icon name="plus" size={14} /> Screen
		</Button>
	</header>

	{#if screens.length === 0}
		<p class="px-4 py-6 text-center text-xs text-ink-400">No screen yet. Add the first one the product shows.</p>
	{:else}
		<ul class="divide-y divide-line">
			{#each screens as screen (screen.id)}
				{@const visits = visitsByScreen.get(screen.id) ?? []}
				<li class="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,14rem)_minmax(0,12rem)_8rem_minmax(0,1fr)_auto]" data-anchor={screen.id}>
					<label class="space-y-1">
						<span class="text-[0.625rem] font-semibold uppercase tracking-wide text-ink-400">Name</span>
						<input class={input} value={screen.name} oninput={(e) => store.updateScreen(screen.id, 'name', e.currentTarget.value)} />
					</label>
					<label class="space-y-1">
						<span class="text-[0.625rem] font-semibold uppercase tracking-wide text-ink-400">Route</span>
						<input class="{input} font-mono" value={screen.path ?? ''} placeholder="/path" oninput={(e) => store.updateScreen(screen.id, 'path', e.currentTarget.value)} />
					</label>
					<label class="space-y-1">
						<span class="text-[0.625rem] font-semibold uppercase tracking-wide text-ink-400">Device</span>
						<select class={input} value={screen.device} onchange={(e) => store.updateScreen(screen.id, 'device', e.currentTarget.value as DeviceKind)}>
							{#each DEVICES as d (d.code)}
								<option value={d.code}>{d.label}</option>
							{/each}
						</select>
					</label>
					<div class="space-y-1">
						<label class="block space-y-1">
							<span class="text-[0.625rem] font-semibold uppercase tracking-wide text-ink-400">Description</span>
							<textarea class="{input} min-h-[2.25rem]" rows="1" value={screen.description ?? ''} oninput={(e) => store.updateScreen(screen.id, 'description', e.currentTarget.value)}></textarea>
						</label>
						{#if visits.length}
							<p class="text-[0.6875rem] text-ink-500">Visited by {visits.join(' · ')}</p>
						{:else}
							<p class="text-[0.6875rem] text-warning-600">No journey step visits this screen.</p>
						{/if}
					</div>
					<div class="flex items-start pt-5">
						<button type="button" class="text-ink-400 hover:text-danger-600" aria-label="Remove {screen.name}" onclick={() => store.removeScreen(screen.id)}>
							<Icon name="x" size={16} />
						</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>
