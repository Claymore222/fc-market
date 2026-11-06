# Transfer satırları — karar bilgisi ve maliyet açıklığı

31.10.2026 · `ui-yenileme` · Kod commiti: `08cd23b`.

## Değişen davranış

- Uyum puanı artık ayrıntı açılmadan, OVR/POT yanında `/100` ölçeğinde gösteriliyor. Seçili mevki
  ve amaç için hesaplanan puandır; transfer olasılığı veya farklı amaçlar arasında ortak ölçek değildir.
- Mevcut motorun ürettiği en fazla iki profil etiketi (“Hızlı bek”, “Top kullanan stoper” vb.) ve iki
  güçlü özellik görünür. Etiket yoksa tarz uydurulmaz. Ayrıntı bütün güçlü özellikleri göstermeye devam eder.
- Mevcut oyuncuyla fark varsa “tahmini mevki puanı” olarak belirtilir; genel OVR farkıyla karıştırılmaz.
- Kıyasla ve izleme yıldızı satırda sürekli görünür. Kıyasla, adayı ve varsa kıyaslanan kadro oyuncusunu
  mevcut karşılaştırma listesine birlikte ekleyip karşılaştırmayı açar. Tekrar eden ID eklenmez;
  dört oyuncu sınırı aşılacaksa düğme pasif olur, liste kısmen değiştirilmez. İzleme davranışı aynı kaldı.
- “Bütçeye uygun” yerine **“Tahmini bütçe uyumu”** yazıyor. Kulüplü oyuncuda ayrıca
  **“Bonservis bilinmiyor”** görünür. Bilinmeyen maliyet “Maliyet bilgisi eksik” olarak ayrılır.
- Varsa son transferin bedeli/tarihi doğrudan gösterilir ve bugünkü satış fiyatı olmadığı belirtilir.
  Son transfer yoksa yalnız motorun kullandığı model referansı “Değer tahmini” olarak gösterilir.
  Kullanılabilir referans yoksa fiyat üretilmez. Serbest oyuncuda bonservis varsayımı 0 olsa da
  imza ücreti ve yeni ücret talebinin bilinmediği söylenir.
- `expectedWage` geldiğinde tutar mevcut maaşa eşit olsa bile `~` ve “tahmini” etiketi kullanılır.
  Beklenen tutar yoksa mevcut maaş ile serbest oyuncunun yalnız kayıtta tutulan maaşı ayrılır.
- Üst bütçe tutarları “Kullanılabilir” olarak adlandırıldı; düşülen güvenlik payı görünür.
  Örneğin 40,9 M€ toplam bütçe ve %15 pay, Transfer'de 34,8 M€ kullanılabilir bütçe verir.

Öneri sıralaması, eşikler, fiyat/maaş modelleri ve backend yanıtı değiştirilmedi. Yeni ham oyun alanı yok.

## Doğrulama

| Kontrol | Sonuç |
|---|---|
| `dotnet test backend/FcMarket.Tests` | 317 geçti |
| `python -m unittest discover -s tools/saveimport/tests` | 53 geçti |
| `python -m unittest discover -s tools/assets/tests` | 3 geçti |
| `npm --prefix frontend run test:e2e -- --workers=2` | 97 geçti, 11 ortam koşullu atlandı |
| Gerçek veri kopyası, `hub-themes-real.spec.ts` | 1 test geçti; Fenerbahçe ve Gençlerbirliği, 1440/390 px |
| Son ayrıntı metni sonrası tekrar | Uyum/profil/maliyet, bilinmeyen/serbest maaşı, doğrudan kıyaslama: 3 test geçti |
| Frontend production build | Geçti; mevcut büyük paket uyarısı sürüyor |
| Gerçek Windows masaüstü | Fenerbahçe Transfer'de 81,5/100, ~59 B€ tahmini maaş, bilinmeyen bonservis ve doğrudan Kıyasla görünür |

Yeni kontroller 1426/1024/390 px genişliklerde puan, maliyet, profil ve eylemlerin satır sınırlarında kaldığını;
maaş tahmininin eşit tutarda dahi etiketlendiğini; kapasite doluyken karşılaştırmanın kısmen yazılmadığını
ve klavyeyle açıldığını doğruluyor. Mevcut testler kariyer değişimi, eski yanıtın yeni kariyere sızmaması,
azaltılmış hareket ve tercihlerin yalnız açık uygulama eylemiyle kaydedilmesini de kapsıyor.

Loglar: `scratch/ui-audit-2026-10-31/transfer-*.log`.
Gerçek veri ekranları: `scratch/transfer-hub-themes/fener-hub-desktop.png`,
`gencler-hub-desktop.png`, `fener-hub-card-mobile.png`, `gencler-hub-card-mobile.png`.

Uygulama ve gerçek veri testi `scratch/ui-audit-2026-10-31/fc_career.db` / `app.db` kopyalarında çalıştı.
Oyun, kurulu script'ler ve otomasyon ayarları değiştirilmedi. İnceleme penceresi kapatıldı.
Kaynak `C:\FCExport\fc_career.db` SHA-256 önce/sonra aynı:
`127448939cbcf6629c83f6d6ffdff81f10ac451c4f0952206c683abad2372aab`.

## Sıradaki adım

Faz D: aynı bütçeyi paylaşan transfer paketleri. Bu teslimde adaylar hâlâ tek tek ön elemeden geçiyor;
birden fazlasının toplam maliyetine uygunluk iddiası yok. Gerçek bonservis/ücret talebi bilinmediği için
paketler de açık referanslar ve belirsizliklerle hesaplanmalı. Eski dalların güvenilir ebeveyn araştırması
ve açıklamasız oyun kodlarının anlamlandırılması ayrıca açık.

Çalıştırma: `powershell -ExecutionPolicy Bypass -File .\start-desktop.ps1`.
