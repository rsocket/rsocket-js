import { Codec } from "@rsocket/messaging";
import { RSocket } from "@rsocket/core";
import {
  encodeCompositeMetadata,
  WellKnownMimeType,
} from "@rsocket/composite-metadata";

export default function fireAndForget<TData>(
  data: TData,
  inputCodec: Codec<TData>
): (
  rsocket: RSocket,
  metadata: Map<string | number | WellKnownMimeType, Buffer>
) => Promise<void> {
  return (
    rsocket: RSocket,
    metadata: Map<string | number | WellKnownMimeType, Buffer>
  ) => {
    const payload = {
      data: data ? inputCodec.encode(data) : Buffer.allocUnsafe(0),
      metadata: encodeCompositeMetadata(metadata),
    };
    return new Promise((resolve, reject) => {
      rsocket.fireAndForget(payload, {
        onComplete(): void {
          resolve();
        },
        onError(error: Error): void {
          reject(error);
        },
      });
    });
  };
}
