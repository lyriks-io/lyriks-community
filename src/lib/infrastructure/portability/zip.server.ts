/**
 * Minimal ZIP reader/writer for project bundles.
 *
 * Hand-rolled over `node:zlib` rather than a package: the appliance ships
 * air-gapped and every runtime dependency is an audited supply-chain item, and
 * what a bundle needs is a small, well-understood subset — store/deflate, no
 * encryption, no zip64, no streaming-descriptor entries. Output is deterministic
 * (fixed DOS timestamp, entries in the order given), so two exports of an
 * unchanged project are byte-identical.
 *
 * Reading is defensive: bundles arrive from other installs and from users.
 * Entry paths are validated against traversal, and totals are capped so a
 * malicious archive cannot exhaust memory before anything looks at its contents.
 */

import { deflateRawSync, inflateRawSync } from 'node:zlib';

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;
const ZIP64_EOCD_LOCATOR_SIGNATURE = 0x07064b50;

const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

/**
 * Fixed timestamp for every entry: 1980-01-01, the DOS epoch and the lowest
 * value the format can express. Real mtimes would make two identical exports
 * differ, which defeats diffing and backup deduplication.
 */
const DOS_DATE = 0x0021; // 1980-01-01
const DOS_TIME = 0x0000; // 00:00:00

export interface ZipEntry {
	readonly path: string;
	readonly bytes: Uint8Array;
}

export interface ZipReadLimits {
	/** Reject an archive declaring more entries than this. */
	readonly maxEntries: number;
	/** Reject once the decompressed total passes this. */
	readonly maxTotalBytes: number;
}

export const DEFAULT_ZIP_LIMITS: ZipReadLimits = {
	maxEntries: 20_000,
	maxTotalBytes: 512 * 1024 * 1024
};

/** Refusal to read an archive. Carries a message safe to show a user. */
export class ZipError extends Error {}

export function encodeZip(entries: readonly ZipEntry[]): Uint8Array {
	const locals: Buffer[] = [];
	const centrals: Buffer[] = [];
	let offset = 0;

	for (const entry of entries) {
		const name = Buffer.from(entry.path, 'utf8');
		const raw = Buffer.from(entry.bytes);
		const deflated = deflateRawSync(raw, { level: 9 });
		// Store when compression does not pay (already-compressed images, tiny files):
		// a larger "compressed" payload is pure waste and makes the entry unreadable
		// to nothing — both methods are universally supported.
		const useDeflate = deflated.length < raw.length;
		const payload = useDeflate ? deflated : raw;
		const method = useDeflate ? METHOD_DEFLATE : METHOD_STORE;
		const crc = crc32(raw);

		const local = Buffer.alloc(30);
		local.writeUInt32LE(LOCAL_HEADER_SIGNATURE, 0);
		local.writeUInt16LE(20, 4); // version needed
		local.writeUInt16LE(0x0800, 6); // flags: UTF-8 filename
		local.writeUInt16LE(method, 8);
		local.writeUInt16LE(DOS_TIME, 10);
		local.writeUInt16LE(DOS_DATE, 12);
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(payload.length, 18);
		local.writeUInt32LE(raw.length, 22);
		local.writeUInt16LE(name.length, 26);
		local.writeUInt16LE(0, 28); // extra field length
		locals.push(local, name, payload);

		const central = Buffer.alloc(46);
		central.writeUInt32LE(CENTRAL_HEADER_SIGNATURE, 0);
		central.writeUInt16LE(20, 4); // version made by
		central.writeUInt16LE(20, 6); // version needed
		central.writeUInt16LE(0x0800, 8);
		central.writeUInt16LE(method, 10);
		central.writeUInt16LE(DOS_TIME, 12);
		central.writeUInt16LE(DOS_DATE, 14);
		central.writeUInt32LE(crc, 16);
		central.writeUInt32LE(payload.length, 20);
		central.writeUInt32LE(raw.length, 24);
		central.writeUInt16LE(name.length, 28);
		central.writeUInt16LE(0, 30); // extra
		central.writeUInt16LE(0, 32); // comment
		central.writeUInt16LE(0, 34); // disk number
		central.writeUInt16LE(0, 36); // internal attrs
		central.writeUInt32LE(0, 38); // external attrs
		central.writeUInt32LE(offset, 42);
		centrals.push(central, name);

		offset += local.length + name.length + payload.length;
		if (offset > 0xffffffff) throw new ZipError('bundle exceeds the 4 GB zip limit');
	}

	const centralBytes = Buffer.concat(centrals);
	const eocd = Buffer.alloc(22);
	eocd.writeUInt32LE(EOCD_SIGNATURE, 0);
	eocd.writeUInt16LE(0, 4); // this disk
	eocd.writeUInt16LE(0, 6); // disk with central directory
	eocd.writeUInt16LE(entries.length, 8);
	eocd.writeUInt16LE(entries.length, 10);
	eocd.writeUInt32LE(centralBytes.length, 12);
	eocd.writeUInt32LE(offset, 16);
	eocd.writeUInt16LE(0, 20); // comment length

	return new Uint8Array(Buffer.concat([...locals, centralBytes, eocd]));
}

/**
 * Read an archive into path → bytes, driven by the central directory (the
 * authoritative index; local headers may carry deferred sizes).
 */
export function decodeZip(input: Uint8Array, limits: ZipReadLimits = DEFAULT_ZIP_LIMITS): Map<string, Uint8Array> {
	const buf = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
	const eocd = findEocd(buf);
	const count = buf.readUInt16LE(eocd + 10);
	if (count > limits.maxEntries) throw new ZipError(`archive declares ${count} entries (limit ${limits.maxEntries})`);
	let cursor = buf.readUInt32LE(eocd + 16);

	const out = new Map<string, Uint8Array>();
	let total = 0;

	for (let i = 0; i < count; i += 1) {
		if (cursor + 46 > buf.length || buf.readUInt32LE(cursor) !== CENTRAL_HEADER_SIGNATURE) {
			throw new ZipError('corrupt archive: central directory is truncated');
		}
		const method = buf.readUInt16LE(cursor + 10);
		const crc = buf.readUInt32LE(cursor + 16);
		const compressedSize = buf.readUInt32LE(cursor + 20);
		const uncompressedSize = buf.readUInt32LE(cursor + 24);
		const nameLength = buf.readUInt16LE(cursor + 28);
		const extraLength = buf.readUInt16LE(cursor + 30);
		const commentLength = buf.readUInt16LE(cursor + 32);
		const localOffset = buf.readUInt32LE(cursor + 42);
		const path = buf.toString('utf8', cursor + 46, cursor + 46 + nameLength);
		cursor += 46 + nameLength + extraLength + commentLength;

		if (path.endsWith('/')) continue; // directory marker — no payload
		assertSafePath(path);

		const remaining = limits.maxTotalBytes - total;
		if (uncompressedSize > remaining) {
			throw new ZipError(`archive expands past the ${Math.floor(limits.maxTotalBytes / 1024 / 1024)} MB limit`);
		}

		if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== LOCAL_HEADER_SIGNATURE) {
			throw new ZipError(`corrupt archive: bad local header for ${path}`);
		}
		const localNameLength = buf.readUInt16LE(localOffset + 26);
		const localExtraLength = buf.readUInt16LE(localOffset + 28);
		const start = localOffset + 30 + localNameLength + localExtraLength;
		const end = start + compressedSize;
		if (end > buf.length) throw new ZipError(`corrupt archive: ${path} runs past the end of the file`);
		const payload = buf.subarray(start, end);

		let bytes: Buffer;
		if (method === METHOD_STORE) {
			if (compressedSize > remaining) throw new ZipError('archive expands past the byte limit');
			bytes = Buffer.from(payload);
		} else if (method === METHOD_DEFLATE) {
			try {
				bytes = inflateRawSync(payload, { maxOutputLength: Math.max(1, Math.min(remaining, uncompressedSize)) });
			} catch {
				throw new ZipError(`corrupt archive: ${path} could not be decompressed`);
			}
		} else {
			throw new ZipError(`unsupported compression method ${method} for ${path}`);
		}

		if (bytes.length !== uncompressedSize || bytes.length > remaining) {
			throw new ZipError(`corrupt archive: size mismatch or byte limit exceeded on ${path}`);
		}
		total += bytes.length;
		if (out.has(path)) throw new ZipError(`archive contains a duplicate entry: ${path}`);
		if (crc32(bytes) !== crc) throw new ZipError(`corrupt archive: checksum mismatch on ${path}`);
		out.set(path, new Uint8Array(bytes));
	}

	return out;
}

/**
 * Reject anything that is not a plain relative path. Bundle entries are only
 * ever read into memory here, but the paths are echoed into diagnostics and used
 * as map keys, and an importer that ever writes one to disk must not have to
 * rediscover this rule.
 */
function assertSafePath(path: string): void {
	if (!path || path.length > 512) throw new ZipError('archive contains an invalid entry name');
	if (path.startsWith('/') || /^[a-zA-Z]:/.test(path) || path.includes('\\')) {
		throw new ZipError(`archive contains an absolute entry path: ${path}`);
	}
	if (path.split('/').some((segment) => segment === '..')) {
		throw new ZipError(`archive contains a traversing entry path: ${path}`);
	}
	if (/[\u0000-\u001f\u007f]/.test(path)) {
		throw new ZipError('archive contains a control character in an entry name');
	}
}

/** Locate the end-of-central-directory record, scanning back over the comment. */
function findEocd(buf: Buffer): number {
	if (buf.length < 22) throw new ZipError('not a zip archive');
	const floor = Math.max(0, buf.length - 22 - 0xffff);
	for (let i = buf.length - 22; i >= floor; i -= 1) {
		if (buf.readUInt32LE(i) !== EOCD_SIGNATURE) continue;
		const commentLength = buf.readUInt16LE(i + 20);
		if (i + 22 + commentLength !== buf.length) continue;
		if (i >= 20 && buf.readUInt32LE(i - 20) === ZIP64_EOCD_LOCATOR_SIGNATURE) {
			throw new ZipError('zip64 archives are not supported');
		}
		return i;
	}
	throw new ZipError('not a zip archive');
}

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let i = 0; i < 256; i += 1) {
		let c = i;
		for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[i] = c >>> 0;
	}
	return table;
})();

function crc32(bytes: Uint8Array): number {
	let crc = 0xffffffff;
	for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}
