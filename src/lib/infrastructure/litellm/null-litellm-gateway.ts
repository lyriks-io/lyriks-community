import type { LiteLLMGatewayPort, LiteLLMKeyState, LiteLLMSpendLog } from '$application/ports';

/**
 * The air-gapped default: no proxy configured. `available` is false, so the
 * push/pull use-cases short-circuit and the governor runs locally in advisory
 * mode. Any direct call is a programming error (guarded by `available`).
 */
export class NullLiteLLMGateway implements LiteLLMGatewayPort {
	readonly available = false;
	readonly baseUrl = '';

	async applyKey(): Promise<LiteLLMKeyState> {
		throw new Error('LiteLLM gateway is not configured (air-gapped install).');
	}

	async readKey(): Promise<LiteLLMKeyState | null> {
		return null;
	}

	async readSpendLogs(): Promise<LiteLLMSpendLog[]> {
		return [];
	}
}
