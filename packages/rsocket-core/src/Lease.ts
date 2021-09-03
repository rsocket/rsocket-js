import { StreamFrameHandler, StreamLifecycleHandler } from "./Transport";

export interface LeaseManager {
  add(handler: StreamFrameHandler & StreamLifecycleHandler): void;
  remove(handler: StreamFrameHandler & StreamLifecycleHandler): void;
}
