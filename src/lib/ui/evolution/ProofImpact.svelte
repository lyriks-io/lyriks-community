<script lang="ts">
	import { proofImpactHeadline, proofImpactLines, proofImpactScope, type DraftProofImpact } from '$lib/domain/evolution/proof-impact';
	import { getSpecLanguage } from '$ui/language/spec-language-context';

	/**
	 * What each draft does to the solver's proofs of its feature: one line per
	 * draft (nothing changes, or what breaks first), then what breaks, what is
	 * repaired and the scenarios that move. Computed with the impact, never judged.
	 */
	interface Props {
		impacts: readonly DraftProofImpact[];
	}

	let { impacts }: Props = $props();
	// Written in the language of the spec, like every text Lyriks generates.
	const lang = getSpecLanguage();
</script>

<!-- What the change does to the proofs: the solver's before and after, per draft. -->
{#if impacts.length > 0}
	<section class="rounded-card border border-line bg-surface">
		<header class="border-b border-line px-4 py-3">
			<p class="text-sm font-bold text-ink-900">What the change does to the proofs</p>
			<p class="text-[0.6875rem] text-ink-500">
				What each changed feature would stop guaranteeing, or start guaranteeing, checked
				automatically for every possible value. Nothing is changed until the request is accepted.
			</p>
		</header>
		<ul class="divide-y divide-line">
			{#each impacts as impact (impact.draftId)}
				{@const lines = proofImpactLines(impact, lang())}
				{@const scope = proofImpactScope(impact, lang())}
				<li class="px-4 py-3">
					<p class="text-[0.75rem] font-bold text-ink-800">{impact.draftName}</p>
					<p
						class="mt-0.5 text-[0.75rem] {lines.some((l) => l.tone === 'worse')
							? 'text-danger-600'
							: impact.unavailable || !impact.proven.before || !impact.proven.after
								? 'text-warning-600'
								: 'text-ink-600'}"
					>
						{proofImpactHeadline(impact, lang())}
					</p>
					{#if scope}<p class="mt-0.5 text-[0.6875rem] text-ink-500">{scope}</p>{/if}
					{#if lines.length > 0}
						<ul class="mt-2 space-y-1.5 text-[0.6875rem] leading-snug">
							{#each lines as line, i (i)}
								<li class={line.tone === 'worse' ? 'text-danger-600' : line.tone === 'better' ? 'text-success-600' : 'text-warning-600'}>
									<p>{line.text}</p>
									{#if line.example}
										<p class="mt-0.5 text-ink-500">Nothing has happened yet.</p>
										<ol class="ml-4 list-decimal text-ink-600">
											{#each line.example as step, j (j)}
												<li>{step}</li>
											{/each}
										</ol>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
{/if}
