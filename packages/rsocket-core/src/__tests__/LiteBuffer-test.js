'use strict';
import {Buffer as B} from '../LiteBuffer';

describe('Lite B', () => {
  it('large values do not improperly roll over', () => {
    const nums = [-25589992, -633756690, -898146932];
    const out = new B(12);
    out.fill(0);
    out.writeInt32BE(nums[0], 0);
    let newNum = out.readInt32BE(0);
    expect(nums[0]).toEqual(newNum);
    out.writeInt32BE(nums[1], 4);
    newNum = out.readInt32BE(4);
    expect(nums[1]).toEqual(newNum);
    out.writeInt32BE(nums[2], 8);
    newNum = out.readInt32BE(8);
    expect(nums[2]).toEqual(newNum);
  });

  it('writeUInt32BE and readUInt32BE should work', () => {
    const buf = B.from([0x12, 0x34, 0x56, 0x78]);

    expect(buf.readUInt32BE(0).toString(16)).toEqual('12345678');
    buf.writeUInt32BE(0x56, 0);
    expect(buf.readUInt32BE(0).toString(16)).toEqual('56');
  });

  it('writeUInt8 and readUInt8 should work', () => {
    const b = new B(3);
    b.writeUInt8(1, 0);
    b.writeUInt8(2, 1);
    b.writeUInt8(3, 2);

    expect(b.readUInt8(0)).toEqual(1);
    expect(b.readUInt8(1)).toEqual(2);
    expect(b.readUInt8(2)).toEqual(3);
  });

  it('writeUInt16BE and readUInt16BE should work', () => {
    const buf = new B(4);

    buf.writeUInt16BE(0xdead, 0);
    buf.writeUInt16BE(0xbeef, 2);

    expect(buf.readUInt16BE(0)).toEqual(57005);
    expect(buf.readUInt16BE(1)).toEqual(44478);
  });

  it('supports copy, slice and length', () => {
    const b = new B(3);
    b.writeUInt8(1, 0);
    b.writeUInt8(2, 1);
    b.writeUInt8(3, 2);
    const buf2 = new B(3);
    b.copy(buf2, 0, 1);
    expect(buf2.readUInt8(0)).toEqual(2);
    expect(buf2.readUInt8(1)).toEqual(3);
    expect(buf2.readUInt8(2)).toEqual(0);
    expect(buf2.length).toEqual(3);
    expect(buf2.slice(1, 2).readUInt8(0)).toEqual(3);
  });

  it('supports toString and B.isBuffer', () => {
    const buf1 = new B(26);

    for (let i = 0; i < 26; i++) {
      // 97 is the decimal ASCII value for 'a'
      buf1[i] = i + 97;
    }

    expect(buf1.toString('utf8')).toEqual('abcdefghijklmnopqrstuvwxyz');
    expect(B.isBuffer(buf1)).toBe(true);
  });

  it('supports utf8 write String', () => {
    const buf1 = new B(26);

    expect(buf1.write('abcdefghijklmnopqrstuvwxyz')).toBe(26);
    expect(buf1.toString('utf8')).toEqual('abcdefghijklmnopqrstuvwxyz');
  });

  it('supports utf8 write String with offset', () => {
    const buf1 = new B(30);

    expect(buf1.write('abcdefghijklmnopqrstuvwxyz', 4)).toBe(26);
    expect(buf1.toString('utf8', 4)).toEqual('abcdefghijklmnopqrstuvwxyz');
  });
});
