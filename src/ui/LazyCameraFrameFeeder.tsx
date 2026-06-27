import { lazy, Suspense } from "react";
import { useUserStore } from "../store/user";
import { getRuntimeProfile } from "../core/runtime-profile";

const CameraFrameFeeder = lazy(() =>
  import("./CameraFrameFeeder").then((module) => ({
    default: module.CameraFrameFeeder,
  }))
);

export function LazyCameraFrameFeeder() {
  const cameraEnabled = useUserStore((state) => state.preferences.cameraEnabled);
  const { allowsCameraAutostart } = getRuntimeProfile();

  if (!cameraEnabled || !allowsCameraAutostart) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <CameraFrameFeeder />
    </Suspense>
  );
}
