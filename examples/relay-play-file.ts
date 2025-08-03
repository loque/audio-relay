#!/usr/bin/env bun
import WebSocket from "ws";
import { readFileSync } from "fs";
import { Reader } from "wav";
import { resolve } from "path";

const SERVER_URL = "ws://localhost:3000";
const WAV_FILE_PATH = resolve(import.meta.dir, "003.wav");

console.log("🎵 Audio Relay Play File");
console.log("This example will:");
console.log(`1. Read the WAV file: ${WAV_FILE_PATH}`);
console.log("2. Connect to /play endpoint");
console.log("3. Stream the audio data to the server for playback");
console.log("");

async function playWavFile(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log("Reading WAV file...");

    let wavData: Buffer;
    let wavFormat: any;

    try {
      // Read the WAV file
      const fileBuffer = readFileSync(WAV_FILE_PATH);
      const reader = new Reader();

      // Parse WAV header
      reader.on("format", (format) => {
        wavFormat = format;
        console.log("WAV Format:", {
          channels: format.channels,
          sampleRate: format.sampleRate,
          bitDepth: format.bitDepth,
          encoding: format.audioFormat === 1 ? "PCM" : "Other",
        });
      });

      reader.on("data", (chunk: Buffer) => {
        if (!wavData) {
          wavData = chunk;
        } else {
          wavData = Buffer.concat([wavData, chunk]);
        }
      });

      reader.on("end", () => {
        console.log(`WAV file loaded: ${wavData.length} bytes of audio data`);
        startPlayback();
      });

      reader.on("error", (error) => {
        console.error("❌ Error reading WAV file:", error);
        reject(error);
      });

      // Parse the WAV file
      reader.end(fileBuffer);
    } catch (error) {
      console.error("❌ Error loading WAV file:", error);
      reject(error);
      return;
    }

    function startPlayback() {
      console.log("Connecting to /play endpoint...");
      const playerWs = new WebSocket(`${SERVER_URL}/play`);

      playerWs.on("open", () => {
        console.log("Connected to /play ➜ starting playback");

        // Calculate chunk size for smooth streaming
        // Send data in chunks that represent about 100ms of audio
        const bytesPerSample = (wavFormat.bitDepth / 8) * wavFormat.channels;
        const samplesPerChunk = Math.floor(wavFormat.sampleRate * 0.1); // 100ms worth
        const chunkSize = samplesPerChunk * bytesPerSample;

        console.log(
          `Streaming audio in ${chunkSize}-byte chunks (${samplesPerChunk} samples each)`
        );

        let offset = 0;
        let chunkCount = 0;

        const sendNextChunk = () => {
          if (offset >= wavData.length) {
            console.log(`All ${chunkCount} chunks sent successfully`);

            // Calculate expected playback duration
            const totalSamples = wavData.length / bytesPerSample;
            const durationMs = (totalSamples / wavFormat.sampleRate) * 1000;

            console.log(
              `Expected playback duration: ${(durationMs / 1000).toFixed(
                1
              )} seconds`
            );
            console.log("Waiting for playback to complete...");

            // Wait for playback to finish, then close
            setTimeout(() => {
              playerWs.close();
              resolve();
            }, durationMs + 500); // Add 500ms buffer

            return;
          }

          // Get next chunk
          const chunk = wavData.subarray(
            offset,
            Math.min(offset + chunkSize, wavData.length)
          );

          if (playerWs.readyState === WebSocket.OPEN) {
            playerWs.send(chunk);
            chunkCount++;
            offset += chunk.length;

            // Log progress every 10 chunks
            if (chunkCount % 10 === 0) {
              const progress = ((offset / wavData.length) * 100).toFixed(1);
              console.log(
                `  Sent ${chunkCount} chunks (${progress}% complete)`
              );
            }

            // Schedule next chunk with timing to match audio rate
            const chunkDurationMs =
              (samplesPerChunk / wavFormat.sampleRate) * 1000;
            setTimeout(sendNextChunk, chunkDurationMs);
          } else {
            console.error("❌ WebSocket connection lost during playback");
            reject(new Error("Connection lost"));
          }
        };

        // Start sending chunks
        sendNextChunk();
      });

      playerWs.on("error", (error) => {
        console.error("❌ Playback error:", error);
        reject(error);
      });

      playerWs.on("close", (code, reason) => {
        console.log(
          `Playback connection closed (code: ${code}, reason: ${reason})`
        );
      });
    }
  });
}

// Main execution
async function main() {
  try {
    // Check if WAV file exists
    try {
      readFileSync(WAV_FILE_PATH);
    } catch (error) {
      console.error(`❌ WAV file not found: ${WAV_FILE_PATH}`);
      console.error("Make sure the file exists before running this example.");
      process.exit(1);
    }

    await playWavFile();
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
