import { Codec } from "@rsocket/messaging";
import { mock } from "jest-mock-extended";
import { RSocket } from "@rsocket/core";
import { fireAndForget } from "../../lib/requesters";

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
  describe("fireAndForget", function () {
    it("Invokes fireAndForget with data argument", function () {
      const mockRSocket = mock<RSocket>();

      const handler = fireAndForget("hello world", stringCodec);

      handler(mockRSocket, new Map());

      expect(mockRSocket.fireAndForget).toBeCalledWith(
        {
          data: Buffer.from("hello world"),
          metadata: Buffer.from(""),
        },
        {
          onComplete: expect.any(Function),
          onError: expect.any(Function),
        }
      );
    });

    [null, undefined].forEach((input) => {
      it(`Invokes fireAndForget with data argument when empty ('${input}')`, function () {
        const mockRSocket = mock<RSocket>();

        const handler = fireAndForget(null, stringCodec);

        handler(mockRSocket, new Map());

        expect(mockRSocket.fireAndForget).toBeCalledWith(
          {
            data: Buffer.from(""),
            metadata: Buffer.from(""),
          },
          {
            onComplete: expect.any(Function),
            onError: expect.any(Function),
          }
        );
      });
    });

    it("Resolves with undefined for onComplete call", async function () {
      const mockRSocket = mock<RSocket>();

      const handler = fireAndForget("hello world", stringCodec);

      const promise = handler(mockRSocket, new Map());

      expect(mockRSocket.fireAndForget).toBeCalled();

      const subscriber = mockRSocket.fireAndForget.mock.calls[0][1];

      subscriber.onComplete();

      const result = await promise;

      expect(result).toBe(undefined);
    });

    it("Rejects with error from onError call", async function () {
      const mockRSocket = mock<RSocket>();

      const handler = fireAndForget("hello world", stringCodec);

      const promise = handler(mockRSocket, new Map());

      expect(mockRSocket.fireAndForget).toBeCalled();

      const subscriber = mockRSocket.fireAndForget.mock.calls[0][1];

      subscriber.onError(new Error("my error"));

      try {
        await promise;
      } catch (e) {
        expect(e).toEqual(new Error("my error"));
      }
    });
  });
});
