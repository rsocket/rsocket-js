/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

'use strict';

const assign = require('object-assign');
const babel = require('babel-core');
const chalk = require('chalk');
const fbjsModuleMap = require('fbjs/module-map');
const fs = require('fs');
const getPackages = require('./getPackages');
const glob = require('glob');
const micromatch = require('micromatch');
const mkdirp = require('mkdirp');
const path = require('path');
const prettier = require('prettier');
const rollup = require('rollup');
const rollupBabel = require('rollup-plugin-babel');
const rollupCommonJS = require('rollup-plugin-commonjs');
const rollupResolve = require('rollup-plugin-node-resolve');

const BUILD_DIR = 'build';
const SRC_DIR = 'src';
const ROOT_DIR = path.resolve(__dirname, '..');
const PACKAGES_DIR = path.resolve(ROOT_DIR, 'packages');
const JS_FILES_PATTERN = path.resolve(PACKAGES_DIR, '**/*.js');
const IGNORE_PATTERN = '**/__(mocks|snapshots|tests)__/**';
const FLOW_EXTENSION = '.flow';

function getBabelOptions(options) {
  return {
    babelrc: false,
    plugins: [
      'transform-flow-strip-types',
      ['transform-object-rest-spread', {useBuiltIns: true}],
      'transform-class-properties',
      options && options.modules ? 'transform-es2015-modules-commonjs' : null,
      'transform-async-to-generator',
      [
        'minify-replace',
        {
          replacements: [
            {
              identifierName: '__DEV__',
              replacement: {
                type: 'booleanLiteral',
                value: false,
              },
            },
          ],
        },
      ],
    ].filter(p => !!p),
    retainLines: true,
  };
}

// Load packages and memoize the name list
const packages = getPackages();
const packageNames = packages.map(pkg => path.basename(pkg));

// Packages that should also be exported as Haste modules:
const hastePackages = {
  'rsocket-core': true,
  'rsocket-types': true,
  'rsocket-flowable': true,
  'rsocket-websocket-client': true,
};

/**
 * For haste-compatible bundles, consider other rsocket packages and fbjs
 * libraries as external, rewriting imports to map to the haste name.
 */
const hasteMap = {};
const hasteExternal = [];

packageNames.forEach(pkg => {
  hasteExternal.push(pkg);
  hasteMap[pkg] = pkg;
});
Object.keys(fbjsModuleMap).forEach(hasteName => {
  const npmPath = fbjsModuleMap[hasteName];
  hasteExternal.push(npmPath);
  hasteMap[npmPath] = hasteName;
});

function buildPackage(pkg) {
  const srcDir = path.resolve(pkg, SRC_DIR);
  const pattern = path.resolve(srcDir, '**/*');
  const files = glob.sync(pattern, {nodir: true});

  files.forEach(file => buildFile(file, true));
  process.stdout.write(`${chalk.green('=>')} ${path.basename(pkg)} (npm)\n`);
}

function buildFile(file, silent) {
  const packageName = path.relative(PACKAGES_DIR, file).split(path.sep)[0];
  const packageSrcPath = path.resolve(PACKAGES_DIR, packageName, SRC_DIR);
  const packageBuildPath = path.resolve(PACKAGES_DIR, packageName, BUILD_DIR);
  const relativeToSrcPath = path.relative(packageSrcPath, file);
  const destPath = path.resolve(packageBuildPath, relativeToSrcPath);

  mkdirp.sync(path.dirname(destPath));
  if (micromatch.isMatch(file, IGNORE_PATTERN)) {
    silent ||
      process.stdout.write(
        chalk.dim('  \u2022 ') +
          path.relative(PACKAGES_DIR, file) +
          ' (ignore)\n'
      );
  } else if (!micromatch.isMatch(file, JS_FILES_PATTERN)) {
    fs.createReadStream(file).pipe(fs.createWriteStream(destPath));
    silent ||
      process.stdout.write(
        chalk.red('  \u2022 ') +
          path.relative(PACKAGES_DIR, file) +
          chalk.red(' \u21D2 ') +
          path.relative(PACKAGES_DIR, destPath) +
          ' (copy)' +
          '\n'
      );
  } else {
    let code = babel.transformFileSync(
      file,
      getBabelOptions({modules: true})
    ).code;
    code = format(code);
    fs.writeFileSync(destPath, code);
    // Write .flow type
    fs
      .createReadStream(file)
      .pipe(fs.createWriteStream(destPath + FLOW_EXTENSION));
    silent ||
      process.stdout.write(
        chalk.green('  \u2022 ') +
          path.relative(PACKAGES_DIR, file) +
          chalk.green(' \u21D2 ') +
          path.relative(PACKAGES_DIR, destPath) +
          '\n'
      );
  }
}

function shouldBuildHaste(pkg) {
  const packageName = path.basename(pkg);
  return hastePackages.hasOwnProperty(packageName);
}

function buildHasteRollup(pkg) {
  const packageName = path.basename(pkg);
  const entryPath = path.resolve(pkg, SRC_DIR, 'index.js');
  const destPath = path.resolve(pkg, BUILD_DIR, 'haste', packageName + '.js');

  return rollup
    .rollup({
      entry: entryPath,
      external: hasteExternal,
      plugins: [
        rollupResolve({
          preferBuiltins: false,
          jail: ROOT_DIR,
        }),
        rollupCommonJS(),
        rollupBabel(getBabelOptions()),
      ],
      onwarn: warning => {
        process.stdout.write('Warning for package ' + packageName + '\n');
        if (warning.message != null) {
          process.stdout.write(warning.message + '\n');
        } else {
          process.stdout.write(String(warning) + '\n');
        }
      },
    })
    .then(bundle => {
      let code = bundle.generate({
        format: 'cjs',
        interop: false,
        moduleName: packageName,
      }).code;
      // Post-rollup transform to rewrite imports between packages
      code = babel.transform(code, {
        babelrc: false,
        filename: destPath,
        plugins: [[require('./babel-plugin-rewrite-imports'), hasteMap]],
        retainLines: true,
      }).code;
      // Format code for debuggability
      code = format(code);

      mkdirp.sync(path.dirname(destPath));
      fs.writeFileSync(destPath, code, 'utf8');
      process.stdout.write(`${chalk.green('=>')} ${packageName} (haste)\n`);

      // Return the haste module path, used by wrapper scripts
      return destPath;
    })
    .catch(error => {
      process.stderr.write(
        chalk.red(`Error building ${packageName} (haste)\n`)
      );
      throw error;
    });
}

function format(code) {
  return prettier.format(code, {
    bracketSpacing: false,
    parser: 'flow',
    printWidth: 80,
    singleQuote: true,
    tabWidth: 2,
    trailingComma: 'es5',
  });
}

function main(files) {
  if (files && files.length) {
    files.forEach(buildFile);
    return Promise.resolve();
  } else {
    process.stdout.write(chalk.bold.inverse('Building packages\n'));
    packages.forEach(buildPackage);
    return Promise.all(
      packages.filter(shouldBuildHaste).map(buildHasteRollup)
    ).catch(error => {
      process.stderr.write((error.stack || error.message) + '\n');
      throw error;
    });
  }
}

// Called directly via command line (e.g. `node build.js`):
if (require.main === module) {
  const files = process.argv.slice(2);
  main(files).then(() => process.exit(0), () => process.exit(1));
}

module.exports = main;
