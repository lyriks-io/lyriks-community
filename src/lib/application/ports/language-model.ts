import type { AssistantFailure, AssistantProvider } from '$domain/settings';

/** The central connection a call is made with (ac-adm-ai-central). */
export interface LanguageModelConnection {
	readonly provider: AssistantProvider;
	readonly model: string;
	readonly apiKey: string;
}

/** One instruction and one message: every call the built-in assistant makes is a single turn. */
export interface LanguageModelRequest {
	readonly system: string;
	readonly prompt: string;
}

export type LanguageModelAnswer =
	| { readonly ok: true; readonly text: string }
	| { readonly ok: false; readonly failure: AssistantFailure; readonly detail: string };

/**
 * Outbound port to the provider the administrator connected. Only the
 * built-in assistant calls it, only while it is switched on, and only when a
 * person asks for something (ac-adm-ai-egress): nothing calls out by default.
 */
export interface LanguageModelPort {
	complete(connection: LanguageModelConnection, request: LanguageModelRequest): Promise<LanguageModelAnswer>;
}
