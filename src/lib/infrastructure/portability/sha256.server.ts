import { createHash } from 'node:crypto';

/**
 * Content addressing for bundle files. Lives here rather than in the domain
 * because `node:crypto` is a runtime, and the domain has to stay loadable in the
 * browser bundle; the pure code takes the hash as a parameter (`HashFn`).
 *
 * Truncated to 128 bits: these are entry names for deduplication inside a single
 * archive, not a security boundary, and a 32-character path stays readable when
 * a human browses the zip.
 */
export function sha256Hex(bytes: Uint8Array): string {
	return createHash('sha256').update(bytes).digest('hex').slice(0, 32);
}
