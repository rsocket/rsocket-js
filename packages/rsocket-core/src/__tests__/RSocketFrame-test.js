/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

'use strict';

import {FRAME_TYPES, createErrorFromFrame} from '../RSocketFrame';

describe('RSocketFrame', () => {
  describe('createErrorFromFrame()', () => {
    it('creates errors with a `source` property', () => {
      const errorFrame = {
        code: 0x00000201, // application error
        flags: 0,
        message: '<error>',
        streamId: 1,
        type: FRAME_TYPES.ERROR,
      };
      const error = createErrorFromFrame(errorFrame);
      expect(error.message).toBe(
        'RSocket error 0x201 (APPLICATION_ERROR): <error>. See error ' +
          '`source` property for details.',
      );
      expect(error.source.code).toBe(0x00000201);
      expect(error.source.explanation).toBe('APPLICATION_ERROR');
      expect(error.source.message).toBe('<error>');
    });
  });
});
