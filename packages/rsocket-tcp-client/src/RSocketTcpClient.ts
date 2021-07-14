
import net from 'net';

class TcpConnection {
    private connectionOptions: net.NetConnectOpts;
    private connection: net.Socket;

    constructor(connectionOptions: net.NetConnectOpts) {
        this.connectionOptions = connectionOptions;
    }

    async connect(): Promise<any> {
        await this.connectAsync();
        this.bindEventHandlers();
        return this;
    }

    private bindEventHandlers() {
        this.connection.on('data', this.onData);
        this.connection.on('close', this.onError);
        this.connection.on('end', this.onError);
        this.connection.on('error', this.onError);
    }

    private async connectAsync() {
        this.connection = net.connect(this.connectionOptions);
        return new Promise((resolve, reject) => {
            this.connection.once('close', reject);
            this.connection.once('end', reject);
            this.connection.once('error', reject);
            this.connection.once('connect', resolve);
        });
    }

    private onData(arg0: string, _handleData: any) {
        throw new Error('Method not implemented.');
    }

    private onError(arg0: string, _handleError: any) {
        throw new Error('Method not implemented.');
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