export interface Closeable {
  /**
   * Returns a boolean flag indicating whether or not the Closeable is `done` and `close()` has been called.
   */
  isDone(): boolean;

  /**
   * Close the underlying connection, emitting `onComplete` on the receive()
   * Publisher.
   */
  close(error?: Error): void;

  /**
   * Registers a callback to be called when the Closeable is closed. optionally with an Error.
   */
  onClose(callback: (error?: Error) => void);
}

export interface Availability {
  /**
   * Returns positive number representing the availability of RSocket requester. Higher is better, 0.0
   * means not available.
   */
  readonly availability: number;
}
