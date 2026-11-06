# Home ayrıntı incelemesi — 29 Ekim 2026

Bu belge bulgu ve kanıttır. Uygulama sırası tek plan belgesi `PRODUCT-ROADMAP.md` içindeki
“Home ayrıntı tamamlama” bölümündedir. Bu incelemede uygulama kodu değiştirilmedi, commit atılmadı.

## Karşılaştırmanın sınırı

[CMTracker referansı](https://cmtracker.net/alima19?ci=6ae1b64113da0aec07ed6e23): Fenerbahçe,
17.07.2030. Yerel açık Home/API: aynı kariyer, Dal 1, 24.07.2030.
Tarihe bağlı sayılar bu iki ekran arasında doğrudan hata sayılmaz. Aynı günün yerel LE export'u
`84af764b_20300717_174946` ayrıca SQLite `mode=ro` bağlantısıyla kontrol edildi.

İncelenen yerel DB `scratch/career-research/preview.db`: önceki çalışmada üretilmiş veri kopyası.
`C:\FCExport\fc_career.db` ve oyun kayıtları değiştirilmedi. API yanıtı kanıtı:
`scratch/visual-parity/home-audit/local-club.json`.

Referans Home'un bütün ilgili kartları DOM üzerinden okundu. Chrome denetimi açık adresi güvenle
doğrulayamadığı için bilgisayar kontrolü durdu. Oyuncu rollerinin ve saha hover'ının açılmış hâli bu
turda görsel olarak doğrulanamadı; bunların birebir etkileşim ölçümü planın ilk adımında bekliyor.
İlk 11 hover'ında yedeklerin gösterildiği bilgisi kullanıcının gözlemidir; sıralama kuralı henüz doğrulanmadı.

## Bulgular

| Alan | Mevcut durum ve neden | CMTracker / gereken fark |
|---|---|---|
| Oyuncu rolleri | `PlayerDrawer.tsx` rol satırını düz `li` olarak çiziyor. Yalnız +/++ işaretinde kısa `title` var; rol açıklaması yok. Rol adı, mevki ve seviye API'de mevcut. | Rol açıklaması, ilgili mevki ve +/++ anlamını gösteren fare/klavye/dokunma balonu; tam referans davranışı henüz ölçülmedi. |
| İlk 11 hover | `LineupPitch.tsx` yalnız o oyuncunun yüzü/adı/mevkisi/yaşı/OVR/POT/değerini gösteriyor. Bileşene yalnız ilk 11 veriliyor; yedek havuzu hiç iletilmiyor. | Kullanıcının tarif ettiği aynı yere alternatif yedek oyuncular eklenmeli. Listeye alma ve sıralama kuralı referansta kontrol edilmeli. |
| Kazanılan kupalar | `ClubService.CareerTrophies` ilk izlenen snapshot ile son snapshot'ın kulüp sayaçlarını çıkarıyor. 17.10.2029–24.07.2030 arasında her kayıtta lig=19, yerel=10, Avrupa=0; bu yüzden `trophiesWon=[]`. | Bu sonuç “kariyerde hiç kupa kazanılmadı” kanıtı değil. Sayaç kaynağı kariyer kazanımlarını kapsamıyor olabilir. Referans Home “Silverware” kartı güncel yarışmaları ve Avrupa katılımcılarını gösteriyor; bu, kupa müzesinden farklı içerik. Referans sezon geçmişindeki kupa hücreleri de `-`. |
| Sakatlık odası | API `injured` Boolean'ını yalnız `teamplayerlinks.injury > 0` üzerinden hesaplıyor. 17 Temmuz export'unda da 24 Temmuz kaydında da 24 oyuncunun hepsi 0. Kondisyon, tür/şiddet, tedavi ve dönüş tarihi modelde yok. | Aynı 17 Temmuz referansında Kroupi ağır sakat / fizyoterapi / 8 Eylül dönüş; ortalama kondisyon 80, Read 0, Costa 28, Avom 49, Baum 66. Bu fark yalnız tarihle açıklanamaz; mevcut kaynak yetersiz. |
| Uygunluk | `HomePage.tsx` koşulsuz placeholder gösteriyor. 17 Temmuz `playersuspensions` tablosu yalnız player/team=-1, maç=0 yer tutucu satırı içeriyor. | Referansta Adeyemi BAN 1; Doku/Hendriks/Ngoy için 2 kıtasal sarı kart var. Güncel kariyer bloğu kaynağı araştırılmalı; tabloyu bağlamak tek başına çözmez. |
| Kulüp | Değer, prestij, popülerlik, akademi gelişimi, rakip ve toplam kupa alanları zaten mevcut. Bu kartın metin kapsamı referansa büyük ölçüde yakın. | Asıl açık finans ve görsel hiyerarşi. Referans dolar, yerel euro gösteriyor; özellikle kulüp değeri birimi doğrulanmadan sayısal eşitlik iddia edilmemeli. |
| Finans | 23 sezon kategorisi API'de var; Home yalnız toplamları ve son 5 hareketi gösteriyor. Kategori ayrıntıları mevcut finans penceresinde kalıyor. Transfer bütçesi var; haftalık maaş payı/boşluğu ayrıca mevcut. | Home'da bütçe/maaş grafikleri ve en büyük kategori özeti eksik. Tam kategori listesi ve son hareketler birbirinden ayrılmalı; yıllık bütçe ile haftalık tutar karıştırılmamalı. |
| İş güvencesi | 74 puan mevcut; yalnız sayı ve yatay çubuk gösteriliyor. | Dairesel gösterge, durum metni ve güvenilir başlangıç değerine göre değişim. İlk gözlem sezonun ilk günü değilse “sezon başından beri” diye etiketlenmemeli. |
| Yönetim hedefleri | Yalnız lig hedefi ve sonucu okunuyor. | Referansta lig, Türkiye Kupası ve Şampiyonlar Ligi ayrı; asgari/istenen hedef, durum ve 0–17 basamakları var. Basamaklar mevcut hedef kodlarıyla otomatik eşitlenmemeli. |
| Menajer karnesi / sezon geçmişi | 5 sezon, G/B/M, gol, puan, güven ve hedef sonuçları okunuyor. En büyük alış/satış oyuncu adları API'de zaten var; Home bu ayrıntıları göstermiyor. Final lig sırası null; sütun gizleniyor. | Hazır alanlar gösterilebilir. Menajer maaşı, kariyer kazancı, zorluk, devre süresi, gerçek kariyer rekor maçı, final sıra ve sezon kupaları ayrıca çözülmeli. Güncel sezon ve bitmiş sezon arşivi ayrı tutulmalı. |
| Altyapı | API 9 genç gösteriyor; 17 Temmuz ham akademi tablosunda da 9 kayıt var, 9'unun da oyuncu kaydı bulunuyor. Yani bu örnekte oyuncu eşleştirmesi kaybetmiyor. `tier`, potansiyel belirsizliği ve akademide ay alanları API'de mevcut. | Referansta 10 genç var. Başka kayıt bloğu/akademi kapsamı farkı araştırılmalı; yalnız frontend değişikliği sayıyı düzeltemez. Mevcut ek metaveriler arayüzde kullanılabilir. |
| Gözlem | Yerelde 3 kişi doğrudan `career_scouts` tablosundan. Aynı gün export'unda da 3. FC 26 metası bu tabloyu en çok 3 kayıt olarak tanımlıyor; aktif FC 27 anlamı ayrıca doğrulanmalı. | Referansta 6 işe alınmış / 5 alınabilir gözlemci, kapsanan ülke ve yeni gözlemci tarihi var. Akademi gözlemcileri ile ana takım/GTN gözlemcileri aynı havuz olmayabilir; farklı kategoriler karıştırılmamalı. |
| Ödül yarışı | Yerel oyuncu ödülleri tablosu boş; kart onu bekliyor. | Referans aynı yerde geçen sezon lig sıralarına göre kulüp adayları gösteriyor. API'de `world.leaders` ve `leadersFromLastSeason` hazır; oyuncu ödül kazananlarıyla aynı kavram değil. |

## Araştırma için başlangıç noktaları

- FC 26 meta XML'de `career_managerhistory` için lig/yerel/kıtasal kupa sayıları, hedefler ve final sıra
  tanımları var. İthal edilen FC 27 ham tablolarında bu tablo yok; mevcut sezon BNRY okuyucusu ve kayıt
  kopyaları üzerinden araştırılmalı. Alanların FC 26'da tanımlı olması FC 27'de doğrulama sayılmaz.
- Meta XML'de `career_playerlastgrowth` sakatlık tarihi/süresi tanımlarını içeriyor; mevcut ithal ham tablo
  listesinde yok. Önce kayıtta gerçekten bulunup bulunmadığı kontrol edilmeli, sonra kariyer blokları araştırılmalı.
- `career_scoutmission` tablosu mevcut ama referans 17 Temmuz snapshot'ında boş. `career_clinchedobjectives`
  de boş. Bu tabloların isimleri tek başına eksik kartların çözüldüğünü göstermez.
- Ham alan eşlemeleri yalnız config altında; yeni anlamlar `data-dictionary.md` içinde DOĞRULANACAK.
- Yeni araştırmalarda aynı gün export + aynı gün kayıt kopyası + aynı gün CMTracker üçlüsü kullanılmalı.
  Kaynak kapsamı açık değilken sıfır/sağlam/kupa yok gibi kesin sonuçlar gösterilmemeli.

Uygulama kodu değişmediği için regresyon testleri bu incelemede yeniden çalıştırılmadı. Kanıt, salt-okunur
API/SQLite okumaları ve referansın görünen Home içeriğidir; yeni uygulama testlerinin geçtiği iddia edilmiyor.
