import { Codec } from "rsocket-messaging";
import { Payload, RSocket } from "rsocket-core";
import {
  encodeCompositeMetadata,
  WellKnownMimeType,
} from "rsocket-composite-metadata";

export default function requestResponse<TData, RData>(
  data: TData,
  inputCodec: Codec<TData>,
  outputCodec: Codec<RData>
): (
  rsocket: RSocket,
  metadata: Map<string | number | WellKnownMimeType, Buffer>
) => Promise<RData> {
  return (
    rsocket: RSocket,
    metadata: Map<string | number | WellKnownMimeType, Buffer>
  ) => {
    const isEmpty = data === undefined || data === null;
    const payload = {
      data: isEmpty ? Buffer.allocUnsafe(0) : inputCodec.encode(data),
      metadata: encodeCompositeMetadata(metadata),
    };
    return new Promise((resolve, reject) => {
      rsocket.requestResponse(payload, {
        onNext(payload: Payload): void {
          resolve(outputCodec.decode(payload.data));
        },
        onComplete(): void {
          resolve(null);
        },
        onError(error: Error): void {
          reject(error);
        },
        onExtension(
          extendedType: number,
          content: Buffer | null | undefined,
          canBeIgnored: boolean
        ): void {},
      });
    });
  };
}
