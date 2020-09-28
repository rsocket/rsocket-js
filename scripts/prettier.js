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
    patterns: ['./packages/*/src/**/', './packages/*'],
    options: {
      'bracket-spacing': 'false',
      'print-width': '80',
      'single-quote': 'true',
      'trailing-comma': 'all',
    },
  },
  scripts: {
    patterns: ['./*scripts/**/'],
    options: {
      'bracket-spacing': 'false',
      'print-width': '80',
      'single-quote': 'true',
      'trailing-comma': 'es5',
    },
  },
};

Object.keys(config).forEach((key) => {
  const patterns = config[key].patterns;
  const options = config[key].options;
  const files = [];
  patterns.forEach((pattern) => {
    const matches = glob
      .sync(`${pattern}*.js`)
      .filter((file) => !file.includes(path.sep + 'node_modules' + path.sep));
    files.push(...matches);
  });

  const args = Object.keys(options).map((key) => `--${key}=${options[key]}`);
  args.push(`--${shouldWrite ? 'write' : 'l'} ${files.join(' ')}`);

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
