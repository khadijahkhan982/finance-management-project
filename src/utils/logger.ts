// src/utils/logger.ts (Winston-Free)

import * as fs from 'fs';
import * as path from 'path';
import * as dgram from 'dgram'; 

function isDevEnv(): boolean {
  return process.env.NODE_ENV === "development";
}

export function isProdEnv(): boolean {
  return process.env.NODE_ENV === "production";
}
type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

const customLevels = {
  levels: {
    fatal: 0, 
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
    trace: 5,
  },
  colors: {
    fatal: '\x1b[31m', 
    error: '\x1b[31m', 
    warn: '\x1b[33m', // Yellow
    info: '\x1b[32m', 
    debug: '\x1b[32m', 
    trace: '\x1b[37m', // White
  },
  reset: '\x1b[0m',
};


function sendToLogstash(level: LogLevel, timestamp: string, message: any, meta: any) {
  const host = process.env.LOGGING_SERVER_IP;
  const port = process.env.LOGGING_SERVER_PORT;

  if (customLevels.levels[level] > customLevels.levels.warn || !host || !port) {
    return;
  }

  try {
    const socket = dgram.createSocket('udp4');
    const logData = {
      '@timestamp': timestamp,
      level: level,
      message: message,
      service: 'user-service',
      ...meta
    };
    const logBuffer = Buffer.from(JSON.stringify(logData));

    socket.send(logBuffer, Number(port), host, (err) => {
      if (err) console.error("Logstash UDP error:", err);
      socket.close();
    });
  } catch (err) {
    console.error("Failed to send log to Logstash:", err);
  }
}

function getTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, -5); 
}

function devFormatter(level: LogLevel, timestamp: string, message: any, meta: any): string {
  const color = customLevels.colors[level] || customLevels.reset;
  const metaString = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
  
  return `${color}${timestamp} [${level.toUpperCase()}]: ${message} ${metaString}${customLevels.reset}`;
}

function prodFormatter(level: LogLevel, timestamp: string, message: any, meta: any): string {
  return JSON.stringify({
    timestamp: timestamp,
    level: level,
    message: message,
    service: 'user-service',
    ...meta,
  });
}

  
class Logger {
  private level: number;
  private logFilePath: string = path.join(process.cwd(), 'logs', 'server.log');

  constructor() {
    this.level = customLevels.levels[isDevEnv() ? 'trace' : 'error'];
    
 
    const logDir = path.dirname(this.logFilePath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir);
    }
  }

  private handleLog(level: LogLevel, message: any, meta: any = {}) {
    const logTime = getTimestamp();
    const currentLevel = customLevels.levels[level];
    
    if (currentLevel > this.level) {
      return; // Message severity is lower than the configured logger level
    }

    // --- Dev/Console Transport (Always runs if level is met) ---
    if (!isProdEnv()) {
      const output = devFormatter(level, logTime, message, meta);
      console.log(output);
    }
    
    // --- Prod/File Transport (Runs only in production/if configured) ---
    if (isProdEnv() && currentLevel <= customLevels.levels.info) {
      const output = prodFormatter(level, logTime, message, meta);
      fs.appendFileSync(this.logFilePath, output + '\n');
    }

    if (process.env.LOGGING_SERVER_IP && process.env.LOGGING_SERVER_PORT) {
        sendToLogstash(level, logTime, message, meta);
    }
  }
  
  
  log(level: LogLevel, msg: any, meta?: any) {
    this.handleLog(level, msg, meta);
  }

  trace(msg: any, meta?: any) {
    this.handleLog('trace', msg, meta);
  }
  
  debug(msg: any, meta?: any) {
    this.handleLog('debug', msg, meta);
  }
  
  info(msg: any, meta?: any) {
    this.handleLog('info', msg, meta);
  }
  
  warn(msg: any, meta?: any) {
    this.handleLog('warn', msg, meta);
  }
  
  error(msg: any, meta?: any) {
    this.handleLog('error', msg, meta);
  }
  
  fatal(msg: any, meta?: any) {
    this.handleLog('fatal', msg, meta);
  }
}

class Singleton {
  private static instance: Logger;
  
  constructor() {
      if (!Singleton.instance) {
          Singleton.instance = new Logger();
      }
  }

  getInstance(): Logger {
      return Singleton.instance;
  }
}

export const logger = new Singleton().getInstance();