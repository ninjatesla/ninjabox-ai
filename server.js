import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import {
  TikTokLiveConnection,
  WebcastEvent,
  ControlEvent
} from "tiktok-live-connector";
import { drawOneCard } from "./tarotEngine.js";

const app = express();
const PORT = process.env.PORT || 3000;

const TIKTOK_USERNAME = "ninjacoretrader";

// =========================
// AI AYARLARI
// =========================

const AI_PROVIDER =
  (process.env.AI_PROVIDER || "gemini").toLowerCase();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.5-flash";

const OPENAI_MODEL =
  process.env.OPENAI_MODEL || "gpt-6-luna";

let tiktokConnection = null;
let tiktokConnected = false;

// =========================
// STATUS
// =========================

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "NinjaBox AI LIVE",
    tiktok: "@" + TIKTOK_USERNAME,
    connected: tiktokConnected,
    aiProvider: AI_PROVIDER,
    geminiConfigured: !!GEMINI_API_KEY,
    openaiConfigured: !!OPENAI_API_KEY
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    tiktokConnected,
    aiProvider: AI_PROVIDER,
    geminiConfigured: !!GEMINI_API_KEY,
    openaiConfigured: !!OPENAI_API_KEY
  });
});

// =========================
// SERVER
// =========================

const server = app.listen(PORT, () => {
  console.log(
    "NinjaBox AI LIVE running on port " + PORT
  );

  console.log(
    "AI Provider:",
    AI_PROVIDER
  );

  console.log(
    "Gemini configured:",
    !!GEMINI_API_KEY
  );

  console.log(
    "OpenAI configured:",
    !!OPENAI_API_KEY
  );
});

// =========================
// WEBSOCKET
// =========================

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

// =========================
// TAROT PROMPT
// =========================

function buildTarotPrompt(
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
- Korkutucu veya kesin gelecek iddiaları yapma.
- "Kesin olacak", "kesin dönecek" gibi mutlak ifadeler kullanma.
- 1 veya en fazla 2 kısa cümle kullan.
- Cevap canlı yayında seslendirilecek.
- Kullanıcının adini kullan ve cevapla
- Fazla açıklama yapma.

Soru:
${question}

Kart:
${card.name}

Kart konumu:
${orientation === "upright" ? "Düz" : "Ters"}

Kartın temel anlamı:
${meaning}

Şimdi bu soruya Tarot okuyucusu gibi kısa,
net ve doğal bir yorum ver.
`;
}

// =========================
// GEMINI TAROT YORUMU
// =========================

async function generateGeminiTarotAnswer(
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
    question,
    card,
    orientation
  );

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

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
        maxOutputTokens: 120,
        temperature: 0.8
      }
    })
  });

  if (!response.ok) {
    const errorText =
      await response.text();

    throw new Error(
      `Gemini API error ${response.status}: ${errorText}`
    );
  }

  const data =
    await response.json();

  const answer =
    data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim();

  return (
    answer ||
    "Kartın mesajı şu an netleşmiyor."
  );
}

// =========================
// OPENAI TAROT YORUMU
// ŞİMDİLİK HAZIRDA BEKLİYOR
// =========================

async function generateOpenAITarotAnswer(
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
        max_output_tokens: 120
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

  return (
    data.output_text?.trim() ||
    "Kartın mesajı şu an netleşmiyor."
  );
}

// =========================
// AI ROUTER
// =========================

async function generateTarotAnswer(
  question,
  card,
  orientation
) {
  if (AI_PROVIDER === "gemini") {
    console.log(
      "AI: Gemini kullanılıyor."
    );

    return await generateGeminiTarotAnswer(
      question,
      card,
      orientation
    );
  }

  if (AI_PROVIDER === "openai") {
    console.log(
      "AI: OpenAI kullanılıyor."
    );

    return await generateOpenAITarotAnswer(
      question,
      card,
      orientation
    );
  }

  throw new Error(
    `Unknown AI_PROVIDER: ${AI_PROVIDER}`
  );
}

// =========================
// TIKTOK
// =========================

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

  // =========================
  // CONNECTED
  // =========================

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
        "================================"
      );

      broadcast({
        type: "status",
        tiktokConnected: true
      });
    }
  );

  // =========================
  // DISCONNECTED
  // =========================

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

  // =========================
  // ERROR
  // =========================

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
  // CHAT + TAROT + AI
  // =========================

  tiktokConnection.on(
    WebcastEvent.CHAT,
    async (data) => {

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

      console.log(
        "CHAT:",
        event.username,
        "=>",
        event.comment
      );

      broadcast(event);

      // =========================
      // KART ÇEK
      // =========================

      try {

        const draw =
          drawOneCard();

        const tarotEvent = {
          type: "tarot",
          username:
            event.username,
          question:
            event.comment,
          cardName:
            draw.card.name,
          image:
            draw.card.image,
          orientation:
            draw.orientation,
          meaning:
            draw.meaning
        };

        console.log(
          "TAROT:"
        );

        console.log(
          "User:",
          tarotEvent.username
        );

        console.log(
          "Question:",
          tarotEvent.question
        );

        console.log(
          "Card:",
          tarotEvent.cardName
        );

        console.log(
          "Orientation:",
          tarotEvent.orientation
        );

        console.log(
          "Meaning:",
          tarotEvent.meaning
        );

        console.log(
          "Image:",
          tarotEvent.image
        );

        broadcast(tarotEvent);

        // =========================
        // AI YORUMU
        // =========================

        console.log(
          "AI: Tarot yorumu hazırlanıyor..."
        );

        const answer =
          await generateTarotAnswer(
            event.comment,
            draw.card,
            draw.orientation
          );

        console.log(
          "AI ANSWER:",
          answer
        );

        broadcast({
          type: "tarot_answer",
          username:
            event.username,
          question:
            event.comment,
          cardName:
            draw.card.name,
          image:
            draw.card.image,
          orientation:
            draw.orientation,
          answer
        });

      } catch (error) {

        console.error(
          "Tarot/AI error:",
          error.message || error
        );
      }
    }
  );

  // =========================
  // GIFT TEST
  // =========================

  tiktokConnection.on(
    WebcastEvent.GIFT,
    (data) => {

      console.log(
        "GIFT RAW:",
        JSON.stringify(data)
      );

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
