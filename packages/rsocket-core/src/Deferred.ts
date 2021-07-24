import { Closeable } from "@rsocket/rsocket-types";

export class Deferred implements Closeable {
  private _done: boolean;

  private resolver: (value: void) => void;
  private rejector: (reason?: any) => void;
  private onClosePromise: Promise<void> = new Promise((res, rej) => {
    this.resolver = res;
    this.rejector = rej;
  });

  get done(): boolean {
    return this._done;
  }

  /**
   * Close the underlying connection, emitting `onComplete` on the receive()
   * Publisher.
   */
  close(error?: Error): void {
    if (this.done) {
      console.warn(
        `Trying to close for the second time. ${
          error ? `Droppeing error [${error}].` : ""
        }`
      );
      return;
    }

    if (error) {
      this.rejector(error);
      return;
    }

    this.resolver();
  }

  /**
   */
  get onClose(): Promise<void> {
    return this.onClosePromise;
  }
}
