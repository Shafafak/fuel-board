// Vercel serverless function: proxies Overpass API requests server-side.
// Vercel auto-detects any file under /api as a serverless function — no
// config file needed. This avoids browser CORS issues entirely, since
// server-to-server requests aren't subject to the same-origin policy.
//
// Deployed URL: /api/stations?lat=..&lon=..&radius=..

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter"
];

module.exports = async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  const radius = parseInt(req.query.radius, 10) || 15000;

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    res.status(400).json({ error: "lat and lon query params are required and must be numbers" });
    return;
  }

  const query =
    "[out:json][timeout:20];(node[\"amenity\"=\"fuel\"](around:" + radius + "," + lat + "," + lon + ");" +
    "way[\"amenity\"=\"fuel\"](around:" + radius + "," + lat + "," + lon + "););out center;";

  let lastError = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const upstream = await fetch(endpoint + "?data=" + encodeURIComponent(query), { signal: controller.signal });
      clearTimeout(timer);

      if (!upstream.ok) {
        lastError = endpoint + " returned HTTP " + upstream.status;
        continue;
      }

      const data = await upstream.json();
      res.setHeader("Cache-Control", "public, max-age=1800"); // cache 30 min — station locations don't change often
      res.status(200).json(data);
      return;
    } catch (e) {
      lastError = endpoint + " failed: " + (e && e.message ? e.message : String(e));
    }
  }

  res.status(502).json({ error: "All Overpass endpoints failed", detail: lastError });
};
