#!/usr/bin/env bun
import WebSocket from "ws";

const SERVER_URL = "ws://localhost:3000";
const TEST_DURATION = 5_000;

console.log("🎵 Audio Relay Real-time");
console.log("This example demonstrates real-time audio streaming:");
console.log("1. One connection records audio from /rec");
console.log("2. Another connection plays it in real-time through /play");
console.log("3. Creates a live audio relay system");
console.log("");

let totalBytesReceived = 0;
let totalBytesSent = 0;
let chunksReceived = 0;
let chunksSent = 0;

// Real-time audio relay
function startRealTimeRelay(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log("Setting up real-time audio relay...");

    // Connect to recorder endpoint
    const recorderWs = new WebSocket(`${SERVER_URL}/rec`);
    // Connect to player endpoint
    const playerWs = new WebSocket(`${SERVER_URL}/play`);

    let recorderReady = false;
    let playerReady = false;

    const checkBothReady = () => {
      if (recorderReady && playerReady) {
        console.log("Both connections established ➜ real-time relay active!");
        console.log(`Relaying audio for ${TEST_DURATION / 1000} seconds...`);

        // Stop after test duration
        setTimeout(() => {
          console.log("✋ Stopping real-time relay");
          console.log(`📊 Stats:`);
          console.log(
            `   📼 Received: ${chunksReceived} chunks, ${totalBytesReceived} bytes`
          );
          console.log(
            `   🎵 Sent: ${chunksSent} chunks, ${totalBytesSent} bytes`
          );

          recorderWs.close();
          playerWs.close();
          resolve();
        }, TEST_DURATION);
      }
    };

    // Recorder connection
    recorderWs.on("open", () => {
      console.log("Connected to /rec endpoint");
      recorderReady = true;
      checkBothReady();
    });

    recorderWs.on("message", (data: Buffer) => {
      chunksReceived++;
      totalBytesReceived += data.length;

      // Forward audio data directly to player in real-time
      if (playerWs.readyState === WebSocket.OPEN) {
        playerWs.send(data);
        chunksSent++;
        totalBytesSent += data.length;
      }

      // Log progress every 50 chunks to avoid spam
      if (chunksReceived % 50 === 0) {
        console.log(
          `🔄 Relayed ${chunksReceived} chunks (${totalBytesReceived} bytes)`
        );
      }
    });

    recorderWs.on("error", (error) => {
      console.error("❌ Recorder error:", error);
      reject(error);
    });

    recorderWs.on("close", () => {
      console.log("Recorder connection closed");
    });

    // Player connection
    playerWs.on("open", () => {
      console.log("Connected to /play endpoint");
      playerReady = true;
      checkBothReady();
    });

    playerWs.on("error", (error) => {
      console.error("❌ Player error:", error);
      reject(error);
    });

    playerWs.on("close", () => {
      console.log("Player connection closed");
    });
  });
}

// Main execution
async function main() {
  try {
    await startRealTimeRelay();
    console.log("🎉 Real-time audio relay test completed!");
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
