# Audio Relay

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)

A WebSocket server for real-time audio streaming on Linux. Capture audio from your microphone or play PCM audio through your speakers by sending raw audio data over WebSocket connections.

## Requirements

- Linux (uses ALSA's `arecord` and `aplay` commands)
- [Bun](https://bun.sh/) runtime

## Installation

```bash
bun install
```

## Usage

```bash
bun src/cli.ts [options]
```

### Options

- `-c, --channels <n>`: Number of audio channels (1-8, default: 1)
- `-s, --sample-rate <hz>`: Audio sample rate in Hz (8000-192000, default: 16000)
- `-b, --bit-depth <bits>`: Audio bit depth (16, 24, or 32, default: 16)
- `-p, --port <port>`: WebSocket server port (1-65535, default: 3000)
- `-d, --debug`: Enable debug logging
- `-h, --help`: Show help

### Examples

```bash
# Start with default settings (mono, 16kHz, 16-bit)
bun src/cli.ts

# Stereo, CD quality audio on port 8080
bun src/cli.ts -c 2 -s 44100 -b 16 -p 8080

# High quality audio with debug logging
bun src/cli.ts -c 2 -s 48000 -b 24 --debug
```

## WebSocket API

The server exposes two endpoints:

### `/rec` - Audio Recording

Connect to receive PCM audio data from the server's microphone.

```javascript
const ws = new WebSocket("ws://localhost:3000/rec");
ws.on("message", (audioData) => {
  // audioData is raw PCM audio buffer
  console.log(`Received ${audioData.length} bytes of audio`);
});
```

### `/play` - Audio Playback

Connect to send PCM audio data for playback through the server's speakers.

```javascript
const ws = new WebSocket("ws://localhost:3000/play");
ws.send(pcmAudioBuffer); // Send raw PCM audio data
```

## Audio Format

All audio data is transmitted as raw PCM in little-endian, signed integer format. The exact format depends on your server configuration (channels, sample rate, bit depth).

### Get in Touch

- X (formerly Twitter): [@loque_js](https://x.com/loque_js)
- Reddit: [the_loque](https://www.reddit.com/user/the_loque/)
