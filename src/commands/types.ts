export type Output = string | Array<string | false | null | undefined>;

export interface CommandContext {
  /** Replace the panel's output area. */
  show(output: Output): void;
}

export interface Command {
  label: string;
  run(ctx: CommandContext): Promise<void> | void;
}
