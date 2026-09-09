import type { TelemetryEvent, TelemetryPort } from '$application/ports';

/**
 * Dev/stub telemetry sink: prints events to the server log. A real Segment
 * adapter would implement the same TelemetryPort and forward to the stream.
 */
export class ConsoleTelemetry implements TelemetryPort {
	emit(event: TelemetryEvent): void {
		console.info(`[telemetry] ${event.type}`, event);
	}
}
