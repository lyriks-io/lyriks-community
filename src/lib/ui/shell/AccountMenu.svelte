<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { sortByName } from '$domain/shared';
	import type { WorkspaceSummary } from '$application/ports';
	import { pushToast } from '$ui/design-system';
	import { OptimisticActs } from '$ui/evolution/optimistic-acts.svelte';
	import { refusalOf } from './save-queue';
	import { planOf, showsPlan } from '$domain/tier';
	import PlansDialog from './PlansDialog.svelte';
	import { dismissable } from './dismissable';
	import { memberInitials, memberNameFromEmail } from './member-identity';
	import SideIcon from './SideIcon.svelte';

	// The account at the foot of the navigation (criterion 81cc595c), opening
	// upward: who is signed in, with their email and role; the teams to switch
	// between when there are several; the settings, inside a
	// project its own settings for whoever may change them (ac-proj-settings);
	// the plan on the Community edition alone, and signing out. A switch reads at once (the check,
	// the role under the name, the menu closed) while the app reads the new team
	// behind; a refusal puts the team back and says why.
	let {
		email,
		memberName,
		workspaces = [],
		activeWorkspace = null
	}: {
		email?: string;
		memberName?: string;
		workspaces?: WorkspaceSummary[];
		activeWorkspace?: string | null;
	} = $props();

	let open = $state(false);
	let plansOpen = $state(false);
	const switches = new OptimisticActs<string>();

	const name = $derived(memberName?.trim() || memberNameFromEmail(email));
	const initials = $derived(memberInitials(name));
	const activeId = $derived(switches.of('workspace') ?? activeWorkspace);
	const active = $derived(workspaces.find((w) => w.id === activeId) ?? workspaces[0] ?? null);
	const currentPlan = $derived(planOf(active?.plan ?? null));
	const planShown = $derived(showsPlan((page.data as { edition?: string | null }).edition));
	const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
	const subtitle = $derived([email, active ? capital(active.role) : null].filter(Boolean).join(' · ') || 'Local session');

	async function save(id: string): Promise<boolean> {
		const team = workspaces.find((w) => w.id === id)?.name ?? 'this team';
		let res: Response;
		try {
			res = await fetch('/api/workspaces', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ workspaceId: id })
			});
		} catch {
			pushToast({ level: 'error', message: `The switch to ${team} was not saved: you are still in your current team. Check your connection.` });
			return false;
		}
		if (!res.ok) {
			pushToast({ level: 'error', message: `The switch to ${team} was not saved: you are still in your current team. ${await refusalOf(res, 'The switch failed')}` });
			return false;
		}
		await invalidateAll();
		return true;
	}

	function switchWorkspace(id: string) {
		if (id === active?.id) return;
		open = false;
		void switches.run('workspace', id, () => save(id), () => activeWorkspace);
	}

	const close = () => (open = false);
</script>

<div class="fw" {@attach dismissable(close)}>
	{#if open}
		<div class="fm" role="menu" aria-label="Account">
			<div class="fmh">
				<strong>{name}</strong>
				<span>{subtitle}</span>
			</div>
			{#if workspaces.length > 1}
				<!-- The teams from A to Z (criterion 4b3d2b4d). -->
				{#each sortByName(workspaces) as w (w.id)}
					<button type="button" role="menuitemradio" aria-checked={w.id === active?.id} onclick={() => switchWorkspace(w.id)}>
						<SideIcon name="users" /><span class="mt">{w.name}</span>{#if w.id === active?.id}<span class="mx ck"><SideIcon name="check" size={13} strokeWidth={2.4} /></span>{/if}
					</button>
				{/each}
				<span class="fmsep"></span>
			{/if}
			<a href="/settings" role="menuitem" onclick={close}><SideIcon name="settings" /><span class="mt">Settings</span></a>
			{#if planShown}
				<button type="button" role="menuitem" onclick={() => { close(); plansOpen = true; }}>
					<SideIcon name="plan" /><span class="mt">Plan</span><span class="tag">{currentPlan.name}</span>
				</button>
			{/if}
			<span class="fmsep"></span>
			<form method="POST" action="/logout" class="contents">
				<button type="submit" role="menuitem" class="mo"><SideIcon name="signout" /><span class="mt">Sign out</span></button>
			</form>
		</div>
	{/if}
	<button type="button" class="si fb acc2" aria-haspopup="menu" aria-expanded={open} aria-label="Account: {name}" data-tip={name} onclick={() => (open = !open)}>
		<span class="sav">{initials}</span>
		<span class="lab"><span class="txt an">{name}</span></span>
		<SideIcon name="up" size={14} class="menu-cv" />
	</button>
</div>
{#if plansOpen}
	<PlansDialog current={currentPlan} onclose={() => (plansOpen = false)} />
{/if}
