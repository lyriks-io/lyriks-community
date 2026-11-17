import type { KernelArtifact } from './snapshot';

const SHAPES = {
	source: { body: 'source', format: 'unspaghettit-source', id: 'id', directory: 'sources/', suffix: '.source.json' },
	provenance: { body: 'provenance', format: 'unspaghettit-provenance', id: 'featureId', directory: '', suffix: '.provenance.json' },
	implementation: { body: 'status', format: 'unspaghettit-implementation-status', id: 'featureId', directory: '', suffix: '.implementation-status.json' }
} as const;

export function isSafeKernelId(id: unknown): id is string {
	return typeof id === 'string' && id.length > 0 && id.length <= 255 && id !== '.' && id !== '..' && !/[\\/\0]/.test(id);
}

/** Validate an envelope before it is allowed to name a file in the project. */
export function parseKernelArtifact(value: unknown): KernelArtifact | null {
	if (!record(value) || typeof value.kind !== 'string' || !Object.hasOwn(SHAPES, value.kind) || !isSafeKernelId(value.id) || !record(value.document)) return null;
	const kind = value.kind as KernelArtifact['kind'];
	const shape = SHAPES[kind];
	const document = value.document;
	const body = document[shape.body];
	if (document.format !== shape.format || !record(body) || body[shape.id] !== value.id || !Number.isInteger(document.version) || Number(document.version) < 1) return null;
	if (kind === 'source' && typeof body.content !== 'string') return null;
	return { kind, id: value.id, document };
}

export function kernelArtifactPath(artifact: KernelArtifact): string {
	if (!parseKernelArtifact(artifact)) throw new Error('Invalid project evidence record');
	const shape = SHAPES[artifact.kind];
	return `${shape.directory}${artifact.id}${shape.suffix}`;
}

/** Recognize only the three evidence formats the project store owns. */
export function kernelArtifactFromFile(path: string, document: unknown): KernelArtifact | null {
	const kind = (Object.keys(SHAPES) as KernelArtifact['kind'][]).find(k => {
		const shape = SHAPES[k];
		return path.startsWith(shape.directory) && !path.slice(shape.directory.length).includes('/') && path.endsWith(shape.suffix);
	});
	if (!kind || !record(document)) return null;
	const shape = SHAPES[kind];
	const body = document[shape.body];
	return record(body) ? parseKernelArtifact({ kind, id: body[shape.id], document }) : null;
}

function record(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}
