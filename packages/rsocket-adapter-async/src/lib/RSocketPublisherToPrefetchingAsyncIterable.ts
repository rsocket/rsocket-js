import {
  Cancellable,
  OnExtensionSubscriber,
  OnNextSubscriber,
  OnTerminalSubscriber,
  Requestable,
} from "@rsocket/core";
import { Codec } from "@rsocket/messaging";
import SubscribingAsyncIterator from "./SubscribingAsyncIterator";
import BufferingForwardingSubscriber from "./BufferingForwardingSubscriber";

export default class RSocketPublisherToPrefetchingAsyncIterable<
  T,
  TSignalSender extends Requestable & Cancellable & OnExtensionSubscriber
> implements AsyncIterable<T>
{
  private readonly limit: number;
  protected subscription: TSignalSender;
  private subscriber: SubscribingAsyncIterator<T>;

  constructor(
    private readonly exchangeFunction: (
      subscriber: OnNextSubscriber &
        OnTerminalSubscriber &
        OnExtensionSubscriber,
      n: number
    ) => TSignalSender,
    protected readonly prefetch: number,
    private readonly responseCodec?: Codec<T>
  ) {
    this.limit = prefetch - (prefetch >> 2);
  }

  private asyncIterator(): AsyncIterator<T> {
    const forwardingSubscriber = new BufferingForwardingSubscriber();
    this.subscription = this.exchangeFunction(forwardingSubscriber, this.limit);
    this.subscriber = new SubscribingAsyncIterator(
      this.subscription,
      this.prefetch,
      this.responseCodec
    );
    forwardingSubscriber.subscribe(this.subscriber);
    return this.subscriber;
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return this.asyncIterator();
  }

  return(): Promise<IteratorResult<T, void>> {
    return this.subscriber.return();
  }
}
