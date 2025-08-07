import {
  spawn,
  type ChildProcess,
  type ChildProcessWithoutNullStreams,
} from "child_process";
import { Writable } from "stream";
import {
  validateAudioConfig,
  type AudioConfig,
  type AudioConfigInput,
} from "./config";
import EventEmitter, { once } from "events";
import { getLogger } from "./logger";

interface IAudioPlayer {
  start(): void;
  stop(): void;
  getStream(): Writable;
}

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
  pollIntervalMs?: number; // How often to check if aplay is drained
};

export class AudioPlayer extends EventEmitter {
  protected readonly aplay: ChildProcessWithoutNullStreams;
  protected readonly stream: Writable;
  protected queuedMs = 0; // how many ms of audio we have queued so far
  protected startedAt: number = 0;
  protected readonly interval: NodeJS.Timeout;
  protected readonly logger: typeof console;
  protected state: "pending" | "active" | "closing" | "closed" = "pending";

  constructor(
    input: AudioConfigInput,
    { logger, pollIntervalMs }: AudioPlayerOptions = {}
  ) {
    super();
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
      this.emit("error", error);
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
        this.emit("error", new Error(`aplay exited with code ${code}`));
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
      this.emit("error", error);
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

    this.interval = setInterval(
      () => this.pollDrained(),
      pollIntervalMs || 200
    );

    this.state = "active";
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
    this.emit("close");
  }
}

export function createAudioPlayer(
  input: AudioConfigInput,
  logger: typeof console
): IAudioPlayer {
  const { channels, sampleRate, format, device } = validateAudioConfig(input);

  let aplay: ChildProcess | null = null;
  let stream: Writable | null = null;
  let state: "pending" | "active" | "closing" | "closed" = "pending";

  const start = (): void => {
    if (state !== "pending") {
      logger.warn("Playback already started");
      return;
    }

    // prettier-ignore
    const args = [
      "-t", "raw",
      "-c", channels.toString(),
      "-r", sampleRate.toString(),
      "-f", format,
      "-D", device,
    ];

    logger.log("Starting aplay with args:", args);
    aplay = spawn("aplay", args, { stdio: ["pipe", "ignore", "inherit"] });

    aplay.on("exit", (code, signal) => {
      logger.log(`aplay process exited with code ${code}, signal ${signal}`);
      aplay = null;
      stream = null;
      state = "closed";
    });

    aplay.on("error", (error) => {
      logger.error("aplay process error:", error);
      if (stream) {
        stream.emit("error", error);
      }
    });

    aplay.stderr?.on("data", (data: Buffer) => {
      logger.log("aplay stderr:", data.toString());
    });

    // Create writable stream that pipes to aplay stdin
    stream = new Writable({
      write(chunk: Buffer, encoding, callback) {
        if (state === "closing" || state === "closed") {
          // Silently ignore writes during shutdown
          callback();
          return;
        }

        if (!aplay?.stdin) {
          callback(new Error("Audio process not available"));
          return;
        }

        if (aplay.stdin.destroyed) {
          // Already destroyed so nothing else to do
          callback();
          return;
        }

        try {
          const success = aplay.stdin.write(chunk);
          if (success) {
            callback();
          } else {
            // Handle backpressure
            aplay.stdin.once("drain", callback);
          }
        } catch (error) {
          callback(error as Error);
        }
      },

      final(callback) {
        if (aplay?.stdin && !aplay.stdin.destroyed) {
          aplay.stdin.end();
        }
        callback();
      },
    });

    // Handle stdin errors
    if (aplay.stdin) {
      aplay.stdin.on("error", (error) => {
        logger.error("aplay stdin error:", error);
        stream?.emit("error", error);
      });
    }

    state = "active";
  };

  const stop = (): void => {
    if (state !== "active") {
      logger.warn("No playback process to stop");
      return;
    }

    logger.log("Stopping audio playback");

    state = "closing";

    // Close stdin first to allow aplay to finish playing buffered audio
    if (aplay?.stdin && !aplay.stdin.destroyed) {
      aplay.stdin.end();
    }

    // Give aplay a moment to finish, then terminate if needed
    setTimeout(() => {
      if (aplay && !aplay.killed) {
        aplay.kill("SIGTERM");
        aplay = null;
        stream?.emit("close");
        stream = null;
        state = "closed";
      }
    }, 100);
  };

  const getStream = (): Writable => {
    if (state === "pending") {
      start();
    }

    if (!stream) {
      throw new Error(
        "Audio stream not available. Make sure playback is started."
      );
    }

    return stream;
  };

  return {
    start,
    stop,
    getStream,
  };
}

export type AudioPlayerFactory = typeof createAudioPlayer;
