import * as socketIo from "socket.io-client";
import * as Wireguard from "./Wireguard";
const { DAEMON_PASSWORD, DAEMON_USER, DAEMON_HOST } = process.env;

const ioClient = socketIo.io(DAEMON_HOST, {auth: {username: DAEMON_USER, password: DAEMON_PASSWORD}});
ioClient.on("conneted", () => console.info("Connected to daemon"));
ioClient.on("disconnect", () => console.info("Disconnected from daemon"));
ioClient.on("error", err => {
  console.info("Error to connect to daemon");
  console.info(err);
  process.exit(2);
});

ioClient.on("wireguard", data => {
  Wireguard.writeWireguardConfig(data);
});