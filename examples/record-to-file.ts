#!/usr/bin/env bun
import * as wav from "wav";
import * as fs from "fs";
import { resolve } from "path";
import { AudioRecorder } from "../src/audio-recorder";

const recorder = new AudioRecorder(
  {
    sampleRate: 16_000,
    channels: 1,
    bitDepth: 16,
  },
  { logger: console }
);

const outputDir = resolve(__dirname, "out");
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

// Create WAV file writer
const outputFile = resolve(outputDir, `recording-${Date.now()}.wav`);
const fileWriter = new wav.FileWriter(outputFile, {
  channels: 1,
  sampleRate: 16000,
  bitDepth: 16,
});

console.log(`Will save audio to: ${outputFile}`);

// Pipe audio data to WAV file
recorder.pipe(fileWriter);

// Handle audio data (for logging)
recorder.on("data", (chunk: Buffer) => {
  console.log(`Received ${chunk.length} bytes of audio data`);
});

// Handle errors
recorder.on("error", (error) => {
  console.error("Audio stream error:", error);
});

// Handle WAV writer errors
fileWriter.on("error", (error) => {
  console.error("WAV file writer error:", error);
});

// Stop after 5 seconds
setTimeout(() => {
  console.log("Stopping audio recording...");
  recorder.stop();
}, 5000);
