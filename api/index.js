import { api } from '../server/api.mjs';
import { postgresPool } from '../server/postgres.mjs';
import { postgresDatabase } from '../server/postgres-database.mjs';

export default {
  async fetch(request) {
    try {
      return await api(request, { DATABASE: postgresDatabase(postgresPool()), CLIENT_IP: request.headers.get('x-vercel-forwarded-for')||request.headers.get('x-real-ip')||'unknown' });
    } catch {
      return Response.json({ error: 'データベース接続設定を確認してください' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
  },
};
