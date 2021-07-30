import { Closeable } from "@rsocket/rsocket-types";

export class Deferred implements Closeable {
  private _done: boolean;
  private onCloseCallback: (reason?: any) => void;

  public isDone(): boolean {
    return this._done;
  }

  /**
   * Close the underlying connection, emitting `onComplete` on the receive()
   * Publisher.
   */
  close(error?: Error): void {
    if (this.isDone()) {
      console.warn(
        `Trying to close for the second time. ${
          error ? `Dropping error [${error}].` : ""
        }`
      );
      return;
    }

    if (error) {
      this?.onCloseCallback(error);
      return;
    }

    this?.onCloseCallback();
  }

  /**
   * Registers a callback to be called when the Closeable is closed. optionally with an Error.
   */
  onClose(callback): void {
    this.onCloseCallback = callback;
  }
}
