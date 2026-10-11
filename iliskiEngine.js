import { TAROT_DECK } from "./tarotDeck.js";

const POSITIONS = [
  { key: "feelings", label: "DUYGULAR" },
  { key: "thoughts", label: "DÜŞÜNCELER" },
  { key: "hidden", label: "GİZLİ DİNAMİKLER" },
  { key: "obstacle", label: "ENGEL" },
  { key: "direction", label: "OLASI YÖN" }
];

const pick = (items) => items[Math.floor(Math.random() * items.length)];

function drawRelationshipCards() {
  const deck = [...TAROT_DECK];
  const cards = [];
  while (cards.length < POSITIONS.length && deck.length) {
    const index = Math.floor(Math.random() * deck.length);
    const [card] = deck.splice(index, 1);
    const orientation = Math.random() < 0.28 ? "reversed" : "upright";
    const position = POSITIONS[cards.length];
    cards.push({
      id: card.id,
      name: card.name,
      image: card.image,
      arcana: card.arcana,
      orientation,
      meaning: orientation === "reversed" ? card.reversed : card.upright,
      position: position.key,
      positionLabel: position.label
    });
  }
  return cards;
}

function localRelationshipSynthesis(username, cards) {
  const [feelings, thoughts, hidden, obstacle, direction] = cards;
  const openings = [
    "Bu açılımda ilişkinin duygusal tarafıyla davranışların aynı şeyi söyleyip söylemediğine bakıyoruz.",
    "Kartlar, bu konuda tek bir işaretten çok beş farklı temanın birbirini nasıl etkilediğini anlatıyor.",
    "Bu ilişkinin hikâyesinde önce duyguları, sonra iletişimi ve önündeki olası yönü birlikte ele alalım.",
    "Burada önemli olan yalnızca hisler değil; iki tarafın nasıl davrandığı ve neye hazır olduğu."
  ];
  const closings = [
    "En sağlıklı ölçü, söylenen sözlerin zaman içinde tutarlı davranışlarla desteklenmesi.",
    "Kendini bekleyişte kaybetme; ne istediğini açıkça belirleyip karşı tarafın gerçek davranışlarını gözlemle.",
    "İletişim kuracaksan sakin, açık ve sınırlarını koruyan bir yaklaşım seç.",
    "Bu tabloyu tek başına bir karar gibi görme; kendi deneyimin ve somut işaretlerinle birlikte değerlendir."
  ];
  const contrast = feelings.orientation === thoughts.orientation
    ? "Duygular ve düşünceler benzer yönde ilerliyor gibi okunabilir"
    : "Duygusal isteklerle zihinsel kararlar arasında bir gerilim olabileceği görülüyor";
  const obstacleLine = /kapan|yalnız|gecik|bekle|belirsiz|kork|engel|çatış|dengesiz|güven/i.test(obstacle.meaning)
    ? `Engel kartı olan ${obstacle.name}, ${obstacle.meaning.toLocaleLowerCase("tr-TR")} temasını öne çıkarıyor.`
    : `Engel kartı ${obstacle.name}, ilişkinin ilerlemesinde dikkat edilmesi gereken ${obstacle.meaning.toLocaleLowerCase("tr-TR")} temasını hatırlatıyor.`;
  return `${username ? username + ", " : ""}${pick(openings)} Duygular alanındaki ${feelings.name} ${feelings.meaning.toLocaleLowerCase("tr-TR")} temasını taşırken, düşünceler alanındaki ${thoughts.name} ${thoughts.meaning.toLocaleLowerCase("tr-TR")} vurgusu yapıyor. ${contrast}. Gizli dinamiklerde ${hidden.name} kartı ${hidden.meaning.toLocaleLowerCase("tr-TR")} konusuna dikkat çekiyor. ${obstacleLine} Olası yönü gösteren ${direction.name} ise ${direction.meaning.toLocaleLowerCase("tr-TR")} temasını öne çıkarıyor. ${pick(closings)}`;
}

function buildPrompt(username, cards) {
  const cardLines = cards.map((card, i) =>
    `${i + 1}. ${card.positionLabel}: ${card.name} (${card.orientation === "reversed" ? "TERS" : "DÜZ"}); anlam: ${card.meaning}.`
  ).join("\n");
  return `NinjaBox canlı yayını için deneyimli, empatik ve doğal bir Türkçe ilişki Tarot yorumcususun.
İzleyici: ${username || "izleyici"}
İzleyicinin özel bir sorusu yok; sohbete yalnızca "ilişki" yazarak genel ilişki açılımı istedi. Bu nedenle belirli bir partner, eski sevgili, cinsiyet, evlilik durumu veya olay uydurma. Her tür ilişki durumuna uygulanabilecek ama somut kart bağlantıları kuran genel bir yorum yaz.

Beş kart:
${cardLines}

YORUM KURALLARI:
- 70-105 kelime, tek akışta ve sesli okunmaya uygun, sıcak Türkçe.
- Beş kartı madde madde sayma; kartları birbiriyle ilişkilendirerek tek bir hikâye oluştur.
- Duygular, düşünceler/niyetler, belirsiz veya söylenmeyen dinamikler, engel ve olası yön/tavsiye temalarının beşini de ele al.
- Kart adlarını ve verilen anlamları doğru kullan; her kartın düz/ters konumunu anlamına göre dikkate al.
- Sonucu olumlu/karmaşık/zorlayıcı olarak açıkça çerçevele ama kesin gelecek iddiasında bulunma.
- Karşı tarafın zihnini bildiğini iddia etme; "kesin seviyor", "aldatıyor", "kesin dönecek" deme. Gizli dinamik kartını kanıtsız suçlamaya dönüştürme.
- Barışma, ayrılık, sadakat, kıskançlık veya evlilik hakkında bağlam verilmediği için bunlardan biri olmuş gibi davranma.
- Genel ve tekrar eden boş tavsiyeler yerine kartların arasındaki ilişkiyi açıkla. Aynı giriş/kapanış kalıplarını tekrarlama.
- Son cümlede bir kısa, uygulanabilir öneri ver.
Yalnızca yorum metnini yaz; başlık, madde veya teknik açıklama ekleme.`;
}

function validAnswer(text) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean).length;
  return words >= 45 && words <= 135;
}

async function generateGemini(prompt, apiKey, models) {
  if (!apiKey) return null;
  for (const model of models) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 340, temperature: 0.9, topP: 0.94 }
          }),
          signal: AbortSignal.timeout(10000)
        }
      );
      if (!response.ok) continue;
      const data = await response.json();
      const answer = data.candidates?.[0]?.content?.parts?.map(part => part.text || "").join(" ").trim();
      if (validAnswer(answer)) return answer;
    } catch {}
  }
  return null;
}

async function generateOpenAI(prompt, apiKey, model) {
  if (!apiKey) return null;
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, input: prompt, max_output_tokens: 340 }),
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

export function pickRelationshipCards() {
  return drawRelationshipCards();
}

export async function createRelationshipReading({ username = "" } = {}) {
  const cards = drawRelationshipCards();
  const prompt = buildPrompt(username, cards);
  const provider = (process.env.AI_PROVIDER || "gemini").toLowerCase();
  const apiKeyGemini = process.env.GEMINI_API_KEY;
  const models = (process.env.GEMINI_MODELS || "gemini-3.5-flash,gemini-3.7-flash,gemini-3.8-flash")
    .split(",").map(value => value.trim()).filter(Boolean);
  const apiKeyOpenAI = process.env.OPENAI_API_KEY;
  const openAIModel = process.env.OPENAI_MODEL || "gpt-6-luna";

  let answer = null;
  if (provider === "openai") {
    answer = await generateOpenAI(prompt, apiKeyOpenAI, openAIModel);
    if (!answer) answer = await generateGemini(prompt, apiKeyGemini, models);
  } else {
    answer = await generateGemini(prompt, apiKeyGemini, models);
    if (!answer) answer = await generateOpenAI(prompt, apiKeyOpenAI, openAIModel);
  }

  if (!answer) answer = localRelationshipSynthesis(username, cards);
  return { cards, answer, source: answer ? "ai-or-local-fallback" : "safe-fallback" };
}
