import type { AssistantProvider } from '$domain/settings';
import type { LanguageModelAnswer, LanguageModelConnection, LanguageModelPort, LanguageModelRequest } from '$application/ports';

/** Hands each call to the adapter of the provider the administrator connected. */
export class ProviderLanguageModel implements LanguageModelPort {
	constructor(private readonly byProvider: Readonly<Record<AssistantProvider, LanguageModelPort>>) {}

	complete(connection: LanguageModelConnection, request: LanguageModelRequest): Promise<LanguageModelAnswer> {
		return this.byProvider[connection.provider].complete(connection, request);
	}
}
