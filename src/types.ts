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