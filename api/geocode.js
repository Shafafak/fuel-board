// Vercel serverless function: forward-geocodes a place name/address to
// lat/lon, restricted to a bounding box around a given city center so
// results stay within that city rather than matching nationwide.
//
// Deployed URL: /api/geocode?q=<text>&lat=<city lat>&lon=<city lon>&radius=<degrees, optional>&limit=<1-5, optional>
// Response: { results: [{ lat, lon, displayName }, ...] }

module.exports = async (req, res) => {
  const q = (req.query.q || "").trim();
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  const radius = parseFloat(req.query.radius) || 0.18; // ~12-15 miles, city-sized
  let limit = parseInt(req.query.limit, 10);
  if (!Number.isInteger(limit) || limit < 1) limit = 1;
  if (limit > 5) limit = 5; // keep suggestion lists short and fast

  if (!q) {
    res.status(400).json({ error: "q (search text) is required" });
    return;
  }
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    res.status(400).json({ error: "lat and lon query params are required and must be numbers" });
    return;
  }

  // viewbox = left(lon-),top(lat+),right(lon+),bottom(lat-) ; bounded=1
  // strictly restricts results to inside this box rather than just biasing.
  const viewbox = [
    lon - radius, lat + radius,
    lon + radius, lat - radius
  ].join(",");

  const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=" + limit + "&bounded=1" +
    "&viewbox=" + encodeURIComponent(viewbox) +
    "&q=" + encodeURIComponent(q);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const upstream = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "FuelBoardDemo/1.0 (personal project; contact via GitHub repo)"
      }
    });
    clearTimeout(timer);

    if (!upstream.ok) {
      res.status(502).json({ error: "Nominatim returned HTTP " + upstream.status });
      return;
    }

    const results = await upstream.json();
    if (!results || !results.length) {
      res.status(404).json({ error: "No match found within this city" });
      return;
    }

    res.setHeader("Cache-Control", "public, max-age=3600");
    res.status(200).json({
      results: results.map(r => ({
        lat: parseFloat(r.lat),
        lon: parseFloat(r.lon),
        displayName: r.display_name || q
      }))
    });
  } catch (e) {
    res.status(502).json({ error: "Geocoding failed", detail: e && e.message ? e.message : String(e) });
  }
};
