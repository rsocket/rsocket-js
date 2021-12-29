import {
  Cancellable,
  FrameTypes,
  OnTerminalSubscriber,
  Payload,
} from "@rsocket/core";
import { Codec } from "@rsocket/messaging";

export default function fireAndForget<IN>(
  handler: (data: IN) => Promise<void>,
  codec: Codec<IN>
): ((p: Payload, s: OnTerminalSubscriber) => Cancellable) & {
  requestType: FrameTypes.REQUEST_FNF;
} {
  return Object.assign<
    (p: Payload, s: OnTerminalSubscriber) => Cancellable,
    { requestType: FrameTypes.REQUEST_FNF }
  >(
    (p: Payload, s: OnTerminalSubscriber) => {
      handler(codec.decode(p.data));
      return {
        cancel() {},
      };
    },
    { requestType: FrameTypes.REQUEST_FNF }
  );
}
