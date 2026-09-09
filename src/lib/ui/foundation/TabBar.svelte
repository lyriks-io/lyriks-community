<script lang="ts">
	import { Card, Icon, type IconName } from '$ui/design-system';

	export interface FoundationTab {
		key: string;
		label: string;
		desc: string;
		icon: IconName;
	}

	interface Props {
		tabs: readonly FoundationTab[];
		active: string;
		onSelect: (key: string) => void;
	}
	let { tabs, active, onSelect }: Props = $props();
</script>

<Card padding={false} class="inline-flex flex-wrap gap-1 p-2">
	{#each tabs as t (t.key)}
		{@const isActive = active === t.key}
		<button
			type="button"
			role="tab"
			aria-selected={isActive}
			tabindex={isActive ? 0 : -1}
			onclick={() => onSelect(t.key)}
			class="flex items-center gap-2.5 rounded-field px-3.5 py-2 text-left transition {isActive
				? 'bg-brand-gradient text-white shadow-card shadow-brand-500/20'
				: 'text-ink-500 hover:bg-surface-sunken'}"
		>
			<Icon name={t.icon} size={16} />
			<div>
				<div class="text-sm font-semibold leading-tight">{t.label}</div>
				<div class="text-[10px] {isActive ? 'text-white/80' : 'text-ink-400'}">{t.desc}</div>
			</div>
		</button>
	{/each}
</Card>
