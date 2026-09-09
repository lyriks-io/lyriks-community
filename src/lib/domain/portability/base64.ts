/**
 * Pure base64 codec for bundle payloads.
 *
 * Hand-rolled rather than `Buffer` (Node-only, and the domain must stay
 * runtime-agnostic) or `atob`/`btoa` (latin1 string round-trips silently
 * corrupt bytes ≥ 0x80). Canonical output — padded, no line breaks — which is
 * what makes `isCanonicalBase64` a reliable "can this be externalized and
 * restored byte-for-byte?" test.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Reverse lookup, -1 for any byte that is not a base64 digit. */
const LOOKUP = (() => {
	const table = new Int8Array(128).fill(-1);
	for (let i = 0; i < ALPHABET.length; i += 1) table[ALPHABET.charCodeAt(i)] = i;
	return table;
})();

export function bytesToBase64(bytes: Uint8Array): string {
	let out = '';
	for (let i = 0; i < bytes.length; i += 3) {
		const b0 = bytes[i];
		const b1 = bytes[i + 1];
		const b2 = bytes[i + 2];
		out += ALPHABET[b0 >> 2];
		out += ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
		out += b1 === undefined ? '=' : ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
		out += b2 === undefined ? '=' : ALPHABET[b2 & 0x3f];
	}
	return out;
}

/** Decode canonical base64. Returns null for anything malformed. */
export function base64ToBytes(text: string): Uint8Array | null {
	if (text.length % 4 !== 0) return null;
	const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
	const out = new Uint8Array((text.length / 4) * 3 - padding);
	let o = 0;
	for (let i = 0; i < text.length; i += 4) {
		const digits = [0, 1, 2, 3].map((k) => {
			const code = text.charCodeAt(i + k);
			if (code > 127) return -1;
			const value = LOOKUP[code];
			// '=' is legal only in the last group's tail, which the length maths above
			// already accounted for; treat it as zero bits here.
			return value === -1 && text[i + k] === '=' && i + 4 === text.length ? 0 : value;
		});
		if (digits.some((d) => d === -1)) return null;
		const chunk = (digits[0] << 18) | (digits[1] << 12) | (digits[2] << 6) | digits[3];
		if (o < out.length) out[o++] = (chunk >> 16) & 0xff;
		if (o < out.length) out[o++] = (chunk >> 8) & 0xff;
		if (o < out.length) out[o++] = chunk & 0xff;
	}
	return out;
}

/**
 * True when `text` decodes AND re-encodes to itself. Only such payloads may be
 * externalized into a bundle file: re-inlining on import must reproduce the
 * source document byte-for-byte, and a non-canonical encoding (stray whitespace,
 * missing padding) would not survive the trip.
 */
export function isCanonicalBase64(text: string): boolean {
	const bytes = base64ToBytes(text);
	return bytes !== null && bytesToBase64(bytes) === text;
}
