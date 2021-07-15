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
  encode(value: TEncodable, buffer: Buffer, start: number, end: number): number;
  decode(buffer: Buffer, start: number, end: number): TEncodable;
}

export type EncodingTypes = "ascii" | "base64" | "hex" | "utf8";
