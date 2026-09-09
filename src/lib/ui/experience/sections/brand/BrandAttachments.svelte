<script lang="ts">
	import { Card, Icon, openFileViewer } from '$ui/design-system';
	import type { BrandAttachment, BrandSection } from '$domain/experience';
	import type { ExperienceStore } from '../../draft-store.svelte';
	import BrandSectionHeader from './BrandSectionHeader.svelte';
	import { isImageData, readBrandFile } from './brand-io';

	interface Props {
		store: ExperienceStore;
		section: BrandSection;
		title: string;
		hint: string;
	}
	let { store, section, title, hint }: Props = $props();

	const list = $derived(store.draft.brand.attachments[section] ?? []);
	let input = $state<HTMLInputElement | null>(null);

	async function pick(e: Event) {
		const files = Array.from((e.currentTarget as HTMLInputElement).files ?? []);
		if (files.length) {
			const loaded = await Promise.all(files.map(readBrandFile));
			store.setBrand(`attachments.${section}`, [...list, ...loaded]);
		}
		if (input) input.value = '';
	}

	function remove(id: string) {
		store.setBrand(
			`attachments.${section}`,
			list.filter((a: BrandAttachment) => a.id !== id)
		);
	}
</script>

<Card class="mt-4 space-y-3" padding={false}>
	<div class="p-5">
		<div class="flex items-start justify-between gap-3">
			<BrandSectionHeader kicker="Attachments" {title} help={hint} />
			<button
				type="button"
				onclick={() => input?.click()}
				class="inline-flex shrink-0 items-center gap-1.5 rounded-field bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-600 transition-colors hover:bg-brand-100"
			>
				<Icon name="upload" size={13} /> Upload files
			</button>
		</div>

		{#if list.length === 0}
			<button
				type="button"
				onclick={() => input?.click()}
				class="mt-3 flex w-full items-center justify-center gap-2 rounded-field border border-dashed border-line-strong py-6 text-xs font-medium text-ink-500 transition-colors hover:border-brand-400 hover:text-brand-600"
			>
				<Icon name="upload" size={14} /> Click to upload documents for this section
			</button>
		{:else}
			<div class="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
				{#each list as att (att.id)}
					<div class="group relative overflow-hidden rounded-field border border-line bg-surface-sunken">
						<button
							type="button"
							onclick={() => openFileViewer({ name: att.name, dataUrl: att.dataUrl })}
							class="block w-full text-left"
							title="Preview {att.name}"
						>
							{#if isImageData(att.dataUrl)}
								<img src={att.dataUrl} alt={att.name} class="h-24 w-full object-cover" />
							{:else}
								<div class="grid h-24 w-full place-items-center text-ink-400 transition-colors group-hover:text-brand-500">
									<Icon name="file" size={28} />
								</div>
							{/if}
							<div class="px-2 py-1.5">
								<p class="truncate text-[11px] font-medium text-ink-700">{att.name}</p>
								<p class="text-[10px] text-ink-400">{Math.round(att.size / 1024)} KB</p>
							</div>
						</button>
						<button
							type="button"
							onclick={() => remove(att.id)}
							class="absolute right-1 top-1 grid size-6 place-items-center rounded bg-surface/90 text-ink-500 opacity-0 transition-opacity hover:text-danger-500 group-hover:opacity-100"
							aria-label="Remove attachment"
						>
							<Icon name="x" size={13} />
						</button>
					</div>
				{/each}
			</div>
		{/if}
	</div>
	<input bind:this={input} type="file" multiple onchange={pick} class="hidden" />
</Card>
