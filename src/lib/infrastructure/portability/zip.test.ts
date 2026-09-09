import { describe, expect, it } from 'vitest';
import { decodeZip, encodeZip, ZipError } from './zip.server';

const utf8 = (text: string) => new TextEncoder().encode(text);

/** Rewrite the entry name of the single-entry archive, in both headers. */
function withEntryName(archive: Uint8Array, from: string, to: string): Uint8Array {
	expect(to.length).toBe(from.length); // keeps every offset valid
	const text = Buffer.from(archive).toString('latin1').split(from).join(to);
	return new Uint8Array(Buffer.from(text, 'latin1'));
}

describe('zip codec', () => {
	it('round-trips text, binary and empty entries', () => {
		const entries = [
			{ path: 'lyriks-bundle.json', bytes: utf8('{"format":"lyriks.project-bundle"}') },
			{ path: 'files/logo.png', bytes: new Uint8Array(4096).map((_, i) => (i * 31) % 256) },
			{ path: 'project/residue.json', bytes: utf8('') },
			{ path: 'kernel/features/feat-1.json', bytes: utf8('a'.repeat(50_000)) }
		];

		const decoded = decodeZip(encodeZip(entries));

		expect([...decoded.keys()].sort()).toEqual(entries.map((e) => e.path).sort());
		for (const entry of entries) {
			expect(Buffer.from(decoded.get(entry.path)!).equals(Buffer.from(entry.bytes))).toBe(true);
		}
	});

	it('compresses what compresses and stores what does not', () => {
		const compressible = encodeZip([{ path: 'a', bytes: utf8('x'.repeat(10_000)) }]);
		expect(compressible.byteLength).toBeLessThan(1_000);

		// Random bytes deflate larger than they start; the entry must fall back to
		// STORE rather than grow.
		const random = new Uint8Array(4096).map((_, i) => (i * 2654435761) % 256);
		const stored = encodeZip([{ path: 'a', bytes: random }]);
		expect(stored.byteLength).toBeLessThan(random.byteLength + 200);
	});

	it('is deterministic', () => {
		const entries = [{ path: 'a.json', bytes: utf8('{"a":1}') }];
		expect(Buffer.from(encodeZip(entries)).equals(Buffer.from(encodeZip(entries)))).toBe(true);
	});

	it('preserves UTF-8 entry names', () => {
		const decoded = decodeZip(encodeZip([{ path: 'files/logo-é.png', bytes: utf8('x') }]));
		expect([...decoded.keys()]).toEqual(['files/logo-é.png']);
	});

	it('reads an archive produced by another tool', () => {
		// Written by `zip` on a different machine would be ideal; the next best
		// check is that we do not depend on our own writer's entry ordering.
		const archive = encodeZip([
			{ path: 'b.json', bytes: utf8('{"b":2}') },
			{ path: 'a.json', bytes: utf8('{"a":1}') }
		]);
		expect([...decodeZip(archive).keys()]).toEqual(['b.json', 'a.json']);
	});
});

describe('zip codec refusals', () => {
	it('rejects a traversing entry path', () => {
		const archive = withEntryName(encodeZip([{ path: 'aa/bb.json', bytes: utf8('{}') }]), 'aa/bb.json', '../bb.json');
		expect(() => decodeZip(archive)).toThrow(ZipError);
		expect(() => decodeZip(archive)).toThrow(/traversing/);
	});

	it('rejects an absolute entry path', () => {
		const archive = withEntryName(encodeZip([{ path: 'aa/bb.json', bytes: utf8('{}') }]), 'aa/bb.json', '/a/bb.json');
		expect(() => decodeZip(archive)).toThrow(/absolute/);
	});

	it('rejects a Windows-drive entry path', () => {
		const archive = withEntryName(encodeZip([{ path: 'aa/bb.json', bytes: utf8('{}') }]), 'aa/bb.json', 'C:\\bb.json');
		expect(() => decodeZip(archive)).toThrow(/absolute/);
	});

	it('rejects an archive that expands past the limit', () => {
		const archive = encodeZip([{ path: 'big', bytes: utf8('x'.repeat(200_000)) }]);
		expect(() => decodeZip(archive, { maxEntries: 10, maxTotalBytes: 1024 })).toThrow(/limit/);
	});

	it('rejects an archive declaring too many entries', () => {
		const archive = encodeZip([{ path: 'a', bytes: utf8('x') }, { path: 'b', bytes: utf8('y') }]);
		expect(() => decodeZip(archive, { maxEntries: 1, maxTotalBytes: 1024 })).toThrow(/entries/);
	});

	it('rejects a corrupted payload', () => {
		const archive = encodeZip([{ path: 'a.json', bytes: utf8('{"a":1}'.repeat(100)) }]);
		// Past the 30-byte local header and the 6-byte name: inside the payload,
		// where a flipped bit is exactly what the CRC exists to catch.
		archive[50] ^= 0xff;
		expect(() => decodeZip(archive)).toThrow(ZipError);
	});

	it('rejects something that is not a zip at all', () => {
		expect(() => decodeZip(utf8('this is a text file, not an archive'))).toThrow(/not a zip archive/);
	});
});


describe('untrusted ZIP size declarations', () => {
	it('rejects an understated decompressed size before accumulating multiple entries', () => {
		const archive = Buffer.from(encodeZip([
			{ path: 'a', bytes: utf8('a'.repeat(800)) },
			{ path: 'b', bytes: utf8('b'.repeat(800)) }
		]));
		for (let i = 0; i < archive.length - 46; i++) {
			if (archive.readUInt32LE(i) === 0x02014b50) archive.writeUInt32LE(1, i + 24);
		}
		expect(() => decodeZip(archive, { maxEntries: 10, maxTotalBytes: 1024 })).toThrow(ZipError);
	});
	it('rejects understated stored entries and duplicate names', () => {
		const archive = Buffer.from(encodeZip([{ path: 'a', bytes: utf8('abc') }]));
		for (let i = 0; i < archive.length - 46; i++) {
			if (archive.readUInt32LE(i) === 0x02014b50) archive.writeUInt32LE(0, i + 24);
		}
		expect(() => decodeZip(archive)).toThrow(/size mismatch/);
		expect(() => decodeZip(encodeZip([{ path: 'a', bytes: utf8('a') }, { path: 'a', bytes: utf8('b') }]))).toThrow(/duplicate/);
	});
	it('allows an empty entry after the exact budget is consumed', () => {
		const archive = encodeZip([{ path: 'a', bytes: utf8('abc') }, { path: 'empty', bytes: utf8('') }]);
		expect(decodeZip(archive, { maxEntries: 10, maxTotalBytes: 3 }).size).toBe(2);
	});
});
