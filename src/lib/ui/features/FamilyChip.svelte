<script lang="ts">
	import { Icon, clickedWithin, floatInView } from '$ui/design-system';

	interface FamilyOption {
		id: string;
		label: string;
	}
	interface Props {
		currentFamilyId: string | null;
		options: FamilyOption[];
		onPick: (familyId: string | null) => void;
		onCreate: (name: string) => void;
	}
	let { currentFamilyId, options, onPick, onCreate }: Props = $props();

	const current = $derived(options.find((o) => o.id === currentFamilyId) ?? null);

	let open = $state(false);
	let root = $state<HTMLElement>();
	let panel = $state<HTMLElement>();
	function onWindow(e: MouseEvent) {
		if (open && !clickedWithin(e.target, root, panel)) open = false;
	}
	function pick(id: string | null) {
		onPick(id);
		open = false;
	}
	function create() {
		const name = prompt('New family name:');
		open = false;
		if (name && name.trim()) onCreate(name.trim());
	}
</script>

<svelte:window onclick={onWindow} />

<div bind:this={root} class="relative">
	<button
		type="button"
		onclick={() => (open = !open)}
		title="Group this feature into a family"
		class="inline-flex h-5.5 items-center gap-1 rounded border border-transparent px-2 text-[0.625rem] font-bold uppercase tracking-wider transition hover:border-line-strong {current
			? 'bg-accent-50 text-accent-600'
			: 'bg-surface-sunken text-ink-500'}"
	>
		<Icon name="layers" size={11} />
		{current ? current.label : 'Direct under core'}
		<span class="text-ink-400">▾</span>
	</button>
	{#if open}
		<div bind:this={panel} use:floatInView={{ anchor: root, align: 'left' }}
			class="min-w-52 rounded-lg border border-line bg-surface py-1 shadow-xl"
		>
			{#each options as o (o.id)}
				<button
					type="button"
					onclick={() => pick(o.id)}
					class="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-[0.6875rem] hover:bg-surface-sunken {currentFamilyId ===
					o.id
						? 'bg-surface-sunken'
						: ''}"
				>
					<span class="inline-flex items-center gap-1.5 text-ink-700">
						<span class="size-2 bg-accent-500"></span>{o.label}
					</span>
					{#if currentFamilyId === o.id}<Icon name="check" size={12} />{/if}
				</button>
			{/each}
			<div class="mt-1 border-t border-line pt-1">
				<button
					type="button"
					onclick={() => pick(null)}
					class="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[0.6875rem] text-ink-500 hover:bg-surface-sunken {currentFamilyId ===
					null
						? 'bg-surface-sunken'
						: ''}"
				>
					<span class="size-2 bg-ink-300"></span> Direct under core
				</button>
				<button
					type="button"
					onclick={create}
					class="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[0.6875rem] font-medium text-brand-600 hover:bg-surface-sunken"
				>
					<Icon name="plus" size={12} /> New family…
				</button>
			</div>
		</div>
	{/if}
</div>
