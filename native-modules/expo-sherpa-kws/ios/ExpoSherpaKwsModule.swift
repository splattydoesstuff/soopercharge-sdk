import ExpoModulesCore

private let notImplementedMessage = "ExpoSherpaKws native sherpa-onnx implementation is not available"

public class ExpoSherpaKwsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoSherpaKws")

    Events("onKeywordDetected")

    AsyncFunction("startKWS") { (modelDir: String, keywordsFile: String) in
      // TODO: Initialize SherpaOnnxKeywordSpotter with C API
      // - Load encoder/decoder/joiner from modelDir
      // - Load keywords from keywordsFile
      // - Start AVAudioEngine tap feeding audio to spotter
      print("[ExpoSherpaKws] startKWS called with modelDir: \(modelDir)")
      throw Exception(name: "ERR_SHERPA_KWS_UNIMPLEMENTED", description: notImplementedMessage)
    }

    AsyncFunction("stopKWS") {
      // TODO: Stop audio engine tap and destroy spotter
      print("[ExpoSherpaKws] stopKWS called")
    }

    AsyncFunction("enrollSpeaker") { (audioSamples: [Double]) -> Bool in
      // TODO: Use SherpaOnnxSpeakerEmbeddingExtractor
      // - Extract embedding from audioSamples
      // - Average with existing enrollments
      // - Store in Keychain/SecureStore
      print("[ExpoSherpaKws] enrollSpeaker called with \(audioSamples.count) samples")
      throw Exception(name: "ERR_SHERPA_SPEAKER_UNIMPLEMENTED", description: notImplementedMessage)
    }

    AsyncFunction("verifySpeaker") { (audioSamples: [Double]) -> [String: Any] in
      // TODO: Extract embedding, cosine compare with enrolled
      // - Return { passed: Bool, score: Float }
      print("[ExpoSherpaKws] verifySpeaker called")
      throw Exception(name: "ERR_SHERPA_SPEAKER_UNIMPLEMENTED", description: notImplementedMessage)
    }

    AsyncFunction("getEnrollmentStatus") { () -> Bool in
      // TODO: Check if enrollment embedding exists in storage
      return false
    }
  }
}
