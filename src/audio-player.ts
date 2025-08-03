import { spawn, ChildProcess } from "child_process";
import { Writable } from "stream";

export interface AudioPlayerOptions {
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
  /** ALSA device to play to */
  device?: string;
  /** Enable debug logging */
  debug?: boolean;
}

export interface AudioPlayer {
  /** Start audio playback */
  startPlayback(): void;
  /** Stop audio playback */
  stopPlayback(): void;
  /** Get the writable audio stream */
  getAudioStream(): Writable;
  /** Write audio data directly */
  write(chunk: Buffer): boolean;
  /** End the audio stream */
  end(): void;
}

export function createAudioPlayer(
  options: AudioPlayerOptions = {}
): AudioPlayer {
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
  let audioStream: Writable | null = null;
  let isStarted = false;
  let isStopping = false;

  const formatAplayParams = (): string[] => {
    // Build format string for aplay
    const formatEndian = config.endian === "big" ? "BE" : "LE";
    const formatEncoding = config.encoding === "unsigned-integer" ? "U" : "S";
    const format = `${formatEncoding}${config.bitwidth}_${formatEndian}`;

    return [
      "-t",
      "raw",
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

  const startPlayback = (): void => {
    if (audioProcess !== null) {
      if (config.debug) {
        console.warn("Playback already started");
      }
      return;
    }

    const args = formatAplayParams();

    if (config.debug) {
      console.log("Starting aplay with args:", args);
    }

    audioProcess = spawn("aplay", args, {
      stdio: ["pipe", "ignore", config.debug ? "pipe" : "ignore"],
    });

    audioProcess.on("exit", (code, signal) => {
      if (config.debug) {
        console.log(`aplay process exited with code ${code}, signal ${signal}`);
      }
      audioProcess = null;
      audioStream = null;
      isStarted = false;
      isStopping = false;
    });

    audioProcess.on("error", (error) => {
      if (config.debug) {
        console.error("aplay process error:", error);
      }
      if (audioStream) {
        audioStream.emit("error", error);
      }
    });

    if (config.debug && audioProcess.stderr) {
      audioProcess.stderr.on("data", (data: Buffer) => {
        console.log("aplay stderr:", data.toString());
      });
    }

    // Create writable stream that pipes to aplay stdin
    audioStream = new Writable({
      write(chunk: Buffer, encoding, callback) {
        if (isStopping) {
          // Silently ignore writes during shutdown
          callback();
          return;
        }

        if (
          audioProcess &&
          audioProcess.stdin &&
          !audioProcess.stdin.destroyed
        ) {
          try {
            const success = audioProcess.stdin.write(chunk);
            if (success) {
              callback();
            } else {
              // Handle backpressure
              audioProcess.stdin.once("drain", callback);
            }
          } catch (error) {
            callback(error as Error);
          }
        } else {
          callback(new Error("Audio process not available"));
        }
      },

      final(callback) {
        if (
          audioProcess &&
          audioProcess.stdin &&
          !audioProcess.stdin.destroyed
        ) {
          audioProcess.stdin.end();
        }
        callback();
      },
    });

    // Handle stdin errors
    if (audioProcess.stdin) {
      audioProcess.stdin.on("error", (error) => {
        if (config.debug) {
          console.error("aplay stdin error:", error);
        }
        if (audioStream) {
          audioStream.emit("error", error);
        }
      });
    }

    isStarted = true;
  };

  const stopPlayback = (): void => {
    if (audioProcess === null) {
      if (config.debug) {
        console.warn("No playback process to stop");
      }
      return;
    }

    if (config.debug) {
      console.log("Stopping audio playback");
    }

    isStopping = true;

    // Close stdin first to allow aplay to finish playing buffered audio
    if (audioProcess.stdin && !audioProcess.stdin.destroyed) {
      audioProcess.stdin.end();
    }

    // Give aplay a moment to finish, then terminate if needed
    setTimeout(() => {
      if (audioProcess && !audioProcess.killed) {
        audioProcess.kill("SIGTERM");
        audioProcess = null;
        audioStream = null;
        isStarted = false;
        isStopping = false;
      }
    }, 100);
  };

  const getAudioStream = (): Writable => {
    if (!isStarted) {
      startPlayback();
    }

    if (!audioStream) {
      throw new Error(
        "Audio stream not available. Make sure playback is started."
      );
    }

    return audioStream;
  };

  const write = (chunk: Buffer): boolean => {
    const stream = getAudioStream();
    return stream.write(chunk);
  };

  const end = (): void => {
    if (audioStream && !audioStream.destroyed) {
      audioStream.end();
    }
  };

  return {
    startPlayback,
    stopPlayback,
    getAudioStream,
    write,
    end,
  };
}
