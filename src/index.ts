#!/usr/bin/env node
import * as Wireguard from "./Wireguard";
import { io as socketIO } from "socket.io-client";
console.log("Starting...");
const { DAEMON_HOST, DAEMON_USERNAME, DAEMON_PASSWORD } = process.env;
if (!DAEMON_HOST) {
  console.log("Daemon host not defined");
  process.exit(1);
}
const io = socketIO(DAEMON_HOST, {
  auth: {
    username: DAEMON_USERNAME,
    password: DAEMON_PASSWORD
  }
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

//Close connection exit process
io.once("disconnect", () => {
  console.log("Disconnected, ending process");
  process.exit(0);
});
io.once("connect", () => {
  getServerConfig().then(serverConfig => {
    const __UpdateConfig = () => getUsers().then(users => Wireguard.writeWireguardConfig({
      ServerKeys: serverConfig,
      Users: users
    }));
    const Update = (call: (...any) => any) => __UpdateConfig().then(() => new Promise(resolve => setTimeout(resolve, 1000))).then(call);
    return Update(Update);
  });
});
