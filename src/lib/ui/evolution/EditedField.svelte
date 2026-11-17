<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Icon, pushToast } from '$ui/design-system';
	import { relativeWhen } from './relative-when';

	/**
	 * A field of a section being edited, the design's way: its label with the
	 * version history beside it, the editor, and under it the versions the field
	 * went through, newest first, each one restorable.
	 */
	interface Version {
		readonly id: string;
		readonly value: string;
		readonly by: string;
		readonly at: string;
	}
	interface Props {
		label: string;
		/** Newest first; the first is the value as it stands. */
		versions: readonly Version[];
		nameOf: (id: string) => string;
		/** Writes an earlier version again; left out where the field cannot be written. */
		onrestore?: ((value: string) => Promise<boolean>) | null;
		for?: string;
		/** The editor, under the label and its history button. */
		children?: Snippet;
		/** A row that carries the history button itself, the label then naming its versions only. */
		row?: Snippet<[Snippet]>;
	}
	let { label, versions, nameOf, onrestore = null, for: forId, children, row }: Props = $props();

	let open = $state(false);
	const earlier = $derived(versions.slice(1));

	/** The version reads restored at once and the list folds; a restore that fails opens the list again. */
	async function restore(value: string) {
		if (!onrestore) return;
		open = false;
		if (await onrestore(value)) pushToast({ level: 'success', message: 'Version restored' });
		else open = true;
	}
</script>

{#snippet history()}
	<button
		type="button"
		class="-ml-1 grid size-7 flex-none place-items-center rounded-md {earlier.length > 0 ? 'text-blue-ink hover:bg-toner-1' : 'text-ink-4'}"
		aria-label="Previous versions"
		title="Version history"
		aria-expanded={open}
		onclick={() => (open = !open)}
	>
		<Icon name="history" size={14} />
	</button>
{/snippet}

<div class="flex flex-col gap-2">
	{#if row}
		{@render row(history)}
	{:else}
		<div class="flex items-center gap-1.5">
			<label for={forId} class="font-evo-mono text-xs font-bold tracking-[0.08em] text-evo-muted uppercase">{label}</label>
			{@render history()}
		</div>
		{@render children?.()}
	{/if}
	{#if open}
		<div class="animate-lk-in-fast flex w-full flex-col gap-1 rounded-lg border-[1.5px] border-ink bg-paper px-3 py-2.5">
			<span class="font-evo-mono text-xs tracking-[0.08em] text-evo-muted uppercase">VERSIONS · {label}</span>
			{#if earlier.length === 0}
				<span class="text-[0.8125rem] text-evo-muted italic">No previous version for this field.</span>
			{/if}
			{#each earlier as version (version.id)}
				<div class="flex flex-wrap items-center gap-2.5 border-t border-line py-1.5 text-[0.8125rem]">
					<span class="min-w-0 flex-[1_1_260px] whitespace-pre-line">{version.value || '(empty)'}</span>
					<span class="font-evo-mono text-xs text-evo-muted">{nameOf(version.by)} · {relativeWhen(version.at)}</span>
					{#if onrestore}
						<button type="button" class="pressable min-h-8 rounded-md border-[1.5px] border-ink bg-transparent px-2.5 text-xs font-bold tracking-[0.07em] text-evo-ink uppercase" onclick={() => void restore(version.value)}>Restore</button>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
