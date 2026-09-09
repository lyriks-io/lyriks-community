<script lang="ts">
	import { browser } from '$app/environment';
	import { enhance, deserialize } from '$app/forms';
	import { KICKOFF_SOURCES, kickoffPrompt, mcpEndpointFor, mcpRegistrationCommands, type KickoffSourceCode } from '$domain/foundation';
	import { goto, invalidateAll } from '$app/navigation';
	import {
		confirmDialog,
		dismissToast,
		HelpTip,
		Icon,
		MaturityBar,
		pushToast,
		stageFromScore,
		// The portfolio's own stageLabel (project lifecycle) is imported below;
		// this one names spec-maturity stages.
		stageLabel as maturityStageLabel
	} from '$ui/design-system';
	import IconifyIcon from '@iconify/svelte';
	import TopBar from '$ui/shell/TopBar.svelte';
	import { PORTFOLIO_HELP } from '$ui/shell/capability-help';
	import { tierLabel } from '$domain/tier/tier';
	import { PROJECT_STAGES, stageLabel, type ProjectCard, type DomainWithProjects } from '$domain/portfolio';
	import type { PageData, ActionData } from './$types';
	import { onDestroy } from 'svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const portfolio = $derived(data.portfolio);

	// The selected domain survives navigating away and back (per browser): the last
	// choice is remembered and restored; a stale id falls back to the first board.
	const SELECTED_DOMAIN_KEY = 'lyriks.portfolio.selected-domain';
	let selectedId = $state<string | null>(
		browser ? localStorage.getItem(SELECTED_DOMAIN_KEY) : null
	);
	function selectDomain(id: string) {
		selectedId = id;
		if (browser) localStorage.setItem(SELECTED_DOMAIN_KEY, id);
	}
	let showNewDomain = $state(false);
	let showNewProject = $state(false);
	// The two ways a project starts. Both end on the kickoff page, which hands the
	// user the one line their AI agent needs: from scratch it reads the backlog and
	// documents through their MCPs, from a codebase it reads the repository.
	const NEW_PROJECT_ORIGINS = [
		{ code: 'greenfield', label: 'From scratch', hint: 'Your agent specifies it from your backlog, docs or our conversation.' },
		{ code: 'code_to_spec', label: 'From a codebase', hint: 'Your AI coding agent reads the repo and writes the spec.' }
	] as const;
	let newProjectSource = $state<(typeof NEW_PROJECT_ORIGINS)[number]['code']>('greenfield');
	// The modal walks to the kickoff sentence BEFORE anything is created: the
	// agent creates the project itself through the MCP (the sentence says so),
	// unless the user prefers to create it here and paste the id-bearing line
	// from the project's own kickoff page.
	let newProjectStep = $state<1 | 2 | 3>(1);
	let newProjectName = $state('');
	let newProjectDescription = $state('');
	let newProjectSources = $state<KickoffSourceCode[]>([]);
	let newProjectError = $state('');
	let newProjectCopied = $state(false);
	const newProjectMcpUrl = $derived(browser ? mcpEndpointFor(location.origin) : '');
	const newProjectCommands = $derived(mcpRegistrationCommands(newProjectMcpUrl));
	function toggleNewProjectSource(code: KickoffSourceCode, on: boolean) {
		newProjectSources = on ? [...new Set([...newProjectSources, code])] : newProjectSources.filter((c) => c !== code);
	}
	function newProjectNext() {
		newProjectError = '';
		if (newProjectStep === 1 && !newProjectName.trim()) {
			newProjectError = 'Give the product a name.';
			return;
		}
		// A codebase has one source: the repository. Only from scratch asks which sources to read.
		newProjectStep = newProjectStep === 1 && newProjectSource === 'code_to_spec' ? 3 : newProjectStep === 1 ? 2 : 3;
	}
	function newProjectBack() {
		newProjectError = '';
		newProjectStep = newProjectStep === 3 && newProjectSource === 'code_to_spec' ? 1 : newProjectStep === 3 ? 2 : 1;
	}
	function closeNewProject() {
		showNewProject = false;
		newProjectStep = 1;
		newProjectName = '';
		newProjectDescription = '';
		newProjectSources = [];
		newProjectError = '';
		newProjectCopied = false;
	}
	async function copyNewProjectPrompt() {
		try {
			await navigator.clipboard.writeText(newProjectPrompt);
			newProjectCopied = true;
			setTimeout(() => (newProjectCopied = false), 2500);
		} catch {
			newProjectError = 'Could not copy to clipboard. Select the line and copy it by hand.';
		}
	}
	let editingDomainId = $state<string | null>(null);
	let newDomainName = $state('');
	let newDomainDescription = $state('');
	let newDomainIcon = $state('lucide:layout-grid');
	let editDomainName = $state('');
	let editDomainDescription = $state('');
	let editDomainIcon = $state('lucide:layout-grid');
	let domainMenuOpen = $state(false);
	let projectMenuOpenId = $state<string | null>(null);
	// Import a downloaded bundle. Posted as multipart so the browser streams the
	// file instead of base64-ing it through JSON; the board is invalidated after,
	// so the imported project appears without a full reload.
	let importing = $state(false);
	let importInput = $state<HTMLInputElement | null>(null);
	async function importBundle(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		importing = true;
		try {
			const body = new FormData();
			body.set('file', file);
			// Land the import in the board the user is looking at, unless they are on
			// the catch-all "unassigned" view — then keep the bundle's own domain.
			if (shown && shown.domain.id !== '__unassigned') body.set('domainId', shown.domain.id);
			const response = await fetch('/api/projects/import', { method: 'POST', body });
			const result = (await response.json().catch(() => null)) as
				| { projectId?: string; name?: string; warnings?: string[]; message?: string }
				| null;
			if (!response.ok) {
				pushToast({ level: 'error', message: result?.message ?? 'Import failed' });
				return;
			}
			await invalidateAll();
			for (const warning of result?.warnings ?? []) pushToast({ level: 'warn', message: warning });
			pushToast({ level: 'info', message: `Imported “${result?.name ?? 'project'}”` });
		} finally {
			importing = false;
			input.value = ''; // let the same file be re-picked after a failure
		}
	}
	// "Move to domain" flyout: rendered as a viewport-`fixed` panel (positioned by
	// JS) so it escapes the horizontal clip of `<main class="overflow-y-auto">` and
	// can overlay the sidebar. CSS `group-hover` can't survive a detached fixed
	// node, so open state + a small close-timer bridge are managed here.
	const MOVE_FLYOUT_WIDTH = 208; // w-52
	let moveOpenId = $state<string | null>(null);
	let movePos = $state<{ top: number; left: number }>({ top: 0, left: 0 });
	let moveCloseTimer: ReturnType<typeof setTimeout> | null = null;
	function openMoveFlyout(e: { currentTarget: HTMLElement }, id: string) {
		if (moveCloseTimer) clearTimeout(moveCloseTimer);
		const r = e.currentTarget.getBoundingClientRect();
		// Place it to the left of the menu row (over the sidebar), clamped on-screen.
		movePos = { top: r.top, left: Math.max(4, r.left - MOVE_FLYOUT_WIDTH - 4) };
		moveOpenId = id;
	}
	function scheduleCloseMoveFlyout() {
		if (moveCloseTimer) clearTimeout(moveCloseTimer);
		moveCloseTimer = setTimeout(() => (moveOpenId = null), 140);
	}
	function cancelCloseMoveFlyout() {
		if (moveCloseTimer) clearTimeout(moveCloseTimer);
	}
	// When the parent project menu closes, the flyout goes with it.
	$effect(() => {
		if (projectMenuOpenId === null) moveOpenId = null;
	});
	// Confirmed duplicate: same in-app dialog + programmatic action pattern as
	// requestProjectDelete. Copying a whole specification is cheap to undo (delete
	// the copy), so it asks once and does not make the reader retype the name.
	async function requestProjectDuplicate(p: { id: string; name: string }) {
		projectMenuOpenId = null;
		const ok = await confirmDialog({
			title: `Duplicate "${p.name}"?`,
			message:
				'Copies the whole specification: every section, the behavior kernel and the files uploaded into them. The copy is filed in the same domain, named "(copy)", and starts its own history.',
			confirmLabel: 'Duplicate project'
		});
		if (!ok) return;
		const body = new FormData();
		body.set('projectId', p.id);
		// The copy is primed server-side before it answers (so it reads identically
		// on the first render), which takes a beat on a large project: say so
		// rather than leaving the click looking ignored.
		const pending = pushToast({ level: 'info', message: `Duplicating "${p.name}"…` });
		const response = await fetch('?/duplicateProject', {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true' }
		});
		dismissToast(pending);
		const result = deserialize(await response.text());
		if (result.type === 'failure' || result.type === 'error') {
			const message =
				(result.type === 'failure' && typeof result.data?.message === 'string' && result.data.message) ||
				'Could not duplicate the project.';
			pushToast({ level: 'error', message });
			return;
		}
		const name = result.type === 'success' && typeof result.data?.name === 'string' ? result.data.name : `${p.name} (copy)`;
		// A copy that had to resolve something (kernel drift, a re-created domain,
		// a file the bundle could not carry) says so: silence would read as "the
		// copy is identical", which is the one thing it would not be. Same shape as
		// the import drop-zone above: one toast per warning, then the outcome.
		const warnings = (result.type === 'success' && Array.isArray(result.data?.warnings) ? result.data.warnings : []).filter(
			(w): w is string => typeof w === 'string'
		);
		for (const warning of warnings) pushToast({ level: 'warn', message: warning });
		pushToast({ level: 'info', message: `Duplicated as “${name}”` });
		await invalidateAll();
	}
	// Guarded delete: in-app dialog (retype the project name) instead of the native
	// confirm(), then a programmatic action call — the card menu (and any <form> in
	// it) is unmounted by the time the dialog resolves, so nothing is left to submit.
	async function requestProjectDelete(p: { id: string; name: string }) {
		projectMenuOpenId = null;
		const ok = await confirmDialog({
			title: `Delete "${p.name}"?`,
			message: 'This permanently deletes the project and every step draft.',
			confirmLabel: 'Delete project',
			danger: true,
			requireText: p.name
		});
		if (!ok) return;
		const body = new FormData();
		body.set('id', p.id);
		body.set('confirmName', p.name);
		const response = await fetch('?/deleteProject', {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true' }
		});
		const result = deserialize(await response.text());
		if (result.type === 'failure' || result.type === 'error') {
			const message =
				(result.type === 'failure' && typeof result.data?.message === 'string' && result.data.message) ||
				'Could not delete the project.';
			pushToast({ level: 'error', message });
			return;
		}
		await invalidateAll();
	}
	// Guarded domain removal: same in-app dialog + programmatic action pattern as
	// requestProjectDelete (no native alert/confirm).
	async function requestDomainRemove(domain: { id: string; name: string }, projectCount: number) {
		domainMenuOpen = false;
		if (projectCount > 0) {
			pushToast({
				level: 'error',
				message: `"${domain.name}" still has ${projectCount} project${projectCount === 1 ? '' : 's'}. Move or delete them before removing this domain.`
			});
			return;
		}
		const ok = await confirmDialog({
			title: `Delete "${domain.name}"?`,
			message: 'This removes the empty domain from your portfolio.',
			confirmLabel: 'Remove domain',
			danger: true
		});
		if (!ok) return;
		const body = new FormData();
		body.set('id', domain.id);
		const response = await fetch('?/removeDomain', {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true' }
		});
		const result = deserialize(await response.text());
		if (result.type === 'failure' || result.type === 'error') {
			const message =
				(result.type === 'failure' && typeof result.data?.message === 'string' && result.data.message) ||
				'Could not remove the domain.';
			pushToast({ level: 'error', message });
			return;
		}
		await invalidateAll();
	}
	let editingProjectId = $state<string | null>(null);
	let editName = $state('');
	let editDescription = $state('');
	let editDomainId = $state('');
	// Auto-hide rail: collapsed at rest, revealed when the cursor nears the left edge.
	let sidebarCollapsed = $state(true);
	let sidebarHoverOpen = $state(false);

	const DOMAIN_OPTIONS = [
		{ name: 'Sales', icon: 'lucide:handshake' },
		{ name: 'Tech', icon: 'lucide:cpu' },
		{ name: 'R&D', icon: 'lucide:flask-conical' },
		{ name: 'Product', icon: 'lucide:boxes' },
		{ name: 'Marketing', icon: 'lucide:megaphone' },
		{ name: 'Customer Success', icon: 'lucide:heart-handshake' },
		{ name: 'Support', icon: 'lucide:headphones' },
		{ name: 'Operations', icon: 'lucide:workflow' },
		{ name: 'Finance', icon: 'lucide:wallet-cards' },
		{ name: 'HR', icon: 'lucide:users' },
		{ name: 'Legal', icon: 'lucide:scale' },
		{ name: 'Security', icon: 'lucide:shield-check' },
		{ name: 'Data', icon: 'lucide:database' }
	];
	const DOMAIN_ICON_OPTIONS = [
		...DOMAIN_OPTIONS,
		{ name: 'Workspace', icon: 'lucide:building-2' },
		{ name: 'Strategy', icon: 'lucide:target' },
		{ name: 'Innovation', icon: 'lucide:lightbulb' },
		{ name: 'Platform', icon: 'lucide:server' }
	];

	// Boards = real domains + a synthetic "Unassigned" bucket when needed.
	function unassignedBoard(cards: ProjectCard[]): DomainWithProjects {
		return {
			domain: { id: '__unassigned', name: 'Unassigned', description: 'Projects not yet in a domain.', icon: 'lucide:inbox', createdAt: '' },
			projects: cards,
			byStage: PROJECT_STAGES.map((s) => ({ stage: s.code, label: s.label, count: cards.filter((c) => c.stage === s.code).length })).filter((x) => x.count > 0)
		};
	}
	const boards = $derived<DomainWithProjects[]>([
		...portfolio.domains,
		...(portfolio.unassigned.length ? [unassignedBoard(portfolio.unassigned)] : [])
	]);
	const shown = $derived(boards.find((b) => b.domain.id === selectedId) ?? boards[0] ?? null);
	// The kickoff sentence of the New project modal, filed in the board being looked at.
	const newProjectDomainName = $derived(shown && shown.domain.id !== '__unassigned' ? shown.domain.name : null);
	const newProjectPrompt = $derived(
		kickoffPrompt({
			productName: newProjectName,
			sourceMode: newProjectSource,
			sources: newProjectSources,
			domainName: newProjectDomainName
		})
	);
	const editingDomain = $derived(
		editingDomainId ? boards.find((b) => b.domain.id === editingDomainId)?.domain : null
	);
	const editingProject = $derived(
		editingProjectId
			? boards.flatMap((board) => board.projects).find((project) => project.id === editingProjectId)
			: null
	);
	const sidebarOpen = $derived(!sidebarCollapsed || sidebarHoverOpen);
	const sidebarToggleIcon = $derived(
		sidebarCollapsed && sidebarHoverOpen
			? 'pin'
			: sidebarCollapsed
				? 'panel-left-open'
				: 'panel-left-close'
	);
	const sidebarToggleLabel = $derived(
		sidebarCollapsed && sidebarHoverOpen
			? 'Pin menu open'
			: sidebarCollapsed
				? 'Open domains menu'
				: 'Collapse domains menu'
	);

	// Edge-proximity threshold: reveal the rail only after the cursor DWELLS near the
	// left screen edge (so a quick graze doesn't pop it open), and let it settle back
	// once the cursor moves clear of the panel.
	const SIDEBAR_REVEAL_PX = 16; // how close to the left edge arms the reveal
	const SIDEBAR_OPEN_DELAY_MS = 260; // dwell time at the edge before it opens
	const SIDEBAR_RAIL_PX = 64; // collapsed rail width (w-16)
	const SIDEBAR_PANEL_PX = 256; // expanded panel width (w-64)
	const SIDEBAR_SETTLE_BUFFER_PX = 48; // grace zone before it auto-hides again
	let sidebarOpenTimer: ReturnType<typeof setTimeout> | null = null;

	function scheduleSidebarOpen() {
		if (!sidebarCollapsed || sidebarHoverOpen || sidebarOpenTimer !== null) return;
		sidebarOpenTimer = setTimeout(() => {
			sidebarHoverOpen = true;
			sidebarOpenTimer = null;
		}, SIDEBAR_OPEN_DELAY_MS);
	}

	function settleSidebar() {
		if (sidebarOpenTimer !== null) {
			clearTimeout(sidebarOpenTimer);
			sidebarOpenTimer = null;
		}
		sidebarHoverOpen = false;
	}

	function handleEdgeProximity(event: PointerEvent) {
		if (!sidebarCollapsed) return; // pinned open, nothing to reveal
		if (event.clientX <= SIDEBAR_REVEAL_PX) {
			scheduleSidebarOpen();
		} else if (event.clientX > (sidebarHoverOpen ? SIDEBAR_PANEL_PX : SIDEBAR_RAIL_PX) + SIDEBAR_SETTLE_BUFFER_PX) {
			settleSidebar();
		}
	}

	function toggleSidebar() {
		// Collapsed (auto-hide) → pin open; pinned open → return to auto-hide.
		settleSidebar();
		sidebarCollapsed = !sidebarCollapsed;
	}

	onDestroy(() => {
		if (sidebarOpenTimer !== null) clearTimeout(sidebarOpenTimer);
	});

	function openNewDomain() {
		newDomainName = '';
		newDomainDescription = '';
		newDomainIcon = 'lucide:layout-grid';
		showNewDomain = true;
	}

	function closeNewDomain() {
		showNewDomain = false;
	}

	function beginEditDomain(domain: DomainWithProjects['domain']) {
		domainMenuOpen = false;
		editingDomainId = domain.id;
		editDomainName = domain.name;
		editDomainDescription = domain.description;
		editDomainIcon = domain.icon || 'lucide:layout-grid';
	}

	function closeEditDomain() {
		editingDomainId = null;
	}

	function openEditProject(project: ProjectCard) {
		projectMenuOpenId = null;
		editingProjectId = project.id;
		editName = project.name;
		editDescription = project.description;
		editDomainId = project.domainId ?? '';
	}

	function closeEditProject() {
		editingProjectId = null;
	}

	const STAGE_TONE: Record<string, string> = {
		ideation: 'bg-slate-100 text-slate-600',
		spec_in_progress: 'bg-info-50 text-info-600',
		mvp_in_progress: 'bg-brand-50 text-brand-600',
		v1_shipped: 'bg-success-50 text-success-600',
		v2_in_progress: 'bg-warning-50 text-warning-600'
	};
	/** The two stages that hang off the human shipping declaration. */
	const isShipped = (p: ProjectCard): boolean =>
		p.stage === 'v1_shipped' || p.stage === 'v2_in_progress';
	function barFill(p: number): string {
		if (p >= 80) return 'linear-gradient(90deg,#34d399,#10b981)';
		if (p >= 50) return 'linear-gradient(90deg,#fcd34d,#f59e0b)';
		return 'linear-gradient(90deg,#fb7185,#ef4444)';
	}
	function rel(iso: string | null): string {
		if (!iso) return 'never';
		const d = Date.parse(iso);
		if (Number.isNaN(d)) return iso;
		const mins = Math.max(0, Math.round((Date.now() - d) / 60000));
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins} min ago`;
		const h = Math.round(mins / 60);
		if (h < 24) return `${h}h ago`;
		return `${Math.round(h / 24)}d ago`;
	}
</script>

<svelte:head><title>Portfolio · Lyriks</title></svelte:head>
<svelte:window onpointermove={handleEdgeProximity} />

<div class="flex min-h-screen flex-col bg-surface-sunken">
	<!-- ── Top bar: the same shared chrome as every project page ────── -->
	<TopBar
		sessionEmail={data.session?.email}
		memberName={data.memberName}
		workspaces={data.workspaces}
		activeWorkspace={data.activeWorkspace}
	/>

	{#if !data.hasWorkspace}
		<!-- Bootstrap: no workspace yet → create one (become owner) instead of the 409 dead-end. -->
		<div class="border-b border-line bg-surface px-5 py-6">
			<div class="mx-auto flex max-w-2xl flex-col gap-3 rounded-card border border-brand-200 bg-brand-50/60 p-5">
				<div class="flex items-center gap-2">
					<Icon name="users" size={16} class="text-brand-600" />
					<h2 class="text-sm font-bold text-ink-900">Create your workspace to get started</h2>
				</div>
				<p class="text-xs text-ink-600">
					A workspace owns your projects and holds your team. You’ll be its owner and can
					invite colleagues from Settings → Members.
				</p>
				<form method="POST" action="?/createWorkspace" use:enhance class="flex flex-wrap items-center gap-2">
					<input
						name="name"
						placeholder="e.g. your team or company name"
						required
						class="min-w-64 flex-1 rounded-field border border-line bg-surface px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand-300"
					/>
					<button type="submit" class="rounded-field bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
						Create workspace
					</button>
				</form>
				{#if form?.scope === 'workspace' && form?.message}
					<p class="text-xs font-medium text-danger-500">{form.message}</p>
				{/if}
			</div>
		</div>
	{/if}

	<div class="flex min-h-0 flex-1">
	<!-- ── Sidebar: domains ─────────────────────────────────────────── -->
	<aside
		class="group/sidebar flex shrink-0 flex-col overflow-hidden bg-ink-900 text-white shadow-[8px_0_30px_rgba(15,23,42,0.12)] transition-[width,box-shadow] duration-500 ease-[cubic-bezier(.19,1,.22,1)] {sidebarOpen ? 'w-64' : 'w-16'}"
		onpointerenter={scheduleSidebarOpen}
		onpointerleave={settleSidebar}
		onfocusin={() => {
			if (sidebarCollapsed) sidebarHoverOpen = true;
		}}
		onfocusout={settleSidebar}
	>
		<div class="flex items-center pb-2 pt-4 transition-[padding] duration-500 {sidebarOpen ? 'px-3' : 'px-0'}">
			<span class="grid w-16 shrink-0 place-items-center">
				<button
					type="button"
					onclick={toggleSidebar}
					class="grid size-10 place-items-center rounded-xl bg-white/[0.06] text-ink-200 ring-1 ring-inset ring-white/5 transition hover:bg-white/10 hover:text-white"
					aria-label={sidebarToggleLabel}
					title={sidebarToggleLabel}
				>
					<Icon name={sidebarToggleIcon} size={17} />
				</button>
			</span>
			<div class="w-40 shrink-0 transition-opacity duration-200 {sidebarOpen ? 'opacity-100 delay-100' : 'opacity-0'}">
				<p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-400">Portfolio</p>
				<p class="text-lg font-bold">Domains</p>
			</div>
		</div>

		{#if sidebarOpen}
			<div class="grid grid-cols-3 gap-1.5 px-3 pb-3 transition-all duration-300">
				{#each [['domains', portfolio.domainCount], ['projects', portfolio.projectCount], ['coherence', portfolio.avgCoherence]] as [label, value] (label)}
					<div class="rounded-lg bg-white/5 px-2 py-1.5 text-center">
						<p class="text-sm font-bold">{value}{label === 'coherence' ? '%' : ''}</p>
						<p class="text-[9px] uppercase tracking-wide text-ink-400">{label}</p>
					</div>
				{/each}
			</div>
		{/if}

		<nav class="flex-1 space-y-1 overflow-y-auto transition-[padding] duration-500 {sidebarOpen ? 'px-3' : 'px-0'}">
			{#each boards as b (b.domain.id)}
				<button
					type="button"
					onclick={() => selectDomain(b.domain.id)}
					class="group/dom flex h-12 w-full items-center overflow-hidden rounded-xl text-left transition-colors duration-300 {shown?.domain.id === b.domain.id
						? sidebarOpen
							? 'gradient-violet text-white shadow-lg shadow-magenta-500/20'
							: 'text-white'
						: 'text-ink-200'}"
					title={b.domain.name}
				>
					<span class="grid h-12 w-16 shrink-0 place-items-center">
						<span
							class="grid size-10 place-items-center rounded-xl transition-all duration-300 {shown?.domain.id === b.domain.id
								? sidebarOpen
									? 'bg-white/15 text-white'
									: 'gradient-violet text-white shadow-lg shadow-magenta-500/30 ring-1 ring-inset ring-white/20'
								: 'bg-white/[0.06] text-ink-200 ring-1 ring-inset ring-white/5 group-hover/dom:bg-white/10 group-hover/dom:text-white'}"
						>
							<IconifyIcon icon={b.domain.icon || 'lucide:layout-grid'} width="18" height="18" />
						</span>
					</span>
					<span class="w-40 shrink-0 text-left transition-opacity duration-200 {sidebarOpen ? 'opacity-100 delay-75' : 'opacity-0'}">
						<span class="block truncate text-sm font-semibold">{b.domain.name}</span>
						<span class="block text-[11px] text-white/60">{b.projects.length} project{b.projects.length === 1 ? '' : 's'}</span>
					</span>
				</button>
			{/each}

			<button
				type="button"
				onclick={openNewDomain}
				class="group/new mt-2 flex h-12 w-full items-center overflow-hidden rounded-xl text-[12px] font-medium text-ink-300 transition hover:text-white"
				title="New domain"
			>
				<span class="grid h-12 w-16 shrink-0 place-items-center">
					<span class="grid size-10 place-items-center rounded-xl border border-dashed border-white/15 transition group-hover/new:border-white/30 group-hover/new:bg-white/5">
						<Icon name="plus" size={16} />
					</span>
				</span>
				<span class="w-40 shrink-0 text-left transition-opacity duration-200 {sidebarOpen ? 'opacity-100 delay-75' : 'opacity-0'}">New domain</span>
			</button>
		</nav>

		{#if sidebarOpen}
			<div class="flex items-center gap-2 whitespace-nowrap border-t border-white/10 px-4 py-3 text-[11px] text-ink-400">
				{#if data.devTier}
					<span
						class="rounded-pill border border-white/15 bg-white/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/70"
						title="Active development edition"
					>
						Dev · {tierLabel(data.devTier)}
					</span>
				{/if}
				<span>on-prem appliance</span>
			</div>
		{/if}
	</aside>

	<!-- ── Main: domain board ───────────────────────────────────────── -->
	<main class="min-w-0 flex-1 overflow-y-auto">
		{#if !shown}
			<div class="grid h-full place-items-center p-12 text-center">
				<div>
					<p class="text-sm font-medium text-ink-700">No domains yet.</p>
					<div class="mt-3 flex flex-wrap justify-center gap-2">
						<button type="button" onclick={() => (showNewProject = true)} class="rounded-field bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">+ New project</button>
						<button type="button" onclick={openNewDomain} class="rounded-field border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-surface-sunken">+ New domain</button>
					</div>
				</div>
			</div>
		{:else}
			<div class="w-full px-6 py-5">
				<!-- header -->
				<div class="mb-5 flex flex-wrap items-start justify-between gap-3">
					<div class="flex items-center gap-3">
						<span class="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-500"><IconifyIcon icon={shown.domain.icon || 'lucide:layout-grid'} width="20" height="20" /></span>
						<div>
							<!-- The only board-level figure worth showing: how many projects sit here.
							     Cross-project averages (coverage/coherence/readiness) were removed —
							     they blend unrelated projects and read as a score of nothing. -->
							<div class="flex flex-wrap items-center gap-2">
								<h1 class="text-2xl font-bold tracking-tight text-ink-900">{shown.domain.name}</h1>
								<span class="rounded-pill bg-surface-sunken px-2.5 py-0.5 text-[11px] font-semibold text-ink-500 ring-1 ring-line">
									{shown.projects.length} project{shown.projects.length === 1 ? '' : 's'}
								</span>
							</div>
							<p class="text-sm text-ink-500">{shown.domain.description || 'No description'}</p>
						</div>
					</div>
					<div class="flex flex-wrap items-center gap-2">
						<!-- The portfolio's own "?" — this page has no PageHeading, so it
						     carries the affordance in its action row, same corner. -->
						<HelpTip variant="page" {...PORTFOLIO_HELP} />
						<button type="button" onclick={() => (showNewProject = true)} class="flex items-center gap-1.5 rounded-field bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
							<Icon name="plus" size={15} /> New project
						</button>
						<input
							bind:this={importInput}
							type="file"
							accept=".zip,application/zip"
							onchange={importBundle}
							class="hidden"
						/>
						<button
							type="button"
							onclick={() => importInput?.click()}
							disabled={importing}
							title="Import a project bundle downloaded from Lyriks"
							class="flex items-center gap-1.5 rounded-field border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink-700 transition hover:bg-surface-sunken disabled:opacity-60"
						>
							<Icon name="upload" size={15} /> {importing ? 'Importing…' : 'Import'}
						</button>
						{#if shown.domain.id !== '__unassigned'}
							<div class="relative" onfocusout={() => setTimeout(() => (domainMenuOpen = false), 120)}>
								<button
									type="button"
									onclick={() => (domainMenuOpen = !domainMenuOpen)}
									class="grid size-9 place-items-center rounded-field border border-line bg-surface text-ink-500 shadow-card transition hover:border-line-strong hover:bg-surface-sunken hover:text-ink-700"
									aria-label="More domain options"
									aria-expanded={domainMenuOpen}
									title="More domain options"
								>
									<Icon name="ellipsis" size={16} />
								</button>
								{#if domainMenuOpen}
									<div class="absolute right-0 z-40 mt-2 w-48 overflow-hidden rounded-card border border-line bg-surface py-1 text-sm text-ink-700 shadow-pop">
										<button type="button" onclick={() => beginEditDomain(shown.domain)} class="flex w-full items-center gap-2 px-3 py-2 text-left font-medium transition hover:bg-surface-sunken hover:text-brand-600">
											<Icon name="sliders" size={14} /> Edit domain
										</button>
										<button
											type="button"
											onclick={() => requestDomainRemove(shown.domain, shown.projects.length)}
											class="flex w-full items-center gap-2 px-3 py-2 text-left font-medium text-danger-500 transition hover:bg-danger-50"
										>
											<Icon name="x" size={14} /> Remove domain
										</button>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				</div>
				{#if form?.scope === 'domain' && form?.message}
					<p class="mb-4 rounded-field border border-danger-200 bg-danger-50 px-3 py-2 text-xs font-medium text-danger-600">{form.message}</p>
				{/if}

				{#if shown.byStage.length}
					<!-- "By stage" grouping hidden per request: the current readings don't warrant
					     a stage/readiness filter here. Kept in the DOM, just not displayed. -->
					<div class="mb-5 hidden flex-wrap items-center gap-2">
						<span class="text-[10px] font-semibold uppercase tracking-wide text-ink-400">By stage</span>
						{#each shown.byStage as s (s.stage)}
							<span class="rounded-pill bg-surface px-2.5 py-0.5 text-[11px] text-ink-600 ring-1 ring-line">{s.label} · {s.count}</span>
						{/each}
					</div>
				{/if}

				<!-- project cards -->
				<div class="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
					{#each shown.projects as p (p.id)}
						<div
							role="button"
							tabindex="0"
							onclick={(e) => { if (!(e.target as HTMLElement).closest('button, a, form, input')) goto(`/projects/${p.id}/foundation`); }}
							onkeydown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); goto(`/projects/${p.id}/foundation`); } }}
							class="group flex cursor-pointer flex-col rounded-card border border-line bg-surface p-4 shadow-card transition-shadow hover:shadow-md">
							<div class="flex items-start gap-2">
								<span class="grid size-8 place-items-center rounded-lg bg-brand-50 text-brand-500"><Icon name="cpu" size={15} /></span>
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-semibold text-ink-900">{p.name}</p>
									<p class="truncate text-[11px] text-ink-400">{p.description || 'No description'}</p>
								</div>
								{#if data.canWrite}
								<div class="relative" onfocusout={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setTimeout(() => (projectMenuOpenId = null), 120); }}>
									<button
										type="button"
										onclick={() => (projectMenuOpenId = projectMenuOpenId === p.id ? null : p.id)}
										class="grid size-7 place-items-center rounded-field text-ink-400 transition hover:bg-surface-sunken hover:text-ink-700"
										aria-label={`More options for ${p.name}`}
										aria-expanded={projectMenuOpenId === p.id}
										title="More project options"
									>
										<Icon name="ellipsis" size={15} />
									</button>
									{#if projectMenuOpenId === p.id}
										<div class="absolute right-0 z-40 mt-1.5 w-52 rounded-card border border-line bg-surface py-1 text-sm text-ink-700 shadow-pop">
											<button type="button" onclick={() => openEditProject(p)} class="flex w-full items-center gap-2 px-3 py-2 text-left font-medium transition hover:bg-surface-sunken hover:text-brand-600">
												<Icon name="pencil" size={14} /> Edit project
											</button>
											<button type="button" onclick={() => requestProjectDuplicate(p)} class="flex w-full items-center gap-2 px-3 py-2 text-left font-medium transition hover:bg-surface-sunken hover:text-brand-600">
												<Icon name="copy" size={14} /> Duplicate project
											</button>
											<div class="relative">
													<button
														type="button"
														onmouseenter={(e) => openMoveFlyout(e, p.id)}
														onmouseleave={scheduleCloseMoveFlyout}
														onfocus={(e) => openMoveFlyout(e, p.id)}
														class="flex w-full items-center gap-2 px-3 py-2 text-left font-medium transition hover:bg-surface-sunken hover:text-brand-600"
													>
														<Icon name="grid" size={14} />
														<span class="flex-1">Move to domain</span>
														<Icon name="chevron-right" size={14} class="text-ink-400" />
													</button>
													<!-- Flyout: viewport-fixed (JS-positioned) so it clears the main
													     scroll clip and overlays the sidebar. Kept a DOM child of the
													     menu so focusout containment still holds. -->
													{#if moveOpenId === p.id}
													<div
														class="fixed z-60"
														style="top: {movePos.top}px; left: {movePos.left}px"
														onmouseenter={cancelCloseMoveFlyout}
														onmouseleave={scheduleCloseMoveFlyout}
														role="menu"
														tabindex="-1"
													>
														<div class="max-h-64 w-52 overflow-y-auto rounded-card border border-line bg-surface py-1 shadow-pop">
<form method="POST" action="?/createDomainForProject" use:enhance={() => { projectMenuOpenId = null; return async ({ update }) => update(); }} class="sticky top-0 z-10 border-b border-line bg-surface p-2">
																<input type="hidden" name="projectId" value={p.id} />
																<input type="hidden" name="name" value={p.name} />
																<input type="hidden" name="description" value={p.description} />
																<div class="flex items-center gap-1">
																	<input name="domainName" required maxlength="60" autocomplete="off" placeholder="New domain…" class="min-w-0 flex-1 rounded-field border border-line bg-surface px-2 py-1 text-xs text-ink-900 outline-none focus:border-brand-300" />
																	<button type="submit" class="grid size-6 shrink-0 place-items-center rounded-field bg-brand-500 text-white transition hover:bg-brand-600" aria-label="Create domain and move here" title="Create domain & move here">
																		<Icon name="plus" size={13} />
																	</button>
																</div>
															</form>
															{#each [...portfolio.domains.filter((b) => b.domain.id !== p.domainId).map((b) => ({ id: b.domain.id, name: b.domain.name, icon: b.domain.icon || 'lucide:layout-grid' })), ...(p.domainId ? [{ id: '', name: 'Unassigned', icon: 'lucide:inbox' }] : [])] as target (target.id)}
																<form method="POST" action="?/updateProject" use:enhance={() => { projectMenuOpenId = null; return async ({ update }) => update(); }}>
																	<input type="hidden" name="projectId" value={p.id} />
																	<input type="hidden" name="name" value={p.name} />
																	<input type="hidden" name="description" value={p.description} />
																	<input type="hidden" name="domainId" value={target.id} />
																	<button type="submit" class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-ink-700 transition hover:bg-surface-sunken hover:text-brand-600">
																		<IconifyIcon icon={target.icon} width="14" height="14" /> <span class="truncate">{target.name}</span>
																	</button>
																</form>
															{/each}
														</div>
													</div>
													{/if}
												</div>
											<!-- Shipping is the one stage Lyriks never derives: a person
											     declares it, from here. -->
											<form method="POST" action="?/markProjectShipped" use:enhance={() => { projectMenuOpenId = null; return async ({ update }) => update(); }}>
												<input type="hidden" name="projectId" value={p.id} />
												<input type="hidden" name="shipped" value={isShipped(p) ? 'false' : 'true'} />
												<button type="submit" class="flex w-full items-center gap-2 px-3 py-2 text-left font-medium transition hover:bg-surface-sunken hover:text-brand-600">
													<Icon name={isShipped(p) ? 'rotate' : 'flag'} size={14} />
													{isShipped(p) ? 'Not shipped after all' : 'Mark as shipped'}
												</button>
											</form>
											<!-- A plain link, not fetch(): the browser's own download
											     handles a large bundle without buffering it in a tab. -->
											<a
												href="/api/projects/{p.id}/export"
												download
												onclick={() => (projectMenuOpenId = null)}
												class="flex w-full items-center gap-2 px-3 py-2 text-left font-medium transition hover:bg-surface-sunken hover:text-brand-600"
											>
												<Icon name="download" size={14} /> Download a copy
											</a>
											<div class="mt-1 border-t border-line pt-1">
												<button type="button" onclick={() => requestProjectDelete(p)} class="flex w-full items-center gap-2 px-3 py-2 text-left font-medium text-danger-500 transition hover:bg-danger-50">
													<Icon name="x" size={14} /> Delete project
												</button>
											</div>
										</div>
									{/if}
								</div>
								{/if}
							</div>

							<div class="mt-2 flex items-center gap-2">
								<span class="rounded-pill px-2 py-0.5 text-[10px] font-semibold {STAGE_TONE[p.stage] ?? 'bg-slate-100 text-slate-600'}" title="Derived from the live spec, not a declared value">{stageLabel(p.stage)}</span>
							</div>

							<div class="mt-3 space-y-2">
								<!-- The card's gauges use the canonical project-health vocabulary. -->
								{#each [['Coverage', p.coverageScore], ['Behavior maturity', p.maturityScore], ['Build readiness', p.readinessScore]] as [label, pct] (label)}
									<div>
										{#if label === 'Build readiness'}
											<div class="flex justify-between text-[11px]"><span class="text-ink-500">{label}</span><span class="font-semibold text-ink-700">{maturityStageLabel(stageFromScore(pct as number))}</span></div>
											<MaturityBar score={pct as number} class="mt-1" />
										{:else}
											<div class="flex justify-between text-[11px]"><span class="text-ink-500">{label}</span><span class="font-semibold text-ink-700">{pct}%</span></div>
											<div class="mt-0.5 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
												<div class="h-full rounded-full" style="width:{pct}%; background:{barFill(pct as number)}"></div>
											</div>
										{/if}
									</div>
								{/each}
							</div>

							<div class="mt-3 flex items-center justify-between border-t border-line pt-2 text-[11px] text-ink-400">
								<span>{p.featureCount} features</span>
								<span>{rel(p.lastSavedAt)}</span>
							</div>
							<a href={`/projects/${p.id}/foundation`} class="mt-2 flex items-center justify-between text-xs font-semibold text-brand-600 hover:underline">
								Open project <Icon name="arrow-right" size={13} />
							</a>
						</div>
					{/each}

					<button type="button" onclick={() => (showNewProject = true)} class="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-line bg-surface/50 p-6 text-center text-ink-400 transition hover:border-brand-300 hover:text-brand-500">
						<Icon name="plus" size={22} />
						<span class="text-sm font-semibold">New project</span>
						<span class="text-[11px]">From scratch, or from an existing codebase</span>
					</button>
				</div>
			</div>
		{/if}
	</main>
	</div>
</div>

<!-- ── New domain modal ─────────────────────────────────────────── -->
{#if showNewDomain}
	<div class="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) closeNewDomain(); }}>
		<form method="POST" action="?/createDomain" use:enhance={() => async ({ result, update }) => { await update(); if (result.type === 'success') closeNewDomain(); }} class="w-full max-w-md rounded-card bg-ink-900 p-5 text-white shadow-xl">
			<div class="mb-4 flex items-center justify-between"><h2 class="text-base font-bold">Create a new domain</h2><button type="button" onclick={closeNewDomain} class="text-ink-400 hover:text-white"><Icon name="x" size={16} /></button></div>
			<p class="mb-2 block text-[10px] font-semibold uppercase tracking-wide text-ink-400">Enterprise domain</p>
			<div class="mb-3 flex flex-wrap gap-1.5">
				{#each DOMAIN_OPTIONS as option (option.name)}
					<button
						type="button"
						onclick={() => {
							newDomainName = option.name;
							newDomainIcon = option.icon;
						}}
						class="flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[11px] font-medium transition {newDomainName === option.name ? 'border-brand-300 bg-brand-500 text-white' : 'border-white/15 bg-white/5 text-ink-200 hover:border-white/30 hover:text-white'}"
					>
						<IconifyIcon icon={option.icon} width="13" height="13" /> {option.name}
					</button>
				{/each}
			</div>
			<p class="mb-2 block text-[10px] font-semibold uppercase tracking-wide text-ink-400">Icon</p>
			<div class="mb-3 flex flex-wrap gap-1.5">
				{#each DOMAIN_ICON_OPTIONS as option (option.icon)}
					<button
						type="button"
						onclick={() => (newDomainIcon = option.icon)}
						class="grid size-8 place-items-center rounded-field border transition {newDomainIcon === option.icon ? 'border-brand-300 bg-brand-500 text-white' : 'border-white/15 bg-white/5 text-ink-200 hover:border-white/30 hover:text-white'}"
						aria-label={`Use ${option.name} icon`}
						title={option.name}
					>
						<IconifyIcon icon={option.icon} width="15" height="15" />
					</button>
				{/each}
			</div>
			<p class="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-ink-400">Name or custom domain</p>
			<input type="hidden" name="icon" value={newDomainIcon} />
			<input bind:value={newDomainName} name="name" autocomplete="off" placeholder="e.g. Sales, Tech, Product, Internal Tools…" class="mb-3 w-full rounded-field border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-ink-500 focus:border-brand-400" />
			<p class="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-ink-400">Description (optional)</p>
			<input bind:value={newDomainDescription} name="description" autocomplete="off" placeholder="What kind of projects live in this domain?" class="mb-4 w-full rounded-field border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-ink-500 focus:border-brand-400" />
			{#if form?.scope === 'domain' && form?.message}<p class="mb-3 text-xs text-danger-400">{form.message}</p>{/if}
			<div class="flex gap-2">
				<button type="submit" class="flex-1 rounded-field bg-linear-to-r from-brand-500 to-brand-700 px-4 py-2 text-sm font-semibold text-white hover:opacity-90">Create domain</button>
				<button type="button" onclick={closeNewDomain} class="rounded-field border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/10">Cancel</button>
			</div>
		</form>
	</div>
{/if}

<!-- ── New project modal ────────────────────────────────────────── -->
<!-- Edit domain modal -->
{#if editingDomain}
	<div class="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) closeEditDomain(); }}>
		<form method="POST" action="?/updateDomain" use:enhance={() => async ({ result, update }) => { await update(); if (result.type === 'success') closeEditDomain(); }} class="w-full max-w-md rounded-card bg-ink-900 p-5 text-white shadow-xl">
			<div class="mb-4 flex items-center justify-between"><h2 class="text-base font-bold">Edit domain</h2><button type="button" onclick={closeEditDomain} class="text-ink-400 hover:text-white"><Icon name="x" size={16} /></button></div>
			<input type="hidden" name="id" value={editingDomain.id} />
			<p class="mb-2 block text-[10px] font-semibold uppercase tracking-wide text-ink-400">Enterprise domain</p>
			<div class="mb-3 flex flex-wrap gap-1.5">
				{#each DOMAIN_OPTIONS as option (option.name)}
					<button
						type="button"
						onclick={() => {
							editDomainName = option.name;
							editDomainIcon = option.icon;
						}}
						class="flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[11px] font-medium transition {editDomainName === option.name ? 'border-brand-300 bg-brand-500 text-white' : 'border-white/15 bg-white/5 text-ink-200 hover:border-white/30 hover:text-white'}"
					>
						<IconifyIcon icon={option.icon} width="13" height="13" /> {option.name}
					</button>
				{/each}
			</div>
			<p class="mb-2 block text-[10px] font-semibold uppercase tracking-wide text-ink-400">Icon</p>
			<div class="mb-3 flex flex-wrap gap-1.5">
				{#each DOMAIN_ICON_OPTIONS as option (option.icon)}
					<button
						type="button"
						onclick={() => (editDomainIcon = option.icon)}
						class="grid size-8 place-items-center rounded-field border transition {editDomainIcon === option.icon ? 'border-brand-300 bg-brand-500 text-white' : 'border-white/15 bg-white/5 text-ink-200 hover:border-white/30 hover:text-white'}"
						aria-label={`Use ${option.name} icon`}
						title={option.name}
					>
						<IconifyIcon icon={option.icon} width="15" height="15" />
					</button>
				{/each}
			</div>
			<p class="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-ink-400">Name or custom domain</p>
			<input type="hidden" name="icon" value={editDomainIcon} />
			<input bind:value={editDomainName} name="name" autocomplete="off" placeholder="e.g. Sales, Tech, Product, Internal Tools…" class="mb-3 w-full rounded-field border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-ink-500 focus:border-brand-400" />
			<p class="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-ink-400">Description (optional)</p>
			<input bind:value={editDomainDescription} name="description" autocomplete="off" placeholder="What kind of projects live in this domain?" class="mb-4 w-full rounded-field border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-ink-500 focus:border-brand-400" />
			{#if form?.scope === 'domain' && form?.message}<p class="mb-3 text-xs text-danger-400">{form.message}</p>{/if}
			<div class="flex gap-2">
				<button type="submit" class="flex-1 rounded-field bg-linear-to-r from-brand-500 to-brand-700 px-4 py-2 text-sm font-semibold text-white hover:opacity-90">Save domain</button>
				<button type="button" onclick={closeEditDomain} class="rounded-field border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/10">Cancel</button>
			</div>
		</form>
	</div>
{/if}

<!-- Edit project modal -->
{#if editingProject}
	<div class="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) closeEditProject(); }}>
		<form method="POST" action="?/updateProject" use:enhance={() => async ({ result, update }) => { await update(); if (result.type === 'success') closeEditProject(); }} class="w-full max-w-md rounded-card bg-ink-900 p-5 text-white shadow-xl">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-base font-bold">Edit project</h2>
				<button type="button" onclick={closeEditProject} class="text-ink-400 hover:text-white"><Icon name="x" size={16} /></button>
			</div>
			<input type="hidden" name="projectId" value={editingProject.id} />

			<label class="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-ink-400" for="edit-project-name">Name</label>
			<input id="edit-project-name" bind:value={editName} name="name" maxlength="80" required class="mb-3 w-full rounded-field border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-brand-400" />

			<label class="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-ink-400" for="edit-project-description">Description</label>
			<textarea id="edit-project-description" bind:value={editDescription} name="description" rows="2" class="mb-3 w-full resize-none rounded-field border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-brand-400"></textarea>

			<label class="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-ink-400" for="edit-project-domain">Domain</label>
			<select id="edit-project-domain" bind:value={editDomainId} name="domainId" class="mb-4 w-full rounded-field border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-brand-400">
				<option value="" class="text-ink-900">Unassigned</option>
				{#each portfolio.domains as board (board.domain.id)}
					<option value={board.domain.id} class="text-ink-900">{board.domain.name}</option>
				{/each}
			</select>

			{#if form?.scope === 'project' && form?.message}<p class="mb-3 text-xs text-danger-400">{form.message}</p>{/if}
			<div class="flex gap-2">
				<button type="submit" class="flex-1 rounded-field bg-linear-to-r from-brand-500 to-brand-700 px-4 py-2 text-sm font-semibold text-white hover:opacity-90">Save changes</button>
				<button type="button" onclick={closeEditProject} class="rounded-field border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/10">Cancel</button>
			</div>
		</form>
	</div>
{/if}

{#if showNewProject}
	<div class="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) closeNewProject(); }}>
		<form method="POST" action="?/createProject" use:enhance class="w-full max-w-xl rounded-card bg-ink-900 p-5 text-white shadow-xl">
			<div class="mb-1 flex items-center justify-between">
				<h2 class="text-base font-bold">New project{newProjectDomainName ? ` in ${newProjectDomainName}` : ''}</h2>
				<button type="button" onclick={closeNewProject} class="text-ink-400 hover:text-white" aria-label="Close"><Icon name="x" size={16} /></button>
			</div>
			<p class="mb-4 text-[11px] text-ink-400">
				{#if newProjectStep === 1}Step 1 · Describe it{:else if newProjectStep === 2}Step 2 · What your agent can read{:else}{newProjectSource === 'code_to_spec' ? 'Step 2' : 'Step 3'} · The kickoff{/if}
			</p>
			<!-- What the server action reads if the user creates the project here; the visible fields are bound state so the values survive the steps. -->
			<input type="hidden" name="domainId" value={shown && shown.domain.id !== '__unassigned' ? shown.domain.id : ''} />
			<input type="hidden" name="name" value={newProjectName} />
			<input type="hidden" name="description" value={newProjectDescription} />
			<input type="hidden" name="sourceMode" value={newProjectSource} />

			{#if newProjectStep === 1}
				<p class="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-ink-400">Project name</p>
				<input bind:value={newProjectName} autocomplete="off" placeholder="e.g. Returns Portal, Onboarding Flow…" class="mb-3 w-full rounded-field border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-ink-500 focus:border-brand-400" />
				<p class="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-ink-400">Description</p>
				<input bind:value={newProjectDescription} autocomplete="off" placeholder="One-liner that describes the product" class="mb-4 w-full rounded-field border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-ink-500 focus:border-brand-400" />
				<p class="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-ink-400">Starting point</p>
				<div class="mb-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Starting point">
					{#each NEW_PROJECT_ORIGINS as origin (origin.code)}
						<label class="cursor-pointer rounded-field border px-3 py-2.5 transition focus-within:ring-2 focus-within:ring-brand-400 {newProjectSource === origin.code ? 'border-brand-400 bg-brand-500/15' : 'border-white/15 bg-white/5 hover:border-white/30'}">
							<input type="radio" value={origin.code} bind:group={newProjectSource} class="sr-only" />
							<span class="block text-sm font-semibold">{origin.label}</span>
							<span class="mt-0.5 block text-[11px] leading-snug text-ink-400">{origin.hint}</span>
						</label>
					{/each}
				</div>
				<p class="mb-4 text-[11px] leading-snug text-ink-400">Nothing is created yet. You end up with one line to paste into your AI agent, and the agent creates and specifies the project through the Lyriks MCP.</p>
				{#if newProjectError}<p class="mb-3 text-xs text-danger-300">{newProjectError}</p>{/if}
				<div class="flex gap-2">
					<button type="button" onclick={newProjectNext} class="flex-1 rounded-field bg-linear-to-r from-brand-500 to-brand-700 px-4 py-2 text-sm font-semibold text-white hover:opacity-90">Next</button>
					<button type="button" onclick={closeNewProject} class="rounded-field border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/10">Cancel</button>
				</div>
			{:else if newProjectStep === 2}
				<p class="mb-1 text-sm text-ink-200">Tick what your agent can read. Each one through its own MCP server connected to your agent, or as files of the repository the agent is open in.</p>
				<p class="mb-3 text-[11px] text-ink-400">Nothing ticked: the agent interviews you.</p>
				<div class="mb-4 flex flex-wrap gap-2">
					{#each KICKOFF_SOURCES as source (source.code)}
						{@const on = newProjectSources.includes(source.code)}
						<label class="cursor-pointer rounded-field border px-3 py-2 text-sm transition {on ? 'border-brand-400 bg-brand-500/15 text-white' : 'border-white/15 bg-white/5 text-ink-200 hover:border-white/30'}" title={source.hint}>
							<input type="checkbox" class="sr-only" checked={on} onchange={(e) => toggleNewProjectSource(source.code, e.currentTarget.checked)} />
							{source.label}
						</label>
					{/each}
				</div>
				<div class="flex gap-2">
					<button type="button" onclick={newProjectNext} class="flex-1 rounded-field bg-linear-to-r from-brand-500 to-brand-700 px-4 py-2 text-sm font-semibold text-white hover:opacity-90">Next</button>
					<button type="button" onclick={newProjectBack} class="rounded-field border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/10">Back</button>
				</div>
			{:else}
				<p class="mb-2 text-[10px] font-semibold uppercase tracking-wide text-ink-400">The one line to paste into your AI agent</p>
				<p class="mb-3 rounded-field border border-white/15 bg-black/40 px-4 py-4 font-mono text-[14px] leading-relaxed whitespace-pre-wrap text-slate-100">{newProjectPrompt}</p>
				<button type="button" onclick={copyNewProjectPrompt} class="mb-4 inline-flex items-center gap-1.5 rounded-field bg-linear-to-r from-brand-500 to-brand-700 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
					<Icon name={newProjectCopied ? 'check' : 'copy'} size={13} />
					{newProjectCopied ? 'Copied' : 'Copy the line'}
				</button>
				<div class="mb-4 space-y-1.5 rounded-field border border-white/15 bg-white/5 p-3 text-xs text-ink-200">
					<p class="font-semibold text-white">Your agent needs the Lyriks MCP of this install, once.</p>
					<p class="text-ink-400">Skip this if it already lists a server named <code class="rounded bg-white/10 px-1">lyriks</code>. Endpoint: <code class="rounded bg-white/10 px-1">{newProjectMcpUrl}</code></p>
					<p><span class="font-semibold text-ink-100">Claude Code</span> <code class="rounded bg-white/10 px-1 break-all">{newProjectCommands.claudeCode}</code> then <code class="rounded bg-white/10 px-1">/mcp</code></p>
					<p><span class="font-semibold text-ink-100">Codex</span> <code class="rounded bg-white/10 px-1 break-all">{newProjectCommands.codex}</code> then <code class="rounded bg-white/10 px-1">codex mcp login lyriks</code></p>
					{#if newProjectSource === 'code_to_spec'}
						<p class="text-ink-400">Open the agent inside the product's repository, paste the line: it creates the project here, reads the whole codebase and writes the spec.</p>
					{:else}
						<p class="text-ink-400">The tools you ticked connect the same way, each with its own MCP server (Jira, Notion, Confluence, Figma); BMAD and Spec Kit are files the agent reads in the repository. Paste the line: the agent creates the project here, reads your sources and asks you the rest.</p>
					{/if}
				</div>
				{#if newProjectError}<p class="mb-3 text-xs text-danger-300">{newProjectError}</p>{/if}
				<div class="flex flex-wrap gap-2">
					<button type="button" onclick={closeNewProject} class="flex-1 rounded-field bg-linear-to-r from-brand-500 to-brand-700 px-4 py-2 text-sm font-semibold text-white hover:opacity-90">Done, my agent creates it</button>
					<button type="submit" class="rounded-field border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/10" title="Creates the project now and opens its kickoff page, whose line carries the project id">Create it here instead</button>
					<button type="button" onclick={newProjectBack} class="rounded-field border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/10">Back</button>
				</div>
			{/if}
		</form>
	</div>
{/if}
