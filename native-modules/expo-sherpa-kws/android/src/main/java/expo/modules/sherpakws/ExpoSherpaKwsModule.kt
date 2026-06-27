package expo.modules.sherpakws

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise

class ExpoSherpaKwsModule : Module() {
  private val notImplementedMessage =
    "ExpoSherpaKws native sherpa-onnx implementation is not available"

  override fun definition() = ModuleDefinition {
    Name("ExpoSherpaKws")

    Events("onKeywordDetected")

    AsyncFunction("startKWS") { modelDir: String, keywordsFile: String, promise: Promise ->
      // TODO: Initialize sherpa-onnx keyword spotter via JNI
      // - Load models from modelDir
      // - Start AudioRecord feeding to spotter
      println("[ExpoSherpaKws] startKWS: $modelDir")
      promise.reject("ERR_SHERPA_KWS_UNIMPLEMENTED", notImplementedMessage, null)
    }

    AsyncFunction("stopKWS") { promise: Promise ->
      // TODO: Stop audio recording and destroy spotter
      println("[ExpoSherpaKws] stopKWS")
      promise.resolve(null)
    }

    AsyncFunction("enrollSpeaker") { audioSamples: List<Double>, promise: Promise ->
      // TODO: Extract speaker embedding via JNI, store securely
      println("[ExpoSherpaKws] enrollSpeaker: ${audioSamples.size} samples")
      promise.reject("ERR_SHERPA_SPEAKER_UNIMPLEMENTED", notImplementedMessage, null)
    }

    AsyncFunction("verifySpeaker") { audioSamples: List<Double>, promise: Promise ->
      // TODO: Extract embedding, cosine compare
      println("[ExpoSherpaKws] verifySpeaker")
      promise.reject("ERR_SHERPA_SPEAKER_UNIMPLEMENTED", notImplementedMessage, null)
    }

    AsyncFunction("getEnrollmentStatus") { promise: Promise ->
      // TODO: Check secure storage for enrollment
      promise.resolve(false)
    }
  }
}
