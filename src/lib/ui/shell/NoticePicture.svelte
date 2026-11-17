<script lang="ts">
	import type { BellNotification, BellPerson } from './notification-view';

	/**
	 * The picture of a notification card, between its text and its actions
	 * (criterion 65fdff0a of feat-feedback-docs): the same kind of event always
	 * drawn the same way, so it reads before the text. Every word it shows is
	 * written, never told by a colour alone.
	 */
	interface Props {
		visual: NonNullable<BellNotification['visual']>;
		/** Drawn larger, as the cards of Home's feed show it (criterion 45137624 of feat-home). */
		feed?: boolean;
	}
	let { visual, feed = false }: Props = $props();

	const tallest = $derived(visual.kind === 'histogram' ? Math.max(1, ...visual.days) : 1);
</script>

{#snippet face(p: BellPerson)}
	<span class="np-face" class:you={p.you} class:new={p.isNew} style:background={p.you ? undefined : p.color} title={p.name}>{p.initials}</span>
{/snippet}

<div class="np" class:feed data-kind={visual.kind}>
	{#if visual.kind === 'steps'}
		<ol class="np-steps" style:--n={visual.steps.length}>
			{#each visual.steps as s (s.label)}
				<li class={s.state} aria-current={s.state === 'now' ? 'step' : undefined}>
					<span class="bar"></span>
					<strong>{s.label}</strong>
					<span>{s.sub}</span>
				</li>
			{/each}
		</ol>
	{:else if visual.kind === 'chips'}
		{#if visual.chips.length}
			<div class="np-chips">
				{#each visual.chips as c, i (i)}<span class:strong={c.strong}>{c.label}</span>{/each}
				{#if visual.more > 0}<span class="more">+{visual.more}</span>{/if}
			</div>
		{/if}
		<div class="np-figures">
			{#each visual.figures as f (f.label)}<span><b>{f.n}</b> {f.label}</span>{/each}
		</div>
	{:else if visual.kind === 'gauge'}
		<div class="np-gauge">
			<div class="row"><span><b>{visual.pct}%</b> analyzed</span><span class="st">{visual.status}</span></div>
			<span class="track" role="img" aria-label="{visual.pct}% analyzed"><span style:width="{visual.pct}%"></span></span>
			<span class="kept">{visual.kept}</span>
		</div>
	{:else if visual.kind === 'stamp'}
		<div class="np-stamp">
			<span class="word">{visual.word}</span>
			<div>
				<span class="line">{visual.line}</span>
				{#if visual.people.length}<div class="faces">{#each visual.people as p, i (i)}{@render face(p)}{/each}</div>{/if}
			</div>
		</div>
	{:else if visual.kind === 'people'}
		<div class="np-people">
			{#each visual.rows as r, i (i)}
				<div class="row">
					{@render face(r.person)}
					<span class="who"><b>{r.person.name}</b><span>{r.sub}</span></span>
					<span class="badge">{r.badge}</span>
				</div>
			{/each}
			{#if visual.quote}<q>{visual.quote}</q>{/if}
		</div>
	{:else if visual.kind === 'thread'}
		<div class="np-thread">
			{#if !feed}<span class="kick">{visual.title}</span>{/if}
			{#each visual.messages as m, i (i)}
				<div class="msg">
					{@render face(m.person)}
					<span class="bubble"><b>{m.person.name}</b><span>{m.text}</span></span>
				</div>
			{/each}
		</div>
	{:else if visual.kind === 'sheet'}
		<div class="np-sheet">
			<div class="head"><span class="kick">{visual.kicker}</span><strong>{visual.title}</strong><span class="badge">{visual.badge}</span></div>
			<dl>
				{#each visual.fields as f (f.label)}<div><dt>{f.label}</dt><dd>{f.value}</dd></div>{/each}
			</dl>
			{#if visual.note}<p>{visual.note}</p>{/if}
		</div>
	{:else if visual.kind === 'chain'}
		<ol class="np-chain">
			{#each visual.nodes as n, i (i)}
				{#if i > 0}<li class="arrow" aria-hidden="true">→</li>{/if}
				<li class={n.state}><span class="kick">{n.kicker}</span><strong>{n.title}</strong></li>
			{/each}
		</ol>
	{:else if visual.kind === 'severity'}
		<div class="np-severity">
			<div class="cells" aria-hidden="true">
				{#each visual.rows as r (r.label)}{#each Array.from({ length: Math.min(r.n, 24) }) as _, i (i)}<span class={r.tone}></span>{/each}{/each}
			</div>
			<div class="legend">{#each visual.rows as r (r.label)}{#if r.n > 0}<span><i class={r.tone}></i><b>{r.n}</b> {r.label}</span>{/if}{/each}</div>
		</div>
	{:else if visual.kind === 'members'}
		<div class="np-members">
			<div class="faces">{#each visual.people as p, i (i)}{@render face(p)}{/each}</div>
			<span class="line">{visual.label}</span>
		</div>
	{:else if visual.kind === 'speccode'}
		<!-- What the specification says beside what the code does now (criterion d18e3e74 of feat-home). -->
		{#if !feed}<span class="kick">Specification ⟷ Code</span>{/if}
		<div class="np-speccode">
			<span class="hd says">Specification says</span><span></span><span class="hd does">Code does</span>
			{#each visual.rows as r, i (i)}
				<span class="c">{r.spec}</span>
				<span class="ne" aria-label="differs from"><b>≠</b></span>
				<span class="c code" class:gone={r.gone}>
					{#if r.gone}Removed from the code{:else}<code>{r.code}</code>{/if}
					{#if r.where}<span class="where">{r.where}</span>{/if}
				</span>
			{/each}
		</div>
		{#if visual.more > 0}<span class="kick">+{visual.more} more on Mismatch</span>{/if}
	{:else if visual.kind === 'histogram'}
		<div class="np-histogram">
			<div class="row">{#if !feed}<span class="kick">{visual.label}</span>{/if}<span class="st">{visual.status}</span></div>
			<div class="bars" role="img" aria-label="{visual.days.reduce((a, b) => a + b, 0)} commits over {visual.days.length} days">
				{#each visual.days as d, i (i)}<span class:none={d === 0} style:height="{d === 0 ? 2 : Math.max(12, (100 * d) / tallest)}%"></span>{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.np {
		display: grid;
		gap: 8px;
		padding: 10px 12px;
		border: 1px dashed var(--color-line-strong);
		background: var(--color-toner-1);
		color: var(--color-ink);
		font-size: 0.75rem;
		line-height: 1.35;
	}
	.kick,
	.np-steps strong,
	.np-gauge .st,
	.np-histogram .st,
	.badge,
	.np-stamp .line,
	.np-members .line,
	.np-gauge .kept {
		font: 600 0.5625rem/1.3 var(--font-evo-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.kick {
		color: var(--color-ink-3);
	}
	.np-face {
		display: inline-flex;
		flex: none;
		align-items: center;
		justify-content: center;
		min-width: 24px;
		height: 24px;
		padding: 0 3px;
		color: var(--color-paper);
		font: 700 0.5625rem/1 var(--font-evo-mono);
	}
	.np-face.you {
		background: var(--color-ink);
	}
	.np-face.new {
		outline: 2px solid var(--color-blue);
		outline-offset: 1px;
	}
	.badge {
		flex: none;
		margin-left: auto;
		padding: 3px 6px;
		border: 1.5px solid var(--color-ink);
		background: var(--color-paper);
	}

	.np-steps {
		display: grid;
		grid-template-columns: repeat(var(--n), minmax(0, 1fr));
		gap: 6px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.np-steps li {
		display: grid;
		gap: 2px;
		min-width: 0;
		color: var(--color-ink-3);
	}
	.np-steps .bar {
		height: 5px;
		margin-bottom: 4px;
		background: var(--color-toner-2);
	}
	.np-steps .done .bar {
		background: var(--color-ink-3);
	}
	.np-steps .now {
		color: var(--color-ink);
	}
	.np-steps .now .bar {
		background: var(--color-blue);
	}

	.np-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.np-chips span {
		padding: 2px 6px;
		border: 1px solid var(--color-line-strong);
		background: var(--color-paper);
		color: var(--color-ink-2);
	}
	.np-chips span.strong {
		border-color: var(--color-ink);
		color: var(--color-ink);
		font-weight: 600;
	}
	.np-chips span.more {
		border-style: dashed;
		color: var(--color-ink-3);
	}
	.np-figures {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
		color: var(--color-ink-2);
	}
	.np-figures b {
		color: var(--color-ink);
		font-size: 1rem;
	}

	.np-gauge {
		display: grid;
		gap: 6px;
	}
	.np-gauge .row,
	.np-histogram .row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
	}
	.np-gauge .row b {
		font-size: 1rem;
	}
	.np-gauge .track {
		display: block;
		height: 8px;
		background: var(--color-toner-2);
	}
	.np-gauge .track > span {
		display: block;
		height: 100%;
		background: var(--color-ink);
	}
	.np-gauge .kept {
		color: var(--color-ink-2);
	}

	.np-stamp {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.np-stamp .word {
		padding: 4px 12px;
		border: 2px solid var(--color-ink);
		font: 800 1rem/1.2 var(--font-evo-mono);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		transform: rotate(-4deg);
	}
	.faces {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-top: 4px;
	}

	.np-people {
		display: grid;
		gap: 8px;
	}
	.np-people .row {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}
	.np-people .who,
	.np-thread .bubble {
		display: grid;
		min-width: 0;
	}
	.np-people .who span {
		overflow: hidden;
		color: var(--color-ink-3);
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.np-people q {
		padding-top: 8px;
		border-top: 1px solid var(--color-line);
		color: var(--color-ink-2);
		font-style: italic;
	}

	.np-thread {
		display: grid;
		gap: 6px;
	}
	.np-thread .msg {
		display: flex;
		align-items: flex-start;
		gap: 8px;
	}
	.np-thread .bubble {
		flex: 1;
		padding: 5px 8px;
		border: 1px solid var(--color-line-strong);
		background: var(--color-paper);
	}
	.np-thread .bubble span {
		display: -webkit-box;
		overflow: hidden;
		color: var(--color-ink-2);
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 3;
		line-clamp: 3;
	}

	.np-sheet .head {
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding-bottom: 6px;
		border-bottom: 1px solid var(--color-line);
	}
	.np-sheet .head strong {
		overflow: hidden;
		font-size: 0.8125rem;
		text-overflow: ellipsis;
		text-transform: uppercase;
		white-space: nowrap;
	}
	.np-sheet dl {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
		gap: 6px;
		margin: 6px 0 0;
	}
	.np-sheet dt {
		color: var(--color-ink-3);
		font: 600 0.5625rem/1.3 var(--font-evo-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.np-sheet dd {
		margin: 0;
		font-weight: 600;
	}
	.np-sheet p {
		margin: 6px 0 0;
		color: var(--color-ink-2);
	}

	.np-chain {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.np-chain li:not(.arrow) {
		display: grid;
		flex: 1;
		gap: 2px;
		min-width: 0;
		padding: 5px 8px;
		border: 1px solid var(--color-line-strong);
		background: var(--color-paper);
	}
	.np-chain li.struck {
		border-style: dashed;
	}
	.np-chain li.struck strong {
		text-decoration: line-through;
	}
	.np-chain li.now {
		border: 2px solid var(--color-ink);
	}
	.np-chain li.next {
		color: var(--color-ink-3);
	}
	.np-chain .arrow {
		color: var(--color-ink-3);
	}

	.np-severity .cells {
		display: flex;
		flex-wrap: wrap;
		gap: 3px;
	}
	.np-severity .cells span,
	.np-severity .legend i {
		display: inline-block;
		width: 14px;
		height: 10px;
	}
	.np-severity .block {
		background: var(--color-red);
	}
	.np-severity .major {
		background: var(--color-orange);
	}
	.np-severity .minor {
		background: var(--color-toner-2);
	}
	.np-severity .legend {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 12px;
		margin-top: 6px;
	}
	.np-severity .legend span {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}

	.np-members {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}
	.np-members .faces {
		margin: 0;
	}
	.np-members .line {
		color: var(--color-ink-2);
	}

	.np-histogram .bars {
		display: flex;
		align-items: flex-end;
		gap: 3px;
		height: 38px;
	}
	.np-histogram .bars span {
		flex: 1;
		background: var(--color-ink);
	}
	.np-histogram .bars span.none {
		background: var(--color-line-strong);
	}

	.np-speccode {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 28px minmax(0, 1fr);
		gap: 4px 0;
		padding-top: 6px;
		border-top: 1.5px solid var(--color-ink);
	}
	.np-speccode .hd {
		padding: 5px 8px;
		font: 700 0.5625rem/1.3 var(--font-evo-mono);
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.np-speccode .says {
		background: var(--color-green-tint);
	}
	.np-speccode .does {
		background: var(--color-red-tint);
	}
	.np-speccode .c {
		display: grid;
		gap: 3px;
		min-width: 0;
		padding: 6px 8px;
		background: var(--color-paper);
		overflow-wrap: anywhere;
	}
	.np-speccode .c code {
		font: 500 0.6875rem/1.4 var(--font-evo-mono);
		white-space: pre-wrap;
	}
	.np-speccode .c.gone {
		color: var(--color-ink-3);
		text-decoration: line-through;
	}
	.np-speccode .where {
		color: var(--color-ink-3);
		font: 400 0.5625rem/1.3 var(--font-evo-mono);
		text-decoration: none;
	}
	.np-speccode .ne {
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.np-speccode .ne b {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		background: var(--color-red-ink);
		color: var(--color-paper);
		font: 700 0.8125rem/1 var(--font-evo-mono);
	}

	/* Home's feed draws the picture larger, on its own paper, without its title or the rule that opened it (criterion 45137624 of feat-home). */
	.np.feed {
		gap: 14px;
		padding: 26px 30px 28px;
		border: 0;
		background: var(--color-toner-1);
		font-size: 0.84375rem;
	}
	.np.feed .kick {
		font-size: 0.625rem;
	}
	.np.feed .np-speccode {
		grid-template-columns: minmax(0, 1fr) 34px minmax(0, 1fr);
		padding-top: 0;
		border-top: 0;
	}
	.np.feed .np-speccode .hd {
		padding: 8px 14px;
		font-size: 0.625rem;
	}
	.np.feed .np-speccode .c {
		padding: 10px 14px;
		background: var(--color-paper);
	}
	.np.feed .np-speccode .c code {
		font-size: 0.75rem;
	}
	.np.feed .np-speccode .ne b {
		width: 24px;
		height: 24px;
		font-size: 1rem;
	}
	@media (max-width: 640px) {
		.np.feed {
			padding: 14px 12px 16px;
		}
		.np.feed .np-speccode {
			grid-template-columns: minmax(0, 1fr) 26px minmax(0, 1fr);
		}
		.np.feed .np-speccode .c {
			padding: 8px 9px;
		}
	}
</style>
