import { Codec } from "rsocket-messaging";
import { mock } from "jest-mock-extended";
import { RSocket } from "rsocket-core";
import { requestStream } from "../../lib/requesters";

class StringCodec implements Codec<string> {
  readonly mimeType: string = "text/plain";

  decode(buffer: Buffer): string {
    return buffer.toString();
  }

  encode(entity: string): Buffer {
    return Buffer.from(entity);
  }
}

const stringCodec = new StringCodec();

describe("AsyncRespondersFactory", function () {
  describe("requestStream", function () {
    it("Invokes requestStream and forwards data arg", function () {
      const mockRSocket = mock<RSocket>();

      const handler = requestStream(
        "hello world",
        stringCodec,
        stringCodec,
        126
      );

      let asyncIterable = handler(mockRSocket, new Map());

      // need to subscribe because handler is lazy
      asyncIterable[Symbol.asyncIterator]();

      expect(mockRSocket.requestStream).toBeCalledWith(
        {
          data: Buffer.from("hello world"),
          metadata: Buffer.from(""),
        },
        expect.any(Number),
        expect.objectContaining({
          onComplete: expect.any(Function),
          onNext: expect.any(Function),
          onError: expect.any(Function),
          onExtension: expect.any(Function),
        })
      );
    });

    [null, undefined].forEach((input) => {
      it(`Invokes requestStream with data argument when empty ('${input}')`, function () {
        const mockRSocket = mock<RSocket>();

        const handler = requestStream(input, stringCodec, stringCodec, 126);

        let asyncIterable = handler(mockRSocket, new Map());

        // need to subscribe because handler is lazy
        asyncIterable[Symbol.asyncIterator]();

        expect(mockRSocket.requestStream).toBeCalledWith(
          {
            data: Buffer.from(""),
            metadata: Buffer.from(""),
          },
          expect.any(Number),
          expect.objectContaining({
            onComplete: expect.any(Function),
            onNext: expect.any(Function),
            onError: expect.any(Function),
            onExtension: expect.any(Function),
          })
        );
      });
    });

    it("Iterable next resolves with value of onNext call", async function () {
      const mockRSocket = mock<RSocket>();

      const handler = requestStream("hello world", stringCodec, stringCodec);

      const asyncIterable = handler(mockRSocket, new Map())[
        Symbol.asyncIterator
      ]();

      expect(mockRSocket.requestStream).toBeCalled();

      const subscriber = mockRSocket.requestStream.mock.calls[0][2];

      subscriber.onNext(
        {
          data: Buffer.from("hello world"),
          metadata: Buffer.from(""),
        },
        true
      );

      const result = await asyncIterable.next();

      expect(result.value).toBe("hello world");
      expect(result.done).toBe(false);
    });

    it("Iterable next resolves with done flag for onComplete call", async function () {
      const mockRSocket = mock<RSocket>();

      const handler = requestStream("hello world", stringCodec, stringCodec);

      const asyncIterable = handler(mockRSocket, new Map())[
        Symbol.asyncIterator
      ]();

      expect(mockRSocket.requestStream).toBeCalled();

      const subscriber = mockRSocket.requestStream.mock.calls[0][2];

      subscriber.onComplete();

      const result = await asyncIterable.next();

      expect(result.value).toBe(undefined);
      expect(result.done).toBe(true);
    });

    it("Rejects with error from onError call", async function () {
      const mockRSocket = mock<RSocket>();

      const handler = requestStream("hello world", stringCodec, stringCodec);

      const asyncIterable = handler(mockRSocket, new Map())[
        Symbol.asyncIterator
      ]();

      expect(mockRSocket.requestStream).toBeCalled();

      const subscriber = mockRSocket.requestStream.mock.calls[0][2];

      subscriber.onError(new Error("my error"));

      try {
        await asyncIterable.next();
        throw new Error("Expected `next` to reject.");
      } catch (e) {
        expect(e).toEqual(new Error("my error"));
      }
    });
  });
});
