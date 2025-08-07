import { spawn, ChildProcess } from "child_process";
import { Readable } from "stream";
import { validateAudioConfig, type AudioConfigInput } from "./config";

export interface AudioRecorder {
  start(): void;
  stop(): void;
  getStream(): Readable;
}

export function createAudioRecorder(input: AudioConfigInput): AudioRecorder {
  const { channels, sampleRate, format, device, logger } =
    validateAudioConfig(input);

  let arecord: ChildProcess | null = null;
  const stream = new Readable({
    // No-op: data is pushed from arecord process
    read() {},
  });

  const start = (): void => {
    if (arecord !== null) {
      logger.warn("Recording already started");
      return;
    }

    // arecord command arguments
    const args = [
      "-t",
      "raw",
      "-c",
      channels.toString(),
      "-r",
      sampleRate.toString(),
      "-f",
      format,
      "-D",
      device,
    ];

    logger.log("Starting arecord with args:", args);

    arecord = spawn("arecord", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    arecord.on("exit", (code, signal) => {
      logger.debug(
        `arecord process exited with code ${code}, signal ${signal}`
      );
      arecord = null;
      stream.push(null); // End the stream
    });

    arecord.on("error", (error) => {
      logger.debug("arecord process error:", error);
      stream.emit("error", error);
    });

    if (arecord.stdout) {
      arecord.stdout.on("data", (chunk: Buffer) => {
        stream.push(chunk);
      });

      arecord.stdout.on("error", (error) => {
        logger.debug("arecord stdout error:", error);
        stream.emit("error", error);
      });
    }

    arecord.stderr?.on("data", (data: Buffer) => {
      logger.debug("arecord stderr:", data.toString());
    });
  };

  const stop = (): void => {
    if (arecord === null) {
      logger.debug("No recording process to stop");
      return;
    }

    logger.debug("Stopping audio recording");
    arecord.kill("SIGTERM");
    arecord = null;
  };

  const getStream = (): Readable => {
    return stream;
  };

  return {
    start,
    stop,
    getStream,
  };
}

export type AudioRecorderFactory = typeof createAudioRecorder;
