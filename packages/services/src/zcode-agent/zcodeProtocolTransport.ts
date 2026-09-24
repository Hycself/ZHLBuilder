import type { Event, IDisposable } from "@zhlbuilder/rpc";
import type { ZCodeProtocolMessage } from "@zhlbuilder/shared";

export type ZCodeProtocolTransportKind = "stdio" | "websocket" | "memory";

export interface ZCodeProtocolTransportClosedEvent {
  code?: number | null;
  signal?: NodeJS.Signals | null;
  reason?: string;
}

export interface ZCodeProtocolTransport extends IDisposable {
  readonly kind: ZCodeProtocolTransportKind;
  readonly onMessage: Event<ZCodeProtocolMessage>;
  readonly onClose: Event<ZCodeProtocolTransportClosedEvent>;
  send(message: ZCodeProtocolMessage): Promise<void>;
  disposeAndWait?(): Promise<void>;
}
