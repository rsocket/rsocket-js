/* eslint-disable class-methods-use-this */
import { TSetupFrame } from "@rsocket/rsocket-types";
import { FLAGS, FLAGS_MASK, FRAME_TYPE_OFFFSET, isMetadata } from "../index";
import IFrameSerializer from "./IFrameSerializer";
import BufferSerializer from "./BufferSerializer";
import { TEncoders, Utf8Encoder } from "../encoding";
import { writeUInt24BE } from "../RSocketBufferUtils";
import {
  FRAME_HEADER_SIZE,
  RESUME_TOKEN_LENGTH_SIZE,
  SETUP_FIXED_SIZE,
} from "../constants";

type TFrameWithPayload = { data: any; flags: number; metadata: any };

export default class SetupFrameSerializer
  extends BufferSerializer
  implements IFrameSerializer<TSetupFrame> {
  private encoders: TEncoders;

  constructor(bufferImpl: typeof Buffer) {
    super(bufferImpl);

    // TODO: support configuration for encoders
    const utf8Encoder = new Utf8Encoder(bufferImpl);
    this.encoders = {
      data: utf8Encoder,
      dataMimeType: utf8Encoder,
      message: utf8Encoder,
      metadata: utf8Encoder,
      metadataMimeType: utf8Encoder,
      resumeToken: utf8Encoder,
    };
  }

  public serialize(frame: TSetupFrame): Buffer {
    const dataMimeTypeLength = this.getDataMimeTypeLength(frame);
    const metadataMimeTypeLength = this.getMetadataMimeTypeLength(frame);
    const payloadLength = this.getPayloadLength(frame);
    const resumeTokenLength = this.getResumeTokenLength(frame);
    const resumeTokenSize = resumeTokenLength
      ? RESUME_TOKEN_LENGTH_SIZE + resumeTokenLength
      : 0;

    const bufferLength =
      FRAME_HEADER_SIZE +
      SETUP_FIXED_SIZE +
      resumeTokenSize +
      metadataMimeTypeLength +
      dataMimeTypeLength +
      payloadLength;

    const buffer = this.bufferImpl.alloc(bufferLength);

    let offset: number = this.writeHeader(frame, buffer);

    offset = buffer.writeUInt16BE(frame.majorVersion, offset);
    offset = buffer.writeUInt16BE(frame.minorVersion, offset);
    offset = buffer.writeUInt32BE(frame.keepAlive, offset);
    offset = buffer.writeUInt32BE(frame.lifetime, offset);

    offset = this.writeResumeToken(frame, offset, buffer, resumeTokenLength);
    offset = this.WriteMetadataMimeType(
      offset,
      buffer,
      metadataMimeTypeLength,
      frame
    );
    offset = this.writeDataMimeType(offset, buffer, dataMimeTypeLength, frame);

    this.writePayload(frame, buffer, offset);

    return buffer;
  }

  private writeDataMimeType(
    offset: number,
    buffer,
    dataMimeTypeLength: number,
    frame: TSetupFrame
  ) {
    let nextOffset = buffer.writeUInt8(dataMimeTypeLength, offset);
    if (frame.dataMimeType != null) {
      const start = nextOffset;
      const end = nextOffset + dataMimeTypeLength;
      this.encoders.dataMimeType.encode(frame.dataMimeType, buffer, start, end);
      nextOffset = end;
    }
    return nextOffset;
  }

  private WriteMetadataMimeType(
    offset: number,
    buffer: Buffer,
    metadataMimeTypeLength: number,
    frame: TSetupFrame
  ) {
    let nextOffset = buffer.writeUInt8(metadataMimeTypeLength, offset);
    if (frame.metadataMimeType != null) {
      const start = nextOffset;
      const end = nextOffset + metadataMimeTypeLength;
      this.encoders.metadataMimeType.encode(
        frame.metadataMimeType,
        buffer,
        start,
        end
      );
      nextOffset = end;
    }
    return nextOffset;
  }

  private writeResumeToken(
    frame: TSetupFrame,
    offset: number,
    buffer,
    resumeTokenLength: number
  ) {
    let nextOffset = offset;
    // eslint-disable-next-line no-bitwise
    if (frame.flags & FLAGS.RESUME_ENABLE) {
      nextOffset = buffer.writeUInt16BE(resumeTokenLength, offset);
      if (frame.resumeToken != null) {
        const start = nextOffset;
        const end = nextOffset + resumeTokenLength;
        this.encoders.resumeToken.encode(frame.resumeToken, buffer, start, end);
        nextOffset = end;
      }
    }
    return nextOffset;
  }

  private getDataMimeTypeLength(frame: TSetupFrame) {
    return frame.dataMimeType != null
      ? this.encoders.dataMimeType.byteLength(frame.dataMimeType)
      : 0;
  }

  private getMetadataMimeTypeLength(frame: TSetupFrame) {
    return frame.metadataMimeType != null
      ? this.encoders.metadataMimeType.byteLength(frame.metadataMimeType)
      : 0;
  }

  private getResumeTokenLength(frame: TSetupFrame) {
    return frame.resumeToken != null
      ? this.encoders.resumeToken.byteLength(frame.resumeToken)
      : 0;
  }

  private getPayloadLength(frame: TFrameWithPayload): number {
    let length = 0;
    if (frame.data != null) {
      length += this.encoders.data.byteLength(frame.data);
    }
    return length;
  }

  deserialize(): TSetupFrame {
    return undefined;
  }

  /**
   * Write the header of the frame into the buffer.
   */
  private writeHeader(frame: TSetupFrame, buffer: Buffer) {
    const offset = buffer.writeInt32BE(frame.streamId, 0);
    // shift frame to high 6 bits, extract lowest 10 bits from flags
    return buffer.writeUInt16BE(
      // eslint-disable-next-line no-bitwise
      (frame.type << FRAME_TYPE_OFFFSET) | (frame.flags & FLAGS_MASK),
      offset
    );
  }

  /**
   * Write the payload of a frame into the given buffer. Only applies to frame
   * types that MAY have both metadata and data.
   */
  private writePayload(frame: TSetupFrame, buffer: any, offset: number) {
    if (isMetadata(frame.flags)) {
      if (frame.metadata != null) {
        const metadataLength = this.encoders.metadata.byteLength(
          frame.metadata
        );
        // eslint-disable-next-line no-param-reassign
        offset = writeUInt24BE(buffer, metadataLength, offset);
        // eslint-disable-next-line no-param-reassign
        offset = this.encoders.metadata.encode(
          frame.metadata,
          buffer,
          offset,
          offset + metadataLength
        );
      } else {
        // eslint-disable-next-line no-param-reassign
        offset = writeUInt24BE(buffer, 0, offset);
      }
    }
    if (frame.data != null) {
      this.encoders.data.encode(frame.data, buffer, offset, buffer.length);
    }
  }
}
