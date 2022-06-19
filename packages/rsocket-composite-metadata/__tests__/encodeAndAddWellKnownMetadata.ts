import {
  encodeAndAddWellKnownMetadata,
  WellKnownMimeType,
} from "rsocket-composite-metadata";
import { readUInt24BE } from "rsocket-core";

describe("encodeWellKnownMetadataHeader", () => {
  it("encodes the header as per spec when WellKnownMimeType given", () => {
    const metadata = encodeAndAddWellKnownMetadata(
      Buffer.from([]),
      WellKnownMimeType.MESSAGE_RSOCKET_MIMETYPE,
      Buffer.from("test")
    );

    // 122 | 128
    const maskedId = metadata.readUInt8(0);
    const length = readUInt24BE(metadata, 1);
    const value = metadata.slice(4, metadata.length);

    expect(maskedId).toBe(250);
    expect(length).toBe(4);
    expect(value.length).toBe(4);
    expect(value.toString("utf-8")).toBe("test");
  });

  it("encodes the header as per spec when identifier given", () => {
    const metadata = encodeAndAddWellKnownMetadata(
      Buffer.from([]),
      // MESSAGE_RSOCKET_MIMETYPE
      122,
      Buffer.from("test")
    );

    // 122 | 128
    const maskedId = metadata.readUInt8(0);
    const length = readUInt24BE(metadata, 1);
    const value = metadata.slice(4, metadata.length);

    expect(maskedId).toBe(250);
    expect(length).toBe(4);
    expect(value.length).toBe(4);
    expect(value.toString("utf-8")).toBe("test");
  });
});
