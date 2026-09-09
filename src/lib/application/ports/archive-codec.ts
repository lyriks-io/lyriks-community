import type { BundleEntry } from '$domain/portability';

/** A refusal to read an archive, with a message safe to show the user. */
export class ArchiveError extends Error {}

/**
 * Outbound port for the container a bundle travels in (a zip today).
 *
 * Kept behind a port so the use-cases stay free of the format: they assemble and
 * read *entries*, and what wraps them is a composition-root decision.
 */
export interface ArchiveCodecPort {
	encode(entries: readonly BundleEntry[]): Uint8Array;
	/** Path → bytes. Throws `ArchiveError` on anything malformed or oversized. */
	decode(bytes: Uint8Array): Map<string, Uint8Array>;
}
