import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Liveness probe: the process is up and the event loop responds. Cheap and
 * dependency-free — an orchestrator restarts the container if this stops
 * answering. Unauthenticated (exempted in hooks).
 */
export const GET: RequestHandler = () => json({ status: 'ok' });
