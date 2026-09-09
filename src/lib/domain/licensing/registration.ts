/**
 * Install registration: the voluntary link between one appliance and the account
 * its key was issued to.
 *
 * Community keys are minted per account on lyriks.io, so the seller always knows
 * who *asked* for one. It cannot know which of those installs actually run,
 * because the appliance never calls home: zero runtime egress is an audited
 * property of the product, not a setting. So the appliance mints a stable local
 * identity instead and shows it as a short code; an operator who wants to be
 * counted copies it into their account on the website. The product transmits
 * nothing either way, and the code carries nothing about the deployment: it is a
 * random identifier, not a fingerprint of the machine.
 *
 * This module is pure. It owns the alphabet, the length and the display format;
 * randomness comes from the adapter that mints the id (see the activation
 * repository), and the code is derived from that id alone.
 */

/**
 * Crockford base32 without I, L, O and U: every remaining character survives being
 * read aloud, handwritten or retyped without collapsing into another one, which is
 * the whole job of a code a human moves between two screens.
 */
export const REGISTRATION_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Characters in an install id: 16 × 5 bits = 80 bits, far past any collision risk. */
export const INSTALL_ID_LENGTH = 16;

/** Marks the code as ours wherever it is pasted (a support ticket, a web form). */
export const REGISTRATION_CODE_PREFIX = 'LYR';

const GROUP_SIZE = 4;

/**
 * Map random bytes onto the alphabet, one character per byte. 256 is an exact
 * multiple of 32, so the modulo is unbiased. Callers supply {@link INSTALL_ID_LENGTH}
 * bytes; anything shorter simply yields a shorter id, which the store then keeps.
 */
export function installIdFromBytes(bytes: Uint8Array): string {
	let id = '';
	for (const byte of bytes) id += REGISTRATION_ALPHABET[byte % REGISTRATION_ALPHABET.length];
	return id;
}

/**
 * Group an install id into the code an operator reads off the activation screen:
 * `LYR-ABCD-EFGH-JKLM-NPQR`. Grouping is display only, so the parser on the
 * website side must ignore separators and case rather than depend on this shape.
 */
export function formatRegistrationCode(installId: string): string {
	const groups: string[] = [];
	for (let i = 0; i < installId.length; i += GROUP_SIZE) {
		groups.push(installId.slice(i, i + GROUP_SIZE));
	}
	return [REGISTRATION_CODE_PREFIX, ...groups].join('-');
}
