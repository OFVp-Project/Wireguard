const { DAEMON_PASSWORD, DAEMON_USER, DAEMON_HOST } = process.env;
const io = (require("socket.io-client")).io(DAEMON_HOST, {auth: {username: DAEMON_USER, password: DAEMON_PASSWORD}});
io.on("conneted", () => console.info("Connected to daemon"));
io.on("disconnect", () => console.info("Disconnected from daemon"));
io.on("error", err => {
  console.info("Error to connect to daemon");
  console.info(err);
  process.exit(2);
});

io.on("wireguard", data => {
  const Wireguard = require("./Wireguard");
  Wireguard.writeWireguardConfig(data);
});