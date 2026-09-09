import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';

import type { SettingsRepositoryPort } from '$application/ports';
import {
	normalizeAiSettings,
	normalizeFeedbackSettings,
	type AiSettings,
	type FeedbackSettings
} from '$domain/settings';

/**
 * Filesystem adapter for `SettingsRepositoryPort`: one JSON document at
 * `data/settings.json`, one key per concern (`ai`, `feedback`). Single concern:
 * read/write the settings file; values are normalized through the domain so a
 * malformed/old file degrades to defaults. Writes merge over the current
 * document, so saving one concern never drops another.
 */
export class LocalFsSettingsRepository implements SettingsRepositoryPort {
	readonly #path: string;

	constructor(path = 'data/settings.json') {
		this.#path = resolve(path);
	}

	async loadAi(): Promise<AiSettings> {
		return normalizeAiSettings(this.#read().ai);
	}

	async saveAi(settings: AiSettings): Promise<void> {
		this.#write({ ...this.#read(), ai: normalizeAiSettings(settings) });
	}

	async loadFeedback(): Promise<FeedbackSettings> {
		return normalizeFeedbackSettings(this.#read().feedback);
	}

	async saveFeedback(settings: FeedbackSettings): Promise<void> {
		this.#write({ ...this.#read(), feedback: normalizeFeedbackSettings(settings) });
	}

	#read(): Record<string, unknown> {
		if (!existsSync(this.#path)) return {};
		try {
			const doc: unknown = JSON.parse(readFileSync(this.#path, 'utf8'));
			return doc && typeof doc === 'object' && !Array.isArray(doc)
				? (doc as Record<string, unknown>)
				: {};
		} catch {
			return {};
		}
	}

	#write(document: Record<string, unknown>): void {
		const dir = dirname(this.#path);
		if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
		const temporary = `${this.#path}.${process.pid}.${randomUUID()}.tmp`;
		try {
			writeFileSync(temporary, JSON.stringify(document, null, 2), {
				encoding: 'utf8',
				mode: 0o600
			});
			chmodSync(temporary, 0o600);
			renameSync(temporary, this.#path);
			chmodSync(this.#path, 0o600);
		} finally {
			rmSync(temporary, { force: true });
		}
	}
}
