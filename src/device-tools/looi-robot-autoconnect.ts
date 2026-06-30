import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import {
  connectLooiRobot,
  configureLooiRobotTransport,
  disconnectLooiRobot,
  getLooiRobotRuntimeState,
} from "./looi-robot";

export type SavedLooiRobot = {
  id: string;
  name: string;
};

export type LooiRobotCandidate = {
  id: string;
  name: string;
  rssi: number | null;
  selected: boolean;
};

const SAVED_ROBOT_KEY = "looi.robot.selected.v1";

let connectionPromise: Promise<{ ok: true; connected: true } | { ok: false; skipped: true }> | null = null;

export function startLooiRobotAutoConnection(): Promise<{ ok: true; connected: true } | { ok: false; skipped: true }> {
  if (process.env.EXPO_PUBLIC_LOOI_DISABLE_ROBOT_AUTOCONNECT === "1" || Platform.OS === "web") {
    return Promise.resolve({ ok: false, skipped: true });
  }

  const runtimeState = getLooiRobotRuntimeState();
  if (runtimeState.connected) {
    return Promise.resolve({ ok: true, connected: true });
  }

  if (!connectionPromise) {
    connectionPromise = connectSavedRobot().catch((error) => {
      connectionPromise = null;
      throw error;
    });
  }

  return connectionPromise;
}

export async function scanLooiRobotCandidates(): Promise<LooiRobotCandidate[]> {
  if (Platform.OS === "web") return [];

  const [{ scanLooiRobotCandidates }, saved] = await Promise.all([
    import("./react-native-ble-transport"),
    getSavedLooiRobot(),
  ]);
  const candidates = await scanLooiRobotCandidates();
  return candidates.map((candidate) => ({
    id: candidate.id,
    name: candidate.name,
    rssi: candidate.rssi,
    selected: candidate.id === saved?.id,
  }));
}

export async function connectSelectedLooiRobot(robot: SavedLooiRobot): Promise<{
  ok: true;
  connected: true;
  robot: SavedLooiRobot;
}> {
  const result = await configureAndConnect(robot);
  await saveSelectedLooiRobot(robot);
  return { ...result, robot };
}

export async function getSavedLooiRobot(): Promise<SavedLooiRobot | null> {
  const raw = await SecureStore.getItemAsync(SAVED_ROBOT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SavedLooiRobot>;
    if (!parsed.id || !parsed.name) return null;
    return { id: parsed.id, name: parsed.name };
  } catch {
    return null;
  }
}

export async function clearSavedLooiRobot(): Promise<void> {
  await SecureStore.deleteItemAsync(SAVED_ROBOT_KEY);
  connectionPromise = null;
  await disconnectLooiRobot();
}

async function connectSavedRobot(): Promise<{ ok: true; connected: true } | { ok: false; skipped: true }> {
  const saved = await getSavedLooiRobot();
  if (!saved) return { ok: false, skipped: true };
  return configureAndConnect(saved);
}

async function configureAndConnect(robot: SavedLooiRobot): Promise<{ ok: true; connected: true }> {
  const { ReactNativeBleLooiTransport } = await import("./react-native-ble-transport");
  await disconnectLooiRobot();
  configureLooiRobotTransport(new ReactNativeBleLooiTransport({
    deviceId: robot.id,
    robotName: robot.name,
  }));

  console.log(`[LOOI BLE] Connecting selected robot ${robot.name} (${robot.id})`);
  const result = await connectLooiRobot({
    onDock: ({ docked }) => {
      console.log(`[LOOI BLE] Dock state changed: ${docked ? "docked" : "undocked"}`);
    },
    onRawNotify: ({ characteristic, hex }) => {
      console.log(`[LOOI BLE] Notify ${characteristic}: ${hex}`);
    },
  });
  console.log("[LOOI BLE] Robot connected and handshake complete");
  return result;
}

async function saveSelectedLooiRobot(robot: SavedLooiRobot): Promise<void> {
  await SecureStore.setItemAsync(SAVED_ROBOT_KEY, JSON.stringify(robot));
}
