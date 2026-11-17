<script lang="ts">
	/**
	 * The count a card or a line of the Specification 360° ends on, naming what
	 * it counts ('5 features', '22 actions', one in the singular). No bar beside
	 * it: a list counts with a number, never a bar (criterion 41a9c9d6). The
	 * design draws one in the cards of What it does and the lines of Who uses
	 * it; should the owner bring it back, it goes here, in the room the count
	 * leaves at its left, with the app's Gauge (criterion b663dee4), and every
	 * such list gets it at once.
	 */
	interface Props {
		value: number;
		/** What is counted, in the singular. */
		unit: string;
		/** Its plural when it is not the singular and an s. */
		units?: string;
		/** Layout only: width, flex. */
		class?: string;
	}
	let { value, unit, units = `${unit}s`, class: klass = '' }: Props = $props();
</script>

<span class="flex min-w-0 items-center gap-2.5 {klass}">
	<span class="min-w-0 flex-1" aria-hidden="true"></span>
	<span class="font-evo-mono text-[0.6875rem] whitespace-nowrap text-ink-3"><b class="font-semibold text-ink-2 tabular-nums">{value}</b>&nbsp;{value === 1 ? unit : units}</span>
</span>
