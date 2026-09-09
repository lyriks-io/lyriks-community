<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Icon } from '$ui/design-system';
	import type { WorkspaceSummary } from '$application/ports';
	import { PROJECT_TOOL_CAPABILITIES } from './capabilities';
	import { memberInitials, memberNameFromEmail } from './member-identity';

	// The active user's identity. `memberName` is the one name the app resolves
	// (workspace member → operator profile → email), so the menu shows exactly
	// what Settings and every deep link show; the email-derived form is only the
	// fallback for the local dev session, which carries no name.
	let {
		email,
		memberName,
		workspaces = [],
		activeWorkspace = null,
		projectId
	}: {
		email?: string;
		/** The app-wide resolved display name of the active user. */
		memberName?: string;
		/** Teams the caller belongs to; the workspace switcher shows only with 2+. */
		workspaces?: WorkspaceSummary[];
		activeWorkspace?: string | null;
		/** Present inside a project; surfaces the "Project tools" section. */
		projectId?: string;
	} = $props();

	let open = $state(false);

	const name = $derived(memberName?.trim() || memberNameFromEmail(email));
	const initials = $derived(memberInitials(name));

	const close = () => (open = false);

	// Dismiss on outside click / Escape while the menu is open.
	$effect(() => {
		if (!open) return;
		const onClick = (e: MouseEvent) => {
			if (!(e.target as HTMLElement).closest('[data-user-root]')) close();
		};
		const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
		document.addEventListener('click', onClick);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('click', onClick);
			document.removeEventListener('keydown', onKey);
		};
	});

	// Workspace switching, dormant on a single-workspace install, ready for many:
	// the section renders only with 2+ teams, and switching sets the server cookie
	// then re-resolves the page (same contract as the header WorkspaceSwitcher).
	const activeId = $derived(activeWorkspace ?? workspaces[0]?.id ?? '');
	let switching = $state(false);
	async function switchWorkspace(id: string) {
		if (id === activeId || switching) return;
		switching = true;
		try {
			await fetch('/api/workspaces', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ workspaceId: id })
			});
			await invalidateAll();
			close();
		} finally {
			switching = false;
		}
	}

</script>

<div class="relative" data-user-root>
	<button
		type="button"
		onclick={() => (open = !open)}
		aria-haspopup="menu"
		aria-expanded={open}
		aria-label="User menu"
		title={name}
		class="grid size-8 place-items-center rounded-full border border-white/30 bg-white/20 text-xs font-bold text-white outline-none transition hover:bg-white/30 focus-visible:ring-2 focus-visible:ring-white/60"
	>
		{initials}
	</button>

	{#if open}
		<div
			role="menu"
			tabindex="-1"
			class="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-card border border-white/10 bg-ink-900 text-white shadow-pop"
		>
			<div class="border-b border-white/5 px-4 py-3">
				<div class="flex items-center gap-3">
					<span class="grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white gradient-warm">
						{initials}
					</span>
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-semibold text-white">{name}</p>
						{#if email}
							<p class="truncate text-[11px] text-white/40">{email}</p>
						{/if}
					</div>
				</div>
				<span
					class="mt-2 inline-flex items-center gap-1.5 rounded-pill bg-brand-500/15 px-2 py-0.5 text-[10px] font-medium text-brand-300"
				>
					<Icon name="shield" size={12} /> {email ? 'Signed in' : 'Local session'}
				</span>
			</div>

			{#if workspaces.length > 1}
				<div class="border-b border-white/5 p-1">
					<p class="px-3 pb-1 pt-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-white/35">
						Workspace
					</p>
					{#each workspaces as w (w.id)}
						<button
							type="button"
							role="menuitemradio"
							aria-checked={w.id === activeId}
							disabled={switching}
							onclick={() => switchWorkspace(w.id)}
							class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-white/75 transition hover:bg-white/6 hover:text-white disabled:opacity-50"
						>
							<!-- A workspace is a place, not a crowd: `users` belongs to the
							     Members entry below and means only that. -->
							<Icon name="layers" size={16} class="text-white/40" />
							<span class="min-w-0 flex-1 truncate">{w.name}</span>
							{#if w.id === activeId}
								<Icon name="check" size={15} class="text-brand-300" />
							{/if}
						</button>
					{/each}
				</div>
			{/if}

			{#if projectId && PROJECT_TOOL_CAPABILITIES.length > 0}
				<div class="border-b border-white/5 p-1">
					<p class="px-3 pb-1 pt-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-white/35">
						Project tools
					</p>
					{#each PROJECT_TOOL_CAPABILITIES as cap (cap.id)}
						<a
							href={cap.route?.(projectId)}
							role="menuitem"
							onclick={close}
							title={cap.subtitle}
							class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/75 transition hover:bg-white/6 hover:text-white"
						>
							<Icon name={cap.icon} size={16} class="text-white/40" />
							{cap.title}
						</a>
					{/each}
				</div>
			{/if}

			<div class="p-1">
				<p class="px-3 pb-1 pt-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-white/35">
					Lyriks settings
				</p>
				<a
					href="/settings#account"
					role="menuitem"
					onclick={close}
					class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/75 transition hover:bg-white/6 hover:text-white"
				>
					<Icon name="settings" size={16} class="text-white/40" />
					Account settings
				</a>
				<a
					href="/settings#members"
					role="menuitem"
					onclick={close}
					class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/75 transition hover:bg-white/6 hover:text-white"
				>
					<Icon name="users" size={16} class="text-white/40" />
					Members & invitations
				</a>
				<a
					href="/documentation"
					role="menuitem"
					onclick={close}
					class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/75 transition hover:bg-white/6 hover:text-white"
				>
					<Icon name="book" size={16} class="text-white/40" />
					Documentation
				</a>
			</div>

			<div class="border-t border-white/5 p-1">
				<form method="POST" action="/logout">
					<button
						type="submit"
						role="menuitem"
						class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-white/85 transition hover:bg-white/6"
					>
						<Icon name="log-out" size={16} class="text-white/40" />
						Sign out
					</button>
				</form>
			</div>
		</div>
	{/if}
</div>
