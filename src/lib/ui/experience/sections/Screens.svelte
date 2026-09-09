<script lang="ts">
	import { Button, Icon } from '$ui/design-system';
	import {
		screenPath,
		DEVICES,
		HEADER_SURFACE_ID,
		FOOTER_SURFACE_ID,
		type LibraryScreen,
		type DeviceKind
	} from '$domain/experience';
	import type { ExperienceStore } from '../draft-store.svelte';
	import Builder from '../builder/Builder.svelte';
	import Runner from '../builder/Runner.svelte';

	interface Role {
		id: string;
		name: string;
	}
	interface Props {
		store: ExperienceStore;
		roles?: Role[];
	}
	let { store, roles = [] }: Props = $props();

	let selectedId = $state<string | null>(null);
	let running = $state(false);
	let runStart = $state<string | null>(null);

	function startRun(fromScreenId: string | null) {
		runStart = fromScreenId;
		running = true;
	}

	const screens = $derived(store.draft.screens);

	// The app shell (header/footer drawn around every screen in Run mode) is
	// edited in the SAME switcher + designer as screens — one editor, no side panel.
	const SHELL_PARTS = [
		{ id: HEADER_SURFACE_ID, part: 'header' as const, label: 'Header' },
		{ id: FOOTER_SURFACE_ID, part: 'footer' as const, label: 'Footer' }
	];
	const selectedShell = $derived(SHELL_PARTS.find((p) => p.id === selectedId) ?? null);
	const shellOn = $derived(
		selectedShell
			? selectedShell.part === 'header'
				? store.draft.builder.shell.headerEnabled
				: store.draft.builder.shell.footerEnabled
			: false
	);
	const shellPartOn = (part: 'header' | 'footer') =>
		part === 'header' ? store.draft.builder.shell.headerEnabled : store.draft.builder.shell.footerEnabled;

	const selected = $derived<LibraryScreen | null>(
		screens.find((s) => s.id === selectedId) ?? null
	);

	// Open straight into the designer: a deep-linked screen wins (consumed once so
	// it never fights a later manual choice), else the entry screen, else the first.
	$effect(() => {
		const focus = store.focusScreenId;
		if (focus && screens.some((s) => s.id === focus)) {
			selectedId = focus;
			store.focusScreenId = null;
			return;
		}
		if (selectedId === null && screens.length > 0) {
			const entry = store.draft.builder.entryScreenId;
			selectedId = entry && screens.some((s) => s.id === entry) ? entry : screens[0].id;
		}
	});

	// Screens grouped by category for the compact switcher dropdown.
	const screenGroups = $derived.by(() => {
		const groups = new Map<string, LibraryScreen[]>();
		for (const s of screens) {
			const cat = s.category?.trim() || 'Uncategorized';
			const list = groups.get(cat) ?? [];
			list.push(s);
			groups.set(cat, list);
		}
		return [...groups.entries()]
			.sort((a, b) => a[0].localeCompare(b[0]))
			.map(([category, scr]) => ({
				category,
				screens: [...scr].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
			}));
	});

	const linkCount = (screenId: string) =>
		store.draft.steps.filter((st) => st.linkedScreenId === screenId).length;

	function addScreen() {
		selectedId = store.addScreen({ name: 'New screen' });
	}

	// Picking a template records the inheritance link; if the screen is still
	// empty we apply the layout immediately (nothing to overwrite).
	function chooseTemplate(screenId: string, templateId: string | null) {
		store.updateScreen(screenId, 'templateId', templateId);
		if (templateId && store.isSurfaceEmpty(screenId)) store.applyTemplateToScreen(screenId, templateId);
	}

	// Re-apply on demand — guarded by a confirm when it would overwrite real work.
	function applyTemplateNow(screenId: string, templateId: string | null) {
		if (!templateId) return;
		if (
			!store.isSurfaceEmpty(screenId) &&
			!confirm("Replace this screen's current layout with the template? This can't be undone.")
		)
			return;
		store.applyTemplateToScreen(screenId, templateId);
	}

	// Templates are edited in the Components tab; saving here only captures one.
	function saveAsTemplate(screenId: string, currentName: string) {
		const name = prompt('Name this template', `${currentName || 'Screen'} template`);
		if (name === null) return;
		store.saveScreenAsTemplate(screenId, name);
	}
</script>

{#if running}
	<Runner {store} {roles} startScreenId={runStart} onClose={() => (running = false)} />
{:else}
	<div class="space-y-3">
		{#if screens.length === 0}
			<div class="rounded-card border border-dashed border-line px-4 py-10 text-center">
				<p class="text-xs text-ink-400">
					No screen yet. Add one - screens are the UI canvases your journey steps link to.
				</p>
				<Button variant="outline" size="sm" class="mt-3" onclick={addScreen}>
					<Icon name="plus" size={14} /> Screen
				</Button>
			</div>
		{:else}
			<!-- ONE bar: switch the surface, rename it, tune its meta, run — all together. -->
			<div class="flex flex-wrap items-center gap-2 rounded-card border border-line bg-surface px-3 py-2">
				<span class="grid size-7 shrink-0 place-items-center rounded-lg bg-accent-50 text-accent-600">
					<Icon name={selectedShell ? 'layers' : 'monitor'} size={14} />
				</span>
				<select
					value={selectedId ?? ''}
					onchange={(e) => (selectedId = e.currentTarget.value || null)}
					aria-label="Surface to edit"
					class="min-w-44 rounded-field border border-line bg-surface px-2 py-1.5 text-xs font-semibold text-ink-800 outline-none focus:border-brand-300"
				>
					{#each screenGroups as g (g.category)}
						<optgroup label={g.category}>
							{#each g.screens as s (s.id)}
								<option value={s.id}>
									{s.name || 'Untitled'}{linkCount(s.id) > 0 ? ` · ${linkCount(s.id)} link${linkCount(s.id) === 1 ? '' : 's'}` : ''}
								</option>
							{/each}
						</optgroup>
					{/each}
					<optgroup label="App shell (every screen)">
						{#each SHELL_PARTS as p (p.id)}
							<option value={p.id}>{p.label}{shellPartOn(p.part) ? ' · on' : ' · off'}</option>
						{/each}
					</optgroup>
				</select>

				{#if selected}
					<input
						value={selected.name}
						oninput={(e) => store.updateScreen(selected.id, 'name', e.currentTarget.value)}
						placeholder="Screen name"
						class="min-w-40 flex-1 border-none bg-transparent text-sm font-semibold text-ink-900 outline-none placeholder:font-normal placeholder:text-ink-300"
					/>
					<label class="flex items-center gap-1.5 text-[11px] text-ink-400">
						Template
						<select
							value={selected.templateId ?? ''}
							onchange={(e) => chooseTemplate(selected.id, e.currentTarget.value || null)}
							title="A template is a reusable layout. Picking one clones its layout into this screen so you can edit from there."
							class="rounded-field border border-line bg-surface px-2 py-1 text-xs text-ink-700"
						>
							<option value="">- none -</option>
							{#each store.draft.templates as t (t.id)}
								<option value={t.id}>{t.name || 'Untitled template'}</option>
							{/each}
						</select>
					</label>
					{#if selected.templateId}
						<button
							type="button"
							onclick={() => applyTemplateNow(selected.id, selected.templateId)}
							class="rounded-field border border-line px-2 py-1 text-[11px] font-semibold text-ink-500 hover:border-brand-300 hover:text-brand-600"
							title="Replace this screen's layout with a fresh copy of the template"
						>
							Apply layout
						</button>
					{/if}
					<button
						type="button"
						onclick={() => saveAsTemplate(selected.id, selected.name)}
						class="rounded-field border border-line px-2 py-1 text-[11px] font-semibold text-ink-500 hover:border-brand-300 hover:text-brand-600"
						title="Save this screen's current layout as a reusable template"
					>
						Save as template
					</button>
					<label class="flex items-center gap-1.5 text-[11px] text-ink-400">
						Path
						<input
							value={selected.path}
							oninput={(e) => store.updateScreen(selected.id, 'path', e.currentTarget.value)}
							placeholder={screenPath(selected)}
							title="URL route for the web simulator (blank = auto from name)"
							class="w-32 rounded-field border border-line bg-surface px-2 py-1 font-mono text-xs text-ink-700 outline-none focus:border-brand-300 placeholder:text-ink-300"
						/>
					</label>
					<label class="flex items-center gap-1.5 text-[11px] text-ink-400">
						Device
						<select
							value={selected.device}
							onchange={(e) => store.updateScreen(selected.id, 'device', e.currentTarget.value as DeviceKind)}
							title="Device layout - sizes the simulator window"
							class="rounded-field border border-line bg-surface px-2 py-1 text-xs text-ink-700"
						>
							{#each DEVICES as o (o.code)}<option value={o.code}>{o.label}</option>{/each}
						</select>
					</label>
					{#if selected.device === 'custom'}
						<label class="flex items-center gap-1 text-[11px] text-ink-400">
							<input
								type="number"
								value={selected.deviceW}
								oninput={(e) => store.updateScreen(selected.id, 'deviceW', Number(e.currentTarget.value))}
								class="w-16 rounded-field border border-line bg-surface px-1.5 py-1 text-xs text-ink-700 outline-none"
								aria-label="Custom width"
							/>
							×
							<input
								type="number"
								value={selected.deviceH}
								oninput={(e) => store.updateScreen(selected.id, 'deviceH', Number(e.currentTarget.value))}
								class="w-16 rounded-field border border-line bg-surface px-1.5 py-1 text-xs text-ink-700 outline-none"
								aria-label="Custom height"
							/>
						</label>
					{/if}
					<label class="flex items-center gap-1.5 text-[11px] text-ink-400">
						Category
						<input
							value={selected.category ?? ''}
							oninput={(e) => store.updateScreen(selected.id, 'category', e.currentTarget.value || null)}
							placeholder="e.g. Auth"
							class="w-28 rounded-field border border-line bg-surface px-2 py-1 text-xs text-ink-700 outline-none focus:border-brand-300 placeholder:text-ink-300"
						/>
					</label>
					<button
						type="button"
						onclick={() => {
							store.removeScreen(selected.id);
							selectedId = null;
						}}
						class="shrink-0 text-ink-300 hover:text-danger-500"
						title="Delete screen"><Icon name="x" size={16} /></button
					>
				{:else if selectedShell}
					<label class="flex items-center gap-2 text-xs font-semibold text-ink-700">
						<input
							type="checkbox"
							checked={shellOn}
							onchange={(e) => store.setShellEnabled(selectedShell.part, e.currentTarget.checked)}
						/>
						{selectedShell.label}
						<span class="text-[10px] font-normal text-ink-400">
							{shellOn ? 'shown on every screen in Run mode' : 'off - enable to design it'}
						</span>
					</label>
					<span class="min-w-40 flex-1"></span>
				{/if}

				<span class="mx-1 hidden h-5 w-px bg-line sm:block"></span>
				<Button variant="outline" size="sm" onclick={addScreen}>
					<Icon name="plus" size={14} /> Screen
				</Button>
				{#if store.draft.builder.entryScreenId}
					<Button variant="primary" size="sm" onclick={() => startRun(selected?.id ?? null)}>
						<Icon name="sparkles" size={14} /> Run
					</Button>
				{/if}
			</div>

			{#if selected}
				<!-- Full-width builder ───────────────────────────────────────── -->
				<Builder {store} screenId={selected.id} {roles} onRun={() => startRun(selected.id)} />
			{:else if selectedShell}
				{#if shellOn}
					<Builder {store} screenId={selectedShell.id} surfaceKind="template" {roles} />
				{:else}
					<p class="rounded-card border border-dashed border-line px-4 py-10 text-center text-xs text-ink-400">
						The {selectedShell.label.toLowerCase()} is off. Turn it on above to design the shared layout
						drawn around every screen - like a real app's nav bar and footer.
					</p>
				{/if}
			{/if}
		{/if}
	</div>
{/if}
