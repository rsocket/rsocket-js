/* eslint-disable class-methods-use-this */
import { TSetupFrame } from "@rsocket/rsocket-types";
import { FLAGS, FLAGS_MASK, FRAME_TYPE_OFFFSET, isMetadata } from "../index";
import IFrameSerializer from "./IFrameSerializer";
import BufferSerializer from "./BufferSerializer";
import { TEncoders, Utf8Encoder } from "../encoding";
import { writeUInt24BE } from "../RSocketBufferUtils";

/**
 * Frame header is:
 * - stream id (uint32 = 4)
 * - type + flags (uint 16 = 2)
 */
const FRAME_HEADER_SIZE = 6;

/**
 * Size of frame length and metadata length fields.
 */
const UINT24_SIZE = 3;

const SETUP_FIXED_SIZE = 14;
const RESUME_TOKEN_LENGTH_SIZE = 2;

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
    const resumeTokenLength = 0;
    const metadataMimeTypeLength = 0;
    const dataMimeTypeLength = 0;
    const payloadLength = this.getPayloadLength(frame);
    const bufferLength =
      FRAME_HEADER_SIZE +
      SETUP_FIXED_SIZE +
      (RESUME_TOKEN_LENGTH_SIZE + resumeTokenLength) +
      metadataMimeTypeLength +
      dataMimeTypeLength +
      payloadLength;

    const buffer = this.bufferImpl.alloc(bufferLength);

    let offset: number = this.writeHeader(frame, buffer);

    offset = buffer.writeUInt16BE(frame.majorVersion, offset);
    offset = buffer.writeUInt16BE(frame.minorVersion, offset);
    offset = buffer.writeUInt32BE(frame.keepAlive, offset);
    offset = buffer.writeUInt32BE(frame.lifetime, offset);

    // eslint-disable-next-line no-bitwise
    if (frame.flags & FLAGS.RESUME_ENABLE) {
      offset = buffer.writeUInt16BE(resumeTokenLength, offset);
      if (frame.resumeToken != null) {
        offset = this.encoders.resumeToken.encode(
          frame.resumeToken,
          buffer,
          offset,
          offset + resumeTokenLength
        );
      }
    }

    offset = buffer.writeUInt8(dataMimeTypeLength, offset);
    if (frame.dataMimeType != null) {
      // TODO: need access to enbcoders
      offset = this.encoders.dataMimeType.encode(
        frame.dataMimeType,
        buffer,
        offset,
        offset + dataMimeTypeLength
      );
    }

    this.writePayload(frame, buffer, offset);

    return buffer;
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
