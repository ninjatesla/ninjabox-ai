import * as Astronomy from "astronomy-engine";

const ZODIAC = [
  { name: "Koç", key: "koc", element: "Ateş", mode: "Öncü", ruler: "Mars", traits: "girişimcilik, cesaret ve doğrudanlık" },
  { name: "Boğa", key: "boga", element: "Toprak", mode: "Sabit", ruler: "Venüs", traits: "istikrar, sabır ve güven arayışı" },
  { name: "İkizler", key: "ikizler", element: "Hava", mode: "Değişken", ruler: "Merkür", traits: "merak, iletişim ve esneklik" },
  { name: "Yengeç", key: "yengec", element: "Su", mode: "Öncü", ruler: "Ay", traits: "duygusal sezgi, aidiyet ve koruyuculuk" },
  { name: "Aslan", key: "aslan", element: "Ateş", mode: "Sabit", ruler: "Güneş", traits: "yaratıcılık, sıcaklık ve kendini ifade etme" },
  { name: "Başak", key: "basak", element: "Toprak", mode: "Değişken", ruler: "Merkür", traits: "dikkat, düzen ve pratik çözüm üretme" },
  { name: "Terazi", key: "terazi", element: "Hava", mode: "Öncü", ruler: "Venüs", traits: "denge, uyum ve adil iletişim" },
  { name: "Akrep", key: "akrep", element: "Su", mode: "Sabit", ruler: "Plüton/Mars", traits: "derinlik, kararlılık ve güven" },
  { name: "Yay", key: "yay", element: "Ateş", mode: "Değişken", ruler: "Jüpiter", traits: "keşif, öğrenme ve özgürlük" },
  { name: "Oğlak", key: "oglak", element: "Toprak", mode: "Öncü", ruler: "Satürn", traits: "sorumluluk, hedef ve uzun vadeli emek" },
  { name: "Kova", key: "kova", element: "Hava", mode: "Sabit", ruler: "Satürn/Uranüs", traits: "bağımsız düşünce, yenilik ve topluluk" },
  { name: "Balık", key: "balik", element: "Su", mode: "Değişken", ruler: "Jüpiter/Neptün", traits: "hayal gücü, empati ve sezgi" }
];

const PLANETS = [
  ["Güneş", Astronomy.Body.Sun, false],
  ["Ay", Astronomy.Body.Moon, false],
  ["Merkür", Astronomy.Body.Mercury, true],
  ["Venüs", Astronomy.Body.Venus, true],
  ["Mars", Astronomy.Body.Mars, true],
  ["Jüpiter", Astronomy.Body.Jupiter, true],
  ["Satürn", Astronomy.Body.Saturn, true],
  ["Uranüs", Astronomy.Body.Uranus, true],
  ["Neptün", Astronomy.Body.Neptune, true],
  ["Plüton", Astronomy.Body.Pluto, true]
];

function normalize(value = "") {
  return String(value)
    .toLocaleLowerCase("tr-TR")
    .replace(/[ıİ]/g, "i").replace(/[ğĞ]/g, "g")
    .replace(/[üÜ]/g, "u").replace(/[şŞ]/g, "s")
    .replace(/[öÖ]/g, "o").replace(/[çÇ]/g, "c")
    .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function parseBurcInput(message = "") {
  const text = normalize(message);
  const risingMentioned = /\b(yukselen|asc|ascendant)\b/.test(text);
  const matches = [];
  for (const sign of ZODIAC) {
    const re = new RegExp(`\\b${sign.key}\\b`, "g");
    let match;
    while ((match = re.exec(text)) !== null) matches.push({ sign, index: match.index });
  }
  matches.sort((a, b) => a.index - b.index);
  const unique = [];
  for (const match of matches) if (!unique.some(x => x.sign.key === match.sign.key)) unique.push(match);
  if (unique.length === 0) return null;
  if (risingMentioned && unique.length < 2) return null;
  let sun = unique[0].sign;
  let rising = null;
  if (unique.length >= 2) {
    if (risingMentioned) {
      const markerIndex = text.search(/\b(yukselen|asc|ascendant)\b/);
      if (markerIndex < unique[0].index) {
        rising = unique[0].sign;
        sun = unique[1].sign;
      } else {
        rising = unique.find(x => x.index > markerIndex)?.sign || unique[1].sign;
      }
    } else {
      rising = unique[1].sign;
    }
  }
  return { sunSign: sun.name, risingSign: rising?.name || null, normalized: text };
}

function normalizeDegrees(degrees) {
  return ((degrees % 360) + 360) % 360;
}
function signedAngleDifference(a, b) {
  return ((a - b + 540) % 360) - 180;
}
function zodiacAt(longitude) {
  const normalized = normalizeDegrees(longitude);
  const index = Math.floor(normalized / 30);
  return { sign: ZODIAC[index].name, degree: normalized % 30 };
}
function getLongitude(body, date) {
  const vector = Astronomy.GeoVector(body, date, true);
  return normalizeDegrees(Astronomy.Ecliptic(vector).elon);
}

export function getCurrentEphemeris(now = new Date()) {
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const planets = PLANETS.map(([name, body, checkRetrograde]) => {
    const longitude = getLongitude(body, now);
    const position = zodiacAt(longitude);
    let retrograde = false;
    if (checkRetrograde) retrograde = signedAngleDifference(longitude, getLongitude(body, yesterday)) < 0;
    return { name, longitude, sign: position.sign, degree: Number(position.degree.toFixed(2)), retrograde };
  });
  const major = planets.filter(p => ["Güneş", "Ay", "Merkür", "Venüs", "Mars", "Jüpiter", "Satürn"].includes(p.name));
  const aspectDefinitions = [
    { name: "kavuşum", angle: 0, orb: 8 },
    { name: "karşıt", angle: 180, orb: 8 },
    { name: "kare", angle: 90, orb: 6 },
    { name: "üçgen", angle: 120, orb: 6 },
    { name: "altmışlık", angle: 60, orb: 4 }
  ];
  const aspects = [];
  for (let i = 0; i < major.length; i++) {
    for (let j = i + 1; j < major.length; j++) {
      const separation = Math.abs(signedAngleDifference(major[i].longitude, major[j].longitude));
      for (const aspect of aspectDefinitions) {
        const orb = Math.abs(separation - aspect.angle);
        if (orb <= aspect.orb) aspects.push({ planets: `${major[i].name}-${major[j].name}`, aspect: aspect.name, orb: Number(orb.toFixed(1)) });
      }
    }
  }
  aspects.sort((a, b) => a.orb - b.orb);
  return {
    calculatedAt: now.toISOString(),
    zodiac: "Tropikal zodyak; Dünya merkezli görünür ekliptik boylamlar",
    planets: planets.map(({ name, sign, degree, retrograde }) => ({ name, sign, degree, retrograde })),
    aspects: aspects.slice(0, 8)
  };
}

export function buildBurcPrompt({ username, sunSign, risingSign, ephemeris }) {
  const risingText = risingSign
    ? `İzleyicinin bildirdiği Güneş burcu: ${sunSign}. Bildirdiği yükselen burç: ${risingSign}. Yükselenin doğum verileriyle bağımsız doğrulanmadığını belirtmeden, kullanıcı beyanı olarak kullan.`
    : `İzleyicinin bildirdiği tek bilgi Güneş burcu: ${sunSign}. Yükselenini bilmiyor; yükselen varmış gibi yorum yapma.`;
  return `Sen astroloji geleneğini iyi bilen, ölçülü ve açıklayıcı bir astroloji yorumcususun. Türkçe canlı yayında 30-45 saniyede okunabilecek doğal bir yorum hazırla.

İzleyici: ${username || "izleyici"}
${risingText}

GERÇEK HESAPLAMA İLE ELDE EDİLEN GÜNCEL EFEMERİS (tahmin etme, yalnızca buradaki verileri kullan):
${JSON.stringify(ephemeris)}

Kurallar:
- 70-95 Türkçe kelime yaz; 30-45 saniyede doğal seslendirilebilsin.
- Genel yorumun dört alanına değin: karakter, ilişkiler, iş/hedefler ve yakın dönem.
- Güneş burcunun sembolik özelliklerini merkeze al; yükselen verildiyse bunu dışa yansıyan tarzla birlikte yorumla.
- Efemeristeki en fazla bir veya iki anlamlı gökyüzü göstergesini kullan. Gerçek listede olmayan açı, gezegen konumu veya retro hareket uydurma.
- Bu efemeris güncel gökyüzünü gösterir; izleyicinin doğum haritası değildir. Doğum tarihi, saati ve yeri olmadan kişisel transit veya natal açı iddiası kurma.
- Astrolojiyi sembolik yorum olarak sun; kesin gelecek, garanti, korkutma, sağlık/ölüm, finansal kazanç garantisi veya ilişki hakkında kesin hüküm verme.
- Boş ve herkese uyacak klişeleri azalt; uygulanabilir, nazik bir öneriyle bitir.
- Kart, Tarot veya başka bir sistemden söz etme.
- Yalnızca seslendirilecek yorumu ver; başlık ve madde işareti yazma.`;
}

function localCommentary({ username, sunSign, risingSign, ephemeris }) {
  const sun = ZODIAC.find(s => s.name === sunSign) || ZODIAC[0];
  const rising = risingSign ? ZODIAC.find(s => s.name === risingSign) : null;
  const venus = ephemeris.planets.find(p => p.name === "Venüs");
  const mercury = ephemeris.planets.find(p => p.name === "Merkür");
  const work = ephemeris.planets.find(p => p.name === "Mars");
  const risingSentence = rising
    ? `Yükselen ${rising.name} etkisi, insanlara yaklaşımında ${rising.traits} temasını öne çıkarabilir.`
    : "Yükselen bilgisi olmadığı için yorumunu yalnızca Güneş burcun üzerinden yapıyorum.";
  return `${username ? username + ", " : ""}${sun.name} burcunun astrolojik teması ${sun.traits}. İlişkilerde beklentilerini açık söylemek ve karşı tarafı da dinlemek sana yardımcı olabilir. ${risingSentence} İş ve hedeflerinde acele etmek yerine önceliklerini netleştir; küçük ama düzenli adımlar daha sürdürülebilir olur. Güncel gökyüzünde Venüs ${venus.sign} burcunda, Merkür ${mercury.sign} burcunda ve Mars ${work.sign} burcunda. Bunları kesin olayların habercisi değil, ilişkilerde, iletişimde ve motivasyonda üzerinde düşünebileceğin sembolik temalar olarak değerlendir. Önümüzdeki günlerde bir konuya odaklanıp gereksiz yükleri azaltmayı dene.`;
}

export async function generateBurcCommentary({ username, sunSign, risingSign = null, geminiApiKey, geminiModels = [], openaiApiKey, openaiModel }) {
  const ephemeris = getCurrentEphemeris();
  const prompt = buildBurcPrompt({ username, sunSign, risingSign, ephemeris });
  const fallback = localCommentary({ username, sunSign, risingSign, ephemeris });
  const valid = text => {
    if (typeof text !== "string") return false;
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    return words >= 55 && words <= 120;
  };

  if (geminiApiKey) {
    for (const model of geminiModels) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 260, temperature: 0.65 }
          }),
          signal: AbortSignal.timeout(12000)
        });
        if (!response.ok) continue;
        const data = await response.json();
        const answer = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join(" ").trim();
        if (valid(answer)) return { answer, ephemeris, source: `gemini:${model}` };
      } catch (error) {
        // Bir sonraki model denenir; son çare yerel, efemeris kullanan yorumdur.
      }
    }
  }

  if (openaiApiKey && openaiModel) {
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openaiApiKey}` },
        body: JSON.stringify({ model: openaiModel, input: prompt, max_output_tokens: 260 }),
        signal: AbortSignal.timeout(12000)
      });
      if (response.ok) {
        const data = await response.json();
        const answer = data.output_text?.trim();
        if (valid(answer)) return { answer, ephemeris, source: `openai:${openaiModel}` };
      }
    } catch (error) {
      // Yerel yedek yorum kullanılacak.
    }
  }
  return { answer: fallback, ephemeris, source: "local-ephemeris-fallback" };
}

export const SUPPORTED_ZODIAC_SIGNS = ZODIAC.map(({ name }) => name);
