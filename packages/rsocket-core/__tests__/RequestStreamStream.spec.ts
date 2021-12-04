import { mock } from "jest-mock-extended";
import { ErrorCodes, Flags, FrameTypes } from "../src";
import { RSocketError } from "../src/Errors";
import { LeaseManager } from "../src/Lease";
import {
  RequestStreamRequesterStream,
  RequestStreamResponderStream,
} from "../src/RequestStreamStream";
import {
  Cancellable,
  OnExtensionSubscriber,
  OnNextSubscriber,
  OnTerminalSubscriber,
  Payload,
  Requestable,
} from "../src/RSocket";
import { MockStream } from "./test-utils/MockStream";

describe("RequestStreamStream Test", () => {
  describe("Requester", () => {
    describe("Non-Fragmentable", () => {
      it("Sends RequestStreamFrame on onReady event and handle complete", () => {
        const mockStream = new MockStream();
        const mockHandler: OnTerminalSubscriber &
          OnNextSubscriber &
          OnExtensionSubscriber = mock<
          OnTerminalSubscriber & OnNextSubscriber & OnExtensionSubscriber
        >();
        const request = new RequestStreamRequesterStream(
          {
            data: Buffer.from("Hello"),
            metadata: Buffer.from(" World"),
          },
          mockHandler,
          0,
          1
        );

        request.handleReady(1, mockStream);

        expect(mockStream.handler).toBe(request);
        expect(mockStream.frames).toMatchObject([
          {
            type: FrameTypes.REQUEST_STREAM,
            data: Buffer.from("Hello"),
            metadata: Buffer.from(" World"),
            flags: Flags.METADATA,
            requestN: 1,
            streamId: 1,
          },
        ]);
        expect(mockHandler.onError).not.toBeCalled();
        expect(mockHandler.onNext).not.toBeCalled();
        expect(mockHandler.onComplete).not.toBeCalled();

        request.handle({
          type: FrameTypes.PAYLOAD,
          flags: Flags.COMPLETE,
          data: undefined,
          metadata: undefined,
          streamId: 1,
        });
        expect(mockHandler.onComplete).toBeCalled();
        expect(mockHandler.onError).not.toBeCalled();
        expect(mockHandler.onNext).not.toBeCalled();
        expect(mockStream.handler).toBeUndefined();
      });

      it("Sends RequestStreamFrame on onReady event and handle next", () => {
        const mockStream = new MockStream();
        const mockHandler: OnTerminalSubscriber &
          OnNextSubscriber &
          OnExtensionSubscriber = mock<
          OnTerminalSubscriber & OnNextSubscriber & OnExtensionSubscriber
        >();
        const request = new RequestStreamRequesterStream(
          {
            data: Buffer.from("Hello"),
            metadata: Buffer.from(" World"),
          },
          mockHandler,
          0,
          1
        );

        request.request(2);
        request.handleReady(1, mockStream);

        expect(mockStream.frames.pop()).toMatchObject({
          type: FrameTypes.REQUEST_STREAM,
          data: Buffer.from("Hello"),
          metadata: Buffer.from(" World"),
          flags: Flags.METADATA,
          streamId: 1,
          requestN: 3,
        });

        expect(mockStream.handler).toBe(request);
        expect(mockHandler.onError).not.toBeCalled();
        expect(mockHandler.onNext).not.toBeCalled();
        expect(mockHandler.onComplete).not.toBeCalled();

        request.handle({
          type: FrameTypes.PAYLOAD,
          flags: Flags.NEXT | Flags.METADATA,
          data: Buffer.from("hey"),
          metadata: Buffer.from("there"),
          streamId: 1,
        });

        request.request(Number.MAX_SAFE_INTEGER);

        expect(mockStream.frames.pop()).toMatchObject({
          type: FrameTypes.REQUEST_N,
          flags: Flags.NONE,
          streamId: 1,
          requestN: Number.MAX_SAFE_INTEGER,
        });

        request.handle({
          type: FrameTypes.PAYLOAD,
          flags: Flags.COMPLETE,
          data: null,
          metadata: null,
          streamId: 1,
        });

        expect(mockHandler.onError).not.toBeCalled();
        expect(mockHandler.onNext).toBeCalledWith(
          {
            data: Buffer.from("hey"),
            metadata: Buffer.from("there"),
          },
          false
        );
        expect(mockHandler.onComplete).toBeCalled();
        expect(mockStream.handler).toBeUndefined();
      });

      it("Sends RequestStreamFrame on onReady event and handle error", () => {
        const mockStream = new MockStream();
        const mockHandler: OnTerminalSubscriber &
          OnNextSubscriber &
          OnExtensionSubscriber = mock<
          OnTerminalSubscriber & OnNextSubscriber & OnExtensionSubscriber
        >();
        const request = new RequestStreamRequesterStream(
          {
            data: Buffer.from("Hello"),
            metadata: Buffer.from(" World"),
          },
          mockHandler,
          0,
          1
        );

        request.handleReady(1, mockStream);

        expect(mockStream.frames).toMatchObject([
          {
            type: FrameTypes.REQUEST_STREAM,
            data: Buffer.from("Hello"),
            metadata: Buffer.from(" World"),
            flags: Flags.METADATA,
            streamId: 1,
            requestN: 1,
          },
        ]);

        expect(mockStream.handler).toBe(request);
        expect(mockHandler.onError).not.toBeCalled();
        expect(mockHandler.onNext).not.toBeCalled();
        expect(mockHandler.onComplete).not.toBeCalled();

        request.handle({
          type: FrameTypes.ERROR,
          flags: Flags.NONE,
          streamId: 1,
          code: ErrorCodes.APPLICATION_ERROR,
          message: "Boom",
        });

        expect(mockHandler.onError).toBeCalledWith(
          new RSocketError(ErrorCodes.APPLICATION_ERROR, "Boom")
        );
        expect(mockHandler.onNext).not.toBeCalled();
        expect(mockHandler.onComplete).not.toBeCalled();
        expect(mockStream.handler).toBeUndefined();
      });

      it("Sends RequestStreamFrame on onReady event and handle unexpected frame", () => {
        const mockStream = new MockStream();
        const mockHandler: OnTerminalSubscriber &
          OnNextSubscriber &
          OnExtensionSubscriber = mock<
          OnTerminalSubscriber & OnNextSubscriber & OnExtensionSubscriber
        >();
        const request = new RequestStreamRequesterStream(
          {
            data: Buffer.from("Hello"),
            metadata: Buffer.from(" World"),
          },
          mockHandler,
          0,
          1
        );

        request.handleReady(1, mockStream);

        expect(mockStream.frames).toMatchObject([
          {
            type: FrameTypes.REQUEST_STREAM,
            data: Buffer.from("Hello"),
            metadata: Buffer.from(" World"),
            flags: Flags.METADATA,
            streamId: 1,
          },
        ]);

        expect(mockStream.handler).toBe(request);
        expect(mockHandler.onError).not.toBeCalled();
        expect(mockHandler.onNext).not.toBeCalled();
        expect(mockHandler.onComplete).not.toBeCalled();

        request.handle({
          type: FrameTypes.REQUEST_N,
          flags: Flags.NONE,
          streamId: 1,
          requestN: 1,
        });

        expect(mockHandler.onError).toBeCalledWith(
          new RSocketError(
            ErrorCodes.CANCELED,
            `Unexpected frame type [${FrameTypes.REQUEST_N}]`
          )
        );
        expect(mockHandler.onNext).not.toBeCalled();
        expect(mockHandler.onComplete).not.toBeCalled();
        expect(mockStream.handler).toBeUndefined();
      });

      it("Sends RequestStreamFrame on onReady event and then cancel", () => {
        const mockStream = new MockStream();
        const mockHandler: OnTerminalSubscriber &
          OnNextSubscriber &
          OnExtensionSubscriber = mock<
          OnTerminalSubscriber & OnNextSubscriber & OnExtensionSubscriber
        >();
        const request = new RequestStreamRequesterStream(
          {
            data: Buffer.from("Hello"),
            metadata: Buffer.from(" World"),
          },
          mockHandler,
          0,
          1
        );

        request.handleReady(1, mockStream);

        expect(mockStream.frames.pop()).toMatchObject({
          type: FrameTypes.REQUEST_STREAM,
          data: Buffer.from("Hello"),
          metadata: Buffer.from(" World"),
          flags: Flags.METADATA,
          streamId: 1,
          requestN: 1,
        });

        expect(mockStream.handler).toBe(request);
        expect(mockHandler.onError).not.toBeCalled();
        expect(mockHandler.onNext).not.toBeCalled();
        expect(mockHandler.onComplete).not.toBeCalled();

        request.cancel();

        expect(mockStream.frames.pop()).toMatchObject({
          type: FrameTypes.CANCEL,
          flags: Flags.NONE,
          streamId: 1,
        });

        expect(mockHandler.onError).not.toBeCalled();
        expect(mockHandler.onNext).not.toBeCalled();
        expect(mockHandler.onComplete).not.toBeCalled();
        expect(mockStream.handler).toBeUndefined();
      });
    });

    describe("Fragmentable", () => {
      it("Sends RequestStreamFrame on onReady event", () => {
        const mockStream = new MockStream();
        const mockHandler: OnTerminalSubscriber &
          OnNextSubscriber &
          OnExtensionSubscriber = mock<
          OnTerminalSubscriber & OnNextSubscriber & OnExtensionSubscriber
        >();
        const request = new RequestStreamRequesterStream(
          {
            data: Buffer.concat([
              Buffer.from("hello world"),
              Buffer.from("hello world"),
            ]), // 22 bytes
            metadata: Buffer.from("world hello"),
          },
          mockHandler,
          11,
          1
        );

        request.handleReady(1, mockStream);

        expect(mockStream.frames).toMatchObject([
          {
            type: FrameTypes.REQUEST_STREAM,
            flags: Flags.FOLLOWS | Flags.METADATA,
            data: undefined,
            metadata: Buffer.from("world"),
            streamId: 1,
          },
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.NEXT | Flags.FOLLOWS | Flags.METADATA,
            data: Buffer.from("he"),
            metadata: Buffer.from(" hello"),
            streamId: 1,
          },
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.NEXT | Flags.FOLLOWS,
            data: Buffer.from("llo worldhe"),
            metadata: undefined,
            streamId: 1,
          },
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.NEXT,
            data: Buffer.from("llo world"),
            metadata: undefined,
            streamId: 1,
          },
        ]);

        expect(mockStream.handler).toBe(request);
        expect(mockHandler.onComplete).not.toBeCalled();
        expect(mockHandler.onNext).not.toBeCalled();
        expect(mockHandler.onError).not.toBeCalled();

        request.handle({
          type: FrameTypes.PAYLOAD,
          flags: Flags.FOLLOWS | Flags.METADATA,
          data: undefined,
          metadata: Buffer.from("world he"),
          streamId: 1,
        });
        request.handle({
          type: FrameTypes.PAYLOAD,
          flags: Flags.NEXT | Flags.FOLLOWS | Flags.METADATA,
          data: Buffer.from("hello"),
          metadata: Buffer.from("llo"),
          streamId: 1,
        });
        request.handle({
          type: FrameTypes.PAYLOAD,
          flags: Flags.NEXT | Flags.FOLLOWS,
          data: Buffer.from(" worldhello"),
          metadata: undefined,
          streamId: 1,
        });
        request.handle({
          type: FrameTypes.PAYLOAD,
          flags: Flags.NEXT,
          data: Buffer.from(" world"),
          metadata: undefined,
          streamId: 1,
        });

        request.handle({
          type: FrameTypes.PAYLOAD,
          flags: Flags.COMPLETE,
          data: undefined,
          metadata: undefined,
          streamId: 1,
        });

        expect(mockStream.handler).toBeUndefined();
        expect(mockHandler.onComplete).toBeCalled();
        expect(mockHandler.onNext).toBeCalled();
        expect(
          (mockHandler.onNext as jest.Mock).mock.calls[0][0]
        ).toMatchObject({
          data: Buffer.concat([
            Buffer.from("hello world"),
            Buffer.from("hello world"),
          ]), // 22 bytes
          metadata: Buffer.from("world hello"),
        });
        expect(mockHandler.onError).not.toBeCalled();
      });

      it("Sends RequestStreamFrame on onReady event and fail on unexpected frame", () => {
        const mockStream = new MockStream();
        const mockHandler: OnTerminalSubscriber &
          OnNextSubscriber &
          OnExtensionSubscriber = mock<
          OnTerminalSubscriber & OnNextSubscriber & OnExtensionSubscriber
        >();
        const request = new RequestStreamRequesterStream(
          {
            data: Buffer.concat([
              Buffer.from("hello world"),
              Buffer.from("hello world"),
            ]), // 22 bytes
            metadata: Buffer.from("world hello"),
          },
          mockHandler,
          11,
          1
        );

        request.handleReady(1, mockStream);

        expect(mockStream.frames).toMatchObject([
          {
            type: FrameTypes.REQUEST_STREAM,
            flags: Flags.FOLLOWS | Flags.METADATA,
            data: undefined,
            metadata: Buffer.from("world"),
            streamId: 1,
          },
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.NEXT | Flags.FOLLOWS | Flags.METADATA,
            data: Buffer.from("he"),
            metadata: Buffer.from(" hello"),
            streamId: 1,
          },
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.NEXT | Flags.FOLLOWS,
            data: Buffer.from("llo worldhe"),
            metadata: undefined,
            streamId: 1,
          },
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.NEXT,
            data: Buffer.from("llo world"),
            metadata: undefined,
            streamId: 1,
          },
        ]);

        expect(mockStream.handler).toBe(request);
        expect(mockHandler.onComplete).not.toBeCalled();
        expect(mockHandler.onNext).not.toBeCalled();
        expect(mockHandler.onError).not.toBeCalled();

        request.handle({
          type: FrameTypes.PAYLOAD,
          flags: Flags.FOLLOWS | Flags.METADATA,
          data: undefined,
          metadata: Buffer.from("world he"),
          streamId: 1,
        });
        request.handle({
          type: FrameTypes.PAYLOAD,
          flags: Flags.NEXT | Flags.FOLLOWS | Flags.METADATA,
          data: Buffer.from("hello"),
          metadata: Buffer.from("llo"),
          streamId: 1,
        });
        request.handle({
          type: FrameTypes.PAYLOAD,
          flags: Flags.NEXT | Flags.FOLLOWS,
          data: Buffer.from(" worldhello"),
          metadata: undefined,
          streamId: 1,
        });
        request.handle({
          type: FrameTypes.REQUEST_N,
          flags: Flags.NONE,
          streamId: 1,
          requestN: 1,
        });

        expect(mockStream.handler).toBeUndefined();
        expect(mockHandler.onComplete).not.toBeCalled();
        expect(mockHandler.onNext).not.toBeCalled();
        expect(mockHandler.onError).toHaveBeenCalledWith(
          new RSocketError(
            ErrorCodes.APPLICATION_ERROR,
            `Unexpected frame type [${FrameTypes.REQUEST_N}]`
          )
        );
      });
    });

    it("Doesn't sends RequestStreamFrame on onReady event if request was cancelled", () => {
      const mockStream = new MockStream();
      const mockHandler: OnTerminalSubscriber &
        OnNextSubscriber &
        OnExtensionSubscriber = mock<
        OnTerminalSubscriber & OnNextSubscriber & OnExtensionSubscriber
      >();
      const request = new RequestStreamRequesterStream(
        {
          data: Buffer.from("Hello"),
          metadata: Buffer.from(" World"),
        },
        mockHandler,
        0,
        1
      );

      request.cancel();
      request.handleReady(1, mockStream);

      expect(mockStream.handler).not.toBe(request);
      expect(mockStream.frames).toMatchObject([]);
      expect(mockHandler.onError).not.toBeCalled();
      expect(mockHandler.onNext).not.toBeCalled();
      expect(mockHandler.onComplete).not.toBeCalled();
    });

    it("Doesn't sends RequestStreamFrame on onReady event if request was cancelled and removed from lease manager", () => {
      const mockStream = new MockStream();
      const mockHandler: OnTerminalSubscriber &
        OnNextSubscriber &
        OnExtensionSubscriber = mock<
        OnTerminalSubscriber & OnNextSubscriber & OnExtensionSubscriber
      >();
      const mockLeasManager: LeaseManager = mock<LeaseManager>();
      const request = new RequestStreamRequesterStream(
        {
          data: Buffer.from("Hello"),
          metadata: Buffer.from(" World"),
        },
        mockHandler,
        0,
        1,
        mockLeasManager
      );

      request.cancel();
      request.handleReady(1, mockStream);

      expect(mockStream.frames).toMatchObject([]);
      expect(mockHandler.onComplete).not.toBeCalled();
      expect(mockHandler.onNext).not.toBeCalled();
      expect(mockHandler.onError).not.toBeCalled();
      expect(mockLeasManager.cancelRequest).toBeCalled();
    });

    it("Doesn't sends onError and any other frames on onReject event", () => {
      const mockHandler: OnTerminalSubscriber &
        OnNextSubscriber &
        OnExtensionSubscriber = mock<
        OnTerminalSubscriber & OnNextSubscriber & OnExtensionSubscriber
      >();
      const request = new RequestStreamRequesterStream(
        {
          data: Buffer.from("Hello"),
          metadata: Buffer.from(" World"),
        },
        mockHandler,
        0,
        1
      );

      request.handleReject(new Error("boom"));

      expect(mockHandler.onError).toBeCalledWith(new Error("boom"));
    });

    it("Doesn't sends onError on onReject event if cancelled", () => {
      const mockHandler: OnTerminalSubscriber &
        OnNextSubscriber &
        OnExtensionSubscriber = mock<
        OnTerminalSubscriber & OnNextSubscriber & OnExtensionSubscriber
      >();
      const request = new RequestStreamRequesterStream(
        {
          data: Buffer.from("Hello"),
          metadata: Buffer.from(" World"),
        },
        mockHandler,
        0,
        1
      );

      request.cancel();
      request.handleReject(new Error("boom"));

      expect(mockHandler.onError).not.toBeCalledWith(new Error("boom"));
      expect(mockHandler.onNext).not.toBeCalled();
      expect(mockHandler.onComplete).not.toBeCalled();
    });
  });

  describe("Responder", () => {
    describe("Non-Fragmentable", () => {
      it("Handler Request and Send Complete", () => {
        const mockStream = new MockStream();
        const mockHandler = mock<
          Cancellable & Requestable & OnExtensionSubscriber
        >();
        let payload: Payload;
        let sink: OnNextSubscriber &
          OnTerminalSubscriber &
          OnExtensionSubscriber;
        let requested: number;
        const responder = new RequestStreamResponderStream(
          1,
          mockStream,
          0,
          (p, requestN, sender) => {
            payload = p;
            sink = sender;
            requested = requestN;
            return mockHandler;
          },
          {
            type: FrameTypes.REQUEST_STREAM,
            streamId: 1,
            requestN: 10,
            flags: Flags.METADATA,
            data: Buffer.from("Hello World"),
            metadata: Buffer.from("World Hello"),
          }
        );

        expect(mockStream.handler).toBe(responder);

        responder.handle({
          type: FrameTypes.REQUEST_N,
          requestN: 25,
          streamId: 1,
          flags: Flags.NONE,
        });

        sink.onComplete();
        sink.onComplete(); // sends on complete which has to be ignored

        expect(mockHandler.request).toBeCalledWith(25);
        expect(mockStream.frames).toMatchObject([
          {
            type: FrameTypes.PAYLOAD,
            streamId: 1,
            flags: Flags.COMPLETE,
            data: null,
            metadata: null,
          },
        ]);
        expect(payload).toMatchObject({
          data: Buffer.from("Hello World"),
          metadata: Buffer.from("World Hello"),
        });

        expect(mockStream.handler).toBeUndefined();
        expect(requested).toBe(10);
      });

      it("Handler Request and Send Next", () => {
        const mockStream = new MockStream();
        const mockHandler = mock<
          Cancellable & Requestable & OnExtensionSubscriber
        >();
        let payload: Payload;
        let sink: OnNextSubscriber &
          OnTerminalSubscriber &
          OnExtensionSubscriber;
        let requested: number;
        const responder = new RequestStreamResponderStream(
          1,
          mockStream,
          0,
          (p, requestN, sender) => {
            payload = p;
            sink = sender;
            requested = requestN;
            return mockHandler;
          },
          {
            type: FrameTypes.REQUEST_STREAM,
            streamId: 1,
            requestN: 2,
            flags: Flags.METADATA,
            data: Buffer.from("Hello World"),
            metadata: Buffer.from("World Hello"),
          }
        );

        expect(mockStream.handler).toBe(responder);

        sink.onNext(
          {
            data: Buffer.from("response1"),
            metadata: Buffer.from("response-meta1"),
          },
          false
        );
        sink.onNext(
          {
            data: Buffer.from("response2"),
            metadata: Buffer.from("response-meta2"),
          },
          true
        ); // sends on complete which has to be ignored

        expect(mockStream.frames).toMatchObject([
          {
            type: FrameTypes.PAYLOAD,
            streamId: 1,
            flags: Flags.NEXT | Flags.METADATA,
            data: Buffer.from("response1"),
            metadata: Buffer.from("response-meta1"),
          },
          {
            type: FrameTypes.PAYLOAD,
            streamId: 1,
            flags: Flags.NEXT | Flags.METADATA | Flags.COMPLETE,
            data: Buffer.from("response2"),
            metadata: Buffer.from("response-meta2"),
          },
        ]);
        expect(payload).toMatchObject({
          data: Buffer.from("Hello World"),
          metadata: Buffer.from("World Hello"),
        });

        expect(mockStream.handler).toBeUndefined();
        expect(requested).toBe(2);
      });

      it("Handler Request and Send Error", () => {
        const mockStream = new MockStream();
        const mockHandler = mock<
          Cancellable & Requestable & OnExtensionSubscriber
        >();
        let payload: Payload;
        let sink: OnNextSubscriber &
          OnTerminalSubscriber &
          OnExtensionSubscriber;
        let requested: number;
        const responder = new RequestStreamResponderStream(
          1,
          mockStream,
          0,
          (p, requestN, sender) => {
            payload = p;
            sink = sender;
            requested = requestN;
            return mockHandler;
          },
          {
            type: FrameTypes.REQUEST_STREAM,
            streamId: 1,
            requestN: 1,
            flags: Flags.METADATA,
            data: Buffer.from("Hello World"),
            metadata: Buffer.from("World Hello"),
          }
        );

        expect(mockStream.handler).toBe(responder);

        sink.onError(new Error("boom"));
        sink.onError(new Error("boom-bam"));

        expect(mockStream.frames).toMatchObject([
          {
            type: FrameTypes.ERROR,
            streamId: 1,
            flags: Flags.NONE,
            code: ErrorCodes.APPLICATION_ERROR,
            message: "boom",
          },
        ]);
        expect(payload).toMatchObject({
          data: Buffer.from("Hello World"),
          metadata: Buffer.from("World Hello"),
        });

        expect(requested).toBe(1);
        expect(mockStream.handler).toBeUndefined();
      });

      it("Cancel on close", () => {
        const mockStream = new MockStream();
        const mockHandler = mock<
          Cancellable & Requestable & OnExtensionSubscriber
        >();
        let payload: Payload;
        let sink: OnExtensionSubscriber &
          OnNextSubscriber &
          OnTerminalSubscriber;
        let requested: number;
        const responder = new RequestStreamResponderStream(
          1,
          mockStream,
          0,
          (p, requestN, s) => {
            sink = s;
            payload = p;
            requested = requestN;
            return mockHandler;
          },
          {
            type: FrameTypes.REQUEST_STREAM,
            flags: Flags.METADATA,
            data: Buffer.from("Hello World"),
            metadata: Buffer.from("world hello"),
            streamId: 1,
            requestN: 1,
          }
        );

        expect(mockStream.handler).toBe(responder);
        expect(mockStream.frames).toMatchObject([]);
        expect(payload).toMatchObject({
          data: Buffer.from("Hello World"),
          metadata: Buffer.from("world hello"),
        });

        responder.close();
        sink.onNext(
          {
            data: Buffer.alloc(0),
          },
          true
        );
        sink.onComplete();

        expect(requested).toBe(1);
        expect(mockStream.handler).toBeUndefined();
        expect(mockHandler.cancel).toBeCalled();
      });
    });

    describe("Fragmentable", () => {
      it("Handler Request and Send Complete", () => {
        const mockStream = new MockStream();
        const mockHandler = mock<
          Cancellable & Requestable & OnExtensionSubscriber
        >();
        let payload: Payload;
        let requested: number;
        const responder = new RequestStreamResponderStream(
          1,
          mockStream,
          0,
          (p, requestN, terminator) => {
            payload = p;
            requested = requestN;
            terminator.onComplete();
            return mockHandler;
          },
          {
            type: FrameTypes.REQUEST_STREAM,
            flags: Flags.FOLLOWS | Flags.METADATA,
            data: undefined,
            metadata: Buffer.from("world"),
            streamId: 1,
            requestN: 1,
          }
        );

        expect(mockStream.handler).toBe(responder);
        expect(mockStream.frames).toMatchObject([]);
        expect(payload).toBeUndefined();

        responder.handle({
          type: FrameTypes.PAYLOAD,
          flags: Flags.NEXT | Flags.FOLLOWS | Flags.METADATA,
          data: Buffer.from("he"),
          metadata: Buffer.from(" hello"),
          streamId: 1,
        });
        responder.handle({
          type: FrameTypes.PAYLOAD,
          flags: Flags.NEXT | Flags.FOLLOWS,
          data: Buffer.from("llo worldhe"),
          metadata: undefined,
          streamId: 1,
        });

        expect(mockStream.frames).toMatchObject([]);
        expect(payload).toBeUndefined();

        responder.handle({
          type: FrameTypes.PAYLOAD,
          flags: Flags.NEXT,
          data: Buffer.from("llo world"),
          metadata: undefined,
          streamId: 1,
        });

        expect(mockStream.handler).toBeUndefined();
        expect(mockStream.frames).toMatchObject([
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.COMPLETE,
            data: null,
            metadata: null,
            streamId: 1,
          },
        ]);
        expect(payload).toMatchObject({
          data: Buffer.concat([
            Buffer.from("hello world"),
            Buffer.from("hello world"),
          ]), // 22 bytes
          metadata: Buffer.from("world hello"),
        });
      });

      it("Handler Request and Send Responses", () => {
        const mockStream = new MockStream();
        const mockHandler = mock<
          Cancellable & Requestable & OnExtensionSubscriber
        >();
        let payload: Payload;
        let requested: number;
        const responder = new RequestStreamResponderStream(
          1,
          mockStream,
          11,
          (p, requestN, terminator) => {
            payload = p;
            requested = requestN;
            terminator.onNext(
              {
                data: Buffer.concat([
                  Buffer.from("hello world"),
                  Buffer.from("hello world"),
                ]), // 22 bytes
                metadata: Buffer.from("world hello"),
              },
              false
            );

            terminator.onNext(
              {
                data: Buffer.from("hello"),
              },
              false
            );

            terminator.onNext(
              {
                data: Buffer.from("world"),
              },
              true
            );
            return mockHandler;
          },
          {
            type: FrameTypes.REQUEST_STREAM,
            flags: Flags.FOLLOWS | Flags.METADATA,
            data: undefined,
            metadata: Buffer.from("world he"),
            streamId: 1,
            requestN: 1,
          }
        );

        expect(mockStream.handler).toBe(responder);
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

        expect(mockStream.frames).toMatchObject([
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.NEXT | Flags.FOLLOWS | Flags.METADATA,
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
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.NEXT,
            data: Buffer.from("hello"),
            metadata: undefined,
            streamId: 1,
          },
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.NEXT | Flags.COMPLETE,
            data: Buffer.from("world"),
            metadata: undefined,
            streamId: 1,
          },
        ]);
        expect(payload).toMatchObject({
          data: Buffer.concat([
            Buffer.from("hello world"),
            Buffer.from("hello world"),
          ]), // 22 bytes
          metadata: Buffer.from("world hello"),
        });
        expect(requested).toBe(1);
        expect(mockStream.handler).toBeUndefined();
      });

      it("Send error back on unexpected frame", () => {
        const mockStream = new MockStream();
        const mockHandler = mock<
          Cancellable & Requestable & OnExtensionSubscriber
        >();
        let payload: Payload;
        let requested: number;
        const responder = new RequestStreamResponderStream(
          1,
          mockStream,
          0,
          (p, requestN, terminator) => {
            payload = p;
            requested = requestN;
            terminator.onComplete();
            return mockHandler;
          },
          {
            type: FrameTypes.REQUEST_STREAM,
            flags: Flags.FOLLOWS | Flags.METADATA,
            data: undefined,
            metadata: Buffer.from("world he"),
            streamId: 1,
            requestN: 2,
          }
        );

        expect(mockStream.handler).toBe(responder);
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
            message: `Unexpected frame type [${FrameTypes.EXT}]`,
            streamId: 1,
          },
        ]);
        expect(requested).toBeUndefined();
        expect(payload).toBeUndefined();
        expect(mockStream.handler).toBeUndefined();
      });

      it("Cancel Reassembly on close", () => {
        const mockStream = new MockStream();
        const mockHandler = mock<
          Cancellable & Requestable & OnExtensionSubscriber
        >();
        let payload: Payload;
        let requested: number;
        const responder = new RequestStreamResponderStream(
          1,
          mockStream,
          0,
          (p, requestN, terminator) => {
            payload = p;
            requested = requestN;
            terminator.onComplete();
            return mockHandler;
          },
          {
            type: FrameTypes.REQUEST_STREAM,
            flags: Flags.FOLLOWS | Flags.METADATA,
            data: undefined,
            metadata: Buffer.from("world he"),
            streamId: 1,
            requestN: 1,
          }
        );

        expect(mockStream.frames).toMatchObject([]);
        expect(payload).toBeUndefined();

        responder.close();

        expect(requested).toBeUndefined();
        expect(responder.data).toBeUndefined();
        expect(responder.metadata).toBeUndefined();
      });

      it("Cancel Reassembly on Cancel Frame", () => {
        const mockStream = new MockStream();
        const mockHandler = mock<
          Cancellable & Requestable & OnExtensionSubscriber
        >();
        let payload: Payload;
        let requested: number;
        const responder = new RequestStreamResponderStream(
          1,
          mockStream,
          0,
          (p, requestN, terminator) => {
            payload = p;
            requested = requestN;
            terminator.onComplete();
            return mockHandler;
          },
          {
            type: FrameTypes.REQUEST_STREAM,
            flags: Flags.FOLLOWS | Flags.METADATA,
            data: undefined,
            metadata: Buffer.from("world he"),
            streamId: 1,
            requestN: 1,
          }
        );

        expect(mockStream.handler).toBe(responder);
        expect(mockStream.frames).toMatchObject([]);
        expect(payload).toBeUndefined();

        responder.handle({
          type: FrameTypes.CANCEL,
          streamId: 1,
          flags: Flags.NONE,
        });

        expect(responder.data).toBeUndefined();
        expect(responder.metadata).toBeUndefined();
        expect(mockStream.handler).toBeUndefined();
      });

      it("Cancel Reassembly on Error Frame", () => {
        const mockStream = new MockStream();
        const mockHandler = mock<
          Cancellable & Requestable & OnExtensionSubscriber
        >();
        let payload: Payload;
        const responder = new RequestStreamResponderStream(
          1,
          mockStream,
          0,
          (p, requestN, terminator) => {
            payload = p;
            terminator.onComplete();
            return mockHandler;
          },
          {
            type: FrameTypes.REQUEST_STREAM,
            flags: Flags.FOLLOWS | Flags.METADATA,
            data: undefined,
            metadata: Buffer.from("world he"),
            streamId: 1,
            requestN: 1,
          }
        );

        expect(mockStream.handler).toBe(responder);
        expect(mockStream.frames).toMatchObject([]);
        expect(payload).toBeUndefined();

        responder.handle({
          type: FrameTypes.ERROR,
          streamId: 1,
          flags: Flags.NONE,
          message: "boom",
          code: ErrorCodes.CANCELED,
        });

        expect(responder.data).toBeUndefined();
        expect(responder.metadata).toBeUndefined();
        expect(mockStream.handler).toBeUndefined();
      });
    });
  });
});
