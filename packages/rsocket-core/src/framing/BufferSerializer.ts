export default class BufferSerializer {
  protected bufferImpl: typeof Buffer;
  constructor(bufferImpl?: typeof Buffer) {
    this.bufferImpl = bufferImpl;
  }
}
