import { mock } from "jest-mock-extended";
import { ErrorCodes, Flags, FrameTypes } from "../src";
import { LeaseManager } from "../src/Lease";
import {
  RequestFnFRequesterStream,
  RequestFnfResponderStream,
} from "../src/RequestFnFStream";
import { Cancellable, OnTerminalSubscriber, Payload } from "../src/RSocket";
import { MockStream } from "./test-utils/MockStream";

describe("RequestFnFStream Test", () => {
  describe("Requester", () => {
    describe("Non-Fragmentable", () => {
      it("Sends RequestFnFFrame on onReady event", () => {
        const mockStream = new MockStream();
        const mockHandler: OnTerminalSubscriber = mock<OnTerminalSubscriber>();
        const request = new RequestFnFRequesterStream(
          {
            data: Buffer.from("Hello"),
            metadata: Buffer.from(" World"),
          },
          mockHandler,
          0
        );

        request.handleReady(1, mockStream);

        expect(mockStream.frames).toMatchObject([
          {
            type: FrameTypes.REQUEST_FNF,
            data: Buffer.from("Hello"),
            metadata: Buffer.from(" World"),
            flags: Flags.METADATA,
            streamId: 1,
          },
        ]);
        expect(mockHandler.onComplete).toBeCalled();
      });
    });

    describe("Fragmentable", () => {
      it("Sends RequestFnFFrame on onReady event", () => {
        const mockStream = new MockStream();
        const mockHandler: OnTerminalSubscriber = mock<OnTerminalSubscriber>();
        const request = new RequestFnFRequesterStream(
          {
            data: Buffer.concat([
              Buffer.from("hello world"),
              Buffer.from("hello world"),
            ]), // 22 bytes
            metadata: Buffer.from("world hello"),
          },
          mockHandler,
          11
        );

        request.handleReady(1, mockStream);

        expect(mockStream.frames).toMatchObject([
          {
            type: FrameTypes.REQUEST_FNF,
            flags: Flags.FOLLOWS | Flags.METADATA,
            data: undefined,
            metadata: Buffer.from("world he"),
            streamId: 1,
          },
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.NEXT | Flags.FOLLOWS | Flags.METADATA,
            data: Buffer.from("hello"),
            metadata: Buffer.from("llo"),
            streamId: 1,
          },
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.NEXT | Flags.FOLLOWS,
            data: Buffer.from(" worldhello"),
            metadata: undefined,
            streamId: 1,
          },
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.NEXT,
            data: Buffer.from(" world"),
            metadata: undefined,
            streamId: 1,
          },
        ]);
        expect(mockHandler.onComplete).toBeCalled();
      });
    });

    it("Doesn't sends RequestFnFFrame on onReady event if request was cancelled", () => {
      const mockStream = new MockStream();
      const mockHandler: OnTerminalSubscriber = mock<OnTerminalSubscriber>();
      const request = new RequestFnFRequesterStream(
        {
          data: Buffer.from("Hello"),
          metadata: Buffer.from(" World"),
        },
        mockHandler,
        0
      );

      request.cancel();
      request.handleReady(1, mockStream);

      expect(mockStream.frames).toMatchObject([]);
      expect(mockHandler.onComplete).not.toBeCalled();
    });

    it("Doesn't sends RequestFnFFrame on onReady event if request was cancelled and removed from lease manager", () => {
      const mockStream = new MockStream();
      const mockHandler: OnTerminalSubscriber = mock<OnTerminalSubscriber>();
      const mockLeasManager: LeaseManager = mock<LeaseManager>();
      const request = new RequestFnFRequesterStream(
        {
          data: Buffer.from("Hello"),
          metadata: Buffer.from(" World"),
        },
        mockHandler,
        0,
        mockLeasManager
      );

      request.cancel();
      request.handleReady(1, mockStream);

      expect(mockStream.frames).toMatchObject([]);
      expect(mockHandler.onComplete).not.toBeCalled();
      expect(mockLeasManager.cancelRequest).toBeCalled();
    });

    it("Doesn't sends onError and any other frames on onReject event", () => {
      const mockHandler: OnTerminalSubscriber = mock<OnTerminalSubscriber>();
      const request = new RequestFnFRequesterStream(
        {
          data: Buffer.from("Hello"),
          metadata: Buffer.from(" World"),
        },
        mockHandler,
        0
      );

      request.handleReject(new Error("boom"));

      expect(mockHandler.onError).toBeCalledWith(new Error("boom"));
    });

    it("Doesn't sends onError on onReject event if cancelled", () => {
      const mockHandler: OnTerminalSubscriber = mock<OnTerminalSubscriber>();
      const request = new RequestFnFRequesterStream(
        {
          data: Buffer.from("Hello"),
          metadata: Buffer.from(" World"),
        },
        mockHandler,
        0
      );

      request.cancel();
      request.handleReject(new Error("boom"));

      expect(mockHandler.onError).not.toBeCalledWith(new Error("boom"));
    });
  });

  describe("Responder", () => {
    describe("Non-Fragmentable", () => {
      it("Handler Request", () => {
        const mockStream = new MockStream();
        const mockCancellable = mock<Cancellable>();
        let payload: Payload;
        const responder = new RequestFnfResponderStream(
          1,
          mockStream,
          (p, terminator) => {
            payload = p;
            terminator.onComplete();
            return mockCancellable;
          },
          {
            type: FrameTypes.REQUEST_FNF,
            streamId: 1,
            flags: Flags.METADATA,
            data: Buffer.from("Hello World"),
            metadata: Buffer.from("World Hello"),
          }
        );

        expect(mockStream.frames).toMatchObject([]);
        expect(payload).toMatchObject({
          data: Buffer.from("Hello World"),
          metadata: Buffer.from("World Hello"),
        });
      });

      it("Cancel on close", () => {
        const mockStream = new MockStream();
        const mockCancellable = mock<Cancellable>();
        let payload: Payload;
        const responder = new RequestFnfResponderStream(
          1,
          mockStream,
          (p, terminator) => {
            payload = p;
            return mockCancellable;
          },
          {
            type: FrameTypes.REQUEST_FNF,
            flags: Flags.METADATA,
            data: Buffer.from("Hello World"),
            metadata: Buffer.from("world hello"),
            streamId: 1,
          }
        );

        expect(mockStream.frames).toMatchObject([]);
        expect(payload).toMatchObject({
          data: Buffer.from("Hello World"),
          metadata: Buffer.from("world hello"),
        });

        responder.close();

        expect(mockCancellable.cancel).toBeCalled();
      });
    });

    describe("Fragmentable", () => {
      it("Handler Request", () => {
        const mockStream = new MockStream();
        const mockCancellable = mock<Cancellable>();
        let payload: Payload;
        const responder = new RequestFnfResponderStream(
          1,
          mockStream,
          (p, terminator) => {
            payload = p;
            terminator.onComplete();
            return mockCancellable;
          },
          {
            type: FrameTypes.REQUEST_FNF,
            flags: Flags.FOLLOWS | Flags.METADATA,
            data: undefined,
            metadata: Buffer.from("world he"),
            streamId: 1,
          }
        );

        expect(mockStream.frames).toMatchObject([]);
        expect(payload).toBeUndefined();

        responder.handle({
          type: FrameTypes.PAYLOAD,
          flags: Flags.NEXT | Flags.FOLLOWS | Flags.METADATA,
          data: Buffer.from("hello"),
          metadata: Buffer.from("llo"),
          streamId: 1,
        });
        responder.handle({
          type: FrameTypes.PAYLOAD,
          flags: Flags.NEXT | Flags.FOLLOWS,
          data: Buffer.from(" worldhello"),
          metadata: undefined,
          streamId: 1,
        });

        expect(mockStream.frames).toMatchObject([]);
        expect(payload).toBeUndefined();

        responder.handle({
          type: FrameTypes.PAYLOAD,
          flags: Flags.NEXT,
          data: Buffer.from(" world"),
          metadata: undefined,
          streamId: 1,
        });

        expect(mockStream.frames).toMatchObject([]);
        expect(payload).toMatchObject({
          data: Buffer.concat([
            Buffer.from("hello world"),
            Buffer.from("hello world"),
          ]), // 22 bytes
          metadata: Buffer.from("world hello"),
        });
      });

      // TODO: add case wrong illegal fragment received

      it("Send error back on unexpected frame", () => {
        const mockStream = new MockStream();
        const mockCancellable = mock<Cancellable>();
        let payload: Payload;
        const responder = new RequestFnfResponderStream(
          1,
          mockStream,
          (p, terminator) => {
            payload = p;
            terminator.onComplete();
            return mockCancellable;
          },
          {
            type: FrameTypes.REQUEST_FNF,
            flags: Flags.FOLLOWS | Flags.METADATA,
            data: undefined,
            metadata: Buffer.from("world he"),
            streamId: 1,
          }
        );

        expect(mockStream.frames).toMatchObject([]);
        expect(payload).toBeUndefined();

        responder.handle({
          type: FrameTypes.EXT,
          flags: Flags.NONE,
          streamId: 1,
          extendedType: 1,
          extendedContent: Buffer.allocUnsafe(0),
        } as any);

        expect(mockStream.frames).toMatchObject([
          {
            type: FrameTypes.ERROR,
            flags: Flags.NONE,
            code: ErrorCodes.CANCELED,
            message: `Unexpected frame type [${FrameTypes.EXT}]` ,
            streamId: 1,
          },
        ]);
        expect(payload).toBeUndefined();
      });

      it("Cancel Reassembly on close", () => {
        const mockStream = new MockStream();
        const mockCancellable = mock<Cancellable>();
        let payload: Payload;
        const responder = new RequestFnfResponderStream(
          1,
          mockStream,
          (p, terminator) => {
            payload = p;
            terminator.onComplete();
            return mockCancellable;
          },
          {
            type: FrameTypes.REQUEST_FNF,
            flags: Flags.FOLLOWS | Flags.METADATA,
            data: undefined,
            metadata: Buffer.from("world he"),
            streamId: 1,
          }
        );

        expect(mockStream.frames).toMatchObject([]);
        expect(payload).toBeUndefined();

        responder.close();

        expect(responder.data).toBeUndefined();
        expect(responder.metadata).toBeUndefined();
      });
    });
  });
});
