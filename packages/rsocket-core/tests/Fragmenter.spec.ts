import { fragment, isFragmentable } from "../src/Fragmenter";
import { FrameTypes } from "@rsocket/rsocket-types";

describe("isFragmentable", () => {
  it("returns false when fragmentSize is 0", () => {
    const actual = isFragmentable(undefined, 0, undefined);
    const expected = false;
    expect(actual).toBe(expected);
  });

  it("returns false when frame size is smaller than fragmentSize", () => {
    const actual = isFragmentable(
      {
        data: Buffer.from([]),
        metadata: Buffer.from([]),
      },
      1000,
      FrameTypes.REQUEST_FNF
    );
    const expected = false;
    expect(actual).toBe(expected);
  });

  it("returns true when frame size is larger than fragmentSize", () => {
    const actual = isFragmentable(
      {
        data: Buffer.from("hello world"), // 11
        metadata: Buffer.from("hello world"), // 11
      },
      10,
      FrameTypes.REQUEST_CHANNEL // 3
    );
    const expected = true;
    expect(actual).toBe(expected);
  });
});

// TODO: seems to be some issues with `fragment` method. Is `fragment` fully implemented/exercised?
//  - last frame seems to not be produced
//  - NPE thrown on `data`
//  - metadata fragmentation is reference data on line 63
//    - `metadata = payload.data.slice(metadataPosition, nextMetadataPosition);`
//  - passing undefined as `metadata` produces unexpected behavior
describe.skip("fragment", () => {
  describe("REQUEST_RESPONSE", function () {
    const TEST_FRAME_TYPE = FrameTypes.REQUEST_RESPONSE;

    it("Produces two frame fragments when data payload overflows one frame", () => {
      const payload = {
        data: Buffer.concat([
          Buffer.from("hello world"),
          Buffer.from("hello world"),
        ]), // 22 bytes
        // TODO: Passing undefined here causes unexpected behavior
        metadata: Buffer.from([]), // 0
      };

      const generator = fragment(0, payload, 11, TEST_FRAME_TYPE, false);

      const expectedYields = [
        [
          {
            type: FrameTypes.REQUEST_RESPONSE,
            flags: 128,
            data: Buffer.from("hello world"),
            metadata: undefined,
            streamId: 0,
          },
        ],
        [
          {
            type: FrameTypes.PAYLOAD,
            flags: 32,
            data: Buffer.from("hello world"),
            metadata: undefined,
            streamId: 0,
          },
        ],
      ];

      expect(generator).toMatchYields(expectedYields);
    });
  });
});
