<script lang="ts">
	import { Card, TextInput, Textarea, IconButton, Button, Icon, openFileViewer } from '$ui/design-system';
	import { brandNewId, type BrandPage } from '$domain/experience';
	import type { ExperienceStore } from '../../draft-store.svelte';
	import BrandSectionHeader from './BrandSectionHeader.svelte';
	import { readBrandFile, toFileRef } from './brand-io';

	interface Props {
		store: ExperienceStore;
	}
	let { store }: Props = $props();

	const pages = $derived(store.draft.brand.pages);
	const setPages = (v: BrandPage[]) => store.setBrand('pages', v);
	const addPage = (type: string) =>
		setPages([...pages, { id: brandNewId('pg'), type, principles: '', densityNote: '', screenshotRefs: [], referenceUrls: [] }]);
	const patch = (id: string, p: Partial<BrandPage>) => setPages(pages.map((x) => (x.id === id ? { ...x, ...p } : x)));
	const remove = (id: string) => setPages(pages.filter((x) => x.id !== id));

	async function addShots(id: string, current: BrandPage['screenshotRefs'], e: Event) {
		const files = Array.from((e.currentTarget as HTMLInputElement).files ?? []);
		const loaded = await Promise.all(files.map(readBrandFile));
		patch(id, { screenshotRefs: [...current, ...loaded.map(toFileRef)] });
		(e.currentTarget as HTMLInputElement).value = '';
	}

	const PRESETS = ['Landing', 'Dashboard', 'Form', 'Detail', 'Custom'];
</script>

<Card class="space-y-4">
	<BrandSectionHeader kicker="Pages & layouts" title="Page-level principles & references" />

	{#if pages.length === 0}
		<p class="py-4 text-center text-sm italic text-ink-400">No page defined yet.</p>
	{/if}

	<div class="space-y-3">
		{#each pages as pg (pg.id)}
			<div class="space-y-3 rounded-field border border-line bg-surface-sunken p-3">
				<div class="flex items-center gap-2">
					<div class="flex-1"><TextInput value={pg.type} placeholder="landing, dashboard, form…" oninput={(v) => patch(pg.id, { type: v })} /></div>
					<IconButton name="x" label="Remove page" danger onclick={() => remove(pg.id)} />
				</div>
				<Textarea value={pg.principles} rows={3} placeholder="Layout principles for this page type." oninput={(v) => patch(pg.id, { principles: v })} />
				<Textarea value={pg.densityNote} rows={2} placeholder="Density note (spacing, information density)." oninput={(v) => patch(pg.id, { densityNote: v })} />
				<TextInput value={pg.referenceUrls.join(', ')} placeholder="Reference URLs, comma-separated" oninput={(v) => patch(pg.id, { referenceUrls: v.split(',').map((s) => s.trim()).filter(Boolean) })} />
				<div class="flex flex-wrap items-center gap-2">
					{#each pg.screenshotRefs as shot, i (i)}
						<div class="group relative">
							<button type="button" onclick={() => openFileViewer({ name: shot.name, dataUrl: shot.dataUrl })} title="Preview {shot.name}">
								<img src={shot.dataUrl} alt={shot.name} class="h-16 w-24 rounded border border-line object-cover" />
							</button>
							<button
								type="button"
								onclick={() => patch(pg.id, { screenshotRefs: pg.screenshotRefs.filter((_, j) => j !== i) })}
								class="absolute right-0.5 top-0.5 grid size-5 place-items-center rounded bg-surface/90 text-ink-500 opacity-0 transition-opacity hover:text-danger-500 group-hover:opacity-100"
								aria-label="Remove screenshot"
							>
								<Icon name="x" size={11} />
							</button>
						</div>
					{/each}
					<label class="flex h-16 w-24 cursor-pointer items-center justify-center gap-1 rounded border border-dashed border-line-strong text-[11px] font-medium text-ink-500 transition-colors hover:border-brand-400 hover:text-brand-600">
						<Icon name="plus" size={13} /> Add
						<input type="file" accept="image/*" multiple class="hidden" onchange={(e) => addShots(pg.id, pg.screenshotRefs, e)} />
					</label>
				</div>
			</div>
		{/each}
	</div>

	<div class="flex flex-wrap gap-1.5">
		{#each PRESETS as p (p)}
			<Button variant="soft" size="sm" onclick={() => addPage(p === 'Custom' ? '' : p.toLowerCase())}><Icon name="plus" size={12} /> {p}</Button>
		{/each}
	</div>
</Card>
