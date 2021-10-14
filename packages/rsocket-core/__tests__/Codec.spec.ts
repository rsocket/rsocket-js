import {
  readUInt24BE,
  readUInt64BE,
  writeUInt24BE,
  writeUInt64BE,
} from "../src/Codecs";

describe("Codecs", () => {
  describe("{read,write}UInt24BE", () => {
    [
      0,
      1,
      Math.pow(2, 24) - 5,
      Math.pow(2, 24) - 3,
      Math.pow(2, 24) - 2,
      Math.pow(2, 24) - 1,
    ].forEach((val) => {
      it("reads/writes 0x" + val.toString(16), () => {
        const buffer = new Buffer(3);
        const offset = writeUInt24BE(buffer, val, 0);
        expect(offset).toBe(3);
        expect(readUInt24BE(buffer, 0)).toBe(val);
      });
    });
  });

  describe("{read,write}UInt64BE", () => {
    [
      0,
      1,
      Math.pow(2, 31) - 1,
      Math.pow(2, 31),
      Math.pow(2, 32) - 1,
      Math.pow(2, 32),
      Math.pow(2, 33) - 1,
      Math.pow(2, 33),
      Math.pow(2, 34) - 1,
      Math.pow(2, 34),
      Number.MAX_SAFE_INTEGER - 4,
      Number.MAX_SAFE_INTEGER - 3,
      Number.MAX_SAFE_INTEGER - 2,
      Number.MAX_SAFE_INTEGER - 1,
      Number.MAX_SAFE_INTEGER,
    ].forEach((val) => {
      it("writes and reads back 0x" + val.toString(16), () => {
        const buffer = new Buffer(8);
        const offset = writeUInt64BE(buffer, val, 0);
        expect(offset).toBe(8);
        expect(readUInt64BE(buffer, 0)).toBe(val);
      });
    });

    // Ensure that the binary representation is correct
    it("writes values in canonical form", () => {
      const buffer = new Buffer(8);
      buffer.fill(0);
      writeUInt64BE(buffer, Number.MAX_SAFE_INTEGER, 0);
      expect(buffer.toString("hex")).toBe("001fffffffffffff");
    });
  });
});
