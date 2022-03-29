#!/usr/bin/env node
const child_process = require("child_process");
const os = require("os");
const path = require("path");
const fs = require("fs");

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

/**
 * @type {{
 *  username: string;
 *  expire: Date;
 *  password: string|{
 *    iv: string;
 *    Encrypt: string;
 *  };
 *  ssh: {connections: number;};
 *  wireguard: Array<{
 *     keys: {
 *       Preshared: string;
 *       Private: string;
 *       Public: string;
 *     };
 *     ip: {
 *       v4: {ip: string; mask: string;};
 *       v6: {ip: string; mask: string;};
 *     }
 *   }>;
 * }}
 */
const typeUser = {
  username: "",
  expire: new Date(),
  password: {
    iv: "",
    Encrypt: "",
  },
  ssh: {connections: 0},
  wireguard: [{
    keys: {
      Preshared: "",
      Private: "",
      Public: "",
    },
    ip: {
      v4: {ip: "", mask: "",},
      v6: {ip: "", mask: "",},
    }
  }]
};

/**
 * 
 * @returns {Promise<{[x: string]: string|number|Array<number|string>}>}
 */
async function getSysctl() {
  const Sysctl = {};
  const lines = fs.readFileSync("/etc/sysctl.conf", "utf8").split("\n").filter(a => !a.trim().startsWith("#") && a.trim().includes("=")).concat((() => {
    const li = [];
    for (const a of fs.readdirSync("/etc/sysctl.d").filter(a => a.endsWith(".conf"))) {
      const l = fs.readFileSync(path.join("/etc/sysctl.d", a), "utf8").split("\n").filter(a => !a.trim().startsWith("#") && a.trim().includes("="));
      li.push(...l);
    };
    return li;
  })() )
  for (const line of lines) {
    const [key, value] = line.split(/\s+\=\s+|\=/);
    if (/[0-9\s]+/.test(value)) {
      if (/\s+/gi.test(value)) Sysctl[key] = value.split(/\s+/gi).map(value => {
        if (/^[0-9]+$/gi.test(value)) return parseInt(value);
        else return value;
      });
      else Sysctl[key] = parseInt(value);
    } else Sysctl[key] = parseInt(value);
  }
  return Sysctl;
}

async function applySysctl(key, value) {
  const Sysctl = await getSysctl();
  if (Sysctl[key] === undefined) {
    fs.appendFileSync("/etc/sysctl.d/ofvp.conf", `\n${key} = ${value}`);
    child_process.execSync("sysctl --system", {stdio: "pipe"});
  } else throw new Error("Sysctl already set");
}

let initLoad = false;
const downWgQuick = interface => (child_process.execFileSync("wg-quick", ["down", interface], {stdio: "pipe", maxBuffer: Infinity})).toString("utf8");
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
    if (initLoad) {
      child_process.spawnSync("wg syncconf wg0 <(wg-quick strip wg0)", {stdio: "pipe", "encoding": "utf8"});
    } else {
      if (!!NetInterfaces.find(x => x.interface === "wg0")) downWgQuick("wg0");
      child_process.execFileSync("wg-quick", ["up", "wg0"], {stdio: "pipe"});
      initLoad = true;
    }
    console.log("Wireguard Interface is up");
  } else console.error("Docker is not privilegied");
}

module.exports.writeWireguardConfig = writeWireguardConfig;
/**
 * 
 * @param {{
 *   users: Array<typeUser>;
 *   WireguardIpConfig: {ip: Array<{v4: {ip: string;mask: string;};v6: {ip: string;mask: string;};}>;keys: {Preshared: string;Private: string;Public: string;};}
 * }} config
 * @returns 
 */
async function writeWireguardConfig(config){
  const {users, WireguardIpConfig} = config;
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

  /** @type {{Server: string; peers: Array<{Username: string, config: string;}>;}} */
  const configFile = {
    Server:  ([
      "[Interface]",
      "ListenPort = 51820",
      "SaveConfig = true",
      ...WireguardIpConfig.ip.map(a => `Address = ${a.v4.ip}/${a.v4.mask}, ${a.v6.ip}/${a.v6.mask}`),
      `PrivateKey = ${WireguardIpConfig.keys.Private}`,
      ...PostUp.map(Rule => `PostUp = ${Rule}`),
      ...PostDown.map(Rule => `PostDown = ${Rule}`)
    ]).join("\n"),
    peers: []
  }
  for (let User of users) {
    const { wireguard, username } = User;
    if (wireguard.length > 0) {
      for (const Peer of wireguard) {
        configFile.peers.push({
          Username: username,
          config: ([
            `[Peer]`,
            `PublicKey = ${Peer.keys.Public}`,
            `PresharedKey = ${Peer.keys.Preshared}`,
            `AllowedIPs = ${Peer.ip.v4.ip}/${Peer.ip.v4.mask}, ${Peer.ip.v6.ip}/${Peer.ip.v6.mask}`
          ]).join("\n")
        });
      }
    }
  }
  fs.writeFileSync(path.join("/etc/wireguard/wg0.conf"), configFile.Server);
  // fs.appendFileSync(path.join("/etc/wireguard/wg0.conf"), "\n\n");
  for (let PeerIndex in configFile.peers) {
    const Peer = configFile.peers[PeerIndex];
    fs.appendFileSync(path.join("/etc/wireguard/wg0.conf"), "\n\n");
    fs.appendFileSync(path.join("/etc/wireguard/wg0.conf"), `### ${Peer.Username}: ${PeerIndex}\n`);
    fs.appendFileSync(path.join("/etc/wireguard/wg0.conf"), Peer.config);
  }
  await StartInterface();
  // console.log(fs.readFileSync(path.join("/etc/wireguard/wg0.conf"), "utf8"));
  return configFile;
}
