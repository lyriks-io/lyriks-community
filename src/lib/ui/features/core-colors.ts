import { CORE_TONES, isCoreTone, type CoreTone } from '$domain/features';

const VISIBLE_TONES = CORE_TONES.map((tone) => tone.code).filter(
	(tone): tone is Exclude<CoreTone, 'custom'> => tone !== 'custom'
);

export interface CoreToneStyle {
	card: string;
	icon: string;
	text: string;
	soft: string;
	feature: string;
	selected: string;
	ring: string;
}

/* Five palette slots + the neutral fallback. Tones are color identities: the
 * legacy billing vocabulary and the domain-neutral one share the same slots. */
const infoStyle: CoreToneStyle = {
	card: 'border-info-300 bg-info-50/80 shadow-[0_14px_30px_rgba(14,165,233,0.16)]',
	icon: 'bg-info-500 text-white',
	text: 'text-info-600',
	soft: 'bg-info-100 text-info-600',
	feature: 'border-info-200 bg-info-50/75',
	selected: 'border-info-400 bg-info-50 ring-2 ring-info-200',
	ring: 'ring-info-300'
};
const brandStyle: CoreToneStyle = {
	card: 'border-brand-300 bg-brand-50/80 shadow-[0_14px_30px_rgba(124,58,237,0.16)]',
	icon: 'bg-brand-500 text-white',
	text: 'text-brand-700',
	soft: 'bg-brand-100 text-brand-700',
	feature: 'border-brand-200 bg-brand-50/75',
	selected: 'border-brand-400 bg-brand-50 ring-2 ring-brand-200',
	ring: 'ring-brand-300'
};
const dangerStyle: CoreToneStyle = {
	card: 'border-danger-300 bg-danger-50/80 shadow-[0_14px_30px_rgba(239,68,68,0.15)]',
	icon: 'bg-danger-500 text-white',
	text: 'text-danger-700',
	soft: 'bg-danger-100 text-danger-700',
	feature: 'border-danger-200 bg-danger-50/75',
	selected: 'border-danger-400 bg-danger-50 ring-2 ring-danger-200',
	ring: 'ring-danger-300'
};
const warningStyle: CoreToneStyle = {
	card: 'border-warning-300 bg-warning-50/85 shadow-[0_14px_30px_rgba(245,158,11,0.18)]',
	icon: 'bg-warning-500 text-white',
	text: 'text-warning-700',
	soft: 'bg-warning-100 text-warning-700',
	feature: 'border-warning-200 bg-warning-50/80',
	selected: 'border-warning-400 bg-warning-50 ring-2 ring-warning-200',
	ring: 'ring-warning-300'
};
const successStyle: CoreToneStyle = {
	card: 'border-success-300 bg-success-50/80 shadow-[0_14px_30px_rgba(34,197,94,0.16)]',
	icon: 'bg-success-500 text-white',
	text: 'text-success-700',
	soft: 'bg-success-100 text-success-700',
	feature: 'border-success-200 bg-success-50/75',
	selected: 'border-success-400 bg-success-50 ring-2 ring-success-200',
	ring: 'ring-success-300'
};

export const CORE_TONE_STYLE: Record<CoreTone, CoreToneStyle> = {
	customer: infoStyle,
	engagement: infoStyle,
	invoicing: brandStyle,
	content: brandStyle,
	payment: dangerStyle,
	commerce: dangerStyle,
	dunning: warningStyle,
	operations: warningStyle,
	reporting: successStyle,
	insight: successStyle,
	custom: {
		card: 'border-ink-200 bg-surface-sunken shadow-[0_14px_30px_rgba(15,23,42,0.1)]',
		icon: 'bg-ink-700 text-white',
		text: 'text-ink-700',
		soft: 'bg-surface-sunken text-ink-700',
		feature: 'border-line bg-surface',
		selected: 'border-ink-300 bg-surface-sunken ring-2 ring-ink-200',
		ring: 'ring-ink-300'
	}
};

export function coreToneForDisplay(tone: unknown, index = 0): CoreTone {
	if (isCoreTone(tone) && tone !== 'custom') return tone;
	return VISIBLE_TONES[index % VISIBLE_TONES.length];
}

export function coreToneStyle(tone: unknown, index = 0): CoreToneStyle {
	return CORE_TONE_STYLE[coreToneForDisplay(tone, index)];
}
