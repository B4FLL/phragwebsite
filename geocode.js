// Address / place search for Utah, using OpenStreetMap's free Nominatim service.
// Their rules: search only when the user asks (no search-as-you-type) and at most one request
// per second, which is enforced below. Results are limited to a box around Utah.
(function () {
  const UTAH_VIEWBOX = "-114.1,42.1,-108.9,36.9"; // left, top, right, bottom
  let lastRequest = 0;

  // Resolves to [{ lat, lng, name, bounds: [[south, west], [north, east]] }, ...] (maybe empty).
  async function search(query) {
    const q = query.trim();
    if (q.length < 3) return [];
    const wait = 1100 - (Date.now() - lastRequest);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequest = Date.now();
    const params = new URLSearchParams({
      q, format: "jsonv2", limit: "6", countrycodes: "us",
      viewbox: UTAH_VIEWBOX, bounded: "1", "accept-language": "en",
    });
    const res = await fetch("https://nominatim.openstreetmap.org/search?" + params);
    if (!res.ok) throw new Error("Search failed: " + res.status);
    const rows = await res.json();
    return rows.map((r) => ({
      lat: Number(r.lat),
      lng: Number(r.lon),
      name: r.display_name,
      bounds: r.boundingbox
        ? [[Number(r.boundingbox[0]), Number(r.boundingbox[2])], [Number(r.boundingbox[1]), Number(r.boundingbox[3])]]
        : null,
    })).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
  }

  window.phragGeocode = { search };
})();
