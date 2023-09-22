import {
  OnExtensionSubscriber,
  OnNextSubscriber,
  OnTerminalSubscriber,
  Payload,
} from "rsocket-core";

export default class BufferingForwardingSubscriber<T>
  implements OnNextSubscriber, OnTerminalSubscriber, OnExtensionSubscriber
{
  private subscriber: OnNextSubscriber &
    OnTerminalSubscriber &
    OnExtensionSubscriber;
  private isDone: boolean = false;
  private values: { payload: Payload; isComplete: boolean }[] = [];
  private error: any;
  private extensionArgs: {
    extendedType: number;
    content: Buffer | null | undefined;
    canBeIgnored: boolean;
  };

  constructor() {}

  onComplete(): void {
    if (this.isDone === true) return;
    this.isDone = true;
    this.subscriber?.onComplete();
  }

  onError(error: Error): void {
    if (this.isDone === true) return;
    this.isDone = true;
    this.subscriber?.onError(error);
  }

  onExtension(
    extendedType: number,
    content: Buffer | null | undefined,
    canBeIgnored: boolean
  ): void {
    if (this.isDone === true) return;
    this.isDone = true;
    this.subscriber?.onExtension(extendedType, content, canBeIgnored);
  }

  onNext(payload: Payload, isComplete: boolean): void {
    if (this.isDone === true) return;
    if (isComplete === true) {
      this.isDone = isComplete;
    }
    this.values.push({ payload, isComplete });
    if (this.subscriber !== undefined) {
      this.drain();
    }
  }

  subscribe(
    subscriber: OnNextSubscriber & OnTerminalSubscriber & OnExtensionSubscriber
  ): void {
    if (this.subscriber) return;
    this.subscriber = subscriber;
    if (this.error) {
      this.subscriber.onError(this.error);
      return;
    }
    if (this.extensionArgs) {
      this.subscriber.onExtension(
        this.extensionArgs.extendedType,
        this.extensionArgs.content,
        this.extensionArgs.canBeIgnored
      );
    }
    this.drain();
  }

  private drain() {
    let value = this.values.shift();
    while (value) {
      this.subscriber.onNext(value.payload, value.isComplete);
      value = this.values.shift();
    }
  }
}
