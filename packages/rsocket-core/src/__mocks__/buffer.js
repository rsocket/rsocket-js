// __mocks__/fs.js
'use strict';

const buffer = jest.createMockFromModule('buffer');
buffer.Buffer = function() {

};
buffer.Buffer.isBuffer = () => false;
module.exports = buffer;
