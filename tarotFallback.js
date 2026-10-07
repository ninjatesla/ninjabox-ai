import TAROT_DECK from "./tarotDeck.js";

function detectCategory(question = "") {
  const q = question.toLowerCase();

  if (/barış|barışır|barışacak|barışma|geri döner|geri gelir|eski sevgili|eski eş|pişman|özür|affeder/.test(q)) {
    return "barisma";
  }

  if (/ayrıl|ayril|ayrılık|ayrilik|biter|bitecek|terk|kop|boşan|bosan/.test(q)) {
    return "ayrilik";
  }

  if (/yeni ilişki|yeni biri|yeni aşk|yeni sevgili|hayatıma biri|hayatima biri|sevgili olacak/.test(q)) {
    return "yeniIliski";
  }

  if (/aşk|ask|seviyor|seviyor mu|beni düşünüyor|beni dusunuyor|ilişki|iliski|duygu|his/.test(q)) {
    return "ask";
  }

  if (/para|maddi|kazanç|kazanc|zengin|borç|borc|yatırım|yatirim|gelir|maaş|maas/.test(q)) {
    return "para";
  }

  if (/iş|is |işim|isim|kariyer|terfi|patron|çalışma|calisma|iş bul|is bul|işe girmek|ise girmek/.test(q)) {
    return "is";
  }

  if (/gelecek|sonra|ileride|önümüzdeki|onumuzdeki|ne olacak|olacak mı|olacak mi|sonuç|sonuc/.test(q)) {
    return "gelecek";
  }

  return "genel";
}

function getMeaningParts(card, orientation) {
  const meaning =
    orientation === "upright"
      ? card.upright
      : card.reversed;

  return meaning
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function pickMeaning(card, orientation, variantIndex) {
  const parts = getMeaningParts(card, orientation);

  if (parts.length === 0) {
    return "";
  }

  if (parts.length === 1) {
    return parts[0].toLowerCase();
  }

  const first = parts[variantIndex % parts.length];
  const second = parts[(variantIndex + 1) % parts.length];

  return `${first.toLowerCase()} ve ${second.toLowerCase()}`;
}

function limitWords(text, max = 15) {
  const words = text.trim().split(/\s+/);

  if (words.length <= max) {
    return text.trim();
  }

  return words.slice(0, max).join(" ").replace(/[,:;]$/, "") + ".";
}

const categoryLeads = {
  barisma: [
    "Barışma ihtimali var.",
    "Barışma açısından",
    "Geçmiş ilişki açısından",
    "Bu bağ açısından",
    "İlişkinin yeniden başlaması açısından"
  ],

  ayrilik: [
    "İlişki açısından",
    "Ayrılık konusunda",
    "Bu ilişkide",
    "Bağın geleceğinde",
    "Duygusal süreçte"
  ],

  ask: [
    "Aşk tarafında",
    "Duygusal olarak",
    "İlişki açısından",
    "Bu bağda",
    "Karşılıklı duygularda"
  ],

  yeniIliski: [
    "Yeni ilişki açısından",
    "Aşk hayatında",
    "Yeni bir bağ konusunda",
    "Duygusal gelecekte",
    "Yeni başlangıç açısından"
  ],

  para: [
    "Para konusunda",
    "Maddi açıdan",
    "Finansal tarafta",
    "Kazanç konusunda",
    "Maddi gelecekte"
  ],

  is: [
    "İş konusunda",
    "Kariyer açısından",
    "Meslek hayatında",
    "Çalışma hayatında",
    "İş geleceğinde"
  ],

  gelecek: [
    "Önümüzdeki dönemde",
    "Yakın gelecekte",
    "Gelecek açısından",
    "Önündeki süreçte",
    "Sonraki dönemde"
  ],

  genel: [
    "Genel olarak",
    "Hayatında",
    "Bu süreçte",
    "Şu anda",
    "Önündeki dönemde"
  ]
};

const answerVariants = [
  (lead, meaning) =>
    `${lead} ${meaning} öne çıkıyor.`,

  (lead, meaning) =>
    `${lead} ${meaning} görülüyor.`,

  (lead, meaning) =>
    `${lead} ${meaning} dikkat çekiyor.`,

  (lead, meaning) =>
    `${lead} kartın mesajı ${meaning}.`,

  (lead, meaning) =>
    `${lead} özellikle ${meaning} öne çıkmış.`,

  (lead, meaning) =>
    `${lead} ${meaning} etkili görünüyor.`,

  (lead, meaning) =>
    `${lead} kart ${meaning} diyor.`,

  (lead, meaning) =>
    `${lead} ${meaning} enerjisi baskın.`,

  (lead, meaning) =>
    `${lead} ${meaning} belirginleşiyor.`,

  (lead, meaning) =>
    `${lead} kartın ana teması ${meaning}.`,

  (lead, meaning) =>
    `${lead} ${meaning} ön planda.`,

  (lead, meaning) =>
    `${lead} ${meaning} mesajı güçlü.`,

  (lead, meaning) =>
    `${lead} ${meaning} öne çıkıyor. Süreç bunu destekliyor.`,

  (lead, meaning) =>
    `${lead} ${meaning} görünüyor. Acele etmemek önemli.`,

  (lead, meaning) =>
    `${lead} ${meaning} var. Gelişmeler bu temayı taşıyor.`
];

  function buildFallbackAnswer(card, orientation, category) {
  const leads =
    categoryLeads[category] || categoryLeads.genel;

  const lead =
    leads[Math.floor(Math.random() * leads.length)];

  const variantIndex =
    Math.floor(Math.random() * answerVariants.length);

  const meaning =
    pickMeaning(
      card,
      orientation,
      variantIndex
    );

  const answer =
    answerVariants[variantIndex](
      lead,
      meaning
    );

  return limitWords(answer, 15);
}

export function getLocalTarotAnswer({
  question,
  cardId,
  orientation
}) {
  const card =
    TAROT_DECK.find(
      (c) => c.id === cardId
    );

  if (!card) {
    return {
      answer:
        "Kart mesajı alınamadı. Lütfen tekrar deneyelim.",
      category: "genel"
    };
  }

  const category =
    detectCategory(question);

  return {
    answer:
      buildFallbackAnswer(
        card,
        orientation,
        category
      ),

    category,

    cardName:
      card.name,

    orientation
  };
}
