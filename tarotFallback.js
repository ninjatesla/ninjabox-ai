import TAROT_DECK from "./tarotDeck.js";

function detectCategory(question = "") {
  const q = question.toLowerCase();

  if (
    /barış|barışır|barışacak|barışma|geri döner|geri gelir|eski sevgili|eski eş|pişman|özür|affeder/.test(q)
  ) {
    return "barisma";
  }

  if (
    /ayrıl|ayril|ayrılık|ayrilik|biter|bitecek|terk|kop|boşan|bosan/.test(q)
  ) {
    return "ayrilik";
  }

  if (
    /yeni ilişki|yeni biri|yeni aşk|yeni sevgili|hayatıma biri|hayatima biri|sevgili olacak/.test(q)
  ) {
    return "yeniIliski";
  }

  if (
    /aşk|ask|seviyor|seviyor mu|beni düşünüyor|beni dusunuyor|ilişki|iliski|duygu|his/.test(q)
  ) {
    return "ask";
  }

  if (
    /para|maddi|kazanç|kazanc|zengin|borç|borc|yatırım|yatirim|gelir|maaş|maas|para gelecek/.test(q)
  ) {
    return "para";
  }

  if (
    /iş|is |işim|isim|kariyer|terfi|patron|çalışma|calisma|iş bul|is bul|işe girmek|ise girmek/.test(q)
  ) {
    return "is";
  }

  if (
    /gelecek|sonra|ileride|önümüzdeki|onumuzdeki|ne olacak|olacak mı|olacak mi|sonuç|sonuc/.test(q)
  ) {
    return "gelecek";
  }

  return "genel";
}

const categoryIntro = {
  ask: "Aşk tarafında",
  barisma: "Barışma ve geçmişte kalan ilişki açısından",
  ayrilik: "Ayrılık ve ilişkinin geleceği açısından",
  yeniIliski: "Yeni bir ilişki ihtimali açısından",
  para: "Para ve maddi konular açısından",
  is: "İş ve kariyer açısından",
  gelecek: "Önümüzdeki dönem açısından",
  genel: "Genel olarak"
};

function cleanMeaning(text = "") {
  return text
    .replace(/\s+/g, " ")
    .replace(/\.$/, "")
    .trim();
}

function orientationText(orientation) {
  return orientation === "reversed"
    ? "ters geldiği için enerjinin daha içe dönük, gecikmeli veya zorlayıcı çalıştığını"
    : "düz geldiği için kartın enerjisinin daha doğrudan çalıştığını";
}

function buildFallbackAnswer(card, orientation, category, question) {
  const meaning = cleanMeaning(
    orientation === "upright"
      ? card.upright
      : card.reversed
  );

  const intro = categoryIntro[category] || categoryIntro.genel;

  const templates = {
    ask:
      `${intro} ${card.name} kartı ${orientationText(orientation)} gösteriyor. Kartın temel mesajı: ${meaning}. Bu nedenle burada duyguların ve ilişkinin mevcut durumunun dikkatle değerlendirilmesi gerekiyor. Kart kesin bir gelecek garantisi vermez; fakat şu anki enerjinin ${meaning.toLowerCase()} yönünde olduğunu söylüyor.`,

    barisma:
      `${intro} ${card.name} kartı ${orientationText(orientation)} gösteriyor. Kartın mesajı ${meaning}. Geçmişten gelen bağ tamamen kapanmış olmayabilir; ancak barışmanın gerçekleşmesi için iki tarafın da mevcut kırgınlıkları ve iletişim sorunlarını aşması gerekiyor. Kart burada özellikle ${meaning.toLowerCase()} temasını öne çıkarıyor.`,

    ayrilik:
      `${intro} ${card.name} kartı ${orientationText(orientation)} gösteriyor. Kartın mesajı ${meaning}. Bu durum ilişkide bir dönemin kapanması, mesafe veya önemli bir karar ihtimalini gündeme getiriyor. Buradaki enerji ${meaning.toLowerCase()} temasına dikkat çekiyor.`,

    yeniIliski:
      `${intro} ${card.name} kartı ${orientationText(orientation)} gösteriyor. Kartın mesajı ${meaning}. Yeni bir ilişki ihtimali açısından önce geçmişten taşınan duyguların ve beklentilerin netleşmesi önemli görünüyor. Kartın enerjisi ${meaning.toLowerCase()} temasını öne çıkarıyor.`,

    para:
      `${intro} ${card.name} kartı ${orientationText(orientation)} gösteriyor. Kartın mesajı ${meaning}. Maddi konuda acele karar vermek yerine mevcut şartları iyi değerlendirmek daha doğru görünüyor. Özellikle ${meaning.toLowerCase()} teması burada öne çıkıyor.`,

    is:
      `${intro} ${card.name} kartı ${orientationText(orientation)} gösteriyor. Kartın mesajı ${meaning}. Kariyer konusunda mevcut şartların doğru okunması ve fırsatlarla risklerin birlikte değerlendirilmesi gerekiyor. Kart özellikle ${meaning.toLowerCase()} temasına dikkat çekiyor.`,

    gelecek:
      `${intro} ${card.name} kartı ${orientationText(orientation)} gösteriyor. Kartın mesajı ${meaning}. Önümüzdeki dönemde bu enerji belirginleşebilir; ancak Tarot kesin bir kader sonucu vermez. Buradaki ana tema ${meaning.toLowerCase()} olarak görünüyor.`,

    genel:
      `${intro} ${card.name} kartı ${orientationText(orientation)} gösteriyor. Kartın mesajı ${meaning}. Şu anda hayatında özellikle ${meaning.toLowerCase()} temasının öne çıktığı görülüyor. Bu kartı kesin bir gelecek hükmünden çok, mevcut duruma dair bir işaret olarak değerlendirmek daha doğru.`
  };

  let answer = templates[category] || templates.genel;

  if (question) {
    answer = `Soruna baktığımda; ${answer}`;
  }

  return answer;
}

export function getLocalTarotAnswer({
  question,
  cardId,
  orientation
}) {
  const card = TAROT_DECK.find((c) => c.id === cardId);

  if (!card) {
    return {
      answer:
        "Kart mesajı şu anda alınamadı. Ancak soru cevapsız kalmayacak; lütfen tekrar deneyelim.",
      category: "genel"
    };
  }

  const category = detectCategory(question);

  return {
    answer: buildFallbackAnswer(
      card,
      orientation,
      category,
      question
    ),
    category,
    cardName: card.name,
    orientation
  };
}
