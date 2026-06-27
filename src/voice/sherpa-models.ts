import * as FileSystem from "expo-file-system/legacy";

export type SherpaModelKind = "asr" | "kws" | "speaker";

export interface SherpaModelCheck {
  kind: SherpaModelKind;
  modelDir: string;
  absoluteModelDir: string;
  missingFiles: string[];
  ready: boolean;
}

const SHERPA_DOCUMENT_ROOT = `${FileSystem.documentDirectory ?? ""}sherpa-onnx/`;

export function resolveSherpaModelDir(modelDir: string): string {
  if (modelDir.startsWith("file://") || modelDir.startsWith("/")) {
    return modelDir.endsWith("/") ? modelDir : `${modelDir}/`;
  }

  const normalized = modelDir.replace(/^sherpa-onnx\//, "");
  return `${SHERPA_DOCUMENT_ROOT}${normalized.replace(/\/$/, "")}/`;
}

export async function checkSherpaModelFiles(
  kind: SherpaModelKind,
  modelDir: string,
  requiredFiles: string[]
): Promise<SherpaModelCheck> {
  const absoluteModelDir = resolveSherpaModelDir(modelDir);
  const missingFiles: string[] = [];

  for (const filename of requiredFiles) {
    const info = await FileSystem.getInfoAsync(`${absoluteModelDir}${filename}`);
    if (!info.exists || (info.size ?? 0) === 0) {
      missingFiles.push(filename);
    }
  }

  return {
    kind,
    modelDir,
    absoluteModelDir,
    missingFiles,
    ready: missingFiles.length === 0,
  };
}

export function formatSherpaModelError(check: SherpaModelCheck): string {
  return [
    `Sherpa ${check.kind} model files are missing in ${check.absoluteModelDir}`,
    `Missing: ${check.missingFiles.join(", ")}`,
    "Run `bash scripts/download-sherpa-models.sh`, then copy app-models/sherpa-onnx/ into the app document directory `sherpa-onnx/` on the device before starting voice services.",
  ].join(". ");
}
