import { from } from "rxjs";
import { Codec } from "@rsocket/messaging";
import {
  Cancellable,
  FrameTypes,
  OnExtensionSubscriber,
  OnNextSubscriber,
  OnTerminalSubscriber,
  Payload,
  Requestable,
} from "@rsocket/core";
import { RxRespondersFactory } from "@rsocket/rxjs";
import { eachValueFrom } from "rxjs-for-await";

export default function requestChannel<IN, OUT>(
  handler: (dataStream: AsyncIterable<IN>) => AsyncIterable<OUT>,
  codecs: {
    inputCodec: Codec<IN>;
    outputCodec: Codec<OUT>;
  },
  prefetch: number = 256
): ((
  payload: Payload,
  initialRequestN: number,
  isCompleted: boolean,
  s: OnTerminalSubscriber &
    OnNextSubscriber &
    OnExtensionSubscriber &
    Requestable &
    Cancellable
) => OnTerminalSubscriber &
  OnNextSubscriber &
  OnExtensionSubscriber &
  Requestable &
  Cancellable) & {
  requestType: FrameTypes.REQUEST_CHANNEL;
} {
  return Object.assign<
    (
      payload: Payload,
      initialRequestN: number,
      isCompleted: boolean,
      s: OnTerminalSubscriber &
        OnNextSubscriber &
        OnExtensionSubscriber &
        Requestable &
        Cancellable
    ) => OnTerminalSubscriber &
      OnNextSubscriber &
      OnExtensionSubscriber &
      Requestable &
      Cancellable,
    {
      requestType: FrameTypes.REQUEST_CHANNEL;
    }
  >(
    (
      payload: Payload,
      initialRequestN: number,
      isCompleted: boolean,
      s: OnTerminalSubscriber &
        OnNextSubscriber &
        OnExtensionSubscriber &
        Requestable &
        Cancellable
    ) => {
      const subscriberFactory = RxRespondersFactory.requestChannel(
        ($in) => from(handler(eachValueFrom($in))),
        codecs,
        prefetch
      );

      return subscriberFactory(payload, initialRequestN, isCompleted, s);
    },
    {
      requestType: FrameTypes.REQUEST_CHANNEL,
    }
  );
}
