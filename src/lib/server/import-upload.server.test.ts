import { describe, it, expect } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { readUpload } from './import-upload.server';

const url = new URL('http://localhost/api/projects/import');
const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);

/** A request whose body stream fails the way adapter-node fails it past BODY_SIZE_LIMIT. */
function requestWithFailingBody(contentType: string, failure: unknown): Request {
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.error(failure);
		}
	});
	return new Request(url, {
		method: 'POST',
		headers: { 'content-type': contentType },
		body,
		// @ts-expect-error undici needs the half-duplex flag for streamed bodies
		duplex: 'half'
	});
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
	} catch (e) {
		return e;
	}
	throw new Error('expected a rejection');
}

describe('readUpload', () => {
	it('reads a multipart form post with its options', async () => {
		const form = new FormData();
		form.set('file', new File([zip], 'p.lyriks.zip', { type: 'application/zip' }));
		form.set('domainId', 'dom-1');
		form.set('mode', 'restore');
		const { bytes, options } = await readUpload(new Request(url, { method: 'POST', body: form }), url);
		expect(Array.from(bytes)).toEqual(Array.from(zip));
		expect(options.request).toEqual({ mode: 'restore', overwrite: false, domainId: 'dom-1' });
	});

	it('reads a raw zip body with query-string options', async () => {
		const raw = new Request(`${url}?name=Copy&workspaceId=ws-1`, {
			method: 'POST',
			headers: { 'content-type': 'application/zip' },
			body: zip
		});
		const { bytes, options } = await readUpload(raw, new URL(raw.url));
		expect(bytes.byteLength).toBe(zip.byteLength);
		expect(options.workspaceId).toBe('ws-1');
		expect(options.request).toEqual({ mode: 'copy', overwrite: false, name: 'Copy' });
	});

	it('surfaces the runtime body limit as a 413, not as a malformed upload', async () => {
		const limit = Object.assign(new Error('Content-length of 555704 exceeds limit of 524288 bytes.'), {
			status: 413
		});
		const e = await rejection(
			readUpload(requestWithFailingBody('multipart/form-data; boundary=xyz', limit), url)
		);
		expect(isHttpError(e) && e.status).toBe(413);
		expect(isHttpError(e) && e.body.message).toContain('exceeds limit of 524288 bytes');
		expect(isHttpError(e) && e.body.message).toContain('BODY_SIZE_LIMIT');
	});

	it('surfaces the body limit on the raw path too', async () => {
		const limit = Object.assign(new Error('too big'), { status: 413 });
		const e = await rejection(readUpload(requestWithFailingBody('application/zip', limit), url));
		expect(isHttpError(e) && e.status).toBe(413);
	});

	it('still reports a genuinely malformed multipart body as a 400', async () => {
		const broken = new Request(url, {
			method: 'POST',
			headers: { 'content-type': 'multipart/form-data; boundary=xyz' },
			body: 'this is not multipart at all'
		});
		const e = await rejection(readUpload(broken, url));
		expect(isHttpError(e) && e.status).toBe(400);
		expect(isHttpError(e) && e.body.message).toBe('Malformed multipart upload');
	});

	it('requires a "file" part', async () => {
		const form = new FormData();
		form.set('name', 'no file here');
		const e = await rejection(readUpload(new Request(url, { method: 'POST', body: form }), url));
		expect(isHttpError(e) && e.status).toBe(400);
	});
});
