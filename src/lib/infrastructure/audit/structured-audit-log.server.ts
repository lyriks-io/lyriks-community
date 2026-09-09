import type { AuditEvent, AuditLogPort } from '$application/ports';

/**
 * Emits each audit event as a single structured JSON line to stdout, tagged
 * `kind:'audit'` so log shippers / SIEMs can filter the trail. stdout-only keeps
 * it air-gap friendly (no egress); operators forward it with their own stack.
 */
export class StructuredAuditLog implements AuditLogPort {
	record(event: AuditEvent): void {
		// eslint-disable-next-line no-console -- audit trail is an intentional stdout sink
		console.log(JSON.stringify({ kind: 'audit', ts: new Date().toISOString(), ...event }));
	}
}
