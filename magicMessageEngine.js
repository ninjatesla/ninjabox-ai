
import TAROT_DECK from "./tarotDeck.js";

const CARD_MESSAGES = {
  ar00: ["Yeni bir başlangıca açık ol. Cesur davran ama adım atmadan önce neyi göze aldığını düşün.", "Bir fırsata hazırlıksız atılmak yerine dur, planını netleştir ve sonra ilerle."],
  ar01: ["Sahip olduğun becerileri doğru kullanırsan önündeki fırsatları değerlendirebilirsin.", "Gücünü dağıtan konuları fark et. Sonuç almak için niyetini ve planını netleştir."],
  ar02: ["Her şeyi hemen açıklığa kavuşturmak zorunda değilsin. Sezgilerini dinle ve gözlem yap.", "Belirsizlikte varsayımlara kapılma. Eksik bilgileri tamamlamadan karar verme."],
  ar03: ["Emek verdiğin bir konu büyüyebilir. Kendine ve geliştirmek istediğin şeye zaman ayır.", "Başkalarına gösterdiğin özeni kendinden esirgeme. Enerjini dengeli kullan."],
  ar04: ["Düzenli ve kararlı davranmak, kontrol etmek istediğin konuyu sağlamlaştırabilir.", "Her şeyi kontrol etmeye çalışma. Esnek davranmak çözüm bulmanı kolaylaştırabilir."],
  ar05: ["Güvendiğin birinden öğüt almak veya deneyiminden yararlanmak sana yol gösterebilir.", "Alışılmış kuralları sorgula; sana gerçekten uyan yolu kendi değerlerinle belirle."],
  ar06: ["Kalbinle aklını birlikte dinle. İlişkilerde karşılıklı uyum ve açık seçimler önem kazanıyor.", "Bir ilişkideki uyumsuzluğu görmezden gelme. Ne istediğini dürüstçe belirle."],
  ar07: ["Kararlı bir yön seçip odağını korursan ilerleme sağlayabilirsin.", "Acele etmek yerine yönünü yeniden belirle. Kontrol edemediğin şeylere fazla enerji harcama."],
  ar08: ["Sabır ve sakinlik, düşündüğünden daha güçlü bir etki yaratabilir.", "Kendine fazla yüklenme. Gücünü yeniden toplamak için duygularına alan aç."],
  ar09: ["Biraz geri çekilip düşünmek, aradığın cevabı daha net görmene yardımcı olabilir.", "Kendini herkesten uzaklaştırma. Güvendiğin biriyle konuşmak yeni bir bakış açısı getirebilir."],
  ar10: ["Değişen koşulları bir fırsat olarak değerlendir; yeni gelişmelere açık kal.", "Her şey senin kontrolünde olmayabilir. Gecikmeleri değerlendirip planını yeniden düzenle."],
  ar11: ["Dengeli ve dürüst bir karar, uzun vadede daha sağlam bir sonuç getirebilir.", "Bir konuda adaletsizlik hissediyorsan gerçeklere bak ve kendi sorumluluğunu da değerlendir."],
  ar12: ["Şimdilik beklemek ve olaya başka açıdan bakmak sana yeni bir anlayış kazandırabilir.", "Seni ilerlemekten alıkoyan gereksiz bekleyişi fark et. Küçük bir adımla başlayabilirsin."],
  ar13: ["Eski bir dönemi kapatmak, yeni bir başlangıç için yer açabilir.", "Değişime direnmek seni yoruyor olabilir. Artık geride bırakman gereken şeyi düşün."],
  ar14: ["Sabırlı ve ölçülü ilerle. Denge kurduğunda işler daha yönetilebilir hale gelebilir.", "Aşırıya kaçtığın alanı fark et. Hızını azaltıp önceliklerini yeniden düzenle."],
  ar15: ["Seni kendine bağlayan alışkanlıkları fark et. Seçimlerini daha bilinçli yapabilirsin.", "Sağlıksız bir bağdan uzaklaşmak için sınırlarını hatırla ve küçük bir adım at."],
  ar16: ["Sarsıcı bir farkındalık, yeniden ve daha sağlam bir düzen kurmana yardımcı olabilir.", "Görmezden geldiğin bir sorunu ertelemek yerine sakin biçimde ele al."],
  ar17: ["Umudunu koru. İyileşme ve yeniden ilham bulma sürecine kendine zaman tanı.", "Hayal kırıklığı yaşadıysan bütün ihtimalleri kapatma. Güvenini küçük adımlarla yeniden kur."],
  ar18: ["Her şey henüz net olmayabilir. Sezgilerini dinle ama kararlarını somut bilgilerle destekle.", "Belirsizliği azaltmak için açık sorular sor ve varsayımlarla gerçekleri birbirinden ayır."],
  ar19: ["Açıklık ve iyimserlik, emek verdiğin konudaki olumlu yanları görmeni sağlayabilir.", "Geçici bir gölgelenmeyi kalıcı başarısızlık sayma. Beklentilerini gerçekçi tut."],
  ar20: ["Geçmişte yaşananlardan ders çıkarıp yeni bir karar verme zamanı olabilir.", "Geçmişe takılı kalmak yerine bugün değiştirebileceğin noktaya odaklan."],
  ar21: ["Bir süreci tamamlamak ve emeğinin karşılığını değerlendirmek için uygun bir dönem olabilir.", "Tamamlanmamış bir işi belirle. Son adımı atmak için gerekenleri netleştir."],

  wa01: ["Yeni bir fikir veya heves doğabilir. Onu somut bir başlangıca dönüştür.", "Enerjin dağılmış olabilir. Yeni bir işe başlamadan önce gücünü toparla."],
  wa02: ["Önündeki seçenekleri değerlendir ve kısa vadeden çok uzun vadeli hedefini düşün.", "Kararsızlık seni bekletiyorsa seçeneklerini azaltıp gerçekçi bir plan yap."],
  wa03: ["Emeklerinin karşılığını almak için ufkunu genişlet ve gelişmeleri takip et.", "Sonuçların gecikmesi planını gözden geçirmen gerektiğini gösterebilir."],
  wa04: ["Huzuru, aidiyeti ve küçük başarıları paylaşmak sana iyi gelebilir.", "Ev veya yakın çevrende çözülmesi gereken bir gerilim varsa sakin bir konuşmayla başla."],
  wa05: ["Rekabet seni geliştirebilir; enerjini tartışmaya değil çözüme yönlendir.", "Her anlaşmazlığı kazanmak zorunda değilsin. Gereksiz çatışmadan uzaklaş."],
  wa06: ["Başarını görünür kılmaktan çekinme; emeğini takdir etmeyi de unutma.", "Takdir göremediğinde kendi ilerlemeni ölç. Değerini yalnızca başkalarının onayına bağlama."],
  wa07: ["Sınırlarını koru ve önemli gördüğün konuda kararlılığını sürdür.", "Yorgunluk birikmiş olabilir. Her mücadeleyi tek başına üstlenmek zorunda değilsin."],
  wa08: ["Beklediğin bir haber veya gelişme hız kazanabilir; hazırlıklı ve dikkatli ol.", "İletişimde gecikme varsa acele sonuç çıkarma. Gerekirse açıkça yeniden iletişim kur."],
  wa09: ["Son bir çaba gerekebilir. Temkinli ol ama geçmiş deneyimlerin seni durdurmasına izin verme.", "Sürekli tetikte olmak yorabilir. Nerede dinlenebileceğini ve destek alabileceğini düşün."],
  wa10: ["Üzerindeki yükleri sırala ve gerçekten sana ait olmayan sorumlulukları gözden geçir.", "Her işi aynı anda taşıma. Bir kısmını ertelemek veya paylaşmak rahatlatabilir."],
  wa11: ["Yeni bir merak veya haber seni harekete geçirebilir; önce ayrıntıları öğren.", "Aceleyle verilen sözler sorun yaratabilir. Harekete geçmeden önce planını tamamla."],
  wa12: ["Cesur bir adım atmak isteyebilirsin; hızını korurken tutarlılığı da gözet.", "Dürtüyle karar vermek yerine bir an dur ve sonuçlarını değerlendir."],
  wa13: ["Özgüvenini ortaya koy ve kendi kararlarına güvenmeyi öğren.", "Kıyaslama veya kıskançlık enerjini tüketiyorsa odağını kendi hedeflerine çevir."],
  wa14: ["Vizyonunu somut bir plana dönüştür. Liderlik, kararlılıkla birlikte sorumluluk da ister.", "Baskıyla sonuç almaya çalışma. Başkalarının görüşlerine alan aç ve planını yeniden değerlendir."],

  cu01: ["Duygusal anlamda yeni bir sayfaya açık ol. Samimi bir başlangıca yer açabilirsin.", "Duygularını bastırma; neye ihtiyaç duyduğunu anlamak için kendine zaman tanı."],
  cu02: ["Karşılıklı anlayış ve açık iletişim, bir bağı güçlendirebilir.", "Bir ilişkide denge bozulduysa beklentileri açıkça konuşmak önemli olabilir."],
  cu03: ["Sevdiklerinle vakit geçirmek ve güzel gelişmeleri paylaşmak sana enerji verebilir.", "Sosyal ortamda sınırlarını koru; her söze veya söylentiye hemen inanma."],
  cu04: ["Önündeki seçenekleri yeniden değerlendir; fark etmediğin bir imkân olabilir.", "İçe kapanmak yerine sana iyi gelen bir adım at ve ne istediğini yeniden düşün."],
  cu05: ["Kaybın yarattığı duygulara alan aç ama elinde kalan imkânları da görmeye çalış.", "Kabullenme ve iyileşme sürecinde ilerleyebilirsin. Kendine karşı sabırlı ol."],
  cu06: ["Geçmişten gelen bir anı sana neyin değerli olduğunu hatırlatabilir.", "Geçmişi sürekli yeniden yaşamak yerine bugünkü ihtiyaçlarına yönel."],
  cu07: ["Birden fazla ihtimal varsa hayalle gerçeği ayırıp önceliklerini netleştir.", "Kafa karışıklığını azaltmak için seçeneklerini somut ölçütlerle değerlendir."],
  cu08: ["Sana artık iyi gelmeyen bir durumdan uzaklaşmak yeni bir yol açabilir.", "Geride bıraktığın konuya dönme isteğini anlamaya çalış; gerçekten ne değişti?" ],
  cu09: ["Bir dileğini düşünürken elindeki güzelliklerin de farkına var.", "Dışarıdan her şey iyi görünse bile kendi gerçek ihtiyacını dürüstçe değerlendir."],
  cu10: ["Yakın ilişkilerinde güveni ve ortak mutluluğu besleyen şeylere zaman ayır.", "Aile veya yakın çevredeki gerilimi çözmek için beklentileri açıkça konuş."],
  cu11: ["Duygusal bir mesaj veya nazik bir yaklaşım için açık kal; sözleri davranışlarla birlikte değerlendir.", "Güzel sözlerin yanında tutarlılığa da bak. Beklentilerini gerçekçi tut."],
  cu12: ["Samimi bir yaklaşım veya romantik bir adım gündeme gelebilir; iletişime açık ol.", "Sözler ile davranışlar uyuşmuyorsa acele bağlanma. Tutarlılığı gözlemle."],
  cu13: ["Duygularını önemse ve başkalarını dinlerken kendi sınırlarını da koru.", "Başkalarının duygularını üstlenmek zorunda değilsin. Kendine de şefkat göster."],
  cu14: ["Sakin ve olgun bir yaklaşım, duygusal bir konuyu daha sağlıklı ele almana yardım edebilir.", "Duyguları bastırmak yerine onları açık ve saygılı biçimde ifade etmeyi dene."],

  sw01: ["Net bir konuşma veya doğru bilgi, önündeki kararı kolaylaştırabilir.", "Karar vermeden önce bilgileri kontrol et; yanlış anlaşılmaların önüne geç."],
  sw02: ["İki seçenek arasında kaldıysan acele etmeden gerçekleri ve ihtiyaçlarını tart.", "Ertelediğin bir kararı verebilmek için kaçındığın gerçeğe dürüstçe bak."],
  sw03: ["Canını acıtan bir deneyimden sonra iyileşmeye ve kendine şefkat göstermeye odaklan.", "Geçmişteki kırgınlıkları yavaş yavaş bırakmak için kendine alan tanı."],
  sw04: ["Biraz dinlenmek ve zihnini toparlamak, sonraki adımını daha net görmeni sağlayabilir.", "Hareketsizlik seni daha çok yoruyorsa küçük ve uygulanabilir bir adımla yeniden başla."],
  sw05: ["Bir tartışmada haklı çıkmaktan çok sorunu çözmeye odaklan.", "Gerilimi düşürmek ve konuşmaya alan açmak uzlaşmayı mümkün kılabilir."],
  sw06: ["Daha sakin bir döneme geçmek için seni yoran konudan mesafe almayı düşün.", "Geçmişe dönme isteğin varsa, aynı sorunun tekrar etmemesi için neyin değişmesi gerektiğini sor."],
  sw07: ["Bilgileri dikkatle değerlendir ve stratejini akıllıca kur; aceleyle güvenme.", "Gizli kalan bir konu açıklığa kavuşabilir; varsayım yerine doğrulanmış bilgiye dayan."],
  sw08: ["Kendini sıkışmış hissetsen de seçeneklerini yeniden değerlendirebilirsin.", "Seni kısıtlayan düşünceyi fark et ve atabileceğin en küçük adımı belirle."],
  sw09: ["Kaygıların zihninde büyüyebilir. Bir konuyu parçalara ayırıp somut olana odaklan.", "Zor düşünceler hafifleyebilir; destek istemekten ve dinlenmekten çekinme."],
  sw10: ["Zor bir dönemi kapatmak, yeniden toparlanmanın ilk adımı olabilir.", "En zor kısmı geride bırakmaya başlayabilirsin; iyileşmek için kendine zaman ver."],
  sw11: ["Bir haber veya yeni bilgi dikkatini çekebilir. Merakını koru ama doğrulamayı unutma.", "Duyduğun her şeyi yayma; konuşmadan önce bilgiyi kontrol et ve düşün."],
  sw12: ["Kararlı davran ama hızının başkalarını veya seni zorlamamasına dikkat et.", "Tepki vermeden önce dur. Aceleyle söylenen sözler gereksiz çatışma yaratabilir."],
  sw13: ["Duygularını ve gerçekleri birlikte değerlendirerek açık sınırlar koyabilirsin.", "Sertleşmeden de net olabilirsin. Kendini ifade ederken karşı tarafı dinlemeyi unutma."],
  sw14: ["Mantıklı bir plan ve tarafsız değerlendirme, karmaşık bir konuyu çözmene yardımcı olabilir.", "Katı bir tutum yerine yeni bilgileri dikkate al; adil ve esnek davran."],

  pe01: ["Somut bir fırsat veya maddi başlangıç gündeme gelebilir. Ayrıntıları inceleyip plan yap.", "Bir fırsat gecikiyorsa koşulları yeniden kontrol et ve kaynaklarını dikkatli kullan."],
  pe02: ["Birden fazla sorumluluğu dengeli yürütmek için zamanını ve kaynaklarını planla.", "Yükün artıyorsa öncelik belirle; her şeyi aynı anda yetiştirmeye çalışma."],
  pe03: ["Becerilerini geliştirmek ve başkalarıyla işbirliği yapmak emeklerinin değerini artırabilir.", "İşbirliğinde sorun varsa görevleri ve beklentileri daha açık hale getir."],
  pe04: ["Kaynaklarını korurken geleceğe yönelik güvenli bir plan oluştur.", "Her şeyi elinde tutmaya çalışmak seni sınırlayabilir. Nerede esneyebileceğini düşün."],
  pe05: ["Zorlayıcı bir dönemde destek istemek güçsüzlük değildir; seçeneklerini araştır.", "Koşullar yavaş yavaş iyileşebilir. Küçük destekleri ve somut çözümleri değerlendirmeye başla."],
  pe06: ["Yardımlaşma ve dengeli paylaşım bir konuyu kolaylaştırabilir.", "Verdiğin ve aldığın desteğin dengeli olmasına dikkat et; sınırlarını koru."],
  pe07: ["Ektiğin şeylerin sonuç vermesi zaman alabilir. Sabırlı ol ve ilerlemeyi ölç.", "Sonuç gecikiyorsa emeğini ve yöntemini değerlendir; gerekirse planını değiştir."],
  pe08: ["Düzenli çalışma ve pratik, becerini güçlendirebilir. Küçük ilerlemeleri sürdür.", "Tekdüzelik motivasyonunu düşürdüyse yöntemini yenile ve öğrenmeye yeniden alan aç."],
  pe09: ["Kendi emeğinle kurduğun güveni ve bağımsızlığı takdir et.", "Başarı uğruna yalnızlaşmamaya dikkat et; maddi hedeflerin kadar kişisel ihtiyaçlarını da önemse."],
  pe10: ["Uzun vadeli güvence için sağlam temeller kurmaya ve yakınlarınla plan yapmaya odaklan.", "Maddi veya ailevi beklentileri açıkça konuş; güveni korumak için gerçekçi plan yap."],
  pe11: ["Yeni bir iş veya öğrenme fırsatı somut bir başlangıca dönüşebilir; ayrıntıları araştır.", "Ertelediğin bir hedef varsa büyük adım bekleme. Küçük ve düzenli bir başlangıç yap."],
  pe12: ["Sabırlı ve istikrarlı ilerlemek, uzun vadede sağlam sonuçlar oluşturabilir.", "Aynı rutinde sıkıştıysan yöntemini gözden geçir; küçük bir değişiklik dene."],
  pe13: ["Pratik davranırken kendine ve çevrene güvenli bir alan yaratabilirsin.", "Başkalarını korumaya çalışırken kendi ihtiyaçlarını ihmal etme; yükünü paylaş."],
  pe14: ["Maddi konularda planlı ve güvenilir davranmak istikrarını destekleyebilir.", "Kazanç veya kontrol hırsının kararlarını yönetmesine izin verme; uzun vadeli dengeyi gözet."]
};

export function createMagicMessage(username = "") {
  if (!Array.isArray(TAROT_DECK) || TAROT_DECK.length !== 78) {
    throw new Error("Sihirli Mesaj için 78 kartlık Tarot destesi gerekli.");
  }

  const card = TAROT_DECK[Math.floor(Math.random() * TAROT_DECK.length)];
  const orientation = Math.random() < 0.5 ? "upright" : "reversed";
  const options = CARD_MESSAGES[card.id];

  if (!options || options.length !== 2) {
    throw new Error(`Kart mesajı eksik: ${card.id} (${card.name})`);
  }

  const message = options[orientation === "upright" ? 0 : 1];
  const name = String(username || "").replace(/^@+/, "").trim();

  return {
    type: "magic_message",
    username: name,
    cardId: card.id,
    orientation,
    // Kart adı ve kart görseli seslendirmeye veya ekrana gönderilmez.
    message,
    answer: name ? `@${name}, sihirli mesajın geliyor. ${message}` : message
  };
}
