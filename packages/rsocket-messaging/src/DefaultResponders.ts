import {
  Cancellable,
  FrameTypes,
  OnExtensionSubscriber,
  OnNextSubscriber,
  OnTerminalSubscriber,
  Payload,
  Requestable,
} from "rsocket-core";
import { Codec } from "./index";

export type DefaultResponderHandlerSignature<T> = (
  p: T,
  r: number,
  s: OnTerminalSubscriber & OnNextSubscriber & OnExtensionSubscriber
) => Cancellable & OnExtensionSubscriber & Requestable;

export function requestStream<T, R>(
  handler: DefaultResponderHandlerSignature<T>,
  codecs: {
    inputCodec: Codec<T>;
    outputCodec: Codec<R>;
  }
) {
  return Object.assign<
    DefaultResponderHandlerSignature<Payload>,
    { requestType: FrameTypes.REQUEST_STREAM }
  >(
    (payload, initialRequestN, subscriber) => {
      return handler(
        codecs.inputCodec.decode(payload.data),
        initialRequestN,
        subscriber
      );
    },
    { requestType: FrameTypes.REQUEST_STREAM }
  );
}
