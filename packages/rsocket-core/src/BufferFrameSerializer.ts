import { TFrame } from "@rsocket/rsocket-types";
import { FRAME_TYPES } from "./RSocketFrame";

type TSerializer = (frame: TFrame) => Buffer;

function createBuffer(length: number): Buffer {
  return Buffer.alloc(length);
}

function serializeSetupFrame(frame: TFrame): Buffer {
  return createBuffer(0);
}

export default class BufferFrameSerializer {
  private serializers: Map<number, TSerializer>;

  constructor() {
    this.serializers = new Map();
    this.serializers.set(FRAME_TYPES.SETUP, serializeSetupFrame);
  }

  serializeFrameWithLength(frame: TFrame): Buffer {
    return this.serializeFrame(frame);
  }

  private serializeFrame(frame: TFrame) {
    const serializer = this.serializers.get(frame.type);
    return serializer(frame);
  }
}
