import { Codec } from "rsocket-messaging";
import { mock } from "jest-mock-extended";
import { RSocket } from "rsocket-core";
import { requestResponse } from "../../lib/requesters";

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
  describe("requestResponse", function () {
    it("Invokes requestResponse with data argument", function () {
      const mockRSocket = mock<RSocket>();

      const handler = requestResponse("hello world", stringCodec, stringCodec);

      handler(mockRSocket, new Map());

      expect(mockRSocket.requestResponse).toBeCalledWith(
        {
          data: Buffer.from("hello world"),
          metadata: Buffer.from(""),
        },
        {
          onComplete: expect.any(Function),
          onNext: expect.any(Function),
          onError: expect.any(Function),
          onExtension: expect.any(Function),
        }
      );
    });

    [null, undefined].forEach((input) => {
      it(`Invokes requestResponse with data argument when empty ('${input}')`, function () {
        const mockRSocket = mock<RSocket>();

        const handler = requestResponse(input, stringCodec, stringCodec);

        handler(mockRSocket, new Map());

        expect(mockRSocket.requestResponse).toBeCalledWith(
          {
            data: Buffer.from(""),
            metadata: Buffer.from(""),
          },
          {
            onComplete: expect.any(Function),
            onNext: expect.any(Function),
            onError: expect.any(Function),
            onExtension: expect.any(Function),
          }
        );
      });
    });

    it("Resolves with value of onNext call", async function () {
      const mockRSocket = mock<RSocket>();

      const handler = requestResponse("hello world", stringCodec, stringCodec);

      const promise = handler(mockRSocket, new Map());

      expect(mockRSocket.requestResponse).toBeCalled();

      const subscriber = mockRSocket.requestResponse.mock.calls[0][1];

      subscriber.onNext(
        {
          data: Buffer.from("hello world"),
          metadata: Buffer.from(""),
        },
        true
      );

      const result = await promise;

      expect(result).toBe("hello world");
    });

    it("Resolves with null for onComplete call", async function () {
      const mockRSocket = mock<RSocket>();

      const handler = requestResponse("hello world", stringCodec, stringCodec);

      const promise = handler(mockRSocket, new Map());

      expect(mockRSocket.requestResponse).toBeCalled();

      const subscriber = mockRSocket.requestResponse.mock.calls[0][1];

      subscriber.onComplete();

      const result = await promise;

      expect(result).toBe(null);
    });

    it("Rejects with error from onError call", async function () {
      const mockRSocket = mock<RSocket>();

      const handler = requestResponse("hello world", stringCodec, stringCodec);

      const promise = handler(mockRSocket, new Map());

      expect(mockRSocket.requestResponse).toBeCalled();

      const subscriber = mockRSocket.requestResponse.mock.calls[0][1];

      subscriber.onError(new Error("my error"));

      try {
        await promise;
      } catch (e) {
        expect(e).toEqual(new Error("my error"));
      }
    });
  });
});
