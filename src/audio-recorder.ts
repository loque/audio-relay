import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { Readable } from "stream";
import { validateAudioConfig, type AudioConfigInput } from "./config";
import { getLogger } from "./logger";

type AudioRecorderOptions = {
  logger?: typeof console;
};

export class AudioRecorder {
  protected readonly arecord: ChildProcessWithoutNullStreams;
  protected readonly stream: Readable;
  protected readonly logger: typeof console;
  protected state: "pending" | "active" | "closing" | "closed" = "pending";

  constructor(input: AudioConfigInput, { logger }: AudioRecorderOptions = {}) {
    this.logger = logger || getLogger();

    const { channels, sampleRate, format, device } = validateAudioConfig(input);

    this.stream = new Readable({
      // No-op: data is pushed from arecord process
      read() {},
    });

    // prettier-ignore
    const args = [
      "-t", "raw",
      "-c", channels.toString(),
      "-r", sampleRate.toString(),
      "-f", format,
      "-D", device,
    ];

    this.logger.log("Starting arecord with args:", args);
    this.arecord = spawn("arecord", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.arecord.on("exit", (code, signal) => {
      this.logger.debug(
        `arecord process exited with code ${code}, signal ${signal}`
      );
      // this.arecord = null; //TODO: handle cleanup
      this.stream.push(null); // End the stream
    });

    this.arecord.on("error", (error) => {
      this.logger.debug("arecord process error:", error);
      this.stream.emit("error", error);
    });

    this.arecord.stdout.on("data", (chunk: Buffer) => {
      this.stream.push(chunk);
    });

    this.arecord.stdout.on("error", (error) => {
      this.logger.debug("arecord stdout error:", error);
      this.stream.emit("error", error);
    });

    this.arecord.stderr?.on("data", (data: Buffer) => {
      this.logger.debug("arecord stderr:", data.toString());
    });

    this.state = "active";
  }

  public on(event: "data" | "error", listener: (...args: any[]) => void) {
    this.stream.on(event, listener);
    return this;
  }

  public pipe(dest: NodeJS.WritableStream, options?: { end?: boolean }) {
    return this.stream.pipe(dest, options);
  }

  public stop(): void {
    if (this.state === "closed") {
      this.logger.warn("Recording already stopped");
      return;
    }

    this.logger.debug("Stopping audio recording");
    this.arecord.kill("SIGTERM");
    this.state = "closed";
    this.stream.push(null); // End the stream
  }
}
