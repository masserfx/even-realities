import sharp from "sharp";
import UPNG from "upng-js";

const W = 288;
const H = 144;
const TILE_SIZE = 256;
const ZOOM = 17;  // ~1.2km per tile, good for walking/cycling

// Tile cache: "z/x/y" → buffer, max 200 tiles, ~10MB
const tileCache = new Map<string, { buf: Buffer; ts: number }>();
const TILE_TTL = 10 * 60_000; // 10 minutes

// ── Tile math ─────────────────────────────────────────────────────────

function lngLatToTileXY(lng: number, lat: number, z: number): [number, number] {
  const n = Math.pow(2, z);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return [x, y];
}

/** Returns pixel offset of (lng,lat) within tile (tileX, tileY) at zoom z */
function lngLatToPixelInTile(
  lng: number, lat: number,
  tileX: number, tileY: number,
  z: number
): [number, number] {
  const n = Math.pow(2, z);
  const worldPxX = ((lng + 180) / 360) * n * TILE_SIZE;
  const latRad = (lat * Math.PI) / 180;
  const worldPxY =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
    n *
    TILE_SIZE;
  return [worldPxX - tileX * TILE_SIZE, worldPxY - tileY * TILE_SIZE];
}

// ── Tile fetching ─────────────────────────────────────────────────────

async function fetchTile(z: number, x: number, y: number): Promise<Buffer | null> {
  const key = `${z}/${x}/${y}`;
  const cached = tileCache.get(key);
  if (cached && Date.now() - cached.ts < TILE_TTL) return cached.buf;

  // Evict oldest if cache full
  if (tileCache.size > 200) {
    const oldest = [...tileCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    tileCache.delete(oldest[0]);
  }

  // CartoDB Dark Matter — dark bg, roads as light lines, ideal for monochrome glasses
  const sub = ["a", "b", "c", "d"][Math.abs(x + y) % 4];
  const url = `https://${sub}.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "EvenRealitiesNavigation/0.1 (personal use)",
        Referer: "http://localhost:3002/",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    tileCache.set(key, { buf, ts: Date.now() });
    return buf;
  } catch {
    return null;
  }
}

// ── Map composition ───────────────────────────────────────────────────

function toCanvasPixel(
  lng: number, lat: number,
  originTileX: number, originTileY: number
): [number, number] {
  const [px, py] = lngLatToPixelInTile(lng, lat, originTileX, originTileY, ZOOM);
  return [px, py];  // relative to top-left of tile grid (originTile)
}

function routeSVGOverlay(
  coords: [number, number][],
  originTileX: number,
  originTileY: number,
  canvasW: number,
  canvasH: number,
  cropLeft: number,
  cropTop: number
): string {
  if (coords.length < 2) return "";
  const pts = coords.map(([lng, lat]) => {
    const [px, py] = toCanvasPixel(lng, lat, originTileX, originTileY);
    return [px - cropLeft, py - cropTop] as [number, number];
  });
  const d = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
    .join(" ");
  return `<path d="${d}" stroke="#ffffff" stroke-width="4" fill="none" stroke-dasharray="8,4" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function positionSVGOverlay(cx: number, cy: number, heading: number): string {
  const s = 10;
  return `<g transform="translate(${cx},${cy}) rotate(${heading})">
    <polygon points="0,${-s} ${s * 0.7},${s * 0.8} 0,${s * 0.3} ${-s * 0.7},${s * 0.8}"
      fill="#ffffff" stroke="#000000" stroke-width="1.5"/>
  </g>`;
}

// ── Main export ───────────────────────────────────────────────────────

export async function generateMapImage(
  centerLat: number,
  centerLng: number,
  routeGeometry: [number, number][],
  heading = 0
): Promise<string> {
  const [centerTileX, centerTileY] = lngLatToTileXY(centerLng, centerLat, ZOOM);

  // Determine if we need offset tiles (when center is close to tile edge)
  const [offX, offY] = lngLatToPixelInTile(centerLng, centerLat, centerTileX, centerTileY, ZOOM);
  const needRight = offX > TILE_SIZE / 2;
  const needBottom = offY > TILE_SIZE / 2;

  // 2×2 tile grid starting from top-left tile
  const originTileX = needRight ? centerTileX : centerTileX - 1;
  const originTileY = needBottom ? centerTileY : centerTileY - 1;

  // Fetch 2×2 tiles in parallel
  const tiles = await Promise.all([
    fetchTile(ZOOM, originTileX,     originTileY),
    fetchTile(ZOOM, originTileX + 1, originTileY),
    fetchTile(ZOOM, originTileX,     originTileY + 1),
    fetchTile(ZOOM, originTileX + 1, originTileY + 1),
  ]);

  // Fallback: if tiles failed, use plain black canvas
  const placeholder = await sharp({
    create: { width: TILE_SIZE, height: TILE_SIZE, channels: 3, background: "#111111" },
  }).png().toBuffer();

  const [t00, t10, t01, t11] = tiles.map((t) => t ?? placeholder);

  // Stitch 4 tiles into 512×512 canvas — each tile stays 256×256
  const stitched = await sharp({
    create: { width: TILE_SIZE * 2, height: TILE_SIZE * 2, channels: 3, background: "#111111" },
  })
    .composite([
      { input: t00, left: 0,         top: 0 },
      { input: t10, left: TILE_SIZE, top: 0 },
      { input: t01, left: 0,         top: TILE_SIZE },
      { input: t11, left: TILE_SIZE, top: TILE_SIZE },
    ])
    .png()
    .toBuffer();

  // Calculate crop window: W×H centered on position
  const [posX, posY] = lngLatToPixelInTile(centerLng, centerLat, originTileX, originTileY, ZOOM);
  const cropLeft = Math.round(Math.max(0, Math.min(TILE_SIZE * 2 - W, posX - W / 2)));
  const cropTop  = Math.round(Math.max(0, Math.min(TILE_SIZE * 2 - H, posY - H / 2)));

  const cropped = await sharp(stitched)
    .extract({ left: cropLeft, top: cropTop, width: W, height: H })
    .toBuffer();

  // Build SVG overlay for route + position
  const posCx = Math.round(posX - cropLeft);
  const posCy = Math.round(posY - cropTop);

  const routePath = routeSVGOverlay(
    routeGeometry, originTileX, originTileY, W, H, cropLeft, cropTop
  );
  const posMarker = positionSVGOverlay(posCx, posCy, heading);

  const overlaySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
${routePath}
${posMarker}
</svg>`;

  // Normalize tile contrast BEFORE SVG overlay (SVG green would dominate the max otherwise)
  const normalizedMap = await sharp(cropped)
    .greyscale()
    .normalize()
    .toColourspace("srgb")   // back to RGB so SVG compositing works
    .toBuffer();

  // Composite overlay on normalized map
  const composited = await sharp(normalizedMap)
    .composite([{ input: Buffer.from(overlaySvg) }])
    .toBuffer();

  // Greyscale → 4-level quantize → UPNG 2-bit indexed PNG
  const { data, info } = await sharp(composited)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixelCount = info.width * info.height;
  const rgba = new Uint8Array(pixelCount * 4);
  for (let i = 0; i < pixelCount; i++) {
    const raw = (data as Buffer)[i];
    // 4-level quantize
    const v = raw < 64 ? 0 : raw < 128 ? 85 : raw < 192 ? 170 : 255;
    rgba[i * 4]     = v;
    rgba[i * 4 + 1] = v;
    rgba[i * 4 + 2] = v;
    rgba[i * 4 + 3] = 255;
  }

  const pngBuf = UPNG.encode([rgba.buffer as ArrayBuffer], info.width, info.height, 4);
  return Buffer.from(pngBuf).toString("base64");
}
