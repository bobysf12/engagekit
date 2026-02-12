export class AuthError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "AuthError";
  }
}

export class NavigationError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "NavigationError";
  }
}

export class ParseError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "ParseError";
  }
}

export class PersistenceError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "PersistenceError";
  }
}

export class RateLimitError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export class ScraperError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "ScraperError";
  }
}
