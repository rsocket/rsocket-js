import { mock } from "jest-mock-extended";
import { ErrorCodes, Flags, FrameTypes } from "../src";
import { RSocketError } from "../src/Errors";
import { LeaseManager } from "../src/Lease";
import {
  RequestChannelRequesterStream,
  RequestChannelResponderStream,
} from "../src/RequestChannelStream";
import {
  Cancellable,
  OnExtensionSubscriber,
  OnNextSubscriber,
  OnTerminalSubscriber,
  Payload,
  Requestable,
} from "../src/RSocket";
import { MockStream } from "./test-utils/MockStream";

describe("RequestChannelStream Test", () => {
  describe("Requester", () => {
    describe("Non-Fragmentable", () => {
      [true, false].forEach((state) =>
        it(`Sends RequestChannelFrame(complete=${state}) on onReady event and handle unexpected frame`, () => {
          const mockStream = new MockStream();
          const mockHandler: OnTerminalSubscriber &
            OnNextSubscriber &
            OnExtensionSubscriber &
            Requestable &
            Cancellable = mock<
            OnTerminalSubscriber &
              OnNextSubscriber &
              OnExtensionSubscriber &
              Requestable &
              Cancellable
          >();
          const request = new RequestChannelRequesterStream(
            {
              data: Buffer.from("Hello"),
              metadata: Buffer.from(" World"),
            },
            state,
            mockHandler,
            0,
            1
          );

          request.handleReady(1, mockStream);

          expect(mockStream.frames).toMatchObject([
            {
              type: FrameTypes.REQUEST_CHANNEL,
              data: Buffer.from("Hello"),
              metadata: Buffer.from(" World"),
              flags: Flags.METADATA | (state ? Flags.COMPLETE : Flags.NONE),
              streamId: 1,
              requestN: 1,
            },
          ]);

          expect(mockStream.handler).toBe(request);
          expect(mockHandler.onError).not.toBeCalled();
          expect(mockHandler.onNext).not.toBeCalled();
          expect(mockHandler.onComplete).not.toBeCalled();

          request.handle({
            type: FrameTypes.REQUEST_RESPONSE,
            flags: Flags.NONE,
            streamId: 1,
            data: undefined,
            metadata: undefined,
          } as any);

          expect(mockHandler.onError).toBeCalledWith(
            new RSocketError(
              ErrorCodes.CANCELED,
              `Unexpected frame type [${FrameTypes.REQUEST_RESPONSE}]`
            )
          );
          expect(mockHandler.cancel).toBeCalledTimes(state ? 0 : 1);
          expect(mockHandler.onNext).not.toBeCalled();
          expect(mockHandler.onComplete).not.toBeCalled();
          expect(mockStream.handler).toBeUndefined();
        })
      );

      it("Sends RequestChannelFrame(complete=true) on onReady event and handle complete", () => {
        const mockStream = new MockStream();
        const mockHandler: OnTerminalSubscriber &
          OnNextSubscriber &
          OnExtensionSubscriber &
          Requestable &
          Cancellable = mock<
          OnTerminalSubscriber &
            OnNextSubscriber &
            OnExtensionSubscriber &
            Requestable &
            Cancellable
        >();
        const request = new RequestChannelRequesterStream(
          {
            data: Buffer.from("Hello"),
            metadata: Buffer.from(" World"),
          },
          true,
          mockHandler,
          0,
          1
        );

        request.handleReady(1, mockStream);

        expect(mockStream.handler).toBe(request);
        expect(mockStream.frames).toMatchObject([
          {
            type: FrameTypes.REQUEST_CHANNEL,
            data: Buffer.from("Hello"),
            metadata: Buffer.from(" World"),
            flags: Flags.METADATA | Flags.COMPLETE,
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
        expect(mockHandler.cancel).not.toBeCalled();
        expect(mockHandler.onComplete).toBeCalled();
        expect(mockHandler.onError).not.toBeCalled();
        expect(mockHandler.onNext).not.toBeCalled();
        expect(mockStream.handler).toBeUndefined();
      });

      it("Sends RequestChannelFrame(complete=false) on onReady event and handle complete", () => {
        const mockStream = new MockStream();
        const mockHandler: OnTerminalSubscriber &
          OnNextSubscriber &
          OnExtensionSubscriber &
          Requestable &
          Cancellable = mock<
          OnTerminalSubscriber &
            OnNextSubscriber &
            OnExtensionSubscriber &
            Requestable &
            Cancellable
        >();
        const request = new RequestChannelRequesterStream(
          {
            data: Buffer.from("Hello"),
            metadata: Buffer.from(" World"),
          },
          false,
          mockHandler,
          0,
          1
        );

        request.handleReady(1, mockStream);

        expect(mockStream.handler).toBe(request);
        expect(mockStream.frames.pop()).toMatchObject({
          type: FrameTypes.REQUEST_CHANNEL,
          data: Buffer.from("Hello"),
          metadata: Buffer.from(" World"),
          flags: Flags.METADATA,
          requestN: 1,
          streamId: 1,
        });
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

        expect(mockHandler.cancel).not.toBeCalled();
        expect(mockHandler.onComplete).toBeCalled();
        expect(mockHandler.onError).not.toBeCalled();
        expect(mockHandler.onNext).not.toBeCalled();
        expect(mockStream.handler).toBe(request);

        request.onComplete();
        expect(mockStream.frames.pop()).toMatchObject({
          type: FrameTypes.PAYLOAD,
          data: null,
          metadata: null,
          flags: Flags.COMPLETE,
          streamId: 1,
        });
      });

      it("Sends RequestChannelFrame on onReady event and handle next", () => {
        const mockStream = new MockStream();
        const mockHandler: OnTerminalSubscriber &
          OnNextSubscriber &
          OnExtensionSubscriber &
          Requestable &
          Cancellable = mock<
          OnTerminalSubscriber &
            OnNextSubscriber &
            OnExtensionSubscriber &
            Requestable &
            Cancellable
        >();
        const request = new RequestChannelRequesterStream(
          {
            data: Buffer.from("Hello"),
            metadata: Buffer.from(" World"),
          },
          false,
          mockHandler,
          0,
          1
        );

        request.request(2);
        request.handleReady(1, mockStream);

        expect(mockStream.frames.pop()).toMatchObject({
          type: FrameTypes.REQUEST_CHANNEL,
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

        expect(mockStream.handler).toBe(request);

        request.request(1); // should be ignored since inbound is done
        request.onComplete();

        expect(mockStream.frames).toMatchObject([
          {
            type: FrameTypes.PAYLOAD,
            flags: Flags.COMPLETE,
            streamId: 1,
            data: null,
            metadata: null,
          },
        ]);

        expect(mockHandler.cancel).not.toBeCalled();
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

      it("Sends RequestChannelFrame on onReady event and handle error", () => {
        const mockStream = new MockStream();
        const mockHandler: OnTerminalSubscriber &
          OnNextSubscriber &
          OnExtensionSubscriber &
          Requestable &
          Cancellable = mock<
          OnTerminalSubscriber &
            OnNextSubscriber &
            OnExtensionSubscriber &
            Requestable &
            Cancellable
        >();
        const request = new RequestChannelRequesterStream(
          {
            data: Buffer.from("Hello"),
            metadata: Buffer.from(" World"),
          },
          false,
          mockHandler,
          0,
          1
        );

        request.handleReady(1, mockStream);

        expect(mockStream.frames).toMatchObject([
          {
            type: FrameTypes.REQUEST_CHANNEL,
            data: Buffer.from("Hello"),
            metadata: Buffer.from(" World"),
            flags: Flags.METADATA,
            streamId: 1,
            requestN: 1,
          },
        ]);

        expect(mockStream.handler).toBe(request);
        expect(mockHandler.cancel).not.toBeCalled();
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
        expect(mockHandler.cancel).toBeCalled();
        expect(mockHandler.onNext).not.toBeCalled();
        expect(mockHandler.onComplete).not.toBeCalled();
        expect(mockStream.handler).toBeUndefined();
      });

      it("Sends RequestChannelFrame on onReady event and send error", () => {
        const mockStream = new MockStream();
        const mockHandler: OnTerminalSubscriber &
          OnNextSubscriber &
          OnExtensionSubscriber &
          Requestable &
          Cancellable = mock<
          OnTerminalSubscriber &
            OnNextSubscriber &
            OnExtensionSubscriber &
            Requestable &
            Cancellable
        >();
        const request = new RequestChannelRequesterStream(
          {
            data: Buffer.from("Hello"),
            metadata: Buffer.from(" World"),
          },
          false,
          mockHandler,
          0,
          1
        );

        request.handleReady(1, mockStream);

        expect(mockStream.frames.pop()).toMatchObject({
          type: FrameTypes.REQUEST_CHANNEL,
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

        request.onError(new RSocketError(ErrorCodes.APPLICATION_ERROR, "Boom"));

        expect(mockStream.frames.pop()).toMatchObject({
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

      it("Sends RequestChannelFrame on onReady event and handle remote requestN", () => {
        const mockStream = new MockStream();
        const mockHandler: OnTerminalSubscriber &
          OnNextSubscriber &
          OnExtensionSubscriber &
          Requestable &
          Cancellable = mock<
          OnTerminalSubscriber &
            OnNextSubscriber &
            OnExtensionSubscriber &
            Requestable &
            Cancellable
        >();
        const request = new RequestChannelRequesterStream(
          {
            data: Buffer.from("Hello"),
            metadata: Buffer.from(" World"),
          },
          false,
          mockHandler,
          0,
          1
        );

        request.handleReady(1, mockStream);

        expect(mockStream.frames).toMatchObject([
          {
            type: FrameTypes.REQUEST_CHANNEL,
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

        expect(mockStream.handler).toBe(request);
        expect(mockHandler.request).toBeCalledWith(1);

        request.handle({
          type: FrameTypes.CANCEL,
          flags: Flags.NONE,
          streamId: 1,
        });

        expect(mockStream.handler).toBe(request);
        expect(mockHandler.cancel).toBeCalled();

        request.handle({
          type: FrameTypes.PAYLOAD,
          flags: Flags.COMPLETE,
          streamId: 1,
          data: null,
          metadata: null,
        });
        expect(mockHandler.onError).not.toBeCalledWith();
        expect(mockHandler.onNext).not.toBeCalled();
        expect(mockHandler.onComplete).toBeCalled();
        expect(mockStream.handler).toBeUndefined();
      });

      it("Sends RequestChannelFrame on onReady event and then cancel", () => {
        const mockStream = new MockStream();
        const mockHandler: OnTerminalSubscriber &
          OnNextSubscriber &
          OnExtensionSubscriber &
          Requestable &
          Cancellable = mock<
          OnTerminalSubscriber &
            OnNextSubscriber &
            OnExtensionSubscriber &
            Requestable &
            Cancellable
        >();
        const request = new RequestChannelRequesterStream(
          {
            data: Buffer.from("Hello"),
            metadata: Buffer.from(" World"),
          },
          false,
          mockHandler,
          0,
          1
        );

        request.handleReady(1, mockStream);

        expect(mockStream.frames.pop()).toMatchObject({
          type: FrameTypes.REQUEST_CHANNEL,
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

        expect(mockHandler.request).not.toBeCalled();
        expect(mockHandler.cancel).toBeCalled();
        expect(mockHandler.onError).not.toBeCalled();
        expect(mockHandler.onNext).not.toBeCalled();
        expect(mockHandler.onComplete).not.toBeCalled();
        expect(mockStream.handler).toBeUndefined();
      });
    });

    describe("Fragmentable", () => {
      it("Sends RequestChannelFrame on onReady event", () => {
        const mockStream = new MockStream();
        const mockHandler: OnTerminalSubscriber &
          OnNextSubscriber &
          OnExtensionSubscriber &
          Requestable &
          Cancellable = mock<
          OnTerminalSubscriber &
            OnNextSubscriber &
            OnExtensionSubscriber &
            Requestable &
            Cancellable
        >();
        const request = new RequestChannelRequesterStream(
          {
            data: Buffer.concat([
              Buffer.from("hello world"),
              Buffer.from("hello world"),
            ]), // 22 bytes
            metadata: Buffer.from("world hello"),
          },
          false,
          mockHandler,
          11,
          1
        );

        request.handleReady(1, mockStream);

        expect(mockStream.frames).toMatchObject([
          {
            type: FrameTypes.REQUEST_CHANNEL,
            flags: Flags.FOLLOWS | Flags.METADATA,
            data: undefined,
            metadata: Buffer.from("world"),
            streamId: 1,
            requestN: 1,
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

        request.onComplete();

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

      it("Sends RequestChannelFrame on onReady event and fail on unexpected frame", () => {
        const mockStream = new MockStream();
        const mockHandler: OnTerminalSubscriber &
          OnNextSubscriber &
          OnExtensionSubscriber &
          Requestable &
          Cancellable = mock<
          OnTerminalSubscriber &
            OnNextSubscriber &
            OnExtensionSubscriber &
            Requestable &
            Cancellable
        >();
        const request = new RequestChannelRequesterStream(
          {
            data: Buffer.concat([
              Buffer.from("hello world"),
              Buffer.from("hello world"),
            ]), // 22 bytes
            metadata: Buffer.from("world hello"),
          },
          false,
          mockHandler,
          11,
          1
        );

        request.handleReady(1, mockStream);

        expect(mockStream.frames).toMatchObject([
          {
            type: FrameTypes.REQUEST_CHANNEL,
            flags: Flags.FOLLOWS | Flags.METADATA,
            data: undefined,
            metadata: Buffer.from("world"),
            streamId: 1,
            requestN: 1,
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
            `Unexpected frame type [${FrameTypes.REQUEST_N}] during reassembly`
          )
        );
      });
    });

    it("Doesn't sends RequestChannelFrame on onReady event if request was cancelled", () => {
      const mockStream = new MockStream();
      const mockHandler: OnTerminalSubscriber &
        OnNextSubscriber &
        OnExtensionSubscriber &
        Requestable &
        Cancellable = mock<
        OnTerminalSubscriber &
          OnNextSubscriber &
          OnExtensionSubscriber &
          Requestable &
          Cancellable
      >();
      const request = new RequestChannelRequesterStream(
        {
          data: Buffer.from("Hello"),
          metadata: Buffer.from(" World"),
        },
        false,
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

    it("Doesn't sends RequestChannelFrame on onReady event if request was cancelled and removed from lease manager", () => {
      const mockStream = new MockStream();
      const mockHandler: OnTerminalSubscriber &
        OnNextSubscriber &
        OnExtensionSubscriber &
        Requestable &
        Cancellable = mock<
        OnTerminalSubscriber &
          OnNextSubscriber &
          OnExtensionSubscriber &
          Requestable &
          Cancellable
      >();
      const mockLeasManager: LeaseManager = mock<LeaseManager>();
      const request = new RequestChannelRequesterStream(
        {
          data: Buffer.from("Hello"),
          metadata: Buffer.from(" World"),
        },
        false,
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
        OnExtensionSubscriber &
        Requestable &
        Cancellable = mock<
        OnTerminalSubscriber &
          OnNextSubscriber &
          OnExtensionSubscriber &
          Requestable &
          Cancellable
      >();
      const request = new RequestChannelRequesterStream(
        {
          data: Buffer.from("Hello"),
          metadata: Buffer.from(" World"),
        },
        false,
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
        OnExtensionSubscriber &
        Requestable &
        Cancellable = mock<
        OnTerminalSubscriber &
          OnNextSubscriber &
          OnExtensionSubscriber &
          Requestable &
          Cancellable
      >();
      const request = new RequestChannelRequesterStream(
        {
          data: Buffer.from("Hello"),
          metadata: Buffer.from(" World"),
        },
        false,
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

    it("Send request and cancel with following frames dropped", () => {
      const mockStream = new MockStream();
      const mockHandler: OnTerminalSubscriber &
        OnNextSubscriber &
        OnExtensionSubscriber &
        Requestable &
        Cancellable = mock<
        OnTerminalSubscriber &
          OnNextSubscriber &
          OnExtensionSubscriber &
          Requestable &
          Cancellable
      >();
      const request = new RequestChannelRequesterStream(
        {
          data: Buffer.from("Hello"),
          metadata: Buffer.from(" World"),
        },
        false,
        mockHandler,
        0,
        1
      );

      request.handleReady(1, mockStream);
      request.cancel();

      expect(mockStream.handler).toBeUndefined();
      expect(mockStream.frames.shift()).toMatchObject({
        type: FrameTypes.REQUEST_CHANNEL,
        streamId: 1,
        flags: Flags.METADATA,
        requestN: 1,
        data: Buffer.from("Hello"),
        metadata: Buffer.from(" World"),
      });
      expect(mockStream.frames.shift()).toMatchObject({
        type: FrameTypes.CANCEL,
        streamId: 1,
        flags: Flags.NONE,
      });
      request.onNext(
        {
          data: Buffer.allocUnsafe(0),
          metadata: null,
        },
        false
      );
      request.onComplete();
      expect(mockStream.frames).toHaveLength(0);
      expect(mockHandler.onError).not.toBeCalled();
      expect(mockHandler.onNext).not.toBeCalled();
      expect(mockHandler.onComplete).not.toBeCalled();
      expect(mockHandler.cancel).toBeCalled();
    });

    it("Send request and receive complete and cancel", () => {
      const mockStream = new MockStream();
      const mockHandler: OnTerminalSubscriber &
        OnNextSubscriber &
        OnExtensionSubscriber &
        Requestable &
        Cancellable = mock<
        OnTerminalSubscriber &
          OnNextSubscriber &
          OnExtensionSubscriber &
          Requestable &
          Cancellable
      >();
      const request = new RequestChannelRequesterStream(
        {
          data: Buffer.from("Hello"),
          metadata: Buffer.from(" World"),
        },
        false,
        mockHandler,
        0,
        1
      );

      request.handleReady(1, mockStream);
      expect(mockStream.frames.shift()).toMatchObject({
        type: FrameTypes.REQUEST_CHANNEL,
        streamId: 1,
        flags: Flags.METADATA,
        requestN: 1,
        data: Buffer.from("Hello"),
        metadata: Buffer.from(" World"),
      });
      request.handle({
        type: FrameTypes.PAYLOAD,
        streamId: 1,
        flags: Flags.COMPLETE,
        data: null,
        metadata: null,
      });
      expect(mockStream.handler).toBe(request);

      request.handle({
        type: FrameTypes.CANCEL,
        streamId: 1,
        flags: Flags.NONE,
      });
      expect(mockStream.handler).toBeUndefined();
      request.onNext(
        {
          data: Buffer.allocUnsafe(0),
          metadata: null,
        },
        false
      );
      request.cancel();
      request.onComplete();
      expect(mockStream.frames).toHaveLength(0);
      expect(mockHandler.onError).not.toBeCalled();
      expect(mockHandler.onNext).not.toBeCalled();
      expect(mockHandler.onComplete).toBeCalled();
      expect(mockHandler.cancel).toBeCalled();
    });

    it("Send request and receive cancel and error", () => {
      const mockStream = new MockStream();
      const mockHandler = mock<
        OnTerminalSubscriber &
          OnNextSubscriber &
          OnExtensionSubscriber &
          Requestable &
          Cancellable
      >();
      const request = new RequestChannelRequesterStream(
        {
          data: Buffer.from("Hello"),
          metadata: Buffer.from(" World"),
        },
        false,
        mockHandler,
        0,
        1
      );

      request.handleReady(1, mockStream);
      expect(mockStream.frames.shift()).toMatchObject({
        type: FrameTypes.REQUEST_CHANNEL,
        streamId: 1,
        flags: Flags.METADATA,
        requestN: 1,
        data: Buffer.from("Hello"),
        metadata: Buffer.from(" World"),
      });

      request.handle({
        type: FrameTypes.CANCEL,
        streamId: 1,
        flags: Flags.NONE,
      });

      expect(mockStream.handler).toBe(request);
      request.handle({
        type: FrameTypes.ERROR,
        streamId: 1,
        flags: Flags.NONE,
        code: ErrorCodes.APPLICATION_ERROR,
        message: "boom",
      });
      expect(mockStream.handler).toBeUndefined();
      request.onNext(
        {
          data: Buffer.allocUnsafe(0),
          metadata: null,
        },
        false
      );
      request.cancel();
      request.onComplete();
      expect(mockStream.frames).toHaveLength(0);
      expect(mockHandler.onError).toBeCalled();
      expect(mockHandler.onNext).not.toBeCalled();
      expect(mockHandler.onComplete).not.toBeCalled();
      expect(mockHandler.cancel).toBeCalled();
    });

    for (const isCompleted of [true, false]) {
      it(`Send request(isCompleted=${isCompleted}) and receive error`, () => {
        const mockStream = new MockStream();
        const mockHandler = mock<
          OnTerminalSubscriber &
            OnNextSubscriber &
            OnExtensionSubscriber &
            Requestable &
            Cancellable
        >();
        const request = new RequestChannelRequesterStream(
          {
            data: Buffer.from("Hello"),
            metadata: Buffer.from(" World"),
          },
          isCompleted,
          mockHandler,
          0,
          1
        );

        request.handleReady(1, mockStream);
        expect(mockStream.frames.shift()).toMatchObject({
          type: FrameTypes.REQUEST_CHANNEL,
          streamId: 1,
          flags: Flags.METADATA | (isCompleted ? Flags.COMPLETE : Flags.NONE),
          requestN: 1,
          data: Buffer.from("Hello"),
          metadata: Buffer.from(" World"),
        });
        request.handle({
          type: FrameTypes.ERROR,
          streamId: 1,
          flags: Flags.NONE,
          code: ErrorCodes.APPLICATION_ERROR,
          message: "boom",
        });
        request.cancel();
        request.onNext(
          {
            data: Buffer.allocUnsafe(0),
            metadata: null,
          },
          false
        );
        request.onComplete();
        expect(mockStream.frames).toHaveLength(0);
        expect(mockHandler.onError.mock.calls[0]).toMatchObject([
          new RSocketError(ErrorCodes.APPLICATION_ERROR, "boom"),
        ]);
        expect(mockHandler.onNext).not.toBeCalled();
        expect(mockHandler.onComplete).not.toBeCalled();
        expect(mockHandler.cancel).toBeCalledTimes(isCompleted ? 0 : 1);
      });

      it(`Send request(isCompleted=${isCompleted}) and send error`, () => {
        const mockStream = new MockStream();
        const mockHandler = mock<
          OnTerminalSubscriber &
            OnNextSubscriber &
            OnExtensionSubscriber &
            Requestable &
            Cancellable
        >();
        const request = new RequestChannelRequesterStream(
          {
            data: Buffer.from("Hello"),
            metadata: Buffer.from(" World"),
          },
          isCompleted,
          mockHandler,
          0,
          1
        );

        request.handleReady(1, mockStream);
        expect(mockStream.frames.shift()).toMatchObject({
          type: FrameTypes.REQUEST_CHANNEL,
          streamId: 1,
          flags: Flags.METADATA | (isCompleted ? Flags.COMPLETE : Flags.NONE),
          requestN: 1,
          data: Buffer.from("Hello"),
          metadata: Buffer.from(" World"),
        });
        request.handle({
          type: FrameTypes.ERROR,
          streamId: 1,
          flags: Flags.NONE,
          code: ErrorCodes.APPLICATION_ERROR,
          message: "boom",
        });
        request.cancel();
        request.onNext(
          {
            data: Buffer.allocUnsafe(0),
            metadata: null,
          },
          false
        );
        request.onComplete();
        expect(mockStream.frames).toHaveLength(0);
        expect(mockHandler.onError.mock.calls[0]).toMatchObject([
          new RSocketError(ErrorCodes.APPLICATION_ERROR, "boom"),
        ]);
        expect(mockHandler.onNext).not.toBeCalled();
        expect(mockHandler.onComplete).not.toBeCalled();
        expect(mockHandler.cancel).toBeCalledTimes(isCompleted ? 0 : 1);
      });
    }
  });

  describe("Responder", () => {
    describe("Non-Fragmentable", () => {
      it("Handler Request and Send Complete", () => {
        const mockStream = new MockStream();
        const mockHandler = mock<
          Cancellable &
            Requestable &
            OnExtensionSubscriber &
            OnTerminalSubscriber &
            OnNextSubscriber
        >();
        let payload: Payload;
        let sink: Cancellable &
          Requestable &
          OnExtensionSubscriber &
          OnTerminalSubscriber &
          OnNextSubscriber;
        let isCompleted: boolean;
        let requested: number;
        const responder = new RequestChannelResponderStream(
          1,
          mockStream,
          0,
          (p, requestN, c, sender) => {
            payload = p;
            isCompleted = c;
            sink = sender;
            requested = requestN;
            return mockHandler;
          },
          {
            type: FrameTypes.REQUEST_CHANNEL,
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

        responder.handle({
          type: FrameTypes.PAYLOAD,
          streamId: 1,
          flags: Flags.NEXT,
          data: Buffer.from("test"),
          metadata: null,
        });

        responder.handle({
          type: FrameTypes.PAYLOAD,
          streamId: 1,
          flags: Flags.COMPLETE,
          data: null,
          metadata: null,
        });

        expect(mockStream.handler).toBeUndefined();
        expect(requested).toBe(10);
        expect(mockHandler.onComplete).toBeCalled();
        expect((mockHandler.onNext as jest.Mock).mock.calls[0]).toMatchObject([
          {
            data: Buffer.from("test"),
            metadata: null,
          },
          false,
        ]);
        expect(mockHandler.cancel).not.toBeCalled();
      });

      it("Handler Request and Send Next", () => {
        const mockStream = new MockStream();
        const mockHandler = mock<
          Cancellable &
            Requestable &
            OnExtensionSubscriber &
            OnTerminalSubscriber &
            OnNextSubscriber
        >();
        let payload: Payload;
        let isCompleted: boolean;
        let sink: Cancellable &
          Requestable &
          OnExtensionSubscriber &
          OnTerminalSubscriber &
          OnNextSubscriber;
        let requested: number;
        const responder = new RequestChannelResponderStream(
          1,
          mockStream,
          0,
          (p, requestN, c, sender) => {
            payload = p;
            isCompleted = c;
            sink = sender;
            requested = requestN;
            return mockHandler;
          },
          {
            type: FrameTypes.REQUEST_CHANNEL,
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

        responder.handle({
          type: FrameTypes.PAYLOAD,
          streamId: 1,
          flags: Flags.NEXT | Flags.METADATA | Flags.COMPLETE,
          data: Buffer.from("response2"),
          metadata: Buffer.from("response-meta2"),
        });

        expect(mockStream.handler).toBeUndefined();
        expect(mockHandler.onNext.mock.calls[0]).toMatchObject([
          {
            data: Buffer.from("response2"),
            metadata: Buffer.from("response-meta2"),
          },
          true,
        ]);
        expect(mockHandler.onComplete).not.toBeCalled();
        expect(mockHandler.cancel).not.toBeCalled();
        expect(requested).toBe(2);
      });

      it("Handler Request and Send Error", () => {
        const mockStream = new MockStream();
        const mockHandler = mock<
          Cancellable &
            Requestable &
            OnExtensionSubscriber &
            OnTerminalSubscriber &
            OnNextSubscriber
        >();
        let payload: Payload;
        let isCompleted: boolean;
        let sink: Cancellable &
          Requestable &
          OnExtensionSubscriber &
          OnTerminalSubscriber &
          OnNextSubscriber;
        let requested: number;
        const responder = new RequestChannelResponderStream(
          1,
          mockStream,
          0,
          (p, requestN, c, sender) => {
            payload = p;
            sink = sender;
            isCompleted = c;
            requested = requestN;
            return mockHandler;
          },
          {
            type: FrameTypes.REQUEST_CHANNEL,
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
          Cancellable &
            Requestable &
            OnExtensionSubscriber &
            OnTerminalSubscriber &
            OnNextSubscriber
        >();
        let payload: Payload;
        let isCompleted: boolean;
        let sink: Cancellable &
          Requestable &
          OnExtensionSubscriber &
          OnTerminalSubscriber &
          OnNextSubscriber;
        let requested: number;
        const responder = new RequestChannelResponderStream(
          1,
          mockStream,
          0,
          (p, requestN, c, s) => {
            sink = s;
            payload = p;
            isCompleted = c;
            requested = requestN;
            return mockHandler;
          },
          {
            type: FrameTypes.REQUEST_CHANNEL,
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

        mockStream.disconnect(responder);
        responder.close();
        sink.onNext(
          {
            data: Buffer.alloc(0),
          },
          true
        );
        sink.onComplete();

        expect(mockStream.frames).toMatchObject([]);

        expect(requested).toBe(1);
        expect(mockStream.handler).toBeUndefined();
        expect(mockHandler.cancel).toBeCalled();
      });

      it("Send exception from handler", () => {
        const mockStream = new MockStream();
        let payload: Payload;
        let sink: OnNextSubscriber &
          OnTerminalSubscriber &
          OnExtensionSubscriber;
        const responder = new RequestChannelResponderStream(
          1,
          mockStream,
          0,
          (p, n, isCompleted, sender) => {
            payload = p;
            sink = sender;
            throw new Error("boom");
          },
          {
            type: FrameTypes.REQUEST_CHANNEL,
            flags: Flags.METADATA,
            data: Buffer.from("hello world"),
            metadata: Buffer.from("world hello"),
            requestN: 1,
            streamId: 1,
          }
        );

        expect(mockStream.frames.pop()).toMatchObject({
          type: FrameTypes.ERROR,
          streamId: 1,
          flags: Flags.NONE,
          code: ErrorCodes.APPLICATION_ERROR,
          message: "boom",
        });
        sink.onComplete();
        expect(mockStream.frames).toHaveLength(0);
        expect(payload).toMatchObject({
          data: Buffer.from("hello world"),
          metadata: Buffer.from("world hello"),
        });

        expect(mockStream.handler).toBeUndefined();
      });

      it("Drop exception from handler and cancel inbound if complete earlier", () => {
        const mockStream = new MockStream();
        let payload: Payload;
        let sink: OnNextSubscriber &
          OnTerminalSubscriber &
          OnExtensionSubscriber;
        const responder = new RequestChannelResponderStream(
          1,
          mockStream,
          0,
          (p, n, isCompleted, sender) => {
            payload = p;
            sink = sender;
            sender.onComplete();
            throw new Error("boom");
          },
          {
            type: FrameTypes.REQUEST_CHANNEL,
            flags: Flags.METADATA,
            data: Buffer.from("hello world"),
            metadata: Buffer.from("world hello"),
            streamId: 1,
            requestN: 1,
          }
        );

        expect(mockStream.frames.shift()).toMatchObject({
          type: FrameTypes.PAYLOAD,
          flags: Flags.COMPLETE,
          streamId: 1,
          data: null,
          metadata: null,
        });
        expect(mockStream.frames.shift()).toMatchObject({
          type: FrameTypes.CANCEL,
          streamId: 1,
          flags: Flags.NONE,
        });
        expect(mockStream.frames).toHaveLength(0);
        expect(payload).toMatchObject({
          data: Buffer.from("hello world"),
          metadata: Buffer.from("world hello"),
        });

        expect(mockStream.handler).toBeUndefined();
      });

      it("Drop exception from handler if complete and cancelled earlier", () => {
        const mockStream = new MockStream();
        let payload: Payload;
        let sink: OnNextSubscriber &
          OnTerminalSubscriber &
          OnExtensionSubscriber;
        const responder = new RequestChannelResponderStream(
          1,
          mockStream,
          0,
          (p, n, isCompleted, sender) => {
            payload = p;
            sink = sender;
            sender.cancel();
            sender.onComplete();
            throw new Error("boom");
          },
          {
            type: FrameTypes.REQUEST_CHANNEL,
            flags: Flags.METADATA,
            data: Buffer.from("hello world"),
            metadata: Buffer.from("world hello"),
            streamId: 1,
            requestN: 1,
          }
        );

        expect(mockStream.frames.shift()).toMatchObject({
          type: FrameTypes.CANCEL,
          streamId: 1,
          flags: Flags.NONE,
        });
        expect(mockStream.frames.shift()).toMatchObject({
          type: FrameTypes.PAYLOAD,
          streamId: 1,
          flags: Flags.COMPLETE,
          data: null,
          metadata: null,
        });
        expect(mockStream.frames).toHaveLength(0);
        expect(payload).toMatchObject({
          data: Buffer.from("hello world"),
          metadata: Buffer.from("world hello"),
        });

        expect(mockStream.handler).toBeUndefined();
      });

      it("Drop exception from handler if complete on both sides earlier", () => {
        const mockStream = new MockStream();
        let payload: Payload;
        let sink: OnNextSubscriber &
          OnTerminalSubscriber &
          OnExtensionSubscriber;
        const responder = new RequestChannelResponderStream(
          1,
          mockStream,
          0,
          (p, n, isCompleted, sender) => {
            payload = p;
            sink = sender;
            sender.onComplete();
            throw new Error("boom");
          },
          {
            type: FrameTypes.REQUEST_CHANNEL,
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
          flags: Flags.NEXT | Flags.COMPLETE,
          data: Buffer.from("llo world"),
          metadata: undefined,
          streamId: 1,
        });

        expect(mockStream.frames.shift()).toMatchObject({
          type: FrameTypes.PAYLOAD,
          streamId: 1,
          flags: Flags.COMPLETE,
          data: null,
          metadata: null,
        });
        expect(mockStream.frames).toHaveLength(0);
        expect(payload).toMatchObject({
          data: Buffer.concat([
            Buffer.from("hello world"),
            Buffer.from("hello world"),
          ]), // 22 bytes
          metadata: Buffer.from("world hello"),
        });

        expect(mockStream.handler).toBeUndefined();
      });

      it("Drop exception from handler if errored", () => {
        const mockStream = new MockStream();
        let payload: Payload;
        let sink: OnNextSubscriber &
          OnTerminalSubscriber &
          OnExtensionSubscriber;
        const responder = new RequestChannelResponderStream(
          1,
          mockStream,
          0,
          (p, n, isCompleted, sender) => {
            payload = p;
            sink = sender;
            sender.onError(
              new RSocketError(ErrorCodes.APPLICATION_ERROR, "boom1")
            );
            throw new Error("boom");
          },
          {
            type: FrameTypes.REQUEST_CHANNEL,
            flags: Flags.METADATA | Flags.COMPLETE,
            data: Buffer.from("hello world"),
            metadata: Buffer.from("world hello"),
            streamId: 1,
            requestN: 1,
          }
        );

        expect(mockStream.frames.shift()).toMatchObject({
          type: FrameTypes.ERROR,
          streamId: 1,
          flags: Flags.NONE,
        });
        expect(mockStream.frames).toHaveLength(0);
        expect(payload).toMatchObject({
          data: Buffer.from("hello world"),
          metadata: Buffer.from("world hello"),
        });

        expect(mockStream.handler).toBeUndefined();
      });

      it("send error should terminate execution", () => {
        const mockStream = new MockStream();
        let payload: Payload;
        const mockHandler = mock<
          Cancellable &
            Requestable &
            OnExtensionSubscriber &
            OnTerminalSubscriber &
            OnNextSubscriber
        >();
        let sink: OnNextSubscriber &
          OnTerminalSubscriber &
          OnExtensionSubscriber;
        const responder = new RequestChannelResponderStream(
          1,
          mockStream,
          0,
          (p, n, isCompleted, sender) => {
            payload = p;
            sink = sender;
            sender.onError(
              new RSocketError(ErrorCodes.APPLICATION_ERROR, "boom1")
            );
            return mockHandler;
          },
          {
            type: FrameTypes.REQUEST_CHANNEL,
            flags: Flags.METADATA | Flags.COMPLETE,
            data: Buffer.from("hello world"),
            metadata: Buffer.from("world hello"),
            streamId: 1,
            requestN: 1,
          }
        );

        expect(mockStream.frames.shift()).toMatchObject({
          type: FrameTypes.ERROR,
          streamId: 1,
          flags: Flags.NONE,
        });
        expect(mockStream.frames).toHaveLength(0);
        expect(payload).toMatchObject({
          data: Buffer.from("hello world"),
          metadata: Buffer.from("world hello"),
        });

        expect(mockStream.handler).toBeUndefined();
        expect(mockHandler.onError).not.toBeCalled();
        expect(mockHandler.onComplete).not.toBeCalled();
        expect(mockHandler.onNext).not.toBeCalled();
        expect(mockHandler.cancel).not.toBeCalled();
      });
    });

    describe("Fragmentable", () => {
      for (const shouldBeCompleted of [true, false]) {
        it(`Handle ${
          shouldBeCompleted ? "completed" : "uncompleted"
        } Request and respond with onComplete`, () => {
          const mockStream = new MockStream();
          const mockHandler = mock<
            Cancellable &
              Requestable &
              OnExtensionSubscriber &
              OnTerminalSubscriber &
              OnNextSubscriber
          >();
          let payload: Payload;
          let isCompleted: boolean;
          let requested: number;
          const responder = new RequestChannelResponderStream(
            1,
            mockStream,
            0,
            (p, requestN, c, terminator) => {
              payload = p;
              isCompleted = c;
              requested = requestN;
              terminator.onComplete();
              return mockHandler;
            },
            {
              type: FrameTypes.REQUEST_CHANNEL,
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
            flags:
              Flags.NEXT | (shouldBeCompleted ? Flags.COMPLETE : Flags.NONE),
            data: Buffer.from("llo world"),
            metadata: undefined,
            streamId: 1,
          });

          if (!shouldBeCompleted) {
            responder.handle({
              type: FrameTypes.PAYLOAD,
              streamId: 1,
              flags: Flags.COMPLETE,
              data: null,
              metadata: null,
            });
          }

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
      }

      it("Handler Request and Send Complete and then cancel", () => {
        const mockStream = new MockStream();
        const mockHandler = mock<
          Cancellable &
            Requestable &
            OnExtensionSubscriber &
            OnTerminalSubscriber &
            OnNextSubscriber
        >();
        let payload: Payload;
        let isCompleted: boolean;
        let requested: number;
        const responder = new RequestChannelResponderStream(
          1,
          mockStream,
          0,
          (p, requestN, c, terminator) => {
            payload = p;
            isCompleted = c;
            requested = requestN;
            terminator.cancel();
            terminator.onComplete();
            return mockHandler;
          },
          {
            type: FrameTypes.REQUEST_CHANNEL,
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
            type: FrameTypes.CANCEL,
            flags: Flags.NONE,
            streamId: 1,
          },
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

      for (const completeOnNext of [true, false]) {
        it("Handler RequestChannel and inbound onNext and Send Responses", () => {
          const mockStream = new MockStream();
          const mockHandler = mock<
            Cancellable &
              Requestable &
              OnExtensionSubscriber &
              OnTerminalSubscriber &
              OnNextSubscriber
          >();
          let payload: Payload;
          let isCompleted: boolean;
          let requested: number;
          const responder = new RequestChannelResponderStream(
            1,
            mockStream,
            11,
            (p, requestN, c, terminator) => {
              payload = p;
              isCompleted = c;
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
              type: FrameTypes.REQUEST_CHANNEL,
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

          responder.handle({
            type: FrameTypes.PAYLOAD,
            flags: Flags.NEXT | Flags.FOLLOWS | Flags.METADATA,
            data: undefined,
            metadata: Buffer.from("world he"),
            streamId: 1,
          });
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
            metadata: null,
            streamId: 1,
          });
          responder.handle({
            type: FrameTypes.PAYLOAD,
            flags: Flags.NEXT,
            data: Buffer.from(" world"),
            metadata: null,
            streamId: 1,
          });

          responder.handle({
            type: FrameTypes.PAYLOAD,
            flags: Flags.NEXT,
            data: Buffer.from("hello"),
            metadata: null,
            streamId: 1,
          });

          if (completeOnNext) {
            responder.handle({
              type: FrameTypes.PAYLOAD,
              flags: Flags.NEXT | Flags.COMPLETE,
              data: Buffer.from("world"),
              metadata: null,
              streamId: 1,
            });
          } else {
            responder.handle({
              type: FrameTypes.PAYLOAD,
              streamId: 1,
              flags: Flags.COMPLETE,
              data: null,
              metadata: null,
            });
          }

          expect(payload).toMatchObject({
            data: Buffer.concat([
              Buffer.from("hello world"),
              Buffer.from("hello world"),
            ]), // 22 bytes
            metadata: Buffer.from("world hello"),
          });

          expect(mockHandler.onNext.mock.calls[0]).toMatchObject([
            {
              data: Buffer.concat([
                Buffer.from("hello world"),
                Buffer.from("hello world"),
              ]), // 22 bytes
              metadata: Buffer.from("world hello"),
            },
            false,
          ]);
          expect(mockHandler.onNext.mock.calls[1]).toMatchObject([
            {
              data: Buffer.from("hello"),
              metadata: null,
            },
            false,
          ]);
          expect(requested).toBe(1);
          if (completeOnNext) {
            expect(mockHandler.onNext.mock.calls[2]).toMatchObject([
              {
                data: Buffer.from("world"),
                metadata: null,
              },
              true,
            ]);
          } else {
            expect(mockHandler.onComplete).toBeCalled();
          }
          expect(mockStream.handler).toBeUndefined();
        });
      }

      it("Send error back on unexpected frame", () => {
        const mockStream = new MockStream();
        const mockHandler = mock<
          Cancellable &
            Requestable &
            OnExtensionSubscriber &
            OnTerminalSubscriber &
            OnNextSubscriber
        >();
        let payload: Payload;
        let isCompleted: boolean;
        let requested: number;
        const responder = new RequestChannelResponderStream(
          1,
          mockStream,
          0,
          (p, requestN, c, terminator) => {
            payload = p;
            isCompleted = c;
            requested = requestN;
            terminator.onComplete();
            return mockHandler;
          },
          {
            type: FrameTypes.REQUEST_CHANNEL,
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
            message: `Unexpected frame type [${FrameTypes.EXT}] during reassembly`,
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
          Cancellable &
            Requestable &
            OnExtensionSubscriber &
            OnTerminalSubscriber &
            OnNextSubscriber
        >();
        let payload: Payload;
        let isCompleted: boolean;
        let requested: number;
        const responder = new RequestChannelResponderStream(
          1,
          mockStream,
          0,
          (p, requestN, c, terminator) => {
            payload = p;
            isCompleted = c;
            requested = requestN;
            terminator.onComplete();
            return mockHandler;
          },
          {
            type: FrameTypes.REQUEST_CHANNEL,
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
          Cancellable &
            Requestable &
            OnExtensionSubscriber &
            OnTerminalSubscriber &
            OnNextSubscriber
        >();
        let payload: Payload;
        let isCompleted: boolean;
        let requested: number;
        const responder = new RequestChannelResponderStream(
          1,
          mockStream,
          0,
          (p, requestN, c, terminator) => {
            payload = p;
            isCompleted = c;
            requested = requestN;
            terminator.onComplete();
            return mockHandler;
          },
          {
            type: FrameTypes.REQUEST_CHANNEL,
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
          Cancellable &
            Requestable &
            OnExtensionSubscriber &
            OnTerminalSubscriber &
            OnNextSubscriber
        >();
        let payload: Payload;
        let isCompleted: boolean;
        const responder = new RequestChannelResponderStream(
          1,
          mockStream,
          0,
          (p, requestN, c, terminator) => {
            payload = p;
            isCompleted = c;
            terminator.onComplete();
            return mockHandler;
          },
          {
            type: FrameTypes.REQUEST_CHANNEL,
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

      it("Send exception from handler", () => {
        const mockStream = new MockStream();
        let payload: Payload;
        let sink: OnNextSubscriber &
          OnTerminalSubscriber &
          OnExtensionSubscriber;
        const responder = new RequestChannelResponderStream(
          1,
          mockStream,
          0,
          (p, n, isCompleted, sender) => {
            payload = p;
            sink = sender;
            throw new Error("boom");
          },
          {
            type: FrameTypes.REQUEST_CHANNEL,
            flags: Flags.FOLLOWS | Flags.METADATA,
            data: undefined,
            requestN: 1,
            metadata: Buffer.from("world"),
            streamId: 1,
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

        expect(mockStream.frames.pop()).toMatchObject({
          type: FrameTypes.ERROR,
          streamId: 1,
          flags: Flags.NONE,
          code: ErrorCodes.APPLICATION_ERROR,
          message: "boom",
        });
        sink.onComplete();
        expect(mockStream.frames).toHaveLength(0);
        expect(payload).toMatchObject({
          data: Buffer.concat([
            Buffer.from("hello world"),
            Buffer.from("hello world"),
          ]), // 22 bytes
          metadata: Buffer.from("world hello"),
        });

        expect(mockStream.handler).toBeUndefined();
      });

      it("Drop exception from handler and cancel inbound if complete earlier", () => {
        const mockStream = new MockStream();
        let payload: Payload;
        let sink: OnNextSubscriber &
          OnTerminalSubscriber &
          OnExtensionSubscriber;
        const responder = new RequestChannelResponderStream(
          1,
          mockStream,
          0,
          (p, n, isCompleted, sender) => {
            payload = p;
            sink = sender;
            sender.onComplete();
            throw new Error("boom");
          },
          {
            type: FrameTypes.REQUEST_CHANNEL,
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

        expect(mockStream.frames.shift()).toMatchObject({
          type: FrameTypes.PAYLOAD,
          streamId: 1,
          flags: Flags.COMPLETE,
          data: null,
          metadata: null,
        });
        expect(mockStream.frames.shift()).toMatchObject({
          type: FrameTypes.CANCEL,
          streamId: 1,
          flags: Flags.NONE,
        });
        expect(mockStream.frames).toHaveLength(0);
        expect(payload).toMatchObject({
          data: Buffer.concat([
            Buffer.from("hello world"),
            Buffer.from("hello world"),
          ]), // 22 bytes
          metadata: Buffer.from("world hello"),
        });

        expect(mockStream.handler).toBeUndefined();
      });

      it("Drop exception from handler if complete and cancelled earlier", () => {
        const mockStream = new MockStream();
        let payload: Payload;
        let sink: OnNextSubscriber &
          OnTerminalSubscriber &
          OnExtensionSubscriber;
        const responder = new RequestChannelResponderStream(
          1,
          mockStream,
          0,
          (p, n, isCompleted, sender) => {
            payload = p;
            sink = sender;
            sender.cancel();
            sender.onComplete();
            throw new Error("boom");
          },
          {
            type: FrameTypes.REQUEST_CHANNEL,
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

        expect(mockStream.frames.shift()).toMatchObject({
          type: FrameTypes.CANCEL,
          streamId: 1,
          flags: Flags.NONE,
        });
        expect(mockStream.frames.shift()).toMatchObject({
          type: FrameTypes.PAYLOAD,
          streamId: 1,
          flags: Flags.COMPLETE,
          data: null,
          metadata: null,
        });
        expect(mockStream.frames).toHaveLength(0);
        expect(payload).toMatchObject({
          data: Buffer.concat([
            Buffer.from("hello world"),
            Buffer.from("hello world"),
          ]), // 22 bytes
          metadata: Buffer.from("world hello"),
        });

        expect(mockStream.handler).toBeUndefined();
      });

      it("Drop exception from handler if complete on both sides earlier", () => {
        const mockStream = new MockStream();
        let payload: Payload;
        let sink: OnNextSubscriber &
          OnTerminalSubscriber &
          OnExtensionSubscriber;
        const responder = new RequestChannelResponderStream(
          1,
          mockStream,
          0,
          (p, n, isCompleted, sender) => {
            payload = p;
            sink = sender;
            sender.onComplete();
            throw new Error("boom");
          },
          {
            type: FrameTypes.REQUEST_CHANNEL,
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
          flags: Flags.NEXT | Flags.COMPLETE,
          data: Buffer.from("llo world"),
          metadata: undefined,
          streamId: 1,
        });

        expect(mockStream.frames.shift()).toMatchObject({
          type: FrameTypes.PAYLOAD,
          streamId: 1,
          flags: Flags.COMPLETE,
          data: null,
          metadata: null,
        });
        expect(mockStream.frames).toHaveLength(0);
        expect(payload).toMatchObject({
          data: Buffer.concat([
            Buffer.from("hello world"),
            Buffer.from("hello world"),
          ]), // 22 bytes
          metadata: Buffer.from("world hello"),
        });

        expect(mockStream.handler).toBeUndefined();
      });

      it("Drop exception from handler if errored", () => {
        const mockStream = new MockStream();
        let payload: Payload;
        let sink: OnNextSubscriber &
          OnTerminalSubscriber &
          OnExtensionSubscriber;
        const responder = new RequestChannelResponderStream(
          1,
          mockStream,
          0,
          (p, n, isCompleted, sender) => {
            payload = p;
            sink = sender;
            sender.onError(
              new RSocketError(ErrorCodes.APPLICATION_ERROR, "boom1")
            );
            throw new Error("boom");
          },
          {
            type: FrameTypes.REQUEST_CHANNEL,
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

        expect(mockStream.frames.shift()).toMatchObject({
          type: FrameTypes.ERROR,
          streamId: 1,
          flags: Flags.NONE,
        });
        expect(mockStream.frames).toHaveLength(0);
        expect(payload).toMatchObject({
          data: Buffer.concat([
            Buffer.from("hello world"),
            Buffer.from("hello world"),
          ]), // 22 bytes
          metadata: Buffer.from("world hello"),
        });

        expect(mockStream.handler).toBeUndefined();
      });
    });
  });
});
