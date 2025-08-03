import { WebSocketServer } from "ws";
import { AudioRelayServer } from "./audio-relay-server";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const EXE = "audio-relay";

function getConfig() {
  const argv = yargs(hideBin(Bun.argv))
    .usage(`Audio Relay Server\n\nUsage: ${EXE} [options]`)
    .option("channels", {
      alias: "c",
      type: "number",
      default: 1,
      describe: "Number of audio channels (1-8)",
    })
    .option("sample-rate", {
      alias: "s",
      type: "number",
      default: 16000,
      describe: "Audio sample rate in Hz (8000-192000)",
    })
    .option("bit-depth", {
      alias: "b",
      type: "number",
      default: 16,
      describe: "Audio bit depth (16, 24, or 32)",
    })
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
      // Validate channels
      if (argv.channels < 1 || argv.channels > 8) {
        throw new Error("Channels must be a number between 1 and 8.");
      }

      // Validate sample rate
      if (argv["sample-rate"] < 8000 || argv["sample-rate"] > 192000) {
        throw new Error(
          "Sample rate must be a number between 8000 and 192000 Hz."
        );
      }

      // Validate bit depth
      if (![16, 24, 32].includes(argv["bit-depth"])) {
        throw new Error("Bit depth must be 16, 24, or 32.");
      }

      // Validate port
      if (argv.port < 1 || argv.port > 65535) {
        throw new Error("Port must be a number between 1 and 65535.");
      }

      return true;
    })
    .parseSync();

  return {
    channels: argv.channels,
    sampleRate: argv["sample-rate"],
    bitDepth: argv["bit-depth"] as 16 | 24 | 32,
    port: argv.port,
    debug: argv.debug,
  };
}

const config = getConfig();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : config.port;
const DEBUG = process.env.DEBUG === "true" || config.debug;

const FORMAT = {
  channels: config.channels,
  sampleRate: config.sampleRate,
  bitDepth: config.bitDepth,
} as const;

if (DEBUG) {
  console.log("   Audio Relay Server Configuration:");
  console.log(`   Channels: ${FORMAT.channels}`);
  console.log(`   Sample Rate: ${FORMAT.sampleRate} Hz`);
  console.log(`   Bit Depth: ${FORMAT.bitDepth} bits`);
  console.log(`   Port: ${PORT}`);
  console.log(`   Debug: ${DEBUG ? "enabled" : "disabled"}`);
  console.log("");
}

const audioRelayServer = new AudioRelayServer({
  format: FORMAT,
  debug: DEBUG,
});

const wss = new WebSocketServer({ port: PORT }, () =>
  console.log(`[audio-relay] listening on ws://0.0.0.0:${PORT}`)
);

wss.on("connection", (ws, req) => {
  const path = new URL(req.url ?? "/", `http://${req.headers.host}`).pathname;
  audioRelayServer.handleConnection(ws, path);
});
