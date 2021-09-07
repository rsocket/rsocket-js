import { StreamFrameHandler, StreamLifecycleHandler } from "./Transport";

export interface LeaseManager {
  requestLease(handler: StreamFrameHandler & StreamLifecycleHandler): void;
  cancelRequest(handler: StreamFrameHandler & StreamLifecycleHandler): void;
}
