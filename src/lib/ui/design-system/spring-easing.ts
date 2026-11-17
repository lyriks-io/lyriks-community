/** A damped spring: how fast it swings (radians a second) and how soon it calms (damping ratio, at most 1; 1 never overshoots). */
export interface Spring {
	omega: number;
	zeta: number;
}

// A spring has settled once it stays within a thousandth of its move from the end.
const SETTLED = 0.001;
// Once a frame, enough for `linear()` to read as the curve itself.
const SAMPLES_PER_S = 60;
// Where `linear()` is not understood: a fast-out curve, no overshoot.
const FALLBACK = { easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', duration: 320 };

/**
 * The path of a spring let go from 0 toward 1, sampled once a frame from its
 * start until it settles (values past 1 where it overshoots), and how long
 * that takes in milliseconds.
 */
export function springCurve({ omega, zeta }: Spring): { points: number[]; duration: number } {
	const damped = zeta < 1;
	const swing = omega * Math.sqrt(Math.max(0, 1 - zeta * zeta));
	const at = (t: number) => {
		const decay = Math.exp(-zeta * omega * t);
		return damped ? 1 - decay * (Math.cos(swing * t) + ((zeta * omega) / swing) * Math.sin(swing * t)) : 1 - decay * (1 + omega * t);
	};
	// The farthest the spring can still be from its end at t.
	const reach = (t: number) => (damped ? Math.exp(-zeta * omega * t) / Math.sqrt(1 - zeta * zeta) : Math.exp(-omega * t) * (1 + omega * t));
	let settle = 0;
	while (reach(settle) > SETTLED && settle < 3) settle += 1 / 240;
	const steps = Math.max(12, Math.round(settle * SAMPLES_PER_S));
	const points = Array.from({ length: steps + 1 }, (_, i) => (i === steps ? 1 : Number(at((settle * i) / steps).toFixed(4))));
	return { points, duration: Math.round(settle * 1000) };
}

/**
 * A spring as an easing for Element.animate or a CSS transition: its path as
 * `linear()` and the duration it needs, or a plain fast-out curve where the
 * browser has no `linear()`.
 */
export function springEasing(spring: Spring): { easing: string; duration: number } {
	if (typeof CSS === 'undefined' || !CSS.supports('transition-timing-function', 'linear(0, 1)')) return FALLBACK;
	const { points, duration } = springCurve(spring);
	return { easing: `linear(${points.join(', ')})`, duration };
}
