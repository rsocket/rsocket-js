'use strict';
// @flow

import {
  CompositeMetadata,
  WellKnownMimeTypeEntry,
  ExplicitMimeTimeEntry,
  ReservedMimeTypeEntry,
  encodeCustomMetadataHeader,
  encodeAndAddCustomMetadata,
  encodeAndAddWellKnownMetadata,
  decodeMimeAndContentBuffersSlices,
  decodeMimeTypeFromMimeBuffer,
} from '../CompositeMetadata';

import WellKnownMimeType, {
  UNKNOWN_RESERVED_MIME_TYPE,
  APPLICATION_PDF,
} from '../WellKnownMimeType';
import type {Entry} from '../CompositeMetadata';

describe('Composite M', () => {
  it('custom mime header length 128', () => {
    let mimeString = '';
    for (let i = 0; i < 128; i++) {
      mimeString += 'a';
    }

    const encoded = encodeCustomMetadataHeader(mimeString, 0);

    // remember actual length = encoded length + 1
    expect(encoded.readInt8(0)).toBe(127);

    const byteBufs = decodeMimeAndContentBuffersSlices(encoded, 0);
    expect(byteBufs).toHaveLength(2);
    expect(byteBufs).not.toContain(undefined);

    const header = byteBufs[0];
    const content = byteBufs[1];

    expect(header.length).toBeGreaterThan(1);

    expect(header.readInt8()).toBe(128 - 1); // encoded as actual length - 1
    expect(decodeMimeTypeFromMimeBuffer(header)).toBe(mimeString);
    expect(content.length).toBe(0);
  });

  it('decode three entries', () => {
    // metadata 1: well known
    const mimeType1 = APPLICATION_PDF;
    const metadata1 = Buffer.from('abcdefghijkl', 'utf8');

    // metadata 2: custom
    const mimeType2 = 'application/custom';
    const metadata2 = Buffer.alloc(
      Buffer.byteLength('E') +
        Buffer.byteLength('∑') +
        Buffer.byteLength('é') +
        Buffer.byteLength('W') +
        1,
    );
    metadata2.write('E');
    metadata2.write('∑');
    metadata2.write('é');
    metadata2.writeUInt8(true);
    metadata2.write('W');

    // metadata 3: reserved but unknown
    const reserved = 120;
    expect(WellKnownMimeType.fromIdentifier(reserved)).toBe(
      UNKNOWN_RESERVED_MIME_TYPE,
    );

    const metadata3 = Buffer.from([88]);

    let composit = encodeAndAddWellKnownMetadata(
      Buffer.alloc(0),
      mimeType1,
      metadata1,
    );

    composit = encodeAndAddCustomMetadata(composit, mimeType2, metadata2);
    composit = encodeAndAddWellKnownMetadata(composit, reserved, metadata3);

    const iterator = new CompositeMetadata(composit)[Symbol.iterator]();

    const entry1 = iterator.next();
    const value1: Entry = entry1.value;
    expect(value1).not.toBeNull();
    expect(value1).toBeInstanceOf(WellKnownMimeTypeEntry);
    expect(value1.mimeType).toBe(mimeType1.string);
    expect((value1: WellKnownMimeTypeEntry).type).toBe(mimeType1);
    expect(value1.content).toEqual(metadata1);

    const entry2 = iterator.next();
    const value2: Entry = entry2.value;
    expect(value2).not.toBeNull();
    expect(value2).toBeInstanceOf(ExplicitMimeTimeEntry);
    expect(value2.mimeType).toBe(mimeType2);
    expect(value2.content).toEqual(metadata2);

    const entry3 = iterator.next();
    const value3: Entry = entry3.value;
    expect(value3).not.toBeNull();
    expect(value3).toBeInstanceOf(ReservedMimeTypeEntry);
    expect(value3.mimeType).toBeUndefined();
    expect((value3: ReservedMimeTypeEntry).type).toBe(reserved);
    expect(value3.content).toEqual(metadata3);

    expect(iterator.next().done).toBeTruthy();
  });
});
