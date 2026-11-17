import { describe, expect, it } from 'vitest';
import { isProposedId } from '$application/spec360/edits';
import { mintUuid } from './mint-id';

describe('an id minted by the page', () => {
	it('is a UUID the server takes, with or without randomUUID', () => {
		expect(isProposedId(mintUuid())).toBe(true);
		const native = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(crypto), 'randomUUID');
		Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
		try {
			const id = mintUuid();
			expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
			expect(isProposedId(id)).toBe(true);
			expect(mintUuid()).not.toBe(id);
		} finally {
			delete (crypto as { randomUUID?: unknown }).randomUUID;
			if (native && typeof crypto.randomUUID !== 'function') Object.defineProperty(crypto, 'randomUUID', native);
		}
		expect(typeof crypto.randomUUID).toBe('function');
	});
});
