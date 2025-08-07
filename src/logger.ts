const LOG_LEVELS = ["debug", "info", "warn", "error"];
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface LoggerConfig {
  level?: LogLevel;
}

export class Logger extends console.Console {
  public readonly level: LogLevel;

  constructor(config: LoggerConfig = {}) {
    super({
      stdout: process.stdout,
      stderr: process.stderr,
    });
    this.level = config.level || "info";
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS.indexOf(level) >= LOG_LEVELS.indexOf(this.level);
  }

  override debug(...args: any[]): void {
    if (this.shouldLog("debug")) {
      console.debug("[DEBUG]", ...args);
    }
  }

  override log(...args: any[]): void {
    if (this.shouldLog("info")) {
      console.info("[INFO]", ...args);
    }
  }

  override warn(...args: any[]): void {
    if (this.shouldLog("warn")) {
      console.warn("[WARN]", ...args);
    }
  }

  override error(...args: any[]): void {
    if (this.shouldLog("error")) {
      console.error("[ERROR]", ...args);
    }
  }
}

let logger: Logger | undefined;

export function initializeLogger(config: LoggerConfig): Logger {
  logger = new Logger(config);
  return logger;
}

export function getLogger(): Logger {
  if (!logger) {
    throw new Error("Logger not configured");
  }
  return logger;
}
