import { TFrame } from "@rsocket/rsocket-types";

export default interface IFrameSerializer<T> {
  serialize(frame: TFrame): Buffer;
  deserialize(): T;
}
