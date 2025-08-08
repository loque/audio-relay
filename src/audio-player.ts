import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { Writable } from "stream";
import {
  validateAudioConfig,
  type AudioConfig,
  type AudioConfigInput,
} from "./config";
import EventEmitter, { once } from "events";
import { getLogger } from "./logger";

/**
 * Calculates how many milliseconds a given PCM byte length will occupy when
 * rendered by the hardware.
 */
function bytesToMs(
  bytes: number,
  {
    sampleRate,
    channels,
    bitDepth,
  }: Pick<AudioConfig, "sampleRate" | "channels" | "bitDepth">
): number {
  const bytesPerSample = bitDepth / 8;
  const totalSamples = bytes / (bytesPerSample * channels);
  return (totalSamples / sampleRate) * 1000;
}

type AudioPlayerOptions = {
  logger?: typeof console;
};

export class AudioPlayer {
  protected readonly aplay: ChildProcessWithoutNullStreams;
  protected readonly stream: Writable;
  protected queuedMs = 0; // how many ms of audio we have queued so far
  protected startedAt: number = 0;
  protected readonly interval: NodeJS.Timeout;
  protected readonly logger: typeof console;
  protected state: "pending" | "active" | "closing" | "closed" = "pending";
  protected readonly emitter = new EventEmitter();

  constructor(input: AudioConfigInput, { logger }: AudioPlayerOptions = {}) {
    this.logger = logger || getLogger();
    const { channels, sampleRate, bitDepth, format, device } =
      validateAudioConfig(input);

    // prettier-ignore
    const args = [
      "-t", "raw",
      "-c", channels.toString(),
      "-r", sampleRate.toString(),
      "-f", format,
      "-D", device,
    ];

    this.logger.log("Starting aplay with args:", args);
    this.aplay = spawn("aplay", args, { stdio: ["pipe", "pipe", "pipe"] });

    // Handle process-level errors (e.g., spawn failure, process crash)
    // This fires when the aplay process itself fails to start or crashes unexpectedly
    this.aplay.on("error", (error) => {
      this.logger.error("aplay process error:", error);
      this.state = "closed";
      this.emitter.emit("error", error);
    });

    // Handle process exit (normal termination, crashes, or kills)
    // This fires when the aplay process terminates for any reason:
    // - Normal completion (stdin closed, finished playing buffered audio)
    // - Process killed via SIGTERM/SIGKILL (e.g., from cleanup())
    // - Process crash or unexpected termination
    // - System kills the process (out of memory, etc.)
    this.aplay.on("exit", (code, signal) => {
      this.logger.log(
        `aplay process exited with code ${code}, signal ${signal}`
      );
      if (code !== 0 && this.state === "active") {
        this.emitter.emit("error", new Error(`aplay exited with code ${code}`));
      }
    });

    // Handle stderr output from aplay (warnings, non-fatal errors, debug info)
    // This captures text messages that aplay writes to its error output stream
    // Examples: "ALSA lib pcm.c:2495:(snd_pcm_open_noupdate) Unknown PCM device"
    this.aplay.stderr?.on("data", (data: Buffer) => {
      this.logger.warn("aplay stderr:", data.toString());
    });

    // Handle stdin stream errors (write failures, broken pipe, etc.)
    // This fires when there are problems writing audio data to aplay's input
    // Examples: trying to write after stdin is closed, network issues, etc.
    this.aplay.stdin.on("error", async (error) => {
      this.logger.error("aplay stdin error:", error);
      this.emitter.emit("error", error);
      await this.cleanup();
    });

    this.stream = new Writable({
      write: (chunk, _enc, cb) => {
        if (this.startedAt === 0) {
          this.startedAt = performance.now();
        }

        try {
          if (!this.aplay.stdin.write(chunk)) {
            // Handle backpressure
            this.aplay.stdin.once("drain", cb);
          } else {
            cb();
          }
          this.queuedMs += bytesToMs(chunk.length, {
            sampleRate,
            channels,
            bitDepth,
          });
        } catch (error) {
          cb(error as Error);
        }
      },
    });

    this.interval = setInterval(() => this.pollDrained(), 200);

    this.state = "active";
  }

  public on(event: "close" | "error", listener: (...args: any[]) => void) {
    this.emitter.on(event, listener);
    return this;
  }

  public write(chunk: Buffer): boolean {
    if (this.state !== "active") {
      this.logger.warn("Audio playback is not active");
      return false;
    }

    if (!this.stream) {
      this.logger.error("Audio stream is not available");
      return false;
    }

    this.stream.write(chunk);
    return true;
  }

  public async close(): Promise<void> {
    if (this.state !== "active") return;
    this.state = "closing";
    this.stream.end();
    await once(this.stream, "finish");
    await this.cleanup();
  }

  protected pollDrained() {
    if (this.state !== "active") return;
    // elapsed ms since first byte written
    const elapsed = performance.now() - this.startedAt;
    const safety = 150;
    if (elapsed >= this.queuedMs + safety) {
      this.logger.debug(
        `[player] playback done (` +
          `elapsed ${elapsed.toFixed(0)}ms, ` +
          `queued ${this.queuedMs.toFixed(0)}ms)`
      );
      this.terminate();
    }
  }

  protected async terminate() {
    if (this.state !== "active") return;
    this.state = "closing";
    this.logger.debug("auto-terminate after drain");
    await this.cleanup();
  }

  protected async cleanup() {
    if (this.state === "closed") return;

    clearInterval(this.interval);

    if (this.aplay.stdin && !this.aplay.stdin.destroyed) {
      this.aplay.stdin.end();
    }

    // Give process time to exit gracefully before killing
    setTimeout(() => {
      if (!this.aplay.killed) {
        this.aplay.kill("SIGTERM");
      }
    }, 100);

    this.state = "closed";
    this.emitter.emit("close");
  }
}
