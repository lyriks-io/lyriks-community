/**
 * The cross-context local-coherence contract. Every section scores its own
 * draft 0–100 with its own rules, but they all report through this one shape
 * so the shell, the Control Center and the MCP read a single vocabulary.
 */

export type CoherenceTone = 'critical' | 'at-risk' | 'strong';

export interface CoherenceIssue {
	readonly code: string;
	readonly message: string;
}

export interface CoherenceResult {
	readonly score: number;
	readonly tone: CoherenceTone;
	readonly label: string;
	readonly issues: CoherenceIssue[];
}
