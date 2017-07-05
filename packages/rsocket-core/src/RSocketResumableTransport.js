/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 */

'use strict';

import type {
  ConnectionStatus,
  DuplexConnection,
  Frame,
  SetupFrame,
} from '../../ReactiveSocketTypes';
import type {ISubject, ISubscription} from '../../ReactiveStreamTypes';

import {Flowable} from 'rsocket-flowable';
import invariant from 'fbjs/lib/invariant';
import {
  createErrorFromFrame,
  isResumePositionFrameType,
  CONNECTION_STREAM_ID,
  FLAGS,
  FRAME_TYPES,
} from './RSocketFrame';
import {CONNECTION_STATUS} from '../../ReactiveSocketTypes';

export type Options = {|
  bufferSize: number,
  resumeToken: string,
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
  _bufferSize: number;
  _position: {
    client: number, // earliest client frame still buffered
    server: number, // latest server frame received
  };
  _currentConnection: ?DuplexConnection;
  _statusSubscription: ?ISubscription;
  _receiveSubscription: ?ISubscription;
  _pendingFrames: Array<Frame>;
  _receivers: Set<ISubject<Frame>>;
  _resumeToken: string;
  _senders: Set<ISubscription>;
  _sentFrames: Array<Frame>;
  _setupFrame: ?SetupFrame;
  _source: () => DuplexConnection;
  _status: ConnectionStatus;
  _statusSubscribers: Set<ISubject<ConnectionStatus>>;

  constructor(source: () => DuplexConnection, options: Options) {
    invariant(
      options.bufferSize >= 0,
      'RSocketResumableTransport: bufferSize option must be >= 0, got `%s`.',
      options.bufferSize,
    );
    this._bufferSize = options.bufferSize;
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
          } else {
            // CONNECTED -> (other)
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
            // Extract "sent" frames that the server hasn't received...
            const unreceivedSentFrames = this._sentFrames.slice(
              clientPosition - this._position.client,
            );
            // ...and mark them as pending again
            this._pendingFrames = [
              ...unreceivedSentFrames,
              ...this._pendingFrames,
            ];
            // Drop sent frames that the server has received
            this._sentFrames.length = clientPosition - this._position.client;
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

  _isTerminated(): boolean {
    return this._status.kind === 'CLOSED' || this._status.kind === 'ERROR';
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
      this._position.server++;
    }
    // TODO: trim _sentFrames on KEEPALIVE frame
    this._receivers.forEach(subscriber => subscriber.onNext(frame));
  }

  _flushFrames(): void {
    // Writes all pending frames to the transport so long as a connection is available
    while (this._pendingFrames.length && this._currentConnection) {
      this._writeFrame(this._pendingFrames.shift());
    }
  }

  _writeFrame(frame: Frame): void {
    // Ensure that SETUP frames contain the resume token
    if (frame.type === FRAME_TYPES.SETUP) {
      invariant(
        frame.majorVersion > 1 ||
          (frame.majorVersion === 1 && frame.minorVersion > 0),
        'RSocketResumableTransport: Unsupported protocol version %s.%s. ' +
          'This class implements the v1.1 resumption protocol.',
        frame.majorVersion,
        frame.minorVersion,
      );
      frame = {
        ...frame,
        flags: frame.flags | FLAGS.RESUME_ENABLE, // eslint-disable-line no-bitwise
        resumeToken: this._resumeToken,
      };
      this._setupFrame = (frame: $FlowIssue); // frame can only be a SetupFrame
    }
    // If connected, immediately write frames to the low-level transport
    // and consider them "sent". The resumption protocol will figure out
    // which frames may not have been received and recover.
    const currentConnection = this._currentConnection;
    if (currentConnection) {
      if (isResumePositionFrameType(frame.type)) {
        this._sentFrames.push(frame);
        if (this._sentFrames.length > this._bufferSize) {
          // Buffer overflows are acceptable here, since the
          // assumption is that most frames will reach the server
          this._sentFrames.shift();
          this._position.client++;
        }
      }
      currentConnection.sendOne(frame);
    } else if (this._bufferSize > 0) {
      // Otherwise buffer pending frames. This allows an application
      // to continue interacting with a ReactiveSocket during momentary
      // losses of connection.
      invariant(
        this._pendingFrames.length < this._bufferSize,
        'RSocketResumableTransport: Buffer size of `%s` exceeded.',
        this._bufferSize,
      );
      this._pendingFrames.push(frame);
    } else {
      invariant(
        false,
        'RSocketResumableTransport: Cannot sent frames while disconnected; ' +
          'buffering is disabled (bufferSize === 0).',
      );
    }
  }
}
