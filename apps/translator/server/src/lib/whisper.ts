import OpenAI, { toFile } from "openai";
import { createWavBuffer } from "./wav.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface TranscriptionResult {
  text: string;
  language: string;
}

/**
 * Transcribes base64-encoded audio via OpenAI Whisper.
 * Supports both raw PCM (from glasses SDK) and webm/opus (from browser fallback).
 */
export async function transcribe(
  audioBase64: string,
  language?: string,
  format?: string
): Promise<TranscriptionResult> {
  const audioBuffer = Buffer.from(audioBase64, "base64");

  let file;
  if (format === "webm") {
    file = await toFile(audioBuffer, "audio.webm", { type: "audio/webm" });
  } else {
    // Default: raw PCM → WAV
    const wavBuffer = createWavBuffer(audioBuffer);
    file = await toFile(wavBuffer, "audio.wav", { type: "audio/wav" });
  }

  const response = await openai.audio.transcriptions.create({
    model: "whisper-1",
    file,
    ...(language ? { language } : {}),
    response_format: "verbose_json",
  });

  return {
    text: response.text,
    language: response.language ?? language ?? "unknown",
  };
}
