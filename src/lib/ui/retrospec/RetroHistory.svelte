<script lang="ts">
	import { RUN_SOURCE_LABEL, RUN_STATUS_LABEL, type RunCard, type RunCardStatus } from '$domain/retrospec/run-history';
	import { H2, LABEL, META, STATUS, TAG_BLUE, TAG_ORANGE, TAG_VALID, TAG_WATCH } from '$ui/spec360/page/look';

	/**
	 * The history of the Reverse page (criterion 2dbed801, design v3): every run
	 * of the product, newest first, as a table of its date, where it read from,
	 * the commit it read and where it stands. A click on a row unfolds who
	 * started it and who validated it, then its steps, each with who and when.
	 * The runs are listed nowhere else.
	 */
	let { runs }: { runs: readonly RunCard[] } = $props();

	let unfolded = $state<Record<string, boolean>>({});
	const TIME = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
	const moment = (at: string) => (Number.isNaN(new Date(at).getTime()) ? '' : TIME.format(new Date(at)));
	const source = (run: RunCard) => `${RUN_SOURCE_LABEL[run.mode]}${run.complementary ? ' · Complementary' : run.whole ? ' · Whole re-read' : ''}`;
	const who = (run: RunCard) => [`Started by ${run.startedBy}.`, run.validatedBy ? `Validated by ${run.validatedBy}.` : ''].filter(Boolean).join(' ');
	const TAG_OF: Readonly<Record<RunCardStatus, string>> = {
		validated: TAG_VALID,
		closed: STATUS,
		running: TAG_BLUE,
		paused: TAG_ORANGE,
		ready: TAG_WATCH,
		review: TAG_WATCH,
		not_launched: STATUS
	};
	const CELL = 'border-b border-evo-line-soft px-3.5 py-3 align-middle';
</script>

{#if runs.length > 0}
	<section class="flex flex-col gap-3" aria-labelledby="reverse-history">
		<h2 id="reverse-history" class={H2}>History</h2>
		<div class="overflow-x-auto border border-evo-line bg-surface">
			<table class="w-full min-w-[560px] border-collapse text-left text-sm text-evo-ink">
				<thead>
					<tr class="{LABEL} text-evo-muted">
						<th scope="col" class="{CELL} font-semibold">Date</th>
						<th scope="col" class="{CELL} font-semibold">Source</th>
						<th scope="col" class="{CELL} font-semibold">Commit</th>
						<th scope="col" class="{CELL} font-semibold">Result</th>
					</tr>
				</thead>
				<tbody>
					{#each runs as run (run.id)}
						{@const isOpen = !!unfolded[run.id]}
						<tr class="hover:bg-evo-hover">
							<td class={CELL}>
								<button
									type="button"
									class="flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left font-semibold text-evo-ink"
									aria-expanded={isOpen}
									title={isOpen ? 'Fold this run' : 'Who started this run, and its steps'}
									onclick={() => (unfolded = { ...unfolded, [run.id]: !isOpen })}
								>
									<svg
										class="flex-none transition-transform duration-200 {isOpen ? 'rotate-90' : ''}"
										width="12"
										height="12"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2.6"
										stroke-linecap="round"
										aria-hidden="true"><path d="m9 6 6 6-6 6"></path></svg
									>
									<!-- A run nobody started from the page has no start to date: the AI rebuilt the product on its own (criterion 029a8736). -->
									<span class="font-evo-mono text-[0.8125rem]">{run.startedAt ? moment(run.startedAt) : 'Rebuilt by Lyriks'}</span>
								</button>
							</td>
							<td class={CELL}>{source(run)}</td>
							<td class="{CELL} font-evo-mono text-[0.8125rem]">{run.commit ?? ''}</td>
							<td class={CELL}><span class={TAG_OF[run.status]}>{RUN_STATUS_LABEL[run.status]}</span></td>
						</tr>
						{#if isOpen}
							<tr class="bg-evo-sunken">
								<td colspan="4" class="{CELL} animate-lk-in-fast">
									<p class="m-0">{who(run)}</p>
									{#if run.history.length}
										<ol class="m-0 mt-2 pl-5 leading-normal">
											{#each run.history as step, i (i)}
												<li class="py-[3px]">
													<span>{step.label}{step.by ? ` by ${step.by}` : ''}</span>
													<span class="ml-2 {META}">{moment(step.at)}</span>
												</li>
											{/each}
										</ol>
									{/if}
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		</div>
	</section>
{/if}
