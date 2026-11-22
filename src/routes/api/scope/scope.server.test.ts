import { describe, expect, it } from 'vitest';
import { GET } from './+server';
import { requestEvent, servicesWith } from '$lib/server/request-event.fixture';

const scopeOf = async (edition: string | undefined) =>
	(await GET(requestEvent({ path: '/api/scope', services: servicesWith({ installEdition: () => edition }) }) as never)).json();

/** What the MCP gateway reads to offer an AI client the tools the installation answers (EVO-001, EVO-008). */
describe('GET /api/scope', () => {
	it('says Community locks Evolution requests, with the sentence the server refuses them with [criterion:ac-leaf-7de9e4dc-80a7-4b51-9547-2d7137969c40]', async () => {
		expect(await scopeOf('community')).toEqual({
			edition: 'community',
			evolutions: false,
			refusal: { message: 'Evolutions are available from the Solo Builder plan. Upgrade to keep building.', detail: 'See https://lyriks.io/pricing.', plan: 'solo_builder' }
		});
	});

	it('opens them on every other edition, and on an installation that declares none', async () => {
		expect(await scopeOf('enterprise')).toEqual({ edition: 'enterprise', evolutions: true });
		expect(await scopeOf(undefined)).toEqual({ edition: null, evolutions: true });
	});
});
