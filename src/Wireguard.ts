#!/usr/bin/env node
import * as child_process from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import * as oldFs from "node:fs";

function isPrivilegied() {
  try {
    child_process.execSync("ip link add dummy0 type dummy");
    child_process.execSync("ip link delete dummy0");
    return true;
  } catch (e) {return false;}
}

function networkInterfaces() {
  const interfaces = os.networkInterfaces();
  const localInterfaces = [];
  for (const name of Object.keys(interfaces)) {
    const Inter = {
      interface: name,
      mac: "",
      v4: {
        addresses: "",
        netmask: "",
        cidr: ""
      },
      v6: {
        addresses: "",
        netmask: "",
        cidr: ""
      },
    }
    for (let iface of interfaces[name]) {
      if (!Inter.mac && iface.mac) Inter.mac = iface.mac;
      if (iface.family === "IPv4") {
        Inter.v4.addresses = iface.address;
        Inter.v4.netmask = iface.netmask;
        Inter.v4.cidr = iface.cidr;
      } else if (iface.family === "IPv6") {
        Inter.v6.addresses = iface.address;
        Inter.v6.netmask = iface.netmask;
        Inter.v6.cidr = iface.cidr;
      }
    }
    if (!(interfaces[name][0].internal)) localInterfaces.push(Inter);
  }
  return localInterfaces;
}

async function getSysctl(): Promise<{[x: string]: string|number|Array<number|string>}> {
  const Sysctl = {};
  await new Promise(async resolve => {
    if (oldFs.existsSync("/etc/sysctl.conf")) {
      await fs.readFile("/etc/sysctl.conf", "utf8").then(async data => {
        for (const line of data.split(/\r?\n/gi)) {
          const match = line.match(/(.*)=(.*)/);
          if (match) Sysctl[match[1].trim()] = match[2].trim();
        }
      }).catch(() => {});
      if (oldFs.existsSync("/etc/sysctl.d")) await fs.readdir("/etc/sysctl.d").then(async files => {
        for (const file of files) {
          const data = await fs.readFile(path.join("/etc/sysctl.d", file), "utf8");
          for (const line of data.replace(/\r\n/gi, "\n").split("\n")) {
            const match = line.match(/(.*)=(.*)/);
            if (match) Sysctl[match[1].trim()] = match[2].trim();
          }
        }
      }).catch(() => {});
    }
    return resolve("");
  });
  for (const keU of Object.keys(Sysctl)) {
    if (keU.startsWith("#")) delete Sysctl[keU];
    else if (isNaN(parseFloat(Sysctl[keU]))) Sysctl[keU] = Sysctl[keU];
    else if (/[0-9]+/.test(Sysctl[keU])) Sysctl[keU] = parseFloat(Sysctl[keU]);
  }
  return Sysctl;
}

async function applySysctl(key: string, value: string|number) {
  const Sysctl = await getSysctl();
  if (Sysctl[key] === undefined) {
    if (!(oldFs.existsSync("/etc/sysctl.d"))) await fs.mkdir("/etc/sysctl.d", {recursive: true});
    if (oldFs.existsSync("/etc/sysctl.d/ofvp.conf")) await fs.appendFile("/etc/sysctl.d/ofvp.conf", `\n${key} = ${value}`);
    else await fs.writeFile("/etc/sysctl.d/ofvp.conf", `${key} = ${value}`, {encoding: "utf8"});
    child_process.execSync("sysctl --system", {stdio: "pipe"});
    return;
  }
  throw new Error("Sysctl already set");
}

let initLoad = false;
const downWgQuick = (WireguardInterface: string) => (child_process.execFileSync("wg-quick", ["down", WireguardInterface], {stdio: "inherit", maxBuffer: Infinity})).toString("utf8");
async function StartInterface() {
  if (isPrivilegied()) {
    const NetInterfaces = networkInterfaces();
    const sysctlCurrentRules = await getSysctl();
    const sysRules = ([
      {key: "net.ipv4.ip_forward", value: 1},
      {key: "net.ipv6.conf.all.forwarding", value: 1},
      {key: "net.ipv6.conf.all.disable_ipv6", value: 0}
    ]).filter(x => sysctlCurrentRules[x.key] === undefined);
    for (const rule of sysRules) await applySysctl(rule.key, rule.value);
    if (initLoad) child_process.spawnSync("wg syncconf wg0 <(wg-quick strip wg0)", {stdio: "inherit", encoding: "utf8"});
    else {
      if (!!NetInterfaces.find(x => x.interface === "wg0")) downWgQuick("wg0");
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

export async function writeWireguardConfig(config: {ServerKeys: {Preshared: string, Private: string, Public: string}, Users: Array<wireguardType>}): Promise<string> {
  if (config.Users.length === 0) {
    console.error("No users");
    return "";
  }
  const {Users, ServerKeys} = config;
  const NetInterfaces = networkInterfaces();
  const PostUp = [
    `iptables -A FORWARD -i ${NetInterfaces[0].interface} -o wg0 -j ACCEPT`,
    `iptables -A FORWARD -i wg0 -j ACCEPT`,
    `iptables -t nat -A POSTROUTING -o ${NetInterfaces[0].interface} -j MASQUERADE`,
    `ip6tables -A FORWARD -i wg0 -j ACCEPT`,
    `ip6tables -t nat -A POSTROUTING -o ${NetInterfaces[0].interface} -j MASQUERADE`
  ];
  const PostDown = [
    `iptables -D FORWARD -i ${NetInterfaces[0].interface} -o wg0 -j ACCEPT`,
    `iptables -D FORWARD -i wg0 -j ACCEPT`,
    `iptables -t nat -D POSTROUTING -o ${NetInterfaces[0].interface} -j MASQUERADE`,
    `ip6tables -D FORWARD -i wg0 -j ACCEPT`,
    `ip6tables -t nat -D POSTROUTING -o ${NetInterfaces[0].interface} -j MASQUERADE`
  ];

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

  // Write Wireguard Interface Config
  await fs.writeFile("/etc/wireguard/wg0.conf", ([
    "[Interface]", "ListenPort = 51820", "SaveConfig = true",
    `PostUp = ${PostUp.join(";")}`, `PostDown = ${PostDown.join(";")}`, // Iptables rules
    `Address = ${ipServer.map(a => `${a.v4.ip}/${a.v4.mask}, ${a.v6.ip}/${a.v6.mask}`).join(", ").trim()}`, // Server IPs
    `PrivateKey = ${ServerKeys.Private}` // Server Private Key
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
          `AllowedIPs = ${ip.v4.ip}/${ip.v4.mask}, ${ip.v6.ip}/${ip.v6.mask}`
        ]).join("\n");
        // Write to Wireguard server config
        await fs.appendFile("/etc/wireguard/wg0.conf", peerConfig);
      }
    }
  }
  await StartInterface();
  return fs.readFile("/etc/wireguard/wg0.conf", "utf8");
}

(["exit", "SIGINT"]).forEach(x => process.on(x, () => {
  console.log("\nShutting down...");
  if (isPrivilegied()) {
    if (oldFs.existsSync("/etc/wireguard/wg0.conf")) {
      child_process.execFileSync("wg-quick", ["down", "wg0"], {stdio: "inherit", maxBuffer: Infinity});
      console.log("Wireguard Interface is down");
    }
  }
  process.exit(0);
}));