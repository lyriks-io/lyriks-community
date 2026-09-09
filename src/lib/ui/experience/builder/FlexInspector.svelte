<script lang="ts">
	import {
		FLEX_JUSTIFY,
		FLEX_ALIGN,
		FLEX_MAX_WIDTHS,
		GROUP_PRESENTATIONS,
		ASSERT_OPS,
		createVisibilityCondition,
		type BuilderGroupNode,
		type FlexJustify,
		type FlexAlign,
		type FlexMaxWidth,
		type GroupPresentation,
		type AssertOp,
		type VisibilityCondition
	} from '$domain/experience';
	import type { ExperienceStore } from '../draft-store.svelte';

	interface Props {
		store: ExperienceStore;
		node: BuilderGroupNode;
	}
	let { store, node }: Props = $props();

	const id = $derived(node.id);
	function step(field: 'gap' | 'padding', delta: number) {
		const next = Math.max(0, Math.min(12, node.flex[field] + delta));
		store.setBuilderFlex(id, { [field]: next });
	}

	// Group-level visibility (overlay open/close). Empty path clears it.
	function setVis(patch: Partial<VisibilityCondition>) {
		const cur = node.visibleWhen ?? createVisibilityCondition();
		const next = { ...cur, ...patch };
		store.setBuilderGroupVisibility(id, next.path.trim() ? next : null);
	}
	const inputCls =
		'w-full rounded-field border border-line bg-surface px-2 py-1.5 text-xs text-ink-700 outline-none focus:border-brand-300';
	const labelCls = 'mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400';
</script>

<div class="space-y-3">
	<label class="block">
		<span class="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400">Label</span>
		<input
			value={node.label}
			oninput={(e) => store.renameBuilderNode(id, e.currentTarget.value)}
			placeholder="Group label"
			class="w-full rounded-field border border-line bg-surface px-2 py-1.5 text-xs text-ink-800 outline-none focus:border-brand-300"
		/>
	</label>

	<div>
		<span class="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400">Direction</span>
		<div class="inline-flex rounded-field border border-line bg-surface-sunken p-0.5">
			<button
				type="button"
				onclick={() => store.setBuilderFlex(id, { direction: 'col' })}
				class="rounded-md px-3 py-1 text-[11px] font-semibold {node.flex.direction === 'col'
					? 'bg-surface text-ink-900 shadow-sm'
					: 'text-ink-400'}">Column ↓</button
			>
			<button
				type="button"
				onclick={() => store.setBuilderFlex(id, { direction: 'row' })}
				class="rounded-md px-3 py-1 text-[11px] font-semibold {node.flex.direction === 'row'
					? 'bg-surface text-ink-900 shadow-sm'
					: 'text-ink-400'}">Row →</button
			>
		</div>
	</div>

	<div class="grid grid-cols-2 gap-2">
		<label class="block">
			<span class="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400">
				Justify (main)
			</span>
			<select
				value={node.flex.justify}
				onchange={(e) => store.setBuilderFlex(id, { justify: e.currentTarget.value as FlexJustify })}
				class="w-full rounded-field border border-line bg-surface px-2 py-1.5 text-xs text-ink-700"
			>
				{#each FLEX_JUSTIFY as o (o.code)}
					<option value={o.code}>{o.label}</option>
				{/each}
			</select>
		</label>
		<label class="block">
			<span class="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400">
				Align (cross)
			</span>
			<select
				value={node.flex.align}
				onchange={(e) => store.setBuilderFlex(id, { align: e.currentTarget.value as FlexAlign })}
				class="w-full rounded-field border border-line bg-surface px-2 py-1.5 text-xs text-ink-700"
			>
				{#each FLEX_ALIGN as o (o.code)}
					<option value={o.code}>{o.label}</option>
				{/each}
			</select>
		</label>
	</div>

	<div class="grid grid-cols-2 gap-2">
		{#each [{ f: 'gap', label: 'Gap' }, { f: 'padding', label: 'Padding' }] as ctrl (ctrl.f)}
			<div>
				<span class="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400">
					{ctrl.label}
				</span>
				<div class="flex items-center rounded-field border border-line bg-surface">
					<button
						type="button"
						onclick={() => step(ctrl.f as 'gap' | 'padding', -1)}
						class="px-2 py-1 text-ink-500 hover:text-ink-900">−</button
					>
					<span class="flex-1 text-center text-xs tabular-nums text-ink-700">
						{node.flex[ctrl.f as 'gap' | 'padding']}
					</span>
					<button
						type="button"
						onclick={() => step(ctrl.f as 'gap' | 'padding', 1)}
						class="px-2 py-1 text-ink-500 hover:text-ink-900">+</button
					>
				</div>
			</div>
		{/each}
	</div>

	<label class="flex items-center gap-2 text-xs text-ink-600">
		<input
			type="checkbox"
			checked={node.flex.wrap}
			onchange={(e) => store.setBuilderFlex(id, { wrap: e.currentTarget.checked })}
		/>
		Wrap children
	</label>

	<label class="block">
		<span class="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-ink-400">Max width</span>
		<select
			value={node.flex.maxWidth}
			onchange={(e) => store.setBuilderFlex(id, { maxWidth: e.currentTarget.value as FlexMaxWidth })}
			class="w-full rounded-field border border-line bg-surface px-2 py-1.5 text-xs text-ink-700"
		>
			{#each FLEX_MAX_WIDTHS as o (o.code)}<option value={o.code}>{o.label}</option>{/each}
		</select>
		<span class="mt-1 block text-[10px] text-ink-300">Caps content width (centered) so it doesn't stretch on a wide page.</span>
	</label>

	<label class="flex items-center gap-2 text-xs text-ink-600">
		<input
			type="checkbox"
			checked={node.flex.card}
			onchange={(e) => store.setBuilderFlex(id, { card: e.currentTarget.checked })}
		/>
		Card surface <span class="text-[10px] text-ink-300">(background · border · shadow)</span>
	</label>

	<div>
		<span class="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-ink-400">Background</span>
		<div class="flex items-center gap-2">
			<input
				type="color"
				value={node.flex.background ?? '#ffffff'}
				oninput={(e) => store.setBuilderFlex(id, { background: e.currentTarget.value })}
				aria-label="Container background color"
				class="h-7 w-9 shrink-0 cursor-pointer rounded-field border border-line bg-surface p-0.5"
			/>
			<input
				value={node.flex.background ?? ''}
				oninput={(e) => store.setBuilderFlex(id, { background: e.currentTarget.value.trim() || undefined })}
				placeholder="Theme default"
				class="w-full rounded-field border border-line bg-surface px-2 py-1.5 text-xs text-ink-800 outline-none focus:border-brand-300"
			/>
			{#if node.flex.background}
				<button
					type="button"
					onclick={() => store.setBuilderFlex(id, { background: undefined })}
					class="shrink-0 px-1.5 py-1 text-[11px] text-ink-400 hover:text-ink-700">Clear</button
				>
			{/if}
		</div>
		<span class="mt-1 block text-[10px] text-ink-300">Fills this container; overrides the card/theme surface.</span>
	</div>

	<!-- ── Presentation & reuse ─────────────────────────────────────────── -->
	<div class="space-y-2 border-t border-line pt-3">
		<label class="block">
			<span class={labelCls}>Presentation</span>
			<select
				value={node.presentation ?? 'inline'}
				onchange={(e) => store.setBuilderGroupPresentation(id, e.currentTarget.value as GroupPresentation)}
				class={inputCls}
			>
				{#each GROUP_PRESENTATIONS as o (o.code)}<option value={o.code}>{o.label}</option>{/each}
			</select>
		</label>

		{#if node.presentation === 'tabs' || node.presentation === 'sidebar'}
			<label class="block">
				<span class={labelCls}>Active-panel state path</span>
				<input
					value={node.tabsKey ?? ''}
					oninput={(e) => store.setBuilderGroupTabsKey(id, e.currentTarget.value)}
					placeholder={`tabs.${id.slice(0, 6)}`}
					class={inputCls}
				/>
				<span class="mt-1 block text-[10px] text-ink-300">
					{node.presentation === 'sidebar'
						? 'Child groups become nav panels (their labels are the aside menu items).'
						: 'Child groups become tab panels (their labels are the tabs).'}
				</span>
			</label>
		{/if}

		{#if node.presentation === 'overlay' || node.presentation === 'menu'}
			{@const vw = node.visibleWhen}
			<div>
				<span class={labelCls}>Open while (state condition)</span>
				<input
					value={vw?.path ?? ''}
					oninput={(e) => setVis({ path: e.currentTarget.value })}
					placeholder="modal.open"
					class="{inputCls} mb-1"
				/>
				<div class="flex gap-1">
					<select
						value={vw?.op ?? 'truthy'}
						onchange={(e) => setVis({ op: e.currentTarget.value as AssertOp })}
						class={inputCls}
					>
						{#each ASSERT_OPS as o (o.code)}<option value={o.code}>{o.label}</option>{/each}
					</select>
					{#if vw && (vw.op === 'eq' || vw.op === 'neq')}
						<input
							value={vw.expected ?? ''}
							oninput={(e) => setVis({ expected: e.currentTarget.value })}
							placeholder="value"
							class={inputCls}
						/>
					{/if}
				</div>
				<span class="mt-1 block text-[10px] text-ink-300">
					{node.presentation === 'menu'
						? 'Toggle this state from the trigger; clicking outside (or an item) closes the menu.'
						: 'Toggle this state from a button to open/close the modal.'}
				</span>
			</div>
		{/if}

		{#if store.draft.components.length}
			<label class="block">
				<span class={labelCls}>Reuse component</span>
				<select
					value={node.componentId ?? ''}
					onchange={(e) => store.setBuilderGroupComponent(id, e.currentTarget.value || null)}
					class={inputCls}
				>
					<option value="">- none (own children) -</option>
					{#each store.draft.components as c (c.id)}<option value={c.id}>{c.name || 'Component'}</option>{/each}
				</select>
				<span class="mt-1 block text-[10px] text-ink-300">Renders that component's tree here - define once, reuse everywhere.</span>
			</label>
		{/if}
	</div>
</div>
