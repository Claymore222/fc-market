# FC Market — Claude Code yönergeleri

FC 27 Career Mode için yerel bir kariyer yardımcısı (CMTracker benzeri): Live Editor export'u + kariyer kaydını okur,
Windows masaüstü penceresinde gösterir. **Önce `docs/PRODUCT-ROADMAP.md`'yi oku**; durum, yol haritası ve ilkeler orada.
Alanların anlamı ve doğrulamalar `docs/data-dictionary.md`, kayıt formatı ve senkron `docs/save-import.md`.

## Ortam
- Bu makine oyunun olduğu Windows PC. Gerçek veri: `C:\FCExport` (export + `fc_career.db`), kayıtlar
  `%LOCALAPPDATA%\EA SPORTS FC 27\settings`, Live Editor `C:\FC 27 Live Editor\lua\scripts`.
- Çalıştırma: `powershell -ExecutionPolicy Bypass -File .\start-desktop.ps1` (örnek veriyle `-Sample`).
- Testler: `dotnet test backend/FcMarket.Tests`, `python -m unittest discover -s tools/saveimport/tests`,
  `python -m unittest discover -s tools/assets/tests`, `npm --prefix frontend run test:e2e`.

## Kurallar
- `exporter/` klasöründeki dosyaları değiştirme. Format değişikliği gerekiyorsa önce sor.
- Ham DB alan adlarını koda gömme, her zaman `config/field-map.json` üzerinden eriş.
- `fc_career.db` salt-okunur (importer'ın). Uygulama verisi (shortlist, preset) `app.db`'ye.
- Web uygulaması (backend/frontend) oyuna asla yazmaz. Oyuna yazma sadece exporter/lua altındaki Faz 5 Lua
  mod'larına izinlidir ve şu şartlarla: yalnızca LE'nin tablo API'si (SetRecordFieldValue) ve LE fonksiyonları;
  teamplayerlinks, career_playercontract, career_players vb. kadro/sözleşme tablolarına yazım yok; her yazan mod'da
  dry-run varsayılan açık; uygulamadan önce log'a değişiklik raporu. (Plan: docs/career-mods.md)
- Kariyer kayıtları yalnızca kopyalanarak okunur; oyunun kayıt dosyasına yazılmaz.
- Backend yalnızca `127.0.0.1`'i dinler.
- Stack: ASP.NET Core 9 Minimal API + Dapper/Microsoft.Data.Sqlite, React + Vite + TypeScript, Python araçları.
- Her işin sonunda PRODUCT-ROADMAP.md'deki bitiş ölçütünü kontrol et; küçük adımlarla ilerle ve
  her ekran bitince çalıştırma komutunu söyle.
