import { ArchiveError, type ArchiveCodecPort } from '$application/ports';
import type { BundleEntry } from '$domain/portability';
import { decodeZip, encodeZip, ZipError, type ZipReadLimits } from './zip.server';

/**
 * Zip adapter for `ArchiveCodecPort`. Translates the codec's own refusals into
 * the port's `ArchiveError` so callers never have to know the container format
 * to report a bad upload.
 */
export class ZipArchiveCodec implements ArchiveCodecPort {
	constructor(private readonly limits?: ZipReadLimits) {}

	encode(entries: readonly BundleEntry[]): Uint8Array {
		return encodeZip(entries.map((e) => ({ path: e.path, bytes: e.bytes })));
	}

	decode(bytes: Uint8Array): Map<string, Uint8Array> {
		try {
			return this.limits ? decodeZip(bytes, this.limits) : decodeZip(bytes);
		} catch (e) {
			if (e instanceof ZipError) throw new ArchiveError(e.message);
			throw e;
		}
	}
}
