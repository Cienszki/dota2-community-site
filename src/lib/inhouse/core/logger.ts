// packages/core/src/logger.ts
// Minimal structured logger, shared by the bot and the website.
//
// Defaults to console, which is what the bot wants (Railway and PM2 both just
// capture stdout). A consumer with its own logging stack — the website, or a
// test harness that wants silence — replaces the sink with `setLogSink`.

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
} as const;

export type LogLevel = keyof typeof LOG_LEVELS;

/** Receives every log line that passes the level filter. */
export type LogSink = (level: LogLevel, message: string, data?: unknown) => void;

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function timestamp(): string {
  return new Date().toISOString();
}

/**
 * Serialise the trailing data argument.
 *
 * Errors are reduced to their message: this logger is called on hot paths with
 * caught exceptions, and a full stack per line buries the signal. Anything
 * non-serialisable degrades to `String(value)` rather than throwing — a logger
 * that can crash its caller is worse than a lossy one.
 */
function format(data: unknown): string {
  if (data === undefined || data === null) return '';
  if (data instanceof Error) return data.message;
  if (typeof data === 'string') return data;
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

const consoleSink: LogSink = (level, message, data) => {
  const line = `[${timestamp()}] [${level.toUpperCase()}] ${message}`;
  const extra = format(data);

  if (level === 'error') console.error(line, extra);
  else if (level === 'warn') console.warn(line, extra);
  else console.log(line, extra);
};

let sink: LogSink = consoleSink;

/**
 * Replace the log destination. Pass nothing to restore the console default.
 *
 * Level filtering is applied before the sink is called, so a sink never sees
 * lines below `LOG_LEVEL`.
 */
export function setLogSink(next?: LogSink): void {
  sink = next ?? consoleSink;
}

function emit(level: LogLevel, message: string, data?: unknown): void {
  if (!shouldLog(level)) return;
  try {
    sink(level, message, data);
  } catch {
    // A broken sink must never take down the caller.
  }
}

export const logger = {
  debug: (msg: string, data?: unknown): void => emit('debug', msg, data),
  info: (msg: string, data?: unknown): void => emit('info', msg, data),
  warn: (msg: string, data?: unknown): void => emit('warn', msg, data),
  error: (msg: string, error?: unknown): void => emit('error', msg, error),
};
