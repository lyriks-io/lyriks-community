<script lang="ts">
	import { Icon } from '$ui/design-system';
	import type { ExperienceStore } from '../draft-store.svelte';
	import Builder from '../builder/Builder.svelte';

	interface Props {
		store: ExperienceStore;
		/** Step-03 roles, threaded to the inline Builder for persona gates. */
		roles: { id: string; name: string }[];
	}
	let { store, roles }: Props = $props();

	let editingId = $state<string | null>(null);
</script>

<!-- Screen-sized reusable layouts — rendered as a full sub-view of the reuse
     library (the Components SectionNav owns the navigation, no fold here). -->
<div class="space-y-2 rounded-card border border-line bg-surface p-3">
	<p class="text-[11px] leading-snug text-ink-400">
		A template is a reusable layout blueprint. Give it a layout once, then apply it to any screen
		from the screen’s <span class="font-medium text-ink-600">Template</span> picker - the screen gets
		its own editable copy. Use “Save as template” on a screen to capture its layout here.
	</p>
	{#each store.draft.templates as t (t.id)}
		{@const usedBy = store.draft.screens.filter((s) => s.templateId === t.id).length}
		{@const editing = editingId === t.id}
		<div data-anchor={t.id} class="rounded-card border border-line bg-surface-sunken/40 p-2">
			<div class="flex items-center gap-2">
				<Icon name="grid" size={13} class="shrink-0 text-info-600" />
				<input
					value={t.name}
					oninput={(e) => store.updateTemplate(t.id, 'name', e.currentTarget.value)}
					placeholder="Template name"
					class="min-w-0 flex-1 border-none bg-transparent text-xs font-semibold text-ink-800 outline-none placeholder:text-ink-300"
				/>
				<span class="shrink-0 text-[10px] text-ink-400">
					{usedBy} screen{usedBy === 1 ? '' : 's'}
				</span>
				<button
					type="button"
					onclick={() => (editingId = editing ? null : t.id)}
					class="shrink-0 rounded-field border px-2 py-0.5 text-[10px] font-semibold transition-colors {editing
						? 'border-brand-300 bg-brand-50 text-brand-600'
						: 'border-line text-ink-500 hover:text-brand-600'}"
				>
					{editing ? 'Close' : 'Edit layout'}
				</button>
				<button
					type="button"
					onclick={() => {
						if (editing) editingId = null;
						store.removeTemplate(t.id);
					}}
					class="shrink-0 text-ink-300 hover:text-danger-500"><Icon name="x" size={14} /></button
				>
			</div>
			<input
				value={t.description}
				oninput={(e) => store.updateTemplate(t.id, 'description', e.currentTarget.value)}
				placeholder="What is this template for? (optional)"
				class="mt-1 w-full border-none bg-transparent pl-5 text-[11px] text-ink-500 outline-none placeholder:text-ink-300"
			/>
			{#if editing}
				<div class="mt-2">
					<Builder {store} screenId={t.id} surfaceKind="template" {roles} />
				</div>
			{/if}
		</div>
	{:else}
		<p class="py-3 text-center text-xs text-ink-400">
			No template yet. Use “Save as template” on a screen, or add one here and design it.
		</p>
	{/each}
	<button
		type="button"
		onclick={() => (editingId = store.addTemplate())}
		class="text-[11px] font-semibold text-brand-500 hover:text-brand-600"
	>
		+ Template
	</button>
</div>
