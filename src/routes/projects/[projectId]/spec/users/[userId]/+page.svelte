<script lang="ts">
	import { scrollMotion } from '$ui/shell/scroll-motion';
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { anchorDomId, anchorOf } from '$domain/discussions';
	import { accessCount, type MatrixRow } from '$application/spec360/users';
	import { actionOfActionCapability } from '$domain/users';
	import {
		actionOfUserAnchor,
		coreEntries,
		entryMeta,
		featureEntries,
		levelOfAction,
		openTopicsOfUser,
		reachAction,
		reachLevel,
		reachTree,
		silentCores,
		userActionAnchor,
		type ReachEntry
	} from '$application/spec360/users-reach';
	import GlossaryText from '$ui/glossary/GlossaryText.svelte';
	import BlockFoot from '$ui/spec360/BlockFoot.svelte';
	import InlineEditor from '$ui/spec360/InlineEditor.svelte';
	import HeadText from '$ui/spec360/page/HeadText.svelte';
	import AskAiTool from '$ui/spec360/page/AskAiTool.svelte';
	import PageHead from '$ui/spec360/page/PageHead.svelte';
	import SectionBox from '$ui/spec360/page/SectionBox.svelte';
	import { FACT } from '$ui/spec360/page/look';
	import StagedText from '$ui/spec360/StagedText.svelte';
	import { useEditMode } from '$ui/spec360/edit-mode.svelte';
	import AccessColumns from '$ui/spec360/users/AccessColumns.svelte';
	import AccessPath from '$ui/spec360/users/AccessPath.svelte';
	import ActionAccess from '$ui/spec360/users/ActionAccess.svelte';
	import ActionReachRow from '$ui/spec360/users/ActionReachRow.svelte';
	import ReachRow from '$ui/spec360/users/ReachRow.svelte';
	import { useDiscussions } from '$ui/spec360/discussions.svelte';
	import { useEdits } from '$ui/spec360/edits.svelte';
	import { PermissionTicks } from '$ui/spec360/permission-ticks.svelte';
	import { useValidation } from '$ui/spec360/validation.svelte';
	import type { PageData } from './$types';

	/**
	 * One user on its own page, opened from its row on Users and permissions
	 * (criterion 4146848b): who it is, how many of the actions it can perform
	 * and the comments still open, its text closed by its comments and its
	 * sources, then its controls (delete, Validate) small on the same line
	 * (criterion 14a1164c). Then what it can reach, level by level
	 * (criterion 1ca9b3b4): its core features, the features of one, the actions
	 * of one feature, then one action (criterion 6dd2906e), each level in the
	 * page's address. At the actions level
	 * each action is discussed for this user (criterion ddd20a3e) and, while a
	 * draft, granted or taken back in place (criterion eba33558). The head
	 * carries the page's tools (criterion 14a1164c) and its facts as chips; in
	 * the Edit mode a click on the description opens its editor (criterion
	 * 41514698).
	 */
	let { data }: { data: PageData } = $props();
	const base = $derived(`/projects/${encodeURIComponent(data.projectId)}/spec`);
	const validation = useValidation();
	const edits = useEdits();
	const discussions = useDiscussions();
	const ticks = new PermissionTicks(edits);
	const mode = useEditMode();
	// Who can do what is ticked while the specification is a draft (criterion 9b3e04e1, 611e98cb on hold), in the
	// page's Edit mode (criterion 41514698).
	const editable = $derived(validation.draft && validation.source.canWrite && mode.active);

	const u = $derived(data.user);
	const admin = $derived(u.userClass === 'admin');
	const anchor = $derived(anchorOf('role', u.id));
	const userRead = $derived({ text: u.name, desc: u.description });
	const shown = $derived(edits.shown(anchor, userRead));
	const holds = (row: MatrixRow) => ticks.holds(u.id, row);
	const access = $derived(accessCount(data.users.groups, holds));
	const openTopics = $derived(openTopicsOfUser(discussions.document.threads, u.id));
	const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
	// The sources are counted by the link closing its text, never again among the facts (criterion 14a1164c).
	const facts = $derived([`${access.granted} of ${plural(access.total, 'action')}`, openTopics ? plural(openTopics, 'open comment') : 'no open comment']);

	/** A user the rest of the spec uses is not deleted: the trash lists where it is used (criterion e356a69c). */
	const removal = $derived.by(() => {
		const used = data.users.roleUses[u.id];
		return used?.summary
			? { name: shown.text, refusal: used.summary, uses: used.uses.map((x) => ({ label: x.label, href: `${base}${x.path.startsWith('#') ? x.path : `/${x.path}`}` })) }
			: { name: shown.text };
	});
	// Deleted here: back to the list at once, which takes it back if the delete is refused.
	$effect(() => {
		if (edits.gone(anchor)) void goto(`${base}/users`, { replaceState: true });
	});

	// What the user can reach, at the level the address names; a link to an action's discussion opens that action's level.
	const tree = $derived(reachTree(data.spec.outline.cores, data.users.groups));
	const discussed = $derived.by(() => {
		const id = page.url.searchParams.get('discussion');
		const thread = id ? discussions.document.threads.find((t) => t.id === id) : null;
		return thread ? actionOfUserAnchor(thread.anchor, u.id) : null;
	});
	const level = $derived.by(() => {
		const coreId = page.url.searchParams.get('core');
		const featureId = page.url.searchParams.get('feature');
		const at = !coreId && !featureId && discussed ? levelOfAction(tree, discussed) : null;
		return at ? reachLevel(tree, at.coreId, at.featureId) : reachLevel(tree, coreId, featureId);
	});
	const here = $derived(`${base}/users/${encodeURIComponent(u.id)}`);
	function levelHref(coreId?: string, featureId?: string, actionId?: string): string {
		const q = new URLSearchParams();
		if (coreId) q.set('core', coreId);
		if (featureId) q.set('feature', featureId);
		if (actionId) q.set('action', actionId);
		const s = q.toString();
		return s ? `${here}?${s}` : here;
	}
	// The fourth level, one action of the feature opened (criterion 6dd2906e); an id it does not hold reads one level up.
	const actionId = $derived(page.url.searchParams.get('action'));
	const opened = $derived(reachAction(level.feature, actionId));
	const steps = $derived([
		{ level: 'PROFILE', name: shown.text, href: levelHref(), current: !level.core },
		...(level.core ? [{ level: 'CORE FEATURE', name: level.core.name, href: levelHref(level.core.id), current: !level.feature }] : []),
		...(level.core && level.feature ? [{ level: 'FEATURE', name: level.feature.name, href: levelHref(level.core.id, level.feature.id), current: !opened }] : []),
		...(level.core && level.feature && opened && actionId
			? [{ level: 'ACTION', name: opened.action, href: levelHref(level.core.id, level.feature.id, actionId), current: true }]
			: [])
	]);
	const back = $derived(
		level.core && level.feature && opened
			? { href: levelHref(level.core.id, level.feature.id), label: level.feature.name }
			: level.core && level.feature
				? { href: levelHref(level.core.id), label: level.core.name }
				: level.core
					? { href: levelHref(), label: shown.text }
					: { href: `${base}/users`, label: 'All profiles' }
	);
	const heading = $derived(
		opened
			? { title: opened.action, intro: 'Whether this profile may perform this action, who else may, and the rules that decide who may.' }
			: level.feature
			? {
					title: `Actions in ${level.feature.name}`,
					intro: `The last level: each action this profile may or may not perform inside the feature.${editable ? ' Grant or take one back in place.' : ''}`
				}
			: level.core
				? { title: `Features in ${level.core.name}`, intro: 'Which features of this core feature the profile can use. Open an accessible one to see its actions.' }
				: { title: 'Core features', intro: 'Start here: which areas of the product this profile can enter at all. Open an accessible one to see its features.' }
	);
	const entries = $derived(level.core ? featureEntries(level.core, holds) : coreEntries(tree, holds));
	const actions = $derived((level.feature?.rows ?? []).map((row) => ({ id: row.capabilityId, row })));
	/** What declares no action at this level: no right reaches it, so it is named apart. */
	const silent = $derived(level.feature ? [] : level.core ? level.core.silent : silentCores(tree));
	const SILENT_SHOWN = 6;
	const silentLine = $derived(
		silent.length === 0
			? ''
			: `${level.core ? 'Features' : 'Core features'} that declare no action yet: ${silent.slice(0, SILENT_SHOWN).join(', ')}${silent.length > SILENT_SHOWN ? ` and ${silent.length - SILENT_SHOWN} more` : ''}.`
	);

	// Opening a level keeps the reader's place, unless the path above it went out of view: then it comes back into view.
	let pathTop = $state<HTMLElement | null>(null);
	afterNavigate(({ from, to, type }) => {
		if (type === 'popstate' || !from || !to || from.url.pathname !== to.url.pathname || !pathTop) return;
		if (pathTop.getBoundingClientRect().top < 0) pathTop.scrollIntoView({ block: 'start', behavior: scrollMotion() });
	});
</script>

{#snippet entryRow(entry: ReachEntry, open: boolean)}
	<ReachRow
		name={entry.name}
		meta={entryMeta(entry, level.core ? 'action' : 'feature')}
		href={open ? (level.core ? levelHref(level.core.id, entry.id) : levelHref(entry.id)) : null}
	/>
{/snippet}

{#snippet actionRow(item: { id: string; row: MatrixRow }, open: boolean)}
	{@const id = actionOfActionCapability(item.id)}
	<ActionReachRow
		anchor={userActionAnchor(u.id, item.id)}
		action={item.row.action}
		access={open}
		title="{shown.text} · {item.row.action}"
		onTick={editable ? () => void ticks.tick(u.id, item.id, !open) : null}
		href={id && level.core && level.feature ? levelHref(level.core.id, level.feature.id, id) : null}
	/>
{/snippet}

{#snippet tools()}
	<AskAiTool {anchor} title={shown.text} />
{/snippet}

<!-- Another user comes in afresh. -->
{#key u.id}
	<div class="flex min-w-0 animate-lk-in flex-col">
		<div id={!level.core ? anchorDomId(anchor) : undefined} data-evo-waits={(!level.core && validation.waitsOnMe(anchor)) || undefined} class="scroll-mt-36">
			<!-- Its name and description are fields of the Edit mode, held until Save (criterion 41514698). -->
			{#snippet name()}<StagedText {anchor} read={userRead} field="text" label="Name" {editable}>{shown.text}</StagedText>{/snippet}
			<PageHead title={shown.text} kicker={admin ? 'ADMIN USER' : 'END USER'} {back} {tools} {name}>
				{#if !level.core}
					{#if edits.editing === anchor}
						<div class="mt-1"><InlineEditor {anchor} /></div>
					{:else}
						<!-- Its comments and sources close its text, its cross and its check right after them (criterion 14a1164c). -->
						<HeadText {anchor} title={shown.text} values={shown} remove={removal}>
							{#snippet text()}{#if shown.desc || editable}<StagedText {anchor} read={userRead} field="desc" multiline label="Description" {editable}><GlossaryText text={shown.desc ?? ''} /></StagedText>{/if}{/snippet}
						</HeadText>
					{/if}
				{/if}
				<!-- Its facts as chips under who it is, as every page's head reads them (criterion 14a1164c). -->
				<div class="flex flex-wrap items-center gap-1.5">{#each facts as fact (fact)}<span class={FACT}>{fact}</span>{/each}</div>
				{#if !level.core}
					<div class="mt-1 flex flex-col gap-2 empty:hidden"><BlockFoot {anchor} title={shown.text} /></div>
				{/if}
			</PageHead>
		</div>

		<!-- Where the reader stands in what the user can reach, over the level it opens (criterion 1ca9b3b4). -->
		<div bind:this={pathTop} class="-mt-[22px] mb-4 scroll-mt-36">
			<AccessPath {steps} />
		</div>

		{#key `${level.core?.id ?? ''}/${level.feature?.id ?? ''}/${opened?.capabilityId ?? ''}`}
			<div class="animate-lk-in-fast">
				<SectionBox title={heading.title} intro={heading.intro}>
					{#if tree.every((c) => c.features.length === 0)}
						<p class="m-0 text-sm text-evo-muted">No feature declares an action yet: there is nothing to reach.</p>
					{:else if opened && level.feature}
						{@const view = data.action?.featureId === level.feature.id && data.action.view.id === actionId ? data.action.view : null}
						<ActionAccess
							profile={shown.text}
							anchor={userActionAnchor(u.id, opened.capabilityId)}
							action={opened.action}
							access={holds(opened)}
							onTick={editable ? () => void ticks.tick(u.id, opened.capabilityId, !holds(opened)) : null}
							{view}
							featureId={level.feature.id}
							featureHref="{base}/features/{encodeURIComponent(level.feature.id)}#{anchorDomId(anchorOf('action', level.feature.id, actionId ?? ''))}"
						/>
					{:else if level.feature}
						<AccessColumns yes={actions.filter((a) => holds(a.row))} no={actions.filter((a) => !holds(a.row))} row={actionRow} />
					{:else}
						<AccessColumns yes={entries.filter((e) => e.open)} no={entries.filter((e) => !e.open)} row={entryRow} />
					{/if}
					{#if silentLine}<p class="m-0 mt-3 text-sm text-evo-muted">{silentLine}</p>{/if}
				</SectionBox>
			</div>
		{/key}
	</div>
{/key}
