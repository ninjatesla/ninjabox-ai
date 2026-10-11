import { TAROT_DECK } from "./tarotDeck.js";

const POSITION_NAMES = ["GEÇMİŞ", "ŞİMDİ", "OLASI YÖN"];
const OPENINGS = ["Kartların hikâyesi geçmişten bugüne uzanan bir izle başlıyor.", "Bu açılımda üç kartı ayrı ayrı değil, birbirine bağlanan bir hikâye olarak okuyalım.", "İlk kart arka plandaki etkiyi, ikinci kart bugünün düğümünü, üçüncü kart ise önündeki seçeneği gösteriyor.", "Burada öne çıkan şey, üç kart arasındaki değişim."];
const ENDINGS = ["Buradaki kilit nokta, sözlerden çok davranışlarda gördüğün tutarlılık.", "Bu açılımın en güçlü mesajı, eski alışkanlığı tekrar etmek yerine yeni bir seçim yapman.", "Önündeki yolu belirleyecek şey, hangi ihtiyaca öncelik verdiğin.", "Şimdi dikkatini dağıtan ayrıntılardan çok, tekrar eden ana meseleye odaklan.", "Bu üç kartın ortak çizgisi, önce ne istediğini netleştirip sonra adım atman.", "Kararını verirken hem hislerini hem de elindeki somut işaretleri birlikte değerlendir."];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function pickThreeCards() {
  const deck = [...TAROT_DECK];
  const cards = [];
  while (cards.length < 3 && deck.length) {
    const index = Math.floor(Math.random() * deck.length);
    const [card] = deck.splice(index, 1);
    const orientation = Math.random() < 0.28 ? "reversed" : "upright";
    cards.push({ ...card, orientation, meaning: orientation === "reversed" ? card.reversed : card.upright, position: ["past", "present", "direction"][cards.length] });
  }
  return cards;
}

function localSynthesis(cards, username, question) {
  const [past, present, direction] = cards;
  const intro = pick(OPENINGS);
  const relation = past.arcana === present.arcana ? "Geçmişle bugün aynı türden bir temayı büyütüyor" : "Geçmişteki etkiyle bugünkü durum aynı biçimde ilerlemiyor";
  const tension = past.orientation !== present.orientation ? "Düz ve ters enerjinin yan yana gelmesi, bir yanının ilerlemek isterken diğer yanının hâlâ eski meseleye takıldığını düşündürüyor" : "İlk iki kartın benzer yönü, bu konunun bir süredir aynı çizgide ilerlediğini anlatıyor";
  const questionLine = question ? `Sorduğun konu açısından, ${present.name} şu anda ${present.meaning.toLowerCase()} temasını öne çıkarıyor.` : `Şimdiki durumda ${present.name}, ${present.meaning.toLowerCase()} temasını öne çıkarıyor.`;
  const end = pick(ENDINGS.filter(x => !x.includes("kesin") && !x.includes("olasılık")));
  return `${username ? username + ", " : ""}${intro} Geçmişte ${past.name} kartı ${past.meaning.toLowerCase()} temasını taşıyor. ${questionLine} ${relation}; ${tension.toLowerCase()}. Önündeki yönü anlatan ${direction.name} ise ${direction.meaning.toLowerCase()} vurgusu yapıyor. ${end}`;
}

function buildPrompt(username, question, cards) {
  const cardLines = cards.map((card, index) => `${index + 1}. ${POSITION_NAMES[index]} — ${card.name} (${card.orientation === "reversed" ? "TERS" : "DÜZ"}); anlamı: ${card.meaning}; arkana: ${card.arcana}.`).join("\n");
  return `NinjaBox canlı yayını için Türkçe, doğal ve doğrudan konuşan bir tarot yorumcususun. Her yanıt yeni ve kendine özgü olsun; ezberlenmiş kalıp kullanma.
İzleyici: ${username || "izleyici"}
Soru: ${question || "Genel üç kart açılımı"}
Kartlar:
${cardLines}

YAZIM GÖREVİ:
- 65-95 kelime; tek parça, sesli okunmaya uygun, sıcak ve anlaşılır Türkçe.
- Üç kartı listeleme. Geçmişteki tema bugünkü durumu nasıl etkiliyor ve üçüncü kartın teması bu hikâyeyi nasıl değiştiriyor, bunu yorumla.
- Kartların gerçek isimlerini ve anlamlarını kullan; birbirine uymayan genel tavsiyeler ekleme.
- Her seferinde farklı bir giriş, cümle ritmi ve kapanış seç. Aynı cümleyi tekrarlama; “kartların ortak tavsiyesi”, “somut ve dengeli bir adım”, “bu kesin bir sonuç değil”, “geleceği garanti etmez” gibi otomatik kalıpları kullanma.
- Kullanıcı belirli soru yazdıysa doğrudan o konuya cevap ver. Soru yoksa genel açılım yap.
- Üçüncü kartı “kesin olacak” diye sunma ama sürekli uyarı cümlesi de ekleme. Yorumu doğal biçimde bitir.
- Sağlık, ölüm, aldatma, para veya ilişki hakkında uydurma kesinlik üretme.
Yalnızca seslendirilecek yorum metnini yaz; başlık veya madde işareti koyma.`;
}

function validAnswer(text) {
  const words = (text || "").trim().split(/\s+/).filter(Boolean).length;
  return words >= 48 && words <= 125;
}

async function generateWithGemini(prompt, apiKey, models) {
  for (const model of models) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 300, temperature: 0.88, topP: 0.94 } }),
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) continue;
      const data = await response.json();
      const answer = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join(" ").trim();
      if (validAnswer(answer)) return answer;
    } catch {}
  }
  return null;
}

async function generateWithOpenAI(prompt, apiKey, model) {
  if (!apiKey || !model) return null;
  try {
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, input: prompt, max_output_tokens: 300 },), signal: AbortSignal.timeout(10000) });
    if (!response.ok) return null;
    const data = await response.json(); const answer = data.output_text?.trim();
    return validAnswer(answer) ? answer : null;
  } catch { return null; }
}

export async function createThreeCardReading({ username = "", question = "" } = {}) {
  const cards = pickThreeCards(); const prompt = buildPrompt(username, question, cards);
  const provider = (process.env.AI_PROVIDER || "gemini").toLowerCase();
  const geminiKey = process.env.GEMINI_API_KEY; const openaiKey = process.env.OPENAI_API_KEY; const openaiModel = process.env.OPENAI_MODEL || "gpt-6-luna";
  const geminiModels = (process.env.GEMINI_MODELS || "gemini-3.5-flash,gemini-3.7-flash,gemini-3.8-flash").split(",").map(x => x.trim()).filter(Boolean);
  let answer = null;
  if (provider === "openai") { answer = await generateWithOpenAI(prompt, openaiKey, openaiModel); if (!answer && geminiKey) answer = await generateWithGemini(prompt, geminiKey, geminiModels); }
  else { if (geminiKey) answer = await generateWithGemini(prompt, geminiKey, geminiModels); if (!answer && openaiKey) answer = await generateWithOpenAI(prompt, openaiKey, openaiModel); }
  const source = answer ? "ai" : "local-fallback";
  if (!answer) answer = localSynthesis(cards, username, question);
  return { cards, answer, source };
}
export { pickThreeCards };
