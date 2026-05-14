import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const configured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
  if (!configured) {
    return res.status(200).json({
      configured: false,
      connection: 'unavailable',
      table: 'unknown',
      schema_version: 'unknown',
    });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const { error: tableProbeError } = await supabase
    .from('scores')
    .select('id', { head: true })
    .limit(1);

  if (tableProbeError) {
    const tableMissing = tableProbeError.code === '42P01';
    return res.status(200).json({
      configured: true,
      connection: tableMissing ? 'ok' : 'error',
      table: tableMissing ? 'missing' : 'error',
      schema_version: 'unknown',
    });
  }

  const { error: schemaError } = await supabase
    .from('scores')
    .select('daily_id,player_name,mode')
    .limit(1);

  return res.status(200).json({
    configured: true,
    connection: 'ok',
    table: 'exists',
    schema_version: schemaError ? 'unknown' : 'v1_with_mode',
  });
}
