import WebSocket from "ws";
import { AudioRecorder } from "./audio-recorder";
import { AudioPlayer } from "./audio-player";
import { getLogger } from "./logger";

export interface AudioRelayServerConfig {
  logger?: typeof console;
}

export class AudioRelayServer {
  protected logger: typeof console;

  constructor({ logger }: AudioRelayServerConfig = {}) {
    this.logger = logger || getLogger();
    this.logger.log("[audio-relay] Server initialized");
  }

  connect(ws: WebSocket, path: string): void {
    if (path === "/play") {
      this.handlePlayConnection(ws);
    } else if (path === "/rec") {
      this.handleRecConnection(ws);
    } else {
      ws.close(1008, "unknown endpoint");
    }
  }

  protected handlePlayConnection(ws: WebSocket): void {
    let state: "pending" | "active" | "closed" = "pending";
    let player: AudioPlayer | undefined;

    ws.on("message", (data, isBinary) => {
      if (state === "pending") {
        if (isBinary) {
          this.logger.warn("[audio-relay] /play: expected JSON config");
          return;
        }
        try {
          const msg = JSON.parse(data.toString()) || {};
          player = new AudioPlayer(msg);

          player.on("close", () => {
            this.logger.log("[audio-relay] /play: stream closed");
            state = "closed";
            ws.close(1000, "playback ended, stream closed");
          });

          this.logger.log(
            `[audio-relay] /play: new stream (${msg.sampleRate}Hz, ${msg.channels}ch)`
          );
        } catch (err) {
          this.logger.error(
            "[audio-relay] /play: error creating audio player",
            err
          );
          ws.close(1007, "error creating audio player");
        }
        state = "active";
      } else if (state === "active") {
        if (!isBinary) {
          this.logger.warn("[audio-relay] /play: expected binary audio data");
          return;
        }
        player!.write(data as Buffer);
      }
    });

    ws.on("close", () => {
      player?.close();
      state = "closed";
      this.logger.log("[audio-relay] /play client disconnected");
    });
  }

  protected handleRecConnection(ws: WebSocket): void {
    let state: "pending" | "active" | "closing" | "closed" = "pending";
    let recorder: AudioRecorder | undefined;

    ws.on("message", (data, isBinary) => {
      if (state === "pending") {
        const msg = JSON.parse(data.toString()) || {};
        recorder = new AudioRecorder(msg);
        recorder.on("data", (chunk: Buffer) => {
          console.debug(">>> piping data");
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(chunk);
          }
        });
        recorder.on("error", (error) => {
          this.logger.error("[audio-relay] Recorder stream error:", error);
        });
        state = "active";
      } else if (state === "active") {
        if (isBinary) return;
        // Assume close message
        state = "closing";
        ws.close(1001, "closed by client");
      } else if (state === "closing") {
        ws.close(1008, "stream already stopped");
      }
    });

    ws.on("close", () => {
      state = "closed";
      recorder?.stop();
      this.logger.log("[audio-relay] Recorder stopped");
    });
  }
}
