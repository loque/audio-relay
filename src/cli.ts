import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { WebSocketServer } from "ws";
import { AudioRelayServer } from "./audio-relay-server";
import { initializeLogger } from "./logger";

const EXE = "audio-relay";

function getConfig() {
  const argv = yargs(hideBin(Bun.argv))
    .usage(`Audio Relay Server\n\nUsage: ${EXE} [options]`)
    .option("port", {
      alias: "p",
      type: "number",
      default: 3000,
      describe: "WebSocket server port (1-65535)",
    })
    .option("debug", {
      alias: "d",
      type: "boolean",
      default: false,
      describe: "Enable debug logging",
    })
    .help("help")
    .alias("help", "h")
    .example(`${EXE}`, "Start with default settings")
    .example(
      `${EXE} --port 8080 --debug`,
      "Start on port 8080 with debug logging"
    )
    .example(
      `${EXE} -c 2 -s 44100 -b 24 -p 3001`,
      "Start with stereo, 44.1kHz, 24-bit audio"
    )
    .check((argv) => {
      // Validate port
      if (argv.port < 1 || argv.port > 65535) {
        throw new Error("Port must be a number between 1 and 65535.");
      }

      return true;
    })
    .parseSync();

  return argv;
}

const config = getConfig();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : config.port;
const DEBUG = process.env.DEBUG === "true" || config.debug;
const logger = initializeLogger({ level: DEBUG ? "debug" : "info" });
logger.debug("Debug logging enabled");

const audioRelayServer = new AudioRelayServer();

const wss = new WebSocketServer({ port: PORT }, () =>
  logger.log(`[audio-relay] Server listening on ws://0.0.0.0:${PORT}`)
);

wss.on("connection", (ws, req) => {
  const path = new URL(req.url ?? "/", `http://${req.headers.host}`).pathname;
  audioRelayServer.connect(ws, path);
});
