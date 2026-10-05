const express = require("express");

const app = express();

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.json({
    status: "online",
    system: "NinjaBox AI LIVE",
    tiktok: "@ninjaboxx"
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true
  });
});

app.listen(PORT, () => {
  console.log(`NinjaBox AI LIVE running on port ${PORT}`);
});
