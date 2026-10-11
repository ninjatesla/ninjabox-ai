import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import {
  TikTokLiveConnection,
  WebcastEvent,
  ControlEvent
} from "tiktok-live-connector";
import { drawOneCard } from "./tarotEngine.js";
import { getLocalTarotAnswer } from "./tarotFallback.js";
import { createMagicMessage } from "./magicMessageEngine.js";
import { parseBurcInput, generateBurcCommentary } from "./burcEngine.js";
import { createThreeCardReading, pickThreeCards } from "./3kart.js";
import { createRelationshipReading, pickRelationshipCards } from "./iliskiEngine.js";

const app = express();
app.use(express.static("."));
const PORT = process.env.PORT || 3000;
const TIKTOK_USERNAME = "ninjacoretrader";

const AI_PROVIDER =
  (process.env.AI_PROVIDER || "gemini").toLowerCase();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL =
  process.env.OPENAI_MODEL || "gpt-6-luna";

const GEMINI_MODELS = (
  process.env.GEMINI_MODELS ||
  "gemini-3.5-flash,gemini-3.7-flash,gemini-3.8-flash"
)
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

let tiktokConnection = null;
let tiktokConnected = false;

const questionQueue = [];
let processingQuestion = false;
let questionId = 0;
let waitingForClientCompletion = null;
let completionSafetyTimer = null;
let activeBurcRequest = null;
let burcInputTimer = null;

// CHAT filtresi: sohbet, sıra, bedava bakma ve provokasyon mesajlarını
// Tarot kuyruğuna almadan önce ayıklar. Ses/yanıt akışına dokunmaz.
const recentQuestionKeys = new Map();
const DEDUPE_WINDOW_MS = 90 * 1000;

function normalizeTurkishText(value = "") {
  return String(value)
    .toLocaleLowerCase("tr-TR")
    .replace(/[ıİ]/g, "i")
    .replace(/[ğĞ]/g, "g")
    .replace(/[üÜ]/g, "u")
    .replace(/[şŞ]/g, "s")
    .replace(/[öÖ]/g, "o")
    .replace(/[çÇ]/g, "c")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function classifyChatMessage(message) {
  const text = normalizeTurkishText(message);
  if (!text) return { accept: false, reason: "EMPTY" };

  const freebiePatterns = [
    /\b(bedava|bele[sş]|ucretsiz|parasiz|hediyesiz)\b/,
    /\b(kac|kac tane|kaclik) (begeni|like|paylasim|takip)\b/,
    /\b(begeni|like|paylasim|takip) atsam\b/,
    /\b(paylasirsam|paylasim yaparsam|takip etsem|begeni yaparsam)\b/,
    /\b(bakar misin|bakabilir misin|falima bak|tarot bak)\b/
  ];
  const freebieContext = hasAny(text, freebiePatterns) &&
    hasAny(text, [/\b(bedava|bele[sş]|ucretsiz|parasiz|hediyesiz)\b/, /\b(begeni|like|paylasim|takip|hediye|para)\b/]);
  if (freebieContext) return { accept: false, reason: "FREEBIE_REQUEST" };

  const provocationPatterns = [
    /\b(sallayabilir misiniz|sallayabilir misin|sallama|sallamasyon)\b/,
    /\b(kafadan atabilir misiniz|kafadan atiyor|kafadan atiyorsun)\b/,
    /\b(uyduruyor musunuz|uyduruyorsun|uydurma mi)\b/,
    /\b(herkese ayni seyi soyluyorsun|herkese ayni seyi soyluyorsunuz)\b/,
    /\b(bunlari nereden biliyorsun|bunlari nereden biliyorsunuz)\b/,
    /\b(atabilir misiniz|atabilir misin)\b/
  ];
  if (hasAny(text, provocationPatterns)) return { accept: false, reason: "PROVOCATION_TRUST" };

  const queuePatterns = [
    /\bsira var mi\b/, /\bsirada kac kisi\b/, /\b(tarot )?bekleyen kac kisi\b/,
    /\bsira bana geldi mi\b/, /\bsira bana gelir mi\b/, /\btarot sirasi\b/,
    /\bkac kisi kaldi\b/, /\bben sirada miyim\b/, /\bbeni ne zaman okuyacaksin\b/,
    /\bne zaman sira bana gelecek\b/
  ];
  const queueOnly = hasAny(text, queuePatterns);

  // Mesajda gerçek bir Tarot niyeti arıyoruz. mi/mı/mu/mü bitişik yazılsa da
  // normalize edilmiş metindeki desenler yakalar; ayrıca soru kelimeleri ve
  // ilişki/iş/eğitim fiilleri kontrol edilir.
  const questionMarkers = [
    /\b(mi|mu|m[uü]|m[iı])\b/, /\b(ne|neden|niye|nasil|nasil|nerede|nereye|nerden|nereden|ne zaman|kiminle|kimle|kime|kimin|kac|hangi|hangisi)\b/,
    /\b(olacak|olur|olur mu|olacak mi|olacak mi|yapar|yapacak|eder|edecek|gelir|gelecek|doner|donecek|arar|arayacak|yazar|yazacak|mesaj atar|sever|seviyor|sevdi|sevdi mi|evlenir|evlenecek|barisir|barisacak|aldatiyor|aldatir|pisman|bulur|bulabilecek|bulabilir|girer|girecek|alinir|kazanir|kazanacak|yerlesir|yerlesecek|terfi alir|basarili olur|engelini acar|engelimi kaldirir|sakliyor|hissediyor|dusunuyor|ozluyor|kiskaniyor|alabilecek|alabilir|satilir|satilabilir|satabilecek|sahip olur|sahibi olur)\b/
  ];
  const questionShape = hasAny(text, questionMarkers) || /\b[a-z]+(mi|mu|m[iı])\b/.test(text);

  const tarotTopics = [
    /\b(beni sev|seviyor|ask|iliski|baris|ayril|aldat|ihanet|evli|evlen|eski sevgili|geri don|geri gel|ara|arayacak|mesaj|yazacak|engel|pisman|ozle|kiskan|bulus|gorus|sakliyor|hissediyor|dusunuyor)/,
    /\b(is|kariyer|meslek|ise gir|is bul|is hayat|basvuru|terfi|patron|sinav|yks|universite|bolum|okul|kazan|yerles|egitim)/,
    /\b(para|maddi|borc|gelir|kazanc|yatirim|gelecek|hayatim|ne olacak|sonuc|tasini)/
  ];

  // Mal & mülk: ev, villa, araba, arsa/tarla ve pahalı ürün alım-satımı.
  // Kişinin kendisi veya yakını için sorduğu soruları da kapsar.
  const propertyTopics = [
    /\b(ev|villa|daire|konut|araba|otomobil|arac|iphone|telefon|arsa|arsam|tarla|tarlam|tapu|mal mulk|ev sahibi|arac sahibi)\b/,
    /\b(alabilecek|alabilir|almak|alacak|alir|satilir|satabilecek|satabilir|satmak|satar|sahip olacak|ev sahibi olacak)\b/
  ];
  const hasTarotTopic =
    hasAny(text, tarotTopics) || hasAny(text, propertyTopics);

  // Sadece yakınma/sohbet değil, soru biçimi veya açık bir Tarot soru fiili olmalı.
  const explicitTarotQuestion = hasTarotTopic && questionShape;
  if (queueOnly && !explicitTarotQuestion) return { accept: false, reason: "QUEUE_STATUS" };
  if (!explicitTarotQuestion) return { accept: false, reason: "NOT_A_TAROT_QUESTION" };

  return { accept: true, reason: "TAROT_QUESTION", normalized: text };
}

function isDuplicateQuestion(username, normalizedQuestion) {
  const now = Date.now();
  for (const [key, timestamp] of recentQuestionKeys) {
    if (now - timestamp > DEDUPE_WINDOW_MS) recentQuestionKeys.delete(key);
  }
  const key = `${normalizeTurkishText(username || "anon")}::${normalizedQuestion}`;
  const previous = recentQuestionKeys.get(key);
  if (previous && now - previous <= DEDUPE_WINDOW_MS) return true;
  recentQuestionKeys.set(key, now);
  return false;
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "NinjaBox AI LIVE",
    tiktok: "@" + TIKTOK_USERNAME,
    connected: tiktokConnected,
    aiProvider: AI_PROVIDER,
    geminiConfigured: !!GEMINI_API_KEY,
    openaiConfigured: !!OPENAI_API_KEY,
    geminiModels: GEMINI_MODELS
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    tiktokConnected,
    aiProvider: AI_PROVIDER,
    geminiConfigured: !!GEMINI_API_KEY,
    openaiConfigured: !!OPENAI_API_KEY,
    geminiModels: GEMINI_MODELS
  });
});

const server = app.listen(PORT, () => {
  console.log("NinjaBox AI LIVE running on port " + PORT);
  console.log("AI Provider:", AI_PROVIDER);
  console.log("Gemini models:", GEMINI_MODELS.join(" -> "));
  console.log("Gemini configured:", !!GEMINI_API_KEY);
  console.log("OpenAI configured:", !!OPENAI_API_KEY);
});

const wss = new WebSocketServer({ server });
const clients = new Set();

function broadcast(event) {
  const message = JSON.stringify(event);

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

wss.on("connection", (socket) => {
  clients.add(socket);

  socket.send(
    JSON.stringify({
      type: "status",
      tiktokConnected
    })
  );

  socket.on("message", (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      if ((message.type === "tarot_finished" || message.type === "magic_finished" || message.type === "burc_finished" || message.type === "threecard_finished" || message.type === "iliski_finished") &&
          waitingForClientCompletion !== null &&
          Number(message.questionId) === Number(waitingForClientCompletion)) {
        console.log("QUEUE: Ses ve 15 saniyelik ekran süresi tamamlandı:", message.questionId);
        waitingForClientCompletion = null;
        if (message.type === "burc_finished") {
          if (burcInputTimer) { clearTimeout(burcInputTimer); burcInputTimer = null; }
          activeBurcRequest = null;
        }
        if (completionSafetyTimer) {
          clearTimeout(completionSafetyTimer);
          completionSafetyTimer = null;
        }
        processingQuestion = false;
        if (questionQueue.length > 0) setTimeout(processQuestionQueue, 100);
      }
    } catch (error) {
      console.error("WebSocket mesajı okunamadı:", error.message);
    }
  });

  socket.on("close", () => {
    clients.delete(socket);
  });
});

function buildTarotPrompt(
  username,
  question,
  card,
  orientation
) {
  const meaning =
    orientation === "upright"
      ? card.upright
      : card.reversed;

  return `
Sen deneyimli, sezgisel ve geleneksel Tarot yorumcususun.

Canlı yayında çok kısa ve doğal cevaplar veriyorsun.

Kurallar:
- Türkçe cevap ver.
- Soruyu doğrudan yorumla.
- Kartın klasik Tarot anlamını temel al.
- Düz/ters konumunu mutlaka dikkate al.
- Kart anlamını sorunun bağlamına uygula.
- Genel ve boş cümleler kurma.
- Korkutucu veya aşırı kesin ifadeler kullanma.
- "Kesin olacak", "kesin dönecek", "mutlaka gerçekleşecek" gibi garanti ifadeleri kullanma.
- Soruyu dolandırma.
- Kart olumluysa olumlu sonucu açıkça söyle.
- Kart olumsuzsa olumsuz sonucu açıkça söyle.
- Örneğin "Mehmet'le barışacak mıyım?" sorusunda kart barışmayı destekliyorsa barışma yönünü açıkça söyle.
- Kart desteklemiyorsa yakın zamanda barışma görünmediğini açıkça söyle.
- Kullanıcının adını yalnızca doğal ve anlamlı olduğu durumda kullan.
- Kullanıcı adını tek başına cevap olarak verme.
- Kullanıcı adı cevabın içeriğinin yerine geçmesin.
- 1-3 kısa cümle kullan.
- Cevap canlı yayında seslendirilecek.
- Fazla açıklama yapma.

Kullanıcı:
${username}

Soru:
${question}

Kart:
${card.name}

Kart konumu:
${orientation === "upright" ? "Düz" : "Ters"}

Kartın temel anlamı:
${meaning}

Şimdi soruya doğrudan cevap veren,
kartın anlamını soruyla ilişkilendiren,
kısa ve doğal bir Tarot yorumu yaz.

Sadece yorumu yaz.
`;
}

function isValidAIAnswer(answer, cardName) {
  if (!answer || typeof answer !== "string") return false;

  const clean = answer.trim();

  if (clean.length < 20 || clean.length > 500) {
    return false;
  }

  const lower = clean.toLowerCase();
  const cardLower =
    String(cardName || "").toLowerCase();

  if (cardLower && lower === cardLower) {
    return false;
  }

  const badExact = [
    "ninjac",
    "kılıç",
    "değnek",
    "kupa",
    "tılsım",
    "no scary",
    "no overly"
  ];

  if (badExact.includes(lower)) {
    return false;
  }

  return true;
}

async function generateGeminiTarotAnswer(
  username,
  question,
  card,
  orientation
) {
  if (!GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is not configured."
    );
  }

  const prompt = buildTarotPrompt(
    username,
    question,
    card,
    orientation
  );

  let lastError = null;

  for (const model of GEMINI_MODELS) {
    try {
      console.log(
        "AI: Gemini model deneniyor:",
        model
      );

      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

      const response = await fetch(url, {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],

          generationConfig: {
  maxOutputTokens: 500,
  temperature: 0.8,
  thinkingConfig: {
    thinkingLevel: "low"
  }
}
        })
      });

      if (response.ok) {
        const data = await response.json();
        
        const finishReason =
  data.candidates?.[0]?.finishReason;

console.log(
  "AI: Gemini finishReason:",
  model,
  finishReason
);

if (
  finishReason &&
  finishReason !== "STOP"
) {
  lastError = new Error(
    `Gemini ${model} tamamlanmadı: ${finishReason}`
  );

  console.log(
    "AI: Yarım cevap reddedildi, sıradaki Gemini modeline geçiliyor."
  );

  continue;
}
        const answer =
          data.candidates?.[0]?.content?.parts
            ?.map((part) => part.text || "")
            .join("")
            .trim();

        if (
          isValidAIAnswer(
            answer,
            card.name
          )
        ) {
          console.log(
            "AI: Gemini başarılı:",
            model
          );

          return answer;
        }

        lastError = new Error(
          `Gemini ${model} geçersiz/yarım cevap döndürdü.`
        );

        console.log(
          "AI: Geçersiz cevap, sıradaki Gemini modeline geçiliyor."
        );

        continue;
      }

      const errorText =
        await response.text();

      lastError = new Error(
        `Gemini ${model} API error ${response.status}: ${errorText}`
      );

      console.error(
        "AI: Gemini model başarısız:",
        model,
        response.status
      );

      if (
        response.status === 429 ||
        response.status === 500 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504 ||
        errorText.includes("UNAVAILABLE") ||
        errorText.includes("RESOURCE_EXHAUSTED")
      ) {
        continue;
      }

      throw lastError;

    } catch (error) {
      lastError = error;

      console.error(
        "AI: Gemini model hatası:",
        model,
        error.message || error
      );

      continue;
    }
  }

  throw lastError ||
    new Error(
      "Tüm Gemini modelleri başarısız oldu."
    );
}

async function generateOpenAITarotAnswer(
  username,
  question,
  card,
  orientation
) {
  if (!OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is not configured."
    );
  }

  const prompt = buildTarotPrompt(
    username,
    question,
    card,
    orientation
  );

  const response = await fetch(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "Authorization":
          `Bearer ${OPENAI_API_KEY}`
      },

      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: prompt,
        max_output_tokens: 180
      })
    }
  );

  if (!response.ok) {
    const errorText =
      await response.text();

    throw new Error(
      `OpenAI API error ${response.status}: ${errorText}`
    );
  }

  const data =
    await response.json();

  const answer =
    data.output_text?.trim();

  if (
    !isValidAIAnswer(
      answer,
      card.name
    )
  ) {
    throw new Error(
      "OpenAI geçersiz/yarım cevap döndürdü."
    );
  }

  return answer;
}

async function generateTarotAnswer(
  username,
  question,
  card,
  orientation
) {
  if (AI_PROVIDER === "gemini") {
    console.log(
      "AI: Gemini fallback sistemi başlatılıyor."
    );

    try {
      return await generateGeminiTarotAnswer(
        username,
        question,
        card,
        orientation
      );
    } catch (geminiError) {
      console.error(
        "AI: Tüm Gemini modelleri başarısız:",
        geminiError.message || geminiError
      );

      if (OPENAI_API_KEY) {
        console.log(
          "AI: OpenAI fallback devreye giriyor."
        );

        return await generateOpenAITarotAnswer(
                    username,
          question,
          card,
          orientation
        );
      }

      throw geminiError;
    }
  }

  if (AI_PROVIDER === "openai") {
    console.log(
      "AI: OpenAI kullanılıyor."
    );

    return await generateOpenAITarotAnswer(
      username,
      question,
      card,
      orientation
    );
  }

  throw new Error(
    `Unknown AI_PROVIDER: ${AI_PROVIDER}`
  );
}

async function resolveBurcRequest(session, parsed) {
  if (!session || session.resolved || Number(waitingForClientCompletion) !== Number(session.id)) return;
  session.resolved = true;
  if (burcInputTimer) { clearTimeout(burcInputTimer); burcInputTimer = null; }

  let answer;
  let source = "no-input";
  if (!parsed) {
    answer = `${session.username}, burç bilgini bu kez alamadım. Yorumunu hazırlayabilmem için burcunu sohbete yazabilirsin. Bir sonraki turda yeniden deneyebiliriz.`;
  } else {
    try {
      const result = await generateBurcCommentary({
        username: session.username,
        sunSign: parsed.sunSign,
        risingSign: parsed.risingSign,
        geminiApiKey: GEMINI_API_KEY,
        geminiModels: GEMINI_MODELS,
        openaiApiKey: OPENAI_API_KEY,
        openaiModel: OPENAI_MODEL
      });
      answer = result.answer;
      source = result.source;
      console.log("BURÇ: Efemeris yorum kaynağı:", source, "| Güneş:", parsed.sunSign, "| Yükselen:", parsed.risingSign || "belirtilmedi");
    } catch (error) {
      console.error("BURÇ: Yorum oluşturulamadı:", error.message || error);
      answer = `${session.username}, ${parsed.sunSign} burcunun temel teması kendi güçlü yönlerini fark etmek ve önceliklerini netleştirmek. İlişkilerde açık iletişim kur, iş hedeflerinde küçük ve düzenli adımlara odaklan. Bu yorum genel astrolojik bir çerçevedir; kesin bir gelecek tahmini değildir.`;
      source = "safe-fallback";
    }
  }

  if (Number(waitingForClientCompletion) !== Number(session.id)) return;
  broadcast({
    type: "burc_answer",
    questionId: session.id,
    username: session.username,
    sunSign: parsed?.sunSign || null,
    risingSign: parsed?.risingSign || null,
    answer,
    source
  });
}

async function processQuestionQueue() {
  if (processingQuestion) return;

  const item = questionQueue.shift();

  if (!item) return;

  processingQuestion = true;

  console.log(
    "QUEUE: İşleniyor:",
    item.kind === "magic" ? "SİHİRLİ MESAJ" : item.username,
    "=>",
    item.question || "Sihirli Mesaj"
  );

  try {
    if (item.kind === "burc") {
      activeBurcRequest = {
        id: item.id,
        username: item.username,
        nickname: item.nickname,
        startedAt: Date.now(),
        resolved: false
      };
      waitingForClientCompletion = item.id;
      broadcast({ type: "burc_start", questionId: item.id, username: item.username });
      if (completionSafetyTimer) clearTimeout(completionSafetyTimer);
      completionSafetyTimer = setTimeout(() => {
        if (Number(waitingForClientCompletion) === Number(item.id)) {
          console.log("QUEUE: Burç güvenlik zaman aşımı, kuyruk açılıyor:", item.id);
          waitingForClientCompletion = null;
          completionSafetyTimer = null;
          activeBurcRequest = null;
          if (burcInputTimer) { clearTimeout(burcInputTimer); burcInputTimer = null; }
          processingQuestion = false;
          if (questionQueue.length > 0) setTimeout(processQuestionQueue, 100);
        }
      }, 180000);
      if (burcInputTimer) clearTimeout(burcInputTimer);
      burcInputTimer = setTimeout(() => {
        if (activeBurcRequest && Number(activeBurcRequest.id) === Number(item.id) && !activeBurcRequest.resolved) {
          resolveBurcRequest(activeBurcRequest, null).catch(error => console.error("BURÇ zaman aşımı yorumu hatası:", error.message));
        }
      }, 60000);
      console.log("BURÇ: Bilgi bekleniyor (60 sn):", item.username, "ID:", item.id);
      return;
    }

    if (item.kind === "magic") {
      const magic = createMagicMessage(item.username);
      broadcast({
        type: "magic_start",
        questionId: item.id,
        username: item.username
      });

      waitingForClientCompletion = item.id;
      if (completionSafetyTimer) clearTimeout(completionSafetyTimer);
      completionSafetyTimer = setTimeout(() => {
        if (Number(waitingForClientCompletion) === Number(item.id)) {
          console.log("QUEUE: Sihirli Mesaj zaman aşımı, kuyruk açılıyor:", item.id);
          waitingForClientCompletion = null;
          completionSafetyTimer = null;
          processingQuestion = false;
          if (questionQueue.length > 0) setTimeout(processQuestionQueue, 100);
        }
      }, 120000);

      broadcast({
        type: "magic_answer",
        questionId: item.id,
        username: item.username,
        answer: magic.answer
      });
      console.log("MAGIC: Sihirli Mesaj kuyruğa gönderildi:", item.username, magic.cardId, magic.orientation);
      return;
    }

    if (item.kind === "iliski") {
      broadcast({ type: "iliski_start", questionId: item.id, username: item.username });
      let reading = null;
      try {
        reading = await createRelationshipReading({ username: item.username });
      } catch (error) {
        console.error("İLİŞKİ: Motor hatası:", error.message || error);
      }
      if (!reading || !Array.isArray(reading.cards) || reading.cards.length !== 5) {
        const cards = pickRelationshipCards();
        reading = {
          cards,
          answer: `${item.username}, bu açılım duygular, düşünceler, belirsizlikler, engeller ve olası yönü birlikte ele alıyor. Kartlar kesin bir gelecek veya başka birinin zihnini kanıtlamaz; ilişkide sözlerle davranışların tutarlılığına ve açık iletişime dikkat et.`,
          source: "safe-fallback"
        };
      }

      waitingForClientCompletion = item.id;
      if (completionSafetyTimer) clearTimeout(completionSafetyTimer);
      completionSafetyTimer = setTimeout(() => {
        if (Number(waitingForClientCompletion) === Number(item.id)) {
          console.log("QUEUE: İlişki güvenlik zaman aşımı:", item.id);
          waitingForClientCompletion = null;
          completionSafetyTimer = null;
          processingQuestion = false;
          if (questionQueue.length > 0) setTimeout(processQuestionQueue, 100);
        }
      }, 120000);

      broadcast({
        type: "iliski_answer",
        questionId: item.id,
        username: item.username,
        cards: reading.cards,
        answer: reading.answer,
        source: reading.source
      });
      console.log("İLİŞKİ: Yorum hazırlandı:", item.username, reading.cards.map(card => card.name).join(" / "), reading.source);
      return;
    }

    if (item.kind === "threecard") {
      broadcast({ type: "threecard_start", questionId: item.id, username: item.username });
      let reading = null;
      try {
        // Motorun AI denemeleri 12 saniyeyi aşabilir. Erken kesmek kartları
        // boş gönderip ekranda kırık görsel oluşmasına neden oluyordu.
        reading = await createThreeCardReading({ username: item.username, question: item.question || "" });
      } catch (error) {
        console.error("3 KART: Motor hatası:", error.message || error);
        const cards = pickThreeCards();
        reading = {
          cards,
          answer: `${item.username}, üç kartın mesajı geçmişten gelen etkileri, şu anki durumu ve önündeki olası yönü birlikte değerlendirmek. Bu kesin bir gelecek tahmini değil; sakin kalıp dengeli bir adım atman yararlı olabilir.`,
          source: "safe-fallback"
        };
      }

      if (!reading || !Array.isArray(reading.cards) || reading.cards.length !== 3) {
        const cards = pickThreeCards();
        reading = {
          cards,
          answer: `${item.username}, geçmişin etkisini, bugünkü durumunu ve olası yönünü birlikte ele alalım. Kartlar kesin gelecek bilgisi vermez; kararlarını değerlendirirken dengeli ve somut adımlara odaklan.`,
          source: "safe-fallback"
        };
      }

      waitingForClientCompletion = item.id;
      if (completionSafetyTimer) clearTimeout(completionSafetyTimer);
      completionSafetyTimer = setTimeout(() => {
        if (Number(waitingForClientCompletion) === Number(item.id)) {
          console.log("QUEUE: Üç kart güvenlik zaman aşımı:", item.id);
          waitingForClientCompletion = null;
          completionSafetyTimer = null;
          processingQuestion = false;
          if (questionQueue.length > 0) setTimeout(processQuestionQueue, 100);
        }
      }, 120000);

      broadcast({
        type: "threecard_answer",
        questionId: item.id,
        username: item.username,
        question: item.question || "Üç kart açılımı",
        cards: reading.cards,
        answer: reading.answer,
        source: reading.source
      });
      console.log("3 KART: Yorum hazırlandı:", item.username, (reading.cards || []).map(card => card.name).join(" / "), reading.source);
      return;
    }

    broadcast({
    type: "tarot_start",
    questionId: item.id,
    username: item.username,
    question: item.question,
    cardName: item.card.name,
    image: item.card.image,
    orientation: item.orientation,
    meaning: item.meaning
  });

    console.log(
      "AI: Tarot yorumu hazırlanıyor..."
    );

    let answer;

try {
  answer = await Promise.race([
    generateTarotAnswer(
      item.username,
      item.question,
      item.card,
      item.orientation
    ),

    new Promise((resolve) =>
      setTimeout(() => resolve(null), 10000)
    )
  ]);
} catch (error) {
  console.log("AI cevap hatası:", error.message);
  answer = null;
}

if (!answer) {
  console.log("AI 10 saniyede cevap vermedi. Yerel Tarot yorumu devrede.");

  const localResult = getLocalTarotAnswer({
    question: item.question,
    cardId: item.card.id,
    orientation: item.orientation
  });

  answer = localResult.answer;
}
    console.log(
      "AI ANSWER:",
      answer
    );

    waitingForClientCompletion = item.id;
    if (completionSafetyTimer) clearTimeout(completionSafetyTimer);
    // Güvenlik: tarayıcı kapanır veya ses bitiş mesajı gelmezse kuyruk kilitlenmesin.
    completionSafetyTimer = setTimeout(() => {
      if (Number(waitingForClientCompletion) === Number(item.id)) {
        console.log("QUEUE: Tamamlama zaman aşımı, kuyruk açılıyor:", item.id);
        waitingForClientCompletion = null;
        completionSafetyTimer = null;
        processingQuestion = false;
        if (questionQueue.length > 0) setTimeout(processQuestionQueue, 100);
      }
    }, 120000);

    broadcast({
      type: "tarot_answer",
      username: item.username,
      questionId: item.id,
      question: item.question,
      cardName: item.card.name,
      image: item.card.image,
      orientation: item.orientation,
      answer
    });

    console.log(
      "QUEUE: Tamamlandı:",
      item.username
    );
  } finally {
    // Cevap gönderildiyse tarayıcı seslendirmeyi bitirip 15 saniyelik
    // gösterim süresini tamamlayınca tarot_finished gönderir.
    if (Number(waitingForClientCompletion) !== Number(item.id)) {
      processingQuestion = false;
      if (questionQueue.length > 0) {
        setTimeout(processQuestionQueue, 250);
      }
    }
  }
}

function connectTikTok() {
  console.log(
    "Connecting to TikTok LIVE: @" +
      TIKTOK_USERNAME
  );

  tiktokConnection =
    new TikTokLiveConnection(
      TIKTOK_USERNAME,
      {
        processInitialData: false,
        fetchRoomInfoOnConnect: true
      }
    );

  tiktokConnection.on(
    ControlEvent.CONNECTED,
    (state) => {
      tiktokConnected = true;

      console.log(
        "================================"
      );

      console.log(
        "TIKTOK LIVE CONNECTED"
      );

      console.log(
        "Room ID:",
        state.roomId
      );

      console.log(
        "AI Provider:",
        AI_PROVIDER
      );

      console.log(
        "Gemini fallback:",
        GEMINI_MODELS.join(" -> ")
      );

      console.log(
        "================================"
      );

      broadcast({
        type: "status",
        tiktokConnected: true
      });
    }
  );

  tiktokConnection.on(
    ControlEvent.DISCONNECTED,
    () => {
      tiktokConnected = false;

      console.log(
        "TikTok LIVE disconnected."
      );

      broadcast({
        type: "status",
        tiktokConnected: false
      });

      setTimeout(
        connectTikTok,
        10000
      );
    }
  );

  tiktokConnection.on(
    ControlEvent.ERROR,
    (error) => {
      console.error(
        "TikTok error:",
        error
      );
    }
  );

  // =========================
  // CHAT
  // =========================

  tiktokConnection.on(
    WebcastEvent.CHAT,
    (data) => {
      const event = {
        type: "chat",
        username:
          data.user?.displayId,
        nickname:
          data.user?.nickname,
        userId:
          data.user?.id,
        comment:
          data.content,
        isModerator:
          data.userIdentity
            ?.isModeratorOfAnchor
      };

      if (!event.comment?.trim()) {
        return;
      }

      console.log(
        "CHAT:",
        event.username,
        "=>",
        event.comment
      );

      // =========================
      // AKTİF BURÇ OTURUMU: yalnızca sıradaki kişinin kendi mesajını kabul et
      // =========================
      if (activeBurcRequest && !activeBurcRequest.resolved) {
        const currentUser = normalizeTurkishText(event.username || event.nickname || "");
        const expectedUser = normalizeTurkishText(activeBurcRequest.username || activeBurcRequest.nickname || "");
        if (currentUser && expectedUser && currentUser === expectedUser) {
          const parsedBurc = parseBurcInput(event.comment);
          if (parsedBurc) {
            console.log("BURÇ: İzleyici bilgisi alındı:", activeBurcRequest.username, parsedBurc.sunSign, parsedBurc.risingSign || "yükselen yok");
            resolveBurcRequest(activeBurcRequest, parsedBurc).catch(error => console.error("BURÇ cevap hatası:", error.message || error));
            return;
          }
          if (normalizeTurkishText(event.comment) === "burc") {
            console.log("BURÇ: Aynı izleyicinin tekrar tetiklemesi atlandı:", activeBurcRequest.username);
            return;
          }
        }
      }

      // =========================
      // İLİŞKİ AÇILIMI TETİĞİ
      // Sohbete yalnızca "ilişki" yazılması beş kartlı ilişki motorunu kuyruğa alır.
      // =========================
      if (normalizeTurkishText(event.comment) === "iliski") {
        const item = {
          id: ++questionId,
          kind: "iliski",
          username: event.username || event.nickname || "izleyici",
          nickname: event.nickname,
          question: "Genel ilişki açılımı",
          priority: false
        };
        questionQueue.push(item);
        console.log("QUEUE: İlişki açılımı eklendi:", item.username, "| Bekleyen:", questionQueue.length);
        processQuestionQueue();
        return;
      }

      // =========================
      // ÜÇ KART TAROT TETİĞİ
      // Sohbete "3kart" yazılması üç kart açılımını sıraya ekler.
      // =========================
      if (normalizeTurkishText(event.comment).replace(/\s+/g, "") === "3kart") {
        const item = {
          id: ++questionId,
          kind: "threecard",
          username: event.username || event.nickname || "izleyici",
          nickname: event.nickname,
          question: "",
          priority: false
        };
        questionQueue.push(item);
        console.log("QUEUE: Üç kart açılımı eklendi:", item.username, "| Bekleyen:", questionQueue.length);
        processQuestionQueue();
        return;
      }

      // =========================
      // BURÇ TEST TETİĞİ
      // Sohbete yalnızca "burç" yazılması Burç motorunu kuyruğa alır.
      // =========================
      if (normalizeTurkishText(event.comment) === "burc") {
        const item = {
          id: ++questionId,
          kind: "burc",
          username: event.username || event.nickname || "izleyici",
          nickname: event.nickname,
          question: "Burç yorumu",
          priority: false
        };
        questionQueue.push(item);
        console.log("QUEUE: Burç yorumu eklendi:", item.username, "| Bekleyen:", questionQueue.length);
        processQuestionQueue();
        return;
      }

      // =========================
      // SİHİRLİ MESAJ TEST TETİĞİ
      // Sohbete yalnızca "hediye" yazılması özel mesajı kuyruğa alır.
      // =========================
      if (normalizeTurkishText(event.comment) === "hediye") {
        const item = {
          id: ++questionId,
          kind: "magic",
          username: event.username || event.nickname || "izleyici",
          nickname: event.nickname,
          question: "Sihirli Mesaj",
          priority: false
        };
        questionQueue.push(item);
        console.log("QUEUE: Sihirli Mesaj eklendi:", item.username, "| Bekleyen:", questionQueue.length);
        processQuestionQueue();
        return;
      }

      // =========================
      // MESAJ FILTRESI
      // =========================
      const classification = classifyChatMessage(event.comment);
      if (!classification.accept) {
        console.log(
          "FILTER: Mesaj Tarot kuyruğuna alınmadı:",
          event.username,
          "=>",
          event.comment,
          "| Neden:",
          classification.reason
        );
        return;
      }

      if (isDuplicateQuestion(event.username, classification.normalized)) {
        console.log(
          "FILTER: Tekrarlanan soru atlandı:",
          event.username,
          "=>",
          event.comment
        );
        return;
      }

      // =========================
      // SORU + KART KUYRUĞA EKLE
      // =========================

      const draw =
        drawOneCard();

      const item = {
        id: ++questionId,
        username:
          event.username,
        nickname:
          event.nickname,
        question:
          event.comment,
        card:
          draw.card,
        orientation:
          draw.orientation,
        meaning:
          draw.meaning,
        retryCount: 0,
        priority: false
      };

      questionQueue.push(item);

      console.log(
        "QUEUE: Soru eklendi:",
        item.username,
        "=>",
        item.question,
        "| Bekleyen:",
        questionQueue.length
      );

      // Sadece boşta ise çalışır.
      // Meşgulse mevcut kişi bitene kadar bekler.
      processQuestionQueue();
    }
  );

  // =========================
  // GIFT
  // =========================

  tiktokConnection.on(
    WebcastEvent.GIFT,
    (data) => {
      const username =
        data.user?.displayId ||
        data.user?.uniqueId ||
        data.user?.nickname;

      console.log(
        "GIFT:",
        username
      );

      const user =
        String(
          username || ""
        ).toLowerCase();

      const index =
        questionQueue.findIndex(
          (item) =>
            String(
              item.username || ""
            ).toLowerCase() === user
        );

      // Bekleyen sorusu varsa başa taşı.
      if (index > 0) {
        const [item] =
          questionQueue.splice(
            index,
            1
          );

        item.priority = true;

        questionQueue.unshift(
          item
        );

        console.log(
          "QUEUE: Hediye önceliği:",
          item.username
        );

        broadcast({
          type:
            "gift_priority",
          username:
            item.username
        });

      } else if (index === 0) {

        console.log(
          "QUEUE: Kullanıcı zaten sıranın başında:",
          username
        );

      } else {

        console.log(
          "GIFT: Bekleyen soru bulunamadı:",
          username
        );
      }

      // Şimdilik gift raw logu kalsın.
      console.log(
        "GIFT RAW:",
        JSON.stringify(data)
      );

      processQuestionQueue();
    }
  );

  // =========================
  // LIKE
  // =========================

  tiktokConnection.on(
    WebcastEvent.LIKE,
    (data) => {
      const event = {
        type: "like",
        username:
          data.user?.uniqueId,
        likeCount:
          data.likeCount,
        totalLikeCount:
          data.totalLikeCount
      };

      console.log(
        "LIKE:",
        event.username,
        "=>",
        event.likeCount
      );

      broadcast(event);
    }
  );

  // =========================
  // CONNECT
  // =========================

  tiktokConnection
    .connect()
    .catch((error) => {
      tiktokConnected = false;

      console.error(
        "TikTok connection failed:",
        error.message || error
      );

      setTimeout(
        connectTikTok,
        15000
      );
    });
}

connectTikTok();
