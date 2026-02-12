import pino from "pino";
import { env } from "./config";

export const logger = pino({
  level: env.LOG_LEVEL,
  transport: env.LOG_PRETTY
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      }
    : undefined,
});

export type Logger = typeof logger;
