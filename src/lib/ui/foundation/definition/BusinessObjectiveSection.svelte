<script lang="ts">
	import { Field, Icon, SectionCard, Textarea, fieldBase, fieldBorder, fieldHeight } from '$ui/design-system';
	import { LIMITS } from '$domain/foundation';
	import CriteriaList from '../sections/CriteriaList.svelte';
	import type { DefinitionStore } from '../definition-store.svelte';

	type PersonaClass = 'end-user' | 'admin';
	/** The two kinds of the Personas tab, in its order. */
	const PERSONA_CLASSES: { code: PersonaClass; label: string }[] = [
		{ code: 'end-user', label: 'End-User' },
		{ code: 'admin', label: 'Admin' }
	];

	interface Props {
		store: DefinitionStore;
		/** Shared personas from Users & Permissions (read-only projection). */
		roles?: { id: string; name: string; tone: string }[];
		/**
		 * Create a real shared role, filed as an End-User or an Admin like on the
		 * Personas tab, and resolve its id (null on failure/cancel).
		 */
		onCreateRole?: (name: string, personaClass: PersonaClass) => Promise<string | null>;
	}
	let { store, roles = [], onCreateRole }: Props = $props();

	const o = $derived(store.draft.businessObjective);

	// Pain-point ⇄ users linking. The picker lists the same roles as Users &
	// Permissions; typing a new name offers to create one there and link it here.
	let openPickerId = $state<string | null>(null);
	let query = $state('');
	let creating = $state(false);
	const roleName = (id: string) => roles.find((r) => r.id === id)?.name?.trim() || 'Unnamed user';
	const matches = $derived(
		roles.filter((r) => (r.name || '').toLowerCase().includes(query.trim().toLowerCase()))
	);
	const canCreate = $derived(
		!!onCreateRole &&
			query.trim().length > 0 &&
			!roles.some((r) => r.name.trim().toLowerCase() === query.trim().toLowerCase())
	);
	function openPicker(id: string) {
		openPickerId = openPickerId === id ? null : id;
		query = '';
	}
	function addPain(e: KeyboardEvent) {
		if (e.key !== 'Enter') return;
		const el = e.currentTarget as HTMLInputElement;
		const t = el.value.trim();
		if (!t) return;
		store.addPainPointLink(t);
		el.value = '';
	}
	async function createFor(linkId: string, personaClass: PersonaClass) {
		if (!onCreateRole || !canCreate || creating) return;
		creating = true;
		const id = await onCreateRole(query.trim(), personaClass);
		creating = false;
		if (id) {
			store.attachPainPointRole(linkId, id);
			query = '';
		}
	}
</script>

<!-- @container so every inner grid responds to the card's real width, not the
     viewport — the card can be narrow under a sidebar even on a wide screen. -->
<div class="@container space-y-4" data-anchor="business-objective">
	<SectionCard icon="target" title="Objective">
		<div class="grid gap-4 @2xl:grid-cols-2">
			<Field label="The problem" hint="1-3 sentences" subgrid>
				<Textarea
					value={o.mainProblem}
					oninput={store.setMainProblem}
					rows={3}
					placeholder="In one paragraph, what painful situation does this product end?"
					invalid={o.mainProblem.length > LIMITS.mainProblem}
				/>
			</Field>
			<Field label="The outcome" hint="1-2 sentences" subgrid>
				<Textarea
					value={o.expectedOutcome}
					oninput={store.setExpectedOutcome}
					rows={3}
					placeholder="What people can do once it works that they cannot do today"
					invalid={o.expectedOutcome.length > LIMITS.expectedOutcome}
				/>
			</Field>
		</div>
	</SectionCard>

	<!-- Context · who's hurting — each pain point carries the users it hurts,
	     picked from (or created into) the shared Users & Permissions roles. -->
	<SectionCard icon="users" title="Pain points">
		<p class="mb-3 text-[0.6875rem] text-ink-400">
			Add each pain point, then link the users it hurts. Users are shared with Users &amp;
			Permissions - pick existing ones or create a new one on the spot.
		</p>

		<div class="space-y-2.5">
			{#each o.painPointLinks as link (link.id)}
				<div class="rounded-card border border-line bg-surface p-3">
					<div class="flex items-center gap-2">
						<Icon name="alert-triangle" size={15} class="shrink-0 text-danger-500" />
						<input
							value={link.text}
							oninput={(e) => store.setPainPointText(link.id, e.currentTarget.value)}
							placeholder="Add a pain…"
							maxlength={LIMITS.painPoint}
							class="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm text-ink-900 hover:border-line focus:border-brand-400 focus:outline-none"
						/>
						<button
							type="button"
							onclick={() => store.removePainPointLink(link.id)}
							aria-label="Remove pain point"
							class="grid size-7 shrink-0 place-items-center rounded-md text-ink-400 hover:bg-danger-50 hover:text-danger-500"
						>
							<Icon name="x" size={14} />
						</button>
					</div>

					<div class="mt-2 flex flex-wrap items-center gap-1.5 pl-6">
						{#each link.roleIds as roleId (roleId)}
							<span
								class="inline-flex items-center gap-1.5 rounded-pill bg-brand-50 py-1 pl-2.5 pr-1.5 text-xs font-medium text-brand-700"
							>
								<Icon name="user" size={12} />
								{roleName(roleId)}
								<button
									type="button"
									onclick={() => store.togglePainPointRole(link.id, roleId)}
									aria-label="Unlink user"
									class="text-brand-400 transition-colors hover:text-brand-700"
								>
									<Icon name="x" size={12} />
								</button>
							</span>
						{/each}
						<button
							type="button"
							onclick={() => openPicker(link.id)}
							aria-expanded={openPickerId === link.id}
							class="inline-flex items-center gap-1 rounded-pill border border-dashed border-ink-300 px-2.5 py-1 text-xs font-medium text-ink-500 transition-colors hover:border-brand-400 hover:text-brand-600"
						>
							<Icon name="plus" size={12} /> user
						</button>
					</div>

					{#if openPickerId === link.id}
						<div class="ml-6 mt-2 w-64 overflow-hidden rounded-card border border-line bg-surface shadow-sm">
							<div class="border-b border-line p-1.5">
								<!-- svelte-ignore a11y_autofocus -->
								<input
									bind:value={query}
									autofocus
									placeholder="Search or create a user…"
									class="w-full rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink-900 focus:border-brand-400 focus:outline-none"
								/>
							</div>
							<div class="max-h-52 overflow-y-auto py-1">
								{#each matches as r (r.id)}
									{@const checked = link.roleIds.includes(r.id)}
									<button
										type="button"
										onclick={() => store.togglePainPointRole(link.id, r.id)}
										class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-ink-700 hover:bg-surface-sunken"
									>
										<span
											class="grid size-4 shrink-0 place-items-center rounded border {checked
												? 'border-brand-500 bg-brand-500 text-white'
												: 'border-ink-300'}"
										>
											{#if checked}<Icon name="check" size={11} />{/if}
										</span>
										<span class="truncate">{r.name.trim() || 'Unnamed user'}</span>
									</button>
								{/each}
								{#if matches.length === 0 && !canCreate}
									<p class="px-2.5 py-2 text-[0.6875rem] italic text-ink-400">
										No users yet. Type a name to create one.
									</p>
								{/if}
							</div>
							{#if canCreate}
								<div class="border-t border-line bg-surface-sunken/60 px-2.5 py-2">
									<p class="truncate text-[0.6875rem] text-ink-500">Create "{query.trim()}" as</p>
									<div class="mt-1.5 grid grid-cols-2 gap-1.5">
										{#each PERSONA_CLASSES as c (c.code)}
											<button
												type="button"
												onclick={() => createFor(link.id, c.code)}
												disabled={creating}
												class="flex items-center justify-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-xs font-semibold text-brand-600 transition-colors hover:border-brand-300 hover:bg-brand-50 disabled:opacity-60"
											>
												<Icon name="plus" size={12} /> {c.label}
											</button>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/each}

			<input
				onkeydown={addPain}
				placeholder="Add a pain…  (Enter)"
				maxlength={LIMITS.painPoint}
				class="{fieldBase} {fieldHeight} {fieldBorder} px-3.5 py-2.5"
			/>

			{#if o.affectedPersonas.length > 0}
				<p class="pt-1 text-[0.6875rem] text-ink-400">
					Previously listed personas to re-attach: {o.affectedPersonas.join(', ')} - create them as
					users above.
				</p>
			{/if}
		</div>
	</SectionCard>

	<!-- Retired from the screen (spec: criterion e8a65d93); the data stays stored and served. Flip to true to show it again. -->
	{#if false}
	<SectionCard icon="flag" title="Business objectives">
		<CriteriaList
			items={store.draft.business.objectives}
			tone="brand"
			placeholder="Add an objective…"
			onadd={store.addObjective}
			onremove={store.removeObjective}
		/>
	</SectionCard>
	{/if}

	<SectionCard icon="trophy" title="Success and failure">
		<div class="grid gap-6 @lg:grid-cols-2">
			<Field label="We've won when">
				<CriteriaList items={o.successCriteria} tone="success" placeholder="e.g. quotes go through the product instead of email…" maxLength={LIMITS.criterion} onadd={store.addSuccessCriterion} onremove={store.removeSuccessCriterion} />
			</Field>
			<Field label="We should stop when">
				<CriteriaList items={o.failureCriteria} tone="danger" placeholder="e.g. teams keep the spreadsheet after three months…" maxLength={LIMITS.criterion} onadd={store.addFailureCriterion} onremove={store.removeFailureCriterion} />
			</Field>
		</div>
	</SectionCard>
</div>
