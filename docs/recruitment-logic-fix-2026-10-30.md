# Transfer ihtiyaç ve öneri mantığı düzeltmesi

30.10.2026. Gençlerbirliği incelemesinde bulunan mantık hataları giderildi. Oyun açılmadı; oyun kayıtlarına,
`exporter/` klasörüne ve `C:\FCExport\fc_career.db` dosyasına yazılmadı. Testler kariyer DB kopyasında yapıldı.

## Eskiden yanlış olan

| Sorun | Etki |
|---|---|
| Her gelecek sezon ihtiyacı 40 puan alıyordu | "Öncelik sırası" fiilen alfabetikti, sayfa kalecide açılıyordu |
| Takım seviyesi, mevkiye bakmadan en yüksek 11 OVR'ın medyanıydı | Kalite tabanları (62/56) hiç devreye girmiyordu |
| Atama mevki dışı oyuncuyu tam OVR'la sayıyordu | Orta saha oyuncusu tam reytingle stoper görünüyordu |
| Maaş kontrolü oyuncunun bugünkü maaşına bakıyordu | Serie B oyuncularının %94'ü geçiyor, kartların %47'si oradan geliyordu |
| Gelişim puanında yaş sınırı yoktu | 35 yaş 74/88 oyuncu gelişimden 100 alıyordu |
| Bütçe üstü oyuncular ana listeyi dolduruyordu | Gençlerbirliği listesinde dünya yıldızları çıkabiliyordu |
| RWB/LWB hiçbir oyuncuda kayıtlı değil | Her takımda sahte "acil 100" ihtiyaç |

## Yeni kurallar

- **Takım seviyesi:** Seçili dizilişe atanan en iyi 11'in mevki reytingi ortalaması. Yerleşen oyuncu azsa en yüksek
  bilinen OVR'lar kullanılır.
- **Mevki reytingi:** `config/position-ratings.json` ile özelliklerden tahmin, OVR'ı aşmaz. Atama, kalite tabanı ve aday
  kıyası bunu kullanır. Ek ham alan yoktur.
- **Lig kıyası:** Ligdeki her kulübe aynı diziliş ve aynı atama uygulanır; ilk seçenek ve yedek hatları medyan ve sırayla
  karşılaştırılır. En az 8 rakip kulüp ve kulüp başına 16 oyuncu gerekir, yoksa kıyas yapılmaz.
- **İhtiyaç puanı:** `urgent` 100, `window` 50–95, `next-season` 20–49, `sufficient` 0–19. Hat ligin alt üçte birinde ve
  medyanın altındaysa "bu dönem" ihtiyacıdır. Sözleşmesi biten ilk seçenek, yedek, bağımsız yedek açığı ve yaş puanı
  farklılaştırır. Yaş tek başına ihtiyaç üretmez. Eşikler `squad-analysis.json` → `depth.need`.
- **Beklenen maaş:** `ln maaş = a + b × OVR`; kulüpte 12 oyuncu varsa kulübe, yoksa lige uydurulur. Beklenen değer bu tahmin
  ile mevcut maaşın büyüğüdür. Oyuncunun talebi değildir. DOĞRULANACAK.
- **Bütçe durumu:** `reference-within`, `reference-wage` (bonservis uygun, maaş kadrodaki en yüksek maaşın altında ama alan
  gerekiyor), `unknown`, `reference-above`. `reference-above` oyuncular ana listeye girmez, "Bütçe üstü seçenekler"
  bölümünde durur.
- **Erişilebilirlik:** OVR takım seviyesini 12'den fazla aşan, değeri bütçenin 3 katını geçen, maaşı en yüksek maaşın iki
  katını geçen veya kulüp prestiji 5 basamak üstte olan oyuncu `unreachable` sayılıp elenir. Bilinmeyen değer elemez,
  bütçe 0 iken bonservis kuralı çalışmaz. Prestij eşiği DOĞRULANACAK.
- **Yaş ve gelişim:** 28 yaşından sonra POT gelişim sayılmaz, proje puanı yıl başına düşer. 30 yaş üstü (kaleci 34)
  ufka göre puan kaybeder ve "kısa vadeli çözüm" notu alır.
- **Grup ağırlıkları:** Genç yatırım grubu, kulübün hedefinden bağımsız kendi ağırlığını kullanır.
- **RWB/LWB:** RB/LB'ye bağlandı, öneri mevkileri 12'ye indi.
- **Ekran:** Transfer sayfasına kadro içi çözüm (yedek-ilk 11 farkı) ve sözleşme planı eklendi. Yönetimin lig hedefi yalnız
  kayıttaki seviyeyle gösterilir; seviye → sıra eşlemesi bilinmediği için sıraya çevrilmedi.
  Üst başlıktaki "En iyi 11" etiketi gerçek anlamı olan "İlk 11" oldu.

## Sade transfer ekranı

Sayfa aynı bilgiyi rapor, sol menü ve kartlarda üç kez veriyordu; oyuncu kartı başına on kadar bilgi vardı. Yeni akış:

1. Başlık altında tek cümle: öncelik sırası.
2. Tek satırda bonservis, maaş alanı, takım gücü ve yönetim hedefi. Gösterilen tutarlar güvenlik payı düşülmüş hâldir.
3. Kadro içi ve sözleşmeler: kapalı başlayan iki satır.
4. Solda öncelik sırasına göre gruplu mevkiler (rapor ve menü birleşti), sağda seçili mevkinin tek cümlelik nedeni.
5. Oyuncular satır listesi: isim, OVR/POT, katkı, maaş, bütçe durumu. "Neden önerildi?" ayrıntıyı açar; isim oyuncu detayını açar.
6. Bütçe üstü seçenekler ve yöntem açıklamaları sayfa sonunda kapalıdır.

Sıralama ve aday sayısı seçicileri kalktı; varsayılan 5 satır, "Daha fazla göster" ile 10. Telefonda mevkiler yatay kaydırılır.

## Gerçek kariyer sonucu

Gençlerbirliği, 24.08.2026:

- Kadro gücü 11/18 (69,9, lig medyanı 70,4).
- Öncelik: Santrfor (95) → Stoper (83) → Merkez orta saha (77). Gelecek sezon: Sağ bek, Sağ orta saha (49), Kaleci (38).
- Kadro içi: Rodrigues +7, Rafael Luís +5, Uçan +2; kayıtlı 11 ortalaması 68,2 → 69,5.
- Sözleşme: 28 oyuncunun 15'i, maaşların %54'ü, kayıtlı ilk 11'den 7 oyuncu.
- İlk beş kartlarda 33 yaş ve üstü oyuncu yok, lig dağılımı dengeli. İlk 11 kartları "maaş alanı gerekir" etiketi alıyor.

Fenerbahçe, 28.07.2030: kadro gücü 1/18; Stoper ve Kaleci önde, RB/LB/RM/ST yeterli.

## Doğrulama

| Kontrol | Sonuç |
|---|---|
| Backend | 304/304 (18 yeni) |
| Saveimport / Assets | 53/53, 3/3 |
| Playwright | 81 geçti, 11 ortam koşullu atlandı |
| Gerçek veri (kopya) | `analysis`, `depth`, `hub-themes`, `matches`, `recruitment`, `transfer-brief` geçti; API hatası yok |
| Görsel | 1440 ve 390 px ekran incelendi, yatay taşma ve JS hatası yok |
| Kaynak koruma | `fc_career.db` SHA-256 test öncesi ve sonrası aynı |

`sync-real.spec.ts` çalıştırılmadı: Eski bir kopyadaki sentetik `TEST_UNSAVED_FUTURE` satırını bekliyor.

İlk board yanıtı bu kopyada yaklaşık 2,1 sn; lig kadroları revizyon başına önbelleğe alınır.

## Sınırlar

Beklenen maaş ve erişilebilirlik oyunun gizli transfer kararını bilmez. Eşikler bu iki kariyere göre seçildi; daha çok
kariyerle kalibre edilmeli. Hedef fiyat, transfer listesi durumu, kiralama ve ortak bütçeli paketler kapsam dışı (Faz D).

Çalıştırma:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-desktop.ps1
```
