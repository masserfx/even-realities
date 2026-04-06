import sharp from "sharp";
import UPNG from "upng-js";

const SIZE = 144;
const W = 14;   // road stroke width
const C = "#ffffff";

// Cache: "type/modifier" → base64 PNG
const cache = new Map<string, string>();

function svgForManeuver(type: string, modifier: string): string {
  const t = type.toLowerCase();
  const m = modifier.toLowerCase();

  // ── Special types ──────────────────────────────────────────────────
  if (t === "arrive") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
      <line x1="36" y1="36" x2="108" y2="108" stroke="${C}" stroke-width="16" stroke-linecap="round"/>
      <line x1="108" y1="36" x2="36" y2="108" stroke="${C}" stroke-width="16" stroke-linecap="round"/>
      <circle cx="72" cy="72" r="30" stroke="${C}" stroke-width="10" fill="none"/>
    </svg>`;
  }

  if (t === "roundabout" || t === "rotary" || t === "roundabout turn") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
      <circle cx="72" cy="64" r="34" stroke="${C}" stroke-width="10" fill="none"/>
      <path d="M72,132 L72,98" stroke="${C}" stroke-width="${W}" fill="none" stroke-linecap="round"/>
      <polygon points="60,106 72,128 84,106" fill="${C}"/>
      <polygon points="98,36 112,48 98,58" fill="${C}"/>
    </svg>`;
  }

  if (m === "uturn") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
      <path d="M52,140 L52,64 Q52,16 92,16 Q132,16 132,64 L132,100"
        stroke="${C}" stroke-width="${W}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <polygon points="120,88 132,106 144,88" fill="${C}"/>
    </svg>`;
  }

  // ── Standard turns: road enters from bottom, turns in direction ────
  let pathD: string;
  let arrowPts: string;

  if (m === "right") {
    pathD = "M72,140 L72,68 Q72,20 126,20";
    arrowPts = "112,8 130,22 112,36";
  } else if (m === "sharp right") {
    pathD = "M72,140 L72,80 Q72,48 108,48 Q138,48 138,80 L138,128";
    arrowPts = "126,116 138,132 150,116";
  } else if (m === "slight right") {
    pathD = "M72,140 L72,80 Q74,28 112,16";
    arrowPts = "100,4 116,18 104,30";
  } else if (m === "left") {
    pathD = "M72,140 L72,68 Q72,20 18,20";
    arrowPts = "32,8 14,22 32,36";
  } else if (m === "sharp left") {
    pathD = "M72,140 L72,80 Q72,48 36,48 Q6,48 6,80 L6,128";
    arrowPts = "18,116 6,132 -6,116";
  } else if (m === "slight left") {
    pathD = "M72,140 L72,80 Q70,28 32,16";
    arrowPts = "44,4 28,18 40,30";
  } else {
    // straight / continue / depart / default
    pathD = "M72,140 L72,8";
    arrowPts = "60,18 72,2 84,18";
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
    <path d="${pathD}" stroke="${C}" stroke-width="${W}" fill="none"
      stroke-linecap="round" stroke-linejoin="round"/>
    <polygon points="${arrowPts}" fill="${C}"/>
  </svg>`;
}

export async function generateTurnArrowImage(
  maneuverType: string,
  maneuverModifier: string
): Promise<string> {
  const key = `${maneuverType}/${maneuverModifier}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const svg = svgForManeuver(maneuverType, maneuverModifier);

  const { data, info } = await sharp(Buffer.from(svg))
    .resize(SIZE, SIZE)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixelCount = info.width * info.height;
  const rgba = new Uint8Array(pixelCount * 4);
  for (let i = 0; i < pixelCount; i++) {
    const v = (data as Buffer)[i] < 128 ? 0 : 255;
    rgba[i * 4]     = v;
    rgba[i * 4 + 1] = v;
    rgba[i * 4 + 2] = v;
    rgba[i * 4 + 3] = 255;
  }

  const pngBuf = UPNG.encode([rgba.buffer as ArrayBuffer], SIZE, SIZE, 4);
  const b64 = Buffer.from(pngBuf).toString("base64");
  cache.set(key, b64);
  return b64;
}
