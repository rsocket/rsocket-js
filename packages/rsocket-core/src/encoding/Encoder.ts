import { EncodingTypes, TEncodable } from "./EncodingTypes";

export class Encoder {
  private bufferImpl: typeof Buffer;

  constructor(bufferImpl?: typeof Buffer) {
    this.bufferImpl = bufferImpl;
  }

  protected byteLengthWithEncoding(
    data: TEncodable,
    encoding: EncodingTypes
  ): number {
    return this.bufferImpl.byteLength(data, encoding);
  }
}
