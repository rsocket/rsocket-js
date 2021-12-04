import { Flags, FrameTypes } from "../src";
import {
  fragment,
  fragmentWithRequestN,
  isFragmentable,
} from "../src/Fragmenter";

describe("isFragmentable", () => {
  it("returns false when fragmentSize is 0", () => {
    const actual = isFragmentable(undefined, 0, undefined);
    const expected = false;
    expect(actual).toBe(expected);
  });

  it("returns false when frame size is smaller than fragmentSize", () => {
    const actual = isFragmentable(
      {
        data: Buffer.allocUnsafe(0),
        metadata: Buffer.allocUnsafe(0),
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

describe("fragment", () => {
  describe("PLAIN", function () {
    it("[REQUEST_RESPONSE Frame] Produces two frames fragments when data payload overflows one frame", () => {
      const payload = {
        data: Buffer.concat([
          Buffer.from("hello world"),
          Buffer.from("hello world"),
        ]), // 22 bytes
      };

      const generator = fragment(
        0,
        payload,
        11,
        FrameTypes.REQUEST_RESPONSE,
        false
      );

      const expectedYields = [
        [
          {
            type: FrameTypes.REQUEST_RESPONSE,
            flags: Flags.FOLLOWS,
            data: Buffer.from("hello world"),
            metadata: undefined,
            streamId: 0,
          },
        ],
        [
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.NEXT,
            data: Buffer.from("hello world"),
            metadata: undefined,
            streamId: 0,
          },
        ],
      ];

      // @ts-ignore
      expect(generator).toMatchYields(expectedYields);
    });

    it("[PAYLOAD Frame] Produces two frames fragments when data payload overflows one frame", () => {
      const payload = {
        data: Buffer.concat([
          Buffer.from("hello world"),
          Buffer.from("hello world"),
        ]), // 22 bytes
      };

      const generator = fragment(0, payload, 11, FrameTypes.PAYLOAD, false);

      const expectedYields = [
        [
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.FOLLOWS | Flags.NEXT,
            data: Buffer.from("hello world"),
            metadata: undefined,
            streamId: 0,
          },
        ],
        [
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.NEXT,
            data: Buffer.from("hello world"),
            metadata: undefined,
            streamId: 0,
          },
        ],
      ];

      // @ts-ignore
      expect(generator).toMatchYields(expectedYields);
    });

    it("[PAYLOAD Frame] Produces two frames fragments when data payload overflows one frame with complete flag", () => {
      const payload = {
        data: Buffer.concat([
          Buffer.from("hello world"),
          Buffer.from("hello world"),
        ]), // 22 bytes
      };

      const generator = fragment(0, payload, 11, FrameTypes.PAYLOAD, true);

      const expectedYields = [
        [
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.FOLLOWS | Flags.NEXT,
            data: Buffer.from("hello world"),
            metadata: undefined,
            streamId: 0,
          },
        ],
        [
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.NEXT | Flags.COMPLETE,
            data: Buffer.from("hello world"),
            metadata: undefined,
            streamId: 0,
          },
        ],
      ];

      // @ts-ignore
      expect(generator).toMatchYields(expectedYields);
    });

    it("[PAYLOAD Frame] Produces three frames fragments when metadata payload overflows one frame with complete flag", () => {
      const payload = {
        data: null,
        metadata: Buffer.concat([
          Buffer.from("hello world"),
          Buffer.from("hello world"),
        ]), // 22 bytes
      };

      const generator = fragment(0, payload, 11, FrameTypes.PAYLOAD, true);

      const expectedYields = [
        [
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.FOLLOWS | Flags.NEXT | Flags.METADATA,
            metadata: Buffer.from("hello wo"),
            datga: undefined,
            streamId: 0,
          },
        ],
        [
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.FOLLOWS | Flags.NEXT | Flags.METADATA,
            metadata: Buffer.from("rldhello"),
            data: undefined,
            streamId: 0,
          },
        ],
        [
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.NEXT | Flags.COMPLETE | Flags.METADATA,
            metadata: Buffer.from(" world"),
            data: undefined,
            streamId: 0,
          },
        ],
      ];

      // @ts-ignore
      expect(generator).toMatchYields(expectedYields);
    });

    it("[PAYLOAD Frame] Produces three full frames fragments when metadata payload overflows one frame with complete flag", () => {
      const payload = {
        data: null,
        metadata: Buffer.concat([
          Buffer.from("hello world"),
          Buffer.from("hello world12"),
        ]), // 22 bytes
      };

      const generator = fragment(0, payload, 11, FrameTypes.PAYLOAD, true);

      const expectedYields = [
        [
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.FOLLOWS | Flags.NEXT | Flags.METADATA,
            metadata: Buffer.from("hello wo"),
            datga: undefined,
            streamId: 0,
          },
        ],
        [
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.FOLLOWS | Flags.NEXT | Flags.METADATA,
            metadata: Buffer.from("rldhello"),
            data: undefined,
            streamId: 0,
          },
        ],
        [
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.NEXT | Flags.COMPLETE | Flags.METADATA,
            metadata: Buffer.from(" world12"),
            data: undefined,
            streamId: 0,
          },
        ],
      ];

      // @ts-ignore
      expect(generator).toMatchYields(expectedYields);
    });

    it("[REQUEST_RESPONSE Frame] Produces four frames fragments when data and metadata payload overflows one frame", () => {
      const payload = {
        data: Buffer.concat([
          Buffer.from("hello world"),
          Buffer.from("hello world"),
        ]), // 22 bytes
        metadata: Buffer.from("world hello"),
      };

      const generator = fragment(
        0,
        payload,
        11,
        FrameTypes.REQUEST_RESPONSE,
        false
      );

      const expectedYields = [
        [
          {
            type: FrameTypes.REQUEST_RESPONSE,
            flags: Flags.FOLLOWS | Flags.METADATA,
            data: undefined,
            metadata: Buffer.from("world he"),
            streamId: 0,
          },
        ],
        [
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.NEXT | Flags.FOLLOWS | Flags.METADATA,
            data: Buffer.from("hello"),
            metadata: Buffer.from("llo"),
            streamId: 0,
          },
        ],
        [
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.NEXT | Flags.FOLLOWS,
            data: Buffer.from(" worldhello"),
            metadata: undefined,
            streamId: 0,
          },
        ],
        [
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.NEXT,
            data: Buffer.from(" world"),
            metadata: undefined,
            streamId: 0,
          },
        ],
      ];

      // @ts-ignore
      expect(generator).toMatchYields(expectedYields);
    });

    it("[REQUEST_RESPONSE Frame] Produces three frames fragments when data and empty metadata payload overflows one frame", () => {
      const payload = {
        data: Buffer.concat([
          Buffer.from("hello world"),
          Buffer.from("hello world"),
        ]), // 22 bytes
        metadata: Buffer.allocUnsafe(0),
      };

      const generator = fragment(
        0,
        payload,
        11,
        FrameTypes.REQUEST_RESPONSE,
        false
      );

      const expectedYields = [
        [
          {
            type: FrameTypes.REQUEST_RESPONSE,
            flags: Flags.FOLLOWS | Flags.METADATA,
            data: Buffer.from("hello wo"),
            metadata: Buffer.allocUnsafe(0),
            streamId: 0,
          },
        ],
        [
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.NEXT | Flags.FOLLOWS,
            data: Buffer.from("rldhello wo"),
            metadata: undefined,
            streamId: 0,
          },
        ],
        [
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.NEXT,
            data: Buffer.from("rld"),
            metadata: undefined,
            streamId: 0,
          },
        ],
      ];

      // @ts-ignore
      expect(generator).toMatchYields(expectedYields);
    });
  });

  describe("WITH requestN", function () {
    it("[REQUEST_STREAM Frame] Produces two frames fragments when data payload overflows one frame", () => {
      const payload = {
        data: Buffer.concat([
          Buffer.from("hello world"),
          Buffer.from("hello world"),
        ]), // 22 bytes
      };

      const generator = fragmentWithRequestN(
        0,
        payload,
        11,
        FrameTypes.REQUEST_STREAM,
        1,
        false
      );

      const expectedYields = [
        [
          {
            type: FrameTypes.REQUEST_STREAM,
            flags: Flags.FOLLOWS,
            data: Buffer.from("hello wo"),
            metadata: undefined,
            requestN: 1,
            streamId: 0,
          },
        ],
        [
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.NEXT | Flags.FOLLOWS,
            data: Buffer.from("rldhello wo"),
            metadata: undefined,
            streamId: 0,
          },
        ],
        [
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.NEXT,
            data: Buffer.from("rld"),
            metadata: undefined,
            streamId: 0,
          },
        ],
      ];

      // @ts-ignore
      expect(generator).toMatchYields(expectedYields);
    });

    it("[REQUEST_STREAM Frame] Produces four frames fragments when data and metadata payload overflows one frame", () => {
      const payload = {
        data: Buffer.concat([
          Buffer.from("hello world"),
          Buffer.from("hello world"),
        ]), // 22 bytes
        metadata: Buffer.from("world hello"),
      };

      const generator = fragmentWithRequestN(
        0,
        payload,
        11,
        FrameTypes.REQUEST_STREAM,
        1,
        false
      );

      const expectedYields = [
        [
          {
            type: FrameTypes.REQUEST_STREAM,
            flags: Flags.FOLLOWS | Flags.METADATA,
            data: undefined,
            metadata: Buffer.from("world"),
            requestN: 1,
            streamId: 0,
          },
        ],
        [
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.NEXT | Flags.FOLLOWS | Flags.METADATA,
            data: Buffer.from("he"),
            metadata: Buffer.from(" hello"),
            streamId: 0,
          },
        ],
        [
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.NEXT | Flags.FOLLOWS,
            data: Buffer.from("llo worldhe"),
            metadata: undefined,
            streamId: 0,
          },
        ],
        [
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.NEXT,
            data: Buffer.from("llo world"),
            metadata: undefined,
            streamId: 0,
          },
        ],
      ];

      // @ts-ignore
      expect(generator).toMatchYields(expectedYields);
    });

    it("[REQUEST_STREAM Frame] Produces three frames fragments when data and empty metadata payload overflows one frame", () => {
      const payload = {
        data: Buffer.concat([
          Buffer.from("hello world"),
          Buffer.from("hello world"),
        ]), // 22 bytes
        metadata: Buffer.allocUnsafe(0),
      };

      const generator = fragmentWithRequestN(
        0,
        payload,
        11,
        FrameTypes.REQUEST_STREAM,
        1,
        false
      );

      const expectedYields = [
        [
          {
            type: FrameTypes.REQUEST_STREAM,
            flags: Flags.FOLLOWS | Flags.METADATA,
            data: Buffer.from("hello"),
            metadata: Buffer.allocUnsafe(0),
            requestN: 1,
            streamId: 0,
          },
        ],
        [
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.NEXT | Flags.FOLLOWS,
            data: Buffer.from(" worldhello"),
            metadata: undefined,
            streamId: 0,
          },
        ],
        [
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.NEXT,
            data: Buffer.from(" world"),
            metadata: undefined,
            streamId: 0,
          },
        ],
      ];

      // @ts-ignore
      expect(generator).toMatchYields(expectedYields);
    });

    it("[REQUEST_CHANNEL Frame] Produces three frames fragments when data and empty metadata payload overflows one frame with complete flag", () => {
      const payload = {
        data: Buffer.concat([
          Buffer.from("hello world"),
          Buffer.from("hello world"),
        ]), // 22 bytes
        metadata: Buffer.allocUnsafe(0),
      };

      const generator = fragmentWithRequestN(
        0,
        payload,
        11,
        FrameTypes.REQUEST_CHANNEL,
        1,
        true
      );

      const expectedYields = [
        [
          {
            type: FrameTypes.REQUEST_CHANNEL,
            flags: Flags.FOLLOWS | Flags.METADATA,
            data: Buffer.from("hello"),
            metadata: Buffer.allocUnsafe(0),
            requestN: 1,
            streamId: 0,
          },
        ],
        [
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.NEXT | Flags.FOLLOWS,
            data: Buffer.from(" worldhello"),
            metadata: undefined,
            streamId: 0,
          },
        ],
        [
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.NEXT | Flags.COMPLETE,
            data: Buffer.from(" world"),
            metadata: undefined,
            streamId: 0,
          },
        ],
      ];

      // @ts-ignore
      expect(generator).toMatchYields(expectedYields);
    });

    it("[REQUEST_CHANNEL Frame] Produces four frames fragments when empty data and metadata payload overflows one frame with complete flag", () => {
      const payload = {
        metadata: Buffer.concat([
          Buffer.from("hello world"),
          Buffer.from("hello world"),
        ]), // 22 bytes
        data: Buffer.allocUnsafe(0),
      };

      const generator = fragmentWithRequestN(
        0,
        payload,
        11,
        FrameTypes.REQUEST_CHANNEL,
        1,
        true
      );

      const expectedYields = [
        [
          {
            type: FrameTypes.REQUEST_CHANNEL,
            flags: Flags.FOLLOWS | Flags.METADATA,
            metadata: Buffer.from("hello"),
            data: undefined,
            requestN: 1,
            streamId: 0,
          },
        ],
        [
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.NEXT | Flags.FOLLOWS | Flags.METADATA,
            metadata: Buffer.from(" worldhe"),
            data: undefined,
            streamId: 0,
          },
        ],
        [
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.NEXT | Flags.FOLLOWS | Flags.METADATA,
            metadata: Buffer.from("llo worl"),
            data: undefined,
            streamId: 0,
          },
        ],
        [
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.NEXT | Flags.COMPLETE | Flags.METADATA,
            metadata: Buffer.from("d"),
            data: undefined,
            streamId: 0,
          },
        ],
      ];

      // @ts-ignore
      expect(generator).toMatchYields(expectedYields);
    });
  });
});
