import { Codec } from "rsocket-messaging";
import {
  Cancellable,
  FrameTypes,
  OnExtensionSubscriber,
  OnNextSubscriber,
  OnTerminalSubscriber,
  Payload,
} from "rsocket-core";

export default function requestResponse<IN, OUT>(
  handler: (data: IN) => Promise<OUT>,
  codecs: {
    inputCodec: IN extends void | null | undefined ? undefined : Codec<IN>;
    outputCodec: OUT extends void | null | undefined ? undefined : Codec<OUT>;
  }
): ((
  p: Payload,
  s: OnTerminalSubscriber & OnNextSubscriber & OnExtensionSubscriber
) => Cancellable & OnExtensionSubscriber) & {
  requestType: FrameTypes.REQUEST_RESPONSE;
} {
  const handle = (
    p: Payload,
    s: OnTerminalSubscriber & OnNextSubscriber & OnExtensionSubscriber
  ) => {
    let cancelled = false;
    handler(codecs.inputCodec.decode(p.data))
      .then((value) => {
        if (cancelled) return;
        s.onNext({ data: codecs.outputCodec.encode(value) }, true);
      })
      .catch((e) => {
        if (cancelled) return;
        s.onError(e);
      });
    return {
      cancel() {
        cancelled = true;
      },
      onExtension() {},
    };
  };

  return Object.assign<
    (
      p: Payload,
      s: OnTerminalSubscriber & OnNextSubscriber & OnExtensionSubscriber
    ) => Cancellable & OnExtensionSubscriber,
    { requestType: FrameTypes.REQUEST_RESPONSE }
  >(handle, {
    requestType: FrameTypes.REQUEST_RESPONSE,
  });
}
