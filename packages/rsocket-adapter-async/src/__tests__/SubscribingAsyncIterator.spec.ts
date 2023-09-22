import SubscribingAsyncIterator from "../lib/SubscribingAsyncIterator";
import { mock } from "jest-mock-extended";
import { Cancellable, Requestable } from "rsocket-core";
import { Codec } from "rsocket-messaging";

jest.useFakeTimers();

class StringCodec implements Codec<string> {
  readonly mimeType: string = "text/plain";

  decode(buffer: Buffer): string {
    return buffer.toString();
  }

  encode(entity: string): Buffer {
    return Buffer.from(entity);
  }
}

describe("SubscribingAsyncIterator", function () {
  it("iterates over emitted values", async function () {
    let subscriber;
    const subscription = mock<Requestable & Cancellable>({
      request(requestN: number) {
        for (let i = 0; i < requestN; i++) {
          setTimeout(() => {
            subscriber.onNext(
              {
                data: Buffer.from(`${i}`),
                metadata: undefined,
              },
              i === requestN - 1
            );
          });
        }
      },
    });
    const requestSpy = jest.spyOn(subscription, "request");

    const initialRequestN = 3;
    subscriber = new SubscribingAsyncIterator(
      subscription,
      initialRequestN * 2,
      new StringCodec()
    );
    subscription.request(initialRequestN);

    jest.runAllTimers();

    const values = [];
    for await (const value of subscriber) {
      jest.runAllTimers();
      values.push(value);
    }

    expect(values).toStrictEqual(["0", "1", "2"]);
    expect(requestSpy).toBeCalledTimes(1);
  });

  it("iterates over emitted values until onComplete", async function () {
    let subscriber;
    const subscription = mock<Requestable & Cancellable>({
      request(requestN: number) {
        for (let i = 0; i < requestN; i++) {
          setTimeout(() => {
            if (i === requestN - 1) {
              subscriber.onComplete();
            } else {
              subscriber.onNext(
                {
                  data: Buffer.from(`${i}`),
                  metadata: undefined,
                },
                false
              );
            }
          });
        }
      },
    });
    const requestSpy = jest.spyOn(subscription, "request");

    const initialRequestN = 3;
    subscriber = new SubscribingAsyncIterator(
      subscription,
      initialRequestN * 2,
      new StringCodec()
    );
    subscription.request(initialRequestN);

    jest.runAllTimers();

    const values = [];
    for await (const value of subscriber) {
      jest.runAllTimers();
      values.push(value);
    }

    expect(values).toStrictEqual(["0", "1"]);
    expect(requestSpy).toBeCalledTimes(1);
  });

  it("cancels when break statement reached", async function () {
    let subscriber;
    const subscription = mock<Requestable & Cancellable>({
      request(requestN: number) {
        for (let i = 0; i < requestN; i++) {
          setTimeout(() => {
            subscriber.onNext(
              {
                data: Buffer.from(`${i}`),
                metadata: undefined,
              },
              i === requestN - 1
            );
          });
        }
      },
    });
    const requestSpy = jest.spyOn(subscription, "request");
    const cancelSpy = jest.spyOn(subscription, "cancel");

    const initialRequestN = 10;
    subscriber = new SubscribingAsyncIterator(
      subscription,
      initialRequestN * 2,
      new StringCodec()
    );
    subscription.request(initialRequestN);

    jest.runAllTimers();

    const values = [];
    for await (const value of subscriber) {
      if (values.length == 2) {
        break;
      }
      jest.runAllTimers();
      values.push(value);
    }

    expect(values).toStrictEqual(["0", "1"]);
    expect(requestSpy).toBeCalledTimes(1);
    expect(requestSpy).toBeCalledWith(10);
    expect(cancelSpy).toBeCalledTimes(1);
  });

  it("ends and throws with emitted exception", async function () {
    let subscriber;
    const expectedError = new Error("test error");
    const subscription = mock<Requestable & Cancellable>({
      request(requestN: number) {
        setTimeout(() => {
          subscriber.onError(expectedError);
        });
      },
    });
    const requestSpy = jest.spyOn(subscription, "request");

    const initialRequestN = 10;
    subscriber = new SubscribingAsyncIterator(
      subscription,
      initialRequestN * 2,
      new StringCodec()
    );
    subscription.request(initialRequestN);

    jest.runAllTimers();

    const values = [];

    let capturedError;
    try {
      for await (const value of subscriber) {
        jest.runAllTimers();
        values.push(value);
      }
    } catch (error) {
      capturedError = error;
    }

    expect(capturedError).toBe(expectedError);
    expect(values).toStrictEqual([]);
    expect(requestSpy).toBeCalledWith(10);
  });

  it("cancels on exception processing emitted value", async function () {
    let subscriber;
    const subscription = mock<Requestable & Cancellable>({
      request(requestN: number) {
        for (let i = 0; i < requestN; i++) {
          setTimeout(() => {
            subscriber.onNext(
              {
                data: Buffer.from(`${i}`),
                metadata: undefined,
              },
              i === requestN - 1
            );
          });
        }
      },
    });
    const requestSpy = jest.spyOn(subscription, "request");
    const cancelSpy = jest.spyOn(subscription, "cancel");

    const initialRequestN = 10;
    subscriber = new SubscribingAsyncIterator(
      subscription,
      initialRequestN * 2,
      new StringCodec()
    );
    subscription.request(initialRequestN);

    jest.runAllTimers();

    const values = [];
    try {
      for await (const value of subscriber) {
        if (values.length == 2) {
          throw new Error("test error");
        }
        values.push(value);
        jest.runAllTimers();
      }
    } catch (e) {}

    expect(values).toStrictEqual(["0", "1"]);
    expect(requestSpy).toBeCalledTimes(1);
    expect(requestSpy).toBeCalledWith(10);
    expect(cancelSpy).toBeCalledTimes(1);
  });
});
