<script lang="ts">
	import { Icon } from '$ui/design-system';

	/**
	 * Who stands behind the value shown, and the act of joining or leaving them.
	 *
	 * Quiet by default: the names show when there are any, and the act shows on
	 * hover or focus of the field. A signed value reads as settled, never as
	 * disabled: the field above stays live, and an edit visibly voids every
	 * name here. Signing a human-typed value asks for no source; the citations
	 * belong to the value.
	 */
	interface Props {
		/** The signatures standing on the value shown, oldest first. */
		signatures: readonly { signerId: string; signedAt: string }[];
		signedByMe: boolean;
		/** Whether the reader may sign right now; the reason otherwise. */
		canSign: { ok: true } | { ok: false; reason: string };
		onSign: () => void;
		onWithdraw: () => void;
	}
	let { signatures, signedByMe, canSign, onSign, onWithdraw }: Props = $props();
</script>

{#if signatures.length > 0 || canSign.ok || signedByMe}
	<div class="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
		{#if signatures.length > 0}
			<span class="inline-flex items-center gap-1 text-success-700" title="Standing behind this exact value">
				<Icon name="check" size={9} />
				{signatures.map((s) => s.signerId).join(', ')}
			</span>
		{/if}
		<span class="opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
			{#if signedByMe}
				<button
					type="button"
					onclick={onWithdraw}
					class="text-ink-400 hover:text-danger-600 hover:underline"
					title="Take back your own signature. The others stay."
				>
					withdraw mine
				</button>
			{:else if canSign.ok}
				<button
					type="button"
					onclick={onSign}
					class="text-ink-400 hover:text-success-700 hover:underline"
					title={signatures.length > 0
						? 'Stand behind this value too'
						: 'Say, by name and date, that you stand behind this value'}
				>
					{signatures.length > 0 ? 'sign too' : 'sign'}
				</button>
			{/if}
		</span>
	</div>
{/if}
