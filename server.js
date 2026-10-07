import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import {
  TikTokLiveConnection,
  WebcastEvent,
  ControlEvent
} from "tiktok-live-connector";
import { drawOneCard } from "./tarotEngine.js";
import { getLocalTarotAnswer } from "./tarotFallback.js";

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

async function processQuestionQueue() {
  if (processingQuestion) return;

  const item = questionQueue.shift();

  if (!item) return;

  processingQuestion = true;

  console.log(
    "QUEUE: İşleniyor:",
    item.username,
    "=>",
    item.question
  );
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

  try {
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
    processingQuestion = false;

    if (questionQueue.length > 0) {
      setTimeout(
        processQuestionQueue,
        250
      );
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
