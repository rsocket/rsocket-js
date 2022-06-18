import { encodeCustomMetadataHeader } from "rsocket-composite-metadata";
import { hex } from "./test-utils/hex";

describe("encodeCustomMetadataHeader", () => {
  it("throws if length is less than 1", () => {
    expect(() => encodeCustomMetadataHeader("", 0)).toThrow(
      "Custom mime type must have a strictly positive length that fits on 7 unsigned bits, ie 1-128"
    );
  });

  it("throws if length is greater than 127", () => {
    let mime = "";
    while (mime.length < 130) {
      mime += "a";
    }
    expect(() => encodeCustomMetadataHeader(mime, mime.length)).toThrow(
      "Custom mime type must have a strictly positive length that fits on 7 unsigned bits, ie 1-128"
    );
  });

  it("encodes the header as per spec", () => {
    const { t, e, s } = hex;
    const mime = "test";
    // length minus 1 (uint8)
    const expectedLength8 = "03";
    // full length (uint24)
    const expectedLength24 = "000004";
    const header = encodeCustomMetadataHeader(mime, mime.length);
    expect(header.toString("hex")).toBe(
      `${expectedLength8}${t}${e}${s}${t}${expectedLength24}`
    );
  });
});
