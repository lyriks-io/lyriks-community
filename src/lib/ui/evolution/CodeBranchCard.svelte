<script lang="ts">
	import { HelpTip, Icon, pushToast } from '$ui/design-system';
	import type { DossierReading } from '$lib/server/evolution-view.server';
	import { shortSha } from '$domain/evolution';
	import { applyEvolution } from './reading-api';
	import { KICKER, SECONDARY_44 } from './evo-look';
	import { codeSummary, COMMITTED_TIP, testedTip, type GlanceTone } from './code-summary';
	import { personName } from './people';

	/**
	 * Where the request's code stands in git, from its branch to its merge
	 * (feat-evo-code-branch): the deployment branch the project names, the
	 * branch the request's code is written on with the command that creates
	 * it, its last commit of code, whether the tree is clean, the commit the
	 * proofs were taken on, the validated commit and the merge, the repository
	 * it lives in and, behind one link, every commit of the branch since its
	 * start. The card reads at a glance: the branch and the one thing that
	 * matters now; every technical line waits behind Details. Lyriks never
	 * touches the repository: every line here is what the person's AI reported.
	 */
	interface Props {
		projectId: string;
		dossier: DossierReading;
		canEdit: boolean;
		/** The roster, so who approved is named, never shown by id. */
		members?: readonly { id: string; name: string }[];
	}
	let { projectId, dossier, canEdit, members = [] }: Props = $props();

	const code = $derived(dossier.code);
	// The design's tags: what holds filled green, what to watch orange, the rest a toner-2 chip.
	const TONE: Record<GlanceTone, string> = { ok: 'border-green bg-green text-ink', warn: 'border-orange bg-orange text-ink', muted: 'border-toner-2 bg-toner-2 text-ink-2' };
	/** What changing the deployment branch does, said before and while it is changed. */
	const CHANGE_TIP = "Changing it applies to every open request: new branches are created from it and every merge goes into it. A branch already created keeps the commit it started from.";
	/** The technical lines, folded until the person asks for them. */
	let detailsOpen = $state(false);
	let editing = $state(false);
	// The history of the branch's commits, opened in place by its link (ac-evo-branch-history).
	let historyOpen = $state(false);
	const sameCommit = (a: string | null, b: string) => !!a && (a.startsWith(b) || b.startsWith(a));
	let branchInput = $state('');
	let saving = $state(false);
	async function saveBranch() {
		const branch = branchInput.trim();
		if (!branch || saving) return;
		saving = true;
		try {
			if (await applyEvolution(projectId, [{ op: 'set_deployment_branch', branch }], { what: 'the deployment branch' })) editing = false;
		} finally {
			saving = false;
		}
	}
	async function copy(text: string, what: string) {
		try {
			await navigator.clipboard.writeText(text);
			pushToast({ level: 'success', message: `${what} copied` });
		} catch {
			pushToast({ level: 'error', message: 'The clipboard is not available here.' });
		}
	}
	const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
	const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
	const CHIP = 'border-[1.5px] px-2.5 py-1 font-evo-mono text-xs font-bold tracking-[0.04em]';
</script>

<section class="flex flex-col gap-3 rounded-evo-card border border-transparent bg-surface px-6 py-5" aria-label="Code on its branch">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<span class={KICKER}>CODE ON ITS BRANCH</span>
		{#if code && !editing}
			<button
				type="button"
				class="inline-flex items-center gap-1 text-sm font-semibold text-blue-ink underline-offset-2 hover:underline"
				aria-expanded={detailsOpen}
				aria-controls="code-details"
				onclick={() => (detailsOpen = !detailsOpen)}>{detailsOpen ? 'Hide details' : 'Details'}<Icon name={detailsOpen ? 'chevron-up' : 'chevron-down'} size={12} /></button
			>
		{/if}
	</div>

	{#if !code || editing}
		<!-- No deployment branch named: requests are built and declared live as before (ac-evo-branch-setting). -->
		{#if !code}<p class="m-0 text-sm text-ink-2">Name the branch this project deploys from: each request's code is then written on a branch of its own, derived from it, and the merge of the validated commit makes the change official.</p>{/if}
		{#if canEdit}
			<form class="flex flex-wrap items-center gap-2" onsubmit={(e) => (e.preventDefault(), void saveBranch())}>
				<label class="sr-only" for="deployment-branch">Deployment branch</label>
				<input id="deployment-branch" class="h-11 w-56 rounded-evo-btn border-[1.5px] border-evo-control bg-toner-1 px-3 font-evo-mono text-sm focus:border-blue focus:outline-none" placeholder="main" bind:value={branchInput} />
				<button type="submit" class={SECONDARY_44} disabled={saving || !branchInput.trim()}>Save</button>
				{#if editing}<button type="button" class="quiet text-ink" onclick={() => (editing = false)}>Cancel</button>{/if}
			</form>
			{#if editing}
				<p class="m-0 text-xs leading-normal text-ink-3">{CHANGE_TIP}</p>
			{/if}
		{:else}
			<p class="m-0 text-sm text-ink-3 italic">Only who may edit the project names its deployment branch.</p>
		{/if}
	{:else}
		<!-- The summary: where the code lives and the one thing that matters now, explained on hover. -->
		{@const glance = codeSummary(code)}
		<div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
			{#if code.repository}
				<!-- The repository the code lives in, its remote's address on hover (ac-evo-branch-repository). -->
				<span class="inline-flex items-center gap-1.5" title={code.repository.url ? `Repository ${code.repository.url}` : "No remote: the checkout's folder"}
					><Icon name="book" size={16} class="flex-none text-evo-muted" /><span class="sr-only">Repository</span><span class="font-evo-mono text-sm font-semibold text-evo-ink">{code.repository.name}</span></span
				>
				<span class="text-ink-3" aria-hidden="true">/</span>
			{/if}
			<span class="inline-flex items-center gap-1.5" title="The branch this request's code is written on"
				><Icon name="git-branch" size={16} class="flex-none text-evo-muted" /><span class="font-evo-mono text-sm font-semibold text-evo-ink">{code.expectedBranch}</span></span
			>
			<span class="{CHIP} ml-1 cursor-help {TONE[glance.tone]}" title={glance.tip}>{glance.word}</span>
			{#if !code.branch}
				<button type="button" class="inline-flex items-center gap-1.5 text-xs text-blue-ink hover:underline" title={code.createCommand} onclick={() => copy(code.createCommand, 'The command that creates the branch')}
					><Icon name="copy" size={12} /><span class="font-evo-mono">{code.createCommand}</span></button
				>
			{/if}
			<!-- One click opens every commit of the branch since its start, whatever Details shows (ac-evo-branch-history). -->
			{#if code.commitCount > 0}
				<button
					type="button"
					class="ml-1 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-ink underline-offset-2 hover:underline"
					aria-expanded={historyOpen}
					aria-controls="branch-history"
					onclick={() => (historyOpen = !historyOpen)}
					><Icon name="history" size={14} />History · {code.commitCount} {code.commitCount === 1 ? 'commit' : 'commits'}<Icon name={historyOpen ? 'chevron-up' : 'chevron-down'} size={12} /></button
				>
			{/if}
		</div>
		{#if historyOpen && code.history.length > 0}
			<!-- Every commit of the branch since its start, newest first, as git listed them at the last report. -->
			<ol id="branch-history" class="m-0 flex list-none flex-col rounded-xl border border-line bg-toner-1 p-0" aria-label="Commits of {code.expectedBranch}">
				{#each code.history as commit (commit.sha)}
					<li class="grid grid-cols-[4.5rem_1fr_auto] items-center gap-x-3 border-b border-line px-3 py-2 text-sm last:border-b-0">
						<button type="button" class="justify-self-start font-evo-mono font-bold text-blue-ink hover:underline" title="Copy {commit.sha}" onclick={() => copy(commit.sha, 'The commit id')}>{shortSha(commit.sha)}</button>
						<span class="flex min-w-0 flex-col">
							<span class="truncate {commit.code ? 'text-evo-ink' : 'text-ink-3'}" title={commit.subject}>{commit.subject}</span>
							<span class="font-evo-mono text-xs text-ink-3">{commit.author}{commit.at ? ` · ${DATE.format(new Date(commit.at))}` : ''}</span>
						</span>
						<span class="flex flex-wrap justify-end gap-1.5">
							{#if sameCommit(code.codeHead, commit.sha)}<span class="{CHIP} border-blue bg-transparent text-blue-ink" title="The branch's last commit that changes code: the tests were taken on it">last commit of code</span>{/if}
							{#if sameCommit(code.validatedCommit, commit.sha)}<span class="{CHIP} border-green bg-green text-ink">validated</span>{/if}
							{#if !commit.code}<span class="{CHIP} border-toner-2 bg-toner-2 text-ink-2" title="This commit only records the implementation index or the test report: it changes no code">index only</span>{/if}
						</span>
					</li>
				{/each}
				{#if code.commitCount > code.history.length}
					<li class="px-3 py-2 font-evo-mono text-xs text-ink-3">and {code.commitCount - code.history.length} older {code.commitCount - code.history.length === 1 ? 'commit' : 'commits'} not listed</li>
				{/if}
				{#if code.baseCommit}
					<li class="px-3 py-2 font-evo-mono text-xs text-ink-3">Started from <span class="font-evo-mono">{code.deploymentBranch}@{shortSha(code.baseCommit)}</span></li>
				{/if}
			</ol>
		{/if}

		<!-- The details unfold in place (grid rows from 0fr to 1fr), the page below following the card's height. -->
		<div id="code-details" class="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none {detailsOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}" inert={!detailsOpen}>
			<div class="flex min-h-0 flex-col overflow-hidden">
				<dl class="m-0 mt-1 grid grid-cols-[max-content_1fr] items-center gap-x-8 gap-y-2.5 border-t border-line pt-3 text-sm">
					{#if code.branch}
						<dt class="font-evo-mono text-xs tracking-[0.06em] text-ink-3 uppercase">Started from</dt>
						<dd class="m-0 font-evo-mono text-evo-ink" title="The commit of {code.deploymentBranch} the branch was created from">{code.deploymentBranch}{code.baseCommit ? `@${shortSha(code.baseCommit)}` : ''}</dd>
					{/if}
					{#if code.codeHead}
						<dt class="font-evo-mono text-xs tracking-[0.06em] text-ink-3 uppercase">Last commit of code</dt>
						<dd class="m-0 flex flex-wrap items-center gap-2">
							<span class="font-evo-mono text-evo-ink" title="The branch's last commit that changes code (the implementation index and the test report left out)">{shortSha(code.codeHead)}</span>
							<span class="{CHIP} cursor-help {code.clean ? 'border-green bg-green text-ink' : 'border-orange bg-orange text-ink'}" title={code.clean ? COMMITTED_TIP : 'Changes not committed yet: a test taken on them proves no commit.'}
								>{code.clean ? 'all committed' : 'uncommitted changes'}</span
							>
						</dd>
						<dt class="font-evo-mono text-xs tracking-[0.06em] text-ink-3 uppercase">Tests</dt>
						<dd class="m-0 flex flex-wrap items-center gap-2">
							<span class="{CHIP} cursor-help {code.proofsChecked > 0 && code.proofsOnOtherCommits === 0 ? 'border-green bg-green text-ink' : code.proofsChecked > 0 ? 'border-orange bg-orange text-ink' : 'border-toner-2 bg-toner-2 text-ink-2'}" title={testedTip(code)}
								>{code.proofsChecked === 0 ? 'none reported yet' : code.proofsOnOtherCommits === 0 ? `${code.proofsChecked} passed on this commit` : `${code.proofsOnOtherCommits} of ${code.proofsChecked} on another commit`}</span
							>
							{#if code.reportedAt}<span class="font-evo-mono text-xs text-ink-3">reported at {TIME.format(new Date(code.reportedAt))}</span>{/if}
						</dd>
					{/if}
					<!-- The approval fixes the commit that goes live: none before it, none once a later commit set it aside (EVO-011, criteria e33a838a, 225154a2). -->
					{#if code.validatedCommit && !code.validationSetAside}
						<dt class="font-evo-mono text-xs tracking-[0.06em] text-ink-3 uppercase">Validated commit</dt>
						<dd class="m-0 flex flex-wrap items-center gap-2">
							<span class="font-evo-mono text-evo-ink" title="The commit the approval fixed: what the merge brings into {code.deploymentBranch}">{shortSha(code.validatedCommit)}</span>
							{#if code.validatedBy}<span class="text-sm text-ink-2">approved by {personName(code.validatedBy, members)}</span>{/if}
						</dd>
					{:else if code.validationSetAside}
						<dt class="font-evo-mono text-xs tracking-[0.06em] text-ink-3 uppercase">Approval</dt>
						<dd class="m-0 flex flex-wrap items-center gap-2">
							<span class="{CHIP} border-orange bg-orange text-ink">the branch moved since the approval: approve again</span>
						</dd>
					{/if}
					{#if code.mergedCommit}
						<dt class="font-evo-mono text-xs tracking-[0.06em] text-ink-3 uppercase">Merged</dt>
						<dd class="m-0 flex flex-wrap items-center gap-2">
							<span class="font-evo-mono text-evo-ink">{code.mergedInto}@{shortSha(code.mergedCommit)}</span>
							<span class="{CHIP} border-green bg-green text-ink">official</span>
						</dd>
					{/if}
					<dt class="inline-flex items-center gap-1.5 font-evo-mono text-xs tracking-[0.06em] text-ink-3 uppercase">
						Deployment branch
						<HelpTip
							title="Deployment branch"
							what="The branch this project deploys from. Each request's code is written on a branch of its own created from it, and the merge of the validated commit into it is what makes a change official in the specification."
							how={['Lyriks refuses code reported from it: nothing is written on it directly.', CHANGE_TIP]}
							value="Until its merge, a change can be abandoned by deleting its branch: the deployment branch never held its code."
						/>
					</dt>
					<dd class="m-0 flex flex-wrap items-center gap-2">
						<span class="font-evo-mono text-evo-ink">{code.deploymentBranch}</span>
						{#if canEdit}<button type="button" class="font-semibold text-blue-ink underline-offset-2 hover:underline" onclick={() => ((branchInput = code.deploymentBranch), (editing = true))}>change</button>{/if}
					</dd>
				</dl>
				{#if code.deleteCommand}
					<button type="button" class="mt-2.5 inline-flex items-center gap-1.5 self-start text-xs text-blue-ink hover:underline" onclick={() => copy(code.deleteCommand ?? '', 'The command that deletes the branch')}
						><Icon name="copy" size={12} />Cancelled: <span class="font-evo-mono">{code.deleteCommand}</span></button
					>
				{/if}
			</div>
		</div>
	{/if}
</section>
