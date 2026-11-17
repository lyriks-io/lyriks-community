import type { ItemView } from './review.svelte';

/**
 * How a reviewed item reads in the design: its card's border, the chip a
 * flagged item wears, the struck title of a rejected one. Kept in one place so
 * every tab draws an item the same way.
 */

/** The card's border: green once validated, amber set aside, violet shared. */
export function itemBorder(view: ItemView): string {
	if (view.state === 'validated') return 'border-evo-green-line';
	if (view.state === 'later') return 'border-evo-orange-line';
	if (view.state === 'shared') return 'border-evo-violet-edge';
	return 'border-evo-line';
}

/** The chip a set-aside or shared item wears beside its title; null when none. */
export function flagChip(view: ItemView): { text: string; look: string } | null {
	if (view.flag?.kind === 'later') return { text: '⚑ To review', look: 'bg-evo-orange-soft text-evo-orange' };
	if (view.flag?.kind === 'shared') return { text: `↗ Shared · ${view.flag.to.name}`, look: 'bg-evo-violet-soft text-evo-violet-ink' };
	return null;
}

export const REJECTED_CHIP = ' bg-evo-chip px-[9px] py-[3px] text-[0.6875rem] font-bold tracking-[0.04em] text-evo-faint';
export const struck = (view: ItemView) => (view.state === 'rejected' ? 'text-evo-faint line-through' : '');

/** The card of a section of the review: white, a 14px radius. */
export const CARD = 'flex flex-col rounded-evo-card border bg-white transition-[border-color] duration-300';

/** The local time of an instant on a 24-hour clock, "14:05", the way the activity log reads. */
export function clockOf(iso: string): string {
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "Oct 14, 2026". */
export function dayOf(iso: string): string {
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
