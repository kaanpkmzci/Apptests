export type Language = {
  code: string; // ISO-639-1, used for transcription hints
  name: string; // English name, used in prompts
  native: string; // How the language calls itself
  flag: string;
  holdLabel: string; // "Hold to talk" in that language
  listening: string; // "Listening…" in that language
};

export const LANGUAGES: Language[] = [
  { code: "tr", name: "Turkish", native: "Türkçe", flag: "🇹🇷", holdLabel: "Basılı tut, konuş", listening: "Dinliyorum…" },
  { code: "it", name: "Italian", native: "Italiano", flag: "🇮🇹", holdLabel: "Tieni premuto e parla", listening: "Ti ascolto…" },
  { code: "en", name: "English", native: "English", flag: "🇬🇧", holdLabel: "Hold to talk", listening: "Listening…" },
  { code: "es", name: "Spanish", native: "Español", flag: "🇪🇸", holdLabel: "Mantén pulsado y habla", listening: "Escuchando…" },
  { code: "fr", name: "French", native: "Français", flag: "🇫🇷", holdLabel: "Maintenez et parlez", listening: "J'écoute…" },
  { code: "de", name: "German", native: "Deutsch", flag: "🇩🇪", holdLabel: "Gedrückt halten & sprechen", listening: "Ich höre zu…" },
  { code: "pt", name: "Portuguese", native: "Português", flag: "🇵🇹", holdLabel: "Segure e fale", listening: "Ouvindo…" },
  { code: "nl", name: "Dutch", native: "Nederlands", flag: "🇳🇱", holdLabel: "Ingedrukt houden & praten", listening: "Ik luister…" },
  { code: "el", name: "Greek", native: "Ελληνικά", flag: "🇬🇷", holdLabel: "Κράτα πατημένο και μίλα", listening: "Ακούω…" },
  { code: "ar", name: "Arabic", native: "العربية", flag: "🇸🇦", holdLabel: "اضغط مع الاستمرار وتحدث", listening: "أستمع…" },
  { code: "ru", name: "Russian", native: "Русский", flag: "🇷🇺", holdLabel: "Удерживайте и говорите", listening: "Слушаю…" },
  { code: "ja", name: "Japanese", native: "日本語", flag: "🇯🇵", holdLabel: "押しながら話す", listening: "聞いています…" },
  { code: "zh", name: "Chinese (Simplified)", native: "中文", flag: "🇨🇳", holdLabel: "按住说话", listening: "正在听…" },
];

export function getLang(code: string): Language {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}
