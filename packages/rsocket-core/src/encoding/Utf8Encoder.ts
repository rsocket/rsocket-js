import { EncodingTypes, IEncoder, TEncodable } from "./EncodingTypes";
import { Encoder } from "./Encoder";

export class Utf8Encoder extends Encoder implements IEncoder {
  private encoding: EncodingTypes = "utf8";

  constructor(bufferImpl?: typeof Buffer) {
    super(bufferImpl);
  }

  public byteLength(value: TEncodable): number {
    return super.byteLengthWithEncoding(value, this.encoding);
  }

  decode(buffer: Buffer, start: number, end: number): TEncodable {
    return undefined;
  }

  encode(
    value: TEncodable,
    buffer: Buffer,
    start: number,
    end: number
  ): number {
    return buffer.write(value as string, start, end - start, this.encoding);
  }
}
