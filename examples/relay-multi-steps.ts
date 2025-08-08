#!/usr/bin/env bun
import WebSocket from "ws";
import * as fs from "fs";
import * as path from "path";

const SERVER_URL = "ws://localhost:3000";
const DURATION = 5_000;
const DURATION_SEC = DURATION / 1000;
const REC_FORMAT = { sampleRate: 8_000, channels: 1, bitDepth: 16 };
const WAV_FILE_PATH = path.resolve(import.meta.dir, "chime-16khz.wav");

console.log("🎵 Audio Relay Multi Steps");
console.log("This example will:");
console.log(
  `1. Connect to /rec endpoint and record audio for ${DURATION_SEC} seconds`
);
console.log("2. Play a chime sound through /play endpoint");
console.log("3. Play the recording back through /play endpoint");
console.log("");

// Buffer to store recorded audio
const recordedChunks: Buffer[] = [];
let totalRecordedBytes = 0;

// Step 1: Record audio from /rec endpoint
function startRecording(): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${SERVER_URL}/rec`);

    ws.on("open", () => {
      console.log(`Starting ${DURATION_SEC} seconds recording...`);
      console.log(
        `Recording format: ${REC_FORMAT["channels"]}ch, ${REC_FORMAT["sampleRate"]}Hz, ${REC_FORMAT["bitDepth"]}-bit`
      );
      ws.send(JSON.stringify(REC_FORMAT));
    });

    ws.on("message", (data: Buffer) => {
      recordedChunks.push(data);
      totalRecordedBytes += data.length;

      // Log progress every 10 chunks
      if (recordedChunks.length % 10 === 0) {
        console.log(
          `  Recorded ${recordedChunks.length} chunks (${totalRecordedBytes} bytes)`
        );
      }
    });

    ws.on("error", (error) => {
      console.error("❌ Recording error:", error);
      reject(error);
    });

    ws.on("close", () => resolve());

    // Stop recording after specified duration
    setTimeout(() => {
      console.log(
        `Total recorded: ${recordedChunks.length} chunks, ${totalRecordedBytes} bytes`
      );
      console.log();
      ws.close();
    }, DURATION);
  });
}

async function playWavFile({
  wavData,
  bitDepth,
  channels,
  sampleRate,
}: {
  wavData: Buffer;
  bitDepth: number;
  channels: number;
  sampleRate: number;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${SERVER_URL}/play`);

    ws.on("open", async () => {
      console.log("Starting playback of WAV file...");
      console.log(
        `File format: ${channels}ch, ${sampleRate}Hz, ${bitDepth}-bit, ${wavData.length} bytes total`
      );

      // Calculate chunk size for smooth streaming
      // Send data in chunks that represent about 100ms of audio
      const bytesPerSample = (bitDepth / 8) * channels;
      const samplesPerChunk = Math.floor(sampleRate * 0.1); // 100ms worth
      const chunkSize = samplesPerChunk * bytesPerSample;

      console.log(
        `Streaming audio in ${chunkSize}-byte chunks (${samplesPerChunk} samples each)`
      );

      ws.send(JSON.stringify({ channels, sampleRate, bitDepth }));

      let chunkCount = 0;

      for (let offset = 0; offset < wavData.length; offset += chunkSize) {
        if (ws.readyState !== WebSocket.OPEN) {
          throw new Error("Connection lost");
        }

        // Get next chunk
        const chunk = wavData.subarray(
          offset,
          Math.min(offset + chunkSize, wavData.length)
        );

        // Send the chunk
        ws.send(chunk);
        chunkCount++;

        // Log progress every 10 chunks
        if (chunkCount % 10 === 0) {
          const progress = (
            ((offset + chunk.length) / wavData.length) *
            100
          ).toFixed(1);
          console.log(`  Sent ${chunkCount} chunks (${progress}% complete)`);
        }
      }
    });

    ws.on("error", (error) => {
      console.error("❌ Playback error:", error);
      reject(error);
    });

    ws.on("close", (code, reason) => {
      if (code !== 1000) {
        console.error(
          `❌ Playback connection closed unexpectedly (code: ${code}, reason: ${reason})`
        );
        reject(new Error(`Playback failed: ${reason}`));
        return;
      }
      console.log(`Playback completed successfully`);
      resolve();
    });
  });
}

// Step 2: Play back the recorded audio through /play endpoint
function startPlayback(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (recordedChunks.length === 0) {
      console.log("❌ No audio recorded to play back");
      reject(new Error("No audio data"));
      return;
    }

    const ws = new WebSocket(`${SERVER_URL}/play`);

    ws.on("open", () => {
      console.log("Starting playback of recorded audio...");
      console.log(
        `Recording format: ${REC_FORMAT["channels"]}ch, ${REC_FORMAT["sampleRate"]}Hz, ${REC_FORMAT["bitDepth"]}-bit, ${recordedChunks.length} chunks`
      );

      ws.send(JSON.stringify(REC_FORMAT));

      // Send ALL chunks immediately for smooth playback
      for (let i = 0; i < recordedChunks.length; i++) {
        const chunk = recordedChunks[i];
        ws.send(chunk);

        // Log progress every 10 chunks
        if ((i + 1) % 10 === 0) {
          console.log(`  Sent ${i + 1}/${recordedChunks.length} chunks`);
        }
      }

      console.log(`All ${recordedChunks.length} chunks sent`);
    });

    ws.on("error", (error) => {
      console.error("❌ Playback error:", error);
      reject(error);
    });

    ws.on("close", (code, reason) => {
      if (code !== 1000) {
        console.error(
          `❌ Playback connection closed unexpectedly (code: ${code}, reason: ${reason})`
        );
        reject(new Error(`Playback failed: ${reason}`));
        return;
      }
      console.log(`Playback completed successfully`);
      resolve();
    });
  });
}

// Main execution
async function main() {
  try {
    const chime = readWavFile(WAV_FILE_PATH);

    await startRecording();

    console.log();
    await playWavFile(chime);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log();
    await startPlayback();

    console.log();
    console.log("🎉 Audio relay test completed successfully!");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

// Handle cleanup on exit
process.on("SIGINT", () => {
  console.log("\n👋 Cleaning up and exiting...");
  process.exit(0);
});

// Start the test
main();

function readWavFile(filePath: string) {
  const wavBuffer = fs.readFileSync(filePath);
  const { bitDepth, channels, sampleRate } = parseWavHeader(wavBuffer);
  const { dataOffset, dataSize } = findDataChunk(wavBuffer);
  const wavData = wavBuffer.subarray(dataOffset, dataOffset + dataSize);
  return { wavData, bitDepth, channels, sampleRate };
}

function parseWavHeader(buffer: Buffer) {
  // Check for RIFF header
  if (buffer.toString("ascii", 0, 4) !== "RIFF") {
    throw new Error("Invalid WAV file: missing RIFF header");
  }

  // Check for WAVE format
  if (buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Invalid WAV file: missing WAVE format");
  }

  // Find fmt chunk
  let offset = 12;
  while (offset < buffer.length - 8) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);

    if (chunkId === "fmt ") {
      // Found format chunk
      const audioFormat = buffer.readUInt16LE(offset + 8);
      const channels = buffer.readUInt16LE(offset + 10);
      const sampleRate = buffer.readUInt32LE(offset + 12);
      const bitDepth = buffer.readUInt16LE(offset + 22);

      if (audioFormat !== 1) {
        throw new Error(
          `Unsupported audio format: ${audioFormat} (only PCM is supported)`
        );
      }

      return {
        channels,
        sampleRate,
        bitDepth,
        formatChunkSize: chunkSize,
      };
    }

    offset += 8 + chunkSize;
  }

  throw new Error("Invalid WAV file: fmt chunk not found");
}

function findDataChunk(buffer: Buffer) {
  let offset = 12;
  while (offset < buffer.length - 8) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);

    if (chunkId === "data") {
      return {
        dataOffset: offset + 8,
        dataSize: chunkSize,
      };
    }

    offset += 8 + chunkSize;
  }

  throw new Error("Invalid WAV file: data chunk not found");
}
