type LogLevel = "info" | "warn" | "error";

export function structuredLog(level: LogLevel, event: string, metadata: Record<string, unknown> = {}) {
  const payload = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...metadata,
  };

  if (level === "error") {
    console.error(JSON.stringify(payload));
    return;
  }

  if (level === "warn") {
    console.warn(JSON.stringify(payload));
    return;
  }

  console.info(JSON.stringify(payload));
}

export function captureError(error: unknown, metadata: Record<string, unknown> = {}) {
  structuredLog("error", "application.error", {
    message: error instanceof Error ? error.message : "Unknown error",
    stack: error instanceof Error ? error.stack : undefined,
    ...metadata,
  });
}
