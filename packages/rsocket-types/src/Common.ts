export interface Closeable {

    /**
     * Close the underlying connection, emitting `onComplete` on the receive()
     * Publisher.
     */
    close(error?: Error): void;

    /**
     */
    get onClose(): Promise<void>;
}

export interface Availability {

    /**
     * Returns positive number representing the availability of RSocket requester. Higher is better, 0.0
     * means not available.
     */
    get availability(): number;
}