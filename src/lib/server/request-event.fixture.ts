import type { Cookies, RequestEvent } from '@sveltejs/kit';
import type { AppServices } from '$composition/container.server';
import type { Session } from '$application/ports';

/**
 * Test doubles for the request layer: a cookie jar that remembers what a handler
 * set or deleted, a SvelteKit request event around it, and the composition root
 * reduced to the services a test names.
 */

export interface CookieWrite {
	readonly name: string;
	readonly value: string;
	readonly opts: Parameters<Cookies['set']>[2];
}

export interface CookieJar extends Cookies {
	readonly sets: CookieWrite[];
	readonly deletes: Array<{ readonly name: string; readonly opts: Parameters<Cookies['delete']>[1] }>;
}

export function cookieJar(initial: Record<string, string> = {}): CookieJar {
	const values = new Map(Object.entries(initial));
	const sets: CookieWrite[] = [];
	const deletes: CookieJar['deletes'] = [];
	return {
		sets,
		deletes,
		get: (name) => values.get(name),
		getAll: () => [...values].map(([name, value]) => ({ name, value })),
		set: (name, value, opts) => {
			sets.push({ name, value, opts });
			values.set(name, value);
		},
		delete: (name, opts) => {
			deletes.push({ name, opts });
			values.delete(name);
		},
		serialize: (name, value) => `${name}=${value}`
	};
}

/** A service as a test fakes it: a function whole, an object by the public members the test needs. */
export type FakeOf<T> = T extends (...args: never[]) => unknown ? T : T extends object ? { [M in keyof T]?: T[M] } : T;

/** The composition root as a test fakes it: only the services it names, each typed against the real one. */
export type FakeServices = { [K in keyof AppServices]?: FakeOf<AppServices[K]> };

/**
 * The composition root holding only `parts`. Reaching for any other service
 * throws, so a test fails loudly when the code under test asks for something the
 * test did not decide.
 */
export function servicesWith(parts: FakeServices): AppServices {
	return new Proxy(parts, {
		get(target, name) {
			if (typeof name === 'symbol' || name === 'then') return undefined;
			if (name in target) return target[name as keyof FakeServices];
			throw new Error(`services.${name} was reached but this test did not provide it`);
		}
	}) as unknown as AppServices;
}

export interface EventInit {
	readonly path?: string;
	readonly method?: string;
	readonly headers?: Record<string, string>;
	readonly body?: BodyInit;
	readonly cookies?: Record<string, string>;
	readonly params?: Record<string, string>;
	readonly services?: AppServices;
	readonly authRequired?: boolean;
	readonly session?: Session;
	readonly origin?: string;
}

/**
 * A request event every route handler accepts. The generated route types pin
 * `params` and `route.id` to one route, which a fixture shared by all routes
 * cannot name, so those two are typed to fit any of them.
 */
export type TestEvent = Omit<RequestEvent, 'params' | 'route' | 'cookies'> & {
	params: never;
	route: { id: never };
	readonly cookies: CookieJar;
};

/** A request event as SvelteKit hands it to a hook, a server route or a form action. */
export function requestEvent(init: EventInit = {}): TestEvent {
	const url = new URL(init.path ?? '/', init.origin ?? 'https://lyriks.test');
	const request = new Request(url, { method: init.method ?? 'GET', headers: init.headers, body: init.body });
	const locals = {} as App.Locals;
	if (init.services) locals.services = init.services;
	if (init.authRequired !== undefined) locals.authRequired = init.authRequired;
	if (init.session) locals.session = init.session;
	return {
		url,
		request,
		locals,
		params: (init.params ?? {}) as never,
		cookies: cookieJar(init.cookies),
		route: { id: null as never },
		platform: undefined,
		isDataRequest: false,
		isSubRequest: false,
		isRemoteRequest: false,
		getClientAddress: () => '10.0.0.1',
		setHeaders: () => {},
		fetch: () => Promise.reject(new Error('this test makes no outbound request')),
		tracing: { enabled: false, root: undefined as never, current: undefined as never }
	};
}
