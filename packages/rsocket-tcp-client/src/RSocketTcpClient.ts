import net from "net";
import { IDuplexConnection, TFrame } from "@rsocket/rsocket-types";
import BufferFrameSerializer from "../../rsocket-core/src/BufferFrameSerializer";

class TcpConnection implements IDuplexConnection {
  private readonly connectionOptions: net.NetConnectOpts;
  private connection: net.Socket;
  private frameSerializer: BufferFrameSerializer;

  constructor(connectionOptions: net.NetConnectOpts) {
    this.connectionOptions = connectionOptions;
    this.frameSerializer = new BufferFrameSerializer();
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

  async connect(): Promise<any> {
    await this.connectAsync();
    this.bindEventHandlers();
    return this;
  }

  private bindEventHandlers() {
    this.connection.on("data", this.onData);
    this.connection.on("close", this.onError);
    this.connection.on("end", this.onError);
    this.connection.on("error", this.onError);
  }

  private async connectAsync() {
    this.connection = net.connect(this.connectionOptions);
    return new Promise((resolve, reject) => {
      this.connection.once("close", reject);
      this.connection.once("end", reject);
      this.connection.once("error", reject);
      this.connection.once("connect", resolve);
    });
  }

  private onData(arg0: string, _handleData: any) {
    throw new Error("Method not implemented.");
  }

  private onError(arg0: string, _handleError: any) {
    throw new Error("Method not implemented.");
  }

  sendOne(frame: TFrame): void {
    const buffer = this.frameSerializer.serializeFrameWithLength(frame);
    this.connection.write(buffer);
  }
}

class RSocketTcpClient {
  private connection: TcpConnection;

  constructor(
    connectionOptions: net.NetConnectOpts
  ) {
    this.connection = new TcpConnection(connectionOptions);
  }

  async connect(): Promise<this> {
    await this.connection.connect();
    return this;
  }
}

export default RSocketTcpClient;