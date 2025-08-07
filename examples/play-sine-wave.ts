#!/usr/bin/env bun
import { AudioPlayer } from "../src/audio-player";

// Generate sine wave data
const sampleRate = 44100;
const frequency = 440; // A4 note
const duration = 3; // in seconds
const amplitude = 0.3; // 30% volume

function generateSineWave(): Buffer {
  const samples = sampleRate * duration;
  const buffer = Buffer.alloc(samples * 2); // 16-bit = 2 bytes per sample

  for (let i = 0; i < samples; i++) {
    // Generate sine wave sample
    const sample =
      Math.sin((2 * Math.PI * frequency * i) / sampleRate) * amplitude;

    // Convert to 16-bit signed integer
    const intSample = Math.round(sample * 32767);

    // Write as little-endian 16-bit signed integer
    buffer.writeInt16LE(intSample, i * 2);
  }

  return buffer;
}

const sineWaveData = generateSineWave();
console.log(`Generated ${sineWaveData.length} bytes of audio data`);

console.log(`Playing ${frequency}Hz sine wave for ${duration} seconds...`);
performance.mark("start-playback");
const player = new AudioPlayer(
  {
    sampleRate,
    channels: 1,
    bitDepth: 16,
  },
  { logger: console }
);

player.on("error", (error) => {
  console.error("Audio stream error:", error);
});

player.on("close", () => {
  const duration = (
    (performance.now() -
      performance.getEntriesByName("start-playback")[0].startTime) /
    1000
  ).toFixed(2);
  console.log(`Audio stream closed after ${duration} seconds`);
});

// Write the data in chunks to simulate streaming
const chunkSize = 4096;

// Split sineWaveData into chunks and write each chunk
for (let i = 0; i < sineWaveData.length; i += chunkSize) {
  const chunk = sineWaveData.subarray(i, i + chunkSize);
  player.write(chunk);
}

const durationSent = (
  (performance.now() -
    performance.getEntriesByName("start-playback")[0].startTime) /
  1000
).toFixed(2);
console.log(`All chunks were sent after ${durationSent} seconds`);

// Handle cleanup on exit
process.on("SIGINT", async () => {
  console.log("\nCleaning up...");
  await player?.close();
  process.exit(0);
});
