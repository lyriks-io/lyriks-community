import { describe, it, expect } from 'vitest';
import { DB_ENGINES, HOST_KINDS, PROTOCOLS } from '$domain/data';
import {
	engineResourceKind,
	hostResourceScope,
	isResourceKind,
	isResourceScope,
	protocolCrossesNetwork,
	protocolResourceKind,
	protocolResourceScope,
	resourceKindLabel,
	resourceScopeLabel
} from './resource-vocabulary';

/**
 * The write side used to invent codes the kernel's enums do not contain
 * (`datastore`, `rpc_api`, `websocket`, `internal`), which render as a blank chip
 * in the behavior editor. Every Lyriks vocabulary must land inside the kernel's.
 */
describe('resource vocabulary', () => {
	it('maps every database engine to a kind the kernel defines', () => {
		for (const { code } of DB_ENGINES) {
			const kind = engineResourceKind[code];
			expect(isResourceKind(kind), `${code} → ${kind}`).toBe(true);
			expect(resourceKindLabel(kind)).not.toBe('');
		}
	});

	it('maps every host kind to a scope the kernel defines', () => {
		for (const { code } of HOST_KINDS) {
			const scope = hostResourceScope[code];
			expect(isResourceScope(scope), `${code} → ${scope}`).toBe(true);
			expect(resourceScopeLabel(scope)).not.toBe('');
		}
	});

	it('maps every interface protocol to a kind and scope the kernel defines', () => {
		for (const { code } of PROTOCOLS) {
			const kind = protocolResourceKind[code];
			const scope = protocolResourceScope[code];
			expect(isResourceKind(kind), `${code} → ${kind}`).toBe(true);
			expect(isResourceScope(scope), `${code} → ${scope}`).toBe(true);
		}
	});

	it('keeps the mappings that previously fell outside the kernel enums', () => {
		expect(engineResourceKind.other).toBe('other');
		expect(hostResourceScope.internal).toBe('local');
		expect(protocolResourceKind.grpc).toBe('http_api');
		expect(protocolResourceKind.websocket).toBe('event_stream');
		expect(protocolResourceKind.graphql).toBe('graphql_api');
	});

	it('does not call a non-network interface an API that leaves the machine', () => {
		for (const code of ['sdk', 'native', 'in-process'] as const) {
			expect(protocolResourceKind[code]).toBe('in_memory');
			expect(protocolResourceScope[code]).toBe('local');
			expect(protocolCrossesNetwork(code)).toBe(false);
		}
		for (const code of ['rest', 'graphql', 'grpc', 'queue'] as const) {
			expect(protocolCrossesNetwork(code)).toBe(true);
		}
	});

	it('renders an unknown code readably instead of dropping it', () => {
		expect(resourceKindLabel('quantum_blob')).toBe('quantum blob');
		expect(resourceScopeLabel('')).toBe('');
	});
});
