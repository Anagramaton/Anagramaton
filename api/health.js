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

  const { data: columns, error: schemaProbeError } = await supabase
    .from('information_schema.columns')
    .select('column_name')
    .eq('table_schema', 'public')
    .eq('table_name', 'scores');

  if (schemaProbeError) {
    return res.status(200).json({
      configured: true,
      connection: 'error',
      table: 'error',
      schema_version: 'unknown',
    });
  }

  const columnNames = new Set((columns || []).map((col) => col.column_name));
  const tableExists = (columns || []).length > 0;
  const hasModeSchema =
    tableExists &&
    columnNames.has('daily_id') &&
    columnNames.has('player_name') &&
    columnNames.has('mode');

  return res.status(200).json({
    configured: true,
    connection: 'ok',
    table: tableExists ? 'exists' : 'missing',
    schema_version: hasModeSchema ? 'v1_with_mode' : 'unknown',
  });
}
