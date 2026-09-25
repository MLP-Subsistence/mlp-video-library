/**
 * Languages OpenAI's speech recognition (Whisper) handles well — the ones
 * listed in its documentation as reliable. For these, a whole-lesson
 * voice-over can be split by matching what is said to the script. Other
 * languages (Kinyarwanda, Luganda, most smaller languages) fall back to
 * splitting at the pauses or marking while listening.
 */
const SUPPORTED = new Set([
  "af", "ar", "hy", "az", "be", "bs", "bg", "ca", "zh", "hr", "cs", "da", "nl", "en", "et", "fi", "fr", "gl", "de", "el", "he", "hi", "hu",
  "is", "id", "it", "ja", "kn", "kk", "ko", "lv", "lt", "mk", "ms", "mr", "mi", "ne", "no", "fa", "pl", "pt", "ro", "ru", "sr", "sk", "sl",
  "es", "sw", "sv", "tl", "ta", "th", "tr", "uk", "ur", "vi", "cy"
]);

/** The ISO-639-1 code to pass as the recognizer's language hint, or null when the language isn't reliably supported. */
export function speechLanguage(code: string | null | undefined) {
  const base = (code ?? "").toLowerCase().split(/[-_]/)[0];
  return SUPPORTED.has(base) ? base : null;
}
