export function database(env) {
  if (!env.DB) throw new Error('DATABASE_UNAVAILABLE');
  return {
    statement(sql, ...args) { return env.DB.prepare(sql).bind(...args); },
    async one(sql, ...args) { return this.statement(sql,...args).first(); },
    async all(sql, ...args) { return (await this.statement(sql,...args).all()).results; },
    async run(sql, ...args) { return this.statement(sql,...args).run(); },
    async batch(statements) { return env.DB.batch(statements); },
  };
}
