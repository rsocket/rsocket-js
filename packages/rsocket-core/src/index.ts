// import { meaningOfLife } from "@nighttrax/foo";
//
// // eslint-disable-next-line no-console
// console.log(meaningOfLife);

/*
 * Copyright 2015-present the original author or authors.
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

// public protocol Cancellable {
//     func onCancel()
//     func onError(_ error: Error)
//     func onExtension(extendedType: Int32, payload: Payload, canBeIgnored: Bool)
// }
//
// public protocol Subscription: Cancellable {
//     func onRequestN(_ requestN: Int32)
// }
//
// public protocol UnidirectionalStream: Subscription {
//     func onNext(_ payload: Payload, isCompletion: Bool)
//     func onComplete()
// }

export * from "./RSocketFrame";
export * from "./RSocketVersion";
export * from "./encoding";
