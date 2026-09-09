import { describe, it, expect } from 'vitest';
import { defaultBrand } from './brand';
import { listBrandFiles, findBrandFile, parseDataUrl, dataUrlSize, fileKind, fileExtension } from './brand-files';

const pdf = 'data:application/pdf;base64,JVBERi0xLjQK'; // "%PDF-1.4\n"
const txt = 'data:text/plain;base64,aGVsbG8='; // "hello"

describe('parseDataUrl / size', () => {
	it('splits mime and payload', () => {
		expect(parseDataUrl(pdf)).toEqual({ mime: 'application/pdf', base64: 'JVBERi0xLjQK' });
	});
	it('rejects non-data URLs', () => {
		expect(parseDataUrl('https://x/y.pdf')).toBeNull();
	});
	it('derives byte size', () => {
		expect(dataUrlSize(txt)).toBe(5); // "hello"
	});
});

describe('fileKind / fileExtension', () => {
	it('classifies by mime and extension', () => {
		expect(fileKind('a.pdf', 'application/pdf')).toBe('pdf');
		expect(fileKind('readme.md')).toBe('markdown');
		expect(fileKind('notes.txt')).toBe('text');
		expect(fileKind('logo.png', 'image/png')).toBe('image');
		expect(fileKind('archive.zip')).toBe('other');
	});
	it('reads the extension', () => {
		expect(fileExtension('My.File.PDF')).toBe('pdf');
		expect(fileExtension('noext')).toBe('');
	});
});

describe('listBrandFiles / findBrandFile', () => {
	it('enumerates files across the brand tree with stable refs', () => {
		const brand = defaultBrand();
		brand.identity.brandbookFile = { name: 'book.pdf', dataUrl: pdf };
		brand.logo.variants.push({ id: 'v1', label: 'Primary', file: { name: 'logo.svg', dataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }, url: '', role: '' });
		brand.pages.push({ id: 'pg1', type: 'landing', principles: '', densityNote: '', screenshotRefs: [{ name: 'shot.png', dataUrl: 'data:image/png;base64,aaa=' }], referenceUrls: [] });
		brand.attachments = { identity: [{ id: 'att_1', name: 'spec.md', dataUrl: txt, size: 5 }] };

		const files = listBrandFiles(brand);
		const refs = files.map((f) => f.ref).sort();
		expect(refs).toEqual(['attachments/identity/att_1', 'identity/brandbook', 'logo/v1', 'pages/pg1/0'].sort());

		const found = findBrandFile(brand, 'identity/brandbook');
		expect(found?.name).toBe('book.pdf');
		expect(findBrandFile(brand, 'nope/x')).toBeNull();
	});

	it('skips files with empty data URLs', () => {
		const brand = defaultBrand();
		brand.identity.brandbookFile = { name: 'empty', dataUrl: '' };
		expect(listBrandFiles(brand)).toHaveLength(0);
	});

	it('decodes to the exact original bytes (mirrors the download endpoint)', () => {
		const original = 'Hello, PDF & Ünïcode 🎯';
		const dataUrl = `data:text/plain;base64,${Buffer.from(original, 'utf-8').toString('base64')}`;
		const brand = defaultBrand();
		brand.identity.brandbookFile = { name: 'doc.txt', dataUrl };

		const entry = findBrandFile(brand, 'identity/brandbook')!;
		const parsed = parseDataUrl(entry.dataUrl)!;
		// This is precisely what /api/files does to build the Response body.
		const bytes = Buffer.from(parsed.base64, 'base64');
		expect(bytes.toString('utf-8')).toBe(original);
		expect(parsed.mime).toBe('text/plain');
	});
});
