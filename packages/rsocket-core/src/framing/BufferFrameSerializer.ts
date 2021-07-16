import { TFrame } from "@rsocket/rsocket-types";
import { FRAME_TYPES } from "../RSocketFrame";
import SetupFrameSerializer from "./SetupFrameSerializer";
import IFrameSerializer from "./IFrameSerializer";
import { UINT24_SIZE } from "../constants";
import { writeUInt24BE } from "../RSocketBufferUtils";

export default class BufferFrameSerializer {
  private serializers: Map<number, IFrameSerializer<TFrame>>;
  private readonly bufferImpl: typeof Buffer = Buffer;

  constructor() {
    this.serializers = new Map();
    this.bufferImpl = Buffer;
    this.registerSerializer(
      FRAME_TYPES.SETUP,
      new SetupFrameSerializer(this.bufferImpl)
    );
  }

  serializeFrameWithLength(frame: TFrame): Buffer {
    const buffer = this.serializeFrame(frame);
    const lengthPrefixed = this.bufferImpl.alloc(buffer.length + UINT24_SIZE);
    writeUInt24BE(lengthPrefixed, buffer.length, 0);
    buffer.copy(lengthPrefixed, UINT24_SIZE, 0, buffer.length);
    return lengthPrefixed;
  }

  private serializeFrame(frame: TFrame) {
    const serializer = this.serializers.get(frame.type);
    return serializer.serialize(frame);
  }

  private registerSerializer(
    frameType: number,
    frameSerializer: IFrameSerializer<TFrame>
  ) {
    this.serializers.set(frameType, frameSerializer);
  }
}
