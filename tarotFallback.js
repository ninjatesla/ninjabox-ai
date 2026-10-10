import TAROT_DECK from "./tarotDeck.js";

// Shared intent analysis for AI prompts and the local fallback.
export function normalizeTarotText(value = "") {
  return String(value)
    .toLocaleLowerCase("tr-TR")
    .replace(/[ıİ]/g, "i").replace(/[ğĞ]/g, "g")
    .replace(/[üÜ]/g, "u").replace(/[şŞ]/g, "s")
    .replace(/[öÖ]/g, "o").replace(/[çÇ]/g, "c")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ").trim();
}

const has = (text, regex) => regex.test(text);

export function detectTarotIntent(question = "") {
  const q = normalizeTarotText(question);
  let category = "genel";
  let intent = "genel_soru";

  // More specific intents must be checked before broad love/career matches.
  if (/\b(aldat|ihanet|baska biri|ucuncu kisi|sadik mi|sadakat|beni kandir|yalan soyl|bir sey mi sakliyor|ne sakliyor)\w*/.test(q)) {
    category = "ihanet"; intent = "guven_ve_ihanet";
  } else if (/\b(baris|barisir|barisacak|barisma|geri don|geri gelir|geri doner|eski sevgili|eski es|pisman|ozur|affeder|engelini acar|engelimi kaldir|mesaj atar|arayacak mi|arar mi|yazar mi|yazacak mi|ne zaman arar|ne zaman yazar|ne zaman doner|kiminle bulus|nerede bulus|ne zaman bulus)\w*/.test(q)) {
    category = "barisma"; intent = "barisma_iletisim_geri_donus";
  } else if (/\b(yks|universite|universiteye|sinav|sinavi|sinavim|sinavdan|bolum|bolume|okula|okul|mezun|ders|dersler|egitim|yerles|kazan|tercih|puan|diploma|yks\w*)\w*/.test(q)) {
    category = "egitim"; intent = /\b(yks|sinav|puan|tercih|kazan|yerles)\w*/.test(q) ? "sinav_ve_sonuc" : "egitim_gelecegi";
  } else if (/\b(is bul|is bulabil|is bulamay|ise gir|ise alin|ise alin|is basvuru|basvurum|kariyer|meslek|terfi|patron|mudur|maas|is hayat|calisma hayat|is degistir|isten cikar|is yer|mulakat|cv|isyeri)\w*/.test(q)) {
    category = "is"; intent = /\b(is bul|ise gir|ise alin|basvuru|mulakat|cv)\w*/.test(q) ? "is_bulma_ve_basvuru" : "kariyer_ve_is_hayati";
  } else if (/\b(para|maddi|borc|borclar|gelir|kazanc|yatirim|zengin|fakir|birikim|odeme|miras|maddi durum|finans|butce|para kazan|borc kapat)\w*/.test(q)) {
    category = "para"; intent = /\b(borc|odeme|kapat)\w*/.test(q) ? "borc_ve_odeme" : "maddi_durum";
  } else if (/\b(ayril|ayrilik|bosan|bosanma|terk|bitti mi|bitecek mi|ayri kal|ayri miyiz|ayriliyor)\w*/.test(q)) {
    category = "ayrilik"; intent = "ayrilik_ve_bitirme";
  } else if (/\b(yeni iliski|yeni biri|yeni ask|yeni sevgili|hayatima biri|sevgili olacak|ne zaman biriyle)\w*/.test(q)) {
    category = "yeniIliski"; intent = "yeni_iliski";
  } else if (/\b(evlen|evlilik|nikah|esim|esimle|evli miyiz|evli mi|ciddi iliski)\w*/.test(q)) {
    category = "ask"; intent = "evlilik_ve_baglanma";
  } else if (/\b(seviyor|beni sev|seviyor mu|duygu|hissediyor|hisleri|dusunuyor|ozluyor|kiskaniyor|ask|iliski|sevgili|hoslaniyor|kalbinde|beni istiyor)\w*/.test(q)) {
    category = "ask"; intent = "duygular_ve_iliski";
  } else if (/\b(gelecek|ileride|onumuzdeki|hayatim|ne olacak|neler olacak|tasini|ev al|araba al|genel olarak)\w*/.test(q)) {
    category = "gelecek"; intent = "genel_gelecek";
  }

  return { category, intent, normalized: q };
}

function getMeaningParts(card, orientation) {
  return (orientation === "upright" ? card.upright : card.reversed)
    .split(",").map((part) => part.trim()).filter(Boolean);
}

function selectedMeaning(card, orientation) {
  const parts = getMeaningParts(card, orientation);
  if (!parts.length) return "belirsizlik";
  if (parts.length === 1) return parts[0].toLocaleLowerCase("tr-TR");
  const start = Math.floor(Math.random() * parts.length);
  return `${parts[start].toLocaleLowerCase("tr-TR")} ve ${parts[(start + 1) % parts.length].toLocaleLowerCase("tr-TR")}`;
}

const templates = {
  ask: {
    positive: ["Bu kart, aranızdaki duygusal bağın güçlenebileceğini anlatıyor. Yine de gerçek niyeti en iyi davranışları ve açık iletişim gösterir.", "Kartın olumlu tarafı yakınlaşma ve duyguların paylaşılması. Bunu kesin bir sonuç değil, ilişkinin gelişmesi için bir ihtimal olarak oku."],
    difficult: ["Kart, duygularda kararsızlık veya araya giren mesafeye dikkat çekiyor. Şu an netlik için sözlerden çok tutarlı davranışlara bakmak önemli.", "Bu kart ilişkide bir pürüz ya da duygusal uzaklık gösteriyor. Sonucu kesinleştirmiyor; açık konuşma tabloyu daha iyi gösterebilir."],
    neutral: ["Kart, duyguların henüz tam netleşmediğini anlatıyor. Acele sonuç çıkarmadan karşılıklı davranışları gözlemlemek daha doğru."]
  },
  barisma: {
    positive: ["Kart, geçmişten gelen bağın yeniden gündeme gelebileceğini ve iletişim için bir kapı açılabileceğini gösteriyor. Bu, kesin dönüş sözü değil; iki tarafın adımı belirleyici.", "Barışma açısından kart umut veren bir işaret taşıyor; konuşma fırsatı doğabilir. Ancak kalıcı bir yakınlaşma için eski sorunların da ele alınması gerekir."],
    difficult: ["Kart, şu an barışmanın önünde kırgınlık veya iletişim engeli olduğunu anlatıyor. Yakın zamanda net bir dönüş görünümü zayıf; baskı kurmadan alan tanımak daha iyi olabilir.", "Bu kart geçmişte kalan sorunların hâlâ etkili olduğunu söylüyor. Barışma hemen kolay görünmüyor; değişim için iki tarafın da isteği gerekir."],
    neutral: ["Kart, geri dönüş konusunda bekleme ve belirsizlik temasını taşıyor. İletişim ihtimali tamamen kapanmış gibi okunmaz ama net bir söz de vermez."]
  },
  ihanet: {
    positive: ["Kart, güvenin açık iletişimle güçlenebileceğini anlatıyor; tek başına ihanet göstergesi değil. Şüpheyi kanıt gibi kabul etmeden somut davranışlara bak.", "Bu kart açıklık ve dürüst konuşma ihtiyacını öne çıkarıyor. Aldatma hakkında kesin hüküm vermez; sakin bir konuşma daha sağlıklı olur."],
    difficult: ["Kart, ilişkide güvensizlik, belirsizlik veya saklanan duygular temasını taşıyor; bu, aldatmanın kanıtı değildir. Varsayımla suçlamak yerine gördüğün somut davranışları konuş.", "Kart güven konusunda dikkatli olmayı söylüyor ama birinin aldattığını doğrulayamaz. Netlik için kanıtsız suçlama yerine açık iletişime odaklan."],
    neutral: ["Kart, güven konusunun netleşmeye ihtiyaç duyduğunu anlatıyor. İhanet var ya da yok diye kesin bir sonuç çıkarılamaz; konuşma ve gerçek davranışlar önemlidir."]
  },
  egitim: {
    positive: ["Kart, hazırlık ve emeğin karşılığını alma yönünde olumlu bir tema taşıyor. Sonucu garanti etmez; düzenli çalışma ve doğru tercihlerin etkisi büyük.", "Eğitim açısından kart ilerleme ve fırsat temasını destekliyor. Şansın yanında hazırlığını sürdürmen ve seçeneklerini iyi değerlendirmen önemli."],
    difficult: ["Kart, hedefe ulaşmak için gecikme, eksik hazırlık veya dikkat dağınıklığını gözden geçirmen gerektiğini söylüyor. Sonuç kesin değil; planını güçlendirmek elinde.", "Bu kart sürecin kolay olmayabileceğine ve daha fazla disiplin gerekebileceğine işaret ediyor. Bunu başarısızlık hükmü olarak değil, hazırlığı gözden geçirme çağrısı olarak düşün."],
    neutral: ["Kart, sonucun henüz netleşmediğini ve sürecin emek istediğini anlatıyor. Çalışma düzenin ve tercihlerin, karttan bağımsız olarak belirleyici olacak."]
  },
  is: {
    positive: ["Kart, iş fırsatı ve ilerleme açısından destekleyici bir tema taşıyor. Başvurularını sürdürüp kendini görünür kılman bu ihtimali güçlendirebilir.", "Kariyer tarafında yeni bir kapı veya becerilerini gösterme fırsatı öne çıkıyor. Sonuç garanti değil; hazırlık ve takip önemli."],
    difficult: ["Kart, iş konusunda gecikme veya engelleri gösteriyor; bu, hiç iş bulamayacağın anlamına gelmez. Başvurularını gözden geçirip yeni yollar denemek faydalı olabilir.", "İş hayatında şu an zorlayıcı bir dönem teması var. Tek bir sonuca bağlanma; becerilerini geliştirmek ve farklı fırsatlara başvurmak elinde."],
    neutral: ["Kart, kariyer konusunda seçenekleri dikkatle değerlendirme dönemini anlatıyor. Net sonuçtan çok plan, hazırlık ve doğru fırsatı seçmek öne çıkıyor."]
  },
  para: {
    positive: ["Kart, maddi konuda fırsat ve kaynakları daha iyi değerlendirme temasını taşıyor. Kazanç garanti değil; planlı hareket etmek ve harcamaları dengelemek önemli.", "Para açısından olumlu bir açılım ihtimali var; özellikle fırsatları fark etmek öne çıkıyor. Büyük riskleri düşünmeden almak yerine hesabını sağlam yap."],
    difficult: ["Kart, maddi konularda temkin ve kontrol ihtiyacını gösteriyor. Ani harcamalardan kaçınmak, bütçeyi gözden geçirmek ve riskleri sınırlamak daha güvenli olur.", "Bu kart para akışında gecikme veya dengesizlik temasını taşıyor. Kesin kayıp demek değil; harcamaları planlamak ve acele karar vermemek önemli."],
    neutral: ["Kart, maddi durumun dikkatli planlama istediğini anlatıyor. Büyük bir sonuç vaat etmez; bütçe ve gerçekçi adımlar belirleyici olacak."]
  },
  ayrilik: {
    positive: ["Kart, zor bir dönemin ardından daha net bir sayfa açma ihtimalini anlatıyor. Bu, mutlaka ayrılık ya da dönüş demek değil; ihtiyaçlarını dürüstçe değerlendir.", "Bu kart değişim ve netleşme temasını taşıyor. İlişkinin devamı kadar, sana iyi gelen sınırları belirlemek de önemli."],
    difficult: ["Kart, aranızdaki kopukluk veya çözülmemiş sorunların ağır bastığını gösteriyor. Hemen düzelme kolay görünmeyebilir; kararını yalnızca karta göre verme.", "Bu kart ilişkide bitiş veya mesafe temasını öne çıkarıyor. Kesin hüküm değil; ilişkinin gerçek durumu ve iki tarafın isteği belirleyici."],
    neutral: ["Kart, ilişkinin yönü konusunda bir değerlendirme dönemini anlatıyor. Netlik için beklentileri ve sınırları açıkça konuşmak önemli."]
  },
  yeniIliski: {
    positive: ["Kart, yeni tanışma ve duygusal başlangıçlara açık olmayı destekliyor. Zaman ya da kişi garantisi vermez; sosyal fırsatlara açık kalmak iyi olabilir.", "Aşk hayatında yeni bir sayfa ihtimali öne çıkıyor. Acele etmeden, karşındaki kişiyi tanıyarak ilerlemek önemli."],
    difficult: ["Kart, yeni bir ilişki öncesinde geçmiş yüklerini veya beklentilerini gözden geçirmen gerektiğini anlatıyor. Bu, yeni bir ilişki olmayacak demek değil.", "Şu an kart daha çok temkin ve içsel netleşme temasını taşıyor. Kendine zaman tanımak, yeni bir bağın daha sağlıklı kurulmasına yardımcı olabilir."],
    neutral: ["Kart, yeni ilişki konusunda açık ama acele etmeyen bir yaklaşımı öneriyor. Sonuçtan çok, nasıl bir ilişki istediğini netleştirmek öne çıkıyor."]
  },
  gelecek: {
    positive: ["Kart, önünde fırsat ve ilerleme teması olduğunu anlatıyor. Bu kesin bir gelecek vaadi değil; fırsatları fark edip adım atman önemli.", "Yakın dönem için umut veren bir tema var. Gelişmelerin nasıl şekilleneceği seçimlerine ve koşullara da bağlı."],
    difficult: ["Kart, önündeki süreçte sabır ve bazı engellerle yüzleşme temasını taşıyor. Bunu kaçınılmaz kötü sonuç olarak değil, hazırlıklı olma çağrısı olarak oku.", "Bu kart gecikme veya belirsizliğe dikkat çekiyor. Acele karar vermeden seçeneklerini değerlendirmen daha iyi olabilir."],
    neutral: ["Kart, önündeki dönemde bazı şeylerin henüz şekillenmediğini anlatıyor. Esnek kalıp adımlarını koşullara göre ayarlamak önemli."]
  },
  genel: {
    positive: ["Kartın ana mesajı fırsatları fark etmek ve cesur ama düşünülmüş adımlar atmak. Sonuç kesin değil; seçimlerin sürecin parçası.", "Bu kart olumlu bir açılım ve ilerleme temasını taşıyor. Fırsatları değerlendirirken gerçekçi kalman önemli."],
    difficult: ["Kart, bir konuda dikkatli olma ve yaklaşımını gözden geçirme mesajı veriyor. Bu, kötü bir sonucun kesin olduğu anlamına gelmez.", "Bu kart bir engel veya belirsizlik temasını öne çıkarıyor. Acele etmek yerine durumu değerlendirip sonraki adımı planlamak faydalı."],
    neutral: ["Kart, konunun henüz tam netleşmediğini ve sürecin gelişmeye açık olduğunu anlatıyor. Sabırla gözlemleyip seçeneklerini değerlendirmek önemli."]
  }
};

function toneFor(meaning) {
  const m = normalizeTarotText(meaning);
  if (/umut|basari|mutluluk|firsat|ilerleme|uyum|sevgi|bereket|zafer|tamamlanma|cesaret|yeni baslangic|olumlu gelecek|irade/.test(m)) return "positive";
  if (/gecikme|engel|belirsizlik|korku|haksizlik|uyumsuzluk|kararsizlik|kontrol kaybi|umutsuzluk|hayal kirikligi|bagimlilik|baski|izolasyon|riskli adim|yikilip|kapanmayan gecmis|dengesizlik|yanlis secim/.test(m)) return "difficult";
  return "neutral";
}

export function buildFallbackAnswer(card, orientation, category) {
  const meaning = orientation === "upright" ? card.upright : card.reversed;
  const tone = toneFor(meaning);
  const categoryTemplates = templates[category] || templates.genel;
  const options = categoryTemplates[tone] || categoryTemplates.neutral;
  const base = options[Math.floor(Math.random() * options.length)];
  const cardTheme = meaning.toLocaleLowerCase("tr-TR").replace(/\.$/, "");
  // Keep the real card meaning in the fallback so the reading is not generic.
  return `${base} Kartın ${cardTheme} teması da bu yoruma eşlik ediyor.`;
}

export function getLocalTarotAnswer({ question, cardId, orientation }) {
  const card = TAROT_DECK.find((c) => c.id === cardId);
  if (!card) return { answer: "Kart mesajı alınamadı. Lütfen tekrar deneyelim.", category: "genel", intent: "genel_soru" };
  const analysis = detectTarotIntent(question);
  return {
    answer: buildFallbackAnswer(card, orientation, analysis.category),
    category: analysis.category,
    intent: analysis.intent,
    cardName: card.name,
    orientation,
    meaning: orientation === "upright" ? card.upright : card.reversed
  };
}
