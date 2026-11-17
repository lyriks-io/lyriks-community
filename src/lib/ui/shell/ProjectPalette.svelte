<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { pushToast } from '$ui/design-system';
	import { droppedOrder, projectFolders, type FolderProject, type ProjectFolder } from '$domain/portfolio/project-folders';
	import type { PortfolioView } from '$domain/portfolio';
	import { OptimisticActs } from '$ui/evolution/optimistic-acts.svelte';
	import { folderKey, menuFolders, ORDER_KEY, projectKey, type MenuAct, type MenuFolder } from './project-menu';
	import { SaveQueue, refusalOf } from './save-queue';
	import { projectEntryFrom } from './app-nav';
	import { openOnboarding } from './onboarding.svelte';
	import { shell } from './shell-state.svelte';
	import SidePanel from './SidePanel.svelte';
	import SideIcon from './SideIcon.svelte';

	// The projects (criterion bb345125, action 3d24bd9a): a panel beside the
	// navigation, the folders (domains) in the order the team dragged them into
	// (criterion ddf5cc35) with their projects from A to Z, the current one
	// ticked, a field that finds a project or a folder by its name.
	// The reader switches project, renames, adds and deletes folders, files,
	// adds and deletes projects. The portfolio is read when the panel opens, so
	// pages that never open it never pay for it. A folder created, renamed or
	// deleted, a project moved or deleted reads at once and is saved behind, one
	// after the other; a refusal puts the panel back and says why. Creating a
	// project waits for the server: it gives the project its id. A folder is
	// dragged by its grip, or moved with Alt and the arrow keys, to another place
	// (action 5ccc378f), by a member who sees every folder (rule 8f68eccd).
	let { current }: { current: { id: string; name: string } | null } = $props();

	const open = $derived(shell.panel === 'projects');
	let folders = $state<ProjectFolder[] | null>(null);
	/** Whether the reader sees every folder, so may put them in order (rule 8f68eccd); the server says so with the portfolio. */
	let canOrder = $state(false);
	/** Community works on one project at a time: the active one, marked in the list; null on every other edition (EVO-001). */
	let activeProjectId = $state<string | null>(null);
	/** The folder being dragged, and the slot it would land in: before the folder at that index of `placeable`. */
	let dragging = $state<string | null>(null);
	let slot = $state<number | null>(null);
	let q = $state('');
	let hit = $state(0);
	let input = $state<HTMLInputElement>();
	let adding = $state<'folder' | { folder: string | null } | null>(null);
	let name = $state('');
	let renaming = $state<string | null>(null);
	let newName = $state('');
	let moving = $state<string | null>(null);
	let deleting = $state<string | null>(null);
	let typed = $state('');
	/** A project being created waits for the server to give it its identity. */
	let creating = $state(false);
	/** A copy waits for its own identity before it can appear in the panel. */
	let duplicating = $state<string | null>(null);
	/** The project whose archive is being prepared for download. */
	let exporting = $state<string | null>(null);
	/** The project whose row menu is open: one at a time. */
	let menuOf = $state<string | null>(null);
	const acts = new OptimisticActs<MenuAct>();
	const queue = new SaveQueue();
	let pendingFolders = 0;
	/** The panel as it reads with its acts on their way. */
	const shown = $derived<MenuFolder[] | null>(folders && menuFolders(folders, acts.all));
	const reading = () => folders;

	// A folder shows with all its projects when its name matches, else with the projects whose name does.
	const query = $derived(q.trim().toLowerCase());
	const visible = $derived(
		(shown ?? []).flatMap((f) => {
			if (!query || f.name.toLowerCase().includes(query)) return [{ folder: f, projects: f.projects }];
			const projects = f.projects.filter((p) => p.name.toLowerCase().includes(query));
			return projects.length ? [{ folder: f, projects }] : [];
		})
	);
	const rows = $derived(visible.flatMap((v) => v.projects));

	$effect(() => {
		if (!open) return;
		reset();
		q = '';
		hit = 0;
		void load();
	});

	async function load() {
		const res = await fetch('/api/projects').catch(() => null);
		if (!res?.ok) return;
		const body = (await res.json()) as { portfolio: PortfolioView; canOrderFolders?: boolean; activeProjectId?: string | null };
		folders = projectFolders(body.portfolio);
		canOrder = body.canOrderFolders === true;
		activeProjectId = body.activeProjectId ?? null;
	}

	function reset() {
		adding = null;
		name = '';
		renaming = null;
		newName = '';
		moving = null;
		deleting = null;
		typed = '';
	}

	/** Show an act at once and save it behind the others; true once saved and the panel read again. `done` null says nothing on success. */
	function act(key: string, shownAs: MenuAct, run: () => Promise<Response>, failed: string, done: string | null): Promise<boolean> {
		return acts.run(
			key,
			shownAs,
			() =>
				queue.run(async () => {
					let res: Response;
					try {
						res = await run();
					} catch {
						pushToast({ level: 'error', message: `${failed} Check your connection.` });
						return false;
					}
					if (!res.ok) {
						pushToast({ level: 'error', message: `${failed} ${await refusalOf(res, 'That did not work')}` });
						return false;
					}
					if (done) pushToast({ level: 'success', message: done });
					await load();
					return true;
				}),
			reading
		);
	}

	const json = (method: string, body: unknown) => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

	/** Picking another project opens Home limited to it (criterion 11c7c8c8 of feat-home): the navigation's project follows. */
	function choose(p: FolderProject | undefined) {
		if (!p) return;
		shell.close();
		// An inactive project opens on its refusal, which offers to make it the active one (EVO-001).
		if (activeProjectId && p.id !== activeProjectId) return void goto(`/projects/${encodeURIComponent(p.id)}`);
		const entry = projectEntryFrom(page.url.pathname, p.id);
		if (entry) void goto(entry);
	}

	async function saveFolder() {
		const n = name.trim();
		if (!n) return pushToast({ level: 'info', message: 'Name the folder first' });
		reset();
		const known = (folders ?? []).map((f) => f.id);
		const saved = await act(folderKey(`pending-${++pendingFolders}`), { kind: 'add-folder', name: n, known }, () => fetch('/api/domains', json('POST', { name: n })), `Folder “${n}” was not created.`, `Folder “${n}” created`);
		// Refused: the name typed comes back in its box.
		if (!saved && open && adding === null) {
			adding = 'folder';
			name = n;
		}
	}

	async function startRename(f: MenuFolder) {
		if (f.id === null || f.pending) return;
		reset();
		renaming = f.id;
		newName = f.name;
		await tick();
		const field = document.getElementById('lk-folder-rename') as HTMLInputElement | null;
		field?.focus();
		field?.select();
	}

	/** Rename a folder in place (action c9cb86ac): the new name reads at once, at its place (A to Z among the folders nobody placed). */
	function saveRename(f: MenuFolder) {
		const id = f.id;
		const n = newName.trim();
		renaming = null;
		if (id === null || !n || n === f.name) return;
		void act(folderKey(id), { kind: 'rename-folder', name: n }, () => fetch(`/api/domains/${encodeURIComponent(id)}`, json('PATCH', { name: n })), `Folder “${f.name}” was not renamed.`, `Folder renamed to “${n}”`);
	}

	async function saveProject(folder: string | null) {
		const n = name.trim();
		if (!n || creating) return n ? undefined : pushToast({ level: 'info', message: 'Name the project first' });
		creating = true;
		try {
			const res = await fetch('/api/projects', json('POST', { name: n, domainId: folder }));
			if (!res.ok) return pushToast({ level: 'error', message: (await res.text().catch(() => '')) || 'The project was not created' });
			const { projectId } = (await res.json()) as { projectId: string };
			pushToast({ level: 'success', message: `Project “${n}” created` });
			shell.close();
			await goto(`/projects/${encodeURIComponent(projectId)}`);
		} finally {
			creating = false;
		}
	}

	function deleteFolder(f: MenuFolder) {
		if (f.id === null || f.pending) return;
		if (f.projects.length > 0) return pushToast({ level: 'info', message: 'Move or delete its projects first' });
		const id = f.id;
		void act(folderKey(id), { kind: 'delete-folder' }, () => fetch(`/api/domains/${encodeURIComponent(id)}`, { method: 'DELETE' }), `Folder “${f.name}” was not deleted.`, `Folder “${f.name}” deleted`);
	}

	function move(p: FolderProject, to: MenuFolder) {
		moving = null;
		void act(projectKey(p.id), { kind: 'move', to: to.id, toName: to.name }, () => fetch(`/api/projects/${encodeURIComponent(p.id)}`, json('PATCH', { domainId: to.id })), `${p.name} was not moved to ${to.name}.`, `${p.name} moved to ${to.name}`);
	}

	/** Closes the open row menu on a click outside it or on Escape. */
	function menuRoot(node: HTMLElement, id: string) {
		const click = (e: MouseEvent) => {
			if (menuOf === id && !node.contains(e.target as Node)) menuOf = null;
		};
		const key = (e: KeyboardEvent) => {
			if (menuOf === id && e.key === 'Escape') {
				e.stopPropagation();
				menuOf = null;
			}
		};
		window.addEventListener('click', click, true);
		window.addEventListener('keydown', key, true);
		return {
			destroy() {
				window.removeEventListener('click', click, true);
				window.removeEventListener('keydown', key, true);
			}
		};
	}

	/**
	 * Take the whole project home as one .zip (action 0f8af3ef of feat-134): the
	 * same packing the duplicate uses, attached sources and audit records included.
	 * Fetched rather than linked so a refusal reads as a toast, not a broken file.
	 */
	async function exportZip(p: FolderProject) {
		if (exporting !== null) return;
		exporting = p.id;
		menuOf = null;
		try {
			const res = await fetch(`/api/projects/${encodeURIComponent(p.id)}/export`);
			if (!res.ok) {
				// A route refusal answers { message } in JSON; anything else is shown as plain text.
				const text = await res.text().catch(() => '');
				let reason = text.replace(/<[^>]*>/g, ' ').trim().slice(0, 200);
				try {
					const message = (JSON.parse(text) as { message?: unknown }).message;
					if (typeof message === 'string') reason = message;
				} catch {
					/* not JSON */
				}
				pushToast({ level: 'error', message: `The project was not exported.${reason ? ` ${reason}` : ''}` });
				return;
			}
			const blob = await res.blob();
			const named = /filename="?([^";]+)"?/.exec(res.headers.get('content-disposition') ?? '')?.[1];
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = named ?? `${p.name}.lyriks.zip`;
			document.body.appendChild(a);
			a.click();
			a.remove();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
			pushToast({ level: 'success', message: `Project “${p.name}” exported` });
		} catch {
			pushToast({ level: 'error', message: 'The project was not exported. The server could not be reached.' });
		} finally {
			exporting = null;
		}
	}

	/** Reuse the whole-project copy action, including its ownership, analysis and warnings. */
	function duplicate(p: FolderProject): SubmitFunction {
		return ({ cancel }) => {
			if (duplicating !== null) return cancel();
			duplicating = p.id;
			return async ({ result }) => {
				try {
					if (result.type === 'redirect') return await goto(result.location);
					if (result.type !== 'success') {
						const reason = result.type === 'failure' ? result.data?.message : result.error.message;
						pushToast({ level: 'error', message: `The project was not duplicated.${typeof reason === 'string' ? ` ${reason}` : ''}` });
						return;
					}
					const copy = result.data as { duplicated?: string; name?: string; warnings?: string[] } | undefined;
					if (!copy?.duplicated) {
						pushToast({ level: 'error', message: 'The project was not duplicated.' });
						return;
					}
					pushToast({ level: 'success', message: `Project “${copy.name ?? `${p.name} (copy)`}” created` });
					for (const warning of copy.warnings ?? []) pushToast({ level: 'warn', message: warning });
					await load();
				} finally {
					duplicating = null;
					menuOf = null;
				}
			};
		};
	}

	/**
	 * Delete a project: it leaves the panel at once. Leaving the project open on
	 * the page waits for the server, since every page reads the projects from
	 * it; a refusal puts the project back in the panel.
	 */
	async function remove(p: FolderProject, confirmName: string) {
		reset();
		const ok = await act(
			projectKey(p.id),
			{ kind: 'delete-project' },
			() => fetch(`/api/projects/${encodeURIComponent(p.id)}`, json('DELETE', { confirmName })),
			`Project “${p.name}” was not deleted.`,
			p.empty ? `Project “${p.name}” deleted` : `Project “${p.name}” and its ${p.featureCount} features deleted`
		);
		if (!ok) return;
		if (p.id === current?.id) {
			shell.close();
			await goto('/');
		} else await invalidateAll();
	}

	function ask(p: FolderProject) {
		// Nothing written yet: there is nothing to lose, so no name to type.
		if (p.empty) return void remove(p, p.name);
		deleting = deleting === p.id ? null : p.id;
		typed = '';
		moving = null;
	}

	/**
	 * The folders a drag can move, top to bottom: every saved one. Dragging is
	 * offered on the whole list only (no search narrowing it) and with no folder
	 * still on its way, so the order saved names every folder (rule a20195a8).
	 */
	const placeable = $derived((shown ?? []).filter((f): f is MenuFolder & { id: string } => f.id !== null && !f.pending));
	const orderable = $derived(canOrder && !query && placeable.length > 1 && (shown ?? []).every((f) => !f.pending));

	/** Drop a folder at `to` (action 5ccc378f): it reads there at once and the order is saved behind; the drop itself says it. */
	function reorder(id: string, to: number) {
		const ids = droppedOrder(placeable, id, to);
		if (!ids) return;
		void act(ORDER_KEY, { kind: 'reorder', ids }, () => fetch('/api/domains/order', json('PUT', { ids })), 'The folders were not reordered.', null);
	}

	function startDrag(e: DragEvent, f: MenuFolder & { id: string }) {
		dragging = f.id;
		slot = null;
		if (!e.dataTransfer) return;
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('text/plain', f.name);
		const group = (e.currentTarget as HTMLElement).closest('.fg');
		if (group) e.dataTransfer.setDragImage(group, 20, 20);
	}

	/** Over a folder, the slot above it in its upper half and below it in its lower half; over No folder, the last slot. */
	function overFolder(e: DragEvent, index: number | null) {
		if (dragging === null) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		if (index === null) return void (slot = placeable.length);
		const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
		slot = e.clientY < box.top + box.height / 2 ? index : index + 1;
	}

	function drop(e: DragEvent) {
		if (dragging === null) return;
		e.preventDefault();
		const from = placeable.findIndex((f) => f.id === dragging);
		if (from >= 0 && slot !== null) reorder(dragging, slot > from ? slot - 1 : slot);
		endDrag();
	}

	/** Dropped, or let go outside, or Escape pressed during the drag: the line goes, nothing moved but a drop. */
	function endDrag() {
		dragging = null;
		slot = null;
	}

	/** Where the drop line shows: never at the dragged folder's own place, where the drop changes nothing. */
	const lineAt = $derived.by(() => {
		if (dragging === null || slot === null) return null;
		const from = placeable.findIndex((f) => f.id === dragging);
		return slot === from || slot === from + 1 ? null : slot;
	});

	/** Alt with the up or down arrow moves the folder by one, the keyboard's drag; its grip keeps the focus. */
	async function moveByKey(e: KeyboardEvent, f: MenuFolder) {
		if (!orderable || !e.altKey || f.id === null || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
		e.preventDefault();
		const from = placeable.findIndex((x) => x.id === f.id);
		reorder(f.id, from + (e.key === 'ArrowUp' ? -1 : 1));
		await tick();
		document.getElementById(`lk-grip-${f.id}`)?.focus();
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			hit = Math.max(0, Math.min(rows.length - 1, hit + (e.key === 'ArrowDown' ? 1 : -1)));
		} else if (e.key === 'Enter') {
			e.preventDefault();
			choose(rows[hit]);
		}
	}

	/** Escape cancels an inline field first; the panel closes on the next one. */
	function escape(): boolean {
		if (renaming === null && adding === null && deleting === null && moving === null) return false;
		reset();
		return true;
	}

	const plural = (n: number, one: string) => `${n} ${one}${n > 1 ? 's' : ''}`;
	const field = 'box-border min-h-9 border-[1.5px] border-ink bg-paper px-2.5 text-[0.8125rem] text-ink outline-none placeholder:text-ink-4 focus:shadow-[3px_3px_0_var(--color-blue)]';
	const primary = 'pressable min-h-9 cursor-pointer border-[1.5px] border-ink bg-blue-ink px-3 text-xs font-bold tracking-[0.07em] text-paper uppercase disabled:opacity-40';
</script>

<SidePanel {open} label="Switch project" onclose={() => shell.close()} focus={() => input} onescape={escape}>
	{#snippet head()}
		<SideIcon name="project" />
		<input bind:this={input} bind:value={q} oninput={() => (hit = 0)} onkeydown={onKey} type="text" placeholder="Find a project…" aria-label="Find a project" autocomplete="off" />
	{/snippet}
	<div class="prj">
		{#if adding === 'folder'}
			<div class="fg">
				<div class="fh">
					<SideIcon name="folder" />
					<!-- svelte-ignore a11y_autofocus -->
					<input class="fren" aria-label="Folder name" bind:value={name} placeholder="Folder name" autofocus onkeydown={(e) => e.key === 'Enter' && saveFolder()} />
					<button type="button" class="quiet qa blue" onclick={saveFolder}>Add</button>
					<button type="button" class="pic" aria-label="Cancel" onclick={reset}><SideIcon name="close" size={15} /></button>
				</div>
			</div>
		{/if}
		{#if shown === null}
			<span class="e" role="status">Loading the projects…</span>
		{:else}
			{#each visible as { folder: f, projects } (f.id ?? '')}
				{@const real = f.id !== null}
				{@const empty = f.projects.length === 0}
				{@const at = placeable.findIndex((x) => x.id === f.id)}
				{@const grip = orderable && at >= 0}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="fg"
					class:dragged={dragging !== null && dragging === f.id}
					class:line-before={lineAt !== null && at >= 0 && lineAt === at}
					class:line-after={lineAt !== null && at >= 0 && lineAt === placeable.length && at === placeable.length - 1}
					ondragover={(e) => orderable && (at >= 0 || !real) && overFolder(e, at >= 0 ? at : null)}
					ondrop={drop}
				>
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="fh" onkeydown={(e) => moveByKey(e, f)}>
						{#if grip && f.id !== null}
							<!-- The grip takes the folder icon's place while the pointer is on the folder (criterion ddf5cc35). -->
							<button
								type="button"
								id="lk-grip-{f.id}"
								class="grip"
								draggable="true"
								aria-label="Move folder {f.name}: drag it, or press Alt with the up or down arrow"
								title="Drag to move the folder (Alt + up or down arrow)"
								ondragstart={(e) => startDrag(e, f as MenuFolder & { id: string })}
								ondragend={endDrag}
							>
								<SideIcon name="folder" class="gf" />
								<svg class="gd" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"
									><circle cx="9" cy="6" r="1.6"></circle><circle cx="15" cy="6" r="1.6"></circle><circle cx="9" cy="12" r="1.6"></circle><circle cx="15" cy="12" r="1.6"></circle><circle cx="9" cy="18" r="1.6"></circle><circle cx="15" cy="18" r="1.6"></circle></svg
								>
							</button>
						{:else}
							<SideIcon name="folder" />
						{/if}
						{#if renaming !== null && renaming === f.id}
							<input
								id="lk-folder-rename"
								class="fren"
								aria-label="Folder name"
								maxlength="80"
								bind:value={newName}
								onkeydown={(e) => {
									if (e.key === 'Enter') saveRename(f);
								}}
								onblur={() => renaming === f.id && saveRename(f)}
							/>
						{:else}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<span class="fn" class:nf={!real} title={real && !f.pending ? 'Double-click to rename' : undefined} ondblclick={() => startRename(f)}>{f.name}</span>
						{/if}
						{#if real && !f.pending && renaming !== f.id}
							<button type="button" class="pic" aria-label="Rename folder {f.name}" title="Rename" onclick={() => startRename(f)}><SideIcon name="pencil" size={15} /></button>
						{/if}
						{#if !f.pending}
							<button type="button" class="quiet qa blue" onclick={() => { reset(); adding = { folder: f.id }; }}>+ Project</button>
						{/if}
						{#if real && !f.pending}
							<button
								type="button"
								class="pic del"
								class:off={!empty}
								aria-label={empty ? `Delete folder ${f.name}` : 'Empty the folder first'}
								title={empty ? 'Delete this empty folder' : 'Empty the folder first'}
								onclick={() => deleteFolder(f)}><SideIcon name="trash" size={15} /></button
							>
						{:else}
							<span class="pic-room"></span>
						{/if}
					</div>
					{#if empty && !(adding && adding !== 'folder' && adding.folder === f.id)}
						<div class="fe">Empty folder</div>
					{/if}
					{#each projects as p (p.id)}
						{@const on = p.id === current?.id}
						{@const i = rows.indexOf(p)}
						<div class="pr" class:cur={on} class:hit={i === hit && !on}>
							<button type="button" class="pn" title={p.featureCount ? plural(p.featureCount, 'feature') : 'Empty'} onmousemove={() => (hit = i)} onclick={() => choose(p)}>
								<span class="pnt">{p.name}</span>
								{#if on}<span class="ck" aria-label="(current)"><SideIcon name="check" size={13} strokeWidth={2.4} /></span>{/if}
								{#if activeProjectId === p.id}<span class="act" title="Community works on this project">Active</span>{:else if activeProjectId}<span class="act off" title="Open it to make it the active project">Inactive</span>{/if}
							</button>
							<div class="pa">
								<!-- The row's menu (criterion 54b86d96 of feat-134): Duplicate and Export (.zip). -->
								<div class="pm" use:menuRoot={p.id}>
									<button type="button" class="pic" class:on={menuOf === p.id} aria-haspopup="menu" aria-expanded={menuOf === p.id} aria-label="More for {p.name}" title={duplicating === p.id ? 'Duplicating…' : exporting === p.id ? 'Exporting…' : 'More'} onclick={(e) => { e.stopPropagation(); menuOf = menuOf === p.id ? null : p.id; }}>
										{#if duplicating === p.id || exporting === p.id}<span class="busy" aria-hidden="true"></span>{:else}<SideIcon name="more" size={17} strokeWidth={3} />{/if}
									</button>
									{#if menuOf === p.id}
										<div class="pmenu" role="menu" aria-label="{p.name} actions">
											<form method="POST" action="/?/duplicateProject" use:enhance={duplicate(p)}>
												<input type="hidden" name="projectId" value={p.id} />
												<button type="submit" role="menuitem" aria-busy={duplicating === p.id} disabled={duplicating !== null}><SideIcon name="copy" size={15} />{duplicating === p.id ? 'Duplicating…' : 'Duplicate'}</button>
											</form>
											<button type="button" role="menuitem" aria-busy={exporting === p.id} disabled={exporting !== null} onclick={() => exportZip(p)}><SideIcon name="download" size={15} />{exporting === p.id ? 'Exporting…' : 'Export (.zip)'}</button>
										</div>
									{/if}
								</div>
								{#if (shown?.length ?? 0) > 1}
									<button type="button" class="pic" aria-label="Move {p.name} to a folder" title="Move to a folder" onclick={() => { moving = moving === p.id ? null : p.id; deleting = null; }}><SideIcon name="move" size={15} /></button>
								{/if}
								<button type="button" class="pic del" aria-label="Delete {p.name}" title="Delete" onclick={() => ask(p)}><SideIcon name="trash" size={15} /></button>
							</div>
						</div>
						{#if moving === p.id}
							<div class="flex flex-wrap items-center gap-1.5 px-1.5 pb-2">
								<span class="font-evo-mono text-xs text-ink-3">Move to:</span>
								{#each (shown ?? []).filter((g) => g.id !== f.id && !g.pending) as g (g.id ?? '')}
									<button type="button" onclick={() => move(p, g)} class="min-h-7 cursor-pointer border-[1.5px] border-line bg-paper px-2.5 text-xs font-medium text-ink hover:border-ink">{g.name}</button>
								{/each}
							</div>
						{/if}
						{#if deleting === p.id}
							<div class="mx-1.5 mb-2 flex flex-col gap-1.5 border-[1.5px] border-red-ink bg-red-tint p-2.5">
								<span class="text-xs font-semibold text-red-ink">Delete {p.name} and its {plural(p.featureCount, 'feature')}? This cannot be undone. Type the project name to confirm.</span>
								<input aria-label="Project name" bind:value={typed} placeholder={p.name} class={field} />
								<div class="flex justify-end gap-3">
									<button type="button" onclick={reset} class="quiet qa">Cancel</button>
									<button
										type="button"
										onclick={() => remove(p, typed.trim())}
										disabled={typed.trim() !== p.name}
										class="min-h-9 border-[1.5px] px-3 text-xs font-bold tracking-[0.07em] uppercase {typed.trim() === p.name ? 'pressable cursor-pointer border-ink bg-red-ink text-paper' : 'cursor-not-allowed border-toner-2 bg-toner-2 text-ink-3'}"
									>Delete for good</button>
								</div>
							</div>
						{/if}
					{/each}
					{#if adding && adding !== 'folder' && adding.folder === f.id}
						<div class="flex gap-1.5 px-1.5 pt-1">
							<!-- svelte-ignore a11y_autofocus -->
							<input aria-label="Project name" bind:value={name} placeholder="Project name" autofocus onkeydown={(e) => e.key === 'Enter' && saveProject(f.id)} class="{field} flex-auto" />
							<button type="button" onclick={() => saveProject(f.id)} disabled={creating} class={primary}>Add</button>
							<button type="button" class="pic" aria-label="Cancel" onclick={reset}><SideIcon name="close" size={15} /></button>
						</div>
					{/if}
				</div>
			{:else}
				<div class="e">{query ? `No project matches “${q.trim()}”.` : 'No project yet.'}</div>
			{/each}
		{/if}
	</div>
	{#snippet foot()}
		<button type="button" class="quiet qa blue ml-auto" onclick={() => { reset(); adding = 'folder'; }}>+ Folder</button>
		<button type="button" class="pressable newp" onclick={() => { shell.close(); openOnboarding(); }}>+ New project</button>
	{/snippet}
</SidePanel>

<style>
	/* The design's projects panel (.prj, .fg, .fh, .pr). */
	:global {
		.lk-pal .prj {
			display: grid;
			align-content: start;
			gap: 12px;
			padding: 8px 16px 0;
		}
		.lk-pal .prj .e {
			padding: 8px 4px;
		}
		.lk-pal .fg {
			padding: 4px 8px 8px;
			border: 1px solid var(--color-line);
			background: var(--color-toner);
		}
		.lk-pal .fg {
			position: relative;
		}
		.lk-pal .fg.dragged {
			opacity: 0.45;
		}
		/* The line a drop lands on, in the 12px gap between two folders. */
		.lk-pal .fg.line-before::before,
		.lk-pal .fg.line-after::after {
			position: absolute;
			right: 0;
			left: 0;
			height: 3px;
			background: var(--color-blue);
			content: '';
			pointer-events: none;
		}
		.lk-pal .fg.line-before::before {
			top: -8px;
		}
		.lk-pal .fg.line-after::after {
			bottom: -8px;
		}
		.lk-pal .grip {
			display: inline-flex;
			flex: none;
			align-items: center;
			justify-content: center;
			width: 16px;
			height: 28px;
			padding: 0;
			border: 0;
			background: none;
			color: inherit;
			cursor: grab;
		}
		.lk-pal .grip:active {
			cursor: grabbing;
		}
		.lk-pal .grip .gd {
			display: none;
			color: var(--color-ink-3);
		}
		.lk-pal .fg:hover .grip .gf,
		.lk-pal .grip:focus-visible .gf {
			display: none;
		}
		.lk-pal .fg:hover .grip .gd,
		.lk-pal .grip:focus-visible .gd {
			display: inline-block;
		}
		.lk-pal .fh {
			display: flex;
			align-items: center;
			gap: 10px;
			min-height: 42px;
			padding: 0 6px;
			color: var(--color-ink);
		}
		.lk-pal .fn {
			flex: 1;
			min-width: 0;
			overflow: hidden;
			font: 700 0.75rem/1 var(--font-evo-mono);
			letter-spacing: 0.08em;
			text-overflow: ellipsis;
			text-transform: uppercase;
			white-space: nowrap;
			cursor: text;
		}
		.lk-pal .fn.nf {
			font: 700 0.875rem/1 var(--font-evo);
			letter-spacing: 0;
			text-transform: none;
			cursor: default;
		}
		.lk-pal input.fren {
			flex: 1;
			min-width: 0;
			height: 30px;
			padding: 0 8px;
			border: 1.5px solid var(--color-ink);
			background: var(--color-paper);
			color: var(--color-ink);
			font: 700 0.75rem/1 var(--font-evo-mono);
			letter-spacing: 0.08em;
			text-transform: uppercase;
			outline: none;
		}
		.lk-pal input.fren:focus {
			box-shadow: 3px 3px 0 var(--color-blue);
		}
		.lk-pal .fh .qa {
			height: 24px;
		}
		.lk-pal .fe {
			padding: 4px 6px 8px;
			color: var(--color-ink-3);
			font: 400 0.75rem/1.4 var(--font-evo-mono);
		}
		.lk-pal .pr {
			display: flex;
			align-items: center;
			gap: 6px;
			min-height: 40px;
			padding: 0 6px;
		}
		.lk-pal .pr.hit {
			background: var(--color-toner-1);
		}
		.lk-pal .pr.cur {
			background: var(--color-blue-tint);
		}
		.lk-pal .pn {
			display: flex;
			flex: 1;
			align-items: center;
			gap: 8px;
			min-width: 0;
			height: 40px;
			padding: 0;
			border: 0;
			background: none;
			color: var(--color-ink);
			font: 700 0.875rem/1 var(--font-evo);
			text-align: left;
			cursor: pointer;
		}
		.lk-pal .pnt {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.lk-pal .pn .ck {
			display: inline-flex;
			color: var(--color-blue-ink);
		}
		.lk-pal .pn .act {
			flex: none;
			padding: 1px 6px;
			border: 1.5px solid var(--color-ink);
			background: var(--color-ink);
			color: var(--color-paper);
			font: 700 0.625rem/1.4 var(--font-evo-mono);
			letter-spacing: 0.06em;
			text-transform: uppercase;
		}
		.lk-pal .pn .act.off {
			border-color: var(--color-line);
			background: none;
			color: var(--color-ink-3);
		}
		.lk-pal .pa {
			display: flex;
			align-items: center;
			gap: 2px;
		}
		.lk-pal .pm {
			position: relative;
			display: flex;
		}
		.lk-pal .pic.on {
			opacity: 1;
			background: var(--color-toner-2);
			color: var(--color-ink);
		}
		.lk-pal .pmenu {
			position: absolute;
			top: calc(100% + 2px);
			right: 0;
			z-index: 20;
			display: grid;
			min-width: 168px;
			padding: 4px 0;
			border: 1.5px solid var(--color-ink);
			background: var(--color-paper);
			box-shadow: 3px 3px 0 var(--color-ink);
		}
		.lk-pal .pmenu form {
			display: contents;
		}
		.lk-pal .pmenu [role='menuitem'] {
			display: flex;
			align-items: center;
			gap: 8px;
			min-height: 32px;
			padding: 0 12px;
			border: 0;
			background: none;
			color: var(--color-ink);
			font-size: 0.8125rem;
			font-weight: 500;
			text-align: left;
			white-space: nowrap;
			cursor: pointer;
		}
		.lk-pal .pmenu [role='menuitem']:hover:not(:disabled),
		.lk-pal .pmenu [role='menuitem']:focus-visible {
			background: var(--color-toner-2);
		}
		.lk-pal .pmenu [role='menuitem']:disabled {
			opacity: 0.5;
			cursor: wait;
		}
		.lk-pal .busy {
			width: 12px;
			height: 12px;
			border: 2px solid currentColor;
			border-right-color: transparent;
			border-radius: 50%;
			animation: lk-pal-spin 0.8s linear infinite;
		}
		@keyframes lk-pal-spin {
			to {
				transform: rotate(360deg);
			}
		}
		@media (prefers-reduced-motion: reduce) {
			.lk-pal .busy {
				animation: none;
			}
		}
		.lk-pal .pic {
			display: inline-flex;
			flex: none;
			align-items: center;
			justify-content: center;
			width: 28px;
			height: 28px;
			padding: 0;
			border: 0;
			background: none;
			color: var(--color-ink-3);
			opacity: 0.45;
			cursor: pointer;
		}
		.lk-pal .pic-room {
			flex: none;
			width: 28px;
		}
		.lk-pal :is(.pr, .fh):hover .pic,
		.lk-pal .pic:focus-visible {
			opacity: 1;
		}
		.lk-pal .pic:hover {
			background: var(--color-toner-2);
			color: var(--color-ink);
		}
		.lk-pal .pic.del:hover {
			background: var(--color-red-tint);
			color: var(--color-red-ink);
		}
		.lk-pal .pic.off {
			cursor: not-allowed;
		}
		.lk-pal .newp {
			height: 30px;
			padding: 0 14px;
			border: 1.5px solid var(--color-ink);
			background: var(--color-blue-ink);
			color: var(--color-paper);
			font: 700 0.625rem/1 var(--font-evo);
			letter-spacing: 0.07em;
			text-transform: uppercase;
			cursor: pointer;
		}
	}
</style>
