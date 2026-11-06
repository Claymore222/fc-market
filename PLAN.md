# FC Oyuncu Piyasası: Uygulama Planı

> Bu doküman Claude Code'a verilmek üzere yazıldı. Projenin amacı, kapsamı, mevcut altyapısı,
> mimarisi, ekranları ve fazlarıyla birlikte kabul kriterlerini içerir.
> Önce bu dosyayı ve `exporter/README.md`'yi oku, sonra **Faz 0 → Faz 1** sırasıyla ilerle.

---

## 0. Bağlam ve hedef

- **Oyun:** EA SPORTS FC 27, PC, offline Manager Career Mode.
- **Veri kaynağı:** xAranaktu'nun **Live Editor** aracı. Lua Engine'i ile oyunun veritabanı okunabiliyor.
  Bu repodaki `exporter/lua/fc_export.lua` script'i oyundan veriyi dosyalara döküyor.
- **Hedef:** Oyunun kendi transfer ve scout ekranlarının yerine geçecek **modern, hızlı ve
  filtrelenebilir bir "Oyuncu Piyasası"** web uygulaması. Uygulama ikinci monitörde ya da tablette
  açık durur ve oynarken kullanılır.
- **Geliştirici:** Ali. ASP.NET Core 9 ve React deneyimi var. Geliştirme MacBook'ta yapılıyor,
  oyun ise evdeki Windows PC'de. **Uygulama oyun olmadan, örnek veriyle geliştirilebilmeli.**

## 1. Kapsam

**v1'de var (salt-okuma):**
- Piyasa tablosu: tüm oyuncular, güçlü filtreler, sıralama, kayıtlı filtre ön ayarları
- Oyuncu detayı: özellik grupları, radar, OVR/POT gelişim grafiği, sözleşme, sezon istatistikleri
- Karşılaştırma (2–4 oyuncu)
- Shortlist: yıldızlama, not, etiket, hedef fiyat
- Haber akışı: event log ve snapshot farkları (transferler, gelişimler)
- Bütçe simülatörü
- Tahmini piyasa değeri ve "fırsat skoru". Formülü şeffaf ve ayarlanabilir olmalı.

**v1'de YOK (bilinçli olarak dışarıda):**
- Oyuna **geri yazma** (transfer yapmak, DB düzenlemek). Faz 4'te ayrıca karar verilecek, bkz. §11.
- Online özellik, kullanıcı hesabı, buluta veri gönderme
- AI/LLM entegrasyonu (Faz 3'te opsiyonel)

---

## 2. Mevcut altyapı (bu repoda hazır)

```
[FC 27 + Live Editor]
   │  exporter/lua/fc_export.lua  (oyunda, Lua Engine'den çalıştırılır)
   ▼
C:/FCExport/                          ← export klasörü (dosya tabanlı "API")
   manifest.jsonl                     ← tamamlanmış snapshot listesi (commit işareti)
   events.jsonl                       ← career event log (append-only)
   <snap>__meta.json                  ← save id, oyun tarihi, kullanıcı takımı, bütçeler
   <snap>__players.csv                ← ham DB tablosu
   <snap>__teams.csv, __teamplayerlinks.csv, __leagueteamlinks.csv,
   <snap>__leagues.csv, __nations.csv, __career_playercontract.csv
   <snap>__player_names.csv           ← playerid, name, club_teamid
   <snap>__player_stats.csv           ← sezon istatistikleri
   <snap>__schema.json                ← TÜM tabloların alan listesi (veri keşfi)
   │
   │  exporter/tools/importer.py  (stdlib Python; --watch ile sürekli)
   ▼
fc_career.db (SQLite, WAL)
   snapshots, events, schema_fields, _state
   raw_<tablo>  (her satırda snapshot_id)
   v_latest_snapshot, v_player, v_player_latest, v_player_history  (view)
   player_current  (v_player_latest'in index'li kopyası, yeni snapshot'ta yenilenir)
   │
   ▼
[YAPILACAK] FcMarket backend (salt-okuma) → React frontend
```

- `snapshot_id` biçimi: `<saveUID ilk 8>_<oyunTarihi YYYYMMDD>_<HHMMSS>`
- `exporter/tools/make_sample_export.py` **aynı formatta** sahte veri üretir. Mac'te geliştirme için bunu kullan:
  ```bash
  python exporter/tools/make_sample_export.py ./sample_export --months 6 --players 3000
  python exporter/tools/importer.py ./sample_export --db ./fc_career.db
  ```
- Importer idempotent çalışır, yeni kolonları otomatik ekler ve yarım yazılmış dosyaları okumaz.
  Testleri yapıldı.

### Live Editor'de doğrulanmış Lua fonksiyonları (referans)
`IsInCM`, `GetSaveUID`, `GetCurrentDate` → {day,month,year}, `GetUserTeamID`, `GetTeamName`,
`GetPlayerName`, `GetTeamIdFromPlayerId`, `GetPlayersStats`, `GetDBTablesNames`,
`GetDBTableFields`, `GetDBTableRows` (satır alanı: `row.<alan>.value`), `GetTransferBudget`,
`GetUserTransferBudget`, `GetUserWageBudget`, `Sleep`, `AddEventHandler("post__CareerModeEvent", fn)`,
`require "imports/external/json"`. Kaynaklar: FC 24/FIFA 23 Live Editor wiki ve FC 26'da çalışan
`fc26-mcp` projesinin `le_bridge.lua` dosyası. **FC 27'de isimler değişmiş olabilir.** Script hepsini
`pcall` ile çağırıyor ve eksik olanları log'a yazıyor.

**FC 27 Live Editor v27.1.3 bulguları** (lua klasörü incelendi, oyunda henüz denenmedi):
- Asıl veritabanı API'si v2: `LE.db:GetTable("players")` → `GetFirstRecord()` / `GetNextValidRecord()` /
  `GetRecordFieldValue(rec, alan)`. Yukarıdaki v1 fonksiyonları (`GetDBTableRows` vb.) çalışmayabilir.
- Career event enum öneki `ENUM_FCEGameModesCM_EVENT_MSG_*` oldu; ID'ler eskisine göre +1 kaymış.
- `imports/http` ile Lua'dan HTTP GET/POST atılabiliyor (bkz. §9 Faz 2, HTTP köprüsü).
- `exporter/lua/fc_export.lua` 0.2.0 bunlara göre güncellendi; `le_capabilities.lua` hangi fonksiyonların
  gerçekten var olduğunu dosyaya döker.

---

## 3. Faz 0: Veri keşfi (oyunda, Windows PC'de, Ali yapacak)

Örnek verideki kolon adları **tahmin**. Gerçek adlar ilk snapshot'taki `*__schema.json` ve CSV
başlıklarından doğrulanmalı. Kod ham alan adlarını **asla doğrudan kullanmamalı**, araya bir eşleme
katmanı girmeli (bkz. §4.2).

Doğrulanacaklar:
| Konu | Soru | Örnekte varsayılan |
|---|---|---|
| Doğum tarihi | `players.birthdate` hangi epoch'ta? Bilinen bir oyuncunun oyundaki yaşıyla karşılaştır | 1582-10-14'ten itibaren gün |
| Pozisyon | `preferredposition1` kod tablosu | 0=GK, 3=RB, 5=CB, 7=LB, 10=CDM, 14=CM, 18=CAM, 12=RM, 16=LM, 23=RW, 27=LW, 25=ST |
| Sözleşme | Maaş ve bitiş tarihi hangi tabloda/alanda? (`career_playercontract`?) | `wage`, `contract_end_year` |
| Piyasa değeri | Oyunun hesapladığı değer DB'de var mı? | Yok → kendi tahminimiz |
| Lig ve ülke isimleri | `leagues.leaguename`, `nations.nationname` var mı, yoksa localization mı? | var |
| Milli takımlar | Milli takımlar `teams` tablosunda nasıl ayırt edilir? | `leagueteamlinks` üzerinden |
| Kiralık oyuncular | Kiralık oyuncunun kulübü nasıl görünür? | bilinmiyor |

**Çıktı:** `docs/data-dictionary.md` ve `config/field-map.json` (bkz. §4.2).
**Kabul:** Gerçek bir snapshot ile piyasa tablosunda 10 bilinen oyuncunun yaşı, pozisyonu, OVR/POT
değeri ve kulübü oyundakiyle aynı görünmeli.

---

## 4. Mimari

### 4.1 Repo yapısı
```
fc-market/
  exporter/                 # bu kit: lua/, tools/ (formatı değiştirirken versiyonu artır)
  backend/FcMarket.Api/     # ASP.NET Core 9 Minimal API
  backend/FcMarket.Tests/   # xUnit
  frontend/                 # React + Vite + TypeScript
  config/field-map.json
  sample_export/            # make_sample_export.py çıktısı (git'e girmez, script ile üretilir)
  docs/
```

**Teknoloji önerisi** (Ali'nin mevcut stack'i):
- Backend: ASP.NET Core 9 Minimal API, `Microsoft.Data.Sqlite` + Dapper. EF kullanma, çünkü şema dinamik.
- Frontend: React 18 + Vite + TypeScript, TanStack Table (sanal kaydırma ile 20k+ satır),
  TanStack Query, Recharts (radar/çizgi), Tailwind veya CSS Modules.
- İki ayrı veritabanı:
  - `fc_career.db` → importer'ın. Backend bunu **ReadOnly** açar (`Mode=ReadOnly`).
  - `app.db` → uygulamanın kendi verisi (shortlist, notlar, presetler). Sadece backend yazar.

### 4.2 Alan eşleme katmanı (en önemli tasarım kararı)
`config/field-map.json` kanonik isimleri ham DB alanlarına bağlar. Böylece FC sürümü değişince
sadece bu dosya güncellenir:
```json
{
  "player": {
    "id": "playerid", "overall": "overallrating", "potential": "potential",
    "birthdate": "birthdate", "position1": "preferredposition1", "position2": "preferredposition2",
    "nationality": "nationality", "foot": "preferredfoot", "height": "height", "weight": "weight",
    "skillMoves": "skillmoves", "weakFoot": "weakfootabilitytypecode"
  },
  "birthdateEpoch": "1582-10-14",
  "positions": { "0": "GK", "3": "RB", "5": "CB", "7": "LB", "10": "CDM", "14": "CM",
                 "18": "CAM", "12": "RM", "16": "LM", "23": "RW", "27": "LW", "25": "ST" },
  "contract": { "table": "career_playercontract", "playerId": "playerid", "wage": "wage",
                "endYear": "contract_end_year" },
  "attributeGroups": {
    "Hız":       ["acceleration", "sprintspeed"],
    "Şut":       ["finishing", "shotpower", "longshots", "volleys", "penalties", "positioning"],
    "Pas":       ["shortpassing", "longpassing", "vision", "crossing", "freekickaccuracy", "curve"],
    "Top sürme": ["dribbling", "ballcontrol", "agility", "balance", "reactions", "composure"],
    "Savunma":   ["defensiveawareness", "standingtackle", "slidingtackle", "interceptions", "headingaccuracy"],
    "Fizik":     ["strength", "stamina", "jumping", "aggression"],
    "Kaleci":    ["gkdiving", "gkhandling", "gkkicking", "gkreflexes", "gkpositioning"]
  }
}
```
- Backend açılışta field-map'i `schema_fields` tablosuyla karşılaştırır. Eksik alan varsa log'a ve
  `/api/health` cevabına uyarı ekler. Eksik alan yüzünden çökmemeli, ilgili kolon boş gösterilmeli.
- Grup skoru = ilgili alanların ortalaması. Kaleci grubu sadece GK için gösterilir.

### 4.3 Türetilmiş metrikler (backend'de, birim testli)
- **Yaş:** oyun tarihi (`snapshots.game_date`) − doğum tarihi. Gerçek tarih değil, oyun tarihi kullanılır!
- **Pozisyon grubu:** GK / DEF / MID / ATT
- **Gelişim hızı:** `v_player_history` üzerinden aylık ΔOVR (son N snapshot)
- **Sözleşmede kalan yıl:** `endYear − oyun yılı`
- **Tahmini piyasa değeri (€).** Oyunun değeri DB'de yoksa bu kullanılır. Bütün katsayılar
  `appsettings.json`'da tutulur ve UI'da "neden bu değer" açıklaması gösterilir:
  ```
  base      = 1.5M × e^(0.16 × (OVR − 60))          # 60→1.5M, 70→7.4M, 80→37M, 85→82M
  ageMult   = yaş ≤ 21 → min(2.0, 1 + 0.04 × (POT − OVR))
              22–28 → 1.0 ; 29–31 → 0.7 ; 32+ → 0.4
  contrMult = kalan 0 yıl → 0.4 ; 1 yıl → 0.7 ; ≥2 → 1.0
  posMult   = GK 0.8 ; ST/LW/RW/CAM 1.1 ; diğer 1.0
  value     = base × ageMult × contrMult × posMult   (en yakın 50K'ya yuvarla)
  ```
- **Fırsat skoru (0–100):** büyüme alanı (POT−OVR), gelişim hızı, sözleşme bitişi (ucuzluk) ve
  yaştan oluşan ağırlıklı skor. Ağırlıklar config'de durur, UI'da bileşenleri gösterilir.

---

## 5. Backend API (Minimal API, sadece `127.0.0.1`'e bind)

| Method | Path | Açıklama |
|---|---|---|
| GET | `/api/health` | DB bağlantısı, son snapshot, field-map uyarıları |
| GET | `/api/saves` | Save listesi (save_uid, kullanıcı takımı, snapshot sayısı, son tarih) |
| GET | `/api/snapshots?saveUid=` | Snapshot listesi |
| GET | `/api/filters/options?saveUid=` | Lig, kulüp, ülke, pozisyon seçenekleri |
| GET | `/api/players?saveUid=&q=&ageMin=&ageMax=&pos=&ovrMin=&potMin=&league=&club=&nation=&contractEndsBy=&valueMax=&foot=&sort=&dir=&page=&pageSize=` | Sunucu tarafı filtre, sıralama, sayfalama |
| GET | `/api/players/{id}?saveUid=` | Detay: kanonik DTO, gruplar, değer kırılımı, istatistik, sözleşme |
| GET | `/api/players/{id}/history?saveUid=` | OVR/POT zaman serisi + kulüp değişimleri |
| GET | `/api/compare?ids=1,2,3&saveUid=` | Karşılaştırma verisi |
| GET | `/api/feed?saveUid=&from=&to=` | Event log ve snapshot diff olayları |
| GET | `/api/budget?saveUid=` | Bütçe, shortlist hedef fiyatları, kalan |
| CRUD | `/api/shortlist` | `{playerId, saveUid, note, tags[], targetPrice, addedAt, addedSnapshotId}` |
| CRUD | `/api/presets` | Kayıtlı filtreler `{name, query}` |

- `saveUid` verilmezse en son snapshot'ı olan save kullanılır.
- Varsayılan `pageSize` 100, en fazla 500. Sanal kaydırma için toplam sayı döndürülür.
- Importer `playerid`/`teamid` kolonu olan her `raw_*` tablosuna `(snapshot_id, playerid|teamid)` index'i ekler.

### Snapshot diff motoru (haber akışı için)
Event log'daki event'ler detay içermiyor (sadece tip ve tarih). Bu yüzden ardışık iki snapshot karşılaştırılır:
- `club_teamid` değişti → **Transfer**: "X, A'dan B'ye geçti"
- OVR ≥ +3 arttı → **Gelişim patlaması**
- POT değişti → **Potansiyel revizyonu**
- Oyuncu yeni snapshot'ta yok → **Emekli/silindi**. Yeni playerid geldi → **Yeni oyuncu/regen**
- Shortlist'teki bir oyuncu için olay varsa öne çıkarılır.
Sonuçlar `app.db`'de cache'lenebilir (`feed_items`).

---

## 6. Ekranlar (frontend)

Genel kurallar: koyu tema varsayılan (açık tema da olmalı), arayüz Türkçe ama i18n'e hazır, para
birimi formatı "37,4 M€", sayılar tabular-nums ile hizalı. Masaüstünde 1440px, tablette 1024px
düzgün görünmeli.

1. **Ana sayfa `/`**: kullanıcı takımı, oyun tarihi, transfer ve maaş bütçesi, son snapshot zamanı.
   Uyarı kartları: "Shortlist'teki 2 oyuncunun sözleşmesi bu sezon bitiyor", "3 oyuncu bu ay +3 OVR".
   Save seçici de burada.
2. **Piyasa `/market`** (ana ekran):
   - Sol panel filtreleri: isim arama, yaş aralığı, pozisyon (çoklu), OVR/POT aralığı, lig, kulüp, ülke,
     "sözleşmesi şu yıla kadar bitenler", maksimum tahmini değer, ayak.
   - Hazır presetler: *Wonderkid'ler* (≤21, POT≥85), *Bedavaya gelecekler* (sözleşme ≤ bu sezon),
     *Kelepir* (fırsat skoru yüksek), *Hazır yıldız* (OVR≥82, ≤28). Kullanıcı kendi preset'ini de kaydedebilir.
   - Tablo: sanal kaydırma, kolon seçimi, çoklu sıralama, OVR/POT renk rozetleri, gelişim oku (↑/↓),
     yıldız butonu.
   - Satıra tıklayınca sağdan detay drawer'ı açılır. Satırlar karşılaştırmaya da seçilebilir (en fazla 4).
3. **Oyuncu detayı `/player/:id`**: başlık kartı (isim, yaş, pozisyon, kulüp, ülke, OVR/POT), radar
   (özellik grupları), OVR/POT gelişim çizgisi (snapshot'lar), sezon istatistikleri, sözleşme bilgisi,
   **değer kırılımı** (base × yaş × sözleşme × pozisyon), fırsat skoru bileşenleri, shortlist notu.
4. **Karşılaştır `/compare?ids=`**: üst üste radar, alan alan tablo, en iyi değer vurgusu.
5. **Shortlist `/shortlist`**: hedef fiyat, notlar, etiketler, "eklendiğinden beri" değişim
   (OVR farkı, kulüp değişti mi). Toplam hedef fiyat de gösterilir.
6. **Haber akışı `/feed`**: oyun tarihine göre gruplu kartlar (transfer, gelişim, şampiyonluk,
   sakatlık), filtreler: sadece shortlist / sadece kendi ligim.
7. **Bütçe `/budget`**: transfer bütçesi − shortlist hedef fiyatları = kalan. Maaş bütçesi etkisi.
   "Bunu alırsam" simülasyonu.

> Görsel tasarım için `frontend-design` yaklaşımı: klişe admin-panel görünümünden kaçın.
> Futbol/scout raporu hissi veren, yoğun ama okunabilir bir arayüz olmalı.

---

## 7. Fonksiyonel olmayan gereksinimler
- **Güvenlik:** backend sadece `127.0.0.1`'i dinler. Kimlik doğrulama yok. Dışarıya hiçbir veri gönderilmez.
  (Tabletten erişim istenirse ayar ile LAN IP'ye açılır ve README'de uyarı olur.)
- **Eşzamanlılık:** importer `--watch` ile yazarken backend okuyabilmeli (WAL + ReadOnly bağlantı).
  Yeni snapshot gelince frontend 30 sn polling ile ya da SSE ile "yeni veri var" bildirimi göstermeli.
- **Performans:** 20.000 oyuncu ve 12 snapshot ile `/api/players` sorgusu 300 ms altında dönmeli.
- **Dayanıklılık:** eksik tablo ya da alan uygulamayı çökertmemeli. Sorun `/api/health`'te raporlanır,
  UI'da ise sarı bir banner gösterilir.

## 8. Geliştirme akışı (Mac'te, oyunsuz)
```bash
python exporter/tools/make_sample_export.py ./sample_export --months 6 --players 3000
python exporter/tools/importer.py ./sample_export --db ./fc_career.db
dotnet run --project backend/FcMarket.Api   # FC_CAREER_DB=./fc_career.db
cd frontend && npm i && npm run dev
```
- Testler: xUnit ile değer tahmini, fırsat skoru, yaş hesabı, field-map doğrulaması ve snapshot diff.
- Örnek veri üreteci ile export formatı **senkron tutulmalı**. Format değişirse ikisi birlikte güncellenir.

## 9. Fazlar ve kabul kriterleri

> Senkronizasyon ve otomasyon tasarımı (güncelleme katmanları, izleme listesi, HTTP, oyuna yazma, fotoğraflar):
> [docs/sync-design.md](docs/sync-design.md). Onaylandı (16.10.2026).

**Faz 0: Veri keşfi** (§3)
- [x] Gerçek snapshot alındı, `docs/data-dictionary.md` ve `config/field-map.json` dolduruldu (17.10.2029, 23.427 oyuncu)
- [ ] 10 bilinen oyuncu doğrulandı (yaş, pozisyon, OVR/POT, kulüp)

**Faz 1: MVP**
- [x] Backend: health, saves, filters/options, players (filtre/sıralama/sayfalama), player detail
- [x] Field-map katmanı ve testleri
- [x] Piyasa ekranı ve detay drawer'ı, örnek veriyle çalışıyor
- [x] Tahmini değer ve kırılımı görünüyor
- [x] Mac'te örnek veriyle, Windows'ta gerçek veriyle tek komutla ayağa kalkıyor
      (Mac: `./dev.sh`; Windows: `start.ps1`, gerçek snapshot ile 16.10.2026'da doğrulandı)

**Faz 1 bakımı: senkronizasyon temeli** (sync-design §10.1)
- [x] `AUTO_SNAPSHOT_ON_MONTH` açık; `PREPARE_FOR_SAVE` sırasında ve aynı oyun gününde ikinci snapshot alınmaz
- [x] Snapshot'a `transfers`, `playerloans`, `playersuspensions` eklenir (exporter 0.3.0)
- [x] Importer tek örnek kilidi; `make_sample_export.py` FC 27 biçiminde
- [x] 0.3.0 oyunda denendi (otomatik aylık snapshot çalışıyor; `transfers`/`playersuspensions` boş, `playerloans` bayat: sync-design §11)

**Faz 2: Scout araçları**
- [ ] Oyuncu detay sayfası (radar, gelişim grafiği)
- [x] Shortlist (`app.db`): yıldız (tablo + drawer), `/shortlist` sayfası (hedef fiyat, etiket, not, eklendiğinden
      beri OVR/kulüp değişimi, bütçeye göre kalan)
- [ ] Karşılaştırma, kayıtlı presetler
- [x] Snapshot diff motoru ve haber akışı (`/feed`): transfer, gelişim, potansiyel, sözleşme, yeni/ayrılan oyuncu +
      event log. FC 27'de `transfers` tablosu boş olduğu için yalnızca snapshot farkı; bonservis yok
- [ ] İzleme listesi: backend shortlist'ten `C:\FCExport\in\watchlist.json` yazar (atomik), Lua okur
- [ ] Hafif güncelleme: `DAY_PASSED`'da kullanıcı takımı + izleme listesi (delta dosyası, importer
      `player_updates`, backend bindirme, UI'da oyuncu başına veri tarihi). Önce oyunda süre ölçümü, bütçe < 30 ms

**Faz 3: Konfor**
- [ ] Bütçe simülatörü, ana sayfa uyarıları
- [ ] Importer'ın .NET `BackgroundService` olarak portlanması (FileSystemWatcher), Python bağımlılığının kalkması
- [ ] (Opsiyonel) Claude API ile doğal dilde scout raporu: "hava topunda zayıf, pres altında soğukkanlı"
- [ ] HTTP köprüsü (opsiyonel hızlandırıcı; ana yol dosya köprüsü). Live Editor'ün `imports/http` istemcisi
      **senkron** (oyun thread'ini bloklar) ve Lua'da zamanlayıcı yok; komutlar ancak bir event'te (ör. `DAY_PASSED`)
      çekilebilir. Önce timeout birimi ve kapalı backend'de bekleme süresi oyunda ölçülür. Sonra:
      - Oyun → backend: hafif güncelleme sonrası "yeni veri var" bildirimi (SSE ile frontend'e); hata olursa
        sessizce atlanır, veri zaten dosyada.
      - Backend → oyun: yalnızca salt-okuma komutları ("şimdi export al"), bir sonraki event'te çalışır.
      - Backend yine yalnızca `127.0.0.1`'i dinler ve `fc_career.db`'ye yazmaz.
- [ ] Oyuncu fotoğrafları: **bloklu**, FC 27 LE v27.1.3'te `PlayerCapture*` yok. LE güncellenince
      `le_capabilities.lua` ile yeniden bakılır.

**Faz 4: Oyuna yazma (AYRI KARAR, v1'de yok)**
- FC 27 LE v27.1.3'te `CreateOfferForPlayer`, `AddPlayerToTransferList`/`AddPlayerToLoanList`/
  `RemovePlayerFromLists` **yok**. Var olanlar: `SetPlayerForm/Morale/Fitness` (ilk aday, yalnızca kullanıcı takımı)
  ve müzakeresiz anında işlem yapan `cTransferPlayer`/`cLoanPlayer`/`cReleasePlayer` (riskli). Ayrıntı:
  sync-design §6.
- Kodda `ExecuteSQL`, `EditDBTableField`, `InsertDBTableRow`, `DeleteDBTableRow*` ve bellek `Write*` çağrısı
  olmayacak; test/grep ile zorlanır.
- **Riskler:** fc26-mcp projesi, oyunun maaş/sözleşme/moral durumunu bellekteki manager'larda
  tuttuğunu ve `teamplayerlinks`, `career_playercontract` gibi tablolara doğrudan yazmanın save'i
  bozabileceğini belirtiyor. Asla ham DB yazımı yapılmaz, sadece LE'nin kendi fonksiyonları kullanılır.
  Her işlemden önce save yedeği alınır ve işlem sonucu doğrulanır.

**Faz 5: Career Mode oyun içi mod'ları (oyuna yazar, AYRI ONAY)**
> Değerlendirme ve tasarım: [docs/career-mods.md](docs/career-mods.md). Onaylandı (17.10.2026); CLAUDE.md
> kuralı Faz 5 mod'larına izin verecek şekilde güncellendi. Oyun içi test rehberi: [docs/m0-test-guide.md](docs/m0-test-guide.md).
- [ ] M0 Altyapı: autorun loader (`post__LEInitDoneEvent` + tek `CareerModeEvent` dağıtıcısı), save başına durum
      (`extensions\careers\<saveuid>\fcm_mods.json`), dry-run + CSV rapor, yazmadan önce save yedeği; oyunda
      doğrulamalar (autorun klasörü, `players` yazımının kalıcılığı, OVR yeniden hesabı, gelişim planı).
      Durum: 11 doğrulama script'i ve `tools/backup-saves.ps1` hazır, oyunda denenmedi
- [ ] M1 Her takıma yıldız aday, yol B (mevcut 17–21 yaş oyuncuyu pozisyon ağırlıklarıyla tutarlı yükselt;
      parametrik hedef, lig/milli/kadın filtreleri). Yol A (`CreatePlayer`) FC 27 LE'de yok
- [ ] M2 FFP ve Süper Lig yabancı kuralı, yalnızca uyarı (gelir verisi ve transfer yasağı API'si yok)
- [ ] M3 Patlama/sönme gelişim (durum save JSON'unda, değerler `players`'ta)
- [ ] M4 Altın nesil akademi (akademiye gelen oyuncuyu yükselt; üretim şablonuna yazım yok)
- [ ] M5 Büyük maç psikolojisi, yalnızca kullanıcı takımı (`SetPlayerForm/Morale` rakipte çalışmıyor)
- Yapılmayacak: hoca kovulma zinciri (API yok, `manager` tablosuna ham yazım gerekir); para cezası gibi bütçe
  belleğine yazım (ofsetler doğrulanmadan).

## 10. Claude Code için çalışma kuralları
1. Ham DB alan adlarını koda gömme, her zaman field-map üzerinden eriş.
2. `fc_career.db`'ye asla yazma. Uygulama verisi `app.db`'ye gider.
3. Export formatını değiştirirsen `fc_export.lua` içindeki `VERSION`'ı artır ve
   `make_sample_export.py` ile `importer.py`'yi birlikte güncelle.
4. Oyun gerektiren her varsayımı `docs/data-dictionary.md`'de **"DOĞRULANACAK"** olarak işaretle.
5. Oyuna yazan hiçbir özellik ekleme. Faz 4 ayrıca onaylanacak.
6. Küçük commit'ler at. Her fazın sonunda kabul kriterlerini işaretle.
