import { createMMKV } from "react-native-mmkv";

export type OptionalSetupCapability = "camera" | "calendar" | "robot";

export type SetupSkipState = Record<OptionalSetupCapability, boolean>;

type SetupStoragePayload = {
  version: 1;
  onboardingCompleted: boolean;
  skipped: SetupSkipState;
  updatedAt: string;
};

const SETUP_STORAGE_KEY = "looi.setup.v1";
const setupStorage = createMMKV({ id: "looi.setup" });

const defaultSetupState: SetupStoragePayload = {
  version: 1,
  onboardingCompleted: false,
  skipped: {
    camera: false,
    calendar: false,
    robot: false,
  },
  updatedAt: new Date(0).toISOString(),
};

export function getSetupStorageState(): SetupStoragePayload {
  const raw = setupStorage.getString(SETUP_STORAGE_KEY);
  if (!raw) return defaultSetupState;

  try {
    const parsed = JSON.parse(raw) as Partial<SetupStoragePayload>;
    return {
      version: 1,
      onboardingCompleted: Boolean(parsed.onboardingCompleted),
      skipped: {
        camera: Boolean(parsed.skipped?.camera),
        calendar: Boolean(parsed.skipped?.calendar),
        robot: Boolean(parsed.skipped?.robot),
      },
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : defaultSetupState.updatedAt,
    };
  } catch {
    setupStorage.remove(SETUP_STORAGE_KEY);
    return defaultSetupState;
  }
}

export function setOptionalCapabilitySkipped(
  capability: OptionalSetupCapability,
  skipped: boolean
): SetupStoragePayload {
  const state = getSetupStorageState();
  const next: SetupStoragePayload = {
    ...state,
    skipped: {
      ...state.skipped,
      [capability]: skipped,
    },
    updatedAt: new Date().toISOString(),
  };
  setupStorage.set(SETUP_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function setOnboardingCompleted(completed: boolean): SetupStoragePayload {
  const state = getSetupStorageState();
  const next: SetupStoragePayload = {
    ...state,
    onboardingCompleted: completed,
    updatedAt: new Date().toISOString(),
  };
  setupStorage.set(SETUP_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function resetSetupStorage(): void {
  setupStorage.remove(SETUP_STORAGE_KEY);
}
