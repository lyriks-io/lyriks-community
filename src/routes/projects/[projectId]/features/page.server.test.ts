import { isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { load } from './+page.server';

/** Runs the load far enough to see where it sends the reader; the redirect fires before any service is read. */
async function landingOf(path: string): Promise<{ status: number; location: string }> {
	const url = new URL(path, 'http://lyriks.test');
	try {
		await load({ params: { projectId: 'p-1' }, url, depends: () => {} } as unknown as Parameters<typeof load>[0]);
	} catch (thrown) {
		if (isRedirect(thrown)) return { status: thrown.status, location: thrown.location };
		throw thrown;
	}
	throw new Error('the load did not redirect');
}

describe('a link kept from the Evolution tab of Features', () => {
	it('opens the Evolution page on the board', async () => {
		expect(await landingOf('/projects/p-1/features?tab=evolution')).toEqual({
			status: 308,
			location: '/projects/p-1/evolution'
		});
	});

	it('opens the Evolution page on the same request and place', async () => {
		const { location } = await landingOf('/projects/p-1/features?tab=evolution&request=req-9&at=proposal__x');
		expect(location).toBe('/projects/p-1/evolution?request=req-9&at=proposal__x');
	});
});
