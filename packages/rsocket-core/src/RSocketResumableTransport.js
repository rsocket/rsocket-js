/** Copyright (c) Facebook, Inc. and its affiliates.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @flow
 */

'use strict';

import type {
  ConnectionStatus,
  DuplexConnection,
  Frame,
  SetupFrame,
} from 'rsocket-types';
import type {ISubject, ISubscription} from 'rsocket-types';

import {Flowable} from 'rsocket-flowable';
import invariant from 'fbjs/lib/invariant';
import {
  createErrorFromFrame,
  isResumePositionFrameType,
  CONNECTION_STREAM_ID,
  FLAGS,
  FRAME_TYPES,
} from './RSocketFrame';
import {CONNECTION_STATUS} from 'rsocket-types';
import type {Encodable} from 'rsocket-types';
import {sizeOfFrame} from './RSocketBinaryFraming';
import type {Encoders} from './RSocketEncoding';

export type Options = {|
  bufferSize: number,
  resumeToken: Encodable,
|};

/**
 * NOTE: This implementation conforms to an upcoming version of the RSocket protocol
 *       and will not work with version 1.0 servers.
 *
 * An implementation of the DuplexConnection interface that supports automatic
 * resumption per the RSocket protocol.
 *
 * # Example
 *
 * Create a client instance:
 * ```
 * const client = new RSocketClient({
 *   ...,
 *   transport: new RSocketResumableTransport(
 *     () => new RSocketWebSocketClient(...), // provider for low-level transport instances
 *     {
 *       bufferSize: 10, // max number of sent & pending frames to buffer before failing
 *       resumeToken: 'abc123', // string to uniquely identify the session across connections
 *     }
 *   ),
 * })
 *
 * Open the connection. After this if the connection dies it will be auto-resumed:
 * ```
 * client.connect().subscribe(...);
 * ```
 *
 * Optionally, subscribe to the status of the connection:
 * ```
 * client.connectionStatus().subscribe(...);
 * ```
 *
 * # Implementation Notes
 *
 * This transport maintains:
 * - _currentConnection: a current low-level transport, which is null when not
 *   connected
 * - _sentFrames: a buffer of frames written to a low-level transport (which
 *   may or may not have been received by the server)
 * - _pendingFrames: a buffer of frames not yet written to the low-level
 *   connection, because they were sent while not connected.
 *
 * The initial connection is simple: connect using the low-level transport and
 * flush any _pendingFrames (write them and add them to _sentFrames).
 *
 * Thereafter if the low-level transport drops, this transport attempts resumption.
 * It obtains a fresh low-level transport from the given transport `source`
 * and attempts to connect. Once connected, it sends a RESUME frame and waits.
 * If RESUME_OK is received, _sentFrames and _pendingFrames are adjusted such
 * that:
 * - any frames the server has received are removed from _sentFrames
 * - the remaining frames are merged (in correct order) into _pendingFrames
 *
 * Then the connection proceeds as above, where all pending frames are flushed.
 * If anything other than RESUME_OK is received, resumption is considered to
 * have failed and the connection is set to the ERROR status.
 */
export default class RSocketResumableTransport implements DuplexConnection {
  _encoders: ?Encoders<*>;
  _bufferSize: number;
  _sentFramesSize: number;
  _pendingFramesSize: number;
  _position: {
    client: number, // earliest client frame still buffered
    server: number, // latest server frame received
  };
  _currentConnection: ?DuplexConnection;
  _statusSubscription: ?ISubscription;
  _receiveSubscription: ?ISubscription;
  _pendingFrames: Array<Frame>;
  _receivers: Set<ISubject<Frame>>;
  _resumeToken: Encodable;
  _senders: Set<ISubscription>;
  _sentFrames: Array<Frame>;
  _setupFrame: ?SetupFrame;
  _source: () => DuplexConnection;
  _status: ConnectionStatus;
  _statusSubscribers: Set<ISubject<ConnectionStatus>>;

  constructor(
    source: () => DuplexConnection,
    options: Options,
    encoders: ?Encoders<*>,
  ) {
    invariant(
      options.bufferSize >= 0,
      'RSocketResumableTransport: bufferSize option must be >= 0, got `%s`.',
      options.bufferSize,
    );
    this._encoders = encoders;
    this._bufferSize = options.bufferSize;
    this._sentFramesSize = 0;
    this._pendingFramesSize = 0;
    this._position = {
      client: 0,
      server: 0,
    };
    this._currentConnection = null;
    this._statusSubscription = null;
    this._receiveSubscription = null;
    this._pendingFrames = [];
    this._receivers = new Set();
    this._resumeToken = options.resumeToken;
    this._senders = new Set();
    this._sentFrames = [];
    this._setupFrame = null;
    this._source = source;
    this._status = CONNECTION_STATUS.NOT_CONNECTED;
    this._statusSubscribers = new Set();
  }

  close(): void {
    this._close();
  }

  connect(): void {
    invariant(
      !this._isTerminated(),
      'RSocketResumableTransport: Cannot connect(), connection terminated (%s).',
      this._status.kind,
    );
    try {
      this._disconnect();
      this._currentConnection = null;
      this._receiveSubscription = null;
      this._statusSubscription = null;
      this._setConnectionStatus(CONNECTION_STATUS.CONNECTING);
      const connection = this._source();
      connection.connectionStatus().subscribe({
        onNext: status => {
          if (status.kind === this._status.kind) {
            return;
          }
          if (status.kind === 'CONNECTED') {
            // (other) -> CONNECTED
            if (this._setupFrame == null) {
              this._handleConnected(connection);
            } else {
              this._handleResume(connection);
            }
          } else if (this._isTerminationStatus(status)) {
            this._disconnect();
            this._setConnectionStatus(CONNECTION_STATUS.NOT_CONNECTED);
          }
        },
        onSubscribe: subscription => {
          this._statusSubscription = subscription;
          subscription.request(Number.MAX_SAFE_INTEGER);
        },
      });
      connection.connect();
    } catch (error) {
      this._close(error);
    }
  }

  connectionStatus(): Flowable<ConnectionStatus> {
    return new Flowable(subscriber => {
      subscriber.onSubscribe({
        cancel: () => {
          this._statusSubscribers.delete(subscriber);
        },
        request: () => {
          this._statusSubscribers.add(subscriber);
          subscriber.onNext(this._status);
        },
      });
    });
  }

  receive(): Flowable<Frame> {
    return new Flowable(subject => {
      subject.onSubscribe({
        cancel: () => {
          this._receivers.delete(subject);
        },
        request: () => {
          this._receivers.add(subject);
        },
      });
    });
  }

  sendOne(frame: Frame): void {
    try {
      this._writeFrame(frame);
    } catch (error) {
      this._close(error);
    }
  }

  send(frames: Flowable<Frame>): void {
    let subscription;
    frames.subscribe({
      onComplete: () => {
        subscription && this._senders.delete(subscription);
      },
      onError: error => {
        subscription && this._senders.delete(subscription);
        this._close(error);
      },
      onNext: frame => this._writeFrame(frame),
      onSubscribe: _subscription => {
        subscription = _subscription;
        this._senders.add(subscription);
        subscription.request(Number.MAX_SAFE_INTEGER);
      },
    });
  }

  _close(error?: Error): void {
    if (this._isTerminated()) {
      return;
    }
    if (error) {
      this._setConnectionStatus({error, kind: 'ERROR'});
    } else {
      this._setConnectionStatus(CONNECTION_STATUS.CLOSED);
    }
    this._disconnect();
  }

  _disconnect(): void {
    if (this._statusSubscription) {
      this._statusSubscription.cancel();
      this._statusSubscription = null;
    }
    if (this._receiveSubscription) {
      this._receiveSubscription.cancel();
      this._receiveSubscription = null;
    }
    if (this._currentConnection) {
      this._currentConnection.close();
      this._currentConnection = null;
    }
  }

  _handleConnected(connection: DuplexConnection): void {
    this._currentConnection = connection;
    this._flushFrames();
    this._setConnectionStatus(CONNECTION_STATUS.CONNECTED);
    connection.receive().subscribe({
      onNext: frame => {
        try {
          this._receiveFrame(frame);
        } catch (error) {
          this._close(error);
        }
      },
      onSubscribe: subscription => {
        this._receiveSubscription = subscription;
        subscription.request(Number.MAX_SAFE_INTEGER);
      },
    });
  }

  _handleResume(connection: DuplexConnection): void {
    connection.receive().take(1).subscribe({
      onNext: frame => {
        try {
          if (frame.type === FRAME_TYPES.RESUME_OK) {
            const {clientPosition} = frame;
            // clientPosition indicates which frames the server is missing:
            // - anything after that still needs to be sent
            // - anything before that can be discarded
            if (clientPosition < this._position.client) {
              // Invalid RESUME_OK frame: server asked for an older
              // client frame than is available
              this._close(
                new Error(
                  'RSocketResumableTransport: Resumption failed, server is ' +
                    'missing frames that are no longer in the client buffer.',
                ),
              );
              return;
            }
            // remove tail frames of total length = remoteImpliedPos-localPos
            let removeSize = clientPosition - this._position.client;
            let index = 0;
            while (removeSize > 0) {
              const frameSize = this._onReleasedTailFrame(
                this._sentFrames[index],
              );
              if (!frameSize) {
                this._close(this._absentLengthError(frame));
                return;
              }
              removeSize -= frameSize;
              index++;
            }
            // Drop sent frames that the server has received
            if (index > 0) {
              this._sentFrames.splice(0, index);
            }
            const unreceivedSentFrames = this._sentFrames;
            // ...and mark them as pending again
            this._pendingFrames = [
              ...unreceivedSentFrames,
              ...this._pendingFrames,
            ];

            // Continue connecting, which will flush pending frames
            this._handleConnected(connection);
          } else {
            const error = frame.type === FRAME_TYPES.ERROR
              ? createErrorFromFrame(frame)
              : new Error(
                  'RSocketResumableTransport: Resumption failed for an ' +
                    'unspecified reason.',
                );
            this._close(error);
          }
        } catch (error) {
          this._close(error);
        }
      },
      onSubscribe: subscription => {
        this._receiveSubscription = subscription;
        subscription.request(1);
      },
    });
    const setupFrame = this._setupFrame;
    invariant(
      setupFrame,
      'RSocketResumableTransport: Cannot resume, setup frame has not been sent.',
    );
    connection.sendOne({
      clientPosition: this._position.client,
      flags: 0,
      majorVersion: setupFrame.majorVersion,
      minorVersion: setupFrame.minorVersion,
      resumeToken: this._resumeToken,
      serverPosition: this._position.server,
      streamId: CONNECTION_STREAM_ID,
      type: FRAME_TYPES.RESUME,
    });
  }

  _absentLengthError(frame: Frame) {
    return new Error(
      'RSocketResumableTransport: absent frame.length for type ' + frame.type,
    );
  }

  _isTerminated(): boolean {
    return this._isTerminationStatus(this._status);
  }

  _isTerminationStatus(status: ConnectionStatus): boolean {
    const kind = status.kind;
    return kind === 'CLOSED' || kind === 'ERROR';
  }

  _setConnectionStatus(status: ConnectionStatus): void {
    if (status.kind === this._status.kind) {
      return;
    }
    this._status = status;
    this._statusSubscribers.forEach(subscriber => subscriber.onNext(status));
  }

  _receiveFrame(frame: Frame): void {
    if (isResumePositionFrameType(frame.type)) {
      this._position.server += frame.length;
    }
    // TODO: trim _sentFrames on KEEPALIVE frame
    this._receivers.forEach(subscriber => subscriber.onNext(frame));
  }

  _flushFrames(): void {
    // Writes all pending frames to the transport so long as a connection is available
    while (this._pendingFrames.length && this._currentConnection) {
      let frame = this._pendingFrames.shift();
      let frameLength = frame.length;
      if (frameLength) {
        this._pendingFramesSize -= frameLength;
        this._writeFrame(frame);
      } else {
        this._close(this._absentLengthError(frame));
        return;
      }
    }
  }

  _onReleasedTailFrame(frame: Frame): ?number {
    const removedFrameSize = frame.length;
    if (removedFrameSize) {
      this._sentFramesSize -= removedFrameSize;
      this._position.client += removedFrameSize;
      return removedFrameSize;
    }
  }

  _writeFrame(frame: Frame): void {
    // Ensure that SETUP frames contain the resume token
    if (frame.type === FRAME_TYPES.SETUP) {
      frame = {
        ...frame,
        flags: frame.flags | FLAGS.RESUME_ENABLE, // eslint-disable-line no-bitwise
        resumeToken: this._resumeToken,
      };
      this._setupFrame = (frame: $FlowIssue); // frame can only be a SetupFrame
    }
    frame.length = sizeOfFrame(frame, this._encoders);
    // If connected, immediately write frames to the low-level transport
    // and consider them "sent". The resumption protocol will figure out
    // which frames may not have been received and recover.
    const currentConnection = this._currentConnection;
    if (currentConnection) {
      if (isResumePositionFrameType(frame.type)) {
        let available = this._bufferSize - this._sentFramesSize;
        const frameSize = frame.length;
        if (frameSize) {
          // remove tail until there is space for new frame
          while (available < frameSize) {
            const removedFrame = this._sentFrames.shift();
            if (removedFrame) {
              const removedFrameSize = this._onReleasedTailFrame(removedFrame);
              if (!removedFrameSize) {
                this._close(this._absentLengthError(frame));
                return;
              }
              available += removedFrameSize;
            } else {
              break;
            }
          }
          if (available >= frameSize) {
            this._sentFrames.push(frame);
            this._sentFramesSize += frameSize;
          } else {
            this._position.client += frameSize;
          }
        } else {
          this._close(this._absentLengthError(frame));
          return;
        }
      }
      currentConnection.sendOne(frame);
    } else if (this._bufferSize > 0) {
      // Otherwise buffer pending frames. This allows an application
      // to continue interacting with a ReactiveSocket during momentary
      // losses of connection.
      invariant(
        this._pendingFramesSize < this._bufferSize,
        'RSocketResumableTransport: Buffer size of `%s` exceeded.',
        this._bufferSize,
      );
      this._pendingFrames.push(frame);
      this._pendingFramesSize += frame.length;
    } else {
      invariant(
        false,
        'RSocketResumableTransport: Cannot sent frames while disconnected; ' +
          'buffering is disabled (bufferSize === 0).',
      );
    }
  }
}
