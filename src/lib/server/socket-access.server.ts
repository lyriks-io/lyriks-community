import { error, type RequestEvent } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireProjectAccess } from './project-access.server';
import { canUseSharedEditor } from './shared-editor-access.server';

const ID = /^[A-Za-z0-9_-]{1,128}$/;

/** Resolve the exact upstream room after checking the live caller and project. */
export async function authorizeSocket(event: RequestEvent, requested: string): Promise<string> {
	const url = new URL(requested, 'http://socket.invalid');
	if (!requested.startsWith('/') || requested.startsWith('//') || url.origin !== 'http://socket.invalid') {
		error(400, 'invalid socket path');
	}
	let path: string;
	try { path = decodeURIComponent(url.pathname); } catch { error(400, 'invalid socket path'); }
	if (/^\/behavior\/sync\/(feature|project|implementation-status)[:/][A-Za-z0-9_-]{1,128}$/.test(path)) {
		if (!canUseSharedEditor(event)) error(403, 'shared editor requires an installation administrator');
		return path;
	}
	const room = /^\/yjs\/feature:([A-Za-z0-9_-]{1,128})$/.exec(path);
	const projectId = url.searchParams.get('project') ?? '';
	if (!room || !ID.test(projectId)) error(400, 'invalid project room');
	await requireProjectAccess(event, projectId, 'write');
	const features = await getServices().loadFeaturesDraft.execute(projectId);
	if (!features.features.some(feature => feature.id === room[1])) error(404, 'Feature not found');
	// The stock relay has a global room namespace. Project-qualified keys prevent
	// identical feature ids in distinct projects from sharing a document.
	return `/yjs/${projectId}:feature:${room[1]}`;
}
