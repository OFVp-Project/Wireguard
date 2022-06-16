#!/usr/bin/env node
import * as Wireguard from "./Wireguard";
import * as backend from "./backend";
import { io as socketIO } from "socket.io-client";
console.log("Starting...");
const { DAEMON_HOST, DAEMON_USERNAME, DAEMON_PASSWORD } = process.env;
if (!DAEMON_HOST) {
  console.log("Daemon host not defined");
  process.exit(1);
}
const io = socketIO(DAEMON_HOST, {
  transports: ["websocket", "polling"],
  auth: {username: DAEMON_USERNAME, password: DAEMON_PASSWORD},
  extraHeaders: {username: DAEMON_USERNAME, password: DAEMON_PASSWORD}
});

function getServerConfig(): Promise<Wireguard.wireguardType["Keys"][0]["keys"]> {
  return new Promise((resolve) => {
    // "wireguardServerConfig"
    io.once("wireguardServerConfig", data => resolve(data));
    io.emit("wireguardServerConfig", "ok");
  });
}

function getUsers(): Promise<Array<Wireguard.wireguardType>> {
  return new Promise((resolve) => {
    // "wireguardUsers"
    io.once("wireguardUsers", data => resolve(data));
    io.emit("wireguardUsers", "ok");
  });
}

io.once("connect", () => backend.isPrivilegied().then(async isPrivileged => {
  if (!isPrivileged) {
    console.error("Docker is not privilegied");
    process.exit(1);
  }
  const __UpdateConfig = (serverConfig: Wireguard.wireguardType["Keys"][number]["keys"]) => getUsers().then(users => Wireguard.writeWireguardConfig({
    ServerKeys: serverConfig,
    Users: users
  }));
  while (true) await getServerConfig().then(__UpdateConfig).then(() => new Promise(resolve => setTimeout(resolve, 1000)));
}));

//Close connection exit process
io.once("disconnect", () => {console.log("Disconnected from daemon, ending process"); return Wireguard.shutdownWireguard();});