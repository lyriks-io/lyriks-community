import { describe, expect, it } from 'vitest';
import { buildBundle } from './build-bundle';
import { readBundle } from './read-bundle';
import { rehomeSnapshot } from './rehome-snapshot';
import { bytesToBase64, isCanonicalBase64 } from './base64';
import { describeProject, type ProjectSnapshot } from './snapshot';
import { FILE_INDEX_PATH, MANIFEST_PATH } from './bundle';

/** Deterministic stand-in for sha256 — the pure code only needs stable + injective. */
const hash = (bytes: Uint8Array): string => {
	let h = 0x811c9dc5;
	for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0;
	return h.toString(16).padStart(8, '0');
};

const entriesToFiles = (entries: ReturnType<typeof buildBundle>) =>
	new Map(entries.map((e) => [e.path, e.bytes]));

/** A 1 KB PNG-ish payload — past the inline threshold, so it gets externalized. */
function dataUrl(seed: number): string {
	const bytes = new Uint8Array(1024).map((_, i) => (i * 7 + seed) % 256);
	return `data:image/png;base64,${bytesToBase64(bytes)}`;
}

function snapshot(overrides: Partial<ProjectSnapshot> = {}): ProjectSnapshot {
	return {
		projectId: 'billos-a1b2c3',
		name: 'Billos',
		description: 'Invoicing for European SMBs',
		rows: {
			legacyDocuments: {
				project_drafts: {
					projectId: 'billos-a1b2c3',
					productName: 'Billos',
					brief: 'Invoicing for European SMBs',
					formFactors: ['web_interface']
				}
			},
			sectionDocuments: {
				glossary: { schemaVersion: 1, document: { terms: [{ term: 'Dunning' }] }, revision: 4 }
			},
			residue: {
				experience: { brand: { logo: dataUrl(1), palette: ['#123456'] } },
				rules: { issues: [] }
			},
			revisions: { glossary: 4 },
			meta: { domainId: 'finance', shippedAt: null }
		},
		kernel: {
			project: { id: 'billos-a1b2c3', name: 'Billos', surfaces: [] },
			// Sorted by id, which is the canonical order a bundle stores them in.
			features: [
				{ id: 'feat-dunning', feature: { id: 'feat-dunning', name: 'Dunning', actions: [] } },
				{ id: 'feat-invoice', feature: { id: 'feat-invoice', name: 'Invoice', actions: [] } }
			]
		},
		domain: { id: 'finance', name: 'Finance', description: '', icon: 'lucide:banknote' },
		...overrides
	};
}

const build = (s: ProjectSnapshot) =>
	buildBundle({ snapshot: s, exportedAt: '2026-08-02T10:00:00.000Z', appVersion: '0.7.0', hash });

describe('project bundle round-trip', () => {
	it('restores an identical snapshot', () => {
		const source = snapshot();
		const parsed = readBundle(entriesToFiles(build(source)));

		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.warnings).toEqual([]);
		expect(parsed.snapshot).toEqual(source);
	});

	it('re-exports byte-for-byte after a round-trip', () => {
		const first = build(snapshot());
		const parsed = readBundle(entriesToFiles(first));
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;

		const second = build(parsed.snapshot);
		expect(second.map((e) => e.path)).toEqual(first.map((e) => e.path));
		for (const [i, entry] of second.entries()) {
			expect(Buffer.from(entry.bytes).equals(Buffer.from(first[i].bytes))).toBe(true);
		}
	});

	it('is insensitive to the order features came back from the store in', () => {
		const source = snapshot();
		const shuffled = build({
			...source,
			kernel: { ...source.kernel, features: [...source.kernel.features].reverse() }
		});
		const original = build(source);
		expect(shuffled.map((e) => e.path)).toEqual(original.map((e) => e.path));
		for (const [i, entry] of shuffled.entries()) {
			expect(Buffer.from(entry.bytes).equals(Buffer.from(original[i].bytes))).toBe(true);
		}
	});

	it('is insensitive to key order in the stored documents', () => {
		const a = build(snapshot());
		const reordered = snapshot();
		const b = build({
			...reordered,
			rows: {
				...reordered.rows,
				residue: { rules: { issues: [] }, experience: reordered.rows.residue.experience }
			}
		});
		expect(Buffer.from(b[3].bytes).equals(Buffer.from(a[3].bytes))).toBe(true);
	});
});

describe('uploaded files', () => {
	it('moves data URLs into their own entries and restores them exactly', () => {
		const entries = build(snapshot());
		const paths = entries.map((e) => e.path);

		expect(paths).toContain(FILE_INDEX_PATH);
		expect(paths.some((p) => p.startsWith('files/') && p.endsWith('.png'))).toBe(true);
		// The base64 must not survive inside the section JSON — that is the point.
		const residue = entries.find((e) => e.path === 'project/residue.json')!;
		expect(new TextDecoder().decode(residue.bytes)).not.toContain('data:image/png;base64');

		const parsed = readBundle(entriesToFiles(entries));
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		const brand = (parsed.snapshot.rows.residue.experience as { brand: { logo: string } }).brand;
		expect(brand.logo).toBe(dataUrl(1));
	});

	it('stores one entry when the same file is referenced twice', () => {
		const source = snapshot();
		const twice = build({
			...source,
			rows: {
				...source.rows,
				residue: {
					...source.rows.residue,
					documents: { attachment: dataUrl(1) }
				}
			}
		});
		expect(twice.filter((e) => e.path.startsWith('files/') && e.path !== FILE_INDEX_PATH)).toHaveLength(1);
	});

	it('leaves a payload inline when its base64 is not canonical', () => {
		const source = snapshot();
		const padded = `data:image/png;base64,${'A'.repeat(2000)}=`;
		expect(isCanonicalBase64(padded.split(',')[1])).toBe(false);
		const entries = build({
			...source,
			rows: { ...source.rows, residue: { experience: { brand: { logo: padded } } } }
		});
		const residue = entries.find((e) => e.path === 'project/residue.json')!;
		expect(new TextDecoder().decode(residue.bytes)).toContain(padded);
	});
});

describe('rehoming a snapshot', () => {
	it('rewrites the id everywhere it is an identity, and nowhere else', () => {
		const source = snapshot();
		const prose = `Migrated away from billos-a1b2c3 in Q3`;
		const withProse = {
			...source,
			rows: {
				...source.rows,
				sectionDocuments: {
					...source.rows.sectionDocuments,
					glossary: { schemaVersion: 1, document: { note: prose }, revision: 1 }
				}
			}
		};

		const copy = rehomeSnapshot(withProse, { projectId: 'billos-zzz999', name: 'Billos Copy' });

		expect(copy.projectId).toBe('billos-zzz999');
		expect((copy.rows.legacyDocuments.project_drafts as { projectId: string }).projectId).toBe('billos-zzz999');
		expect((copy.kernel.project as { id: string }).id).toBe('billos-zzz999');
		expect(copy.name).toBe('Billos Copy');
		expect((copy.rows.legacyDocuments.project_drafts as { productName: string }).productName).toBe('Billos Copy');
		expect((copy.kernel.project as { name: string }).name).toBe('Billos Copy');
		// Prose that merely mentions the old id is specification text, not identity.
		expect((copy.rows.sectionDocuments.glossary.document as { note: string }).note).toBe(prose);
	});

	it('keeps the original name when none is given', () => {
		const copy = rehomeSnapshot(snapshot(), { projectId: 'other-000000' });
		expect(copy.name).toBe('Billos');
		expect(describeProject(copy.rows, copy.projectId).name).toBe('Billos');
	});

	it('refiles the copy under a chosen domain', () => {
		const copy = rehomeSnapshot(snapshot(), { projectId: 'other-000000', domainId: 'ops' });
		expect(copy.rows.meta).toEqual({ domainId: 'ops', shippedAt: null });
	});
});

describe('refusals', () => {
	it('refuses an archive with no manifest', () => {
		const result = readBundle(new Map([['project/residue.json', new TextEncoder().encode('{}')]]));
		expect(result).toEqual({ ok: false, error: expect.stringContaining('not a Lyriks bundle') });
	});

	it('refuses a manifest from a newer bundle version', () => {
		const files = entriesToFiles(build(snapshot()));
		files.set(
			MANIFEST_PATH,
			new TextEncoder().encode(
				JSON.stringify({
					format: 'lyriks.project-bundle',
					bundleVersion: 99,
					project: { id: 'x' }
				})
			)
		);
		const result = readBundle(files);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toContain('newer Lyriks');
	});

	it('refuses a zip that is not a Lyriks bundle', () => {
		const files = entriesToFiles(build(snapshot()));
		files.set(MANIFEST_PATH, new TextEncoder().encode(JSON.stringify({ format: 'something-else' })));
		const result = readBundle(files);
		expect(result.ok).toBe(false);
	});

	it('reports a missing file instead of inventing one', () => {
		const entries = build(snapshot());
		const files = entriesToFiles(entries);
		const filePath = entries.find((e) => e.path.startsWith('files/') && e.path !== FILE_INDEX_PATH)!.path;
		files.delete(filePath);

		const parsed = readBundle(files);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.warnings.join(' ')).toContain(filePath);
		// The token is left verbatim rather than silently becoming a broken image.
		const brand = (parsed.snapshot.rows.residue.experience as { brand: { logo: string } }).brand;
		expect(brand.logo.startsWith('lyriks-bundle:file:')).toBe(true);
	});

	it('rejects a feature id that would escape its entry path', () => {
		const source = snapshot();
		expect(() =>
			build({
				...source,
				kernel: { ...source.kernel, features: [{ id: '../escape', feature: { id: '../escape' } }] }
			})
		).toThrow(/unsafe feature id/);
	});
});
