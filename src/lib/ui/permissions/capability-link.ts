import {
	SCREEN_CAPABILITY_PREFIX,
	SURFACE_CAPABILITY_PREFIX
} from '$application/projection/surface-capabilities';
import type { CapabilitySource } from '$domain/users';

/**
 * Where a matrix row is authored — so a capability in the access matrix opens
 * the editor that owns it instead of leaving the reader to hunt for it.
 *
 * The URL shapes are the ones `$domain/graph/node-link` already established for
 * the graph explorer and project search (`route?tab=…&node=<id>`, plus the
 * richer `screen=` param the Experience builder takes), so all three ways of
 * arriving at an object land the same way.
 *
 * Null when no editor owns the row: the four built-in System capabilities, and
 * off-structure rows, which are authored in the matrix itself.
 */
export function capabilityHref(
	projectId: string,
	capabilityId: string,
	source: CapabilitySource
): string | null {
	const base = `/projects/${projectId}`;
	switch (source) {
		case 'feature':
			// `feature=` opens the leaf's detail drawer — the real editor; `node=`
			// anchors + flashes its row in the tree behind it.
			return `${base}/features?tab=tree&feature=${enc(capabilityId)}&node=${enc(capabilityId)}`;
		case 'journey':
			return `${base}/experience?tab=journeys&node=${enc(capabilityId)}`;
		case 'surface': {
			if (capabilityId.startsWith(SCREEN_CAPABILITY_PREFIX)) {
				const screenId = capabilityId.slice(SCREEN_CAPABILITY_PREFIX.length);
				return `${base}/experience?tab=screens&screen=${enc(screenId)}`;
			}
			// A behavior surface has no editor of its own: it is inspected on the
			// Behavior tab of the feature that authored it.
			const featureId = owningFeatureId(capabilityId);
			return featureId ? `${base}/features?tab=behavior&node=${enc(featureId)}` : null;
		}
		default:
			return null;
	}
}

/** The leaf feature inside a `surface:<featureId>:<surfaceId>` capability id. */
function owningFeatureId(capabilityId: string): string | null {
	if (!capabilityId.startsWith(SURFACE_CAPABILITY_PREFIX)) return null;
	const rest = capabilityId.slice(SURFACE_CAPABILITY_PREFIX.length);
	const sep = rest.indexOf(':');
	return sep > 0 ? rest.slice(0, sep) : null;
}

/** Where the link goes, for the title/aria of the row. */
export function capabilityLinkLabel(source: CapabilitySource, isPage: boolean): string {
	if (source === 'feature') return 'Open in Features';
	if (source === 'journey') return 'Open in Experience · Journeys';
	if (source === 'surface') return isPage ? 'Open in Experience · Screens' : 'Open in Features · Behavior';
	return '';
}

const enc = encodeURIComponent;
