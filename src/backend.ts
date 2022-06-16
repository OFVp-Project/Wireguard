import * as child_process from "node:child_process";
import * as fs from "node:fs/promises";
import * as oldFs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export function isPrivilegied(): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    child_process.execFile("ip", ["link", "add", "dummy0", "type", "dummy"], err => {
      if (err) return resolve(false);
      child_process.execFile("ip", ["link", "delete", "dummy0"], err => {
        if (err) return resolve(false);
        return resolve(true);
      });
    });
  });
}

export function networkInterfaces() {
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

export async function getSysctl(): Promise<{[x: string]: string|number|Array<number|string>}> {
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

export async function applySysctl(key: string, value: string|number) {
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
