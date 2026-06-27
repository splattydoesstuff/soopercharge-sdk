import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";

export async function loadPcm16WavAssetSamples(moduleId: number): Promise<{
  samples: number[];
  sampleRate: number;
}> {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  const uri = asset.localUri || asset.uri;
  if (!uri) {
    throw new Error("Diagnostic audio asset is unavailable");
  }

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = decodeBase64(base64);
  return parsePcm16Wav(bytes);
}

export async function feedSamplesSequentially<T>(
  samples: number[],
  chunkSize: number,
  feedChunk: (chunk: number[]) => Promise<T>,
  shouldStop: (result: T) => boolean
): Promise<T> {
  let lastResult: T | undefined;
  for (let offset = 0; offset < samples.length; offset += chunkSize) {
    const chunk = samples.slice(offset, offset + chunkSize);
    lastResult = await feedChunk(chunk);
    if (shouldStop(lastResult)) {
      return lastResult;
    }
  }

  if (lastResult === undefined) {
    throw new Error("No diagnostic audio samples to feed");
  }
  return lastResult;
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function parsePcm16Wav(bytes: Uint8Array): { samples: number[]; sampleRate: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (readAscii(bytes, 0, 4) !== "RIFF" || readAscii(bytes, 8, 4) !== "WAVE") {
    throw new Error("Diagnostic audio must be a WAV file");
  }

  let offset = 12;
  let audioFormat = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= bytes.length) {
    const chunkId = readAscii(bytes, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataOffset = offset + 8;

    if (chunkId === "fmt ") {
      audioFormat = view.getUint16(chunkDataOffset, true);
      channels = view.getUint16(chunkDataOffset + 2, true);
      sampleRate = view.getUint32(chunkDataOffset + 4, true);
      bitsPerSample = view.getUint16(chunkDataOffset + 14, true);
    } else if (chunkId === "data") {
      dataOffset = chunkDataOffset;
      dataSize = chunkSize;
      break;
    }

    offset = chunkDataOffset + chunkSize + (chunkSize % 2);
  }

  if (audioFormat !== 1 || channels !== 1 || bitsPerSample !== 16 || dataOffset < 0) {
    throw new Error("Diagnostic audio must be mono PCM16 WAV");
  }

  const samples: number[] = [];
  const dataEnd = Math.min(dataOffset + dataSize, bytes.length);
  for (let index = dataOffset; index + 1 < dataEnd; index += 2) {
    samples.push(view.getInt16(index, true) / 32768);
  }

  return { samples, sampleRate };
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(bytes[offset + index]);
  }
  return value;
}
