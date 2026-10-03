/** A rule of the game was broken. Safe to show to the player. */
export class GameRuleError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GameRuleError';
  }
}

export function fail(code: string, message: string): never {
  throw new GameRuleError(code, message);
}

export function ensure(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) fail(code, message);
}
