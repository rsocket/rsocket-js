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
 */
'use strict';

const babel = require('@babel/core');
const createCacheKeyFunction = require('fbjs-scripts/jest/createCacheKeyFunction');
const moduleMap = require('fbjs/module-map');
const path = require('path');

const babelOptions = {
  babelrc: false,
  plugins: [
    '@babel/plugin-transform-async-to-generator',
    '@babel/plugin-proposal-async-generator-functions',
    [require('../babel-plugin-rewrite-imports'), moduleMap],
  ],
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
  process: function (src, filename) {
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
