const express = require("express");
const app = express();
app.listen(3001, () => console.log("listening on port 3001 to wireguard maneger. dont expose to internet!"));
const Wireguard = require("./Wireguard");
const { DAEMON_PASSWORD, DAEMON_USER } = process.env;
app.use(express.json());
app.use((req, res, next) => {
  if (req.headers.daemon_password !== DAEMON_PASSWORD) return res.status(400).json({message: "Wrong password"});
  if (req.headers.daemon_user !== DAEMON_USER) return res.status(400).json({message: "Wrong user"});
  next();
});

app.all("/status", ({res}) => res.sendStatus(200));
app.post("/v1/init", async (req, res) => res.send(await Wireguard.writeWireguardConfig(req.body)));
app.all("*", ({res}) => res.sendStatus(404));