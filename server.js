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
const TIKTOK_USERNAME = "ninjaboxx";

// Like-based free Tarot rewards are intentionally disabled.

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
let activeRelationshipRequest = null;
let relationshipInputTimer = null;
let activePaidTarotRequest = null;
let paidTarotInputTimer = null;
let activeThreeCardRequest = null;
let threeCardInputTimer = null;

// CHAT filtresi: sohbet, sıra, bedava bakma ve provokasyon mesajlarını
// Tarot kuyruğuna almadan önce ayıklar. Ses/yanıt akışına dokunmaz.
const recentQuestionKeys = new Map();
const recentGiftEventIds = new Map();
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

  // Yayın sayfası yeniden bağlandığında eski tarayıcıya ait tamamlanma kilidi
  // kuyrukta kalmasın. Bekleyen istemci zamanlayıcılarını temizleyip sırayı sürdür.
  if (waitingForClientCompletion !== null) {
    console.log("QUEUE: İstemci yeniden bağlandı; eski bekleme kilidi temizleniyor:", waitingForClientCompletion);
    waitingForClientCompletion = null;
    if (completionSafetyTimer) { clearTimeout(completionSafetyTimer); completionSafetyTimer = null; }
    if (burcInputTimer) { clearTimeout(burcInputTimer); burcInputTimer = null; }
    if (relationshipInputTimer) { clearTimeout(relationshipInputTimer); relationshipInputTimer = null; }
    if (paidTarotInputTimer) { clearTimeout(paidTarotInputTimer); paidTarotInputTimer = null; }
    if (threeCardInputTimer) { clearTimeout(threeCardInputTimer); threeCardInputTimer = null; }
    activeBurcRequest = null;
    activeRelationshipRequest = null;
    activePaidTarotRequest = null;
    activeThreeCardRequest = null;
    processingQuestion = false;
    setTimeout(() => {
      if (questionQueue.length > 0) processQuestionQueue();
    }, 300);
  }

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
        if (message.type === "iliski_finished") {
          if (relationshipInputTimer) { clearTimeout(relationshipInputTimer); relationshipInputTimer = null; }
          activeRelationshipRequest = null;
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


async function resolveRelationshipRequest(session, question) {
  if (!session || session.resolved || Number(waitingForClientCompletion) !== Number(session.id)) return;
  session.resolved = true;
  if (relationshipInputTimer) { clearTimeout(relationshipInputTimer); relationshipInputTimer = null; }

  const cleanQuestion = String(question || "").trim().slice(0, 400);
  const actualQuestion = cleanQuestion || "Genel ilişki açılımı";
  let reading = null;
  try {
    reading = await createRelationshipReading({ username: session.username, question: actualQuestion });
  } catch (error) {
    console.error("İLİŞKİ: Yorum oluşturulamadı:", error.message || error);
  }

  if (Number(waitingForClientCompletion) !== Number(session.id)) return;
  if (!reading || !Array.isArray(reading.cards) || reading.cards.length !== 5) {
    const cards = pickRelationshipCards();
    reading = {
      cards,
      answer: `${session.username}, ${actualQuestion === "Genel ilişki açılımı" ? "bu genel ilişki açılımında" : `“${actualQuestion}” sorunda`} duygular, düşünceler, belirsizlikler, engeller ve olası yön birlikte değerlendiriliyor. Kartlar başka birinin zihnini kanıtlamaz; en güçlü işaret, sözlerle davranışların tutarlılığı ve açık iletişimdir.`,
      source: "safe-fallback"
    };
  }

  broadcast({
    type: "iliski_answer",
    questionId: session.id,
    username: session.username,
    question: actualQuestion,
    cards: reading.cards,
    answer: reading.answer,
    source: reading.source
  });
  console.log("İLİŞKİ: Soruya göre yorum hazırlandı:", session.username, "=>", actualQuestion, "|", reading.cards.map(card => card.name).join(" / "), reading.source);
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
      if (item.broadcasterTest) {
        resolveBurcRequest(activeBurcRequest, { sunSign: "Koç", risingSign: null }).catch(error => console.error("BURÇ test açılımı hatası:", error.message || error));
        return;
      }
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
          activeBurcRequest = null; waitingForClientCompletion = null;
          if (completionSafetyTimer) { clearTimeout(completionSafetyTimer); completionSafetyTimer = null; }
          burcInputTimer = null; processingQuestion = false;
          broadcast({ type: "gift_input_timeout", questionId: item.id, username: item.username, rewardKind: "burc" });
          console.log("BURÇ: 60 saniyede bilgi gelmedi; açılım iptal edildi:", item.username);
          if (questionQueue.length > 0) setTimeout(processQuestionQueue, 100);
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
      activeRelationshipRequest = {
        id: item.id,
        username: item.username,
        nickname: item.nickname,
        startedAt: Date.now(),
        resolved: false
      };
      waitingForClientCompletion = item.id;
      broadcast({ type: "iliski_start", questionId: item.id, username: item.username });
      if (item.broadcasterTest) {
        resolveRelationshipRequest(activeRelationshipRequest, "Yayın sahibi test ilişki açılımı").catch(error => console.error("İLİŞKİ test açılımı hatası:", error.message || error));
        return;
      }
      if (completionSafetyTimer) clearTimeout(completionSafetyTimer);
      completionSafetyTimer = setTimeout(() => {
        if (Number(waitingForClientCompletion) === Number(item.id)) {
          console.log("QUEUE: İlişki güvenlik zaman aşımı, kuyruk açılıyor:", item.id);
          waitingForClientCompletion = null;
          completionSafetyTimer = null;
          activeRelationshipRequest = null;
          if (relationshipInputTimer) { clearTimeout(relationshipInputTimer); relationshipInputTimer = null; }
          processingQuestion = false;
          if (questionQueue.length > 0) setTimeout(processQuestionQueue, 100);
        }
      }, 180000);
      if (relationshipInputTimer) clearTimeout(relationshipInputTimer);
      relationshipInputTimer = setTimeout(() => {
        if (activeRelationshipRequest && Number(activeRelationshipRequest.id) === Number(item.id) && !activeRelationshipRequest.resolved) {
          activeRelationshipRequest = null; waitingForClientCompletion = null;
          if (completionSafetyTimer) { clearTimeout(completionSafetyTimer); completionSafetyTimer = null; }
          relationshipInputTimer = null; processingQuestion = false;
          broadcast({ type: "gift_input_timeout", questionId: item.id, username: item.username, rewardKind: "iliski" });
          console.log("İLİŞKİ: 60 saniyede soru gelmedi; açılım iptal edildi:", item.username);
          if (questionQueue.length > 0) setTimeout(processQuestionQueue, 100);
        }
      }, 60000);
      console.log("İLİŞKİ: İzleyicinin sorusu bekleniyor (60 sn):", item.username, "ID:", item.id);
      return;
    }

    if (item.kind === "tarot" && item.giftReward && !item.questionProvided) {
      activePaidTarotRequest = { id: item.id, username: item.username, nickname: item.nickname, item, resolved: false };
      waitingForClientCompletion = item.id; // kuyruğu kullanıcı sorusu gelene kadar kilitli tut
      if (completionSafetyTimer) clearTimeout(completionSafetyTimer);
      completionSafetyTimer = setTimeout(() => {
        if (Number(waitingForClientCompletion) === Number(item.id)) {
          console.log("QUEUE: Hediye tek kart için soru bekleme zaman aşımı:", item.id);
          activePaidTarotRequest = null;
          if (paidTarotInputTimer) { clearTimeout(paidTarotInputTimer); paidTarotInputTimer = null; }
          waitingForClientCompletion = null;
          completionSafetyTimer = null;
          processingQuestion = false;
          if (questionQueue.length > 0) setTimeout(processQuestionQueue, 100);
        }
      }, 120000);
      if (paidTarotInputTimer) clearTimeout(paidTarotInputTimer);
      paidTarotInputTimer = setTimeout(() => {
        if (activePaidTarotRequest && Number(activePaidTarotRequest.id) === Number(item.id) && !activePaidTarotRequest.resolved) {
          // Süre dolarsa soru uydurmak yerine bu ödülü iptal et ve kuyruğu aç.
          activePaidTarotRequest = null;
          waitingForClientCompletion = null;
          if (completionSafetyTimer) { clearTimeout(completionSafetyTimer); completionSafetyTimer = null; }
          paidTarotInputTimer = null;
          processingQuestion = false;
          broadcast({ type: "gift_input_timeout", questionId: item.id, username: item.username, rewardKind: "tarot" });
          console.log("HEDİYELİ TEK KART: 60 saniyede soru gelmedi; ödül iptal edildi:", item.username);
          if (questionQueue.length > 0) setTimeout(processQuestionQueue, 100);
        }
      }, 60000);
      // Mevcut live.html tarot_start olayını kullanarak ekranda soru bekleme durumunu aç.
      broadcast({ type: "tarot_start", questionId: item.id, username: item.username, question: "HEDİYE ALINDI — SORUNU SOHBETE YAZ", cardName: "", image: "", orientation: "upright", meaning: "" });
      broadcast({ type: "gift_question_prompt", questionId: item.id, username: item.username, rewardKind: "tarot", prompt: "Sorunu sohbete yaz." });
      console.log("HEDİYELİ TEK KART: Hediye sonrası soru bekleniyor:", item.username, "ID:", item.id);
      return;
    }

    if (item.kind === "threecard" && item.giftReward && !item.questionProvided) {
      activeThreeCardRequest = { id: item.id, username: item.username, nickname: item.nickname, item, resolved: false };
      waitingForClientCompletion = item.id;
      if (completionSafetyTimer) clearTimeout(completionSafetyTimer);
      completionSafetyTimer = setTimeout(() => {
        if (Number(waitingForClientCompletion) === Number(item.id)) {
          activeThreeCardRequest = null;
          if (threeCardInputTimer) { clearTimeout(threeCardInputTimer); threeCardInputTimer = null; }
          waitingForClientCompletion = null;
          completionSafetyTimer = null;
          processingQuestion = false;
          console.log("QUEUE: Hediye üç kart için soru zaman aşımı:", item.id);
          if (questionQueue.length > 0) setTimeout(processQuestionQueue, 100);
        }
      }, 120000);
      if (threeCardInputTimer) clearTimeout(threeCardInputTimer);
      threeCardInputTimer = setTimeout(() => {
        if (activeThreeCardRequest && Number(activeThreeCardRequest.id) === Number(item.id) && !activeThreeCardRequest.resolved) {
          activeThreeCardRequest = null;
          waitingForClientCompletion = null;
          if (completionSafetyTimer) { clearTimeout(completionSafetyTimer); completionSafetyTimer = null; }
          threeCardInputTimer = null;
          processingQuestion = false;
          broadcast({ type: "gift_input_timeout", questionId: item.id, username: item.username, rewardKind: "threecard" });
          console.log("HEDİYELİ ÜÇ KART: 60 saniyede soru gelmedi; ödül iptal edildi:", item.username);
          if (questionQueue.length > 0) setTimeout(processQuestionQueue, 100);
        }
      }, 60000);
      // Mevcut istemciyi üç kart bekleme ekranına al; cevap ancak soru geldikten sonra hazırlanır.
      broadcast({ type: "threecard_start", questionId: item.id, username: item.username, question: "HEDİYE ALINDI — SORUNU SOHBETE YAZ" });
      broadcast({ type: "gift_question_prompt", questionId: item.id, username: item.username, rewardKind: "threecard", prompt: "Üç kart açılımı için sorunu sohbete yaz." });
      console.log("HEDİYELİ ÜÇ KART: Hediye sonrası soru bekleniyor:", item.username, "ID:", item.id);
      return;
    }

    if (item.kind === "threecard") {
      broadcast({ type: "threecard_start", questionId: item.id, username: item.username });
      let reading = null;
      try {
        // Motorun AI denemeleri 12 saniyeyi aşabilir. Erken kesmek kartları
        // boş gönderip ekranda kırık görsel oluşmasına neden oluyordu.
        reading = await Promise.race([
          createThreeCardReading({ username: item.username, question: item.question || "" }),
          new Promise((resolve) => setTimeout(() => resolve(null), 15000))
        ]);
        if (!reading) console.warn("3 KART: Yorum motoru 15 saniyeyi aştı; güvenli yedek yorum kullanılacak.");
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

      // YAYIN SAHİBİ TEST KOMUTLARI: yalnızca @ninjaboxx kullanabilir.
      // Komutlar hediye gerektirmez ve normal izleyicilere açık değildir.
      const broadcasterTester = normalizeTurkishText(event.username || event.nickname || "") === "ninjaboxx";
      const ownerCommand = normalizeTurkishText(event.comment).replace(/\s+/g, " ");
      if (broadcasterTester) {
        const ownerKinds = {
          "sihirli": "magic",
          "iliski": "iliski",
          "burc": "burc",
          "tek kart": "tarot",
          "3kart": "threecard"
        };
        const ownerKind = ownerKinds[ownerCommand];
        if (ownerKind) {
          const item = {
            id: ++questionId,
            kind: ownerKind,
            username: event.username || "ninjaboxx",
            nickname: event.nickname || event.username || "ninjaboxx",
            question: ownerKind === "threecard" ? "Yayın sahibi test açılımı" : ownerKind === "tarot" ? "Yayın sahibi tek kart test açılımı" : ownerKind === "iliski" ? "Yayın sahibi test ilişki açılımı" : ownerKind === "burc" ? "Koç" : "",
            priority: true,
            giftReward: false,
            broadcasterTest: true,
            questionProvided: true,
            retryCount: 0
          };
          if (ownerKind === "tarot") {
            const draw = drawOneCard();
            item.card = draw.card; item.orientation = draw.orientation; item.meaning = draw.meaning;
          }
          questionQueue.push(item);
          console.log("BROADCASTER COMMAND: Test açılımı kuyruğa eklendi:", ownerCommand, "=>", ownerKind, "| ID:", item.id);
          processQuestionQueue();
          return;
        }
      }

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

      // Hediye ile açılan tek kart: yalnızca hediyeyi gönderen kişinin
      // hediye SONRASI yazdığı ilk soruyu kabul et.
      if (activePaidTarotRequest && !activePaidTarotRequest.resolved) {
        const currentUser = normalizeTurkishText(event.username || event.nickname || "");
        const expectedUser = normalizeTurkishText(activePaidTarotRequest.username || activePaidTarotRequest.nickname || "");
        if (currentUser && expectedUser && currentUser === expectedUser) {
          const question = String(event.comment || "").trim();
          if (question.length >= 3 && normalizeTurkishText(question) !== "cay") {
            const item = activePaidTarotRequest.item;
            activePaidTarotRequest.resolved = true;
            item.question = question.slice(0, 400);
            item.questionProvided = true;
            const draw = drawOneCard();
            item.card = draw.card;
            item.orientation = draw.orientation;
            item.meaning = draw.meaning;
            if (paidTarotInputTimer) { clearTimeout(paidTarotInputTimer); paidTarotInputTimer = null; }
            if (completionSafetyTimer) { clearTimeout(completionSafetyTimer); completionSafetyTimer = null; }
            activePaidTarotRequest = null;
            waitingForClientCompletion = null;
            processingQuestion = false;
            questionQueue.unshift(item);
            console.log("HEDİYELİ TEK KART: Hediye sonrası soru alındı:", item.username, "=>", item.question);
            processQuestionQueue();
            return;
          }
        }
      }

      // Hediye ile açılan üç kart: soru gelmeden yorum üretme.
      if (activeThreeCardRequest && !activeThreeCardRequest.resolved) {
        const currentUser = normalizeTurkishText(event.username || event.nickname || "");
        const expectedUser = normalizeTurkishText(activeThreeCardRequest.username || activeThreeCardRequest.nickname || "");
        if (currentUser && expectedUser && currentUser === expectedUser) {
          const question = String(event.comment || "").trim();
          if (question.length >= 3 && normalizeTurkishText(question).replace(/\s+/g, "") !== "3kart") {
            const item = activeThreeCardRequest.item;
            activeThreeCardRequest.resolved = true;
            item.question = question.slice(0, 400);
            item.questionProvided = true;
            if (threeCardInputTimer) { clearTimeout(threeCardInputTimer); threeCardInputTimer = null; }
            if (completionSafetyTimer) { clearTimeout(completionSafetyTimer); completionSafetyTimer = null; }
            activeThreeCardRequest = null;
            waitingForClientCompletion = null;
            processingQuestion = false;
            questionQueue.unshift(item);
            console.log("HEDİYELİ ÜÇ KART: Hediye sonrası soru alındı:", item.username, "=>", item.question);
            processQuestionQueue();
            return;
          }
        }
      }

      // =========================
      // AKTİF İLİŞKİ OTURUMU: yalnızca açılımı başlatan izleyicinin sorusunu al
      // =========================
      if (activeRelationshipRequest && !activeRelationshipRequest.resolved) {
        const currentUser = normalizeTurkishText(event.username || event.nickname || "");
        const expectedUser = normalizeTurkishText(activeRelationshipRequest.username || activeRelationshipRequest.nickname || "");
        const normalizedComment = normalizeTurkishText(event.comment);
        if (currentUser && expectedUser && currentUser === expectedUser) {
          if (normalizedComment === "iliski") {
            console.log("İLİŞKİ: Aynı izleyicinin tetiklemesi tekrarlandı; soru bekleniyor:", activeRelationshipRequest.username);
            return;
          }
          if (event.comment.trim().length >= 3) {
            console.log("İLİŞKİ: Soru alındı:", activeRelationshipRequest.username, "=>", event.comment);
            resolveRelationshipRequest(activeRelationshipRequest, event.comment).catch(error => console.error("İLİŞKİ cevap hatası:", error.message || error));
            return;
          }
        }
      }

      // TEST İZNİ: Yalnızca yayın sahibi @ninjaboxx hediye olmadan Tarot sorusu sorabilir.
      // Diğer izleyicilerin hediye ile açılan soru/cevap akışı değiştirilmez.
      if (broadcasterTester) {
        const testQuestion = String(event.comment || "").trim();
        const classification = classifyChatMessage(testQuestion);
        if (testQuestion.length >= 3 && (classification.accept || /[?？]/.test(testQuestion))) {
          const draw = drawOneCard();
          const item = {
            id: ++questionId,
            kind: "tarot",
            username: event.username || "ninjaboxx",
            nickname: event.nickname || event.username || "ninjaboxx",
            question: testQuestion.slice(0, 400),
            card: draw.card,
            orientation: draw.orientation,
            meaning: draw.meaning,
            priority: true,
            giftReward: false,
            broadcasterTest: true,
            questionProvided: true,
            retryCount: 0
          };
          questionQueue.push(item);
          console.log("BROADCASTER TEST: Soru sıraya alındı (FIFO):", item.username, "=>", item.question, "| Bekleyen:", questionQueue.length);
          processQuestionQueue();
          return;
        }
      }

      // Diğer tüm izleyicilerde hediye öncesi sohbet mesajları işlem/kuyruk oluşturmaz.
      console.log("CHAT: Aktif hediye oturumu için gerekli girdi yok; mesaj yok sayıldı:", event.username, "=>", event.comment);
    }
  );

  // =========================
  // GIFT -> PAID TAROT REWARD
  // =========================

  tiktokConnection.on(
    WebcastEvent.GIFT,
    (data) => {
      const username =
        data.user?.displayId ||
        data.user?.uniqueId ||
        data.user?.nickname ||
        "izleyici";
      const nickname = data.user?.nickname || username;
      const giftDetails = data.giftDetails || data.gift || data.extendedGiftInfo || {};
      const giftName = String(
        giftDetails.giftName || giftDetails.name || giftDetails.gift_name ||
        data.giftName || data.gift_name || data.extendedGiftInfo?.giftName ||
        data.extendedGiftInfo?.name || ""
      ).trim();
      const normalizedGiftName = normalizeTurkishText(giftName);
      const giftId = data.giftId ?? giftDetails.giftId ?? giftDetails.id ?? null;
      const diamondCount = Number(
        giftDetails.diamondCount ?? giftDetails.diamond_count ??
        data.diamondCount ?? data.diamond_count ?? 0
      );
      const repeatCount = Number(data.repeatCount || 1);
      const giftType = Number(data.giftType || 0);
      const repeatEnd = data.repeatEnd;
      const giftEventId = data.common?.msgId || data.common?.messageId || data.msgId || data.eventId || data.logId || null;
      if (giftEventId) {
        const now = Date.now();
        for (const [id, timestamp] of recentGiftEventIds) if (now - timestamp > 120000) recentGiftEventIds.delete(id);
        if (recentGiftEventIds.has(String(giftEventId))) {
          console.warn("GIFT: Yinelenen aynı TikTok olay kimliği atlandı:", giftEventId, username, giftName);
          return;
        }
        recentGiftEventIds.set(String(giftEventId), now);
      }

      console.log("GIFT:", username, "| ad:", giftName || "BİLİNMİYOR", "| coin/diamond:", diamondCount || "BİLİNMİYOR", "| giftId:", giftId, "| tekrar:", repeatCount, "| repeatEnd:", repeatEnd);
      console.log("GIFT RAW:", JSON.stringify(data));

      // Streakable gifts may emit several events. Wait for the final event.
      if (giftType === 1 && repeatEnd === false) {
        console.log("GIFT: Seri hediyenin bitiş olayı bekleniyor:", username, giftName || giftId);
        return;
      }

      // Hediye, geçmiş sohbet mesajlarını ödüle dönüştürmez. Her hediye
      // kendi başına tek bir ödül görevi oluşturur; mevcut sıra bozulmaz.

      // Gerçek hediye adlarına göre eşleştirme.
      // Yalnızca hediye eşleştirme bölümü değiştirildi; diğer akışlara dokunulmadı.
      let rewardKind = null;
      if (/\b(donat|donut|doughnut)\b/.test(normalizedGiftName)) {
        rewardKind = "magic"; // Donat / Donut / Doughnut 30 coin -> Sihirli Mesaj
      } else if (/\b(cay|tea)\b/.test(normalizedGiftName)) {
        rewardKind = "tarot"; // Çay / Tea 50 coin -> Tek Kart Tarot
      } else if (/\b(sapka|hat|cap)\b/.test(normalizedGiftName)) {
        rewardKind = "burc"; // Şapka / Hat / Cap 99 coin -> Burç Yorumu
      } else if (/\b(balon|balloon)\b/.test(normalizedGiftName)) {
        rewardKind = "threecard"; // Balon / Balloon / Balloon Gift Box 100 coin -> Üç Kart Açılımı
      } else if (/\b(konfeti|confetti)\b/.test(normalizedGiftName)) {
        rewardKind = "iliski"; // Konfeti / Confetti 100 coin -> İlişki Açılımı
      }

      if (!rewardKind) {
        console.log("GIFT: Bu hediye için ödül eşleştirmesi yok; yalnızca mevcut hediye önceliği uygulandı:", giftName || "isim alınamadı");
        processQuestionQueue();
        return;
      }

      const rewardLabels = {
        magic: "Sihirli Mesaj",
        tarot: "Tek Kart Tarot",
        burc: "Burç Yorumu",
        threecard: "Üç Kart Tarot",
        iliski: "İlişki Açılımı"
      };
      const item = {
        id: ++questionId,
        kind: rewardKind,
        username,
        nickname,
        question: rewardKind === "burc" ? "Burç yorumu" : "",
        priority: true,
        giftReward: true,
        giftName,
        giftId,
        diamondCount
      };

      if (rewardKind === "tarot") {
        const draw = drawOneCard();
        item.card = draw.card;
        item.orientation = draw.orientation;
        item.meaning = draw.meaning;
        item.question = "Hediye ile açılan tek kart";
        item.retryCount = 0;
      }

      // Her hediye yalnızca bir kez kuyruğa eklenir; devam eden işlem kesilmez.
      questionQueue.push(item);
      console.log("GIFT REWARD: Kuyruğa eklendi:", username, "=>", rewardLabels[rewardKind], "| Hediye:", giftName, "| Coin/diamond:", diamondCount || "bilinmiyor", "| Bekleyen:", questionQueue.length);
      broadcast({
        type: "gift_reward_queued",
        username,
        giftName,
        rewardKind,
        rewardLabel: rewardLabels[rewardKind],
        questionId: item.id
      });
      processQuestionQueue();
    }
  );

  // =========================
  // LIKE (display/log only; like-based rewards are disabled)
  // =========================

  tiktokConnection.on(
    WebcastEvent.LIKE,
    (data) => {
      const username = data.user?.uniqueId || data.user?.displayId || data.user?.nickname;
      const isModerator = Boolean(
        data.userIdentity?.isModeratorOfAnchor ??
        data.user?.userIdentity?.isModeratorOfAnchor ??
        data.isModeratorOfAnchor
      );
      const event = {
        type: "like",
        username,
        likeCount: data.likeCount,
        totalLikeCount: data.totalLikeCount,
        isModerator
      };
      console.log("LIKE (ödül kapalı):", username, "=>", event.likeCount, "total:", event.totalLikeCount, "moderator:", isModerator);
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
