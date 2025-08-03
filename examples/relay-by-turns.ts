#!/usr/bin/env bun
import WebSocket from "ws";

const SERVER_URL = "ws://localhost:3000";
const RECORD_DURATION = 5_000;
const PLAYBACK_DELAY = 2_000;

console.log("🎵 Audio Relay By Turns");
console.log("This example will:");
console.log(
  `1. Connect to /rec endpoint and record audio for ${
    RECORD_DURATION / 1000
  } seconds`
);
console.log("2. Save the recorded audio");
console.log("3. Play it back through /play endpoint");
console.log("");

// Buffer to store recorded audio
const recordedChunks: Buffer[] = [];
let totalRecordedBytes = 0;

// Step 1: Record audio from /rec endpoint
function startRecording(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log("Connecting to /rec endpoint...");
    const recorderWs = new WebSocket(`${SERVER_URL}/rec`);

    recorderWs.on("open", () => {
      console.log("Connected to /rec ➜ recording started");
      console.log(`Recording for ${RECORD_DURATION / 1000} seconds...`);
    });

    recorderWs.on("message", (data: Buffer) => {
      recordedChunks.push(data);
      totalRecordedBytes += data.length;

      // Log progress every 10 chunks
      if (recordedChunks.length % 10 === 0) {
        console.log(
          `  Recorded ${recordedChunks.length} chunks (${totalRecordedBytes} bytes)`
        );
      }
    });

    recorderWs.on("error", (error) => {
      console.error("❌ Recording error:", error);
      reject(error);
    });

    recorderWs.on("close", () => {
      console.log("Recording connection closed");
      resolve();
    });

    // Stop recording after specified duration
    setTimeout(() => {
      console.log(`Stopping recording after ${RECORD_DURATION / 1000} seconds`);
      console.log(
        `Total recorded: ${recordedChunks.length} chunks, ${totalRecordedBytes} bytes`
      );
      recorderWs.close();
    }, RECORD_DURATION);
  });
}

// Step 2: Play back the recorded audio through /play endpoint
function startPlayback(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log();
    if (recordedChunks.length === 0) {
      console.log("❌ No audio recorded to play back");
      reject(new Error("No audio data"));
      return;
    }

    console.log("Connecting to /play endpoint...");
    const playerWs = new WebSocket(`${SERVER_URL}/play`);

    playerWs.on("open", () => {
      console.log("Connected to /play ➜ starting playback");
      console.log(`Sending all ${recordedChunks.length} chunks...`);

      // Send ALL chunks immediately for smooth playback
      for (let i = 0; i < recordedChunks.length; i++) {
        const chunk = recordedChunks[i];
        playerWs.send(chunk);

        // Log progress every 10 chunks
        if ((i + 1) % 10 === 0) {
          console.log(`  Sent ${i + 1}/${recordedChunks.length} chunks`);
        }
      }

      console.log(`All ${recordedChunks.length} chunks sent`);

      // Calculate expected playback duration and wait
      const expectedDuration = Math.ceil(
        (totalRecordedBytes / (48000 * 2)) * 1000
      ); // ms
      setTimeout(() => {
        console.log("Playback completed");
        playerWs.close();
        resolve();
      }, expectedDuration + 500); // Add 500ms buffer
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
  });
}

// Main execution
async function main() {
  try {
    // Step 1: Record audio
    await startRecording();

    // Wait a bit before playback
    console.log();
    console.log(
      `⏳ Waiting ${PLAYBACK_DELAY / 1000} seconds before playback...`
    );
    await new Promise((resolve) => setTimeout(resolve, PLAYBACK_DELAY));

    // Step 2: Play back recorded audio
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
