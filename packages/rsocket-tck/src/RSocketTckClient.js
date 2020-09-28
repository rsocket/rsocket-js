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
 *
 * @flow
 */

import {RSocketClient} from 'rsocket-core';
import RSocketTcpClient from 'rsocket-tcp-client';
import RSocketTckRequestResponseSubscriber from './RSocketTckRequestResponseSubscriber';
import RSocketTckRequestStreamSubscriber from './RSocketTckRequestStreamSubscriber';

import areEqual from 'fbjs/lib/areEqual';
import chalk from 'chalk';
import fs from 'fs';
import nullthrows from 'fbjs/lib/nullthrows';
import path from 'path';
import sprintf from 'fbjs/lib/sprintf';
import util from 'util';
import yargs from 'yargs';

import type {Payload, ReactiveSocket} from 'rsocket-types';

type Options = {
  host: string,
  port: number,
  testfile: string,
  verbose?: boolean,
};

export default function main() {
  const argv = yargs
    .usage('$0 --testfile <path> --host <host> --port <port> [--verbose]')
    .options({
      host: {
        default: '127.0.0.1',
        describe: 'TCK server hostname.',
        type: 'string',
      },
      port: {
        default: 9898,
        describe: 'TCK server port.',
        type: 'string',
      },
      testfile: {
        default: path.join(__dirname, './clienttest.txt'),
        describe: 'Path to client test file.',
        type: 'string',
      },
      verbose: {
        default: false,
        describe:
          'Log each action as it is performed instead of just logging success/failure.',
        type: 'boolean',
      },
    })
    .help().argv;

  Promise.resolve(run(argv)).then(
    () => {
      process.stdout.write(chalk.green('All tests pass.') + '\n');
      process.exit(0);
    },
    error => {
      process.stderr.write(chalk.red('Test failed: ' + error.message) + '\n');
      process.exit(1);
    },
  );
}

async function run(options: Options): Promise<void> {
  const testfilePath = path.resolve(process.cwd(), options.testfile);
  if (!fs.existsSync(testfilePath)) {
    throw new Error(
      `--testfile ${options.testfile}: file does does not exist (${testfilePath}).`,
    );
  }
  process.stdout.write(chalk.inverse('Running TCK tests') + '\n');
  process.stdout.write(sprintf('Using testfile %s', testfilePath) + '\n');
  process.stdout.write(
    sprintf('Connecting to server at %s:%s', options.host, options.port) + '\n',
  );
  const testSource = fs.readFileSync(testfilePath, 'utf8');
  const testCases = testSource
    .split('!')
    .filter(item => item.trim().length > 0);

  const socket = await connect(options);

  function assert(cond, msg, ...rest) {
    if (!cond) {
      throw new Error(sprintf(msg, ...rest));
    }
  }
  function log(msg, ...rest) {
    if (options.verbose) {
      process.stdout.write(chalk.dim(sprintf(msg, ...rest)) + '\n');
    }
  }

  try {
    while (testCases.length) {
      const testCase = testCases.shift();
      if (!testCase.length) {
        continue;
      }
      let subscriber;

      const lines = testCase.split('\n');
      while (lines.length) {
        const line = lines.shift().trim();
        if (!line.length) {
          continue;
        }
        const [command, ...args] = line.split('%%');
        log(command + ' ' + JSON.stringify(args));
        switch (command) {
          case 'name': {
            break;
          }
          case 'subscribe': {
            const [type, _, data, metadata] = args; // eslint-disable-line no-unused-vars
            if (type === 'rr') {
              subscriber = new RSocketTckRequestResponseSubscriber(log);
              socket.requestResponse({data, metadata}).subscribe(subscriber);
            } else if (type === 'rs') {
              subscriber = new RSocketTckRequestStreamSubscriber(log);
              socket.requestStream({data, metadata}).subscribe(subscriber);
            } else {
              assert(false, 'Invalid `subscribe` type %s.', type);
            }
            break;
          }
          case 'request': {
            const [n] = args;
            nullthrows(subscriber).request(parseInt(n, 10));
            break;
          }
          case 'cancel': {
            nullthrows(subscriber).cancel();
            break;
          }
          case 'await': {
            const [type, _, nOrTime] = args; // eslint-disable-line no-unused-vars
            if (type === 'terminal') {
              await nullthrows(subscriber).awaitTerminal();
            } else if (type === 'atLeast') {
              await nullthrows(subscriber).awaitN(parseInt(nOrTime, 10));
            } else if (type === 'no_events') {
              await delay(parseInt(nOrTime, 10));
            } else {
              assert(false, 'Invalid `await` type %s.', type);
            }
            break;
          }
          case 'take': {
            const [n] = args;
            await nullthrows(subscriber).awaitN(parseInt(n, 10));
            nullthrows(subscriber).cancel();
            break;
          }
          case 'assert': {
            const [type, _, other] = args; // eslint-disable-line no-unused-vars
            if (type === 'no_error') {
              assert(
                !nullthrows(subscriber).hasError(),
                'Expected onError not to be called.',
              );
            } else if (type === 'error') {
              assert(
                nullthrows(subscriber).hasError(),
                'Expected onError to be called.',
              );
            } else if (type === 'received') {
              const expected = parsePayloads(other);
              const actual = nullthrows(subscriber).getPayloads();
              if (!areEqual(actual, expected)) {
                log('expected: %s', util.inspect(expected));
                log('actual: %s', util.inspect(actual));
                assert(false, 'Actual/expected payloads differed.');
              }
            } else if (type === 'received_n') {
              const expected = parseInt(other, 10);
              const actual = nullthrows(subscriber).getPayloads().length;
              assert(
                actual === expected,
                'Expected exactly %s payloads, got %s.',
                expected,
                actual,
              );
            } else if (type === 'received_at_least') {
              const expected = parseInt(other, 10);
              const actual = nullthrows(subscriber).getPayloads().length;
              assert(
                actual >= expected,
                'Expected at least %s payloads, got %s.',
                expected,
                actual,
              );
            } else if (type === 'completed') {
              assert(
                nullthrows(subscriber).isCompleted(),
                'Expected onComplete to be called.',
              );
            } else if (type === 'no_completed') {
              assert(
                !nullthrows(subscriber).isCompleted(),
                'Expected onComplete not to be called.',
              );
            } else if (type === 'canceled') {
              assert(
                nullthrows(subscriber).isCanceled(),
                'Expected request to be canceled.',
              );
            }
            break;
          }
          case 'EOF':
            return;
          default:
            assert(false, 'Unsupported command %s', command);
        }
      }
    }
  } catch (error) {
    log(error.stack || error.message);
    throw error;
  }
}

async function connect(options: Options): Promise<ReactiveSocket<*, *>> {
  const client = new RSocketClient({
    setup: {
      dataMimeType: 'text/plain',
      keepAlive: 1000000, // avoid sending during test
      lifetime: 100000,
      metadataMimeType: 'text/plain',
    },
    transport: new RSocketTcpClient({
      host: options.host,
      port: options.port,
    }),
  });
  return new Promise((resolve, reject) => {
    client.connect().subscribe({
      onComplete: resolve,
      onError: reject,
    });
  });
}

function parsePayloads(data): Array<Payload<*, *>> {
  const payloads = [];
  data.split('&&').forEach(item => {
    const [data, metadata] = item.split(',');
    if (data != null && metadata != null) {
      payloads.push({data, metadata});
    }
  });
  return payloads;
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}
