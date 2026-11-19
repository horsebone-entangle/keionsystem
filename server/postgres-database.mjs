// Only application-owned SQL reaches this adapter; values are always bound separately.
export function postgresStatement(sql, args) {
  let index = 0;
  const text = sql.replace(/\?/g, () => '$' + (++index));
  if (index !== args.length) throw new Error('SQL_PARAMETER_COUNT');
  return { text, values: args };
}

export function postgresDatabase(pool) {
  const statement = (sql, ...args) => postgresStatement(sql, args);
  async function batch(statements) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Serializes club writes before their statement snapshot: prevents quota/setup races.
      await client.query('SELECT pg_advisory_xact_lock(724019, 1)');
      const results = [];
      for (const query of statements) {
        const result = await client.query(query);
        results.push({ success: true, meta: { changes: result.rowCount } });
      }
      await client.query('COMMIT');
      return results;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* Preserve the original failure. */ }
      throw error;
    } finally { client.release(); }
  }
  return {
    statement,
    async one(sql, ...args) {
      const query = statement(sql, ...args);
      // Rate-limit UPSERT returns a row, and must also use the write transaction.
      if (!sql.startsWith('SELECT ')) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query('SELECT pg_advisory_xact_lock(724019, 1)');
          const result = await client.query(query);
          await client.query('COMMIT');
          return result.rows[0] || null;
        } catch (error) {
          try { await client.query('ROLLBACK'); } catch { /* Preserve original failure. */ }
          throw error;
        } finally { client.release(); }
      }
      return (await pool.query(query)).rows[0] || null;
    },
    async all(sql, ...args) { return (await pool.query(statement(sql, ...args))).rows; },
    async run(sql, ...args) { return (await batch([statement(sql, ...args)]))[0]; },
    batch,
  };
}
