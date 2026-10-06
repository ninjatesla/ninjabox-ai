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
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

let tiktokConnection = null;
let tiktokConnected = false;

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "NinjaBox AI LIVE",
    tiktok: "@" + TIKTOK_USERNAME,
    connected: tiktokConnected,
    openaiConfigured: !!OPENAI_API_KEY
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    tiktokConnected,
    openaiConfigured: !!OPENAI_API_KEY
  });
});

const server = app.listen(PORT, () => {
  console.log("NinjaBox AI LIVE running on port " + PORT);
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

  socket.send(JSON.stringify({
    type: "status",
    tiktokConnected
  }));

  socket.on("close", () => {
    clients.delete(socket);
  });
});

// =========================
// OPENAI TAROT YORUMU
// =========================

async function generateTarotAnswer(question, card, orientation) {

  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const meaning =
    orientation === "upright"
      ? card.upright
      : card.reversed;

  const prompt = `
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
- Kullanıcının adını cevap içinde kullanma; sistem ayrıca gösterecek.

Soru:
${question}

Kart:
${card.name}

Kart konumu:
${orientation === "upright" ? "Düz" : "Ters"}

Kartın temel anlamı:
${meaning}

Şimdi bu soruya Tarot okuyucusu gibi kısa, net ve doğal bir yorum ver.
`;

  const response = await fetch(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-6-luna",
        input: prompt,
        max_output_tokens: 120
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OpenAI API error ${response.status}: ${errorText}`
    );
  }

  const data = await response.json();

  return data.output_text?.trim() || "Kartın mesajı şu an netleşmiyor.";
}

// =========================
// TIKTOK
// =========================

function connectTikTok() {

  console.log(
    "Connecting to TikTok LIVE: @" + TIKTOK_USERNAME
  );

  tiktokConnection = new TikTokLiveConnection(
    TIKTOK_USERNAME,
    {
      processInitialData: false,
      fetchRoomInfoOnConnect: true
    }
  );

  // CONNECTED

  tiktokConnection.on(
    ControlEvent.CONNECTED,
    (state) => {

      tiktokConnected = true;

      console.log("================================");
      console.log("TIKTOK LIVE CONNECTED");
      console.log("Room ID:", state.roomId);
      console.log("================================");

      broadcast({
        type: "status",
        tiktokConnected: true
      });
    }
  );

  // DISCONNECTED

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

  // ERROR

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
  // CHAT + TAROT + GPT
  // =========================

  tiktokConnection.on(
    WebcastEvent.CHAT,
    async (data) => {

      const event = {
        type: "chat",
        username: data.user?.displayId,
        nickname: data.user?.nickname,
        userId: data.user?.id,
        comment: data.content,
        isModerator:
          data.userIdentity?.isModeratorOfAnchor
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

        const draw = drawOneCard();

        const tarotEvent = {
          type: "tarot",
          username: event.username,
          question: event.comment,
          cardName: draw.card.name,
          image: draw.card.image,
          orientation: draw.orientation,
          meaning: draw.meaning
        };

        console.log("TAROT:");
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
        // GPT YORUMU
        // =========================

        console.log(
          "GPT: Tarot yorumu hazırlanıyor..."
        );

        const answer =
          await generateTarotAnswer(
            event.comment,
            draw.card,
            draw.orientation
          );

        console.log(
          "GPT ANSWER:",
          answer
        );

        broadcast({
          type: "tarot_answer",
          username: event.username,
          question: event.comment,
          cardName: draw.card.name,
          image: draw.card.image,
          orientation: draw.orientation,
          answer
        });

      } catch (error) {

        console.error(
          "Tarot/GPT error:",
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
        username: data.user?.uniqueId,
        likeCount: data.likeCount,
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
