/** Copyright 2015-2019 the original author or authors.
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
 */

'use strict';

/* eslint-disable */

import {CONNECTION_STREAM_ID, FLAGS, FRAME_TYPES} from '../RSocketFrame';
import {genMockConnection} from 'MockDuplexConnection';
import {Flowable, Single} from 'rsocket-flowable';
import {
  Lease,
  Leases,
  RequesterLeaseHandler,
  ResponderLeaseHandler,
} from '../RSocketLease';
import * as RSocketMachine from '../RSocketMachine';

describe('RSocketLease', () => {
  describe('RSocket requester', () => {
    let connection;
    let rSocketMachine;
    let payload;
    let responder;
    let receiver;

    beforeEach(() => {
      payload = {data: 'data', metadata: ''};
      responder = {requestResponse: (p) => Single.just(payload)};
      receiver = frameReceiver();
      connection = genMockConnection();

      const lease = new Leases();
      rSocketMachine = RSocketMachine.createClientMachine(
        connection,
        (subs) => receiver.subscriber(subs),
        100000,
        undefined,
        responder,
        (error) => {},
        new RequesterLeaseHandler(lease._receiver),
        new ResponderLeaseHandler(lease._sender, lease._stats),
      );
    });

    it('sets requester not available before received lease', () => {
      expect(rSocketMachine.availability()).toBe(0);
      const result = call(rSocketMachine.requestResponse(payload));
      expect(result.error).toBeTruthy();
      expect(result.error.message === 'Lease was not received yet');
    });

    it('sets requester available after received lease', () => {
      receiver.receive(leaseFrame(1000, 2));
      expect(rSocketMachine.availability()).toBe(1);

      const result = call(rSocketMachine.requestResponse(payload));
      expect(rSocketMachine.availability()).toBe(0.5);
      expect(result.error).toBeFalsy();
    });

    it('sets requester not available after depleted lease', () => {
      receiver.receive(leaseFrame(1000, 1));
      call(rSocketMachine.requestResponse(payload));
      expect(rSocketMachine.availability()).toBe(0);

      const result = call(rSocketMachine.requestResponse(payload));
      expect(rSocketMachine.availability()).toBe(0);
      expect(result.error).toBeTruthy();
      expect(
        result.error.message ===
          'Missing leases. Expired: false, allowedRequests: 0',
      );
    });

    it('sets requester not available after expired lease', (done) => {
      receiver.receive(leaseFrame(1, 1));
      setTimeout(() => {
        expect(rSocketMachine.availability()).toBe(0);
        const result = call(rSocketMachine.requestResponse(payload));
        expect(result.error).toBeTruthy();
        expect(
          result.error.message ===
            'Missing leases. Expired: true, allowedRequests: 1',
        );
        done();
      }, 10);
    });

    it('sets requester available after renewed lease', () => {
      receiver.receive(leaseFrame(1000, 1));
      call(rSocketMachine.requestResponse(payload));
      call(rSocketMachine.requestResponse(payload));
      receiver.receive(leaseFrame(1000, 1));
      expect(rSocketMachine.availability()).toBe(1);
      const result = call(rSocketMachine.requestResponse(payload));
      expect(result.error).toBeFalsy();
    });
  });

  describe('RSocket responder', () => {
    let connection;
    let rSocketMachine;
    let payload;
    let responder;
    let receiver;
    let sender;

    beforeEach(() => {
      payload = {data: 'data', metadata: ''};
      responder = {requestResponse: (p) => Single.of(payload)};
      receiver = frameReceiver();
      connection = genMockConnection();
      sender = leaseSender();
      const lease = new Leases().sender((stats) => sender.leases);
      rSocketMachine = RSocketMachine.createClientMachine(
        connection,
        (subs) => receiver.subscriber(subs),
        100000,
        undefined,
        responder,
        (error) => {},
        new RequesterLeaseHandler(lease._receiver),
        new ResponderLeaseHandler(lease._sender, lease._stats),
      );
    });

    it('sets responder not available before sent lease', () => {
      receiver.receive(requestFrame(payload));
      const responderFrame = connection.sendOne.mock.frame;
      expect(responderFrame).toBeTruthy();
      expect(responderFrame.type).toEqual(FRAME_TYPES.ERROR);
      expect(responderFrame.message).toEqual('Lease was not received yet');
    });

    it('sets responder available after sent lease', () => {
      sender.send(new Lease(1000, 1));
      let sentFrame = connection.sendOne.mock.frame;
      expect(sentFrame).toBeTruthy();
      expect(sentFrame.type).toEqual(FRAME_TYPES.LEASE);
      receiver.receive(requestFrame(payload));
      sentFrame = connection.sendOne.mock.frame;
      expect(sentFrame).toBeTruthy();
      expect(sentFrame.type).toEqual(FRAME_TYPES.PAYLOAD);
    });

    it('sets responder not available after depleted lease', () => {
      sender.send(new Lease(1000, 1));
      receiver.receive(requestFrame(payload));
      receiver.receive(requestFrame(payload));
      const responderFrame = connection.sendOne.mock.frame;
      expect(responderFrame).toBeTruthy();
      expect(responderFrame.type).toEqual(FRAME_TYPES.ERROR);
      expect(responderFrame.message).toEqual(
        'Missing leases. Expired: false, allowedRequests: 0',
      );
    });

    it('sets responder not available after expired lease', (done) => {
      sender.send(new Lease(1, 1));
      setTimeout(() => {
        receiver.receive(requestFrame(payload));
        const responderFrame = connection.sendOne.mock.frame;
        expect(responderFrame).toBeTruthy();
        expect(responderFrame.type).toEqual(FRAME_TYPES.ERROR);
        expect(responderFrame.message).toEqual(
          'Missing leases. Expired: true, allowedRequests: 1',
        );
        done();
      }, 10);
    });

    it('sets responder available after renewed lease', () => {
      sender.send(new Lease(1000, 1));
      receiver.receive(requestFrame(payload));
      receiver.receive(requestFrame(payload));
      sender.send(new Lease(1000, 1));
      receiver.receive(requestFrame(payload));
      const responderFrame = connection.sendOne.mock.frame;
      expect(responderFrame).toBeTruthy();
      expect(responderFrame.type).toEqual(FRAME_TYPES.PAYLOAD);
    });
  });

  function call(interaction) {
    let error;
    interaction.subscribe({
      onError: (err) => (error = err),
    });
    return {error};
  }

  function leaseFrame(ttl, requests) {
    return {
      type: FRAME_TYPES.LEASE,
      flags: 0,
      ttl: ttl,
      requestCount: requests,
      streamId: CONNECTION_STREAM_ID,
    };
  }

  function requestFrame(payload) {
    return {
      data: payload.data,
      flags: payload.metadata !== undefined ? FLAGS.METADATA : 0,
      metadata: payload.metadata,
      streamId: 1,
      type: FRAME_TYPES.REQUEST_RESPONSE,
    };
  }

  function frameReceiver() {
    let subs;
    return {
      subscriber: (s) => (subs = s),
      receive: (frame) => subs.onNext(frame),
    };
  }

  function leaseSender() {
    let subs;
    let requested = 0;
    let cancelled;
    return {
      leases: new Flowable((subscriber) => {
        subs = subscriber;
        subscriber.onSubscribe({
          cancel: () => (cancelled = true),
          request: (n) =>
            (requested = Math.min(Number.MAX_SAFE_INTEGER, requested + n)),
        });
      }),
      send: (lease) => {
        if (!cancelled && requested > 0) {
          subs.onNext(lease);
          requested--;
        }
      },
    };
  }
});
