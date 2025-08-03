import { spawn, ChildProcess } from "child_process";
import { Readable } from "stream";

export interface AudioRecorderOptions {
  /** Audio sample rate in Hz */
  rate?: number;
  /** Number of audio channels */
  channels?: number;
  /** Bit width for audio samples */
  bitwidth?: 16 | 24 | 32;
  /** Sample format endianness */
  endian?: "little" | "big";
  /** Sample encoding format */
  encoding?: "signed-integer" | "unsigned-integer";
  /** ALSA device to record from */
  device?: string;
  /** Enable debug logging */
  debug?: boolean;
}

export interface AudioRecorder {
  /** Start audio recording */
  startRecording(): void;
  /** Stop audio recording */
  stopRecording(): void;
  /** Get the readable audio stream */
  getAudioStream(): Readable;
}

export function createAudioRecorder(
  options: AudioRecorderOptions = {}
): AudioRecorder {
  const config = {
    rate: options.rate || 16000,
    channels: options.channels || 1,
    bitwidth: options.bitwidth || 16,
    endian: options.endian || "little",
    encoding: options.encoding || "signed-integer",
    device: options.device || "default",
    debug: options.debug || false,
  };

  let audioProcess: ChildProcess | null = null;
  const audioStream = new Readable({
    read() {
      // No-op: data is pushed from arecord process
    },
  });

  const formatArecordParams = (): string[] => {
    // Build format string for arecord
    const formatEndian = config.endian === "big" ? "BE" : "LE";
    const formatEncoding = config.encoding === "unsigned-integer" ? "U" : "S";
    const format = `${formatEncoding}${config.bitwidth}_${formatEndian}`;

    return [
      "-t",
      "raw", // Output raw audio data
      "-c",
      config.channels.toString(),
      "-r",
      config.rate.toString(),
      "-f",
      format,
      "-D",
      config.device,
    ];
  };

  const startRecording = (): void => {
    if (audioProcess !== null) {
      if (config.debug) {
        console.warn("Recording already started");
      }
      return;
    }

    const args = formatArecordParams();

    if (config.debug) {
      console.log("Starting arecord with args:", args);
    }

    audioProcess = spawn("arecord", args, {
      stdio: ["ignore", "pipe", config.debug ? "pipe" : "ignore"],
    });

    audioProcess.on("exit", (code, signal) => {
      if (config.debug) {
        console.log(
          `arecord process exited with code ${code}, signal ${signal}`
        );
      }
      audioProcess = null;
      audioStream.push(null); // End the stream
    });

    audioProcess.on("error", (error) => {
      if (config.debug) {
        console.error("arecord process error:", error);
      }
      audioStream.emit("error", error);
    });

    if (audioProcess.stdout) {
      audioProcess.stdout.on("data", (chunk: Buffer) => {
        audioStream.push(chunk);
      });

      audioProcess.stdout.on("error", (error) => {
        if (config.debug) {
          console.error("arecord stdout error:", error);
        }
        audioStream.emit("error", error);
      });
    }

    if (config.debug && audioProcess.stderr) {
      audioProcess.stderr.on("data", (data: Buffer) => {
        console.log("arecord stderr:", data.toString());
      });
    }
  };

  const stopRecording = (): void => {
    if (audioProcess === null) {
      if (config.debug) {
        console.warn("No recording process to stop");
      }
      return;
    }

    if (config.debug) {
      console.log("Stopping audio recording");
    }

    audioProcess.kill("SIGTERM");
    audioProcess = null;
  };

  const getAudioStream = (): Readable => {
    return audioStream;
  };

  return {
    startRecording,
    stopRecording,
    getAudioStream,
  };
}
