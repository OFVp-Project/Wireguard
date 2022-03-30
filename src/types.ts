export type ip = {
  v4: {ip: string; mask: string;};
  v6: {ip: string; mask: string;};
}

export type WireKeys = {
  Preshared: string;
  Private: string;
  Public: string;
};

export type usersType = {
  username: string;
  expire: Date;
  password: string|{
    iv: string;
    Encrypt: string;
  };
  ssh: {connections: number;};
  wireguard: Array<{keys: WireKeys, ip: ip}>;
};

export type wireConfigInput = {
  users: Array<usersType>;
  WireguardIpConfig: {
    ip: Array<ip>;
    keys: WireKeys;
  };
};