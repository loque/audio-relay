import WebSocket from "ws";
import { createAudioRecorder, type AudioRecorder } from "./audio-recorder";
import { createAudioPlayer } from "./audio-player";
import { type Writable } from "stream";

export interface AudioRelayServerConfig {
  format: {
    channels: number;
    sampleRate: number;
    bitDepth: 16 | 24 | 32;
  };
  debug?: boolean;
  createAudioRecorder?: typeof createAudioRecorder;
  createAudioPlayer?: typeof createAudioPlayer;
}

export class AudioRelayServer {
  private playerStream: Writable;
  private audioRecorder: AudioRecorder | undefined;
  private recorderClients = new Set<WebSocket>();
  private config: AudioRelayServerConfig;

  constructor(config: AudioRelayServerConfig) {
    this.config = config;

    const createPlayerFn = config.createAudioPlayer ?? createAudioPlayer;

    const audioPlayer = createPlayerFn({
      rate: config.format.sampleRate,
      channels: config.format.channels,
      bitwidth: config.format.bitDepth,
      encoding: "signed-integer",
      endian: "little",
      debug: config.debug ?? false,
    });

    this.playerStream = audioPlayer.getAudioStream();
  }

  handleConnection(ws: WebSocket, path: string): void {
    if (path === "/play") {
      this.handlePlayConnection(ws);
    } else if (path === "/rec") {
      this.handleRecConnection(ws);
    } else {
      ws.close(1008, "unknown endpoint");
    }
  }

  private handlePlayConnection(ws: WebSocket): void {
    ws.on("message", (data, isBinary) => {
      if (!isBinary) return; // ignore text frames
      this.playerStream.write(data as Buffer);
    });

    if (this.config.debug) {
      console.log("[audio-relay] /play client connected");
    }
  }

  private handleRecConnection(ws: WebSocket): void {
    this.recorderClients.add(ws);
    this.startRecorder();

    if (this.config.debug) {
      console.log(`[audio-relay] /rec listeners: ${this.recorderClients.size}`);
    }

    ws.on("close", () => {
      this.recorderClients.delete(ws);
      if (this.config.debug) {
        console.log(
          `[audio-relay] /rec listeners: ${this.recorderClients.size}`
        );
      }
      this.stopRecorder();
    });
  }

  private startRecorder(): void {
    if (this.audioRecorder) return; // already running

    const createRecorderFn =
      this.config.createAudioRecorder ?? createAudioRecorder;

    this.audioRecorder = createRecorderFn({
      rate: this.config.format.sampleRate,
      channels: this.config.format.channels,
      bitwidth: this.config.format.bitDepth,
      encoding: "signed-integer",
      endian: "little",
      debug: this.config.debug ?? false,
    });

    const audioStream = this.audioRecorder.getAudioStream();
    audioStream.on("data", (chunk: Buffer) => {
      for (const ws of this.recorderClients) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(chunk);
        }
      }
    });

    audioStream.on("error", (error) => {
      if (this.config.debug) {
        console.error("[audio-relay] Recorder stream error:", error);
      }
    });

    this.audioRecorder.startRecording();

    if (this.config.debug) {
      console.log("[audio-relay] Recorder started");
    }
  }

  private stopRecorder(): void {
    if (this.audioRecorder && this.recorderClients.size === 0) {
      this.audioRecorder.stopRecording();
      this.audioRecorder = undefined;

      if (this.config.debug) {
        console.log("[audio-relay] Recorder stopped (no listeners)");
      }
    }
  }

  // Getter methods for testing
  getRecorderClientsCount(): number {
    return this.recorderClients.size;
  }

  isRecorderRunning(): boolean {
    return this.audioRecorder !== undefined;
  }

  getPlayerStream(): Writable {
    return this.playerStream;
  }
}
