#!/usr/bin/env bun
import WebSocket from "ws";
import * as fs from "fs";
import * as path from "path";

const SERVER_URL = "ws://localhost:3000";
const WAV_FILE_PATH = path.resolve(import.meta.dir, "chime-16khz.wav");

console.log("🎵 Audio Relay Play File");
console.log("This example will:");
console.log(`1. Read the WAV file: ${WAV_FILE_PATH}`);
console.log("2. Connect to /play endpoint");
console.log("3. Stream the audio data to the server for playback");
console.log("");

async function playWavFile(filePath: string): Promise<void> {
  console.log("Reading WAV file...");
  const wavBuffer = fs.readFileSync(filePath);
  const { bitDepth, channels, sampleRate } = parseWavHeader(wavBuffer);
  const { dataOffset, dataSize } = findDataChunk(wavBuffer);
  const wavData = wavBuffer.subarray(dataOffset, dataOffset + dataSize);

  console.log(`WAV file loaded: ${wavData.length} bytes of audio data`);
  console.log(
    `Format: ${channels} channel(s), ${sampleRate} Hz, ${bitDepth}-bit`
  );

  console.log("Connecting to /play endpoint...");
  const ws = new WebSocket(`${SERVER_URL}/play`);

  ws.on("open", async () => {
    console.log("Connected to /play ➜ starting playback");

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

    console.log(`All ${chunkCount} chunks sent successfully`);
  });

  ws.on("error", (error) => {
    console.error("❌ Playback error:", error);
    throw error;
  });

  ws.on("close", (code, reason) => {
    console.log(
      `Playback connection closed (code: ${code}, reason: ${reason})`
    );
  });
}

// Main execution
async function main() {
  try {
    await playWavFile(WAV_FILE_PATH);
    console.log("🎉 WAV file playback completed!");
  } catch (error) {
    console.error("❌ Playback failed:", error);
    process.exit(1);
  }
}

// Handle cleanup on exit
process.on("SIGINT", () => {
  console.log("\n👋 Cleaning up and exiting...");
  process.exit(0);
});

// Start the playback
main();

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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
