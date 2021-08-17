import { Closeable } from "./Common";

export class Deferred implements Closeable {
  private _done: boolean = false;
  private _error: Error | undefined;
  private onCloseCallbacks: Array<(reason?: Error) => void> = [];

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
    this._error = error;

    if (error) {
      for (const callback of this.onCloseCallbacks) {
        callback(error);
      }
      return;
    }

    for (const callback of this.onCloseCallbacks) {
      callback();
    }
  }

  /**
   * Registers a callback to be called when the Closeable is closed. optionally with an Error.
   */
  onClose(callback: (reason?: Error) => void): void {
    if (this._done) {
      callback(this._error);
      return;
    }
    this.onCloseCallbacks.push(callback);
  }
}
