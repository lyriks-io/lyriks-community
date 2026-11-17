<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import StartChoice from '$ui/shell/StartChoice.svelte';
	import { openOnboarding } from '$ui/shell/onboarding.svelte';
	import { feedSince, feedSummary } from '$domain/activity';
	import { greeting } from '$domain/activity';
	import HomeCard from '$ui/home/HomeCard.svelte';
	import ProjectFilter from '$ui/home/ProjectFilter.svelte';
	import RunningNow from '$ui/home/RunningNow.svelte';
	import { HomeFeed } from '$ui/home/home-feed.svelte';
	import type { ActionData, PageData } from './$types';

	/**
	 * Home · all projects (feat-home, criterion 85c17859): the head (a greeting,
	 * since when the oldest unread card came in, one sentence summing up the feed
	 * whose numbers filter it), the feed of the reader's cards in the order of
	 * their level, the most urgent first, with no heading between them, limited
	 * to some projects from All projects, on the Unread cards or All, its older
	 * cards coming as the reader scrolls (criterion 8d6c0d92), and
	 * Running now at the right, above the feed on a narrow screen.
	 */
	let { data, form }: { data: PageData; form: ActionData } = $props();

	// The reader's own clock says the hour and the day; the server's would not. Until the page is live on the reader's
	// side it reads the server's (UTC) so the first paint matches the server's.
	let local = $state(false);
	let hour = $state(12);
	$effect(() => {
		local = true;
		hour = new Date().getHours();
	});
	const hello = $derived(greeting(hour, data.myName));

	// Limited to the project just picked in the panel of projects (criterion 11c7c8c8), from the first paint and on each pick from here.
	const pickedProject = $derived(page.url.searchParams.get('project'));
	const feed = new HomeFeed(() => data, untrack(() => pickedProject));
	$effect(() => {
		const id = pickedProject;
		if (id) untrack(() => feed.limitTo(id));
	});
	$effect(() => {
		const head = data.feed;
		untrack(() => feed.readAgain(head));
	});
	const summary = $derived(feedSummary(data.feedUnread, feed.unread, data.feedProjects.length));
	const since = $derived(feedSince(data.feedUnread, feed.unread));
	const sinceLine = $derived.by(() => {
		if (!since) return null;
		const d = new Date(since);
		const zone = local ? {} : { timeZone: 'UTC' };
		const day = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', ...zone });
		const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', ...zone });
		return `Since ${day}, ${time}`;
	});
	const cards = $derived(feed.shown);
	// A project picked that has no card yet still reads in the menu, with its name, so the filter can say what limits the feed.
	const projects = $derived.by(() => {
		const withCards = data.feedProjects;
		const without = [...feed.picked].filter((id) => !withCards.some((p) => p.projectId === id)).map((projectId) => ({ projectId, count: 0 }));
		return [...withCards, ...without].map((p) => ({ ...p, name: data.projectNames[p.projectId] ?? p.projectId })).sort((a, b) => a.name.localeCompare(b.name));
	});

	const current = $derived(page.data.currentProject as { id: string; name: string } | null);
	const startHere = $derived(current && data.emptyProjects.includes(current.id) ? current : null);

	const CTA = 'pressable min-h-9 cursor-pointer border-[1.5px] border-ink bg-ink px-3.5 text-xs font-bold tracking-[0.07em] text-paper uppercase hover:text-paper';
</script>

<svelte:head>
	<title>Home · Lyriks</title>
</svelte:head>

<div class="hm font-evo text-ink" class:with-rail={data.hasProjects}>
	<header class="hd">
		<h1 class="hd-t">{hello}</h1>
		{#if sinceLine}<p class="hd-d">{sinceLine}</p>{/if}
		<p class="hd-s">
			{#each summary as part, i (i)}
				{#if part.kind === 'filter'}
					{@const on = part.filter !== 'all' && feed.filter === part.filter}
					<button type="button" class="sm-n" class:on aria-pressed={part.filter === 'all' ? undefined : on} onclick={() => feed.choose(part.filter)}>{part.text}</button>
				{:else if part.kind === 'bold'}
					<b>{part.text}</b>
				{:else}
					<span>{part.text}</span>
				{/if}
			{/each}
		</p>
	</header>

	{#if data.hasProjects}
		<RunningNow runs={data.runs} />
	{/if}

	<section class="fd" aria-label="Feed">
		{#if !data.hasWorkspace}
			<!-- Bootstrap: no workspace yet, create one (become owner) instead of the 409 dead end. -->
			<div class="mb-7 flex flex-col gap-3 border-l-[6px] border-blue bg-blue-tint p-5">
				<h2 class="m-0 text-[0.9375rem] font-bold tracking-[-0.01em] text-ink">Create your workspace to get started</h2>
				<p class="m-0 text-sm text-ink-2">A workspace owns your projects and holds your team. You will be its owner and can invite colleagues from Settings.</p>
				<form method="POST" action="?/createWorkspace" use:enhance class="flex flex-wrap items-center gap-2">
					<input name="name" placeholder="Your team or company name" required class="box-border min-h-10 min-w-64 flex-1 border-[1.5px] border-ink-3 bg-surface-sunken px-3 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-blue" />
					<button type="submit" class={CTA}>Create workspace</button>
				</form>
				{#if form?.scope === 'workspace' && form?.message}
					<p class="m-0 text-xs font-medium text-red-ink">{form.message}</p>
				{/if}
			</div>
		{:else if !data.hasProjects}
			<!-- The welcome opens once per visit: a reader who skipped it, with no project yet, finds the way back here. -->
			<div class="mb-7 flex flex-wrap items-center justify-between gap-4 border-t-4 border-blue bg-paper px-6 py-5">
				<span class="flex flex-col gap-1.5">
					<span class="font-evo-mono text-xs tracking-[0.08em] text-ink-3">NO PROJECT YET</span>
					<span class="text-[1.0625rem] font-bold tracking-[-0.02em] text-ink">Create your first project</span>
				</span>
				<button type="button" onclick={openOnboarding} class={CTA}>Create a project →</button>
			</div>
		{/if}

		{#if startHere}
			<div class="mb-7 flex flex-col gap-5">
				<div class="flex flex-col gap-1.5">
					<span class="font-evo-mono text-xs tracking-[0.08em] text-ink-3 uppercase">New project · {startHere.name}</span>
					<h2 class="m-0 text-[1.375rem] leading-tight font-bold tracking-[-0.02em] text-ink">How do you want to start?</h2>
				</div>
				<StartChoice projectId={startHere.id} />
			</div>
		{/if}

		{#if data.hasProjects}
			<div class="fd-h">
				<h2 class="sr-only">Feed</h2>
				<ProjectFilter {projects} picked={feed.picked} ontoggle={(id) => feed.toggleProject(id)} onall={() => feed.clearProjects()} />
				<div class="fd-sw" role="group" aria-label="Show">
					<button type="button" class="fd-tb" class:on={feed.filter === 'new'} aria-pressed={feed.filter === 'new'} onclick={() => feed.show('new')}>Unread · {feed.unreadCount}</button>
					<button type="button" class="fd-tb" class:on={feed.filter === 'all'} aria-pressed={feed.filter === 'all'} onclick={() => feed.show('all')}>All</button>
				</div>
			</div>
			{#if cards.length > 0}
				<div class="fd-l">
					{#each cards as card (card.id)}
						<HomeCard {card} unread={feed.unread(card)} timeZone={local ? undefined : 'UTC'} onopen={() => feed.open(card)} onaside={() => feed.aside(card)} />
					{/each}
				</div>
			{:else if feed.next === null && !feed.failed}
				<p class="fd-empty">{data.feed.length === 0 ? 'Nothing came in from your projects yet.' : feed.filter === 'new' ? 'You are up to date. Nothing unread.' : 'No card matches this filter.'}</p>
			{/if}
			{#if feed.failed}
				<p class="fd-ft">The older cards could not be read. <button type="button" class="fd-retry" onclick={() => feed.loadOlder('try_again')}>Try again</button></p>
			{:else if feed.next !== null}
				<p class="fd-ft" role="status" {@attach feed.watchFoot}>{feed.loading ? 'Loading older cards…' : ''}</p>
			{/if}
		{/if}
	</section>
</div>

<style>
	/*
	 * The design's Home (.hm, layout Full column): the head and the feed on the left, Running now down the right from
	 * the top. Its own toner, its cards and its paper are the design's values for this page alone.
	 */
	.hm {
		--hm-bg: #e5decb;
		--hm-card: #efeadc;
		--hm-paper: #f7f4ec;
		--hm-line: var(--color-toner-2);
		--hm-muted: #5c574b;
		/* The ink of what was already read: design v4's faded mark and the shadow of a grey button. */
		--hm-faded: #8a8476;
		display: grid;
		/* Grows with its feed inside the app's scroller, never squeezed to the window's height. */
		flex: 1 0 auto;
		grid-template-columns: minmax(0, 1fr);
		align-items: start;
		min-height: 100%;
		background: var(--hm-bg);
	}
	.hm.with-rail {
		grid-template-columns: minmax(0, 1fr) 340px;
		grid-template-rows: auto 1fr;
	}
	.hd {
		grid-row: 1;
		grid-column: 1;
		padding: 48px 28px 12px;
	}
	.hm.with-rail :global(.rail) {
		grid-row: 1 / span 2;
		grid-column: 2;
		align-self: start;
	}
	.fd {
		grid-row: 2;
		grid-column: 1;
		min-width: 0;
		padding: 6px 28px 80px;
	}
	.hd-t {
		margin: 0;
		font-size: 2.125rem;
		font-weight: 700;
		line-height: 1.15;
		letter-spacing: -0.01em;
	}
	.hd-d {
		margin: 10px 0 14px;
		color: var(--hm-muted);
		font: 700 0.6875rem/1.3 var(--font-evo-mono);
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.hd-s {
		max-width: 600px;
		margin: 0;
		font-size: 1.3125rem;
		line-height: 1.55;
	}
	.hd-s b {
		font-weight: 700;
	}
	/* A number of the sentence that filters the feed (.sm-n): pressed, it reads blue and underlined. */
	.sm-n {
		padding: 0;
		border: 0;
		border-bottom: 1.5px solid transparent;
		background: none;
		color: var(--color-ink);
		font: inherit;
		font-weight: 700;
		cursor: pointer;
	}
	.sm-n:hover {
		border-bottom-color: var(--color-ink);
	}
	.sm-n.on {
		border-bottom: 3px solid var(--color-blue-ink);
		color: var(--color-blue-ink);
	}
	.fd-h {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 16px;
		margin-bottom: 6px;
	}
	/* The switch of the notifications panel (.ntb .tb), in the ink of this page. */
	.fd-sw {
		display: flex;
		gap: 20px;
	}
	.fd-tb {
		box-sizing: border-box;
		height: 36px;
		padding: 0 2px;
		border: 0;
		border-bottom: 3px solid transparent;
		background: none;
		color: var(--hm-muted);
		font: 600 0.78125rem/1.2 var(--font-evo);
		white-space: nowrap;
		cursor: pointer;
	}
	.fd-tb:hover {
		color: var(--color-ink);
	}
	.fd-tb.on {
		border-bottom-color: var(--color-ink);
		color: var(--color-ink);
	}
	.fd-l {
		margin-top: 14px;
	}
	/* Its height is kept empty so the words that come while cards travel do not push the page. */
	.fd-ft {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		min-height: 44px;
		margin: 14px 0 0;
		color: var(--hm-muted);
		font: 400 0.8125rem/1.3 var(--font-evo-mono);
	}
	.fd-retry {
		padding: 0;
		border: 0;
		background: none;
		color: var(--color-ink);
		font: inherit;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}
	.fd-empty {
		margin: 18px 0 0;
		padding: 28px;
		border: 1.5px dashed var(--color-line-strong);
		background: var(--hm-card);
		font-size: 0.9375rem;
		text-align: center;
	}
	/* A narrow screen reads Running now above the feed (criterion 85c17859). */
	@media (max-width: 1100px) {
		.hm.with-rail {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto auto 1fr;
		}
		.hm.with-rail :global(.rail) {
			grid-row: 2;
			grid-column: 1;
		}
		.hm.with-rail .fd {
			grid-row: 3;
		}
	}
	@media (max-width: 760px) {
		.hd {
			padding: 22px 16px 18px;
		}
		.hd-t {
			font-size: 1.5rem;
		}
		.hd-d {
			margin: 6px 0 10px;
			font-size: 0.625rem;
		}
		.hd-s {
			font-size: 1.1875rem;
			line-height: 1.5;
		}
		.fd {
			padding: 14px 12px 72px;
		}
	}
</style>
