import { TFrame } from "@rsocket/rsocket-types";
import { FRAME_TYPES } from "../RSocketFrame";
import SetupFrameSerializer from "./SetupFrameSerializer";
import IFrameSerializer from "./IFrameSerializer";

export default class BufferFrameSerializer {
  private serializers: Map<number, IFrameSerializer<TFrame>>;

  constructor() {
    this.serializers = new Map();
    this.registerSerializer(
      FRAME_TYPES.SETUP,
      new SetupFrameSerializer(Buffer)
    );
  }

  serializeFrameWithLength(frame: TFrame): Buffer {
    return this.serializeFrame(frame);
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
