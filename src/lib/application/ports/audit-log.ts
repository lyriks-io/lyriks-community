/**
 * Security/admin audit trail. Records WHO did WHAT and the outcome, so an
 * operator (or SIEM) can review sensitive actions. The platform never makes
 * judgements here — it just emits structured, append-only events.
 */
export interface AuditEvent {
	/** Dotted action id, e.g. 'auth.login', 'project.create', 'settings.update'. */
	readonly action: string;
	/** The acting user (email) or 'dev' / 'anonymous' when no identity applies. */
	readonly actor: string;
	readonly outcome: 'success' | 'failure';
	/** The thing acted upon (projectId, …), when applicable. */
	readonly target?: string;
	/** Short context, e.g. a failure reason. Never secrets. */
	readonly detail?: string;
}

export interface AuditLogPort {
	record(event: AuditEvent): void;
}
