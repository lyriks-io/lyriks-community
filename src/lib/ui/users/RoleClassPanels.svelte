<script lang="ts">
	import { untrack } from 'svelte';
	import { EditableText, Icon } from '$ui/design-system';
	import SectionNav, { type SectionNavGroup } from '$ui/shell/SectionNav.svelte';
	import GlossaryText from '$ui/glossary/GlossaryText.svelte';
	import type { Role, RoleTone } from '$domain/users';
	import type { DocumentSource } from '$domain/documents';
	import type { PersonaSuggestion } from '$application/ports';
	import SourceCitations from '$ui/documents/SourceCitations.svelte';
	import type { UsersStore } from './draft-store.svelte';

	interface Props {
		store: UsersStore;
		/** Personas proposed by the AI seam (MCP advisor via the stub). */
		suggestions?: PersonaSuggestion[];
		/**
		 * Deep-linked anchor id (`focusField` target from Fix-now / graph links) —
		 * when it names a role, its class panel starts expanded so the flash is
		 * actually visible.
		 */
		focusId?: string | null;
	}
	let { store, suggestions = [], focusId = null }: Props = $props();

	type UserClass = 'end-user' | 'back-office';

	/**
	 * The v3 domain models a role's class via `tone`. We project the five tones
	 * onto the spec's two user classes (end-user vs back-office) so the class
	 * panels can render without changing the store/domain. The projection is
	 * read-only here: a card offered a hover "flip class" toggle that read as a
	 * view switch while re-toning the role, and it could only ever write the two
	 * default tones — flipping an `ops` or `partner` persona silently flattened
	 * it. Class follows from the tone; it is not something a card toggles.
	 */
	const TONE_CLASS: Record<RoleTone, UserClass> = {
		admin: 'back-office',
		ops: 'back-office',
		partner: 'back-office',
		customer: 'end-user',
		visitor: 'end-user'
	};
	const DEFAULT_TONE: Record<UserClass, RoleTone> = {
		'end-user': 'customer',
		'back-office': 'admin'
	};

	const TONE_BG: Record<RoleTone, string> = {
		admin: 'bg-brand-50 text-brand-500',
		ops: 'bg-info-50 text-info-500',
		customer: 'bg-success-50 text-success-500',
		visitor: 'bg-warning-50 text-warning-500',
		partner: 'bg-accent-50 text-accent-500'
	};

	// One class at a time, end-users first (outside-in before inside-out).
	const CLASS_LABEL: Record<UserClass, string> = {
		'end-user': 'End-Users',
		'back-office': 'Admins'
	};

	function classOf(role: Role): UserClass {
		return TONE_CLASS[role.tone];
	}
	function rolesOf(uc: UserClass): Role[] {
		return store.draft.roles.filter((r) => classOf(r) === uc);
	}

	// Exactly one class shown at a time; a deep-linked admin role opens Admins.
	let active = $state<UserClass>(
		untrack(() => {
			const target = focusId && store.draft.roles.find((r) => r.id === focusId);
			return target ? TONE_CLASS[target.tone] : 'end-user';
		})
	);

	const navGroups = $derived<SectionNavGroup[]>([
		{
			label: 'Personas',
			items: [
				{
					id: 'end-user',
					icon: 'users',
					label: 'End-Users',
					hint: 'Customers · personas · access',
					count: rolesOf('end-user').length
				},
				{
					id: 'back-office',
					icon: 'shield',
					label: 'Admins',
					hint: 'Internal operators',
					count: rolesOf('back-office').length
				}
			]
		}
	]);

	// Round-trips with parseCount: "5" (exact), "0-5" (range), "5+" (unlimited from 5).
	function formatCount(role: Role): string {
		if (role.userCountMax === null) return `${role.userCountMin}+`;
		if (role.userCountMin === role.userCountMax) return `${role.userCountMin}`;
		return `${role.userCountMin}-${role.userCountMax}`;
	}
	function parseCount(raw: string): { min: number; max: number | null } | null {
		const t = raw.trim().toLowerCase();
		if (t === '' || t === 'unlimited' || t === '∞') return { min: 0, max: null };
		let m = t.match(/^(\d+)\s*\+$/);
		if (m) return { min: Number(m[1]), max: null };
		m = t.match(/^(\d+)\s*[--]\s*(\d+)$/);
		if (m) return { min: Number(m[1]), max: Math.max(Number(m[1]), Number(m[2])) };
		m = t.match(/^(\d+)$/);
		if (m) return { min: Number(m[1]), max: Number(m[1]) };
		return null;
	}
	function commitCount(roleId: string, raw: string) {
		const parsed = parseCount(raw);
		if (!parsed) return;
		store.updateRole(roleId, 'userCountMin', parsed.min);
		store.updateRole(roleId, 'userCountMax', parsed.max);
	}

	/**
	 * Accept Suggested Persona (spec action `3faf965a`). Suggestions are pushed by
	 * the AI seam (MCP advisor via the stub); filtered per class panel and deduped
	 * against roles already on the board.
	 */
	function suggestionsOf(uc: UserClass): PersonaSuggestion[] {
		return suggestions
			.filter((s) => s.userClass === uc)
			.filter(
				(s) => !store.draft.roles.some((r) => r.name.trim().toLowerCase() === s.name.toLowerCase())
			);
	}
	function acceptSuggestion(s: PersonaSuggestion) {
		store.addRole({
			name: s.name,
			description: s.rationale,
			tone: DEFAULT_TONE[s.userClass]
		});
	}

	const classSuggestions = $derived(suggestionsOf(active));
</script>

<!-- Suggestions card: personas proposed for the active class. Rendered ABOVE the
     sidebar + cards layout so it reads as part of the tab header, full width. -->
{#if classSuggestions.length > 0}
	<div class="mb-4 rounded-card border border-line bg-brand-50/30 p-4">
		<div class="mb-3 flex items-center gap-2">
			<Icon name="sparkles" size={14} />
			<p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">
				{active === 'end-user'
					? 'Suggested end-user personas'
					: 'Suggested back-office / internal users'}
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			{#each classSuggestions as s (s.name)}
				<button
					type="button"
					onclick={() => acceptSuggestion(s)}
					class="group flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink-700 transition-colors hover:border-brand-300 hover:bg-brand-50"
					title={s.rationale}
				>
					<Icon name="plus" size={12} />
					<GlossaryText class="font-medium" text={s.name} />
				</button>
			{/each}
		</div>
	</div>
{/if}

<SectionNav groups={navGroups} {active} onSelect={(id) => (active = id as UserClass)}>
	{#snippet footer()}
		<button
			type="button"
			onclick={() => store.addRole({ tone: DEFAULT_TONE[active] })}
			class="flex w-full items-center gap-2 rounded-field px-3 py-2 text-left text-[11px] font-medium text-brand-500 transition hover:bg-brand-50"
		>
			<Icon name="plus" size={14} /> New {CLASS_LABEL[active].slice(0, -1)}
		</button>
	{/snippet}

	{#key active}
		{@const roles = rolesOf(active)}
		<div class="@container space-y-4">
			<!-- Role cards grid for this class + add tile (container-query columns
			     so it tracks the card area, not the viewport — sidebar-safe on tablet). -->
			<div class="grid gap-4 @md:grid-cols-2 @2xl:grid-cols-3 @4xl:grid-cols-4 @6xl:grid-cols-5">
				{#each roles as role (role.id)}
					<div
						data-anchor={role.id}
						class="group relative flex h-full flex-col rounded-card border border-line bg-surface p-4 transition-all hover:border-line-strong hover:shadow-card"
					>
						<!-- hover affordance: delete -->
						<div
							class="absolute right-2 top-2 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100"
						>
							<button
								type="button"
								onclick={() => {
									if (
										confirm(
											`Remove role "${role.name || 'unnamed'}"? Its grants will also be cleared.`
										)
									)
										store.removeRole(role.id);
								}}
								aria-label="Delete role"
								class="inline-flex size-6 items-center justify-center rounded-md bg-danger-50 text-danger-500 hover:bg-danger-100"
							>
								<Icon name="x" size={12} />
							</button>
						</div>

						<span class="grid size-9 place-items-center rounded-lg {TONE_BG[role.tone]}">
							<Icon name="users" size={18} />
						</span>

						<!-- Click any field to edit it in place (the mockup's EditText). -->
						<EditableText
							value={role.name}
							onCommit={(v) => store.updateRole(role.id, 'name', v)}
							placeholder="Untitled role"
							ariaLabel="Role name"
							class="mt-3 block truncate text-sm font-semibold text-ink-900"
						/>
						<div class="mt-0.5 flex items-baseline gap-1 text-[11px] text-ink-400">
							<div class="w-16 shrink-0">
								<EditableText
									value={formatCount(role)}
									onCommit={(v) => commitCount(role.id, v)}
									ariaLabel="Users per account (e.g. 0-5, 1+, 3)"
									class="block font-medium text-ink-500"
								/>
							</div>
							<span>users / account</span>
						</div>
						<EditableText
							multiline
							value={role.description}
							onCommit={(v) => store.updateRole(role.id, 'description', v)}
							placeholder="No responsibility set yet."
							ariaLabel="Role responsibility"
							class="mt-2 block whitespace-pre-wrap text-xs text-ink-500"
						/>
						<div class="mt-auto pt-3">
							<SourceCitations
								selected={role.sourceIds}
								onToggle={(sourceId) => store.toggleRoleSource(role.id, sourceId)}
								subject="this persona"
							/>
						</div>
					</div>
				{/each}

				{#if roles.length === 0}
					<!-- Empty state IS the add tile: one full-width card instead of a
					     message strip plus a stranded button. -->
					<button
						type="button"
						onclick={() => store.addRole({ tone: DEFAULT_TONE[active] })}
						class="col-span-full flex min-h-40 flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-line bg-surface p-8 text-ink-400 transition-colors hover:border-brand-300 hover:bg-brand-50/30 hover:text-brand-500"
					>
						<span class="grid size-10 place-items-center rounded-full bg-surface-sunken">
							<Icon name={active === 'end-user' ? 'users' : 'shield'} size={18} />
						</span>
						<span class="text-sm font-semibold text-ink-700">
							No {active === 'end-user' ? 'end-users' : 'admins'} yet
						</span>
						<span class="text-xs">
							{classSuggestions.length > 0
								? 'Accept a suggestion above, or click here to create the first one.'
								: `Click here to create the first ${active === 'end-user' ? 'end-user' : 'admin'}.`}
						</span>
					</button>
				{:else}
					<!-- Add role tile -->
					<button
						type="button"
						onclick={() => store.addRole({ tone: DEFAULT_TONE[active] })}
						class="flex min-h-40 flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-line bg-surface p-4 text-ink-400 transition-colors hover:border-brand-300 hover:bg-brand-50/30 hover:text-brand-500"
					>
						<Icon name="plus" size={20} />
						<span class="text-xs font-medium">
							{active === 'end-user' ? 'End-User' : 'Admin'}
						</span>
					</button>
				{/if}
			</div>
		</div>
	{/key}
</SectionNav>
