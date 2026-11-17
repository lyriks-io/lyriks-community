<script lang="ts">
	import type { UsersLayout } from '$domain/retrospec';
	import type { RoleTone } from '$domain/users';
	import { Icon, type IconName } from '$ui/design-system';
	import { numberPill } from '$ui/evolution/evo-look';
	import ItemControls from './ItemControls.svelte';
	import ItemThread from './ItemThread.svelte';
	import { REJECTED_CHIP, itemBorder, struck } from './look';
	import { useReview } from './review.svelte';

	/**
	 * The Users tab: the roles the AI found, end users then admins, each
	 * validated or rejected; then the permissions they hold, which open once
	 * every role is decided (a matrix over roles nobody wants means nothing).
	 * The matrix reads the specification as it is; changing a grant is done in
	 * the Users & Permissions of the specification.
	 */
	let { users, nextId }: { users: UsersLayout; nextId: string | null } = $props();
	const review = useReview();

	const ICON: Record<RoleTone, IconName> = { admin: 'shield', ops: 'settings', customer: 'user', visitor: 'eye', partner: 'globe' };
	const ADMIN = new Set<RoleTone>(['admin', 'ops']);

	const roleItems = $derived(users.groups.flatMap((g) => g.roles.map((r) => r.item)));
	const left = $derived(roleItems.filter((i) => !review.view(i.id).handled).length);
	const permissionsOpen = $derived(left === 0);
	/** The matrix's columns: the roles nobody rejected. */
	const kept = $derived(users.permissions ? users.permissions.roles.map((r, i) => ({ ...r, i })).filter((r) => review.view(`role:${r.id}`).state !== 'rejected') : []);
	const gridCols = $derived(`minmax(220px, 1.6fr) repeat(${Math.max(1, kept.length)}, minmax(84px, 1fr))`);
	const permissionsView = $derived(users.permissions ? review.view(users.permissions.item.id) : null);
</script>

<div class="flex flex-col gap-5">
	<section aria-label="Users" class="flex flex-col gap-5 rounded-evo-card border border-evo-line bg-white p-6">
		<div class="flex items-center gap-3">
			<span class={numberPill(left === 0)}>{left === 0 ? '✓' : '1'}</span>
			<h3 class="m-0 text-lg font-bold">Users</h3>
		</div>
		{#each users.groups as group (group.label)}
			<div class="flex flex-col gap-2.5">
				<span class="font-evo-mono text-[0.6875rem] tracking-[0.08em] text-evo-muted">{group.label}</span>
				{#each group.roles as role (role.item.id)}
					{@const view = review.view(role.item.id)}
					<div id="rv-{role.item.id}" class="flex scroll-mt-36 flex-col gap-3 rounded-xl border px-4 py-3.5 transition-[border-color] duration-300 {itemBorder(view)}">
						<div class="flex flex-wrap items-center justify-between gap-3">
							<div class="flex min-w-0 flex-[1_1_320px] items-center gap-3.5">
								<span aria-hidden="true" class="flex size-11 flex-none items-center justify-center rounded-xl {ADMIN.has(role.tone) ? 'bg-evo-blue-soft text-evo-blue' : 'bg-evo-violet-soft text-evo-violet-ink'}"><Icon name={ICON[role.tone]} size={20} /></span>
								<span class="flex min-w-0 flex-col gap-0.5">
									<span class="flex flex-wrap items-center gap-2 text-base font-bold">
										{#if view.state === 'rejected'}<span class={REJECTED_CHIP}>REJECTED</span>{/if}
										<span class={struck(view)}>{role.item.title}</span>
									</span>
									{#if role.item.desc}<span class="text-sm text-evo-muted">{role.item.desc}</span>{/if}
								</span>
							</div>
							<ItemControls item={role.item} next={role.item.id === nextId} />
						</div>
						<ItemThread item={role.item} />
					</div>
				{/each}
			</div>
		{/each}
	</section>

	{#if users.permissions && permissionsView}
		{@const matrix = users.permissions}
		<section id="rv-{matrix.item.id}" aria-label="Permissions" class="flex scroll-mt-36 flex-col gap-4 rounded-evo-card border bg-white p-6 transition-[border-color] duration-300 {itemBorder(permissionsView)}">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div class="flex items-center gap-3">
					<span class={numberPill(permissionsView.state === 'validated')}>{permissionsView.state === 'validated' ? '✓' : '2'}</span>
					<h3 class="m-0 text-lg font-bold">Permissions</h3>
				</div>
				{#if permissionsOpen}<ItemControls item={matrix.item} next={matrix.item.id === nextId} />{/if}
			</div>
			{#if !permissionsOpen}
				<div class="rounded-evo-btn bg-evo-sunken px-3.5 py-3 text-sm text-evo-ink-3">Validate or reject each user first ({left} left). The permissions open right after.</div>
			{:else}
				<ItemThread item={matrix.item} />
				<span class="text-[0.8125rem] text-evo-muted">✓ access · ✕ restricted, as the specification grants them.</span>
				<div class="overflow-x-auto">
					<div class="flex min-w-[640px] flex-col">
						<div class="grid items-end gap-1.5 border-b border-evo-line pb-2" style:grid-template-columns={gridCols}>
							<span class="font-evo-mono text-[0.6875rem] tracking-[0.08em] text-evo-muted">ACTION</span>
							{#each kept as role (role.id)}<span class="text-center text-xs font-semibold">{role.name}</span>{/each}
						</div>
						{#each matrix.rows as row, r (r)}
							{#if 'head' in row}
								<span class="pt-3.5 pb-1.5 font-evo-mono text-[0.6875rem] tracking-[0.08em] text-evo-muted">{row.head}</span>
							{:else}
								<div class="grid items-center gap-1.5 border-t border-evo-chip py-1" style:grid-template-columns={gridCols}>
									<span class="text-sm">{row.label}</span>
									{#each kept as role (role.id)}
										{@const on = row.access[role.i]}
										<span role="img" aria-label="{on ? 'Access' : 'Restricted'} · {role.name} · {row.label}" title="{on ? 'Access' : 'Restricted'} · {role.name}" class="flex h-8 w-9 items-center justify-center justify-self-center rounded-lg border text-[0.9375rem] font-bold {on ? 'border-evo-green-line bg-evo-green-soft text-evo-green' : 'border-evo-line bg-white text-evo-faint-2'}">{on ? '✓' : '✕'}</span>
									{/each}
								</div>
							{/if}
						{/each}
					</div>
				</div>
			{/if}
		</section>
	{/if}
</div>
