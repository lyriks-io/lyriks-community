/**
 * Domain events emitted by Step 03 — Users & Permissions. Mirrors the events
 * declared on feature `33b2f79d`. Telemetry + autosave debounce consume these.
 */

export type UsersEvent =
	| { type: 'users.field.changed'; field: string }
	| { type: 'users.autosaved'; savedAt: string }
	| { type: 'users.local_coherence.computed'; score: number; issues: string[] }
	| { type: 'users.role.added'; roleId: string }
	| { type: 'users.role.removed'; roleId: string }
	| {
			type: 'users.permission.toggled';
			roleId: string;
			capabilityId: string;
			capabilitySource: string;
			granted: boolean;
	  }
	| { type: 'users.derived_capabilities.refreshed'; featureCount: number; journeyCount: number }
	| { type: 'users.step.completed'; to: string };
