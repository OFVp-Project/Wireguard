#!/usr/bin/env node
import * as child_process from "node:child_process";
import * as fs from "node:fs/promises";
import * as oldFs from "node:fs";
import { getSysctl, applySysctl, isPrivilegied, networkInterfaces } from "./backend";
const wgConfig = "/etc/wireguard/wg0.conf";
let initLoad = false;
async function StartInterface() {
  if (await isPrivilegied()) {
    const sysctlCurrentRules = await getSysctl();
    const sysRules = ([
      {key: "net.ipv4.ip_forward", value: 1},
      {key: "net.ipv6.conf.all.forwarding", value: 1},
      {key: "net.ipv6.conf.all.disable_ipv6", value: 0}
    ]).filter(x => sysctlCurrentRules[x.key] === undefined);
    for (const rule of sysRules) await applySysctl(rule.key, rule.value);
    if (initLoad) child_process.spawnSync("wg syncconf wg0 <(wg-quick strip wg0)", {stdio: "inherit", encoding: "utf8"});
    else {
      if ((networkInterfaces()).some(x => x.interface === "wg0")) child_process.execFileSync("wg-quick", ["down", "wg0"], {stdio: "inherit", maxBuffer: Infinity});
      child_process.execFileSync("wg-quick", ["up", "wg0"], {stdio: "inherit"});
      initLoad = true;
    }
    console.log("Wireguard Interface is up");
  } else console.error("Docker is not privilegied");
}

function ConvertIPv4ToIPv6(ipV4: string){
  const hexaCode = (hexaVal: number): string|number => {
    if (hexaVal === 10) return "A";
    else if (hexaVal === 11) return "B";
    else if (hexaVal === 12) return "C";
    else if (hexaVal === 13) return "D";
    else if (hexaVal === 14) return "E";
    else if (hexaVal === 15) return "F";
    else return hexaVal;
  }
  const classValues = ipV4.split(".");
  if(classValues.length === 4){
    const ipv6 = classValues.reduce((acc, val, ind) => {
      const mod = (+val >= 16) ? (+val % 16) : +val;
      const modRes = hexaCode(mod);
      const dividerRes = hexaCode((+val >= 16) ? (parseFloat(val) - mod) / 16 : 0);
      return ind === 1 ? `${acc}${dividerRes}${modRes}:`:`${acc}${dividerRes}${modRes}`;
    }, "");
    if (/NaN/.test(ipv6)) throw new Error("Invalid IPv4 address");
    return `2002:${ipv6}::`;
  }
  throw "Invalid Address";
}

export type wireguardType = {
  UserId: string,
  Keys: Array<{
    keys: {
      Preshared: string,
      Private: string,
      Public: string
    },
    ip: {
      v4: {ip: string, mask: string},
      v6: {ip: string, mask: string}
    }
  }>
};

let configCache = "";
export async function writeWireguardConfig(config: {ServerKeys: {Preshared: string, Private: string, Public: string}, Users: Array<wireguardType>}): Promise<string> {
  if (config.Users.length === 0) {
    console.error("No users");
    return "";
  }
  const {Users, ServerKeys} = config;
  const ipServer: Array<{v4: {ip: string, mask: string}, v6: {ip: string, mask: string}}> = [];
  for (const {Keys} of Users) {
    for (const {ip} of Keys) {
      const { v4, v6 } = ip;
      const [ip1, ip2, ip3] = v4.ip.split(".");
      const vv4 = `${ip1}.${ip2}.${ip3}.1`;
      if (!(ipServer.find(x => x.v4.ip === vv4))) {
        const vv6 = ConvertIPv4ToIPv6(vv4);
        ipServer.push({v4: {ip: vv4, mask: v4.mask}, v6: {ip: vv6, mask: v6.mask}});
      }
    }
  }
  
  // Wireguard Interface Config
  if (oldFs.existsSync(wgConfig)) configCache = await fs.readFile(wgConfig, "utf8");
  const ethIface = (networkInterfaces())[0].interface;
  await fs.writeFile(wgConfig, ([
    "[Interface]",
    "ListenPort = 51820",
    `PrivateKey = ${ServerKeys.Private}`,
    // Iptables rules
    `PostUp = iptables -A FORWARD -i ${ethIface} -o wg0 -j ACCEPT; iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o ${ethIface} -j MASQUERADE; ip6tables -A FORWARD -i wg0 -j ACCEPT; ip6tables -t nat -A POSTROUTING -o ${ethIface} -j MASQUERADE`,
    `PostDown = iptables -D FORWARD -i ${ethIface} -o wg0 -j ACCEPT; iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o ${ethIface} -j MASQUERADE; ip6tables -D FORWARD -i wg0 -j ACCEPT; ip6tables -t nat -D POSTROUTING -o ${ethIface} -j MASQUERADE`
    // Server IPs
    `Address = ${ipServer.map(a => `${a.v4.ip}/${a.v4.mask}, ${a.v6.ip}/${a.v6.mask}`).join(",").trim()}`,
  ]).join("\n"));

  // Write Peer config for users
  for (const {UserId, Keys} of Users) {
    if (Keys.length > 0) {
      for (const PeerIndex in Keys) {
        const {ip, keys} = Keys[PeerIndex];
        let peerConfig = `\n\n### ${UserId}: ${PeerIndex}\n`;
        peerConfig += ([
          `[Peer]`,
          `PublicKey = ${keys.Public}`,
          `PresharedKey = ${keys.Preshared}`,
          `AllowedIPs = ${ip.v4.ip}/${ip.v4.mask},${ip.v6.ip}/${ip.v6.mask}`
        ]).join("\n");
        // Write to Wireguard server config
        await fs.appendFile(wgConfig, peerConfig);
      }
    }
  }
  const newConfigCache = await fs.readFile(wgConfig, "utf8");
  if (configCache === newConfigCache) return "";
  return StartInterface().then(() => newConfigCache);
}

// Process exit shutdown server
export async function shutdownWireguard() {
  console.log("\nShutting down...");
  if (await isPrivilegied()) {
    if (oldFs.existsSync(wgConfig)) {
      child_process.execFileSync("wg-quick", ["down", "wg0"], {stdio: "inherit", maxBuffer: Infinity});
      console.log("Wireguard Interface is down");
    }
  }
  process.exit(1);
}