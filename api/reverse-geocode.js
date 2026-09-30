// Vercel serverless function: reverse-geocodes lat/lon to a US ZIP code.
// LotLinx's ad API targets by ZIP, but our draggable map pin only gives us
// lat/lon — this bridges the two using OpenStreetMap's free Nominatim
// service, called server-side (same pattern as api/stations.js) to avoid
// browser CORS/rate-limit issues and to attach the required User-Agent.
//
// Deployed URL: /api/reverse-geocode?lat=..&lon=..

module.exports = async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    res.status(400).json({ error: "lat and lon query params are required and must be numbers" });
    return;
  }

  const url = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=" + lat + "&lon=" + lon + "&zoom=18&addressdetails=1";

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

    const data = await upstream.json();
    const address = data.address || {};
    const zip = address.postcode || null;
    const city = address.city || address.town || address.village || null;
    const state = address.state ? String(address.state) : null;

    if (!zip) {
      res.status(404).json({ error: "No ZIP code found for this location" });
      return;
    }

    res.setHeader("Cache-Control", "public, max-age=86400"); // ZIP for a given point never changes — cache 24h
    res.status(200).json({ zip, city, state });
  } catch (e) {
    res.status(502).json({ error: "Reverse geocoding failed", detail: e && e.message ? e.message : String(e) });
  }
};
