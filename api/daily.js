// GET /api/daily
// Returns: { dailyId: "2026_03_05" }
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  res.json({ dailyId: `${y}_${m}_${day}` });
}
