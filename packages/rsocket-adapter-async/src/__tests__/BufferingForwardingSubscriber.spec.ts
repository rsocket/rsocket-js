import SubscribingAsyncIterator from "../lib/SubscribingAsyncIterator";
import { mock } from "jest-mock-extended";
import {
  OnExtensionSubscriber,
  OnNextSubscriber,
  OnTerminalSubscriber,
  Requestable,
} from "@rsocket/core";
import { Codec } from "@rsocket/messaging";
import BufferingForwardingSubscriber from "../lib/BufferingForwardingSubscriber";
import { Buffer } from "buffer";

jest.useFakeTimers();

describe("BufferingForwardingSubscriber", function () {
  it("forwards all received onNext calls when received before subscription", async function () {
    const mockSubscriber = mock<
      OnNextSubscriber & OnTerminalSubscriber & OnExtensionSubscriber
    >();
    const testObj = new BufferingForwardingSubscriber();

    testObj.onNext({ data: Buffer.from("1") }, false);
    testObj.onNext({ data: Buffer.from("2") }, false);
    testObj.onNext({ data: Buffer.from("3") }, true);

    testObj.subscribe(mockSubscriber);

    expect(mockSubscriber.onNext).toBeCalledWith(
      { data: Buffer.from("1") },
      false
    );
    expect(mockSubscriber.onNext).toBeCalledWith(
      { data: Buffer.from("2") },
      false
    );
    expect(mockSubscriber.onNext).toBeCalledWith(
      { data: Buffer.from("3") },
      true
    );
  });

  it("forwards all received onNext calls when received after subscription", async function () {
    const mockSubscriber = mock<
      OnNextSubscriber & OnTerminalSubscriber & OnExtensionSubscriber
    >();
    const testObj = new BufferingForwardingSubscriber();

    testObj.subscribe(mockSubscriber);

    testObj.onNext({ data: Buffer.from("1") }, false);
    testObj.onNext({ data: Buffer.from("2") }, false);
    testObj.onNext({ data: Buffer.from("3") }, true);

    expect(mockSubscriber.onNext).toBeCalledWith(
      { data: Buffer.from("1") },
      false
    );
    expect(mockSubscriber.onNext).toBeCalledWith(
      { data: Buffer.from("2") },
      false
    );
    expect(mockSubscriber.onNext).toBeCalledWith(
      { data: Buffer.from("3") },
      true
    );
  });

  it("forwards all received onNext calls before forwarding subsequent onComplete", async function () {
    const mockSubscriber = mock<
      OnNextSubscriber & OnTerminalSubscriber & OnExtensionSubscriber
    >();
    const testObj = new BufferingForwardingSubscriber();

    testObj.subscribe(mockSubscriber);

    testObj.onNext({ data: Buffer.from("1") }, false);
    testObj.onNext({ data: Buffer.from("2") }, false);
    testObj.onNext({ data: Buffer.from("3") }, false);
    testObj.onComplete();

    expect(mockSubscriber.onNext).toBeCalledWith(
      { data: Buffer.from("1") },
      false
    );
    expect(mockSubscriber.onNext).toBeCalledWith(
      { data: Buffer.from("2") },
      false
    );
    expect(mockSubscriber.onNext).toBeCalledWith(
      { data: Buffer.from("3") },
      false
    );
    expect(mockSubscriber.onComplete).toBeCalledWith();
  });
});
