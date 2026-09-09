import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

/**
 * Client-side two-way binding between v3's `FeaturesStore` and the OSS
 * Unspaghettit dashboard's Yjs WebSocket server. One connection per visible
 * leaf Feature (room id `feature:<id>`). The dashboard's doc stores the
 * full feature snapshot under `snapshot.data` (see `ROOM_DOC_MAP` /
 * `ROOM_DOC_FIELD` in the OSS), so we read/write the snapshot wholesale and
 * project just the fields the v3 UI cares about (`name`, `description` for
 * v0) into the store.
 *
 * Behavior:
 *   - On `connect(featureId)`: open a WS, observe the snapshot map, and
 *     install an update hook that pushes local store changes upstream.
 *   - On remote change: pull the new name/description and write into the
 *     v3 leaf via the supplied store mutator.
 *   - On `disconnect(featureId)`: tear down the room.
 *   - On `dispose()`: close every room.
 *
 * Failures (WS unreachable, dashboard offline) are logged and swallowed:
 * v3 stays usable when the dashboard isn't running.
 */
const SYNC_MAP = 'snapshot';
const SYNC_FIELD = 'data';

export interface FeatureSyncCallbacks {
	/** Apply a remote change to the v3 leaf. Called when Yjs is the origin. */
	readonly onRemoteName: (featureId: string, name: string) => void;
	readonly onRemoteDescription: (featureId: string, description: string) => void;
	/** Tell the consumer whether at least one room is live. */
	readonly onStatusChange?: (connectedRooms: number) => void;
}

interface Room {
	readonly doc: Y.Doc;
	readonly provider: WebsocketProvider;
	readonly map: Y.Map<unknown>;
	readonly observer: (events: Y.YMapEvent<unknown>) => void;
}

type Snapshot = Record<string, unknown> & { id?: string; name?: string; description?: string };

/** Origin tag set on Yjs transactions we issue locally, so we can ignore the echo. */
const LOCAL_ORIGIN = Symbol('lyriks-v3-local');

export class YjsFeatureSync {
	#wsBaseUrl: string;
	#projectId: string;
	#rooms = new Map<string, Room>();
	#cb: FeatureSyncCallbacks;

	constructor(wsBaseUrl: string, projectId: string, cb: FeatureSyncCallbacks) {
		this.#wsBaseUrl = wsBaseUrl.replace(/\/$/, '');
		this.#projectId = projectId;
		this.#cb = cb;
	}

	connect(featureId: string): void {
		if (this.#rooms.has(featureId)) return;
		try {
			const doc = new Y.Doc();
			const roomName = `feature:${featureId}`;
			// Carry the project as a connection param so an authenticated back yjs can
			// authorize this room against the caller's session (the httpOnly cookie
			// rides the same-origin WS upgrade). The current dev server ignores it, so
			// this is backward-compatible. The room-name wire contract is unchanged.
			const provider = new WebsocketProvider(this.#wsBaseUrl, roomName, doc, {
				connect: true,
				// BroadcastChannel ignores project query params and would mix equal feature ids.
				disableBc: true,
				params: { project: this.#projectId }
			});
			const map = doc.getMap(SYNC_MAP);
			const observer = (event: Y.YMapEvent<unknown>) => {
				// Ignore echoes of our own writes.
				if (event.transaction.origin === LOCAL_ORIGIN) return;
				const snapshot = map.get(SYNC_FIELD) as Snapshot | undefined;
				if (!snapshot || typeof snapshot !== 'object') return;
				const remoteName = typeof snapshot.name === 'string' ? snapshot.name : '';
				const remoteDesc =
					typeof snapshot.description === 'string' ? snapshot.description : '';
				this.#cb.onRemoteName(featureId, remoteName);
				this.#cb.onRemoteDescription(featureId, remoteDesc);
			};
			map.observe(observer);
			provider.on('status', () => {
				this.#cb.onStatusChange?.(this.#countConnected());
			});
			this.#rooms.set(featureId, { doc, provider, map, observer });
		} catch (e) {
			console.warn('[yjs-sync] connect failed for', featureId, e);
		}
	}

	/**
	 * Push a local edit upstream. Reads the current snapshot, updates the
	 * named field, and writes back. Atomic via Y.Doc.transact so dashboards
	 * see one update event, not two.
	 */
	pushLocalName(featureId: string, name: string): void {
		this.#pushField(featureId, 'name', name);
	}
	pushLocalDescription(featureId: string, description: string): void {
		this.#pushField(featureId, 'description', description);
	}

	disconnect(featureId: string): void {
		const room = this.#rooms.get(featureId);
		if (!room) return;
		room.map.unobserve(room.observer);
		room.provider.destroy();
		room.doc.destroy();
		this.#rooms.delete(featureId);
		this.#cb.onStatusChange?.(this.#countConnected());
	}

	dispose(): void {
		for (const featureId of [...this.#rooms.keys()]) this.disconnect(featureId);
	}

	#pushField(featureId: string, field: 'name' | 'description', value: string): void {
		const room = this.#rooms.get(featureId);
		if (!room) return;
		room.doc.transact(() => {
			const current = (room.map.get(SYNC_FIELD) as Snapshot | undefined) ?? {};
			const next: Snapshot = { ...current, [field]: value };
			room.map.set(SYNC_FIELD, next);
		}, LOCAL_ORIGIN);
	}

	#countConnected(): number {
		let n = 0;
		for (const r of this.#rooms.values()) if (r.provider.wsconnected) n += 1;
		return n;
	}
}
