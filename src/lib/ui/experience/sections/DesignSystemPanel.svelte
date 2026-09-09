<script lang="ts">
	import { Icon } from '$ui/design-system';
	import {
		SIM_RADII,
		SIM_HOVERS,
		SIM_FONTS,
		SIM_VIEWPORTS,
		resolveViewport,
		themeStyleVars,
		markerStyleVars,
		toCssTheme,
		toTailwindTheme,
		type SimTheme,
		type SimRadius,
		type SimRadii,
		type SimHover,
		type HoverEffect,
		type SimFont,
		type SimViewport
	} from '$domain/experience';
	import type { ExperienceStore } from '../draft-store.svelte';

	interface Props {
		store: ExperienceStore;
	}
	let { store }: Props = $props();

	const theme = $derived(store.draft.builder.theme);
	const resolvedViewport = $derived(resolveViewport(theme.viewport, store.formFactors));

	const COLOR_FIELDS: { key: keyof SimTheme; label: string }[] = [
		{ key: 'accent', label: 'Accent' },
		{ key: 'onAccent', label: 'On accent' },
		{ key: 'surface', label: 'Surface' },
		{ key: 'bg', label: 'Background' },
		{ key: 'ink', label: 'Text' },
		{ key: 'muted', label: 'Muted' },
		{ key: 'border', label: 'Border' }
	];
	const RADIUS_FIELDS: { key: keyof SimRadii; label: string }[] = [
		{ key: 'button', label: 'Button' },
		{ key: 'input', label: 'Input' },
		{ key: 'card', label: 'Card' }
	];
	const HOVER_FIELDS: { key: keyof SimHover; label: string }[] = [
		{ key: 'button', label: 'Button hover' },
		{ key: 'link', label: 'Link hover' }
	];

	const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
	function setColor(key: keyof SimTheme, value: string) {
		store.setSimTheme({ [key]: value } as Partial<SimTheme>);
	}
	function setRadius(kind: keyof SimRadii, value: SimRadius) {
		store.setSimTheme({ radii: { ...theme.radii, [kind]: value } });
	}
	function setHover(kind: keyof SimHover, value: HoverEffect) {
		store.setSimTheme({ hover: { ...theme.hover, [kind]: value } });
	}

	let copied = $state<'css' | 'tw' | null>(null);
	let copyTimer: ReturnType<typeof setTimeout> | null = null;
	async function copy(kind: 'css' | 'tw') {
		const text = kind === 'css' ? toCssTheme(theme) : toTailwindTheme(theme);
		try {
			await navigator.clipboard.writeText(text);
			copied = kind;
			if (copyTimer) clearTimeout(copyTimer);
			copyTimer = setTimeout(() => (copied = null), 1500);
		} catch {
			store.notifier.notify('error', 'Could not copy to clipboard.');
		}
	}
</script>

<div class="grid gap-3 p-3 lg:grid-cols-[1fr_minmax(220px,260px)]">
	<!-- Controls ─────────────────────────────────────────────────────── -->
	<div class="space-y-3">
		<!-- Colors -->
		<div>
			<p class="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-ink-400">Colors</p>
			<div class="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
				{#each COLOR_FIELDS as f (f.key)}
					{@const val = theme[f.key] as string}
					<label class="flex items-center gap-1.5 rounded-field border border-line bg-surface px-1.5 py-1">
						<input
							type="color"
							value={val}
							oninput={(e) => setColor(f.key, e.currentTarget.value)}
							aria-label={f.label}
							class="size-5 shrink-0 cursor-pointer rounded border border-line bg-transparent p-0"
						/>
						<span class="min-w-0">
							<span class="block truncate text-[10px] font-medium text-ink-600">{f.label}</span>
							<input
								value={val}
								oninput={(e) => HEX.test(e.currentTarget.value) && setColor(f.key, e.currentTarget.value)}
								spellcheck="false"
								class="w-full border-none bg-transparent p-0 text-[10px] uppercase text-ink-400 outline-none"
							/>
						</span>
					</label>
				{/each}
			</div>
		</div>

		<!-- Roundness — global, per element type. The Corner style trait sets all three;
		     these stay editable so a button can differ from a card. -->
		<div>
			<p class="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-ink-400">
				Roundness
				<span class="font-normal normal-case tracking-normal text-ink-300">
					· fine-tune per type, set by the Corner style trait
				</span>
			</p>
			<div class="grid grid-cols-3 gap-2">
				{#each RADIUS_FIELDS as f (f.key)}
					<label class="text-[10px] font-medium text-ink-500">
						<span class="mb-0.5 block text-ink-400">{f.label}</span>
						<select
							value={theme.radii[f.key]}
							onchange={(e) => setRadius(f.key, e.currentTarget.value as SimRadius)}
							class="w-full rounded-field border border-line bg-surface px-2 py-1 text-xs text-ink-700"
						>
							{#each SIM_RADII as o (o.code)}<option value={o.code}>{o.label}</option>{/each}
						</select>
					</label>
				{/each}
			</div>
		</div>

		<!-- Hover — global, per interactive type -->
		<div>
			<p class="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-ink-400">
				Hover <span class="font-normal normal-case tracking-normal text-ink-300">· interaction</span>
			</p>
			<div class="grid grid-cols-2 gap-2">
				{#each HOVER_FIELDS as f (f.key)}
					<label class="text-[10px] font-medium text-ink-500">
						<span class="mb-0.5 block text-ink-400">{f.label}</span>
						<select
							value={theme.hover[f.key]}
							onchange={(e) => setHover(f.key, e.currentTarget.value as HoverEffect)}
							class="w-full rounded-field border border-line bg-surface px-2 py-1 text-xs text-ink-700"
						>
							{#each SIM_HOVERS as o (o.code)}<option value={o.code}>{o.label}</option>{/each}
						</select>
					</label>
				{/each}
			</div>
		</div>

		<!-- Format + type. Spacing is NOT here: the Density trait owns it. -->
		<div class="grid grid-cols-2 gap-2">
			<label class="text-[10px] font-medium text-ink-500">
				<span class="mb-0.5 block uppercase tracking-widest text-ink-400">
					Format
					{#if theme.viewport === 'auto'}<span class="normal-case tracking-normal text-ink-300"
							>· {resolvedViewport}</span
						>{/if}
				</span>
				<select
					value={theme.viewport}
					onchange={(e) => store.setSimTheme({ viewport: e.currentTarget.value as SimViewport })}
					class="w-full rounded-field border border-line bg-surface px-2 py-1 text-xs text-ink-700"
				>
					{#each SIM_VIEWPORTS as o (o.code)}<option value={o.code}>{o.label}</option>{/each}
				</select>
			</label>
			<label class="text-[10px] font-medium text-ink-500">
				<span class="mb-0.5 block uppercase tracking-widest text-ink-400">Font</span>
				<select
					value={theme.font}
					onchange={(e) => store.setSimTheme({ font: e.currentTarget.value as SimFont })}
					class="w-full rounded-field border border-line bg-surface px-2 py-1 text-xs text-ink-700"
				>
					{#each SIM_FONTS as o (o.code)}<option value={o.code}>{o.label}</option>{/each}
				</select>
			</label>
		</div>

		<!-- Export + reset -->
		<div class="flex flex-wrap items-center gap-1.5">
			<span class="text-[10px] font-semibold uppercase tracking-widest text-ink-400">Export</span>
			<button
				type="button"
				onclick={() => copy('css')}
				class="flex items-center gap-1 rounded-field border border-line px-2 py-1 text-[11px] font-semibold text-ink-600 hover:border-brand-300 hover:text-brand-600"
			>
				<Icon name={copied === 'css' ? 'check' : 'sliders'} size={12} />
				{copied === 'css' ? 'Copied' : 'CSS variables'}
			</button>
			<button
				type="button"
				onclick={() => copy('tw')}
				class="flex items-center gap-1 rounded-field border border-line px-2 py-1 text-[11px] font-semibold text-ink-600 hover:border-brand-300 hover:text-brand-600"
			>
				<Icon name={copied === 'tw' ? 'check' : 'sliders'} size={12} />
				{copied === 'tw' ? 'Copied' : 'Tailwind config'}
			</button>
			<button
				type="button"
				onclick={() => store.resetSimTheme()}
				class="ml-auto rounded-field border border-line px-2 py-1 text-[11px] font-semibold text-ink-400 hover:border-danger-300 hover:text-danger-500"
			>
				Reset
			</button>
		</div>
	</div>

	<!-- Live preview — a real simulator scope, so the traits show here too ── -->
	<div
		class="sim-scope grid place-items-center rounded-card border border-line p-3"
		style="{themeStyleVars(theme)};{markerStyleVars(store.draft.brand.markers)};background:var(--sim-bg)"
	>
		<div
			class="w-full max-w-50 border p-3"
			style="background:var(--sim-surface);border-color:var(--sim-border);border-radius:var(--sim-radius-card);font-family:var(--sim-font);box-shadow:var(--sim-shadow-card,0 1px 3px rgba(0,0,0,0.06))"
		>
			<p class="font-bold" style="font-size:var(--sim-heading-size,1.25rem);color:var(--sim-ink)">Welcome</p>
			<p class="mb-2 text-[11px]" style="color:var(--sim-muted)">Sign in to continue</p>
			<div
				class="mb-2 w-full border px-2 py-1.5 text-[11px]"
				style="border-radius:var(--sim-radius-input);border-color:var(--sim-border);background:var(--sim-surface);color:var(--sim-muted)"
			>
				Email
			</div>
			<div class="flex items-center justify-between">
				<span class="sim-link sim-hover-{theme.hover.link} text-[11px] underline" style="color:var(--sim-accent)">Forgot?</span>
				<span
					class="sim-button sim-hover-{theme.hover.button} px-3 py-1.5 text-[11px] font-semibold"
					style="border-radius:var(--sim-radius-button);background:var(--sim-accent);color:var(--sim-on-accent);box-shadow:var(--sim-shadow-raised,0 1px 2px rgba(0,0,0,0.14))"
				>
					Sign in
				</span>
			</div>
		</div>
	</div>
</div>
