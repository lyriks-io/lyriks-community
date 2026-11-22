import { anchorDomId, placeOfAnchor } from '$domain/discussions';
import type { TouchedChoice, TouchedLine, TouchedReading, WaitedPerson } from '$domain/evolution';

/**
 * What the block Not validated in Knowledge of the Simulation offers and says
 * (EVO-003). The server applies every rule; this reads the reading the way the
 * page shows it, so a person is never offered what would be refused.
 */

/** What the reader may do on the block: write the request, while its version is not frozen. */
export interface TouchedAbility {
	/** The reader may write the request: Validate at the landing and its taking back. */
	readonly canChoose: boolean;
	/** The version is frozen: every choice reads only until a rebrief reopens it. */
	readonly frozen: boolean;
}

/** The choices a line offers. */
export interface LineOffers {
	/** Validate now: only to whom the element waits on (criterion 5ca7229b). */
	readonly validateNow: boolean;
	/** Validate at the landing: to anyone who may write the request (criterion 3baeaf02). */
	readonly atLanding: boolean;
	/** Take back the choice at the landing, until the freeze. */
	readonly takeBack: boolean;
}

const NOTHING: LineOffers = { validateNow: false, atLanding: false, takeBack: false };

/** The choices one line offers, as it reads now. */
export function lineOffers(line: Pick<TouchedLine, 'waitsOnMe'> & { readonly choice: TouchedChoice }, ability: TouchedAbility): LineOffers {
	if (ability.frozen || line.choice === 'validated_now') return NOTHING;
	if (line.choice === 'at_landing') return { validateNow: line.waitsOnMe, atLanding: false, takeBack: ability.canChoose };
	return { validateNow: line.waitsOnMe, atLanding: ability.canChoose, takeBack: false };
}

/** The lines Choose for all applies a choice to: every line still open. */
export const openLines = <L extends { readonly choice: TouchedChoice }>(lines: readonly L[]): L[] => lines.filter((l) => l.choice === 'none');

/** What Choose for all offers (criterion 5d001101): at the landing to whoever may choose, Validate now only when every open line waits on the reader. */
export function chooseForAllOffers(lines: readonly (Pick<TouchedLine, 'waitsOnMe'> & { readonly choice: TouchedChoice })[], ability: TouchedAbility): { readonly atLanding: boolean; readonly validateNow: boolean } {
	const open = openLines(lines);
	if (ability.frozen || open.length === 0) return { atLanding: false, validateNow: false };
	return { atLanding: ability.canChoose, validateNow: open.every((l) => l.waitsOnMe) };
}

const counted = (n: number) => `${n} element${n === 1 ? '' : 's'}`;

/** The band above the impact: how many elements the change touches are not validated in Knowledge. */
export function touchedBand(reading: Pick<TouchedReading, 'readable' | 'specValidated'> & { readonly lines: readonly unknown[] }): string {
	if (!reading.readable) return 'Knowledge could not be read: the project team is unavailable. The rest of the Simulation reads as usual.';
	if (reading.specValidated || reading.lines.length === 0) return 'Everything this change touches is validated.';
	const n = reading.lines.length;
	return `${counted(n)} this change touches ${n === 1 ? 'is' : 'are'} not validated in Knowledge.`;
}

/** Whom an element waits on, by the names the team reads. */
export function waitsOnText(waitsOn: readonly WaitedPerson[]): string {
	if (waitsOn.length === 0) return 'Waits on anyone who may write the project';
	return `Waits on ${waitsOn.map((p) => p.name || p.id).join(', ')}`;
}

/** What a line's choice reads. */
export function choiceLabel(line: { readonly choice: TouchedChoice; readonly chosen?: { readonly atFreeze?: boolean } }): string | null {
	if (line.choice === 'validated_now') return 'Validated';
	if (line.choice === 'at_landing') return line.chosen?.atFreeze ? 'Validated at the landing (set by the freeze)' : 'Validated at the landing';
	return null;
}

/** Where its name opens the element: on the Specification 360°, at its block. */
export function elementHref(projectId: string, elementId: string): string {
	const place = placeOfAnchor(elementId);
	return `/projects/${encodeURIComponent(projectId)}/spec${place ? `/${place}` : ''}#${anchorDomId(elementId)}`;
}
