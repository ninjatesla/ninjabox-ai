import { TAROT_DECK } from "./tarotDeck.js";

const POSITION_NAMES = ["GEÇMİŞİN ETKİSİ", "ŞİMDİKİ DURUM", "OLASI YÖN VE TAVSİYE"];

function pickThreeCards() {
  const deck = [...TAROT_DECK];
  const cards = [];
  while (cards.length < 3 && deck.length) {
    const index = Math.floor(Math.random() * deck.length);
    const [card] = deck.splice(index, 1);
    const orientation = Math.random() < 0.28 ? "reversed" : "upright";
    cards.push({
      ...card,
      orientation,
      meaning: orientation === "reversed" ? card.reversed : card.upright,
      position: ["past", "present", "direction"][cards.length]
    });
  }
  return cards;
}

function localSynthesis(cards, username) {
  const [past, present, direction] = cards;
  const majorCount = cards.filter((card) => card.arcana === "major").length;
  const reversedCount = cards.filter((card) => card.orientation === "reversed").length;
  const opening = `${username ? username + ", " : ""}üç kartın birlikte anlattığı hikâyeye bakalım.`;
  const bridge = `Geçmişte ${past.name} kartı ${past.meaning.toLowerCase()} temasını öne çıkarıyor. Şimdi ${present.name}, bu konunun merkezinde ${present.meaning.toLowerCase()} olduğunu söylüyor. Bu iki kart birbirine bağlı; geçmişin etkisi bugünkü kararlarını şekillendiriyor.`;
  const outcome = `Üçüncü kart ${direction.name}, önündeki süreçte ${direction.meaning.toLowerCase()} temasına dikkat çekiyor. Bu kesin bir sonuç değil; atacağın adımlara göre değişebilecek bir olasılık. ${majorCount >= 2 ? "Büyük Arkana kartlarının yoğunluğu, bu konunun senin için önemli bir dönüm noktası olabileceğini düşündürüyor. " : ""}${reversedCount >= 2 ? "Birden fazla ters kart, acele etmek yerine önce içindeki karışıklığı netleştirmenin yararlı olacağını vurguluyor. " : ""}Kartların ortak tavsiyesi, duygularını fark edip somut ve dengeli bir adım atman.`;
  return `${opening} ${bridge} ${outcome}`;
}

function buildPrompt(username, question, cards) {
  const cardLines = cards.map((card, index) =>
    `${index + 1}. ${POSITION_NAMES[index]} — ${card.name} (${card.orientation === "reversed" ? "TERS" : "DÜZ"}). Temel anlam: ${card.meaning}. Arkana: ${card.arcana}.`
  ).join("\n");

  return `Sen deneyimli, sezgisel ve etik bir Türkçe tarot yorumcususun. NinjaBox canlı yayınında okunacak tek parça, doğal ve sıcak bir yorum yaz.
İzleyici: ${username || "izleyici"}
Soru: ${question || "Genel üç kart açılımı"}
ÜÇ KART VE KONUMU:
${cardLines}

Kurallar:
- 75-100 kelime; yaklaşık 30-45 saniyelik konuşma.
- Kartları sözlük gibi ayrı ayrı açıklama; geçmiş, şimdi ve olası yön arasında duygusal bağ ve anlamlı bir hikâye kur.
- Kartların uyumunu, gerilimini, ortak temasını ve düz/ters oluşlarını birlikte yorumla.
- Kart isimlerini doğal biçimde söyle; anlamları tekrarlamak yerine sentez yap.
- Belirli bir soru varsa o bağlamda yorumla; soru yoksa genel açılım yap.
- Üçüncü kartı kesin gelecek bilgisi olarak sunma; olasılık ve tavsiye dili kullan.
- Ölüm, hastalık veya aldatılma gibi konularda kesin hüküm verme. Kesin tarih, garanti veya uydurma bilgi verme.
- Kısa giriş, bütünlüklü yorum ve akılda kalan kapanış olsun. Başlık, madde, emoji veya kart listesi yazma; yalnızca seslendirilecek metni ver.`;
}

function validAnswer(text) {
  const words = (text || "").trim().split(/\s+/).filter(Boolean).length;
  return words >= 55 && words <= 125;
}

async function generateWithGemini(prompt, apiKey, models) {
  for (const model of models) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 280, temperature: 0.72 }
        }),
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) continue;
      const data = await response.json();
      const answer = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join(" ").trim();
      if (validAnswer(answer)) return answer;
    } catch {
      // Try the next configured model.
    }
  }
  return null;
}

async function generateWithOpenAI(prompt, apiKey, model) {
  if (!apiKey || !model) return null;
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, input: prompt, max_output_tokens: 280 }),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) return null;
    const data = await response.json();
    const answer = data.output_text?.trim();
    return validAnswer(answer) ? answer : null;
  } catch {
    return null;
  }
}

export async function createThreeCardReading({ username = "", question = "" } = {}) {
  const cards = pickThreeCards();
  const prompt = buildPrompt(username, question, cards);
  const provider = (process.env.AI_PROVIDER || "gemini").toLowerCase();
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const openaiModel = process.env.OPENAI_MODEL || "gpt-6-luna";
  const geminiModels = (process.env.GEMINI_MODELS || "gemini-3.5-flash,gemini-3.7-flash,gemini-3.8-flash")
    .split(",").map((model) => model.trim()).filter(Boolean);

  let answer = null;
  if (provider === "openai") {
    answer = await generateWithOpenAI(prompt, openaiKey, openaiModel);
    if (!answer && geminiKey) answer = await generateWithGemini(prompt, geminiKey, geminiModels);
  } else {
    if (geminiKey) answer = await generateWithGemini(prompt, geminiKey, geminiModels);
    if (!answer && openaiKey) answer = await generateWithOpenAI(prompt, openaiKey, openaiModel);
  }

  const source = answer ? "ai" : "local-fallback";
  if (!answer) answer = localSynthesis(cards, username);
  return { cards, answer, source };
}

export { pickThreeCards };
