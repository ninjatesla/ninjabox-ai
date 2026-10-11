import * as Astronomy from "astronomy-engine";

const ZODIAC = [
  { name:"Koç",key:"koc",element:"Ateş",ruler:"Mars",traits:"cesaret, hız ve inisiyatif" },
  { name:"Boğa",key:"boga",element:"Toprak",ruler:"Venüs",traits:"istikrar, güven ve sabır" },
  { name:"İkizler",key:"ikizler",element:"Hava",ruler:"Merkür",traits:"merak, iletişim ve esneklik" },
  { name:"Yengeç",key:"yengec",element:"Su",ruler:"Ay",traits:"duygusal hafıza, aidiyet ve koruma" },
  { name:"Aslan",key:"aslan",element:"Ateş",ruler:"Güneş",traits:"yaratıcılık, sıcaklık ve görünür olma" },
  { name:"Başak",key:"basak",element:"Toprak",ruler:"Merkür",traits:"dikkat, düzen ve işe yarar çözümler" },
  { name:"Terazi",key:"terazi",element:"Hava",ruler:"Venüs",traits:"denge, ilişki ve adalet duygusu" },
  { name:"Akrep",key:"akrep",element:"Su",ruler:"Plüton/Mars",traits:"derinlik, kararlılık ve güven" },
  { name:"Yay",key:"yay",element:"Ateş",ruler:"Jüpiter",traits:"keşif, öğrenme ve özgürlük" },
  { name:"Oğlak",key:"oglak",element:"Toprak",ruler:"Satürn",traits:"sorumluluk, hedef ve uzun vadeli emek" },
  { name:"Kova",key:"kova",element:"Hava",ruler:"Satürn/Uranüs",traits:"bağımsız düşünce, yenilik ve topluluk" },
  { name:"Balık",key:"balik",element:"Su",ruler:"Jüpiter/Neptün",traits:"hayal gücü, empati ve sezgi" }
];
const PLANETS = [["Güneş",Astronomy.Body.Sun,false],["Ay",Astronomy.Body.Moon,false],["Merkür",Astronomy.Body.Mercury,true],["Venüs",Astronomy.Body.Venus,true],["Mars",Astronomy.Body.Mars,true],["Jüpiter",Astronomy.Body.Jupiter,true],["Satürn",Astronomy.Body.Saturn,true],["Uranüs",Astronomy.Body.Uranus,true],["Neptün",Astronomy.Body.Neptune,true],["Plüton",Astronomy.Body.Pluto,true]];
const OPENINGS = ["Bugün senin burcunda öne çıkan tema", "Bu yorumda özellikle dikkat çeken taraf", "Burcunun güçlü yanı şu dönemde", "Astrolojik açıdan bu dönemin ana konusu", "Senin için öne çıkan başlık"];
const ENDINGS = ["Bugün bir konuşmayı ertelemek yerine netleştirmek işini kolaylaştırabilir.","Önümüzdeki günlerde enerjini gerçekten karşılık aldığın yere ayır.","Bir konuda karar verirken başkalarının beklentisinden önce kendi önceliğini belirle.","İlk adımı küçük tut ama ne istediğini açıkça ortaya koy.","İlişkilerde varsayım yapmak yerine doğrudan sormak daha çok kapı açabilir.","Biriken işleri tek seferde çözmeye çalışma; en önemli olanı seç ve oradan başla."];
const choose = a => a[Math.floor(Math.random()*a.length)];
function normalize(value=""){return String(value).toLocaleLowerCase("tr-TR").replace(/[ıİ]/g,"i").replace(/[ğĞ]/g,"g").replace(/[üÜ]/g,"u").replace(/[şŞ]/g,"s").replace(/[öÖ]/g,"o").replace(/[çÇ]/g,"c").replace(/[^a-z0-9\s]/g," ").replace(/\s+/g," ").trim();}
export function parseBurcInput(message=""){
 const text=normalize(message), risingMentioned=/\b(yukselen|asc|ascendant)\b/.test(text), matches=[];
 for(const sign of ZODIAC){const re=new RegExp(`\\b${sign.key}\\b`,`g`);let m;while((m=re.exec(text))!==null)matches.push({sign,index:m.index});}
 matches.sort((a,b)=>a.index-b.index);const unique=[];for(const m of matches)if(!unique.some(x=>x.sign.key===m.sign.key))unique.push(m);
 if(!unique.length)return null;if(risingMentioned&&unique.length<2)return null;
 let sun=unique[0].sign,rising=null;
 if(unique.length>=2){if(risingMentioned){const marker=text.search(/\b(yukselen|asc|ascendant)\b/);if(marker<unique[0].index){rising=unique[0].sign;sun=unique[1].sign;}else rising=unique.find(x=>x.index>marker)?.sign||unique[1].sign;}else rising=unique[1].sign;}
 return {sunSign:sun.name,risingSign:rising?.name||null,normalized:text};
}
const normDeg=x=>((x%360)+360)%360;
const angleDiff=(a,b)=>((a-b+540)%360)-180;
function zodiacAt(longitude){const n=normDeg(longitude),i=Math.floor(n/30);return {sign:ZODIAC[i].name,degree:n%30};}
function longitude(body,date){return normDeg(Astronomy.Ecliptic(Astronomy.GeoVector(body,date,true)).elon);}
export function getCurrentEphemeris(now=new Date()){
 const yesterday=new Date(now.getTime()-86400000);
 const planets=PLANETS.map(([name,body,retro])=>{const lon=longitude(body,now),pos=zodiacAt(lon);return {name,longitude:lon,sign:pos.sign,degree:Number(pos.degree.toFixed(2)),retrograde:retro&&angleDiff(lon,longitude(body,yesterday))<0};});
 const major=planets.filter(p=>["Güneş","Ay","Merkür","Venüs","Mars","Jüpiter","Satürn"].includes(p.name));
 const defs=[{name:"kavuşum",angle:0,orb:8},{name:"karşıt",angle:180,orb:8},{name:"kare",angle:90,orb:6},{name:"üçgen",angle:120,orb:6},{name:"altmışlık",angle:60,orb:4}],aspects=[];
 for(let i=0;i<major.length;i++)for(let j=i+1;j<major.length;j++){const sep=Math.abs(angleDiff(major[i].longitude,major[j].longitude));for(const a of defs){const orb=Math.abs(sep-a.angle);if(orb<=a.orb)aspects.push({planets:`${major[i].name}-${major[j].name}`,aspect:a.name,orb:Number(orb.toFixed(1))});}}
 aspects.sort((a,b)=>a.orb-b.orb);return {calculatedAt:now.toISOString(),planets:planets.map(({name,sign,degree,retrograde})=>({name,sign,degree,retrograde})),aspects:aspects.slice(0,8)};
}
export function buildBurcPrompt({username,sunSign,risingSign,ephemeris}){
 const sun=ZODIAC.find(x=>x.name===sunSign)||ZODIAC[0],rising=ZODIAC.find(x=>x.name===risingSign);
 const sky=ephemeris.planets.filter(p=>["Ay","Merkür","Venüs","Mars","Jüpiter","Satürn"].includes(p.name)).map(p=>`${p.name} ${p.sign}${p.retrograde?" (retro)":""}`).join(", ");
 return `Sen NinjaBox canlı yayınında konuşan, astrolojik sembolleri somut ve kişiye uygun yorumlayan bir astroloji yorumcususun. Türkçe, sesli okunmaya uygun, doğal ve doğrudan bir yorum yaz.
İzleyici: ${username||"izleyici"}. Güneş burcu: ${sun.name} (${sun.element}, yönetici ${sun.ruler}; temalar: ${sun.traits}). ${rising?`Yükselen: ${rising.name} (${rising.traits}).`:"Yükselen bilgisi verilmedi; varmış gibi yorumlama."}
Hesaplanan güncel gökyüzü konumları: ${sky}. Hesaplanan başlıca açılar: ${ephemeris.aspects.slice(0,4).map(a=>`${a.planets} ${a.aspect}`).join(", ")||"belirgin açı listelenmedi"}.

Talimatlar:
- 65-90 kelime, 30-40 saniye civarı. Her seferinde yeni cümle yapısı ve farklı bir giriş/kapanış kullan; ezberlenmiş şablon hissi verme.
- Bu burcun gerçek temalarını kullan; yükselen verilmişse dışarıya yansıyan tavırla Güneş burcunun iç motivasyonunu ilişkilendir.
- İlişki, iş/hedef veya günlük karar alanlarından en az ikisine değin; klişe genel tavsiyeler yerine net, uygulanabilir ve burca bağlı bir gözlem sun.
- Güncel gökyüzünden yalnızca gerçekten verilen konumları kullan. İzleyicinin doğum haritası, doğum tarihi/saat/yer bilgisi yoksa kişisel doğum haritası iddiası kurma.
- “Bu kesin bir sonuç değil”, “garanti vermez”, “sembolik yorumdur” gibi sürekli tekrar edilen uyarılarla bitirme. Gereksiz güvence cümlesi ekleme; yorumun doğal ve net bir cümleyle bitsin.
- Korkutma, kesin tarih veya garanti, sağlık/ölüm ve kesin finansal sonuç iddiası üretme.
Yalnızca seslendirilecek yorum metnini ver; başlık yazma.`;
}
function localCommentary({username,sunSign,risingSign,ephemeris}){
 const sun=ZODIAC.find(s=>s.name===sunSign)||ZODIAC[0],rising=ZODIAC.find(s=>s.name===risingSign);
 const venus=ephemeris.planets.find(p=>p.name==="Venüs"),mercury=ephemeris.planets.find(p=>p.name==="Merkür"),mars=ephemeris.planets.find(p=>p.name==="Mars"),moon=ephemeris.planets.find(p=>p.name==="Ay");
 const relationship=choose([`İlişkilerde ${sun.element==="Su"?"hissettiğini içinde tutmak yerine açıkça paylaşmak":sun.element==="Ateş"?"isteğini net söylerken karşı tarafın temposunu da gözetmek":sun.element==="Toprak"?"güvenin sözlerden çok tutarlı davranışlarla kurulduğunu görmek":"karşılıklı konuşmada merakını ve sınırlarını birlikte korumak"} işine yarayabilir.`,`Duygusal tarafta, kimin yanında rahatça kendin olabildiğine dikkat et; sırf denge bozulmasın diye ihtiyacını geri plana atma.`,`Bir konuşmada cevabı tahmin etmek yerine sorunu doğrudan sormak yanlış anlamaları azaltabilir.`]);
 const work=choose([`İş ve hedeflerinde ${sun.element==="Toprak"?"ölçülebilir bir plan kurmak":sun.element==="Ateş"?"beklettiğin ilk adımı atmak":sun.element==="Hava"?"fikirlerini tek bir öncelikte toplamak":"enerjini tüketen işi sadeleştirmek"} daha verimli olabilir.`,`Üretkenlik tarafında aynı anda her şeyi çözmeye çalışma; önce sonucu en çok değiştirecek işi seç.`,`Bir hedefi ilerletmek için bu hafta bitirebileceğin tek bir parçayı belirle.`]);
 const sky=choose([`Merkür ${mercury.sign} konumuyla iletişim ve kararlar başlığını öne çıkarıyor.`,`Ay ${moon.sign} konumunda; duygusal tepkini fark edip sonra cevap vermek yararlı olabilir.`,`Venüs ${venus.sign} ilişkilerde değer verdiğin şeyleri yeniden düşünme temasını çağrıştırıyor.`,`Mars ${mars.sign} motivasyon ve hareket biçimine dikkat çekiyor.`]);
 return `${username?username+", ":""}${choose(OPENINGS)} ${sun.name} için ${sun.traits} tarafı. ${rising?`Yükselen ${rising.name}, dışarıya ${rising.traits} biçiminde yansıyabilir.`:"Yükselen bilgisi olmadığı için yorumu Güneş burcuna göre yapıyorum."} ${relationship} ${work} ${sky} ${choose(ENDINGS)}`;
}
export async function generateBurcCommentary({username,sunSign,risingSign=null,geminiApiKey,geminiModels=[],openaiApiKey,openaiModel}){
 const ephemeris=getCurrentEphemeris(),prompt=buildBurcPrompt({username,sunSign,risingSign,ephemeris}),fallback=localCommentary({username,sunSign,risingSign,ephemeris});
 const valid=text=>typeof text==="string"&&text.trim().split(/\s+/).filter(Boolean).length>=50&&text.trim().split(/\s+/).filter(Boolean).length<=115;
 if(geminiApiKey)for(const model of geminiModels){try{const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:280,temperature:0.88,topP:0.94}},),signal:AbortSignal.timeout(12000)});if(!response.ok)continue;const data=await response.json(),answer=data.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join(" ").trim();if(valid(answer))return {answer,ephemeris,source:`gemini:${model}`};}catch{}}
 if(openaiApiKey&&openaiModel){try{const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${openaiApiKey}`},body:JSON.stringify({model:openaiModel,input:prompt,max_output_tokens:280}),signal:AbortSignal.timeout(12000)});if(response.ok){const data=await response.json(),answer=data.output_text?.trim();if(valid(answer))return {answer,ephemeris,source:`openai:${openaiModel}`};}}catch{}}
 return {answer:fallback,ephemeris,source:"local-ephemeris-fallback"};
}
export const SUPPORTED_ZODIAC_SIGNS=ZODIAC.map(({name})=>name);
