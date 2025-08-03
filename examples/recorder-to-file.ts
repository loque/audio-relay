#!/usr/bin/env bun
import { createAudioRecorder } from "../src/audio-recorder.js";
import * as wav from "wav";
import * as fs from "fs";
import { resolve } from "path";

const recorder = createAudioRecorder({
  rate: 16000,
  channels: 1,
  bitwidth: 16,
  endian: "little",
  encoding: "signed-integer",
  device: "default",
  debug: true,
});

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

// Get the audio stream
const audioStream = recorder.getAudioStream();

// Pipe audio data to WAV file
audioStream.pipe(fileWriter);

// Handle audio data (for logging)
audioStream.on("data", (chunk: Buffer) => {
  console.log(`Received ${chunk.length} bytes of audio data`);
});

// Handle stream end
audioStream.on("end", () => {
  console.log("Audio stream ended");
  console.log(`Audio saved to: ${outputFile}`);
});

// Handle errors
audioStream.on("error", (error) => {
  console.error("Audio stream error:", error);
});

// Handle WAV writer errors
fileWriter.on("error", (error) => {
  console.error("WAV file writer error:", error);
});

// Start recording
console.log("Starting audio recording...");
recorder.startRecording();

// Stop after 5 seconds
setTimeout(() => {
  console.log("Stopping audio recording...");
  recorder.stopRecording();
}, 5000);
