import net from "net";
import { IDuplexConnection, TFrame } from "@rsocket/rsocket-types";
import BufferFrameSerializer from "@rsocket/rsocket-core/src/framing/BufferFrameSerializer";

class TcpConnection implements IDuplexConnection {
  private readonly connectionOptions: net.NetConnectOpts;
  private socket: net.Socket;

  constructor(connectionOptions: net.NetConnectOpts) {
    this.connectionOptions = connectionOptions;
  }

  sendFrame(s: TFrame): void {
    throw new Error("Method not implemented.");
  }

  handleFrames(handler: (arg0: TFrame) => void): void {
    throw new Error("Method not implemented.");
  }

  close(error?: Error): Promise<void> {
    throw new Error("Method not implemented.");
  }

  onClose(handler: (arg0: IDuplexConnection) => void): Promise<void> {
    throw new Error("Method not implemented.");
  }

  async connect(): Promise<this> {
    await this.connectAsync();
    this.bindEventHandlers();
    return this;
  }

  private bindEventHandlers() {
    this.socket.on("data", this.onData);
    this.socket.on("close", this.onError);
    this.socket.on("end", this.onError);
    this.socket.on("error", this.onError);
  }

  private async connectAsync() {
    this.socket = net.connect(this.connectionOptions);
    return new Promise((resolve, reject) => {
      this.socket.once("close", reject);
      this.socket.once("end", reject);
      this.socket.once("error", reject);
      this.socket.once("connect", resolve);
    });
  }

  private onData(arg0: string, _handleData: any) {
    throw new Error("[onData] Method not implemented.");
  }

  private onError(arg0: string, _handleError: any) {
    throw new Error("[onError] Method not implemented.");
  }

  public write(buffer: Buffer) {
    this.socket.write(buffer);
  }
}

class RSocketTcpClient {
  private connection: TcpConnection;
  private frameSerializer: BufferFrameSerializer;

  constructor(connectionOptions: net.NetConnectOpts) {
    this.connection = new TcpConnection(connectionOptions);
    this.frameSerializer = new BufferFrameSerializer();
  }

  async connect(): Promise<this> {
    await this.connection.connect();
    return this;
  }

  public sendOne(frame: TFrame): void {
    const buffer = this.frameSerializer.serializeFrameWithLength(frame);
    this.connection.write(buffer);
  }
}

export default RSocketTcpClient;
