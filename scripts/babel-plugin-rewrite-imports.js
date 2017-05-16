/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

'use strict';

var nodePath = require('path');

/**
 * Babel plugin that rewrites import and require statements given a mapping
 * of input -> output names passed as plugin options.
 */
module.exports = function(babel) {
  var t = babel.types;

  /**
   * Transforms `require('Foo')` and `require.requireActual('Foo')`.
   */
  function transformRequireCall(path, state) {
    var calleePath = path.get('callee');
    if (
      !t.isIdentifier(calleePath.node, {name: 'require'}) &&
      !(t.isMemberExpression(calleePath.node) &&
        t.isIdentifier(calleePath.node.object, {name: 'require'}) &&
        t.isIdentifier(calleePath.node.property, {name: 'requireActual'}))
    ) {
      return;
    }

    var args = path.get('arguments');
    if (!args.length) {
      return;
    }
    var moduleArg = args[0];
    if (moduleArg.node.type === 'StringLiteral') {
      var module = mapModule(state, moduleArg.node.value);
      if (module) {
        moduleArg.replaceWith(t.stringLiteral(module));
      }
    }
  }

  /**
   * Transforms import/export statements that have a `source` property:
   * - `import ... from 'Foo'`
   * - `import type Bar from 'foo'`
   */
  function tranformImportExport(path, state) {
    var source = path.get('source');
    if (source && source.type === 'StringLiteral') {
      var module = mapModule(state, source.node.value);
      if (module) {
        source.replaceWith(t.stringLiteral(module));
      }
    }
  }

  /**
   * Transforms
   */
  function transformTypeImport(path, state) {
    var source = path.get('source');
    if (source.type === 'StringLiteral') {
      var module = mapModule(state, source.node.value);
      if (module) {
        source.replaceWith(t.stringLiteral(module));
      }
    }
  }

  return {
    visitor: {
      CallExpression: {
        exit(path, state) {
          if (path.node.seen) {
            return;
          }
          transformRequireCall(path, state);
          path.node.seen = true;
        },
      },
      ExportAllDeclaration: {
        exit(path, state) {
          tranformImportExport(path, state);
        },
      },
      ExportNamedDeclaration: {
        exit(path, state) {
          tranformImportExport(path, state);
        },
      },
      ImportDeclaration: {
        exit(path, state) {
          tranformImportExport(path, state);
        },
      },
    },
  };
};

function mapModule(state, module) {
  var moduleMap = state.opts || {};
  if (moduleMap.hasOwnProperty(module)) {
    // Rewrites only modules specifically defined in the module map.
    return moduleMap[module];
  }
  return null;
}
