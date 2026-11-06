# Rol ve ilk 11 hover'ları — 29 Ekim 2026

İstenen iki hover tamamlandı. Kupa/sağlık/finans/yönetim/altyapı araştırması bu teslimin kapsamı değil.

## Roller

Referans [CMTracker Doku paneli](https://cmtracker.net/alima19?ci=6ae1b64113da0aec07ed6e23&sp=246420&pslg=jeremy-doku)
tarayıcıda açıldı. Rol düğmesi, mevki/odak listesi, +/++ ve açılan balondaki odak başına 5×5 saha çizimleri
doğrudan incelendi. Örnek LW Winger++: Balanced/Attack/Versatile, 338×251 px referans balonu.

Yerel rol satırları artık düğme. Fare/odak/tıklama/dokunma ile açılan balonda rol açıklaması, mevki,
aşinalık seviyesi ve odaklara göre küçük saha bölgesi çizimleri var. Masaüstünde satırın sağında,
alan kalmadığında ekran içinde açılır. Escape balonu kapatır; oyuncu detayını kapatmaz.

33 eşlenmiş rol için özetler ve şematik 5×5 bölgeler `config/role-guides.json` içinde. Bölge çizimleri kendi
rehber görselleştirmemizdir; oyundan çıkarılmış hareket verisi, aktif taktik odağı veya oyuncunun gerçek
ısı haritası değildir. Bu sınır balonda yazılır. Bilinmeyen kodun adı korunur, saha/odak uydurulmaz.
Mevcut rol kodu/adı/mevki/seviyesi eşlemesi değiştirilmedi.

Özetler için kaynaklar:
[EA FC IQ](https://www.ea.com/games/ea-sports-fc/fc-25/news/pitch-notes-fc-25-fc-iq-deep-dive),
[EA FC 26 gameplay](https://www.ea.com/games/ea-sports-fc/fc-26/news/pitch-notes-fc26-gameplay-deep-dive).
Metinler kendi Türkçe özetlerimizdir. FC 27'deki taktik odak/oyun içi hareketle birebir eşitlik iddiası yok.

## İlk 11 ve yedekler

Home, taktik kartı ve Squad sahası ortak önizlemeyi kullanır. Oyuncu yüzü/kimliği/OVR/POT/değerinin altında,
**sahadaki yerin** kanonik mevkisinde oynayabilen en fazla dört yedek/rezerv listelenir.

- RCB/LCB → CB, RDM/LDM → CDM vb. normalize edilir. İlk 11 oyuncusunun ana mevkisi farklı olsa da saha yeri esas alınır.
- Oyuncunun bütün kayıtlı ek mevkileri kullanılır; ilk iki mevkiyle sınırlı değil.
- İlk 11, kiralık dışarıdaki ve aynı ID'nin tekrarları listelenmez. Sakatlık işareti olan aday işaretiyle gösterilir;
  bu liste maç için kesin uygunluk/ceza kontrolü değildir.
- Sıra OVR azalan, eşitlikte POT azalan, sonra oyuncu ID'si. Eksik reyting alta gider. Mevki uyumu için
  yeni puan veya oyuncuda olmayan mevki üretilmez. Bu açık yerel sıralamanın CMT'nin gizli sıralama
  algoritmasıyla tamamen aynı olduğu doğrulanmadı; referanstaki “mevki derinliği” davranışı uygulanır.
- Alternatifin üzerine gidince panel açık kalır; tıklayınca gerçek oyuncu detayı açılır. Geri dönünce
  saha oyuncusuna odak ve önceki kaydırma konumu döner. ArrowDown ile panel düğmelerine girilir.
- Dokunmada ilk dokunuş önizlemeyi açar; panelde oyuncunun detay düğmesi bulunur. Dışarı dokunma/Escape kapatır.
- Paneller portal ile kart kırpılmasından çıkarılır; ekran kenarında yön değiştirir. Aynı anda tek balon açık kalır.
  İçerik boyutu/scroll/resize izlenir; kaynak ekran dışına çıkarsa kapanır. Azaltılmış hareket desteklenir.

Saha hover'ı yeni ağ isteği veya yazma yapmaz; seçili kariyer/dalın mevcut kadrosunu kullanır.
Gerçek Fenerbahçe 24.07.2030: Costa (GK) → Jang Jae Hyun (rezerv, OVR 69 / POT 77).

## Doğrulama

| Kontrol | Sonuç |
|---|---|
| TypeScript + Vite üretim build | GEÇTİ; mevcut >500 kB paket uyarısı sürüyor |
| Playwright, gerçek veri dahil | **37/37 GEÇTİ**, 28,8 sn |
| Backend xUnit | **167 GEÇTİ** |
| Saveimport / assets | **29 / 2 GEÇTİ** |
| Rol rehberi bütünlüğü | 33/33 mevcut eşleme; bütün odak çizimleri geçerli 5×5 |

Yeni senaryolar: üçüncü ek mevki, saha yeri/ana mevki farkı, sıralama/null, tekrarlı ID, XI/kiralık dışlama,
boş aday, etkileşimli liste, detaydan dönüş odağı, hover/focus/ArrowDown/Escape, dokunma,
bilinmeyen rol, tek açık balon ve 390 px taşma. Mevcut gerçek veri testi Fenerbahçe/Gençlerbirliği,
kariyer/dal geçişi ve reload'u da kapsıyor. API yazma istekleri gerçek veri testlerinde engellendi.

Görseller: `scratch/visual-parity/role-focus-hover.png`, `role-focus-hover-mobile.png`,
`lineup-backups-hover.png`. Oyun kayıtları, orijinal export DB ve `exporter/` değiştirilmedi; commit atılmadı.

Çalıştırma: `powershell -ExecutionPolicy Bypass -File .\start-desktop.ps1`.
