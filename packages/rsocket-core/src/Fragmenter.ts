import {
  Flags,
  FrameTypes,
  Lengths,
  PayloadFrame,
  RequestChannelFrame,
  RequestFnfFrame,
  RequestResponseFrame,
  RequestStreamFrame,
} from "./Frames";
import { Payload } from "./RSocket";

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
  const dataLength = payload.data?.byteLength ?? 0;

  let firstFrame = frameType !== FrameTypes.PAYLOAD;

  let remaining = fragmentSize;

  let metadata: Buffer;

  if (payload.metadata) {
    const metadataLength = payload.metadata.byteLength;

    if (metadataLength === 0) {
      remaining -= Lengths.METADATA;
      metadata = Buffer.allocUnsafe(0);
    } else {
      let metadataPosition = 0;
      if (firstFrame) {
        remaining -= Lengths.METADATA;
        const nextMetadataPosition = Math.min(
          metadataLength,
          metadataPosition + remaining
        );

        metadata = payload.metadata.slice(
          metadataPosition,
          nextMetadataPosition
        );
        remaining -= metadata.byteLength;
        metadataPosition = nextMetadataPosition;

        if (remaining === 0) {
          firstFrame = false;
          yield {
            type: frameType,
            flags: Flags.FOLLOWS | Flags.METADATA,
            data: undefined,
            metadata,
            streamId,
          };
          metadata = undefined;
          remaining = fragmentSize;
        }
      }

      while (metadataPosition < metadataLength) {
        remaining -= Lengths.METADATA;
        const nextMetadataPosition = Math.min(
          metadataLength,
          metadataPosition + remaining
        );

        metadata = payload.metadata.slice(
          metadataPosition,
          nextMetadataPosition
        );
        remaining -= metadata.byteLength;
        metadataPosition = nextMetadataPosition;

        if (remaining === 0 || dataLength === 0) {
          yield {
            type: FrameTypes.PAYLOAD,
            flags:
              Flags.NEXT |
              Flags.METADATA |
              (metadataPosition === metadataLength &&
              isComplete &&
              dataLength === 0
                ? Flags.COMPLETE
                : Flags.FOLLOWS),
            data: undefined,
            metadata,
            streamId,
          };
          metadata = undefined;
          remaining = fragmentSize;
        }
      }
    }
  }

  let dataPosition = 0;
  let data: Buffer;

  if (firstFrame) {
    const nextDataPosition = Math.min(dataLength, dataPosition + remaining);

    data = payload.data.slice(dataPosition, nextDataPosition);
    remaining -= data.byteLength;
    dataPosition = nextDataPosition;

    yield {
      type: frameType,
      flags: Flags.FOLLOWS | (metadata ? Flags.METADATA : Flags.NONE),
      data,
      metadata,
      streamId,
    };

    metadata = undefined;
    data = undefined;
    remaining = fragmentSize;
  }

  while (dataPosition < dataLength) {
    const nextDataPosition = Math.min(dataLength, dataPosition + remaining);

    data = payload.data.slice(dataPosition, nextDataPosition);
    remaining -= data.byteLength;
    dataPosition = nextDataPosition;

    yield {
      type: FrameTypes.PAYLOAD,
      flags:
        dataPosition === dataLength
          ? (isComplete ? Flags.COMPLETE : Flags.NONE) |
            Flags.NEXT |
            (metadata ? Flags.METADATA : 0)
          : Flags.FOLLOWS | Flags.NEXT | (metadata ? Flags.METADATA : 0),
      data,
      metadata,
      streamId,
    };

    metadata = undefined;
    data = undefined;
    remaining = fragmentSize;
  }
}

export function* fragmentWithRequestN(
  streamId: number,
  payload: Payload,
  fragmentSize: number,
  frameType: FrameTypes.REQUEST_STREAM | FrameTypes.REQUEST_CHANNEL,
  requestN: number,
  isComplete: boolean = false
): Generator<PayloadFrame | RequestStreamFrame | RequestChannelFrame> {
  const dataLength = payload.data?.byteLength ?? 0;

  let firstFrame = true;

  let remaining = fragmentSize;

  let metadata: Buffer;

  if (payload.metadata) {
    const metadataLength = payload.metadata.byteLength;

    if (metadataLength === 0) {
      remaining -= Lengths.METADATA;
      metadata = Buffer.allocUnsafe(0);
    } else {
      let metadataPosition = 0;
      if (firstFrame) {
        remaining -= Lengths.METADATA + Lengths.REQUEST;
        const nextMetadataPosition = Math.min(
          metadataLength,
          metadataPosition + remaining
        );

        metadata = payload.metadata.slice(
          metadataPosition,
          nextMetadataPosition
        );
        remaining -= metadata.byteLength;
        metadataPosition = nextMetadataPosition;

        if (remaining === 0) {
          firstFrame = false;
          yield {
            type: frameType,
            flags: Flags.FOLLOWS | Flags.METADATA,
            data: undefined,
            requestN,
            metadata,
            streamId,
          };
          metadata = undefined;
          remaining = fragmentSize;
        }
      }

      while (metadataPosition < metadataLength) {
        remaining -= Lengths.METADATA;
        const nextMetadataPosition = Math.min(
          metadataLength,
          metadataPosition + remaining
        );

        metadata = payload.metadata.slice(
          metadataPosition,
          nextMetadataPosition
        );
        remaining -= metadata.byteLength;
        metadataPosition = nextMetadataPosition;

        if (remaining === 0 || dataLength === 0) {
          yield {
            type: FrameTypes.PAYLOAD,
            flags:
              Flags.NEXT |
              Flags.METADATA |
              (metadataPosition === metadataLength &&
              isComplete &&
              dataLength === 0
                ? Flags.COMPLETE
                : Flags.FOLLOWS),
            data: undefined,
            metadata,
            streamId,
          };
          metadata = undefined;
          remaining = fragmentSize;
        }
      }
    }
  }

  let dataPosition = 0;
  let data: Buffer;

  if (firstFrame) {
    remaining -= Lengths.REQUEST;
    const nextDataPosition = Math.min(dataLength, dataPosition + remaining);

    data = payload.data.slice(dataPosition, nextDataPosition);
    remaining -= data.byteLength;
    dataPosition = nextDataPosition;

    yield {
      type: frameType,
      flags: Flags.FOLLOWS | (metadata ? Flags.METADATA : Flags.NONE),
      data,
      requestN,
      metadata,
      streamId,
    };

    metadata = undefined;
    data = undefined;
    remaining = fragmentSize;
  }

  while (dataPosition < dataLength) {
    const nextDataPosition = Math.min(dataLength, dataPosition + remaining);

    data = payload.data.slice(dataPosition, nextDataPosition);
    remaining -= data.byteLength;
    dataPosition = nextDataPosition;

    yield {
      type: FrameTypes.PAYLOAD,
      flags:
        dataPosition === dataLength
          ? (isComplete ? Flags.COMPLETE : Flags.NONE) |
            Flags.NEXT |
            (metadata ? Flags.METADATA : 0)
          : Flags.FOLLOWS | Flags.NEXT | (metadata ? Flags.METADATA : 0),
      data,
      metadata,
      streamId,
    };

    metadata = undefined;
    data = undefined;
    remaining = fragmentSize;
  }
}
