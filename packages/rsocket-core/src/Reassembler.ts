/*
 * Copyright 2021-2022 the original author or authors.
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

import { Payload } from "./RSocket";

export interface FragmentsHolder {
  hasFragments: boolean;
  data: Buffer | undefined | null;
  metadata: Buffer | undefined | null;
}

export function add(
  holder: FragmentsHolder,
  dataFragment: Buffer,
  metadataFragment?: Buffer | undefined | null
): boolean {
  if (!holder.hasFragments) {
    holder.hasFragments = true;
    holder.data = dataFragment;
    if (metadataFragment) {
      holder.metadata = metadataFragment;
    }
    return true;
  }

  // TODO: add validation
  holder.data = holder.data
    ? Buffer.concat([holder.data, dataFragment])
    : dataFragment;
  if (holder.metadata && metadataFragment) {
    holder.metadata = Buffer.concat([holder.metadata, metadataFragment]);
  }

  return true;
}

export function reassemble(
  holder: FragmentsHolder,
  dataFragment: Buffer,
  metadataFragment: Buffer | undefined | null
): Payload {
  // TODO: add validation
  holder.hasFragments = false;

  const data = holder.data
    ? Buffer.concat([holder.data, dataFragment])
    : dataFragment;

  holder.data = undefined;

  if (holder.metadata) {
    const metadata = metadataFragment
      ? Buffer.concat([holder.metadata, metadataFragment])
      : holder.metadata;

    holder.metadata = undefined;

    return {
      data,
      metadata,
    };
  }

  return {
    data,
  };
}

export function cancel(holder: FragmentsHolder): void {
  holder.hasFragments = false;
  holder.data = undefined;
  holder.metadata = undefined;
}
