<script lang="ts">
	import { untrack } from 'svelte';
	import { Icon } from '$ui/design-system';
	import {
		themeStyleVars,
		markerStyleVars,
		terminalStyleVars,
		resolveDeviceSize,
		deviceChrome,
		appDomain,
		screenPath,
		journeyScreenStops,
		runnableJourneys,
		buildScreenAccessMap,
		HEADER_SURFACE_ID,
		FOOTER_SURFACE_ID
	} from '$domain/experience';
	import type { ExperienceStore } from '../draft-store.svelte';
	import { BuilderRunController } from './run-controller.svelte';
	import NodeRenderer from './NodeRenderer.svelte';
	import SimFrame from './SimFrame.svelte';
	import SimDesktop from './SimDesktop.svelte';

	interface Role {
		id: string;
		name: string;
	}
	interface Props {
		store: ExperienceStore;
		roles?: Role[];
		startScreenId?: string | null;
		onClose: () => void;
	}
	let { store, roles = [], startScreenId = null, onClose }: Props = $props();

	// Screen-area permissions: a persona may open a screen only if the Users &
	// Permissions matrix grants its role access to the area behind it. We gate on
	// the *journey* capabilities — a journey is who operates an area, so its grant
	// is the crisp "can this role work here?" signal (feature-level reads are far
	// more granular and would blur the areas together).
	const access = untrack(() =>
		buildScreenAccessMap(
			store.draft.screens,
			store.capabilityAccess.filter((c) => c.source === 'journey')
		)
	);

	// One controller per Runner instance (capture initial builder/start once).
	const controller = untrack(
		() =>
			new BuilderRunController(
				store.draft.builder,
				null,
				startScreenId ?? store.draft.builder.entryScreenId,
				access
			)
	);

	const personaName = (id: string | null) =>
		id ? (roles.find((r) => r.id === id)?.name ?? id) : 'Author (all)';

	// The first screen the active persona is allowed to open — the escape hatch
	// shown on the "restricted area" placeholder. Recomputes on persona switch.
	const firstAccessibleScreenId = $derived(
		store.draft.screens.find((s) => controller.screenAccessible(s.id))?.id ?? null
	);
	// How many screens the active persona is locked out of (0 in author mode).
	const lockedCount = $derived(
		controller.rs.activePersonaId === null
			? 0
			: store.draft.screens.filter((s) => !controller.screenAccessible(s.id)).length
	);

	// ── Guided run: walk the prototype along an authored journey ──
	const journeys = $derived(runnableJourneys(store.draft));
	// Follow the journey containing the start screen by default (else the first).
	let followJourneyId = $state<string | null>(
		untrack(() => {
			const start = startScreenId ?? store.draft.builder.entryScreenId;
			const list = runnableJourneys(store.draft);
			return (
				list.find((j) => journeyScreenStops(store.draft, j.id).some((s) => s.screenId === start))
					?.id ??
				list[0]?.id ??
				null
			);
		})
	);
	const stops = $derived(
		followJourneyId ? journeyScreenStops(store.draft, followJourneyId) : []
	);
	const stepIndex = $derived(stops.findIndex((s) => s.screenId === controller.rs.currentScreenId));
	function gotoStop(i: number) {
		const stop = stops[i];
		if (stop) controller.navigateTo(stop.screenId);
	}

	const curScreen = $derived(
		store.draft.screens.find((s) => s.id === controller.rs.currentScreenId)
	);
	const dev = $derived(
		resolveDeviceSize(
			curScreen?.device ?? 'auto',
			curScreen?.deviceW ?? 1024,
			curScreen?.deviceH ?? 768,
			store.draft.builder.theme,
			store.formFactors
		)
	);
	const chrome = $derived(deviceChrome(dev.kind));
	const surfaceStyle = $derived(
		chrome === 'terminal'
			? `${terminalStyleVars()};background:var(--sim-surface);border-color:var(--sim-border);color:var(--sim-ink);font-family:var(--sim-font);border-radius:var(--sim-radius-card)`
			: `background:var(--sim-surface);border-color:var(--sim-border);border-radius:var(--sim-radius-card);font-family:var(--sim-font);color:var(--sim-ink)`
	);
	const screenUrl = $derived(`${appDomain(store.productName)}${curScreen ? screenPath(curScreen) : '/'}`);

	// Shared app chrome wrapped around every run screen (when enabled + designed).
	const shell = $derived(store.draft.builder.shell);
	const headerRoot = $derived(
		shell.headerEnabled ? (store.draft.builder.screenRoots[HEADER_SURFACE_ID] ?? null) : null
	);
	const footerRoot = $derived(
		shell.footerEnabled ? (store.draft.builder.screenRoots[FOOTER_SURFACE_ID] ?? null) : null
	);

	// Typing a URL in the address bar navigates to the screen with that path.
	function navigateToUrl(value: string) {
		let s = value.trim().replace(/^https?:\/\//, '');
		const slash = s.indexOf('/');
		let path = slash >= 0 ? s.slice(slash) : s.includes('.') ? '/' : `/${s}`;
		if (!path.startsWith('/')) path = `/${path}`;
		const target = store.draft.screens.find(
			(sc) => screenPath(sc).toLowerCase() === path.toLowerCase()
		);
		if (target) controller.navigateTo(target.id);
	}

	// Full-screen the running simulator (real browser fullscreen, with graceful no-op).
	// In fullscreen only the simulated browser/terminal shows; the controls header
	// is hidden until the pointer reaches the top of the screen.
	let rootEl: HTMLDivElement | undefined;
	let isFullscreen = $state(false);
	let showHeader = $state(false);
	function toggleFullscreen() {
		if (typeof document === 'undefined') return;
		if (document.fullscreenElement) void document.exitFullscreen?.();
		else void rootEl?.requestFullscreen?.().catch(() => {});
	}
	function onPointerMove(e: MouseEvent) {
		if (isFullscreen) showHeader = e.clientY < 72;
	}
	$effect(() => {
		const onChange = () => {
			isFullscreen = document.fullscreenElement === rootEl;
			showHeader = false;
		};
		document.addEventListener('fullscreenchange', onChange);
		document.addEventListener('mousemove', onPointerMove);
		return () => {
			document.removeEventListener('fullscreenchange', onChange);
			document.removeEventListener('mousemove', onPointerMove);
		};
	});
</script>

<div
	bind:this={rootEl}
	class="border-brand-300 bg-surface {isFullscreen
		? 'relative h-full overflow-hidden'
		: 'space-y-3 rounded-card border'}"
>
	<!-- top bar — auto-hiding overlay in fullscreen (reveal at top of screen) -->
	<div
		class="flex flex-wrap items-center gap-2 px-3 py-2 {isFullscreen
			? `absolute inset-x-0 top-0 z-40 bg-surface/95 shadow-card backdrop-blur transition-transform ${
					showHeader ? 'translate-y-0' : '-translate-y-full'
				}`
			: 'border-b border-line'}"
	>
		<span class="flex items-center gap-1.5 text-xs font-semibold text-ink-900">
			<Icon name="sparkles" size={14} class="text-brand-500" /> Run
		</span>
		<button
			type="button"
			onclick={() => controller.back()}
			disabled={!controller.canGoBack}
			class="flex items-center gap-1 rounded-field border border-line px-2 py-1 text-[11px] font-semibold text-ink-600 enabled:hover:bg-surface-sunken disabled:opacity-40"
			title="Go back to the previous screen"
		>
			<Icon name="arrow-left" size={12} /> Back
		</button>
		<select
			value={controller.rs.currentScreenId ?? ''}
			onchange={(e) => controller.navigateTo(e.currentTarget.value)}
			title="Jump to a screen"
			class="rounded border border-line bg-surface px-1.5 py-1 text-xs font-semibold text-brand-600 outline-none focus:border-brand-300"
		>
			{#each store.draft.screens as s (s.id)}
				{@const ok = controller.screenAccessible(s.id)}
				<option value={s.id} disabled={!ok}>
					{ok ? '' : '🔒 '}{s.name || 'Untitled screen'}
				</option>
			{/each}
		</select>
		<label class="ml-auto flex items-center gap-1.5 text-[11px] text-ink-500">
			Run as
			<select
				value={controller.rs.activePersonaId ?? ''}
				onchange={(e) => controller.setPersona(e.currentTarget.value || null)}
				class="rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-700"
			>
				<option value="">Author (all)</option>
				{#each roles as role (role.id)}
					<option value={role.id}>{role.name || 'role'}</option>
				{/each}
			</select>
		</label>
		<button
			type="button"
			onclick={toggleFullscreen}
			class="flex items-center gap-1 rounded-field border border-line px-2 py-1 text-[11px] font-semibold text-ink-600 hover:bg-surface-sunken"
			title={isFullscreen ? 'Leave fullscreen (back to the windowed simulator)' : 'Present the simulator fullscreen'}
		>
			<Icon name="monitor" size={12} />
			{isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
		</button>
		<button
			type="button"
			onclick={() => controller.restart()}
			class="flex items-center gap-1 rounded-field border border-line px-2 py-1 text-[11px] font-semibold text-ink-600 hover:bg-surface-sunken"
			title="Restart the run from the entry screen (clears state & data)"
		>
			<Icon name="rotate" size={12} /> Restart
		</button>
		<button
			type="button"
			onclick={onClose}
			class="flex items-center gap-1 rounded-field border border-line px-2 py-1 text-[11px] font-semibold text-ink-600 hover:bg-surface-sunken"
			title="Stop running and return to the screen editor"
		>
			<Icon name="x" size={12} /> Exit run
		</button>
	</div>

	<!-- guided-run strip: follow an authored journey step-by-step -->
	{#if !isFullscreen && journeys.length > 0}
		<div class="flex flex-wrap items-center gap-2 border-b border-line bg-surface-sunken/40 px-3 py-1.5">
			<label class="flex items-center gap-1.5 text-[11px] text-ink-500">
				<Icon name="flag" size={12} class="text-brand-500" /> Follow journey
				<select
					value={followJourneyId ?? ''}
					onchange={(e) => (followJourneyId = e.currentTarget.value || null)}
					class="rounded border border-line bg-surface px-1.5 py-1 text-[11px] font-semibold text-ink-700 outline-none focus:border-brand-300"
				>
					<option value="">- free roam -</option>
					{#each journeys as j (j.id)}
						<option value={j.id}>{j.name || 'Journey'}</option>
					{/each}
				</select>
			</label>
			{#if followJourneyId && stops.length}
				<div class="flex items-center gap-1.5">
					<button
						type="button"
						onclick={() => gotoStop(stepIndex - 1)}
						disabled={stepIndex <= 0}
						class="flex items-center gap-1 rounded-field border border-line px-2 py-1 text-[11px] font-semibold text-ink-600 enabled:hover:bg-surface disabled:opacity-40"
						title="Previous step in this journey"
					>
						<Icon name="arrow-left" size={12} /> Prev
					</button>
					{#if stepIndex >= 0}
						<span class="text-[11px] font-medium text-ink-600">
							Step {stepIndex + 1}/{stops.length}
							<span class="text-ink-400">· {stops[stepIndex].name || 'Untitled step'}</span>
						</span>
					{:else}
						<span class="flex items-center gap-1.5 text-[11px] font-medium text-warning-600">
							Off journey
							<button
								type="button"
								onclick={() => gotoStop(0)}
								class="rounded-field border border-warning-200 bg-warning-50 px-1.5 py-0.5 text-[10px] font-semibold text-warning-700 hover:bg-warning-100"
							>
								Resume at step 1
							</button>
						</span>
					{/if}
					<button
						type="button"
						onclick={() => gotoStop(stepIndex + 1)}
						disabled={stepIndex < 0 || stepIndex >= stops.length - 1}
						class="flex items-center gap-1 rounded-field border border-line px-2 py-1 text-[11px] font-semibold text-ink-600 enabled:hover:bg-surface disabled:opacity-40"
						title="Next step in this journey"
					>
						Next <Icon name="arrow-right" size={12} />
					</button>
				</div>
				<!-- step dots -->
				<div class="ml-auto hidden items-center gap-1 sm:flex">
					{#each stops as s, i (s.stepId)}
						<button
							type="button"
							onclick={() => gotoStop(i)}
							title={s.name || `Step ${i + 1}`}
							aria-label={s.name || `Step ${i + 1}`}
							class="size-2 rounded-full transition-colors {i === stepIndex
								? 'bg-brand-500'
								: i < stepIndex
									? 'bg-brand-300'
									: 'bg-line hover:bg-ink-300'}"
						></button>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<div class="grid gap-0 {isFullscreen ? 'h-full grid-cols-1' : 'lg:grid-cols-[1fr_260px]'}">
		<!-- player -->
		<div
			class="sim-scope {isFullscreen ? 'h-full' : 'p-4'}"
			style="{themeStyleVars(store.draft.builder.theme)};{markerStyleVars(
				store.draft.brand.markers
			)};{isFullscreen ? '' : 'background:var(--sim-bg)'}"
		>
			{#snippet playerBody()}
				{#if !controller.currentScreenAccessible}
					<!-- Permission boundary: the active persona cannot open this area. -->
					<div class="grid min-h-64 place-items-center p-8 text-center" style="color:var(--sim-ink)">
						<div class="max-w-xs">
							<div class="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-warning-50 text-warning-600">
								<Icon name="lock" size={22} />
							</div>
							<p class="text-sm font-semibold">Restricted area</p>
							<p class="mt-1 text-xs" style="opacity:.7">
								<strong>{personaName(controller.rs.activePersonaId)}</strong> doesn’t have permission to
								open <strong>{curScreen?.name ?? 'this screen'}</strong>.
							</p>
							{#if firstAccessibleScreenId}
								<button
									type="button"
									onclick={() => controller.navigateTo(firstAccessibleScreenId)}
									class="mt-3 rounded-field border border-warning-200 bg-warning-50 px-2.5 py-1 text-[11px] font-semibold text-warning-700 hover:bg-warning-100"
								>
									Go to an area you can access
								</button>
							{/if}
						</div>
					</div>
				{:else}
					{#if headerRoot}
						<div class="border-b" style="border-color:var(--sim-border)">
							<NodeRenderer {store} nodeId={headerRoot} mode="run" run={controller} />
						</div>
					{/if}
					<NodeRenderer {store} nodeId={controller.rootId!} mode="run" run={controller} />
					{#if footerRoot}
						<div class="mt-auto border-t" style="border-color:var(--sim-border)">
							<NodeRenderer {store} nodeId={footerRoot} mode="run" run={controller} />
						</div>
					{/if}
				{/if}
			{/snippet}

			{#if controller.rootId}
				{#if isFullscreen}
					<!-- Immersive macOS environment: resizable browser window + ratio selector. -->
					<SimDesktop
						{store}
						url={screenUrl}
						onNavigate={navigateToUrl}
						{surfaceStyle}
						initW={dev.w}
						initH={dev.h}
					>
						{@render playerBody()}
					</SimDesktop>
				{:else}
					<SimFrame deviceKind={dev.kind} url={screenUrl} {surfaceStyle} onNavigate={navigateToUrl}>
						{@render playerBody()}
					</SimFrame>
					<p class="mt-2 text-center text-[10px] text-ink-300">
						Running as <strong>{personaName(controller.rs.activePersonaId)}</strong>
						{#if lockedCount > 0}
							· <span class="font-semibold text-warning-500">{lockedCount} screen{lockedCount === 1 ? '' : 's'} locked</span>
						{:else if controller.rs.activePersonaId !== null}
							· <span class="text-success-500">full access</span>
						{/if} · click & hover to drive the flow.
					</p>
				{/if}
			{:else}
				<div class="grid min-h-40 place-items-center text-center">
					<div>
						<p class="text-sm font-semibold text-ink-600">No entry screen</p>
						<p class="mt-1 text-xs text-ink-400">Set an entry screen in the designer to run.</p>
					</div>
				</div>
			{/if}
		</div>

		<!-- live errors (hidden in fullscreen — only the simulator shows) -->
		{#if !isFullscreen}
		<div class="border-line p-3 lg:border-l">
			<p class="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-ink-400">
				<Icon name="info" size={12} /> Live errors · {controller.rs.errors.length}
			</p>
			{#if controller.rs.errors.length === 0}
				<p class="text-[11px] italic text-ink-300">No errors yet. Interact to validate the flow.</p>
			{:else}
				<ul class="space-y-1.5">
					{#each [...controller.rs.errors].reverse().slice(0, 30) as err, i (i)}
						<li
							class="rounded border px-2 py-1 text-[11px] {err.kind === 'scenario'
								? 'border-danger-200 bg-danger-50 text-danger-600'
								: err.kind === 'navigation'
									? 'border-warning-200 bg-warning-50 text-warning-600'
									: 'border-line bg-surface-sunken text-ink-500'}"
						>
							<span class="font-semibold uppercase tracking-wide">{err.kind}</span> · {err.message}
						</li>
					{/each}
				</ul>
			{/if}

			<!-- activity trace: actions/events emitted + effects fired -->
			<p class="mb-2 mt-4 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-ink-400">
				<Icon name="bolt" size={12} /> Activity · {controller.rs.activity.length}
			</p>
			{#if controller.rs.activity.length === 0}
				<p class="text-[11px] italic text-ink-300">Nothing fired yet. Click an action, emit an event, or run a flow.</p>
			{:else}
				<ul class="space-y-1.5">
					{#each [...controller.rs.activity].reverse().slice(0, 30) as a, i (i)}
						<li
							class="rounded border px-2 py-1 text-[11px] {a.kind === 'action'
								? 'border-brand-200 bg-brand-50 text-brand-600'
								: a.kind === 'event'
									? 'border-info-200 bg-info-50 text-info-600'
									: 'border-line bg-surface-sunken text-ink-500'}"
						>
							<span class="font-semibold uppercase tracking-wide">{a.kind}</span> · {a.label}{a.detail
								? ` → ${a.detail}`
								: ''}
						</li>
					{/each}
				</ul>
			{/if}
		</div>
		{/if}
	</div>
</div>
