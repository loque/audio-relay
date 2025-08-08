import * as z from "zod/v4";

export const audioConfigSchema = z
  .object({
    channels: z.number().min(1).max(8).default(1),
    sampleRate: z.number().min(8_000).max(192_000).default(16_000),
    bitDepth: z
      .number()
      .pipe(z.coerce.string())
      .pipe(z.enum(["16", "24", "32"]))
      .pipe(z.coerce.number())
      .default(16),
    endian: z.enum(["LE", "BE"]).default("LE"),
    encoding: z.enum(["S", "U"]).default("S"),
    device: z.string().default("default"),
  })
  .strict();

export type AudioConfigInput = z.input<typeof audioConfigSchema>;
export type AudioConfigOutput = z.output<typeof audioConfigSchema>;
export type AudioConfig = AudioConfigOutput & {
  format: `${AudioConfig["encoding"]}${AudioConfig["bitDepth"]}_${AudioConfig["endian"]}`;
};

export function validateAudioConfig(input: AudioConfigInput): AudioConfig {
  const config = audioConfigSchema.parse(input);
  const format =
    `${config.encoding}${config.bitDepth}_${config.endian}` as const;
  return { ...config, format } satisfies AudioConfig;
}
