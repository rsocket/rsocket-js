import { Codec } from "rsocket-messaging";
import { RSocket } from "rsocket-core";
import {
  encodeCompositeMetadata,
  WellKnownMimeType,
} from "rsocket-composite-metadata";
import RSocketPublisherToPrefetchingAsyncIterable from "../RSocketPublisherToPrefetchingAsyncIterable";

export default function requestStream<TData, RData>(
  data: TData,
  inputCodec: Codec<TData>,
  outputCode: Codec<RData>,
  prefetch: number = 256
): (
  rsocket: RSocket,
  metadata: Map<string | number | WellKnownMimeType, Buffer>
) => AsyncIterable<any> {
  return function (
    rsocket: RSocket,
    metadata: Map<string | number | WellKnownMimeType, Buffer>
  ) {
    const exchangeFunction = (subscriber, initialRequestN) => {
      const payload = {
        data: data ? inputCodec.encode(data) : Buffer.allocUnsafe(0),
        metadata: encodeCompositeMetadata(metadata),
      };
      return rsocket.requestStream(payload, initialRequestN, subscriber);
    };

    return new RSocketPublisherToPrefetchingAsyncIterable(
      exchangeFunction,
      prefetch,
      outputCode
    );
  };
}
