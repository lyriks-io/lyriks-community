<script lang="ts">
	import { Button, Icon, promptDialog, type IconName } from '$ui/design-system';
	import SourceCitations from '$ui/documents/SourceCitations.svelte';
	import { constraintThemeOptions } from '$domain/foundation';
	import type { DefinitionStore } from '../definition-store.svelte';

	interface Props {
		store: DefinitionStore;
	}
	let { store }: Props = $props();

	const items = $derived(store.draft.constraints.items);
	// Built-in themes first, then every theme the project already uses: a theme
	// typed through "Custom…" on one row is offered on every other row.
	const themeOptions = $derived(constraintThemeOptions(items));
	const CUSTOM = '__custom__';

	const THEME_ICON: Record<string, IconName> = {
		business: 'target',
		security: 'shield',
		compliance: 'file-check',
		legal: 'book',
		ops: 'settings',
		technical: 'cpu'
	};
	const themeIcon = (theme: string): IconName => THEME_ICON[theme.trim().toLowerCase()] ?? 'tag';

	// Foundation's home of every constraint that is not technical, drawn like
	// Technical constraints in Tech & Data (spec: criterion 5fcfd107): the
	// description is asked for first, so a row never lands empty.
	async function add() {
		const description = (
			await promptDialog({
				title: 'New constraint',
				placeholder: 'What must the product respect?',
				confirmLabel: 'Add'
			})
		)?.trim();
		if (description) store.addConstraint('Business', description);
	}

	// The same compact picker as Technical constraints; Custom… asks for a new
	// theme, which is then offered on every row of the project.
	async function pickTheme(id: string, select: HTMLSelectElement, current: string) {
		if (select.value !== CUSTOM) return store.updateConstraint(id, { theme: select.value });
		select.value = current;
		const theme = (
			await promptDialog({ title: 'New theme', placeholder: 'e.g. Accessibility', confirmLabel: 'Use' })
		)?.trim();
		if (theme) store.updateConstraint(id, { theme });
	}
</script>

<section class="rounded-card border border-line bg-surface">
	<header class="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
		<p class="text-[0.625rem] font-bold uppercase tracking-widest text-brand-400">Constraints</p>
		<Button variant="outline" size="sm" onclick={() => void add()}>
			<Icon name="plus" size={14} /> Constraint
		</Button>
	</header>

	{#if items.length === 0}
		<p class="px-4 py-6 text-center text-xs text-ink-400">
			No constraint yet. Write down what the product must respect beyond the tech (contracts, law,
			operations…). Technical constraints are pinned in Tech &amp; Data.
		</p>
	{:else}
		<ul class="divide-y divide-line">
			{#each items as row (row.id)}
				<li data-anchor={row.id} class="flex items-start gap-3 px-4 py-2.5">
					<span
						class="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-surface-sunken text-ink-500"
					>
						<Icon name={themeIcon(row.theme)} size={14} />
					</span>
					<div class="min-w-0 flex-1">
						<!-- Grows with its text: a constraint here is often a full sentence. -->
						<textarea
							rows="1"
							value={row.description}
							oninput={(e) => store.updateConstraint(row.id, { description: e.currentTarget.value })}
							placeholder="What must the product respect?"
							aria-invalid={!row.description.trim()}
							class="block w-full field-sizing-content resize-none border-none bg-transparent p-0 text-sm font-medium text-ink-900 outline-none placeholder:font-normal placeholder:text-ink-300 aria-invalid:placeholder:text-danger-400"
						></textarea>
					</div>
					<select
						value={row.theme}
						onchange={(e) => void pickTheme(row.id, e.currentTarget, row.theme)}
						aria-label="Theme"
						class="mt-0.5 rounded-field border border-line bg-surface px-1.5 py-0.5 text-[0.6875rem] text-ink-600"
					>
						{#each themeOptions as theme (theme)}
							<option value={theme}>{theme}</option>
						{/each}
						<option value={CUSTOM}>Custom…</option>
					</select>
					<button
						type="button"
						onclick={() => store.removeConstraint(row.id)}
						class="mt-1 text-ink-300 hover:text-danger-500"
						aria-label="Remove constraint"><Icon name="x" size={14} /></button
					>
				</li>
			{/each}
		</ul>
	{/if}
	<div class="px-4 pb-3">
		<SourceCitations
			inline
			selected={store.draft.constraints.sourceIds}
			onToggle={(sourceId) => store.toggleSectionSource('constraints', sourceId)}
			subject="these constraints"
		/>
	</div>
</section>
