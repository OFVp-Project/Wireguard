import * as socketIo from "socket.io-client";
import * as Wireguard from "./Wireguard";
import * as type from "./types";
const { DAEMON_PASSWORD, DAEMON_USER, DAEMON_HOST } = process.env;

const ioClient = socketIo.io(DAEMON_HOST, {transports: [ "websocket", "polling" ],auth: {username: DAEMON_USER, password: DAEMON_PASSWORD}});
ioClient.on("conneted", () => console.info("Connected to daemon"));
ioClient.on("disconnect", () => console.info("Disconnected from daemon"));
ioClient.on("error", err => {
  console.info("Error to connect to daemon");
  console.info(err);
  process.exit(2);
});

ioClient.on("wireguard", async (data: type.wireConfigInput) => {
  console.log(data);
  if (!data.WireguardIpConfig.keys.Preshared) return;
  if (data.WireguardIpConfig.ip.length > 0) return;
  if (data.users.length > 0) return;
  await Wireguard.writeWireguardConfig(data);
  return;
});
