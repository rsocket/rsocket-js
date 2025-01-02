import {
  encodeCompositeMetadata,
  WellKnownMimeType,
} from "@rsocket/composite-metadata";
import { readUInt24BE } from "@rsocket/core";

describe("encodeCompositeMetadata encodes the metadata", () => {
  describe("when given a map", () => {
    it("handles WellKnownMimeType instances as keys", () => {
      const metadata = new Map();
      metadata.set(
        WellKnownMimeType.MESSAGE_RSOCKET_MIMETYPE,
        Buffer.from("test")
      );

      const encoded = encodeCompositeMetadata(metadata);

      // 122 | 128
      const maskedId = encoded.readUInt8(0);
      const length = readUInt24BE(encoded, 1);
      const value = encoded.slice(4, encoded.length);

      expect(maskedId).toBe(250);
      expect(length).toBe(4);
      expect(value.length).toBe(4);
      expect(value.toString("utf-8")).toBe("test");
    });

    it("handles WellKnownMimeType identifiers as keys", () => {
      const metadata = new Map();
      metadata.set(122, Buffer.from("test"));

      const encoded = encodeCompositeMetadata(metadata);

      // 122 | 128
      const maskedId = encoded.readUInt8(0);
      const length = readUInt24BE(encoded, 1);
      const value = encoded.slice(4, encoded.length);

      expect(maskedId).toBe(250);
      expect(length).toBe(4);
      expect(value.length).toBe(4);
      expect(value.toString("utf-8")).toBe("test");
    });

    it("handles custom mimetypes as keys", () => {
      const metadata = new Map();
      metadata.set("custom", Buffer.from("test"));

      const encoded = encodeCompositeMetadata(metadata);

      const mimeTypeLengthMinusOne = encoded.readUInt8(0);
      const start = 1;
      const end = mimeTypeLengthMinusOne + 2;
      const mimeType = encoded.slice(start, end);
      const metadataLength = readUInt24BE(encoded, mimeTypeLengthMinusOne + 2);
      const metadataValue = encoded.slice(encoded.length - metadataLength);

      expect(mimeTypeLengthMinusOne).toBe(5);
      expect(mimeType.toString("utf-8")).toBe("custom");
      expect(metadataLength).toBe(4);
      expect(metadataValue.toString("utf-8")).toBe("test");
    });

    it("handles mimetype value as function", () => {
      const metadata = new Map();
      metadata.set("custom", () => Buffer.from("test"));

      const encoded = encodeCompositeMetadata(metadata);

      const mimeTypeLengthMinusOne = encoded.readUInt8(0);
      const start = 1;
      const end = mimeTypeLengthMinusOne + 2;
      const mimeType = encoded.slice(start, end);
      const metadataLength = readUInt24BE(encoded, mimeTypeLengthMinusOne + 2);
      const metadataValue = encoded.slice(encoded.length - metadataLength);

      expect(mimeTypeLengthMinusOne).toBe(5);
      expect(mimeType.toString("utf-8")).toBe("custom");
      expect(metadataLength).toBe(4);
      expect(metadataValue.toString("utf-8")).toBe("test");
    });
  });

  describe("when given a array", () => {
    it("handles WellKnownMimeType instances as keys", () => {
      const encoded = encodeCompositeMetadata([
        [WellKnownMimeType.MESSAGE_RSOCKET_MIMETYPE, Buffer.from("test")],
      ]);

      // 122 | 128
      const maskedId = encoded.readUInt8(0);
      const length = readUInt24BE(encoded, 1);
      const value = encoded.slice(4, encoded.length);

      expect(maskedId).toBe(250);
      expect(length).toBe(4);
      expect(value.length).toBe(4);
      expect(value.toString("utf-8")).toBe("test");
    });

    it("handles WellKnownMimeType identifiers as keys", () => {
      const encoded = encodeCompositeMetadata([[122, Buffer.from("test")]]);

      // 122 | 128
      const maskedId = encoded.readUInt8(0);
      const length = readUInt24BE(encoded, 1);
      const value = encoded.slice(4, encoded.length);

      expect(maskedId).toBe(250);
      expect(length).toBe(4);
      expect(value.length).toBe(4);
      expect(value.toString("utf-8")).toBe("test");
    });

    it("handles custom mimetypes as keys", () => {
      const encoded = encodeCompositeMetadata([
        ["custom", Buffer.from("test")],
      ]);

      const mimeTypeLengthMinusOne = encoded.readUInt8(0);
      const start = 1;
      const end = mimeTypeLengthMinusOne + 2;
      const mimeType = encoded.slice(start, end);
      const metadataLength = readUInt24BE(encoded, mimeTypeLengthMinusOne + 2);
      const metadataValue = encoded.slice(encoded.length - metadataLength);

      expect(mimeTypeLengthMinusOne).toBe(5);
      expect(mimeType.toString("utf-8")).toBe("custom");
      expect(metadataLength).toBe(4);
      expect(metadataValue.toString("utf-8")).toBe("test");
    });

    it("handles mimetype value as function", () => {
      const encoded = encodeCompositeMetadata([
        ["custom", () => Buffer.from("test")],
      ]);

      const mimeTypeLengthMinusOne = encoded.readUInt8(0);
      const start = 1;
      const end = mimeTypeLengthMinusOne + 2;
      const mimeType = encoded.slice(start, end);
      const metadataLength = readUInt24BE(encoded, mimeTypeLengthMinusOne + 2);
      const metadataValue = encoded.slice(encoded.length - metadataLength);

      expect(mimeTypeLengthMinusOne).toBe(5);
      expect(mimeType.toString("utf-8")).toBe("custom");
      expect(metadataLength).toBe(4);
      expect(metadataValue.toString("utf-8")).toBe("test");
    });
  });
});
