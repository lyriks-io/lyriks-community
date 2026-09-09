import { describe, expect, it } from 'vitest';
import {
	INSTALL_ID_LENGTH,
	REGISTRATION_ALPHABET,
	formatRegistrationCode,
	installIdFromBytes
} from './registration';

describe('installIdFromBytes', () => {
	it('produces one alphabet character per byte', () => {
		const id = installIdFromBytes(new Uint8Array(INSTALL_ID_LENGTH).fill(7));
		expect(id).toHaveLength(INSTALL_ID_LENGTH);
		for (const char of id) expect(REGISTRATION_ALPHABET).toContain(char);
	});

	it('maps every byte value into the alphabet without bias', () => {
		// 256 byte values over 32 characters: each character must come up exactly
		// eight times, or the id is not uniform over the alphabet.
		const all = installIdFromBytes(new Uint8Array(256).map((_, i) => i));
		for (const char of REGISTRATION_ALPHABET) {
			expect(all.split(char).length - 1).toBe(8);
		}
	});

	it('never emits the characters that survive being retyped badly', () => {
		const all = installIdFromBytes(new Uint8Array(256).map((_, i) => i));
		for (const ambiguous of ['I', 'L', 'O', 'U']) expect(all).not.toContain(ambiguous);
	});
});

describe('formatRegistrationCode', () => {
	it('prefixes and groups the id in fours', () => {
		expect(formatRegistrationCode('ABCDEFGHJKMNPQRS')).toBe('LYR-ABCD-EFGH-JKMN-PQRS');
	});

	it('keeps a trailing partial group rather than padding it', () => {
		expect(formatRegistrationCode('ABCDE')).toBe('LYR-ABCD-E');
	});
});
