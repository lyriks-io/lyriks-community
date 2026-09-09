<script lang="ts" module>
	import type { IconName } from '$ui/design-system';

	export interface DeviceOption {
		id: string;
		icon: IconName;
		label: string;
	}
</script>

<script lang="ts">
	import { Icon } from '$ui/design-system';

	interface Props {
		/** Full URL shown in the address bar. */
		url: string;
		/** Editable address bar: typing a path and pressing Enter navigates. */
		onNavigate?: (value: string) => void;
		devices: DeviceOption[];
		activeDevice?: string | null;
		onPickDevice: (id: string) => void;
		class?: string;
	}
	let { url, onNavigate, devices, activeDevice = null, onPickDevice, class: klass = '' }: Props = $props();
</script>

<!-- Simulated browser title bar — single source for SimFrame (docked) and
     SimDesktop (draggable window), so the chrome never drifts between them. -->
<div class="flex h-9 items-center gap-2 border-b border-line bg-surface-sunken px-3 {klass}">
	<span class="flex shrink-0 gap-1.5" aria-hidden="true">
		<span class="size-2.5 rounded-full bg-danger-400"></span>
		<span class="size-2.5 rounded-full bg-warning-400"></span>
		<span class="size-2.5 rounded-full bg-success-400"></span>
	</span>
	<div
		class="flex min-w-0 flex-1 items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-0.5 text-xs text-ink-500"
		role="group"
		aria-label="Browser address"
		onpointerdown={(e) => e.stopPropagation()}
	>
		<Icon name="lock" size={10} />
		{#if onNavigate}
			<input
				value={url}
				onkeydown={(e) => e.key === 'Enter' && onNavigate?.(e.currentTarget.value)}
				spellcheck="false"
				aria-label="Address bar - type a path and press Enter"
				class="min-w-0 flex-1 border-none bg-transparent p-0 text-xs text-ink-600 outline-none"
			/>
		{:else}
			<span class="truncate">{url || 'app'}</span>
		{/if}
	</div>
	<div
		class="flex shrink-0 items-center gap-0.5 rounded-md bg-surface p-0.5"
		role="group"
		aria-label="Preview device"
		onpointerdown={(e) => e.stopPropagation()}
	>
		{#each devices as d (d.id)}
			<button
				type="button"
				onclick={() => onPickDevice(d.id)}
				title={d.label}
				aria-label={d.label}
				aria-pressed={activeDevice === d.id}
				class="grid size-6 place-items-center rounded transition-colors {activeDevice === d.id
					? 'bg-brand-50 text-brand-600'
					: 'text-ink-500 hover:bg-surface-sunken hover:text-ink-700'}"
			>
				<Icon name={d.icon} size={13} />
			</button>
		{/each}
	</div>
</div>
