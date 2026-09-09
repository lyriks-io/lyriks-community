// Quick smoke test: open two Yjs clients to the standalone y-websocket server,
// set a snapshot from client A, observe it arriving on client B.
// Run after: `node node_modules/y-websocket/bin/server.cjs` (port 3002).

import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const WS = require('ws');

const WS_URL = 'ws://127.0.0.1:3002';
const ROOM = 'feature:f-create-customer';

const docA = new Y.Doc();
const docB = new Y.Doc();
const provA = new WebsocketProvider(WS_URL, ROOM, docA, { WebSocketPolyfill: WS });
const provB = new WebsocketProvider(WS_URL, ROOM, docB, { WebSocketPolyfill: WS });

const mapA = docA.getMap('snapshot');
const mapB = docB.getMap('snapshot');

let received = null;
mapB.observe((event) => {
	if (event.transaction.origin === 'localA') return;
	received = mapB.get('data');
	console.log('client B observed:', received);
});

await new Promise((r) => setTimeout(r, 800));
console.log('client A writing snapshot.data.name = "Hi from client A"...');
docA.transact(() => {
	mapA.set('data', { id: 'f-create-customer', name: 'Hi from client A', description: '' });
}, 'localA');

await new Promise((r) => setTimeout(r, 1200));

if (received && received.name === 'Hi from client A') {
	console.log('\n✅ Round-trip works: B received the snapshot.');
	process.exit(0);
} else {
	console.error('\n❌ Round-trip failed. received =', received);
	process.exit(1);
}
