<script lang="ts">
	import { untrack } from 'svelte';
	import { counterWheels, type Wheel } from './counter-wheels';
	import { prefersReducedMotion } from './reduced-motion';
	import { springEasing, type Spring } from './spring-easing';

	/**
	 * A number that counts like a game score: the digit that changes rolls in on its wheel, from below as the count
	 * grows and from above as it shrinks, the number pops, and what it gained rises above it and fades (+1). Under
	 * reduced motion the number changes in place and nothing moves. `from` is where it counts from when it first
	 * shows: the bar of picked points counts its first point in from 0 (criterion 3f977777). `reserve` is the room
	 * it keeps, in digits, whatever it reads: the number is then drawn over that room, centred, so what stands
	 * around it never moves as it turns from 1 to 2 (it only widens past that many digits).
	 */
	interface Props {
		value: number;
		from?: number;
		reserve?: number;
		class?: string;
	}
	let { value, from, reserve = 0, class: cls = '' }: Props = $props();

	// The wheel lands with a small overshoot; the number swells fast, then springs back with a rebound.
	const ROLL: Spring = { omega: 26, zeta: 0.62 };
	const SWELL = 1.28;
	const SWELL_MS = 70;
	const SWELL_BACK: Spring = { omega: 30, zeta: 0.42 };
	// The +1 leaves from the top of the digits and fades a few pixels higher: close to them, inside the frame around them.
	const GAIN_MS = 750;
	const GAIN_FROM_PX = 4;
	const GAIN_PX = 4;

	interface Beat {
		id: number;
		gain: number;
	}
	let shown = untrack(() => value);
	let wheels = $state.raw<Wheel[]>(untrack(() => counterWheels(from ?? value, value, prefersReducedMotion())));
	let beat = $state.raw<Beat>(untrack(() => ({ id: 0, gain: value - (from ?? value) })));

	$effect.pre(() => {
		const next = value;
		untrack(() => {
			if (next === shown) return;
			wheels = counterWheels(shown, next, prefersReducedMotion());
			beat = { id: beat.id + 1, gain: next - shown };
			shown = next;
		});
	});

	/** Once its wheels have landed, a turn keeps only the digits it shows: the ones it turned from leave the page. */
	const settle = (id: number) => {
		if (beat.id === id) wheels = wheels.map((w) => (w.was === null ? w : { ...w, was: null }));
	};
	const moves = (node: HTMLElement) => typeof node.animate === 'function' && !prefersReducedMotion();

	const roll = (wheel: Wheel, id: number) => (node: HTMLElement) => {
		if (wheel.was === null) return;
		if (!moves(node)) return settle(id);
		const { easing, duration } = springEasing(ROLL);
		const [start, end] = wheel.up ? ['translateY(0)', 'translateY(-50%)'] : ['translateY(-50%)', 'translateY(0)'];
		const run = node.animate([{ transform: start }, { transform: end }], { duration, easing });
		run.finished.then(
			() => settle(id),
			() => {}
		);
		return () => run.cancel();
	};

	const swell = (b: Beat) => (node: HTMLElement) => {
		if (b.gain === 0 || !moves(node)) return;
		const back = springEasing(SWELL_BACK);
		const total = SWELL_MS + back.duration;
		const run = node.animate(
			[
				{ scale: '1', easing: 'cubic-bezier(0.3, 0, 0.2, 1)' },
				{ scale: `${SWELL}`, offset: SWELL_MS / total, easing: back.easing },
				{ scale: '1' }
			],
			{ duration: total }
		);
		return () => run.cancel();
	};

	/** The last beat whose gain has risen and faded: its +N leaves the page, so the count reads as its number alone. */
	let risen = $state(-1);
	const rise = (id: number) => (node: HTMLElement) => {
		if (!moves(node)) {
			risen = id;
			return;
		}
		const run = node.animate(
			[
				{ opacity: 0, transform: `translateY(${GAIN_FROM_PX}px)` },
				{ opacity: 1, transform: 'translateY(0)', offset: 0.2 },
				{ opacity: 0, transform: `translateY(-${GAIN_PX}px)` }
			],
			{ duration: GAIN_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
		);
		run.finished.then(
			() => (risen = id),
			() => {}
		);
		return () => run.cancel();
	};
</script>

<span
	class="relative inline-flex tabular-nums {cls}"
	style:width={reserve > 0 ? `${Math.max(reserve, wheels.length)}ch` : null}
	style:height={reserve > 0 ? '1.2em' : null}
>
	<span class={reserve > 0 ? 'absolute inset-y-0 left-1/2 inline-flex -translate-x-1/2' : 'relative inline-flex'} {@attach swell(beat)}>
		{#each wheels as wheel (wheel.place)}
			<span class="inline-block h-[1.2em] overflow-hidden leading-[1.2]">
				<span class="flex flex-col" style:transform={wheel.was !== null && wheel.up ? 'translateY(-50%)' : null} {@attach roll(wheel, beat.id)}>
					{#if wheel.was !== null && wheel.up}<span class="block h-[1.2em]" aria-hidden="true">{wheel.was}</span>{/if}
					<span class="block h-[1.2em]">{wheel.now}</span>
					{#if wheel.was !== null && !wheel.up}<span class="block h-[1.2em]" aria-hidden="true">{wheel.was}</span>{/if}
				</span>
			</span>
		{/each}
		{#if beat.gain > 0 && risen !== beat.id}
			{#key beat.id}
				<!-- Its foot sits on the top of the digits, a little over a quarter of the line down: the line keeps some air above them. -->
				<span
					class="pointer-events-none absolute bottom-[72%] left-1/2 -translate-x-1/2 font-evo-mono text-[0.6875rem] leading-none font-bold text-blue-ink opacity-0"
					aria-hidden="true"
					{@attach rise(beat.id)}>+{beat.gain}</span
				>
			{/key}
		{/if}
	</span>
</span>
