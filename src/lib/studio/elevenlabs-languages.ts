/**
 * Languages ElevenLabs' text-to-speech models actually support — a short,
 * accurate list, separate from the 343-entry GPT text-translation catalog in
 * `language-catalog.ts`. Used for the Voice library's language filter and for
 * deciding whether "Language" (the v3 language_code override) makes sense.
 *
 * `eleven_multilingual_v2` covers the ~29 core languages; `eleven_flash_v2_5`
 * / `eleven_turbo_v2_5` and the v3 models extend that list. Source: ElevenLabs
 * product documentation (languages supported by the multilingual/v3 models).
 */
export type ElevenLabsLanguage = { code: string; name: string; v2: boolean };

export const ELEVENLABS_LANGUAGES: ElevenLabsLanguage[] = [
  { code: "en", name: "English", v2: true },
  { code: "ja", name: "Japanese", v2: true },
  { code: "zh", name: "Chinese", v2: true },
  { code: "de", name: "German", v2: true },
  { code: "hi", name: "Hindi", v2: true },
  { code: "fr", name: "French", v2: true },
  { code: "ko", name: "Korean", v2: true },
  { code: "pt", name: "Portuguese", v2: true },
  { code: "it", name: "Italian", v2: true },
  { code: "es", name: "Spanish", v2: true },
  { code: "id", name: "Indonesian", v2: true },
  { code: "nl", name: "Dutch", v2: true },
  { code: "tr", name: "Turkish", v2: true },
  { code: "fil", name: "Filipino", v2: true },
  { code: "pl", name: "Polish", v2: true },
  { code: "sv", name: "Swedish", v2: true },
  { code: "bg", name: "Bulgarian", v2: true },
  { code: "ro", name: "Romanian", v2: true },
  { code: "ar", name: "Arabic", v2: true },
  { code: "cs", name: "Czech", v2: true },
  { code: "el", name: "Greek", v2: true },
  { code: "fi", name: "Finnish", v2: true },
  { code: "hr", name: "Croatian", v2: true },
  { code: "ms", name: "Malay", v2: true },
  { code: "sk", name: "Slovak", v2: true },
  { code: "da", name: "Danish", v2: true },
  { code: "ta", name: "Tamil", v2: true },
  { code: "uk", name: "Ukrainian", v2: true },
  { code: "ru", name: "Russian", v2: true },
  // Broader set: reliable with v3 / flash / turbo models, not the base v2 model.
  { code: "hu", name: "Hungarian", v2: false },
  { code: "no", name: "Norwegian", v2: false },
  { code: "vi", name: "Vietnamese", v2: false },
  { code: "he", name: "Hebrew", v2: false },
  { code: "sw", name: "Swahili", v2: false },
  { code: "af", name: "Afrikaans", v2: false },
  { code: "am", name: "Amharic", v2: false },
  { code: "bn", name: "Bengali", v2: false },
  { code: "ca", name: "Catalan", v2: false },
  { code: "et", name: "Estonian", v2: false },
  { code: "fa", name: "Persian", v2: false },
  { code: "gu", name: "Gujarati", v2: false },
  { code: "is", name: "Icelandic", v2: false },
  { code: "kn", name: "Kannada", v2: false },
  { code: "lv", name: "Latvian", v2: false },
  { code: "lt", name: "Lithuanian", v2: false },
  { code: "mk", name: "Macedonian", v2: false },
  { code: "ml", name: "Malayalam", v2: false },
  { code: "mr", name: "Marathi", v2: false },
  { code: "ne", name: "Nepali", v2: false },
  { code: "pa", name: "Punjabi", v2: false },
  { code: "sr", name: "Serbian", v2: false },
  { code: "si", name: "Sinhala", v2: false },
  { code: "sl", name: "Slovenian", v2: false },
  { code: "su", name: "Sundanese", v2: false },
  { code: "te", name: "Telugu", v2: false },
  { code: "ur", name: "Urdu", v2: false }
];

/** Models that accept an explicit `language_code`, per ElevenLabs' API reference. */
export function modelSupportsLanguageOverride(modelId: string) {
  return /flash|turbo|eleven_v3/i.test(modelId);
}
