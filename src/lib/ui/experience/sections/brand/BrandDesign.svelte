<script lang="ts">
	import { Card, Icon, type IconName } from '$ui/design-system';
	import type { BrandSection } from '$domain/experience';
	import type { ExperienceStore } from '../../draft-store.svelte';
	import Identity from './Identity.svelte';
	import Logo from './Logo.svelte';
	import Colors from './Colors.svelte';
	import Typography from './Typography.svelte';
	import DesignSystem from './DesignSystem.svelte';
	import Examples from './Examples.svelte';
	import BrandExportModal from './BrandExportModal.svelte';

	interface Props {
		store: ExperienceStore;
	}
	let { store }: Props = $props();

	let section = $state<BrandSection>('identity');
	let exportOpen = $state(false);

	const NAV: { id: BrandSection; label: string; icon: IconName }[] = [
		{ id: 'identity', label: 'Identity', icon: 'sparkles' },
		{ id: 'logo', label: 'Logo & assets', icon: 'image' },
		{ id: 'colors', label: 'Colors', icon: 'layers' },
		{ id: 'typography', label: 'Typography', icon: 'book' },
		// Traits + simulator tokens are one conversation, under the `markers` key.
		{ id: 'markers', label: 'Design system', icon: 'sliders' },
		// Components and Pages & layouts live in the Experience tabs, not here.
		{ id: 'examples', label: 'Examples', icon: 'check' }
	];
</script>

<div class="grid grid-cols-1 items-start gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
	<!-- Left rail -->
	<Card class="space-y-2 md:sticky md:top-2" padding={false}>
		<div class="space-y-0.5 p-2">
			{#each NAV as s (s.id)}
				<button
					type="button"
					aria-pressed={section === s.id}
					onclick={() => (section = s.id)}
					class="flex w-full items-center gap-2 rounded-field px-3 py-2 text-left text-sm transition-colors {section === s.id
						? 'bg-brand-50 font-semibold text-brand-700'
						: 'text-ink-600 hover:bg-surface-sunken'}"
				>
					<Icon name={s.icon} size={16} />
					<span>{s.label}</span>
				</button>
			{/each}
		</div>
		<div class="border-t border-line p-2">
			<button
				type="button"
				onclick={() => (exportOpen = true)}
				class="flex w-full items-center justify-center gap-1.5 rounded-field bg-brand-gradient px-3 py-2 text-xs font-semibold text-white shadow-card"
			>
				<Icon name="download" size={14} /> Export LLM brief
			</button>
		</div>
	</Card>

	<!-- Active sub-section + its attachments -->
	<div class="min-w-0">
		{#if section === 'identity'}
			<Identity {store} />
		{:else if section === 'logo'}
			<Logo {store} />
		{:else if section === 'colors'}
			<Colors {store} />
		{:else if section === 'typography'}
			<Typography {store} />
		{:else if section === 'markers'}
			<DesignSystem {store} />
		{:else}
			<Examples {store} />
		{/if}
	</div>
</div>

{#if exportOpen}
	<BrandExportModal brand={store.draft.brand} notifier={store.notifier} onClose={() => (exportOpen = false)} />
{/if}
