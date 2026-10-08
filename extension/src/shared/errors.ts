/** An error whose message is safe to show the user as is (pt-BR, no secrets). Anything else is reported generically. */
export class ExtError extends Error {
  constructor(message: string) { super(message); this.name = 'ExtError'; }
}
