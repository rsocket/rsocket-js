import { Codec } from "rsocket-messaging";
import {
  Cancellable,
  FrameTypes,
  OnExtensionSubscriber,
  OnNextSubscriber,
  OnTerminalSubscriber,
  Payload,
  Requestable,
} from "rsocket-core";

export default function requestStream<IN, OUT>(
  handler: (data: IN) => AsyncIterable<OUT>,
  codecs: {
    inputCodec: IN extends void | null | undefined ? undefined : Codec<IN>;
    outputCodec: OUT extends void | null | undefined ? undefined : Codec<OUT>;
  }
): ((
  p: Payload,
  r: number,
  s: OnTerminalSubscriber & OnNextSubscriber & OnExtensionSubscriber
) => Cancellable & OnExtensionSubscriber & Requestable) & {
  requestType: FrameTypes.REQUEST_STREAM;
} {
  const handle = (
    p: Payload,
    r: number,
    s: OnTerminalSubscriber & OnNextSubscriber & OnExtensionSubscriber
  ) => {
    let cancelled = false;
    let produced = 0;
    let requested = r;

    (async () => {
      try {
        const iterable = handler(codecs.inputCodec.decode(p.data));
        for await (const value of iterable) {
          if (cancelled) {
            break;
          }
          produced++;
          const isComplete = produced === requested;
          s.onNext({ data: codecs.outputCodec.encode(value) }, isComplete);
          if (produced === requested) {
            break;
          }
        }
      } catch (e) {
        if (cancelled) return;
        s.onError(e);
      }
    })();

    return {
      cancel() {
        cancelled = true;
      },
      request(n) {
        requested += n;
      },
      onExtension() {},
    };
  };

  return Object.assign<
    (
      p: Payload,
      r: number,
      s: OnTerminalSubscriber & OnNextSubscriber & OnExtensionSubscriber
    ) => Cancellable & OnExtensionSubscriber & Requestable,
    { requestType: FrameTypes.REQUEST_STREAM }
  >(handle, {
    requestType: FrameTypes.REQUEST_STREAM,
  });
}
