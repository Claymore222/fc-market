# Yıldız adaylara PlayStyle planı — 1 Kasım 2026

Durum: 1-4. adımlar yapıldı, oyunda deneme bekliyor. Ayrı script: `exporter/lua/mods/fcm_star_playstyles.lua`, dry-run varsayılan açık.

## Sorun

Script genç oyuncunun OVR, POT ve özelliklerini yükseltiyor ama `trait1/trait2` alanlarına dokunmuyor. Oyuncu 75 OVR'a çıksa da PlayStyle'sız kalıyor.
02.09.2026 export'unda PlayStyle'ı olan oyuncu oranı OVR'a göre şöyle:

| OVR | 60-64 | 65-69 | 70-74 | 75-79 | 80-84 | 85+ |
|---|---|---|---|---|---|---|
| Oran | %22 | %43 | %63 | %80 | %96 | %99+ |

21.665 oyuncunun yalnız 185'inde PlayStyle+ var.

## Bilinenler

- PlayStyle'lar `players.trait1/trait2`, PlayStyle+ `icontrait1/icontrait2` bit alanlarında (`config/field-map.json`). Bit 1 ve 18 tam doğrulanmadı.
- `players` tablosuna LE tablo API'siyle yazmak kurallara uygun. Yasak tablolara dokunulmuyor.
- Oyunda `playstyle_attribute_requirement` tablosu var (`playstyleid`, `attributeid`, `value`). EA'nın eşikleri büyük ihtimalle burada; henüz okunmadı.
- `frontend/src/lib/playstyles.ts` içindeki eşikler bizim tahminimiz.
- Topluluk kaynaklarına göre akademi ve regen oyuncuları PlayStyle ile üretiliyor, gelişirken yenisini kazanmaları belirsiz. Yazdığımız değerin kalıcılığı sınanmalı.

## Adımlar

### 1. Oyunun kuralını oku (salt okuma)

`fc_playstyle_probe.lua`: `playstyle_attribute_requirement`, `playstyles`, `signature_playstyles`, `signatureabilitymap` tablolarını `C:\FCExport`'a yazar.
Bitiş: eşikler ve `playstyleid` → bit eşlemesi belgeli.

### 2. Gerçek oyunculardan seçim kuralı çıkar (uygulamada Python)

OVR 75+ gerçek oyuncularda her mevki ve tarz için en sık PlayStyle'lar hesaplanır, özellik değerleriyle kontrol edilir. Sonuç `exporter/lua/mods/fcm_weights.lua` yanında bir tablo olur.
Bitiş: "hızlı kanat", "oyun kurucu" gibi her tarz için sıralı PlayStyle listesi.

### 3. Seçim kuralı

- Önce özellik şartı: oyuncu EA eşiğini sağlamıyorsa o PlayStyle verilmez.
- Sayı hedef OVR'a bağlı: ≤69 → 1, 70-74 → 2, 75+ → 3 (dağılımdan kalibre edilecek).
- PlayStyle+ yok. Oran çok düşük, oyuncu dengesini bozar. Karar kullanıcıda, bkz. açık sorular.
- Var olan bitler silinmez, yalnız eklenir. Kaleci bitleri yalnız kalecilere verilir.
- Aynı `SEED` ile dry-run ve uygulama aynı sonucu verir.

### 4. Script değişikliği

- Uygulama raporuna eklenen PlayStyle adları yazılır.
- Eski `trait1/trait2` değerleri durum dosyasına eklenir, `restore` onları da geri alır.
- `verify` bu alanları da karşılaştırır.
- Yeni `MODE = "styles"`: daha önce yükseltilmiş oyunculara yalnız PlayStyle ekler, özelliklere dokunmaz. Mevcut adaylar için asıl yol budur.

### 5. Deneme

1. Tek takımda dry-run, raporu birlikte incele.
2. Kaydı yedekle, Chesterfield'da uygula.
3. Kaydet, çık, yükle: oyunda rozet görünüyor mu?
4. Bir ay ilerle, `verify` çalıştır: değerler kaldı mı?
5. Sonra `ALL_TEAMS`.

## Açık sorular

- PlayStyle+ hiç olmasın mı, yalnız POT 90+ için bir tane mi?
- Sayılar hedef OVR'a mı, POT'a mı bağlı olsun?
- Yeni üretilen adaylar için varsayılan olarak hemen açılsın mı?

## Bulgular (1 Kasım 2026)

- `playstyle_attribute_requirement` 99 satır, eşikler 75/80/85. `playstyleid` = bit numarası; `attributeid` sırası üreteçte (`tools/gen_fcm_playstyles.py`).
- Bu eşikler kariyer verisinin kuralı değil: 15.365 sahipliğin yalnız 1.957'si (%13) eşikleri sağlıyor. Tablo muhtemelen Clubs arketip sistemine ait.
- Bu yüzden eşik kapı olarak kullanılmadı; yalnız "PlayStyle hangi özelliklere bağlı" bilgisi alındı.
- Seçim: özellik ortalaması + OVR 75+ gerçek oyuncularda mevkideki yaygınlık. Rastgele değil, gruptan en fazla 2.
- Sayı: OVR <75 → 1, 75-79 → 2, 80-84 → 3, 85+ → 4 (var olanlar sayılır). PlayStyle+ yok.

## Güncelleme: tarz ve PlayStyle+ (1 Kasım 2026)

- Puan artık özelliğin oyuncunun OVR'ına göre öne çıkması, mevkide yaygınlık ve `STYLE_BITS` tarz önceliğinden oluşuyor. Fiziği yüksek stoper Sert alıyor.
- OVR 82+ adayda bir PlayStyle+ var: en yüksek özellik ortalamasına sahip PlayStyle, tarz eşitliği bozar. Bit `trait`'ten silinip `icontrait`'e yazılır.
- Veride 80'i geçen 964 oyuncunun yalnız 6'sı PlayStyle+ kazandı; kural oyunun değil, kullanıcının seçimi.

## Güncelleme: sayı POT'a bağlı (1 Kasım 2026)

POT <85 → 2, 85-89 → 3, 90-94 → 4, 95+ → 5; OVR 65 altı bir eksik, en az 1. Var olanlar sayılır. Script yeniden çalışınca eksikleri tamamlar.

## Benzetim sonucu (1 Kasım 2026)

`tools/sim_star_scripts.py` gerçek Lua kodunu script öncesi kayıtta çalıştırır (`save_2826f0ff…_20260701`, 666 aday). Karşılaştırma aynı mevki ve ±2 OVR'daki gerçek oyuncularla yapıldı.

| Ölçüm | Önce | Sonra |
|---|---|---|
| Mevkinin önemli özelliği çok düşük (z ≤ -2) | 76 oyuncuda 78 | 1 |
| Özelliği aşırı yüksek (z ≥ 3) | 24 oyuncuda 33 | 2 |
| En büyük OVR artışı | +23 | +14 |
| Gücü 65 altı stoper (144 stoper) | 19 | 9 |
| Sıçrama 15+ olan aday | 35 | 0 |
| Prospect script tablo okuması | 983.849 | 274.017 |
| PlayStyle script tablo okuması | 978.495 | 98.366 |

Değişiklikler: `fcm_profiles.lua` ile gerçek %15-%90 aralığı, `MAX_OVR_JUMP = 14`, kaleciye saha PlayStyle'ı yok, uyumsuz PlayStyle kapısı, LE konsoluna tek satır, yalnız gereken alanlar okunuyor.

## Kural güncellemesi (1 Kasım 2026)

POT en fazla hedef OVR + 20, en az hedef OVR + 6 (var olan yüksek POT düşürülmez). PlayStyle sayısı OVR 65 altı iki, 65-69 bir eksik, en az 1.
Benzetimde POT 85+ aday 500 → 379, POT 90+ aday 73 → 65, POT-OVR farkı 25'i geçen aday 62 → 0. Eklenen PlayStyle 1.580 → 1.200.

## Son ayar: gerçek gençlere oturtma (1 Kasım 2026)

POT farkı hedef OVR'a göre gerçek 21 yaş altı %90 dilimi: <60 → 20, <65 → 18, <70 → 16, <75 → 14, <80 → 11, 80+ → 10. PlayStyle: OVR <65 iki eksik, 65-79 bir eksik.
Benzetim: POT 85+ aday 379 → 194, POT 90+ aday 65 → 18. Yan etki: 106 adayda POT 80 altında (en düşük 70). OVR 70+ adaylar en az 2 PlayStyle alır.

## Devam eden kariyer: `fcm_star_duzelt.lua` (1 Kasım 2026)

Tek script: adayları `MODE = "tune"` ile yeni sınırlara çeker, sonra PlayStyle'ları yeniden seçer. Aday listesi ve OVR değişmez, POT ve özellik yükseltme öncesi değerin altına inmez, gelişim silinmez.
02.09.2026 export'unda benzetim: POT 90+ 71 → 19, POT farkı 25+ 75 → 0, ezik/op 93/42 → 1/6, PlayStyle 1.666 → 946. İkinci çalıştırma yeni değişiklik yazmaz.
