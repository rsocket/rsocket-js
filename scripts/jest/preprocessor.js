/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */
'use strict';

const babel = require('babel-core');
const createCacheKeyFunction = require('fbjs-scripts/jest/createCacheKeyFunction');
const moduleMap = require('fbjs/module-map');
const path = require('path');

const babelOptions = {
  babelrc: false,
  plugins: [[require('../babel-plugin-rewrite-imports'), moduleMap]],
  presets: [
    require('babel-preset-fbjs/configure')({
      autoImport: true,
      inlineRequires: true,
      rewriteModules: {
        map: moduleMap,
      },
      stripDEV: false,
    }),
  ],
  retainLines: true,
};

module.exports = {
  process: function(src, filename) {
    const options = Object.assign({}, babelOptions, {
      filename: filename,
    });
    return babel.transform(src, options).code;
  },

  getCacheKey: createCacheKeyFunction([
    __filename,
    path.join(
      path.dirname(require.resolve('babel-preset-fbjs')),
      'package.json'
    ),
  ]),
};
