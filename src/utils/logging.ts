/**
 * A singleton logger class that handles all logging operations with consistent formatting
 */
export class Logger {
  private static instance: Logger;

  private constructor() {}

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private getTimestamp(): string {
    const date = new Date();
    return date.toLocaleString("en-US", {
      timeZone: "America/Jamaica",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  private formatMessage(message: any): string {
    const timestamp = this.getTimestamp();
    if (typeof message === 'string') {
      return `[${timestamp}] ${message}`;
    }
    return `[${timestamp}] ${JSON.stringify(message, null, 2)}`;
  }

  public log(message: any): void {
    console.log(this.formatMessage(message));
  }

  public error(message: any): void {
    console.error(this.formatMessage(message));
  }
}

// Export a singleton instance for convenience
export const logger = Logger.getInstance();
