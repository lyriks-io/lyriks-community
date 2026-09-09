/**
 * Cross-cutting application event accepted by telemetry adapters. Individual
 * bounded contexts own their event names and payloads; the telemetry boundary
 * only requires a stable name plus serializable metadata.
 */
export interface TelemetryEvent {
	type: string;
	[key: string]: unknown;
}

/**
 * Outbound port for emitting domain events to an analytics sink (Segment in the
 * spec). Fire-and-forget — never block a user action on telemetry.
 */
export interface TelemetryPort {
	emit(event: TelemetryEvent): void;
}
