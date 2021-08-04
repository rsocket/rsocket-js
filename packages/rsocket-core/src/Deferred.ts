import { Closeable } from "./Common";

export class Deferred implements Closeable {
  private _done: boolean = false;
  private onCloseCallback: (reason?: any) => void = () => {};

  get done(): boolean {
    return this._done;
  }

  /**
   * Signals to an observer that the Deferred operation has been closed, which invokes
   * the provided `onClose` callback.
   */
  close(error?: Error): void {
    if (this.done) {
      console.warn(
        `Trying to close for the second time. ${
          error ? `Dropping error [${error}].` : ""
        }`
      );
      return;
    }

    this._done = true;

    if (error) {
      this.onCloseCallback(error);
      return;
    }

    this.onCloseCallback();
  }

  /**
   * Registers a callback to be called when the Closeable is closed. optionally with an Error.
   */
  onClose(callback): void {
    this.onCloseCallback = callback;
  }
}
