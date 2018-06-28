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
const spawn = require('child_process').spawnSync;

module.exports = function runCommand(cmd, args, cwd) {
  if (!cwd) {
    cwd = __dirname;
  }

  const callArgs = args.split(' ');
  console.log(
    chalk.dim('$ cd ' + cwd) +
      '\n' +
      chalk.dim(
        '  $ ' +
          cmd +
          ' ' +
          (args.length > 1000 ? args.slice(0, 1000) + '...' : args)
      ) +
      '\n'
  );
  const result = spawn(cmd, callArgs, {
    cwd,
    stdio: 'inherit',
  });
  if (result.error || result.status !== 0) {
    const message = 'Error running command.';
    const error = new Error(message);
    error.stack = message;
    throw error;
  }
};
