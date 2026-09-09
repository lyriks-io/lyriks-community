<script lang="ts">
	import { Icon, openFileViewer } from '$ui/design-system';
	import type { BrandAttachment, BrandFileRef } from '$domain/experience';
	import { readBrandFile } from './brand-io';

	interface Props {
		accept?: string;
		current: BrandFileRef | null;
		hint?: string;
		onLoaded: (file: BrandAttachment) => void;
		onClear: () => void;
	}
	let { accept, current, hint, onLoaded, onClear }: Props = $props();

	let input = $state<HTMLInputElement | null>(null);

	async function pick(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (file) onLoaded(await readBrandFile(file));
		if (input) input.value = '';
	}
</script>

<div>
	{#if current}
		<div class="flex items-center gap-2 rounded-field border border-success-500/40 bg-success-50 px-3 py-2 text-xs text-success-600">
			<Icon name="check" size={14} />
			<button
				type="button"
				onclick={() => openFileViewer({ name: current!.name, dataUrl: current!.dataUrl })}
				class="min-w-0 flex-1 truncate text-left font-medium hover:underline"
				title="Preview {current.name}"
			>
				{current.name}
			</button>
			<button type="button" onclick={onClear} class="text-ink-400 hover:text-danger-500" aria-label="Remove file">
				<Icon name="x" size={13} />
			</button>
		</div>
	{:else}
		<button
			type="button"
			onclick={() => input?.click()}
			class="flex w-full items-center justify-center gap-2 rounded-field border border-dashed border-line-strong px-3 py-2 text-xs font-medium text-ink-500 transition-colors hover:border-brand-400 hover:text-brand-600"
		>
			<Icon name="upload" size={14} />
			Upload file{hint ? ` (${hint})` : ''}
		</button>
	{/if}
	<input bind:this={input} type="file" {accept} onchange={pick} class="hidden" />
</div>
