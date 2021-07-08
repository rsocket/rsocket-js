

export interface Cancellable {
    cancel(): void;
}

export interface Subscription extends Cancellable {
    request(requestN: number): void
}

export interface Extendable {
    onExtension(extendedType: number, payload: Payload, canBeIgnored: boolean): void;
}

export interface UnidirectionalStream extends Subscription, Extendable {
    onError(error: Error): void;
    onNext(payload: Payload, isCompletion: boolean): void;
    onComplete(): void;
}

/**
 * A contract providing different interaction models per the [ReactiveSocket protocol]
 (https://github.com/ReactiveSocket/reactivesocket/blob/master/Protocol.md).
 */
export interface RSocket {
    /**
     * Fire and Forget interaction model of `ReactiveSocket`. The returned
     * Publisher resolves when the passed `payload` is successfully handled.
     */
    fireAndForget(payload: Payload, responderStream: UnidirectionalStream): Cancellable;

    /**
     * Request-Response interaction model of `ReactiveSocket`. The returned
     * Publisher resolves with the response.
     */
    requestResponse(payload: Payload, responderStream: UnidirectionalStream): Cancellable

    /**
     * Request-Stream interaction model of `ReactiveSocket`. The returned
     * Publisher returns values representing the response(s).
     */
    requestStream(payload: Payload, responderStream: UnidirectionalStream): Subscription;

    /**
     * Request-Channel interaction model of `ReactiveSocket`. The returned
     * Publisher returns values representing the response(boolean)
     */
    requestChannel(payload: Payload, initialRequestN: number, isCompleted: boolean, responderStream: UnidirectionalStream) : UnidirectionalStream;

    /**
     * Metadata-Push interaction model of `ReactiveSocket`. The returned Publisher
     * resolves when the passed `payload` is successfully handled.
     */
    metadataPush(payload: Payload): void;

    /**
     * Close this `ReactiveSocket` and the underlying transport connection.
     */
    close()?: void;

    /**
     */
    onClose()?: Promise<void>;

    /**
     * Returns positive number representing the availability of RSocket requester. Higher is better, 0.0
     * means not available.
     */
    availability()?: number;
}

/**
 * Represents a network connection with input/output used by a ReactiveSocket to
 * send/receive data.
 */
export interface DuplexConnection {
    /**
     * Send a single frame on the connection.
     */
    sendFrame(s: Frame): void;

    /**
     * Returns a stream of all `Frame`s received on this connection.
     *
     * Notes:
     * - Implementations must call `onComplete` if the underlying connection is
     *   closed by the peer or by calling `close()`.
     * - Implementations must call `onError` if there are any errors
     *   sending/receiving frames.
     * - Implemenations may optionally support multi-cast receivers. Those that do
     *   not should throw if `receive` is called more than once.
     */
    handleFrames(handler: (Frame) => void): void;

    /**
     * Close the underlying connection, emitting `onComplete` on the receive()
     * Publisher.
     */
    close(error?: Error): void;

    /**
     */
    onClose(): Promise<void>;
}


/**
 * A single unit of data exchanged between the peers of a `ReactiveSocket`.
 */
export type Payload = {
    data: Buffer | null,
    metadata?: Buffer
};

export type Frame =
    | CancelFrame
    | ErrorFrame
    | KeepAliveFrame
    | LeaseFrame
    | PayloadFrame
    | MetadataPushFrame
    | RequestChannelFrame
    | RequestFnfFrame
    | RequestNFrame
    | RequestResponseFrame
    | RequestStreamFrame
    | ResumeFrame
    | ResumeOkFrame
    | SetupFrame
    | UnsupportedFrame;

export type FrameWithData = {
    data: Buffer | null,
    metadata: Buffer | null,
};

// prettier-ignore
export type CancelFrame = {
    type: 0x09,
    flags: number,
    streamId: number,
    length?: number,
};
// prettier-ignore
export type ErrorFrame = {
    type: 0x0B,
    flags: number,
    code: number,
    message: string,
    streamId: number,
    length?: number,
};
// prettier-ignore
export type KeepAliveFrame = {
    type: 0x03,
    flags: number,
    data: Buffer | null,
    lastReceivedPosition: number,
    streamId: 0,
    length?: number,
};
// prettier-ignore
export type LeaseFrame = {
    type: 0x02,
    flags: number,
    ttl: number,
    requestCount: number,
    metadata: Buffer | null,
    streamId: 0,
    length?: number,
};
// prettier-ignore
export type PayloadFrame = {
    type: 0x0A,
    flags: number,
    data: Buffer | null,
    metadata: Buffer | null,
    streamId: number,
    length?: number,
};
// prettier-ignore
export type MetadataPushFrame = {
    type: 0x0C,
    metadata: Buffer | null,
    flags: number,
    streamId: 0,
    length?: number,
    };
// prettier-ignore
export type RequestChannelFrame = {
    type: 0x07,
    data:  Buffer | null,
    metadata: ?Encodable,
    flags: number,
    requestN: number,
    streamId: number,
    length?: number,
    };
// prettier-ignore
export type RequestFnfFrame = {
    type: 0x05,
    data: Buffer | null,
    metadata: Buffer | null,
    flags: number,
    streamId: number,
    length?: number,
    };
// prettier-ignore
export type RequestNFrame = {
    type: 0x08,
    flags: number,
    requestN: number,
    streamId: number,
    length?: number,
    };
// prettier-ignore
export type RequestResponseFrame = {
    type: 0x04,
    data: Buffer | null,
    metadata: Buffer | null,
    flags: number,
    streamId: number,
    length?: number,
};
// prettier-ignore
export type RequestStreamFrame = {
    type: 0x06,
    data: Buffer | null,
    metadata: Buffer | null,
    flags: number,
    requestN: number,
    streamId: number,
    length?: number,
};
// prettier-ignore
export type ResumeFrame = {
    type: 0x0d,
    clientPosition: number,
    flags: number,
    majorVersion: number,
    minorVersion: number,
    resumeToken: Encodable,
    serverPosition: number,
    streamId: 0,
    length?: number,
};
// prettier-ignore
export type ResumeOkFrame = {
    type: 0x0e,
    clientPosition: number,
    flags: number,
    streamId: 0,
    length?: number,
};
// prettier-ignore
export type SetupFrame = {
    type: 0x01,
    dataMimeType: string,
    data: Buffer | null,
    flags: number,
    keepAlive: number,
    lifetime: number,
    metadata: Buffer | null,
    metadataMimeType: string,
    resumeToken: Buffer | null,
    streamId: 0,
    majorVersion: number,
    minorVersion: number,
    length?: number,
};
// prettier-ignore
export type UnsupportedFrame = {
    type: 0x3f | 0x00,
    streamId: 0,
    flags: number,
    length?: number,
};
