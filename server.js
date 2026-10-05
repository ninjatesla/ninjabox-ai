const express = require("express");
const WebSocket = require("ws");
const {
  TikTokLiveConnection,
  WebcastEvent,
  ControlEvent
} = require("tiktok-live-connector");

const app = express();
const PORT = process.env.PORT || 3000;

const TIKTOK_USERNAME = "ninjaboxx";

let tiktokConnection = null;
let tiktokConnected = false;

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "NinjaBox AI LIVE",
    tiktok: "@" + TIKTOK_USERNAME,
    connected: tiktokConnected
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    tiktokConnected
  });
});

const server = app.listen(PORT, () => {
  console.log("NinjaBox AI LIVE running on port " + PORT);
});

// Browser/WebSocket clients
const wss = new WebSocket.Server({ server });
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

// TikTok connection
function connectTikTok() {
  console.log("Connecting to TikTok LIVE: @" + TIKTOK_USERNAME);

  tiktokConnection = new TikTokLiveConnection(TIKTOK_USERNAME);

  tiktokConnection.on(ControlEvent.CONNECTED, (state) => {
    tiktokConnected = true;

    console.log("================================");
    console.log("TIKTOK LIVE CONNECTED");
    console.log("Room ID:", state.roomId);
    console.log("================================");

    broadcast({
      type: "status",
      tiktokConnected: true
    });
  });

  tiktokConnection.on(ControlEvent.DISCONNECTED, () => {
    tiktokConnected = false;
    console.log("TikTok LIVE disconnected.");

    broadcast({
      type: "status",
      tiktokConnected: false
    });

    setTimeout(connectTikTok, 10000);
  });

  tiktokConnection.on(ControlEvent.ERROR, (error) => {
    console.error("TikTok error:", error);
  });

  // CHAT
  tiktokConnection.on(WebcastEvent.CHAT, (data) => {
    const event = {
      type: "chat",
      username: data.user?.uniqueId,
      nickname: data.user?.nickname,
      comment: data.comment
    };

    console.log(
      "CHAT:",
      event.username,
      "=>",
      event.comment
    );

    broadcast(event);
  });

  // GIFT
  tiktokConnection.on(WebcastEvent.GIFT, (data) => {
    const event = {
      type: "gift",
      username: data.user?.uniqueId,
      nickname: data.user?.nickname,
      giftId: data.giftId,
      repeatCount: data.repeatCount,
      repeatEnd: data.repeatEnd
    };

    console.log(
      "GIFT:",
      event.username,
      "=>",
      event.giftId,
      "x" + event.repeatCount
    );

    broadcast(event);
  });

  // LIKE
  tiktokConnection.on(WebcastEvent.LIKE, (data) => {
    const event = {
      type: "like",
      username: data.user?.uniqueId,
      likeCount: data.likeCount,
      totalLikeCount: data.totalLikeCount
    };

    console.log(
      "LIKE:",
      event.username,
      "=>",
      event.likeCount
    );

    broadcast(event);
  });

  tiktokConnection.connect().catch((error) => {
    tiktokConnected = false;

    console.error(
      "TikTok connection failed:",
      error.message || error
    );

    setTimeout(connectTikTok, 15000);
  });
}

connectTikTok();
