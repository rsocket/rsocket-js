// eslint-disable-next-line max-classes-per-file
export type TEncodable = string | Buffer | Uint8Array;

export type TEncoders = {
  data: IEncoder;
  dataMimeType: IEncoder;
  message: IEncoder;
  metadata: IEncoder;
  metadataMimeType: IEncoder;
  resumeToken: IEncoder;
};

export interface IEncoder {
  byteLength(value: TEncodable): number;

  /**
   * Write a value to a given buffer.
   * @param value The value to be written.
   * @param buffer The buffer to write the value to.
   * @param start The index to start writing the value to.
   * @param end The index to stop writing the value to.
   * @returns number The given index value used as "end".
   */
  encode(value: TEncodable, buffer: Buffer, start: number, end: number): number;
  decode(buffer: Buffer, start: number, end: number): TEncodable;
}

export type EncodingTypes = "ascii" | "base64" | "hex" | "utf8";
