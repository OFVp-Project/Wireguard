import mongoose from "mongoose";
import axios from "axios";
import * as Wireguard from "./Wireguard";
import { wireguardType } from "./types";

let { MongoDB_URL, DAEMON_PASSWORD, DAEMON_USER, DAEMON_HOST } = process.env;
if (!MongoDB_URL) MongoDB_URL = "mongodb://localhost:27017";
if (!/:\/\/.*\//.test(MongoDB_URL)) MongoDB_URL = MongoDB_URL+"/OFVpServer";
mongoose.connect(MongoDB_URL);

const WireguardSchema = mongoose.model<wireguardType>("Wireguard", new mongoose.Schema<wireguardType>({
  UserId: {
    type: String,
    required: true,
    unique: true
  },
  Keys: [
    {
      keys: {
        Preshared: {
          type: String,
          unique: true,
          required: true
        },
        Private: {
          type: String,
          unique: true,
          required: true
        },
        Public: {
          type: String,
          unique: true,
          required: true
        }
      },
      ip: {
        v4: {
          ip: {
            type: String,
            unique: true,
            required: true
          },
          mask: {
            type: String,
            required: true
          }
        },
        v6: {
          ip: {
            type: String,
            unique: true,
            required: true
          },
          mask: {
            type: String,
            required: true
          }
        }
      }
    }
  ]
}));

mongoose.connection.once("connected", () => {
  return axios.get(`${DAEMON_HOST}/wginternal`, {headers: {daemon_user: DAEMON_USER, daemon_pass: DAEMON_PASSWORD}}).then(({data}) => {
    const __UpdateConfig = () => WireguardSchema.find().lean().then(users => Wireguard.writeWireguardConfig({
      ServerKeys: data,
      Users: users
    }));
    const Update = (call: (...any) => any) => __UpdateConfig().then(() => new Promise(resolve => setTimeout(resolve, 1000))).then(call);
    return Update(Update);
  })
});

// Close connection exit process
mongoose.connection.once("disconnected", () => {
  console.log("MongoDB disconnected, ending process");
  process.exit(0);
});