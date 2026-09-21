/** Target languages offered in New Localization. Educators can also type any other language. */
export const studioLanguages: Array<{ code: string; name: string; regions?: string[]; varieties?: string[] }> = [
  { code: "rw", name: "Kinyarwanda", regions: ["Rwanda"] },
  { code: "sw", name: "Swahili", regions: ["Tanzania", "Kenya", "Uganda", "DR Congo"], varieties: ["Standard Kiswahili", "Congo Swahili"] },
  { code: "fr", name: "French", regions: ["Rwanda", "DR Congo", "Senegal", "Côte d'Ivoire", "Cameroon", "Haiti"], varieties: ["Standard French", "West African French"] },
  { code: "es", name: "Spanish", regions: ["Mexico", "Guatemala", "Peru", "Colombia"], varieties: ["Latin American Spanish", "Mexican Spanish"] },
  { code: "pt", name: "Portuguese", regions: ["Mozambique", "Angola", "Brazil"], varieties: ["Mozambican Portuguese", "Brazilian Portuguese"] },
  { code: "ar", name: "Arabic", regions: ["Morocco", "Egypt", "Sudan", "Jordan"], varieties: ["Moroccan Darija", "Egyptian Arabic", "Modern Standard Arabic"] },
  { code: "hi", name: "Hindi", regions: ["India"] },
  { code: "te", name: "Telugu", regions: ["India"] },
  { code: "ta", name: "Tamil", regions: ["India", "Sri Lanka"] },
  { code: "bn", name: "Bengali", regions: ["Bangladesh", "India"] },
  { code: "ur", name: "Urdu", regions: ["Pakistan", "India"] },
  { code: "ne", name: "Nepali", regions: ["Nepal"] },
  { code: "am", name: "Amharic", regions: ["Ethiopia"] },
  { code: "om", name: "Oromo", regions: ["Ethiopia"] },
  { code: "so", name: "Somali", regions: ["Somalia", "Kenya", "Ethiopia"] },
  { code: "ha", name: "Hausa", regions: ["Nigeria", "Niger"] },
  { code: "yo", name: "Yoruba", regions: ["Nigeria"] },
  { code: "ig", name: "Igbo", regions: ["Nigeria"] },
  { code: "lg", name: "Luganda", regions: ["Uganda"] },
  { code: "rn", name: "Kirundi", regions: ["Burundi"] },
  { code: "ln", name: "Lingala", regions: ["DR Congo", "Republic of the Congo"] },
  { code: "zu", name: "Zulu", regions: ["South Africa"] },
  { code: "xh", name: "Xhosa", regions: ["South Africa"] },
  { code: "ny", name: "Chichewa", regions: ["Malawi", "Zambia"] },
  { code: "sn", name: "Shona", regions: ["Zimbabwe"] },
  { code: "wo", name: "Wolof", regions: ["Senegal"] },
  { code: "id", name: "Indonesian", regions: ["Indonesia"] },
  { code: "tl", name: "Filipino", regions: ["Philippines"] },
  { code: "vi", name: "Vietnamese", regions: ["Vietnam"] },
  { code: "th", name: "Thai", regions: ["Thailand"] },
  { code: "km", name: "Khmer", regions: ["Cambodia"] },
  { code: "my", name: "Burmese", regions: ["Myanmar"] },
  { code: "zh", name: "Chinese", regions: ["China"], varieties: ["Mandarin (Simplified)", "Mandarin (Traditional)"] },
  { code: "en", name: "English", regions: ["Global", "USA", "Uganda", "Tanzania", "India"] }
];

export const studioAudiences = ["Adult learners", "Youth", "Women", "Entrepreneurs", "Farmers", "Trainers", "General"];

export const studioRegisters = [
  "Simple spoken educational language",
  "Conversational and friendly",
  "Formal educational language",
  "Plain language for low-literacy audiences"
];
