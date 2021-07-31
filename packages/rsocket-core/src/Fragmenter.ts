import {
  Flags,
  FrameTypes,
  Lengths,
  Payload,
  PayloadFrame,
  RequestChannelFrame,
  RequestFnfFrame,
  RequestResponseFrame,
  RequestStreamFrame,
} from "@rsocket/rsocket-types";

export function isFragmentable(
  payload: Payload,
  fragmentSize: number,
  frameType:
    | FrameTypes.PAYLOAD
    | FrameTypes.REQUEST_FNF
    | FrameTypes.REQUEST_RESPONSE
    | FrameTypes.REQUEST_STREAM
    | FrameTypes.REQUEST_CHANNEL
): boolean {
  if (fragmentSize === 0) {
    return false;
  }
  return (
    payload.data.byteLength +
      (payload.metadata ? payload.metadata.byteLength + Lengths.METADATA : 0) +
      (frameType == FrameTypes.REQUEST_STREAM ||
      frameType == FrameTypes.REQUEST_CHANNEL
        ? Lengths.REQUEST
        : 0) >
    fragmentSize
  );
}

export function* fragment(
  streamId: number,
  payload: Payload,
  fragmentSize: number,
  frameType:
    | FrameTypes.PAYLOAD
    | FrameTypes.REQUEST_FNF
    | FrameTypes.REQUEST_RESPONSE,
  isComplete: boolean = false
): Generator<PayloadFrame | RequestFnfFrame | RequestResponseFrame> {
  const length = payload.data.byteLength + payload.metadata?.byteLength;
  let firstFrame = frameType !== FrameTypes.PAYLOAD;
  let metadataPosition = 0;
  let dataPosition = 0;
  while (dataPosition + metadataPosition < length) {
    let remaining = fragmentSize;
    let metadata: Buffer;

    if (payload.metadata && metadataPosition < payload.metadata.byteLength) {
      const nextMetadataPosition = Math.min(
        payload.metadata.byteLength - metadataPosition,
        remaining
      );

      metadata = payload.data.slice(metadataPosition, nextMetadataPosition);
      remaining -= metadata.byteLength + Lengths.METADATA;
      metadataPosition = nextMetadataPosition;

      if (!remaining && dataPosition + metadataPosition < length) {
        if (firstFrame) {
          firstFrame = false;
          yield {
            type: frameType,
            flags: Flags.FOLLOWS | Flags.METADATA,
            data: null,
            metadata,
            streamId,
          };
        } else {
          yield {
            type: FrameTypes.PAYLOAD,
            flags: Flags.FOLLOWS | Flags.NEXT | Flags.METADATA,
            data: null,
            metadata,
            streamId,
          };
        }
        continue;
      }
    }

    let data: Buffer;
    if (dataPosition < payload.data.byteLength) {
      const nextDataPosition = Math.min(
        payload.data.byteLength - dataPosition,
        remaining
      );

      data = payload.data.slice(dataPosition, nextDataPosition);
      remaining -= data.byteLength;
      dataPosition = nextDataPosition;
    }

    if (remaining || dataPosition + metadataPosition >= length) {
      return {
        type: FrameTypes.PAYLOAD,
        flags:
          Flags.NEXT |
          (isComplete ? Flags.COMPLETE : 0) |
          (metadata ? Flags.METADATA : 0),
        data,
        metadata,
        streamId,
      };
    }

    if (firstFrame) {
      firstFrame = false;
      yield {
        type: frameType,
        flags: Flags.FOLLOWS | (metadata ? Flags.METADATA : 0),
        data,
        metadata,
        streamId,
      };
    } else {
      yield {
        type: FrameTypes.PAYLOAD,
        flags: Flags.FOLLOWS | Flags.NEXT | (metadata ? Flags.METADATA : 0),
        data,
        metadata,
        streamId,
      };
    }
  }
  //   Object.defineProperty(payload, Symbol.iterator, {
  //     value: payload,
  //     writable: false,
  //   });
  //   Object.defineProperty(payload, "next", {
  //     value: (function() {

  //     }).bind,
  //     writable: false,
  //   });
  //   return {
  //     [Symbol.iterator]: function () {
  //       return this;
  //     },
  //     next: () => {
  //       return {
  //         done: false,
  //         value: ({
  //           type: FrameTypes.PAYLOAD,
  //         } as unknown) as PayloadFrame,
  //       };
  //     },
  //   };
}

export function* fragmentWithRequestN(
  streamId: number,
  payload: Payload,
  fragmentSize: number,
  frameType: FrameTypes.REQUEST_STREAM | FrameTypes.REQUEST_CHANNEL,
  requestN: number,
  isComplete: boolean = false
): Generator<PayloadFrame | RequestStreamFrame | RequestChannelFrame> {
  const length = payload.data.byteLength + payload.metadata?.byteLength;
  let firstFrame = true;
  let metadataPosition = 0;
  let dataPosition = 0;
  while (dataPosition + metadataPosition < length) {
    let remaining = fragmentSize - (firstFrame ? Lengths.REQUEST : 0);
    let metadata: Buffer;

    if (payload.metadata && metadataPosition < payload.metadata.byteLength) {
      const nextMetadataPosition = Math.min(
        payload.metadata.byteLength - metadataPosition,
        remaining
      );

      metadata = payload.data.slice(metadataPosition, nextMetadataPosition);
      remaining -= metadata.byteLength + Lengths.METADATA;
      metadataPosition = nextMetadataPosition;

      if (!remaining && dataPosition + metadataPosition < length) {
        if (firstFrame) {
          firstFrame = false;
          yield {
            type: frameType,
            flags: Flags.FOLLOWS | Flags.METADATA,
            requestN,
            data: null,
            metadata,
            streamId,
          };
        } else {
          yield {
            type: FrameTypes.PAYLOAD,
            flags: Flags.FOLLOWS | Flags.NEXT | Flags.METADATA,
            data: null,
            metadata,
            streamId,
          };
        }
        continue;
      }
    }

    let data: Buffer;
    if (dataPosition < payload.data.byteLength) {
      const nextDataPosition = Math.min(
        payload.data.byteLength - dataPosition,
        remaining
      );

      data = payload.data.slice(dataPosition, nextDataPosition);
      remaining -= data.byteLength;
      dataPosition = nextDataPosition;
    }

    if (remaining || dataPosition + metadataPosition >= length) {
      return {
        type: FrameTypes.PAYLOAD,
        flags:
          Flags.NEXT |
          (isComplete ? Flags.COMPLETE : 0) |
          (metadata ? Flags.METADATA : 0),
        data,
        metadata,
        streamId,
      };
    }

    if (firstFrame) {
      firstFrame = false;
      yield {
        type: frameType,
        flags: Flags.FOLLOWS | (metadata ? Flags.METADATA : 0),
        requestN,
        data,
        metadata,
        streamId,
      };
    } else {
      yield {
        type: FrameTypes.PAYLOAD,
        flags: Flags.FOLLOWS | Flags.NEXT | (metadata ? Flags.METADATA : 0),
        data,
        metadata,
        streamId,
      };
    }
  }
  //   Object.defineProperty(payload, Symbol.iterator, {
  //     value: payload,
  //     writable: false,
  //   });
  //   Object.defineProperty(payload, "next", {
  //     value: (function() {

  //     }).bind,
  //     writable: false,
  //   });
  //   return {
  //     [Symbol.iterator]: function () {
  //       return this;
  //     },
  //     next: () => {
  //       return {
  //         done: false,
  //         value: ({
  //           type: FrameTypes.PAYLOAD,
  //         } as unknown) as PayloadFrame,
  //       };
  //     },
  //   };
}
