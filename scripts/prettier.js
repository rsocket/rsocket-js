/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */
'use strict';

const chalk = require('chalk');
const glob = require('glob');
const path = require('path');
const runCommand = require('./_runCommand');

const shouldWrite = process.argv[2] === 'write';
const isWindows = process.platform === 'win32';
const prettier = isWindows ? 'prettier.cmd' : 'prettier';
const prettierCmd = path.resolve(__dirname, '../node_modules/.bin/' + prettier);

const config = {
  src: {
    patterns: ['packages/*/src/**/', 'packages/*'],
    options: {
      'bracket-spacing': 'false',
      'print-width': '80',
      'single-quote': 'true',
      'trailing-comma': 'all',
    },
  },
  scripts: {
    patterns: ['scripts/**/'],
    options: {
      'bracket-spacing': 'false',
      'print-width': '80',
      'single-quote': 'true',
      'trailing-comma': 'es5',
    },
  },
};

Object.keys(config).forEach(key => {
  const patterns = config[key].patterns;
  const options = config[key].options;
  const files = [];
  patterns.forEach(pattern => {
    const matches = glob
      .sync(`${pattern}*.js`)
      .filter(file => !file.includes(path.sep + 'node_modules' + path.sep));
    files.push(...matches);
  });

  const args = Object.keys(options).map(key => `--${key}=${options[key]}`);
  args.push(`--${shouldWrite ? 'write' : 'l'} {${files.join(' ')}}`);

  try {
    runCommand(prettierCmd, args.join(' '), path.resolve(__dirname, '..'));
  } catch (e) {
    console.log(e);
    if (!shouldWrite) {
      console.log(
        chalk.red(
          `  This project uses prettier to format all JavaScript code.\n`
        ) +
          chalk.dim(`    Please run `) +
          chalk.reset('yarn prettier') +
          chalk.dim(` and add changes to files listed above to your commit.`) +
          `\n`
      );
    }
  }
});
