import RSocketTcpClient from "../src/RSocketTcpClient";

const run = async () => {

    const connectionOptions = {
        host: 'localhost',
        port: 9090
    };
    let client = null;

    try {
        client = await (new RSocketTcpClient(connectionOptions).connect());
        console.log("TCP connection established...");
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
