import type { Stamp, ValidateControl } from './BlockControls.svelte';

/**
 * What the one validation control of the app reads (criterion aba60be7): a
 * filled Validate while the reader's own validation is awaited, a quiet
 * Waiting for N while only others' are, Validated once every validation it
 * needs is there; beside it at most three people, then +N. Pure, so the words
 * and the tooltips are tested without a browser.
 */
export type ValidationState = 'validate' | 'waiting' | 'validated' | 'saving';

export interface ValidationView {
	readonly state: ValidationState;
	readonly label: string;
	/** What the state means, said in words on hover. */
	readonly title: string;
	/** The people drawn as initials (shownCount of them): the reader first, then those still awaited. */
	readonly shown: readonly Stamp[];
	/** How many more people the +N chip stands for. */
	readonly more: number;
	/** Every person the element counts, with where they stand: the tooltip of the people. */
	readonly people: string;
}

/** How many people read as initials before the rest folds into +N: eight never overflow a card. */
export const STAMPS_SHOWN = 3;

/**
 * How many people of `total` read as initials: STAMPS_SHOWN, or one more when
 * that one alone would be left, since a +1 chip takes the same room as their
 * initials (criterion 8d6c8ec0): +N always stands for two people or more.
 */
export function shownCount(total: number): number {
	return total === STAMPS_SHOWN + 1 ? total : Math.min(total, STAMPS_SHOWN);
}

/** A stamp's person: its own name when it carries one, else the head of its title ("Ana · validated"). */
export function stampName(stamp: Stamp): string {
	return stamp.name?.trim() || stamp.title.split(' · ')[0].trim() || stamp.initials;
}

/** Names said in one breath: "Ana", "Ana and Bob", "Ana, Bob and Chloe", then "Ana, Bob and 6 others". */
export function namesOf(names: readonly string[]): string {
	if (names.length <= 1) return names[0] ?? '';
	if (names.length === 2) return `${names[0]} and ${names[1]}`;
	if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
	return `${names[0]}, ${names[1]} and ${names.length - 2} others`;
}

/** Where the control stands: the page's own word when it gives one, else read from its look (an Evolution request). */
function stateOf(control: ValidateControl, awaited: number): ValidationState {
	if (control.saving) return 'saving';
	if (control.awaits === 'me') return 'validate';
	if (control.awaits === 'others') return awaited > 0 ? 'waiting' : 'validated';
	if (control.awaits === null || control.settled || control.look === 'done') return 'validated';
	if (control.look === 'mine') return awaited > 0 ? 'waiting' : 'validated';
	return 'validate';
}

export function validationView(control: ValidateControl): ValidationView {
	const awaited = control.stamps.filter((s) => !s.ok);
	const awaitedNames = awaited.map(stampName);
	const state = stateOf(control, awaitedNames.length);
	// A check that asks first is taken back on a click (EVO-007); a pill arms once pointed at a moment (withdraw-arm).
	const withdraw = control.withdraws && control.run ? (control.withdrawConfirm ? '. Click to withdraw yours' : '. Point a moment to withdraw yours') : '';
	// Validate already says the reader's own validation is awaited: the tooltip then names the others only.
	const others = awaited.filter((s) => !s.me).map(stampName);
	const label = state === 'saving' ? 'Saving…' : state === 'validate' ? 'Validate' : state === 'waiting' ? (awaitedNames.length > 0 ? `Waiting for ${awaitedNames.length}` : 'Waiting') : 'Validated';
	const title =
		state === 'saving' ? 'Saving your validation. Waiting for confirmation.' : state === 'validate'
			? `Waiting for your validation${others.length > 0 ? `, and for ${namesOf(others)}` : ''}`
			: state === 'waiting'
				? `${awaitedNames.length > 0 ? `Waiting for ${namesOf(awaitedNames)}` : 'Waiting for a validation'}${withdraw}`
				: `Validated by everyone it waits on${withdraw}`;
	return {
		state,
		label,
		// Held, the reader needs why: the button will not do anything until that is settled.
		title: control.held ?? title,
		// The reader first, never folded into +N (criterion 8d6c8ec0); then who is still awaited, what the
		// reader needs to see before +N folds the rest; then who validated.
		shown: [...control.stamps.filter((s) => s.me), ...awaited.filter((s) => !s.me), ...control.stamps.filter((s) => s.ok && !s.me)].slice(0, shownCount(control.stamps.length)),
		more: control.stamps.length - shownCount(control.stamps.length),
		people: control.stamps.map((s) => s.title).join('\n')
	};
}
