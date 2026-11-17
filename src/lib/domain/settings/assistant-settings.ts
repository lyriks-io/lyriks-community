/**
 * The built-in assistant: an AI the installation itself calls, unlike the AI
 * suggestions above, which come from the person's own LLM through the MCP. It
 * is off on a new installation, and Lyriks then calls no AI service at all
 * (ac-adm-ai-off). An administrator connects it once for everybody: the
 * provider, the model and an API key (ac-adm-ai-central). The key is sealed by
 * the server and never handed back to a browser, which only ever reads its
 * last four characters (ac-adm-ai-key).
 */

export type AssistantProvider = 'anthropic' | 'openai';

/** A model offered for a provider, with a word on what it is good for (ac-adm-ai-central). */
export interface AssistantModel {
	readonly id: string;
	readonly label: string;
	readonly hint: string;
}

/**
 * The providers and the models each offers, the first one taken when none is
 * picked. Drawing a diagram from a few paragraphs is a short, structured task:
 * Sonnet does it well and quickly, which is why it comes first. Any other model
 * the provider serves can still be typed by its name.
 */
export const ASSISTANT_PROVIDERS = [
	{
		code: 'anthropic',
		label: 'Claude, by Anthropic',
		host: 'api.anthropic.com',
		models: [
			{ id: 'claude-sonnet-5-5', label: 'Sonnet 5.5', hint: 'Recommended: quick, and enough to draw a diagram well.' },
			{ id: 'claude-haiku-5-5', label: 'Haiku 5.5', hint: 'The fastest and the cheapest, for simple changes.' },
			{ id: 'claude-opus-5-5', label: 'Opus 5.5', hint: 'More careful on long texts, and dearer.' },
			{ id: 'claude-fable-5-1', label: 'Fable 5.1', hint: 'The most capable, and the most expensive.' }
		]
	},
	{
		code: 'openai',
		label: 'OpenAI',
		host: 'api.openai.com',
		models: [{ id: 'gpt-5.5', label: 'GPT-5.5', hint: 'The model OpenAI recommends for the API.' }]
	}
] as const satisfies readonly { code: AssistantProvider; label: string; host: string; models: readonly AssistantModel[] }[];

export const isAssistantProvider = (v: unknown): v is AssistantProvider =>
	typeof v === 'string' && ASSISTANT_PROVIDERS.some((p) => p.code === v);

export const providerOf = (code: AssistantProvider) => ASSISTANT_PROVIDERS.find((p) => p.code === code)!;

export type AssistantTest = 'untested' | 'works' | 'failed';

/** Why the provider gave no usable answer, in the words the panel and the card say (ac-adm-ai-test). */
export type AssistantFailure = 'key_refused' | 'forbidden' | 'model_unknown' | 'quota' | 'overloaded' | 'unreachable' | 'declined' | 'other';

/** What any browser may read about the assistant: everything but the key. */
export interface AssistantSettings {
	readonly enabled: boolean;
	readonly provider: AssistantProvider;
	/** The model asked; empty means the provider's default for the assistant. */
	readonly model: string;
	/** The key's last four characters, null while no key is stored. */
	readonly keyHint: string | null;
	readonly test: AssistantTest;
	/** What the last test said in words, when it failed. */
	readonly testDetail: string | null;
	readonly testedAt: string | null;
	readonly updatedAt: string | null;
	readonly updatedBy: string | null;
}

/** What the server stores: the settings and the key, sealed. */
export interface StoredAssistant extends AssistantSettings {
	readonly sealedKey: string | null;
}

export function defaultStoredAssistant(): StoredAssistant {
	return {
		enabled: false,
		provider: 'anthropic',
		model: '',
		keyHint: null,
		sealedKey: null,
		test: 'untested',
		testDetail: null,
		testedAt: null,
		updatedAt: null,
		updatedBy: null
	};
}

const textOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/** Coerce a stored document into valid settings; the switch never reads as on without a key. */
export function normalizeStoredAssistant(input: unknown): StoredAssistant {
	if (!input || typeof input !== 'object') return defaultStoredAssistant();
	const o = input as Record<string, unknown>;
	const sealedKey = textOrNull(o.sealedKey);
	return {
		enabled: o.enabled === true && sealedKey !== null,
		provider: isAssistantProvider(o.provider) ? o.provider : 'anthropic',
		model: typeof o.model === 'string' ? o.model.trim() : '',
		keyHint: sealedKey === null ? null : textOrNull(o.keyHint),
		sealedKey,
		test: o.test === 'works' || o.test === 'failed' ? o.test : 'untested',
		testDetail: textOrNull(o.testDetail),
		testedAt: textOrNull(o.testedAt),
		updatedAt: textOrNull(o.updatedAt),
		updatedBy: textOrNull(o.updatedBy)
	};
}

/** The settings a browser reads: the sealed key never leaves the server (ac-adm-ai-key). */
export function assistantView(stored: StoredAssistant): AssistantSettings {
	const { sealedKey, ...view } = stored;
	void sealedKey;
	return view;
}

/** Whether the people who may write can ask the assistant for anything. */
export const assistantAvailable = (s: Pick<AssistantSettings, 'enabled' | 'keyHint'>): boolean => s.enabled && s.keyHint !== null;

/** The model the assistant asks: the one set, or the provider's default. */
export const modelOf = (s: Pick<AssistantSettings, 'provider' | 'model'>): string => s.model || defaultModelOf(s.provider);

/** The model taken when none is picked: the first one the provider offers. */
export const defaultModelOf = (provider: AssistantProvider): string => providerOf(provider).models[0].id;

/** The offered model a name stands for, or null when it was typed. */
export const offeredModel = (provider: AssistantProvider, model: string): AssistantModel | null =>
	(providerOf(provider).models as readonly AssistantModel[]).find((m) => m.id === model) ?? null;

/** The only part of a key a browser ever sees. */
export const keyHintOf = (key: string): string => `…${key.trim().slice(-4)}`;

export type AssistantChange = { readonly ok: true; readonly stored: StoredAssistant } | { readonly ok: false; readonly reason: string };

interface Stamp {
	readonly at: string;
	readonly by: string;
}

/**
 * Connect the assistant: the provider, the model, and a key that replaces the
 * stored one when given. A first connection carries its key. A changed
 * connection is untested until somebody tests it.
 */
export function connectAssistant(
	current: StoredAssistant,
	input: { readonly provider: AssistantProvider; readonly model: string; readonly key: { readonly sealed: string; readonly hint: string } | null },
	stamp: Stamp
): AssistantChange {
	if (input.key === null && current.sealedKey === null) return { ok: false, reason: 'Paste an API key: none is stored yet.' };
	return {
		ok: true,
		stored: {
			...current,
			provider: input.provider,
			model: input.model.trim(),
			sealedKey: input.key?.sealed ?? current.sealedKey,
			keyHint: input.key?.hint ?? current.keyHint,
			test: 'untested',
			testDetail: null,
			testedAt: null,
			updatedAt: stamp.at,
			updatedBy: stamp.by
		}
	};
}

/** Switch the assistant on or off for everybody; on needs a connection. */
export function switchAssistant(current: StoredAssistant, on: boolean, stamp: Stamp): AssistantChange {
	if (on && current.sealedKey === null) return { ok: false, reason: 'Connect it first: the provider, the model and an API key.' };
	return { ok: true, stored: { ...current, enabled: on, updatedAt: stamp.at, updatedBy: stamp.by } };
}

/** Delete the key, which switches the assistant off: the two never part. */
export function removeAssistantKey(current: StoredAssistant, stamp: Stamp): StoredAssistant {
	return { ...current, enabled: false, sealedKey: null, keyHint: null, test: 'untested', testDetail: null, testedAt: null, updatedAt: stamp.at, updatedBy: stamp.by };
}

/** Record what a test of the connection found. */
export function recordAssistantTest(current: StoredAssistant, outcome: { readonly works: boolean; readonly detail: string | null }, at: string): StoredAssistant {
	return { ...current, test: outcome.works ? 'works' : 'failed', testDetail: outcome.works ? null : outcome.detail, testedAt: at };
}

/** What a failure says, in plain words, never a status code alone (ac-adm-ai-test). */
export function assistantFailureSentence(failure: AssistantFailure, context: { readonly provider: AssistantProvider; readonly model: string; readonly detail?: string }): string {
	const provider = providerOf(context.provider);
	switch (failure) {
		case 'key_refused':
			return `${provider.label} refused the API key: check it, or paste a new one.`;
		case 'forbidden':
			return `The key may not use this model: check what its ${context.provider === 'anthropic' ? 'Console organisation' : 'project'} allows.`;
		case 'model_unknown':
			return `${provider.label} does not know the model "${context.model}", or the key may not use it.`;
		case 'quota':
			return `The key is out of credits or quota, or the provider asks to slow down: check its billing, or try again later.`;
		case 'overloaded':
			return `${provider.label} is overloaded right now: try again in a moment.`;
		case 'unreachable':
			return `${provider.label} could not be reached from the server: it must be allowed to call ${provider.host}.`;
		case 'declined':
			return 'The model declined to answer this request.';
		case 'other':
			return `${provider.label} answered with an error${context.detail ? `: ${context.detail}` : '.'}`;
	}
}
