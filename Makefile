.PHONY: help build

help:
	@echo "Available targets:"
	@echo "  help       - Show this help message"
	@echo "  build      - Build the audio-relay program"

build:
	@echo "Building the audio-relay program..."
	bun build src/cli.ts --outfile=dist/audio-relay --compile --minify --target=bun-linux-x64
	@echo "✅ Build successful!"
