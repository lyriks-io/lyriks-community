<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { invalidateAll, replaceState } from '$app/navigation';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { Icon, ToggleTile, confirmDialog, type IconName } from '$ui/design-system';
	import type { AiSettings, FeedbackSettings } from '$domain/settings';
	import { FEEDBACK_EMAIL } from '$domain/feedback';
	import ComponentsSection from '$ui/settings/ComponentsSection.svelte';
	import type { Component } from 'svelte';
	import SettingsPanel from '$ui/settings/SettingsPanel.svelte';
	import { openFeedback } from '$ui/shell/feedback.svelte';
	import TopBar from '$ui/shell/TopBar.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The member roster and the Community reclaim are Enterprise panels: the
	// overlay ships them, the globs resolve to nothing in the open-source tree.
	const eeModules = import.meta.glob<{ default: Component<Record<string, unknown>> }>(
		['/src/lib/ee/ui/settings/MembersPanelBody.svelte', '/src/lib/ee/ui/settings/ReclaimPanel.svelte'],
		{ eager: true }
	);
	const EeMembersBody = eeModules['/src/lib/ee/ui/settings/MembersPanelBody.svelte']?.default ?? null;
	const EeReclaimPanel = eeModules['/src/lib/ee/ui/settings/ReclaimPanel.svelte']?.default ?? null;

	// Local editable copy (mutable, one-time snapshot of loaded data); saved to /api/settings on demand.
	let ai = $state(untrack(() => ({ ...data.ai })));
	let status = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	// ── Account (the connected identity) ─────────────────────────────────────────
	// Derived, not snapshotted: saving the name re-runs the loads, and the card
	// must then show what was actually stored.
	const account = $derived(data.account);
	// Client-safe licence view (never the raw key): everything the key reports.
	const license = $derived(data.license);
	// Seats the active licence grants. A single seat (Community, or no valid
	// licence) means a workspace may hold only its operator: the Back refuses any
	// further member, so the UI says so rather than letting an invite 403 silently.
	const licenceSeats = $derived(license?.entitlements?.seats ?? 1);
	const singleSeat = $derived(licenceSeats <= 1);
	const accountInitials = $derived.by(() => {
		const src = (account?.displayName || account?.email || 'U').trim();
		const words = src.split(/[\s._-]+/).filter(Boolean);
		if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
		return src.slice(0, 2).toUpperCase();
	});
	let accountName = $state(untrack(() => data.account?.displayName ?? ''));
	let accountFirst = $state(untrack(() => data.account?.firstName ?? ''));
	let accountLast = $state(untrack(() => data.account?.lastName ?? ''));
	let accountStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	// Two owners of the name, one editor: the local operator profile outside
	// Enterprise, my own row in the back-owned roster inside it.
	async function saveAccountName() {
		accountStatus = 'saving';
		try {
			const res = await fetch('/api/account/profile', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body:
					account?.nameSource === 'self'
						? JSON.stringify({
								firstName: accountFirst.trim(),
								lastName: accountLast.trim()
							})
						: JSON.stringify({ displayName: accountName.trim() })
			});
			if (!res.ok) throw new Error(String(res.status));
			accountStatus = 'saved';
			// The name is shell-wide (top bar, deep links): re-run the loads so every
			// surface shows the corrected identity without a manual refresh.
			await invalidateAll();
		} catch {
			accountStatus = 'error';
		}
	}

	// ── Update advisory ──────────────────────────────────────────────────────────
	// `./lyriks update` is the whole operation: it takes the pre-update backup,
	// refreshes the kit AND the images, and reconciles. Naming it here saves the
	// operator a trip to the docs at the one moment they need it.
	const UPDATE_COMMAND = 'cd ~/lyriks && ./lyriks update';
	const update = $derived(data.update);
	let copied = $state(false);
	async function copyUpdateCommand() {
		try {
			await navigator.clipboard.writeText(UPDATE_COMMAND);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			/* clipboard blocked (no HTTPS, or denied) — the command is on screen anyway */
		}
	}

	// ── Password (Enterprise: the credential lives in lyriks-back) ───────────────
	let pwCurrent = $state('');
	let pwNew = $state('');
	let pwStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	let pwError = $state('');
	async function changePassword() {
		pwStatus = 'saving';
		pwError = '';
		try {
			const res = await fetch('/api/account/password', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew })
			});
			if (!res.ok) {
				// Show what was actually wrong: "current password is incorrect" and
				// "too short" are both fixable by the person typing, and merging them
				// into one message is what makes a password form guesswork.
				const body = (await res.json().catch(() => null)) as { message?: string } | null;
				pwError =
					body?.message ||
					(res.status === 401 ? 'Current password is incorrect.' : 'Could not change the password.');
				pwStatus = 'error';
				return;
			}
			pwCurrent = '';
			pwNew = '';
			pwStatus = 'saved';
			if (pwWall) {
				pwWall = false;
				replaceState(location.pathname + location.hash, {});
			}
		} catch {
			pwError = 'Could not reach the server.';
			pwStatus = 'error';
		}
	}

	// ── Danger zone: reset workspace ─────────────────────────────────────────────
	// Destructive and irreversible, so it is triple-gated: hidden until revealed,
	// armed only when the exact phrase is typed, and confirmed once more via dialog.
	const RESET_PHRASE = 'reset workspace';
	let dangerOpen = $state(false);
	let resetPhrase = $state('');
	let resetBusy = $state(false);
	const resetArmed = $derived(resetPhrase.trim().toLowerCase() === RESET_PHRASE);

	function closeDangerZone() {
		dangerOpen = false;
		resetPhrase = '';
	}

	async function resetWorkspace() {
		if (!resetArmed || resetBusy) return;
		const ok = await confirmDialog({
			title: 'Reset workspace?',
			message:
				'This clears every local Lyriks setting and cached view in this browser, then reloads. It cannot be undone.',
			confirmLabel: 'Reset workspace',
			danger: true
		});
		if (!ok) return;
		resetBusy = true;
		try {
			Object.keys(localStorage)
				.filter((k) => k.startsWith('lyriks.'))
				.forEach((k) => localStorage.removeItem(k));
		} catch {
			/* storage unavailable; reloading is still safe */
		}
		location.reload();
	}

	// Flipping the switch saves immediately — a single authorize/block decision
	// doesn't need a separate Save step.
	async function toggleSuggestions() {
		const next = !ai.suggestionsEnabled;
		ai = { suggestionsEnabled: next };
		status = 'saving';
		try {
			const res = await fetch('/api/settings', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(ai)
			});
			if (!res.ok) throw new Error(String(res.status));
			const body = (await res.json()) as { ai: AiSettings };
			ai = { ...body.ai };
			status = 'saved';
		} catch {
			ai = { suggestionsEnabled: !next };
			status = 'error';
		}
	}

	// ── Feedback channel ─────────────────────────────────────────────────────────
	// Two knobs with two scopes: the app-wide operator switch (may the dialog
	// OFFER its online channel at all), saved like the AI switch; and this
	// browser's own channel choice, the one the dialog asks for on first use,
	// stored only in localStorage.
	let feedback = $state(untrack(() => ({ ...data.feedback })));
	let feedbackStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	async function toggleFeedbackOnline() {
		const next = !feedback.onlineEnabled;
		feedback = { onlineEnabled: next };
		feedbackStatus = 'saving';
		try {
			const res = await fetch('/api/feedback', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(feedback)
			});
			if (!res.ok) throw new Error(String(res.status));
			const body = (await res.json()) as { settings: FeedbackSettings };
			feedback = { ...body.settings };
			feedbackStatus = 'saved';
		} catch {
			feedback = { onlineEnabled: !next };
			feedbackStatus = 'error';
		}
	}

	const FEEDBACK_MODE_KEY = 'lyriks.feedback.mode';
	type FeedbackMode = 'ask' | 'online' | 'offline';
	const FEEDBACK_MODES: Array<{ id: FeedbackMode; label: string }> = [
		{ id: 'ask', label: 'Ask me first' },
		{ id: 'online', label: 'Online' },
		{ id: 'offline', label: 'Email app' }
	];
	let feedbackMode = $state<FeedbackMode>(
		untrack(() => {
			if (!browser) return 'ask';
			try {
				const value = localStorage.getItem(FEEDBACK_MODE_KEY);
				return value === 'online' || value === 'offline' ? value : 'ask';
			} catch {
				return 'ask';
			}
		})
	);
	function setFeedbackMode(next: FeedbackMode) {
		feedbackMode = next;
		try {
			if (next === 'ask') localStorage.removeItem(FEEDBACK_MODE_KEY);
			else localStorage.setItem(FEEDBACK_MODE_KEY, next);
		} catch {
			// Storage unavailable: the dialog will simply ask on each use.
		}
	}

	// The periodic invite (2h of use, then weekly at most): per-browser, muted
	// from here or from the dialog's own "Don't ask again".
	const FEEDBACK_MUTE_KEY = 'lyriks.feedback.nudge';
	let feedbackNudge = $state<boolean>(
		untrack(() => {
			if (!browser) return true;
			try {
				return localStorage.getItem(FEEDBACK_MUTE_KEY) !== 'off';
			} catch {
				return true;
			}
		})
	);
	function setFeedbackNudge(next: boolean) {
		feedbackNudge = next;
		try {
			if (next) localStorage.removeItem(FEEDBACK_MUTE_KEY);
			else localStorage.setItem(FEEDBACK_MUTE_KEY, 'off');
		} catch {
			// Storage unavailable: the invite cannot track usage there anyway.
		}
	}

	// ── Section index (nav + filter) ─────────────────────────────────────────────
	type SectionDef = {
		id: string;
		label: string;
		icon: IconName;
		keywords: string;
		when?: boolean;
		/** Rail pill naming the edition that unlocks an inactive section. */
		badge?: string;
	};
	// Member management is Enterprise-only. Below that edition the section stays
	// listed and rendered, inactive and badged, so the capability is discoverable
	// and the edition that unlocks it is named where the operator would look.
	const membersAdmin = untrack(() => data.membersAdmin as { locked?: boolean; workspace?: { name: string; role: string } | null } | null);
	const membersLocked = membersAdmin?.locked === true || !EeMembersBody;
	const membersShown = !!membersAdmin && (membersLocked || !!membersAdmin.workspace);
	const SECTIONS: SectionDef[] = [
		{ id: 'account', label: 'Account', icon: 'shield', keywords: 'account name email edition connected profile identity sign in' },
		{ id: 'ai', label: 'AI suggestions', icon: 'sparkles', keywords: 'ai suggestions llm mcp authorize block switch' },
		{ id: 'feedback', label: 'Feedback', icon: 'megaphone', keywords: 'feedback share message bug idea contact email online channel send team' },
		{ id: 'members', label: 'Members', icon: 'users', keywords: 'members team invite invitations role admin designer viewer access projects scope grant first last name enterprise edition', when: membersShown, badge: membersLocked ? 'Enterprise' : undefined },
		{ id: 'reclaim', label: 'Reclaim projects', icon: 'download', keywords: 'reclaim community enterprise ownership projects verify', when: untrack(() => !!data.reclaim) },
		{ id: 'versions', label: 'Versions', icon: 'layers', keywords: 'version versions build image tag commit release platform unspaghettit engine back dpo postgres node support components install' },
		{ id: 'danger', label: 'Danger zone', icon: 'circle-alert', keywords: 'danger reset workspace destructive irreversible wipe' }
	];
	// Header annotation: the platform release, plus how much of the install is
	// actually reporting — an unreachable component is visible before opening.
	const versionsMeta = $derived.by(() => {
		const platform = data.components.find((c) => c.id === 'platform');
		const missing = data.components.filter((c) => c.status === 'unreachable').length;
		const release = platform?.version ? `v${platform.version}` : 'unknown release';
		return missing ? `${release} · ${missing} unreachable` : release;
	});
	let query = $state('');
	function sectionMatches(s: SectionDef): boolean {
		const q = query.trim().toLowerCase();
		if (!q) return true;
		return `${s.label} ${s.keywords}`.toLowerCase().includes(q);
	}
	const visibleSections = $derived(
		SECTIONS.filter((s) => (s.when ?? true) && sectionMatches(s))
	);
	const shown = $derived(new Set(visibleSections.map((s) => s.id)));

	// Exclusive accordion: at most one panel open, none by default. A #hash
	// deep-link (e.g. the user menu's /settings#members) opens that panel on load.
	let openSection = $state<string | null>(null);
	function togglePanel(id: string) {
		openSection = openSection === id ? null : id;
		// replaceState through SvelteKit so `page.url` follows; the raw History API
		// changes the address bar without telling the router, and the effect above
		// would then re-open the panel this just closed.
		replaceState(openSection ? `#${openSection}` : location.pathname, {});
	}
	// Read the hash from the reactive URL, not from `location`.
	//
	// `location.hash` is a plain property, so this effect had nothing to depend on
	// and ran once, at mount. Following /settings#account from the user menu while
	// already ON /settings is a hash change and nothing more — no navigation, no
	// remount — so the panel never opened and the menu item looked dead. It worked
	// from anywhere else, which is what made it look like the link was wrong
	// rather than the listener.
	$effect(() => {
		// Read BOTH, because neither alone is enough.
		//
		// `location.hash` is not reactive, so on its own the effect ran once at
		// mount: arriving at /settings#account worked, following the same link while
		// already there did nothing. `page.url.hash` is reactive and fixes that, but
		// it is EMPTY on first load (a hash is never sent to the server, so hydration
		// starts from a URL without one), which broke the arriving case instead.
		// Depending on page.url keeps the effect reactive; falling back to
		// location.hash covers the one render it cannot describe.
		const id = (page.url.hash || (browser ? location.hash : '')).slice(1);
		if (SECTIONS.some((s) => s.id === id)) openSection = id;
		// The forced password-change wall (hooks.server.ts) sends the user here
		// with ?password=change. The query is the fallback the fragment cannot
		// be: fragments never reach the server and can be dropped by proxies or
		// hand-typed URLs, and landing on a page of closed panels hides the one
		// form the user was sent to fill. An explicit hash still wins.
		else if (page.url.searchParams.get('password') === 'change') openSection = 'account';
	});

	// ── Forced password change (the wall in hooks.server.ts sends the user here) ──
	// The redirect alone explains nothing: the banner says WHY the app is locked,
	// and the spotlight on the form says WHERE the way out is. Both clear the
	// moment the password is changed; the marker is dropped from the URL so a
	// refresh doesn't re-point at a wall that no longer exists.
	let pwWall = $state(browser && new URLSearchParams(location.search).get('password') === 'change');
	$effect(() => {
		if (!pwWall) return;
		openSection = 'account';
		tick().then(() => {
			document.getElementById('password-zone')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			document.getElementById('pw-current')?.focus({ preventScroll: true });
		});
	});

	// The page scrolls inside its own container (the app shell is overflow-hidden),
	// so a bare `#id` link has nothing to move; open the panel and scroll explicitly.
	function jumpTo(e: MouseEvent, id: string) {
		e.preventDefault();
		openSection = id;
		document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		history.replaceState(null, '', `#${id}`);
	}
</script>

<!-- The same shared chrome as the portfolio and every project page, so settings
     doesn't read as a different app (logo · search · user menu). -->
<TopBar
	sessionEmail={data.session?.email}
	memberName={data.memberName}
	workspaces={data.workspaces}
	activeWorkspace={data.activeWorkspace}
/>

<div class="min-h-0 flex-1 overflow-y-auto">
<div class="mx-auto max-w-5xl px-6 py-10">
	<div class="mb-6 flex items-center gap-3">
		<a href="/" class="text-ink-400 hover:text-ink-700" aria-label="Back to projects">
			<Icon name="arrow-left" size={18} />
		</a>
		<div>
			<h1 class="text-xl font-bold text-ink-900">Settings</h1>
			<p class="text-xs text-ink-500">App-level configuration for the {account?.editionLabel ?? 'Lyriks'} edition.</p>
		</div>
	</div>

	{#if pwWall}
		<div class="mb-6 flex items-start gap-3 rounded-field border border-warning-300 bg-warning-50 px-4 py-3">
			<span class="mt-0.5 text-warning-500"><Icon name="lock" size={16} /></span>
			<div>
				<p class="text-sm font-semibold text-ink-900">Choose your own password to unlock the app</p>
				<p class="text-xs text-ink-600">
					You are signed in with the temporary password generated at install time. Every page
					stays locked until you replace it in the highlighted form below, using the temporary
					password as the current one.
				</p>
			</div>
		</div>
	{/if}

	<div class="grid gap-6 md:grid-cols-[188px_1fr]">
		<!-- Section rail: filter + jump links. Sticky on desktop. -->
		<aside class="space-y-3 md:sticky md:top-6 md:self-start">
			<div class="relative">
				<span class="pointer-events-none absolute inset-y-0 left-2.5 grid place-items-center text-ink-400">
					<Icon name="search" size={14} />
				</span>
				<input
					bind:value={query}
					type="search"
					placeholder="Search settings…"
					aria-label="Search settings"
					class="w-full rounded-pill border border-line bg-surface py-1.5 pl-8 pr-3 text-sm text-ink-900 outline-none focus:border-brand-300"
				/>
			</div>
			<nav class="flex flex-col gap-0.5">
				{#each visibleSections as s (s.id)}
					<a
						href="#{s.id}"
						onclick={(e) => jumpTo(e, s.id)}
						class="flex items-center gap-2 rounded-field px-2.5 py-1.5 text-sm font-medium text-ink-600 transition hover:bg-surface-sunken hover:text-ink-900 {s.id === 'danger' ? 'text-danger-500 hover:text-danger-600' : ''}"
					>
						<Icon name={s.icon} size={14} />
						{s.label}
						{#if s.badge}
							<span class="ml-auto rounded-pill bg-brand-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-brand-600">{s.badge}</span>
						{/if}
					</a>
				{:else}
					<p class="px-2.5 py-1.5 text-xs text-ink-400">No section matches.</p>
				{/each}
			</nav>
		</aside>

		<!-- Sections -->
		<div class="min-w-0 space-y-5">
			{#if shown.has('account')}
				<SettingsPanel
					id="account"
					title="Account"
					icon="shield"
					meta="{account?.editionLabel} edition"
					open={openSection === 'account'}
					onToggle={togglePanel}
				>
					<div class="flex items-center gap-3">
						<span class="grid size-11 shrink-0 place-items-center rounded-full text-sm font-bold text-white gradient-warm">
							{accountInitials}
						</span>
						<div class="min-w-0">
							<p class="truncate text-sm font-semibold text-ink-900">
								{account?.displayName || account?.email || 'Local operator'}
							</p>
							{#if account?.email}
								<p class="truncate text-xs text-ink-500">{account.email}</p>
							{:else}
								<p class="truncate text-xs text-ink-400">No sign-in required in this edition.</p>
							{/if}
						</div>
					</div>

					<div class="grid grid-cols-2 gap-3 rounded-field border border-line bg-surface-sunken/40 p-3 text-xs">
						<div>
							<p class="font-semibold uppercase tracking-[0.14em] text-ink-400">Edition</p>
							<p class="mt-0.5 text-ink-800">{account?.editionLabel}</p>
						</div>
						<div>
							<p class="font-semibold uppercase tracking-[0.14em] text-ink-400">Workspace role</p>
							<p class="mt-0.5 text-ink-800">{account?.role ?? 'None'}</p>
						</div>
					</div>

					<!-- Everything the licence key reports, right where the operator looks
					     themselves up. Client-safe view only; the raw key never leaves the
					     server. Managing (activate / replace) stays on /activate. -->
					{#if license}
						<div class="rounded-field border border-line bg-surface-sunken/40 p-3 text-xs">
							<div class="mb-2 flex items-center justify-between">
								<p class="font-semibold uppercase tracking-[0.14em] text-ink-400">Licence</p>
								<a href="/activate" class="font-medium text-brand-600 hover:underline">Manage</a>
							</div>
							{#if license.entitlements}
								<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
									<div>
										<p class="text-ink-400">Licensed to</p>
										<p class="mt-0.5 font-medium text-ink-800">{license.entitlements.customer}</p>
									</div>
									<div>
										<p class="text-ink-400">Edition</p>
										<p class="mt-0.5 capitalize text-ink-800">{license.entitlements.edition}</p>
									</div>
									<div>
										<p class="text-ink-400">Seats</p>
										<p class="mt-0.5 text-ink-800">{license.entitlements.seats}</p>
									</div>
									<div>
										<p class="text-ink-400">Expires</p>
										<p class="mt-0.5 text-ink-800">
											{#if license.entitlements.expiresAt}
												{license.entitlements.expiresAt.slice(0, 10)}{license.daysRemaining != null
													? ` (${license.daysRemaining} days left)`
													: ''}
											{:else}
												Never (perpetual)
											{/if}
										</p>
									</div>
									<div>
										<p class="text-ink-400">Issued</p>
										<p class="mt-0.5 text-ink-800">{license.entitlements.issuedAt.slice(0, 10)}</p>
									</div>
									<div>
										<p class="text-ink-400">Activated</p>
										<p class="mt-0.5 text-ink-800">
											{license.activatedAt ? license.activatedAt.slice(0, 10) : 'Not yet'}
										</p>
									</div>
									<div class="col-span-2 sm:col-span-3">
										<p class="text-ink-400">Licence id</p>
										<p class="mt-0.5 font-mono text-[11px] text-ink-600">{license.entitlements.licenseId}</p>
									</div>
								</div>
								{#if license.status !== 'active'}
									<p class="mt-2 font-medium text-danger-500">
										Status: {license.status.replace('_', ' ')}. See /activate.
									</p>
								{/if}
							{:else}
								<p class="text-ink-500">
									Not activated.
									<a class="font-medium text-brand-600 hover:underline" href="/activate">Activate now</a>.
								</p>
							{/if}
						</div>
					{/if}

					{#if account?.nameSource === 'self'}
						<!-- Enterprise: the back owns the identity as first + last name, and an
						     account bootstrapped from an email alone starts without either.
						     Editing is self-service — it needs no workspace and no role. -->
						<div class="space-y-2">
							<p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">Your name</p>
							<div class="flex flex-wrap items-end gap-2">
								<div class="min-w-40 flex-1">
									<label class="block text-xs text-ink-500" for="account-first">First name</label>
									<input
										id="account-first"
										bind:value={accountFirst}
										maxlength="80"
										placeholder="First name"
										class="mt-1 w-full rounded-field border border-line bg-surface px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand-300"
									/>
								</div>
								<div class="min-w-40 flex-1">
									<label class="block text-xs text-ink-500" for="account-last">Last name</label>
									<input
										id="account-last"
										bind:value={accountLast}
										maxlength="80"
										placeholder="Last name"
										class="mt-1 w-full rounded-field border border-line bg-surface px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand-300"
									/>
								</div>
								<button
									type="button"
									onclick={saveAccountName}
									disabled={accountStatus === 'saving'}
									class="rounded-field bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
								>
									{accountStatus === 'saving' ? 'Saving…' : 'Save'}
								</button>
							</div>
							{#if accountStatus === 'saved'}
								<span class="text-xs font-medium text-success-600">Saved.</span>
							{:else if accountStatus === 'error'}
								<span class="text-xs font-medium text-danger-500">Couldn’t save.</span>
							{/if}
						</div>
					{:else if account?.nameSource === 'operator'}
						<div class="space-y-2">
							<label class="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400" for="account-name">
								Display name
							</label>
							<div class="flex flex-wrap items-center gap-2">
								<input
									id="account-name"
									bind:value={accountName}
									maxlength="80"
									placeholder="How you want to appear"
									class="min-w-56 flex-1 rounded-field border border-line bg-surface px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand-300"
								/>
								<button
									type="button"
									onclick={saveAccountName}
									disabled={accountStatus === 'saving'}
									class="rounded-field bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
								>
									{accountStatus === 'saving' ? 'Saving…' : 'Save'}
								</button>
								{#if accountStatus === 'saved'}
									<span class="text-xs font-medium text-success-600">Saved.</span>
								{:else if accountStatus === 'error'}
									<span class="text-xs font-medium text-danger-500">Couldn’t save.</span>
								{/if}
							</div>
						</div>
					{/if}

					{#if account?.canChangePassword}
						<!-- The installer prints a temporary password and says to change it on
						     first login. Without this there was nowhere to do that. Shown for
						     every authenticated edition (Community's operator included), which
						     is what canChangePassword states. Under the wall (pwWall) the block
						     is spotlit: the banner up top explains why the app is locked, this
						     marks the exact way out. -->
						<div
							id="password-zone"
							class={pwWall
								? 'mt-4 space-y-2 rounded-field border-2 border-warning-300 bg-warning-50 p-4 ring-4 ring-warning-100'
								: 'mt-4 space-y-2 border-t border-line pt-4'}
						>
							<p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">Password</p>
							<div class="flex flex-wrap items-end gap-2">
								<label class="sr-only" for="pw-current">Current password</label>
								<input
									id="pw-current"
									type="password"
									autocomplete="current-password"
									bind:value={pwCurrent}
									placeholder="Current password"
									class="min-w-48 flex-1 rounded-field border border-line bg-surface px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand-300"
								/>
								<label class="sr-only" for="pw-new">New password</label>
								<input
									id="pw-new"
									type="password"
									autocomplete="new-password"
									bind:value={pwNew}
									placeholder="New password"
									class="min-w-48 flex-1 rounded-field border border-line bg-surface px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand-300"
								/>
								<button
									type="button"
									onclick={changePassword}
									disabled={pwStatus === 'saving' || !pwCurrent || !pwNew}
									class="rounded-field bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
								>
									{pwStatus === 'saving' ? 'Changing…' : 'Change password'}
								</button>
							</div>
							{#if pwStatus === 'saved'}
								<p class="text-xs font-medium text-success-600">Password changed.</p>
							{:else if pwStatus === 'error'}
								<p class="text-xs font-medium text-danger-500">{pwError}</p>
							{:else}
								<p class="text-xs text-ink-500">At least 12 characters, and different from the current one.</p>
							{/if}
						</div>
					{/if}
				</SettingsPanel>
			{/if}

			{#if shown.has('ai')}
				<SettingsPanel
					id="ai"
					title="AI suggestions"
					icon="sparkles"
					open={openSection === 'ai'}
					onToggle={togglePanel}
				>
					<p class="text-xs text-ink-500">
						Suggestions are always generated by your own LLM working through the Lyriks MCP;
						Lyriks never calls an AI service itself. This switch authorizes or blocks that
						generation for the whole workspace.
					</p>

					<ToggleTile
						title={ai.suggestionsEnabled ? 'AI suggestions authorized' : 'AI suggestions blocked'}
						hint={ai.suggestionsEnabled
							? 'An LLM connected through the Lyriks MCP may generate suggestions into your projects.'
							: 'MCP suggestion writes are rejected and nothing is shown in the wizard.'}
						selected={ai.suggestionsEnabled}
						onToggle={toggleSuggestions}
					/>

					<div class="flex items-center gap-3">
						{#if status === 'saving'}
							<span class="text-xs font-medium text-ink-500">Saving…</span>
						{:else if status === 'saved'}
							<span class="text-xs font-medium text-success-600">Saved.</span>
						{:else if status === 'error'}
							<span class="text-xs font-medium text-danger-500">Couldn’t save.</span>
						{/if}
					</div>
				</SettingsPanel>
			{/if}

			{#if shown.has('feedback')}
				<SettingsPanel
					id="feedback"
					title="Feedback"
					icon="megaphone"
					open={openSection === 'feedback'}
					onToggle={togglePanel}
				>
					<p class="text-xs text-ink-500">
						The feedback dialog (Leave us feedback, in the header) sends the user's notes to the Lyriks
						team, one entry per note. Online, they go from the user's own browser to the Lyriks
						feedback service; offline, a pre-filled email to {FEEDBACK_EMAIL} carries them. The
						appliance itself never calls out either way.
					</p>

					<ToggleTile
						title={feedback.onlineEnabled ? 'Online channel offered' : 'Online channel hidden'}
						hint={feedback.onlineEnabled
							? 'Users may choose to send feedback over the internet, from their own browser, after an explicit per-browser opt-in.'
							: 'The dialog only offers the email and copy channels.'}
						selected={feedback.onlineEnabled}
						onToggle={toggleFeedbackOnline}
					/>
					<div class="flex items-center gap-3">
						{#if feedbackStatus === 'saving'}
							<span class="text-xs font-medium text-ink-500">Saving…</span>
						{:else if feedbackStatus === 'saved'}
							<span class="text-xs font-medium text-success-600">Saved.</span>
						{:else if feedbackStatus === 'error'}
							<span class="text-xs font-medium text-danger-500">Couldn’t save (admin only).</span>
						{/if}
					</div>

					<div class="space-y-2 border-t border-line pt-4">
						<p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
							Your channel in this browser
						</p>
						<div class="flex gap-1.5">
							{#each FEEDBACK_MODES as m (m.id)}
								<button
									type="button"
									aria-pressed={feedbackMode === m.id}
									onclick={() => setFeedbackMode(m.id)}
									class="rounded-pill border px-2.5 py-1 text-xs font-medium transition {feedbackMode === m.id
										? 'border-brand-400 bg-brand-500/10 text-brand-600'
										: 'border-line text-ink-500 hover:text-ink-700'}"
								>
									{m.label}
								</button>
							{/each}
						</div>
						<p class="text-xs text-ink-500">
							Stored only in this browser. “Ask me first” makes the dialog ask again on its next
							use.
						</p>
					</div>

					<div class="space-y-2 border-t border-line pt-4">
						<p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
							Periodic invite
						</p>
						<div class="flex gap-1.5">
							{#each [{ id: true, label: 'On' }, { id: false, label: 'Off' }] as option (option.label)}
								<button
									type="button"
									aria-pressed={feedbackNudge === option.id}
									onclick={() => setFeedbackNudge(option.id)}
									class="rounded-pill border px-2.5 py-1 text-xs font-medium transition {feedbackNudge === option.id
										? 'border-brand-400 bg-brand-500/10 text-brand-600'
										: 'border-line text-ink-500 hover:text-ink-700'}"
								>
									{option.label}
								</button>
							{/each}
						</div>
						<p class="text-xs text-ink-500">
							After two hours of use the dialog invites you once on its own, then at most weekly,
							and pauses for a month once you have sent something. Also per-browser.
						</p>
					</div>

					<button
						type="button"
						onclick={() => openFeedback()}
						class="rounded-field border border-line px-3 py-2 text-xs font-semibold text-ink-700 hover:bg-surface-sunken"
					>
						Share feedback now
					</button>
				</SettingsPanel>
			{/if}

			{#if data.reclaim && EeReclaimPanel && shown.has('reclaim')}
				<EeReclaimPanel reclaim={data.reclaim} open={openSection === 'reclaim'} onToggle={togglePanel} />
			{/if}

			{#if membersAdmin && membersShown && shown.has('members')}
				<SettingsPanel
					id="members"
					title="Members"
					icon="users"
					meta={membersLocked
						? 'Enterprise edition'
						: membersAdmin?.workspace
							? `${membersAdmin.workspace.name} · you are ${membersAdmin.workspace.role}`
							: undefined}
					open={openSection === 'members'}
					onToggle={togglePanel}
				>
					{#if membersLocked}
						<!-- Inactive below Enterprise: the notice names the edition, and the
						     section is rendered greyed and inert underneath so the operator
						     still sees what it offers. Every write it could make is refused
						     server-side regardless by the Enterprise overlay's membership
						     check, then by its seat gate. -->
						<div
							data-testid="members-locked"
							class="flex items-start gap-3 rounded-field border border-brand-200 bg-brand-50/60 p-3"
						>
							<span class="grid size-8 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-600">
								<Icon name="lock" size={15} />
							</span>
							<div class="min-w-0 space-y-1">
								<p class="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-900">
									Available in the Enterprise edition
									<span class="rounded-pill bg-brand-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">Enterprise</span>
								</p>
								<p class="text-xs text-ink-600">
									Inviting colleagues, setting their roles and choosing which projects they can
									see are part of the Enterprise edition. This install runs the
									{account?.editionLabel} edition, which holds its single operator.
									<a class="font-medium text-brand-600 hover:underline" href="/activate">Manage licence</a>.
								</p>
							</div>
						</div>
					{:else if EeMembersBody}
						<EeMembersBody admin={data.membersAdmin} {singleSeat} />
					{/if}
				</SettingsPanel>
			{/if}

			{#if shown.has('versions')}
				<SettingsPanel
					id="versions"
					title="Versions"
					icon="layers"
					meta={versionsMeta}
					open={openSection === 'versions'}
					onToggle={togglePanel}
				>
					{#if update?.state === 'available'}
						<!-- Advisory only. The platform container has no Docker socket and
						     must never be given one to update itself, so the most this can
						     do is name the command — which is also the thing an operator
						     otherwise has to go and look up. -->
						<div class="mb-3 space-y-2 rounded-field border border-brand-200 bg-brand-50/60 p-3">
							<p class="text-sm font-semibold text-ink-900">
								Version {update.latest} is available
								<span class="font-normal text-ink-500">— you are on {update.current}</span>
							</p>
							<p class="text-xs text-ink-600">Run this on the appliance host:</p>
							<div class="flex items-center gap-2">
								<code
									class="flex-1 overflow-x-auto rounded-field border border-line bg-surface px-3 py-2 font-mono text-xs text-ink-900"
									>{UPDATE_COMMAND}</code
								>
								<button
									type="button"
									onclick={copyUpdateCommand}
									class="shrink-0 rounded-field border border-line px-3 py-2 text-xs font-semibold text-ink-700 hover:bg-surface-sunken"
								>
									{copied ? 'Copied' : 'Copy'}
								</button>
							</div>
							<p class="text-xs text-ink-500">
								It takes a verified backup first, updates the kit and the images, and
								reconciles the stack.
							</p>
						</div>
					{:else if update?.state === 'current'}
						<p class="mb-3 text-xs font-medium text-success-600">
							Up to date — {update.current} is the newest published release.
						</p>
					{/if}
					<ComponentsSection components={data.components} />
				</SettingsPanel>
			{/if}

			{#if shown.has('danger')}
				<SettingsPanel
					id="danger"
					title="Danger zone"
					icon="circle-alert"
					tone="danger"
					open={openSection === 'danger'}
					onToggle={togglePanel}
				>
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<p class="text-sm font-medium text-ink-900">Reset workspace</p>
							<p class="mt-0.5 text-xs text-ink-600">
								Clears every local Lyriks setting and cached view in this browser, then reloads. This
								cannot be undone.
							</p>
						</div>
						{#if !dangerOpen}
							<button
								type="button"
								onclick={() => (dangerOpen = true)}
								class="shrink-0 rounded-field border border-danger-300 px-3 py-1.5 text-xs font-semibold text-danger-600 transition hover:bg-danger-50"
							>
								Reveal
							</button>
						{/if}
					</div>
					{#if dangerOpen}
						<div class="space-y-2.5 rounded-field border border-danger-200 bg-surface p-3">
							<label class="block text-xs text-ink-700" for="reset-confirm">
								Type <span class="font-mono font-semibold text-danger-600">reset workspace</span> to enable
								the button.
							</label>
							<input
								id="reset-confirm"
								bind:value={resetPhrase}
								autocomplete="off"
								autocapitalize="none"
								spellcheck="false"
								placeholder="reset workspace"
								class="w-full rounded-field border border-line bg-surface px-3 py-2 text-sm text-ink-900 outline-none focus:border-danger-300"
							/>
							<div class="flex items-center gap-2">
								<button
									type="button"
									onclick={resetWorkspace}
									disabled={!resetArmed || resetBusy}
									class="rounded-field bg-danger-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-danger-600 disabled:cursor-not-allowed disabled:opacity-40"
								>
									{resetBusy ? 'Resetting…' : 'Reset workspace'}
								</button>
								<button
									type="button"
									onclick={closeDangerZone}
									class="rounded-field border border-line px-3 py-2 text-sm font-medium text-ink-600 transition hover:bg-surface-sunken"
								>
									Cancel
								</button>
							</div>
						</div>
					{/if}
				</SettingsPanel>
			{/if}

			{#if visibleSections.length === 0}
				<div class="rounded-card border border-line bg-surface p-8 text-center text-sm text-ink-400">
					No settings match “{query}”.
				</div>
			{/if}
		</div>
	</div>
</div>
</div>
