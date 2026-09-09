<script lang="ts">
	import { Icon } from '$ui/design-system';
	import {
		BUILDER_ELEMENT_KINDS,
		BIND_TARGET_KINDS,
		bindingSuggestions,
		TRANSITION_TRIGGERS,
		TRANSITION_EFFECTS,
		triggersFor,
		ASSERT_OPS,
		GATE_MODES,
		INPUT_TYPES,
		LIST_ROW_LAYOUTS,
		VALIDATION_KINDS,
		STATUS_VARIANTS,
		createVisibilityCondition,
		isFieldBuilderKind,
		isInteractiveBuilderKind,
		validationDescription,
		type BuilderElementNode,
		type BuilderElementKind,
		type BindTargetKind,
		type ElementAlign,
		type ElementImageFit,
		type ElementTextAlign,
		type ElementWidth,
		type ElementScenario,
		type ScenarioAssertion,
		type TransitionTrigger,
		type TransitionEffectKind,
		type CallSpec,
		type AssertOp,
		type GateMode,
		type InputType,
		type ListRowLayout,
		type ValidationKind
	} from '$domain/experience';
	import type { ExperienceStore } from '../draft-store.svelte';

	interface Role {
		id: string;
		name: string;
	}
	interface Props {
		store: ExperienceStore;
		node: BuilderElementNode;
		roles?: Role[];
	}
	let { store, node, roles = [] }: Props = $props();

	type Tab = 'appearance' | 'binding' | 'rules' | 'transitions' | 'scenarios' | 'persona';
	let tab = $state<Tab>('binding');

	const screens = $derived(store.draft.screens);
	const wiring = $derived(node.wiring);
	const interactive = $derived(isInteractiveBuilderKind(node.elementKind));
	// Real, authored values the user can bind to — so they pick instead of guess.
	const bindKind = $derived(wiring.binding?.targetKind ?? null);
	const bindSuggestions = $derived(bindKind ? bindingSuggestions(store.draft, bindKind) : []);
	const bindEmptyHint: Record<string, string> = {
		action: 'No actions yet - add API operations on a journey step (Events flow).',
		event: 'No events yet - add Event operations on a journey step (Events flow).',
		entity: 'No entities yet - list them in a step’s Data-consumed underlay.',
		state: 'No state paths yet - seed state below, or bind an input / add a Set-state flow.'
	};
	function setBindRef(ref: string) {
		if (!wiring.binding) return;
		store.setBuilderBinding(node.id, { targetKind: wiring.binding.targetKind, targetRef: ref });
	}
	// Inputs fire on type/Enter (change/submit); everything else on pointer (click/hover).
	const triggerCodes = $derived(triggersFor(node.elementKind));
	const triggerOptions = $derived(TRANSITION_TRIGGERS.filter((t) => triggerCodes.includes(t.code)));

	// Merge a partial into a transition's `call` config (creating it if absent).
	function patchCall(tid: string, patch: Partial<CallSpec>) {
		const tr = node.wiring.transitions.find((x) => x.id === tid);
		const prev = (tr?.effect.call ?? { label: 'Operation' }) as CallSpec;
		store.updateBuilderTransition(node.id, tid, {
			effect: { kind: 'call', target: '', ...tr?.effect, call: { ...prev, ...patch } }
		});
	}

	const appearance = $derived(node.appearance ?? {});
	const numberOrUndefined = (value: string) => (value.trim() === '' ? undefined : Number(value));
</script>

<div class="space-y-3">
	<!-- identity -->
	<div class="grid grid-cols-[1fr_auto] gap-2">
		<input
			value={node.label}
			oninput={(e) => store.renameBuilderNode(node.id, e.currentTarget.value)}
			placeholder="Element label"
			aria-label="Element label"
			class="min-w-0 rounded-field border border-line bg-surface px-2 py-1.5 text-xs font-semibold text-ink-800 outline-none focus:border-brand-300"
		/>
		<select
			value={node.elementKind}
			onchange={(e) => store.setBuilderElementKind(node.id, e.currentTarget.value as BuilderElementKind)}
			aria-label="Element kind"
			title="Element kind"
			class="min-w-0 rounded-field border border-line bg-surface px-1.5 py-1.5 text-xs text-ink-700"
		>
			{#each BUILDER_ELEMENT_KINDS as k (k.code)}
				<option value={k.code}>{k.label}</option>
			{/each}
		</select>
	</div>
	<p class="text-[10px] text-ink-400">
		Tip: labels render <span class="font-mono text-ink-500">{'{state.path}'}</span>,
		<span class="font-mono text-ink-500">{'{#Collection}'}</span> (count) and
		<span class="font-mono text-ink-500">{'{Collection.field}'}</span> (a record) live in Run mode.
	</p>

	{#if node.elementKind === 'status'}
		<!-- Feedback state: pair with the Gate tab's "Show only when" so it appears
		     at the right moment (e.g. spinner while loading, banner on error). -->
		<label class="flex items-center gap-2 text-[11px] text-ink-500">
			State
			<select
				value={node.variant ?? 'loading'}
				onchange={(e) => store.setBuilderElementVariant(node.id, e.currentTarget.value)}
				class="min-w-0 rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-700"
			>
				{#each STATUS_VARIANTS as o (o.code)}<option value={o.code}>{o.label}</option>{/each}
			</select>
			<span class="text-[10px] text-ink-400">pair with “Show only when”.</span>
		</label>
	{/if}

	{#if node.elementKind === 'button'}
		<label class="flex items-center gap-2 text-[11px] text-ink-500">
			Emphasis
			<select
				value={node.variant ?? ''}
				onchange={(e) => store.setBuilderElementVariant(node.id, e.currentTarget.value)}
				class="min-w-0 rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-700"
			>
				<option value="">Auto (by position)</option>
				<option value="primary">Primary</option>
				<option value="secondary">Secondary</option>
				<option value="ghost">Ghost</option>
			</select>
		</label>
	{/if}

	{#if node.elementKind === 'list'}
		{#if store.draft.components.length}
			<label class="block">
				<span class="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-ink-400">Row template</span>
				<select
					value={node.componentId ?? ''}
					onchange={(e) => store.setBuilderListTemplate(node.id, e.currentTarget.value || null)}
					class="w-full rounded-field border border-line bg-surface px-2 py-1.5 text-xs text-ink-700"
				>
					<option value="">- built-in row -</option>
					{#each store.draft.components as c (c.id)}<option value={c.id}>{c.name || 'Component'}</option>{/each}
				</select>
				<span class="mt-1 block text-[10px] text-ink-400">Renders this component per row; labels resolve <span class="font-mono">{'{Field}'}</span> from each record.</span>
			</label>
		{/if}
		<label class="block">
			<span class="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-ink-400">Search / filter by state</span>
			<input
				value={node.filterStatePath ?? ''}
				oninput={(e) => store.setBuilderListFilter(node.id, e.currentTarget.value)}
				placeholder="e.g. search.query"
				class="w-full rounded-field border border-line bg-surface px-2 py-1.5 text-xs text-ink-700 outline-none focus:border-brand-300"
			/>
			<span class="mt-1 block text-[10px] text-ink-400">Bind an input to the same path; the list shows only rows matching it (live).</span>
		</label>
		<div class="grid grid-cols-2 gap-2">
			<label class="block">
				<span class="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-ink-400">Row layout</span>
				<select
					value={node.rowLayout ?? 'stack'}
					onchange={(e) =>
						store.setBuilderListLayout(node.id, e.currentTarget.value as ListRowLayout, node.rowColumns)}
					class="w-full rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-700"
				>
					{#each LIST_ROW_LAYOUTS as o (o.code)}<option value={o.code}>{o.label}</option>{/each}
				</select>
			</label>
			{#if (node.rowLayout ?? 'stack') !== 'stack'}
				<label class="block">
					<span class="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-ink-400">Columns</span>
					<input
						type="number"
						min="1"
						max="4"
						value={node.rowColumns ?? 3}
						oninput={(e) =>
							store.setBuilderListLayout(
								node.id,
								node.rowLayout ?? 'grid',
								numberOrUndefined(e.currentTarget.value)
							)}
						class="w-full rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-700"
					/>
				</label>
			{/if}
		</div>
		<p class="text-[10px] text-ink-400">
			Per-row actions live in the row template: a button there acts on the row it is
			rendered in. Use <span class="font-mono text-ink-500">{'{Field}'}</span> in a Set-state
			value, or the “Select record” effect to publish the whole row to state.
		</p>
	{/if}

	{#if node.elementKind === 'select'}
		<label class="block">
			<span class="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-ink-400">Options (one per line)</span>
			<textarea
				rows="3"
				value={(node.options ?? []).join('\n')}
				oninput={(e) => store.setBuilderSelectOptions(node.id, e.currentTarget.value.split('\n'))}
				placeholder={'Slack\nGmail\nStripe'}
				class="w-full rounded-field border border-line bg-surface px-2 py-1.5 text-xs text-ink-700 outline-none focus:border-brand-300"
			></textarea>
		</label>
		<div class="grid grid-cols-2 gap-2">
			<label class="block">
				<span class="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-ink-400">…or from collection</span>
				<select
					value={node.optionsFrom?.collection ?? ''}
					onchange={(e) => store.setBuilderSelectSource(node.id, { collection: e.currentTarget.value })}
					class="w-full rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-700"
				>
					<option value="">- authored list -</option>
					{#each store.draft.builder.collections as c (c.id)}<option value={c.name}>{c.name || 'Collection'}</option>{/each}
				</select>
			</label>
			<label class="block">
				<span class="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-ink-400">Field</span>
				<input
					value={node.optionsFrom?.field ?? ''}
					oninput={(e) => store.setBuilderSelectSource(node.id, { field: e.currentTarget.value })}
					placeholder="name"
					class="w-full rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-700"
				/>
			</label>
		</div>
		{#if node.optionsFrom?.collection}
			<div class="grid grid-cols-2 gap-2">
				<label class="block">
					<span class="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-ink-400">Only rows where</span>
					<input
						value={node.optionsFrom?.filterField ?? ''}
						oninput={(e) => store.setBuilderSelectSource(node.id, { filterField: e.currentTarget.value })}
						placeholder="field, e.g. app"
						class="w-full rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-700"
					/>
				</label>
				<label class="block">
					<span class="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-ink-400">equals state</span>
					<input
						value={node.optionsFrom?.filterPath ?? ''}
						oninput={(e) => store.setBuilderSelectSource(node.id, { filterPath: e.currentTarget.value })}
						placeholder="editor.app"
						class="w-full rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-700"
					/>
				</label>
			</div>
			<p class="text-[10px] text-ink-400">Dependent picker: the choices narrow to the rows matching that state (e.g. only the connections of the chosen app).</p>
		{/if}
	{/if}

	<!-- wiring tabs -->
	<div class="flex gap-0.5 rounded-field border border-line bg-surface-sunken p-0.5 text-[11px]">
		{#each [{ id: 'appearance', l: 'Style' }, { id: 'binding', l: 'Bind' }, { id: 'rules', l: 'Rules' }, { id: 'transitions', l: 'Flow' }, { id: 'scenarios', l: 'Tests' }, { id: 'persona', l: 'Gate' }] as t (t.id)}
			<button
				type="button"
				onclick={() => (tab = t.id as Tab)}
				class="min-w-0 flex-1 truncate rounded-md px-1 py-1 font-semibold transition-colors {tab === t.id
					? 'bg-surface text-ink-900 shadow-sm'
					: 'text-ink-400 hover:text-ink-700'}">{t.l}</button
			>
		{/each}
	</div>

	{#if tab === 'appearance'}
		<div class="space-y-3">
			<div class="grid grid-cols-2 gap-2">
				<label class="block">
					<span class="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-ink-400">Width</span>
					<select
						value={appearance.width ?? 'auto'}
						onchange={(e) => store.setBuilderElementAppearance(node.id, { width: e.currentTarget.value as ElementWidth })}
						class="w-full rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-700"
					>
						<option value="auto">Auto</option><option value="full">Full</option><option value="fit">Fit content</option>
					</select>
				</label>
				<label class="block">
					<span class="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-ink-400">Align</span>
					<select
						value={appearance.align ?? 'auto'}
						onchange={(e) => store.setBuilderElementAppearance(node.id, { align: e.currentTarget.value as ElementAlign })}
						class="w-full rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-700"
					>
						<option value="auto">Auto</option><option value="start">Start</option><option value="center">Center</option><option value="end">End</option><option value="stretch">Stretch</option>
					</select>
				</label>
			</div>
			<div class="grid grid-cols-3 gap-2">
				<label class="block">
					<span class="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-ink-400">Text</span>
					<select
						value={appearance.textAlign ?? 'left'}
						onchange={(e) => store.setBuilderElementAppearance(node.id, { textAlign: e.currentTarget.value as ElementTextAlign })}
						class="w-full rounded border border-line bg-surface px-1 py-1 text-[11px] text-ink-700"
					>
						<option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
					</select>
				</label>
				<label class="block">
					<span class="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-ink-400">Size px</span>
					<input type="number" min="8" max="96" value={appearance.fontSize ?? ''} oninput={(e) => store.setBuilderElementAppearance(node.id, { fontSize: numberOrUndefined(e.currentTarget.value) })} class="w-full rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-700" />
				</label>
				<label class="block">
					<span class="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-ink-400">Weight</span>
					<input type="number" min="100" max="900" step="100" value={appearance.fontWeight ?? ''} oninput={(e) => store.setBuilderElementAppearance(node.id, { fontWeight: numberOrUndefined(e.currentTarget.value) })} class="w-full rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-700" />
				</label>
			</div>
			<div class="grid grid-cols-2 gap-2">
				{#each [{ key: 'color', label: 'Text color' }, { key: 'background', label: 'Background' }, { key: 'borderColor', label: 'Border' }] as c (c.key)}
					<label class="block">
						<span class="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-ink-400">{c.label}</span>
						<input
							value={appearance[c.key as 'color' | 'background' | 'borderColor'] ?? ''}
							oninput={(e) => store.setBuilderElementAppearance(node.id, { [c.key]: e.currentTarget.value || undefined })}
							placeholder="#RRGGBB"
							class="w-full rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-700"
						/>
					</label>
				{/each}
			</div>
			<div class="grid grid-cols-3 gap-2">
				{#each [{ key: 'radius', label: 'Radius' }, { key: 'paddingX', label: 'Pad X' }, { key: 'paddingY', label: 'Pad Y' }] as c (c.key)}
					<label class="block">
						<span class="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-ink-400">{c.label}</span>
						<input type="number" min="0" max="96" value={appearance[c.key as 'radius' | 'paddingX' | 'paddingY'] ?? ''} oninput={(e) => store.setBuilderElementAppearance(node.id, { [c.key]: numberOrUndefined(e.currentTarget.value) })} class="w-full rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-700" />
					</label>
				{/each}
			</div>
			<div class="grid grid-cols-2 gap-2">
				<label class="block">
					<span class="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-ink-400">Border px</span>
					<input type="number" min="0" max="12" value={appearance.borderWidth ?? ''} oninput={(e) => store.setBuilderElementAppearance(node.id, { borderWidth: numberOrUndefined(e.currentTarget.value) })} class="w-full rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-700" />
				</label>
				<label class="block">
					<span class="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-ink-400">Opacity</span>
					<input type="number" min="0" max="1" step="0.05" value={appearance.opacity ?? ''} oninput={(e) => store.setBuilderElementAppearance(node.id, { opacity: numberOrUndefined(e.currentTarget.value) })} class="w-full rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-700" />
				</label>
			</div>
			<label class="flex items-center gap-2 text-[11px] text-ink-600">
				<input type="checkbox" checked={appearance.shadow ?? false} onchange={(e) => store.setBuilderElementAppearance(node.id, { shadow: e.currentTarget.checked || undefined })} />
				Drop shadow
			</label>
			{#if node.elementKind === 'image'}
				<div class="space-y-2 border-t border-line pt-3">
					<label class="block">
						<span class="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-ink-400">Image source</span>
						<input value={node.media?.src ?? ''} oninput={(e) => store.setBuilderElementMedia(node.id, { src: e.currentTarget.value })} placeholder="/assets/hero.png or data:image/…" class="w-full rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-700" />
						<span class="mt-1 block text-[10px] text-ink-400">Prefer bundled or uploaded assets for air-gapped deployments.</span>
					</label>
					<input value={node.media?.alt ?? ''} oninput={(e) => store.setBuilderElementMedia(node.id, { alt: e.currentTarget.value })} placeholder="Alternative text" class="w-full rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-700" />
					<div class="grid grid-cols-2 gap-2">
						<select value={node.media?.fit ?? 'cover'} onchange={(e) => store.setBuilderElementMedia(node.id, { fit: e.currentTarget.value as ElementImageFit })} class="rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-700">
							<option value="cover">Cover</option><option value="contain">Contain</option><option value="fill">Fill</option>
						</select>
						<input value={node.media?.aspectRatio ?? ''} oninput={(e) => store.setBuilderElementMedia(node.id, { aspectRatio: e.currentTarget.value || undefined })} placeholder="16 / 9" class="rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-700" />
					</div>
				</div>
			{/if}
		</div>
	{:else if tab === 'binding'}
		<!-- Binding ─────────────────────────────────────────────── -->
		<div class="space-y-2">
			<p class="text-[10px] uppercase tracking-widest text-ink-400">Binds to</p>
			<select
				value={wiring.binding?.targetKind ?? ''}
				onchange={(e) =>
					store.setBuilderBinding(
						node.id,
						e.currentTarget.value
							? { targetKind: e.currentTarget.value as BindTargetKind, targetRef: wiring.binding?.targetRef ?? '' }
							: null
					)}
				class="w-full rounded-field border border-line bg-surface px-2 py-1.5 text-xs text-ink-700"
			>
				<option value="">- not bound -</option>
				{#each BIND_TARGET_KINDS as k (k.code)}
					<option value={k.code}>{k.label}</option>
				{/each}
			</select>
			{#if wiring.binding}
				{#if wiring.binding.targetKind === 'surface'}
					<select
						value={wiring.binding.targetRef}
						onchange={(e) =>
							store.setBuilderBinding(node.id, { targetKind: 'surface', targetRef: e.currentTarget.value })}
						class="w-full rounded-field border border-line bg-surface px-2 py-1.5 text-xs text-ink-700"
					>
						<option value="">- pick screen -</option>
						{#each screens as s (s.id)}
							<option value={s.id}>{s.name || 'Untitled screen'}</option>
						{/each}
					</select>
				{:else}
					<input
						value={wiring.binding.targetRef}
						oninput={(e) => setBindRef(e.currentTarget.value)}
						list={`bind-${node.id}`}
						placeholder={wiring.binding.targetKind === 'state'
							? 'pick or type a state path - e.g. cart.itemCount'
							: 'pick from the list or type a new one'}
						class="w-full rounded-field border border-line bg-surface px-2 py-1.5 text-xs text-ink-700 outline-none focus:border-brand-300"
					/>
					<datalist id={`bind-${node.id}`}>
						{#each bindSuggestions as s (s.value)}
							<option value={s.value}>{s.hint}</option>
						{/each}
					</datalist>
					{#if bindSuggestions.length > 0}
						<div class="flex flex-wrap gap-1">
							{#each bindSuggestions as s (s.value)}
								{@const on = wiring.binding.targetRef === s.value}
								<button
									type="button"
									onclick={() => setBindRef(s.value)}
									title={s.hint}
									class="max-w-full truncate rounded-pill border px-2 py-0.5 text-[10px] font-medium transition-colors {on
										? 'border-brand-300 bg-brand-50 text-brand-600'
										: 'border-line bg-surface text-ink-500 hover:text-ink-800'}"
								>
									{s.value}
								</button>
							{/each}
						</div>
					{:else}
						<p class="text-[10px] italic text-ink-400">
							{bindEmptyHint[wiring.binding.targetKind] ?? 'Type a name or id to bind to.'}
						</p>
					{/if}
				{/if}
			{/if}
			{#if !interactive}
				<p class="text-[10px] italic text-ink-400">
					{node.elementKind} elements are display-only; bindings still help downstream specs.
				</p>
			{/if}
		</div>
	{:else if tab === 'transitions'}
		<!-- Transitions ─────────────────────────────────────────── -->
		<div class="space-y-2">
			{#each wiring.transitions as t (t.id)}
				<div class="space-y-1.5 rounded-card border border-line bg-surface-sunken/40 p-2">
					<div class="flex items-center gap-1.5">
						<select
							value={t.trigger}
							onchange={(e) =>
								store.updateBuilderTransition(node.id, t.id, {
									trigger: e.currentTarget.value as TransitionTrigger
								})}
							class="min-w-0 flex-1 rounded border border-line bg-surface px-1 py-0.5 text-[11px] text-ink-700"
						>
							{#each triggerOptions as o (o.code)}
								<option value={o.code}>{o.label}</option>
							{/each}
						</select>
						<select
							value={t.effect.kind}
							onchange={(e) =>
								store.updateBuilderTransition(node.id, t.id, {
									effect: { ...t.effect, kind: e.currentTarget.value as TransitionEffectKind }
								})}
							class="min-w-0 flex-1 rounded border border-line bg-surface px-1 py-0.5 text-[11px] text-ink-700"
						>
							{#each TRANSITION_EFFECTS as o (o.code)}
								<option value={o.code}>{o.label}</option>
							{/each}
						</select>
						<button
							type="button"
							onclick={() => store.removeBuilderTransition(node.id, t.id)}
							class="ml-auto text-ink-300 hover:text-danger-500"><Icon name="x" size={13} /></button
						>
					</div>
					{#if t.effect.kind === 'navigate'}
						<select
							value={t.effect.target}
							onchange={(e) =>
								store.updateBuilderTransition(node.id, t.id, {
									effect: { ...t.effect, target: e.currentTarget.value }
								})}
							class="w-full rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-700"
						>
							<option value="">- target screen -</option>
							{#each screens as s (s.id)}
								<option value={s.id}>{s.name || 'Untitled screen'}</option>
							{/each}
						</select>
					{:else if t.effect.kind === 'createRecord'}
						<select
							value={t.effect.target}
							onchange={(e) =>
								store.updateBuilderTransition(node.id, t.id, {
									effect: { ...t.effect, target: e.currentTarget.value }
								})}
							class="w-full rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-700"
						>
							<option value="">- target collection -</option>
							{#each store.draft.builder.collections as c (c.id)}
								<option value={c.name}>{c.name || 'Untitled collection'}</option>
							{/each}
						</select>
						<p class="text-[10px] italic text-ink-400">
							Appends a row to this collection from the screen's inputs (matched to fields by label);
							other fields get fake data. Persists across navigation.
						</p>
					{:else if t.effect.kind === 'selectRecord'}
						<input
							value={t.effect.target}
							oninput={(e) =>
								store.updateBuilderTransition(node.id, t.id, {
									effect: { ...t.effect, target: e.currentTarget.value }
								})}
							placeholder="state prefix, e.g. selected.app"
							class="w-full rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-700 outline-none"
						/>
						<p class="text-[10px] italic text-ink-400">
							Publishes the clicked row under this prefix: every field becomes
							<span class="font-mono">{'{prefix.field}'}</span>, readable on any screen. Only fires
							inside a list row template.
						</p>
					{:else if t.effect.kind === 'navigateBack'}
						<p class="text-[10px] italic text-ink-400">
							Returns to the previous screen (run-mode history). No target needed.
						</p>
					{:else if t.effect.kind === 'call'}
						{@const c = t.effect.call}
						<div class="space-y-1.5">
							<input
								value={c?.label ?? ''}
								oninput={(e) => patchCall(t.id, { label: e.currentTarget.value })}
								placeholder="Operation label (e.g. Load expenses)"
								class="w-full rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-700 outline-none"
							/>
							<div class="grid grid-cols-2 gap-1.5">
								<input
									value={c?.endpoint ?? ''}
									oninput={(e) => patchCall(t.id, { endpoint: e.currentTarget.value })}
									placeholder="endpoint (GET /api/…)"
									class="w-full min-w-0 rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-700 outline-none"
								/>
								<input
									type="number"
									value={c?.latencyMs ?? ''}
									oninput={(e) => patchCall(t.id, { latencyMs: Number(e.currentTarget.value) || 0 })}
									placeholder="latency ms (600)"
									class="w-full min-w-0 rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-700 outline-none"
								/>
							</div>
							<div class="grid grid-cols-2 gap-1.5">
								<input
									value={c?.loadingPath ?? ''}
									oninput={(e) => patchCall(t.id, { loadingPath: e.currentTarget.value })}
									placeholder="loading state path"
									class="w-full min-w-0 rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-700 outline-none"
								/>
								<select
									value={c?.outcome ?? 'success'}
									onchange={(e) => patchCall(t.id, { outcome: e.currentTarget.value as 'success' | 'error' })}
									class="w-full min-w-0 rounded border border-line bg-surface px-1 py-1 text-[11px] text-ink-700"
								>
									<option value="success">resolves: success</option>
									<option value="error">resolves: error</option>
								</select>
							</div>
							{#if (c?.outcome ?? 'success') === 'error'}
								<input
									value={c?.errorPath ?? ''}
									oninput={(e) => patchCall(t.id, { errorPath: e.currentTarget.value })}
									placeholder="error state path (set truthy on failure)"
									class="w-full rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-700 outline-none"
								/>
							{:else}
								<div class="grid grid-cols-2 gap-1.5">
									<input
										value={c?.resultPath ?? ''}
										oninput={(e) => patchCall(t.id, { resultPath: e.currentTarget.value })}
										placeholder="result state path"
										class="w-full min-w-0 rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-700 outline-none"
									/>
									<input
										value={c?.resultValue ?? ''}
										oninput={(e) => patchCall(t.id, { resultValue: e.currentTarget.value })}
										placeholder="result value (default true)"
										class="w-full min-w-0 rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-700 outline-none"
									/>
								</div>
							{/if}
							<p class="text-[10px] italic text-ink-400">
								Runs async in Run mode: loading → (latency) → result/error. Gate a “Status” element on the loading/error path to show a spinner / error.
							</p>
						</div>
					{:else}
						<!-- state effects: setState / toggleState / incrementState -->
						<div class="grid {t.effect.kind === 'toggleState' ? 'grid-cols-1' : 'grid-cols-2'} gap-1.5">
							<input
								value={t.effect.target}
								oninput={(e) =>
									store.updateBuilderTransition(node.id, t.id, {
										effect: { ...t.effect, target: e.currentTarget.value }
									})}
								placeholder={t.effect.kind === 'print' ? 'log path: cli.log' : 'state path: menu.open'}
								aria-label={t.effect.kind === 'print' ? 'Log state path' : 'State path to write'}
								class="w-full min-w-0 rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-700 outline-none"
							/>
							{#if t.effect.kind !== 'toggleState'}
								<input
									value={t.effect.value ?? ''}
									oninput={(e) =>
										store.updateBuilderTransition(node.id, t.id, {
											effect: { ...t.effect, value: e.currentTarget.value }
										})}
									placeholder={t.effect.kind === 'incrementState' ? 'step (e.g. 1)' : 'value'}
									aria-label={t.effect.kind === 'incrementState' ? 'Increment step' : 'Value to set'}
									class="w-full min-w-0 rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-700 outline-none"
								/>
							{/if}
						</div>
					{/if}

					<!-- Branch guard: run this effect only while a state condition holds.
					     Two transitions on one trigger with opposite guards = if/else. -->
					{#if t.when}
						{@const w = t.when}
						<div class="flex items-center gap-1 border-t border-line/60 pt-1.5">
							<span class="text-[9px] font-bold uppercase tracking-wider text-ink-400">only if</span>
							<input
								value={w.path}
								oninput={(e) =>
									store.updateBuilderTransition(node.id, t.id, { when: { ...w, path: e.currentTarget.value } })}
								placeholder="state path"
								aria-label="Guard state path"
								class="min-w-0 flex-1 rounded border border-line bg-surface px-1 py-0.5 text-[10px] text-ink-700 outline-none"
							/>
							<select
								value={w.op}
								onchange={(e) =>
									store.updateBuilderTransition(node.id, t.id, { when: { ...w, op: e.currentTarget.value as AssertOp } })}
								aria-label="Guard operator"
								class="rounded border border-line bg-surface px-0.5 py-0.5 text-[10px] text-ink-700"
							>
								{#each ASSERT_OPS as o (o.code)}<option value={o.code}>{o.label}</option>{/each}
							</select>
							{#if w.op === 'eq' || w.op === 'neq'}
								<input
									value={w.expected ?? ''}
									oninput={(e) =>
										store.updateBuilderTransition(node.id, t.id, { when: { ...w, expected: e.currentTarget.value } })}
									placeholder="val"
									aria-label="Guard value"
									class="w-12 shrink-0 rounded border border-line bg-surface px-1 py-0.5 text-[10px] text-ink-700 outline-none"
								/>
							{/if}
							<button
								type="button"
								onclick={() => store.updateBuilderTransition(node.id, t.id, { when: undefined })}
								aria-label="Remove guard"
								class="text-ink-300 hover:text-danger-500"><Icon name="x" size={11} /></button
							>
						</div>
					{:else}
						<button
							type="button"
							onclick={() => store.updateBuilderTransition(node.id, t.id, { when: createVisibilityCondition() })}
							class="text-[10px] font-semibold text-brand-500 hover:text-brand-600">+ guard (if/else)</button
						>
					{/if}
				</div>
			{/each}
			<button
				type="button"
				onclick={() => store.addBuilderTransition(node.id)}
				class="w-full rounded-field border border-dashed border-line py-1.5 text-[11px] font-semibold text-ink-400 hover:border-brand-300 hover:text-brand-600"
			>
				+ Transition
			</button>
		</div>
	{:else if tab === 'scenarios'}
		<!-- Scenarios ───────────────────────────────────────────── -->
		<div class="space-y-2">
			{#each wiring.scenarios as sc (sc.id)}
				<div class="space-y-2 rounded-card border border-line bg-surface-sunken/40 p-2">
					<div class="flex items-center gap-1.5">
						<input
							value={sc.title}
							oninput={(e) => store.updateBuilderScenario(node.id, sc.id, { title: e.currentTarget.value })}
							placeholder="Scenario title"
							class="min-w-0 flex-1 rounded border border-line bg-surface px-1.5 py-1 text-[11px] font-semibold text-ink-800 outline-none"
						/>
						<button
							type="button"
							onclick={() => store.removeBuilderScenario(node.id, sc.id)}
							class="text-ink-300 hover:text-danger-500"><Icon name="x" size={13} /></button
						>
					</div>
					<label class="flex items-center gap-1.5 text-[10px] text-ink-500">
						When
						<select
							value={sc.whenTrigger}
							onchange={(e) =>
								store.updateBuilderScenario(node.id, sc.id, {
									whenTrigger: e.currentTarget.value as ElementScenario['whenTrigger']
								})}
							class="min-w-0 flex-1 rounded border border-line bg-surface px-1 py-0.5 text-[11px] text-ink-700"
						>
							<option value="click">click</option>
							<option value="hover">hover</option>
							<option value="submit">submit</option>
						</select>
					</label>
					{#each [{ side: 'given', label: 'Given' }, { side: 'then', label: 'Then' }] as grp (grp.side)}
						{@const list = (sc[grp.side as 'given' | 'then'] as ScenarioAssertion[])}
						<div class="space-y-1">
							<p class="text-[9px] font-bold uppercase tracking-wider text-ink-400">{grp.label}</p>
							{#each list as a (a.id)}
								<div class="flex items-center gap-1">
									<input
										value={a.path}
										oninput={(e) =>
											store.updateScenarioAssertion(node.id, sc.id, grp.side as 'given' | 'then', a.id, {
												path: e.currentTarget.value
											})}
										placeholder="state path"
										class="w-20 shrink-0 rounded border border-line bg-surface px-1 py-0.5 text-[10px] text-ink-700 outline-none"
									/>
									<select
										value={a.op}
										onchange={(e) =>
											store.updateScenarioAssertion(node.id, sc.id, grp.side as 'given' | 'then', a.id, {
												op: e.currentTarget.value as AssertOp
											})}
										class="rounded border border-line bg-surface px-0.5 py-0.5 text-[10px] text-ink-700"
									>
										{#each ASSERT_OPS as o (o.code)}
											<option value={o.code}>{o.label}</option>
										{/each}
									</select>
									{#if a.op === 'eq' || a.op === 'neq'}
										<input
											value={a.expected ?? ''}
											oninput={(e) =>
												store.updateScenarioAssertion(node.id, sc.id, grp.side as 'given' | 'then', a.id, {
													expected: e.currentTarget.value
												})}
											placeholder="val"
											class="w-12 shrink-0 rounded border border-line bg-surface px-1 py-0.5 text-[10px] text-ink-700 outline-none"
										/>
									{/if}
									<input
										value={a.message}
										oninput={(e) =>
											store.updateScenarioAssertion(node.id, sc.id, grp.side as 'given' | 'then', a.id, {
												message: e.currentTarget.value
											})}
										placeholder="error message"
										class="min-w-0 flex-1 rounded border border-line bg-surface px-1 py-0.5 text-[10px] text-ink-700 outline-none"
									/>
									<button
										type="button"
										onclick={() =>
											store.removeScenarioAssertion(node.id, sc.id, grp.side as 'given' | 'then', a.id)}
										class="text-ink-300 hover:text-danger-500"><Icon name="x" size={11} /></button
									>
								</div>
							{/each}
							<button
								type="button"
								onclick={() => store.addScenarioAssertion(node.id, sc.id, grp.side as 'given' | 'then')}
								class="text-[10px] font-semibold text-brand-500 hover:text-brand-600">+ {grp.label}</button
							>
						</div>
					{/each}
				</div>
			{/each}
			<button
				type="button"
				onclick={() => store.addBuilderScenario(node.id)}
				class="w-full rounded-field border border-dashed border-line py-1.5 text-[11px] font-semibold text-ink-400 hover:border-brand-300 hover:text-brand-600"
			>
				+ Scenario
			</button>
		</div>
	{:else if tab === 'rules'}
		<!-- Input type + validation rules / submit guard ─────────── -->
		<div class="space-y-2">
			{#if isFieldBuilderKind(node.elementKind)}
				{#if node.elementKind === 'input'}
					<label class="flex items-center gap-2 text-[11px] text-ink-500">
						Input type
						<select
							value={wiring.inputType ?? 'text'}
							onchange={(e) => store.setBuilderInputType(node.id, e.currentTarget.value as InputType)}
							class="min-w-0 rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-700"
						>
							{#each INPUT_TYPES as o (o.code)}
								<option value={o.code}>{o.label}</option>
							{/each}
						</select>
					</label>
				{/if}
				<p class="text-[10px] uppercase tracking-widest text-ink-400">Validation rules</p>
				{#each wiring.validations as v (v.id)}
					<div class="space-y-1 rounded-card border border-line bg-surface-sunken/40 p-2">
						<div class="flex items-center gap-1.5">
							<select
								value={v.kind}
								onchange={(e) =>
									store.updateBuilderValidation(node.id, v.id, {
										kind: e.currentTarget.value as ValidationKind
									})}
								class="min-w-0 flex-1 rounded border border-line bg-surface px-1 py-0.5 text-[11px] text-ink-700"
							>
								{#each VALIDATION_KINDS as o (o.code)}
									<option value={o.code}>{o.label}</option>
								{/each}
							</select>
							{#if v.kind === 'min' || v.kind === 'max' || v.kind === 'pattern'}
								<input
									value={v.param ?? ''}
									oninput={(e) => store.updateBuilderValidation(node.id, v.id, { param: e.currentTarget.value })}
									placeholder={v.kind === 'pattern' ? 'regex' : 'length'}
									class="w-16 rounded border border-line bg-surface px-1 py-0.5 text-[11px] text-ink-700 outline-none"
								/>
							{/if}
							<button
								type="button"
								onclick={() => store.removeBuilderValidation(node.id, v.id)}
								class="ml-auto text-ink-300 hover:text-danger-500"><Icon name="x" size={13} /></button
							>
						</div>
						<label class="block space-y-1">
							<span class="text-[10px] font-semibold uppercase tracking-wide text-ink-400"
								>Description</span
							>
							<textarea
								value={v.description || validationDescription(v.kind, v.param, node.label)}
								oninput={(e) =>
									store.updateBuilderValidation(node.id, v.id, {
										description: e.currentTarget.value
									})}
								placeholder={validationDescription(v.kind, v.param, node.label)}
								rows="2"
								class="w-full resize-none rounded border border-line bg-surface px-1.5 py-1 text-[11px] leading-snug text-ink-700 outline-none"
							></textarea>
						</label>
						<input
							value={v.message}
							oninput={(e) => store.updateBuilderValidation(node.id, v.id, { message: e.currentTarget.value })}
							placeholder="Error message"
							class="w-full rounded border border-line bg-surface px-1.5 py-0.5 text-[11px] text-ink-700 outline-none"
						/>
					</div>
				{/each}
				<button
					type="button"
					onclick={() => store.addBuilderValidation(node.id)}
					class="w-full rounded-field border border-dashed border-line py-1.5 text-[11px] font-semibold text-ink-400 hover:border-brand-300 hover:text-brand-600"
				>
					+ Rule
				</button>
			{/if}
			{#if interactive}
				<label class="flex items-center gap-2 pt-1 text-[11px] text-ink-600">
					<input
						type="checkbox"
						checked={wiring.requireValid ?? false}
						onchange={(e) => store.setBuilderRequireValid(node.id, e.currentTarget.checked)}
					/>
					Block this action until the screen's inputs are valid
				</label>
			{/if}
			{#if node.elementKind !== 'input' && !interactive}
				<p class="text-[11px] italic text-ink-400">Validation rules apply to inputs and buttons.</p>
			{/if}
		</div>
	{:else}
		<!-- Gate: state-driven visibility + persona gating ───────── -->
		<div class="space-y-3">
		<!-- State-driven visibility (persona-independent) -->
		<div class="space-y-1.5">
			<p class="text-[10px] uppercase tracking-widest text-ink-400">Show only when</p>
			{#if wiring.visibleWhen}
				{@const cond = wiring.visibleWhen}
				<div class="flex items-center gap-1">
					<input
						value={cond.path}
						oninput={(e) => store.setBuilderVisibility(node.id, { ...cond, path: e.currentTarget.value })}
						placeholder="state path"
						aria-label="Visibility state path"
						class="min-w-0 flex-1 rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-700 outline-none"
					/>
					<select
						value={cond.op}
						onchange={(e) =>
							store.setBuilderVisibility(node.id, { ...cond, op: e.currentTarget.value as AssertOp })}
						aria-label="Visibility comparison operator"
						class="rounded border border-line bg-surface px-0.5 py-1 text-[11px] text-ink-700"
					>
						{#each ASSERT_OPS as o (o.code)}
							<option value={o.code}>{o.label}</option>
						{/each}
					</select>
					{#if cond.op === 'eq' || cond.op === 'neq'}
						<input
							value={cond.expected ?? ''}
							oninput={(e) =>
								store.setBuilderVisibility(node.id, { ...cond, expected: e.currentTarget.value })}
							placeholder="val"
							aria-label="Visibility comparison value"
							class="w-12 shrink-0 rounded border border-line bg-surface px-1 py-1 text-[11px] text-ink-700 outline-none"
						/>
					{/if}
					<button
						type="button"
						onclick={() => store.setBuilderVisibility(node.id, null)}
						aria-label="Clear visibility condition"
						class="text-ink-300 hover:text-danger-500"><Icon name="x" size={13} /></button
					>
				</div>
				<p class="text-[10px] italic text-ink-400">
					Hidden in Run mode until this state holds - pair with a Set/Toggle state effect.
				</p>
			{:else}
				<button
					type="button"
					onclick={() => store.addBuilderVisibility(node.id)}
					class="w-full rounded-field border border-dashed border-line py-1.5 text-[11px] font-semibold text-ink-400 hover:border-brand-300 hover:text-brand-600"
				>
					+ Visibility condition
				</button>
			{/if}
		</div>

		<!-- Persona gating ──────────────────────────────────────── -->
		<div class="space-y-2">
			{#if roles.length === 0}
				<p class="text-[11px] text-ink-400">Author roles in Users &amp; Permissions to gate this element by persona.</p>
			{:else}
				{#if store.capabilityAccess.length > 0}
					<!-- Prefill the persona set from a Step-03 capability's granted roles. -->
					<label class="flex items-center gap-1.5 text-[10px] text-ink-400">
						Prefill from permission
						<select
							value=""
							onchange={(e) => {
								if (e.currentTarget.value) store.applyCapabilityGate(node.id, e.currentTarget.value);
								e.currentTarget.value = '';
							}}
							class="min-w-0 flex-1 rounded border border-line bg-surface px-1.5 py-0.5 text-[11px] text-ink-700"
						>
							<option value="">- pick a capability -</option>
							{#each store.capabilityAccess as cap (cap.id)}
								<option value={cap.id}>{cap.label} ({cap.roleIds.length})</option>
							{/each}
						</select>
					</label>
				{/if}
				<div class="flex items-center gap-1.5">
					<select
						value={wiring.gate?.mode ?? 'visible'}
						onchange={(e) =>
							store.setBuilderGate(node.id, {
								personaIds: wiring.gate?.personaIds ?? [],
								mode: e.currentTarget.value as GateMode,
								allow: wiring.gate?.allow ?? true
							})}
						class="min-w-0 flex-1 rounded border border-line bg-surface px-1 py-1 text-[11px] text-ink-700"
					>
						{#each GATE_MODES as o (o.code)}
							<option value={o.code}>{o.label}</option>
						{/each}
					</select>
					<button
						type="button"
						onclick={() =>
							store.setBuilderGate(node.id, {
								personaIds: wiring.gate?.personaIds ?? [],
								mode: wiring.gate?.mode ?? 'visible',
								allow: !(wiring.gate?.allow ?? true)
							})}
						class="rounded border border-line px-2 py-1 text-[11px] font-semibold text-ink-600 hover:bg-surface-sunken"
					>
						{wiring.gate?.allow ?? true ? 'only these' : 'all except'}
					</button>
					{#if wiring.gate}
						<button
							type="button"
							onclick={() => store.setBuilderGate(node.id, null)}
							class="ml-auto text-[10px] text-ink-400 hover:text-danger-500">clear</button
						>
					{/if}
				</div>
				<div class="flex flex-wrap gap-1">
					{#each roles as role (role.id)}
						{@const on = wiring.gate?.personaIds.includes(role.id) ?? false}
						<button
							type="button"
							onclick={() => store.toggleBuilderGatePersona(node.id, role.id)}
							class="rounded-pill border px-2 py-0.5 text-[10px] font-medium transition-colors {on
								? 'border-brand-300 bg-brand-50 text-brand-600'
								: 'border-line bg-surface text-ink-400 hover:text-ink-700'}"
						>
							{role.name || 'role'}
						</button>
					{/each}
				</div>
				<p class="text-[10px] italic text-ink-400">
					In Run mode, pick "Run as" a persona to see gating apply.
				</p>
			{/if}
		</div>
		</div>
	{/if}
</div>
