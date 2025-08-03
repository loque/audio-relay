#!/usr/bin/env bun
import { createAudioPlayer } from "../src/audio-player.js";

console.log('Testing Audio Player with Sine Wave');

// Create audio player
const player = createAudioPlayer({
  rate: 44100,
  channels: 1,
  bitwidth: 16,
  device: 'default',
  debug: true
});

// Generate sine wave data
const sampleRate = 44100;
const frequency = 440; // A4 note
const duration = 3; // 3 seconds
const amplitude = 0.3; // 30% volume

const generateSineWave = (): Buffer => {
  const samples = sampleRate * duration;
  const buffer = Buffer.alloc(samples * 2); // 16-bit = 2 bytes per sample
  
  for (let i = 0; i < samples; i++) {
    // Generate sine wave sample
    const sample = Math.sin(2 * Math.PI * frequency * i / sampleRate) * amplitude;
    
    // Convert to 16-bit signed integer
    const intSample = Math.round(sample * 32767);
    
    // Write as little-endian 16-bit signed integer
    buffer.writeInt16LE(intSample, i * 2);
  }
  
  return buffer;
};

// Start playback
console.log(`Playing ${frequency}Hz sine wave for ${duration} seconds...`);
player.startPlayback();

const audioStream = player.getAudioStream();

audioStream.on('error', (error) => {
  console.error('Audio stream error:', error);
});

// Generate and write sine wave data
const sineWaveData = generateSineWave();
console.log(`Generated ${sineWaveData.length} bytes of audio data`);

// Write the data in chunks to simulate streaming
const chunkSize = 4096;
let offset = 0;

const writeChunk = () => {
  if (offset >= sineWaveData.length) {
    console.log('Finished playing sine wave');
    player.end();
    setTimeout(() => {
      player.stopPlayback();
    }, 500);
    return;
  }
  
  const end = Math.min(offset + chunkSize, sineWaveData.length);
  const chunk = sineWaveData.subarray(offset, end);
  
  const success = player.write(chunk);
  offset = end;
  
  if (success) {
    // Continue immediately if write was successful
    setImmediate(writeChunk);
  } else {
    // Wait for drain event if write returned false (backpressure)
    audioStream.once('drain', writeChunk);
  }
};

// Start writing chunks
writeChunk();

// Handle cleanup on exit
process.on('SIGINT', () => {
  console.log('\nCleaning up...');
  player.stopPlayback();
  process.exit(0);
});
