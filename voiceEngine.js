import { randomUUID } from "node:crypto";

const OPENAI_API_KEY =
  process.env.OPENAI_API_KEY;

const VOICE_PROVIDER =
  (process.env.VOICE_PROVIDER || "none")
    .toLowerCase();

const VOICE_MODEL =
  process.env.VOICE_MODEL ||
  "gpt-4o-mini-tts";

const VOICE_NAME =
  process.env.VOICE_NAME ||
  "marin";

const VOICE_SPEED =
  Number(process.env.VOICE_SPEED || "0.95");

const VOICE_MAX_CHARS =
  Number(process.env.VOICE_MAX_CHARS || "800");

const AUDIO_TTL_MS =
  Number(
    process.env.VOICE_AUDIO_TTL_MS ||
      "120000"
  );

const MAX_AUDIO_ITEMS =
  Number(
    process.env.VOICE_MAX_AUDIO_ITEMS ||
      "20"
  );

const audioStore =
  new Map();

function normalizeText(text) {
  if (
    typeof text !== "string"
  ) {
    return "";
  }

  return text
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, VOICE_MAX_CHARS);
}

function clampSpeed(speed) {
  if (
    !Number.isFinite(speed)
  ) {
    return 0.95;
  }

  return Math.min(
    4,
    Math.max(0.25, speed)
  );
}

export function buildVoiceInstructions(
  context = "general"
) {
  const base =
    "Türkçe konuş. Doğal, sıcak ve akıcı bir anlatıcı gibi konuş. Robotik olma. Kısa cümlelerde doğal duraklamalar yap. Önemli kelimeleri hafifçe vurgula. Konuşma anlaşılır ve canlı olsun.";

  if (context === "tarot") {
    return (
      base +
      " Tarot yorumcusu havası ver. Gizemli ama abartısız, sakin ve güven veren bir ton kullan."
    );
  }

  if (context === "horror") {
    return (
      base +
      " Gerilimli ve gizemli bir anlatım kullan. Gerektiğinde hafifçe yavaşla ve önemli anlarda vurgu yap."
    );
  }

  if (context === "entertainment") {
    return (
      base +
      " Eğlenceli, enerjik ve samimi bir ton kullan."
    );
  }

  if (context === "travel") {
    return (
      base +
      " Gezi anlatıcısı gibi doğal, merak uyandıran ve canlı konuş."
    );
  }

  if (context === "ninja") {
    return (
      base +
      " Yarışma sunucusu gibi enerjik, heyecanlı ve net konuş."
    );
  }

  return base;
}

export function getVoiceStatus() {
  return {
    provider:
      VOICE_PROVIDER,

    model:
      VOICE_MODEL,

    voice:
      VOICE_NAME,

    enabled:
      VOICE_PROVIDER ===
        "openai" &&
      Boolean(
        OPENAI_API_KEY
      )
  };
}
export async function synthesizeSpeech({
  text,
  context = "general",
  instructions = null,
  voice = VOICE_NAME,
  model = VOICE_MODEL,
  speed = VOICE_SPEED
}) {
  if (
    VOICE_PROVIDER !==
    "openai"
  ) {
    console.log(
      "VOICE: Sağlayıcı aktif değil:",
      VOICE_PROVIDER
    );

    return null;
  }

  if (
    !OPENAI_API_KEY
  ) {
    console.log(
      "VOICE: OPENAI_API_KEY bulunamadı."
    );

    return null;
  }

  const input =
    normalizeText(text);

  if (!input) {
    return null;
  }

  const finalInstructions =
    instructions ||
    buildVoiceInstructions(
      context
    );

  const finalSpeed =
    clampSpeed(speed);

  try {
    console.log(
      "VOICE: Ses üretiliyor...",
      {
        model,
        voice,
        context
      }
    );

    const response =
      await fetch(
        "https://api.openai.com/v1/audio/speech",
        {
          method: "POST",

          headers: {
            "Authorization":
              `Bearer ${OPENAI_API_KEY}`,
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            model,
            voice,
            input,

            instructions:
              finalInstructions,

            response_format:
              "mp3",

            speed:
              finalSpeed
          })
        }
      );

    if (
      !response.ok
    ) {
      const errorText =
        await response
          .text();

      console.log(
        "VOICE: OpenAI hata:",
        response.status,
        errorText.slice(
          0,
          500
        )
      );

      return null;
    }

    const arrayBuffer =
      await response.arrayBuffer();

    const buffer =
      Buffer.from(
        arrayBuffer
      );

    if (
      !buffer.length
    ) {
      console.log(
        "VOICE: Boş ses döndü."
      );

      return null;
    }

    console.log(
      "VOICE: Ses hazır:",
      buffer.length,
      "bytes"
    );

    return {
      buffer,
      contentType:
        "audio/mpeg"
    };
  } catch (error) {
    console.log(
      "VOICE: Beklenmeyen hata:",
      error.message
    );

    return null;
  }
}

export function storeAudio(
  buffer,
  contentType = "audio/mpeg"
) {
  if (
    !buffer ||
    !buffer.length
  ) {
    return null;
  }

  while (
    audioStore.size >=
    MAX_AUDIO_ITEMS
  ) {
    const oldestId =
      audioStore
        .keys()
        .next()
        .value;

    if (!oldestId) {
      break;
    }

    audioStore.delete(
      oldestId
    );
  }

  const id =
    randomUUID();

  audioStore.set(
    id,
    {
      buffer,
      contentType
    }
  );

  const timer =
    setTimeout(() => {
      audioStore.delete(
        id
      );
    }, AUDIO_TTL_MS);

  if (
    typeof timer.unref ===
    "function"
  ) {
    timer.unref();
  }

  return id;
}

export function getAudio(
  id
) {
  return (
    audioStore.get(id) ||
    null
  );
}
