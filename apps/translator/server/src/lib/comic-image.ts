import OpenAI from "openai";
import sharp from "sharp";
// @ts-expect-error no types for upng-js
import UPNG from "upng-js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type ImageModel = "dall-e-2" | "dall-e-3";

export interface ComicStyle {
  id: string;
  label: string;
  prefix: string;
}

export const COMIC_STYLES: ComicStyle[] = [
  { id: "ink",        label: "Ink Comics",      prefix: "Black and white comic panel, clean thin ink outlines on white background, minimal shading, high contrast, monochrome, no text or speech bubbles: " },
  { id: "manga",      label: "Manga",           prefix: "Manga style panel, clean line art, white background, minimal screentone, expressive characters, monochrome, no text or speech bubbles: " },
  { id: "noir",       label: "Film Noir",       prefix: "Film noir style, dramatic shadows, chiaroscuro lighting, cinematic composition, monochrome, no text: " },
  { id: "woodcut",    label: "Woodcut",         prefix: "Woodcut block print style, thin carved lines on white background, medieval aesthetic, high contrast monochrome, no text: " },
  { id: "sketch",     label: "Pencil Sketch",   prefix: "Pencil sketch on white paper, loose thin hand-drawn lines, light crosshatch shading, sketchbook style, monochrome, no text: " },
  { id: "watercolor", label: "Watercolor",      prefix: "Soft watercolor illustration, gentle pastel tones, dreamy atmosphere, storybook style, no text: " },
  { id: "pixel",      label: "Pixel Art",       prefix: "Pixel art scene, 16-bit retro game style, clean pixels, vibrant colors, no text: " },
  { id: "children",   label: "Children's Book", prefix: "Children's book illustration, warm friendly style, soft rounded shapes, colorful and cheerful, no text: " },
  { id: "popart",     label: "Pop Art",         prefix: "Pop art style, bold outlines, Ben-Day dots, vibrant flat colors, Roy Lichtenstein inspired, no text: " },
  { id: "cyberpunk",  label: "Cyberpunk",       prefix: "Cyberpunk digital art, neon glow effects, dark futuristic city, high tech low life, no text: " },
];

const DEFAULT_STYLE = COMIC_STYLES[0];

export function getStyleById(id: string): ComicStyle {
  return COMIC_STYLES.find(s => s.id === id) ?? DEFAULT_STYLE;
}

const GLASSES_WIDTH = 288;
const GLASSES_HEIGHT = 144;

const PREVIEW_PROMPT = "A lone explorer standing on a cliff edge, looking at a vast landscape with mountains and a winding river below, dramatic sky";

export async function generateComicImage(
  prompt: string,
  model: ImageModel = "dall-e-2",
  styleId?: string
): Promise<Buffer> {
  const style = styleId ? getStyleById(styleId) : DEFAULT_STYLE;
  const styledPrompt = style.prefix + prompt;

  const response = await openai.images.generate({
    model,
    prompt: styledPrompt,
    size: "256x256",
    response_format: "b64_json",
    n: 1,
  });

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image data returned");
  return Buffer.from(b64, "base64");
}

export async function generatePreviewImage(
  styleId: string,
  model: ImageModel = "dall-e-2"
): Promise<Buffer> {
  return generateComicImage(PREVIEW_PROMPT, model, styleId);
}

/**
 * Process image for G2 glasses display.
 * Must produce 2-bit indexed PNG with cnum=4 (4 grey levels).
 * cnum=2 renders solid green on device — do not use.
 */
export async function processForGlasses(
  imageBuffer: Buffer
): Promise<string> {
  // Get raw greyscale pixels via sharp
  const { data, info } = await sharp(imageBuffer)
    .resize(GLASSES_WIDTH, GLASSES_HEIGHT, { fit: "cover" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Convert 8-bit greyscale to 1-bit, then to RGBA for UPNG
  const pixelCount = info.width * info.height;
  const rgba = new Uint8Array(pixelCount * 4);
  for (let i = 0; i < pixelCount; i++) {
    // Direct mapping: light areas → green (on), dark areas → black (off)
    const v = data[i] >= 128 ? 255 : 0;
    rgba[i * 4] = v;
    rgba[i * 4 + 1] = v;
    rgba[i * 4 + 2] = v;
    rgba[i * 4 + 3] = 255;
  }

  // Encode with UPNG, cnum=4 (critical for G2 display)
  const pngArrayBuffer = UPNG.encode(
    [rgba.buffer as ArrayBuffer],
    info.width,
    info.height,
    4
  );

  return Buffer.from(pngArrayBuffer).toString("base64");
}

export async function processForWeb(
  imageBuffer: Buffer
): Promise<string> {
  const processed = await sharp(imageBuffer)
    .resize(400, 200, { fit: "cover" })
    .greyscale()
    .png()
    .toBuffer();
  return processed.toString("base64");
}
