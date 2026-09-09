/** Client-only helpers for the Brand & Design tab (file reads → data URLs). */
import type { BrandAttachment, BrandFileRef } from '$domain/experience';

/** Read a File into a `{ name, dataUrl, size }` reference (base64 data URL). */
export function readBrandFile(file: File): Promise<BrandAttachment> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () =>
			resolve({
				id: `att_${crypto.randomUUID().slice(0, 8)}`,
				name: file.name,
				dataUrl: String(reader.result),
				size: file.size
			});
		reader.onerror = () => reject(reader.error ?? new Error('read failed'));
		reader.readAsDataURL(file);
	});
}

/** A `BrandAttachment` narrowed to the lighter `{ name, dataUrl }` ref. */
export function toFileRef(att: BrandAttachment): BrandFileRef {
	return { name: att.name, dataUrl: att.dataUrl };
}

/** True when a data URL carries image bytes (drives thumbnail vs file icon). */
export function isImageData(dataUrl: string): boolean {
	return dataUrl.startsWith('data:image/');
}
