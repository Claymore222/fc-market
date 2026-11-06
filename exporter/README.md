# FC Market Kit: Career Mode veri export altyapısı

FC 27 Career Mode verisini (oyuncular, takımlar, sözleşmeler, istatistikler, event'ler) Live Editor
üzerinden dosyalara döker, sonra SQLite'a aktarır. **Oyunda hiçbir şeyi değiştirmez, sadece okur.**

```
lua/fc_export.lua          → oyunda çalışır, C:/FCExport'a snapshot + event log yazar
lua/cm_event_logger.lua    → keşif aracı: tüm career event'lerini konsola loglar
lua/le_capabilities.lua    → keşif aracı: bu Live Editor sürümünde hangi fonksiyonlar var
lua/fc_probe.lua           → keşif aracı: oyun tarihi ve bütçenin bellekteki yeri (CONFIG ofsetleri)
tools/importer.py          → export klasörünü fc_career.db (SQLite) dosyasına aktarır
tools/make_sample_export.py→ aynı formatta sahte veri (oyunsuz geliştirme için)
lua/fc_assets.lua          → oyundaki yüz/arma/bayrak görsellerini C:/FCExport/assets'e çıkarır
(uygulama planı ve durum: ../docs/PRODUCT-ROADMAP.md; kayıt okuyucu: ../tools/saveimport)
```

## Evde ilk test (yaklaşık 10 dk)

1. **Klasörü oluştur:** `C:\FCExport` (Lua klasör oluşturamaz, önceden olmalı).
   Farklı bir yer istersen `fc_export.lua` içindeki `CONFIG.OUT_DIR`'i değiştir.
2. **Save yedeği al.** Script sadece okuyor, ama alışkanlık olsun.
3. `fc_export.lua` ve `cm_event_logger.lua` dosyalarını Live Editor'ün `lua\scripts` klasörüne kopyala.
   **Live Editor klasörü Türkçe karakter içermeyen bir yolda olmalı** (ör. `C:\FC27LE`). "Masaüstü" gibi bir
   yolda LE'nin Lua kütüphaneleri yüklenmiyor.
4. Oyunu Live Editor ile aç → **Career save'ini yükle** → Live Editor → *Features → Lua Engine* →
   `fc_export.lua`'yı çalıştır.
5. Bitince "Snapshot tamam" mesajı çıkmalı. `C:\FCExport` içinde şunlar olmalı:
   `manifest.jsonl`, `*__meta.json`, `*__players.csv`, `*__schema.json` ...
6. Birkaç gün ilerlet. `events.jsonl` dosyasına satırlar düşmeli (transfer, sakatlık, ay geçti ...).
7. SQLite'a aktar (Python 3.9+ yeterli, ek paket gerekmez):
   ```
   python tools\importer.py C:\FCExport --db C:\FCExport\fc_career.db
   ```
   Oynarken sürekli aktarmak için: `--watch 10`

## Bir şey ters giderse

Live Editor log'unda `[FC-EXPORT]` ile başlayan satırlara bak:
| Mesaj | Anlamı / çözüm |
|---|---|
| `Dosya açılamadı ... OUT_DIR klasörü var mı?` | Klasörü oluştur ya da yolu düzelt |
| `Tablo atlandı: <ad>` | FC 27'de bu tablo yok veya adı farklı. `*__schema.json`'a bak |
| `İstatistik atlandı: GetPlayersStats yok` | FC 27'de fonksiyonun adı değişmiş olabilir |
| `career event enum'ları bulunamadı` | Live Editor klasörü Türkçe karakterli bir yolda. ASCII bir yola taşı (ör. `C:\FC27LE`) |
| `Snapshot alınmadı: oyun tarihi okunamadı` | `CONFIG.CALENDAR_DATE_OFFSET` bu oyun sürümünde tutmuyor. `fc_probe.lua` ile yeniden bul |
| Oyun birkaç saniye donuyor | Normal, 20k+ oyuncu yazılıyor. FC 27 LE'de `Sleep` olmadığı için export bitene kadar oyun donar |

## Bana (Claude'a) geri getir
İlk denemeden sonra şunları paylaş, field-map'i birlikte dolduralım:
- `*__schema.json` (tüm tabloların alan listesi)
- `*__players.csv` dosyasının ilk 5 satırı
- Live Editor log'undaki `[FC-EXPORT]` satırları

## Notlar
- Event handler her oyun oturumunda script çalıştırılınca kurulur. Oyunu kapatınca kaybolur.
  DB'ye yazılan bir şey yok, o yüzden save etkilenmez.
- `AUTO_SNAPSHOT_ON_MONTH` (0.3.0'dan beri açık): ay geçince, sonraki ilk gün ilerlemesinde otomatik snapshot alınır
  (FC 27'de ~5 sn donma). Kayıt hazırlığı (`PREPARE_FOR_SAVE`) sırasında bir gün ertelenir; aynı oyun gününde iki kez
  alınmaz. Event handler'ı oturum başına bir kez kurulur ve script'in en son çalıştırılan sürümünü çağırır.
  **0.2.x'ten güncellerken** oyunu bir kez yeniden başlat: eski sürümün handler'ı oturumda kalır ve event'ler çift yazılır.
- Snapshot'ta `transfers`, `playerloans`, `playersuspensions` tabloları da var (0.3.0). Tarih alanları doğum tarihi
  gibi gün sayısı varsayılıyor (DOĞRULANACAK).
- Importer aynı veritabanına tek örnek çalışır (`<db>.lock`); ikinci örnek hata verip çıkar.
- Live Editor yalnızca **offline Career Mode**'da kullanılmalı. EA anti-cheat nedeniyle risk kullanıcıya aittir.
