<script lang="ts">
	import { invalidateAll, goto } from '$app/navigation';
	import { Button, Icon } from '$ui/design-system';
	import { toastNotifier } from '$ui/composition/client-container';
	import type { RequirementTemplate } from '$domain/reuse';

	interface Props {
		templates: RequirementTemplate[];
		leaves: { id: string; name: string }[];
		projectId: string;
	}
	let { templates, leaves, projectId }: Props = $props();

	const notifier = toastNotifier;
	let selectedLeaf = $state('');
	let busy = $state(false);

	async function post(body: Record<string, unknown>): Promise<unknown | null> {
		busy = true;
		try {
			const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/reuse`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) throw new Error(`request failed (${res.status})`);
			return await res.json();
		} catch (e) {
			notifier.notify('error', e instanceof Error ? e.message : 'request failed');
			return null;
		} finally {
			busy = false;
		}
	}

	async function exportLeaf() {
		if (!selectedLeaf) return;
		const leafName = leaves.find((l) => l.id === selectedLeaf)?.name || 'Untitled feature';
		const r = await post({ action: 'export', featureId: selectedLeaf });
		if (r) {
			notifier.notify('info', `"${leafName}" exported to the reuse library.`);
			selectedLeaf = '';
			await invalidateAll();
		}
	}

	async function importTemplate(templateId: string) {
		const templateName = templates.find((t) => t.id === templateId)?.title || 'Template';
		const r = (await post({ action: 'import', templateId })) as { featureId?: string } | null;
		if (r) {
			notifier.notify('info', `"${templateName}" imported as a new feature.`);
			await goto(`/projects/${projectId}/features`);
		}
	}

	async function removeTemplate(templateId: string) {
		const r = await post({ action: 'remove', templateId });
		if (r) await invalidateAll();
	}
</script>

<div class="space-y-6">
	<!-- Export -->
	<div class="rounded-card border border-line bg-gradient-to-br from-brand-50/30 to-transparent p-4">
		<p class="mb-2 text-sm font-semibold text-ink-900">Add a feature to the library</p>
		<div class="flex flex-wrap items-center gap-2">
			<select
				bind:value={selectedLeaf}
				class="min-w-56 flex-1 rounded-field border border-line bg-surface px-3 py-2 text-sm text-ink-800 outline-none focus:border-brand-300"
			>
				<option value="">Choose a feature…</option>
				{#each leaves as l (l.id)}
					<option value={l.id}>{l.name || 'Untitled feature'}</option>
				{/each}
			</select>
			<Button size="md" disabled={!selectedLeaf || busy} onclick={exportLeaf}>
				<Icon name="upload" size={14} /> Export to library
			</Button>
		</div>
		{#if leaves.length === 0}
			<p class="mt-2 text-[11px] text-ink-400">This project has no features to export yet.</p>
		{/if}
	</div>

	<!-- Library -->
	<div>
		<p class="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-400">
			Shared library · {templates.length}
		</p>
		{#if templates.length === 0}
			<div class="rounded-card border border-dashed border-line bg-surface px-6 py-12 text-center">
				<p class="text-sm font-semibold text-ink-700">The library is empty.</p>
				<p class="mt-1 text-xs text-ink-500">Export a feature above to make it reusable across projects.</p>
			</div>
		{:else}
			<ul class="space-y-3">
				{#each templates as t (t.id)}
					<li class="rounded-card border border-line bg-surface p-3">
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0 flex-1">
								<p class="text-sm font-semibold text-ink-800">{t.title || 'Untitled requirement'}</p>
								<p class="text-[11px] text-ink-400">from {t.sourceProjectName || 'unknown project'}</p>
								{#if t.description}<p class="mt-1 text-[13px] text-ink-600">{t.description}</p>{/if}
								<div class="mt-1 flex flex-wrap gap-3 text-[11px] text-ink-500">
									{#if t.problem}<span>Problem ✓</span>{/if}
									{#if t.value}<span>Value ✓</span>{/if}
									<span>{t.acceptanceCriteria.length} acceptance criteria</span>
								</div>
							</div>
							<div class="flex shrink-0 items-center gap-1">
								<Button size="sm" disabled={busy} onclick={() => importTemplate(t.id)}>
									<Icon name="download" size={13} /> Import here
								</Button>
								<button
									type="button"
									disabled={busy}
									onclick={() => removeTemplate(t.id)}
									aria-label="Remove from library"
									class="rounded p-1.5 text-ink-400 hover:bg-surface-sunken hover:text-danger-500 disabled:opacity-50"
								>
									<Icon name="x" size={14} />
								</button>
							</div>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>
