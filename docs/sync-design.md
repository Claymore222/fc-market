# Veri senkronizasyonu ve otomasyon: tasarım değerlendirmesi

> Durum: **onaylandı** (16 Ekim 2026). §10.1 (Faz 1 bakımı) uygulandı. Başka bir sohbetteki fikirlerin mevcut kod ve FC 27 / Live Editor
> v27.1.3 bulgularıyla değerlendirilmesi. Bulguların kaynağı: `docs/data-dictionary.md` → "FC 27 / Live Editor v27.1.3",
> `C:\FC27LE\lua\libs\v2` kaynak kodu ve ilk gerçek snapshot (17.10.2029, 23.427 oyuncu).

## 1. Özet

| Fikir | Değerlendirme |
|---|---|
| Site oyuna canlı sorgu atmaz, oyun kapalıyken de çalışır | **Zaten böyle.** Korunmalı. |
| Filtre/kaydırma SQLite'tan, `player_current` + LIMIT/OFFSET/keyset | **Değiştirilmemeli.** Bellek içi piyasa daha hızlı ve türetilmiş alanlar SQL'de sıralanamıyor (§2.2). |
| `useInfiniteQuery` + 300 ms debounce | Debounce zaten var. Mevcut "seyrek sayfa" yaklaşımı `useInfiniteQuery`'den iyi (§2.2). |
| Ayda bir otomatik tam snapshot | **Hemen yapılabilir.** `AUTO_SNAPSHOT_ON_MONTH` var, kapalı. Ölçülen süre ~5 sn. |
| Her `DAY_PASSED`'da hafif güncelleme (~50 oyuncu) | **Mümkün, yeni format gerektiriyor.** Ölçüm ve kısma (throttle) şart (§3.2). |
| Event log anında | Var (`events.jsonl`, 35 event tipi). Event'ler detay taşımıyor; DB'deki `transfers` tablosu da FC 27'de boş çıktı (§11). Haber akışı snapshot farkından |
| Oyuncu başına "veri tarihi" | Hafif güncellemeyle birlikte anlamlı. Şimdilik tek tarih: snapshot tarihi. |
| İzleme listesi site → oyun | Dosya (`watchlist.json`) ile yapılmalı (§4). |
| HTTP köprüsü | **İkincil.** `HTTP:send` senkron, oyun thread'ini bloklar, Lua'da zamanlayıcı yok (§5). |
| Oyuna yazma: güvenli API'ler | **Planlanan API'lerin çoğu FC 27 LE'de yok** (§6). Faz 4 park. |
| PlayerCapture ile fotoğraf | **FC 27 LE v27.1.3'te yok** (0/6). Park (§7). |

## 2. Mevcut durum ve gereken değişiklikler

### 2.1 Zaten yapılanlar
- Tek yönlü akış: oyun → `C:\FCExport` → importer (`--watch`) → `fc_career.db` (WAL) → backend (ReadOnly) → frontend.
  Backend oyuna hiç bağlanmıyor; oyun kapalıyken son snapshot'la çalışıyor.
- Commit protokolü: importer yalnızca `manifest.jsonl`'deki snapshot'ları okuyor (manifest satırı en son yazılıyor),
  `events.jsonl`'de yarım satırı atlıyor.
- `player_current`: `_new` tabloya yazılıp tek transaction'da yer değiştiriyor; okuyucular yarım tablo görmüyor
  (20 yenileme × 9.864 eşzamanlı okuma ile test edildi).
- Frontend: sunucu tarafı sayfalama, TanStack Virtual, isim aramasında 300 ms debounce, 30 sn'de bir
  "yeni snapshot" kontrolü.

### 2.2 Filtre/kaydırma: neden SQL'e taşınmamalı
- Değer, fırsat skoru, gelişim hızı ve yaş C#'ta, `appsettings.json`'daki ayarlanabilir katsayılarla hesaplanıyor.
  SQL'de sıralamak için formülü SQL'e kopyalamak gerekir (iki kaynak, test edilemez).
- Ölçüm (20k × 12): `player_current`'tan yükleme raw tablolara göre yalnızca ~2 ms kazandırıyor. Bellek içi sayfa
  sorgusu 1–4 ms; bir sıralamanın snapshot'taki ilk kullanımı ≤ 45 ms.
- OFFSET bellekte O(n) bir geçiş (20k'da < 1 ms); keyset gereksiz.
- `useInfiniteQuery` yalnızca sırayla ileri yükler. Mevcut çözüm kaydırma çubuğuyla 15.000. satıra atlayınca
  sadece o sayfayı çekiyor; 20k satırda bu daha iyi.
- `player_current` başka okuyucular (ad-hoc SQL, ileride diff motoru) için kalsın.

## 3. Güncelleme katmanları

### 3.1 Tam snapshot (ayda bir + elle)
- Ölçüm: 7 tablo + isimler + 268 tablonun şeması **4,6 sn**; bunun 3,7 sn'si `players` (23.427 × 152 alan).
- FC 27 LE'de `Sleep` yok ve zamanlayıcı yok: export parçalara bölünüp kareler arasına yayılamaz. Lua coroutine'i
  var ama onu sonraki karede devam ettirecek bir kanca yok. **Donma kaçınılmaz; ayda bir kabul edilebilir.**
- `MONTH_PASSED` handler'ında `AUTO_SNAPSHOT_ON_MONTH = true` ile açılabilir. Ek öneriler:
  - `PREPARE_FOR_SAVE` sırasında snapshot alma (kayıtla üst üste binmesin), aynı oyun gününde ikinci snapshot alma.
  - Transfer penceresi için `TRANSFER_WINDOW_OPENING_SOON` event'i zaten izleniyor; otomatik snapshot'a bağlanabilir.
- Snapshot'a eklenmesi önerilen tablolar (küçük, haber akışı için değerli):
  `transfers` (alıcı, satıcı, bonservis, tarih), `playerloans` (kiralayan takım, bitiş, satın alma opsiyonu),
  `playersuspensions`. Export formatına ekleme olduğu için `VERSION` artar, örnek veri üreteci güncellenir.

### 3.2 Hafif güncelleme (`DAY_PASSED`, izleme listesi)
Okunabilecekler (gerçek şemaya göre):
| Alan | Kaynak |
|---|---|
| OVR, POT, sözleşme yılı, maaş | `players` |
| Kulüp, form, sakatlık | `teamplayerlinks` (`teamid`, `form`, `injury`). `injury` anlamı **DOĞRULANACAK** (snapshot'ta hep 0) |
| Ceza | `playersuspensions` (`games`, `enddate`) |
| Kiralık | `playerloans` |
| Moral | DB'de yok; ayrıca araştırılmalı |

Maliyet ve kurallar:
- Her tablo **tek geçişte** okunur: önce izleme listesindeki id'ler bir set'e alınır, tablo bir kez dolaşılır, eşleşen
  satırların sadece gereken alanları okunur. Oyuncu başına tablo taramak (50 × 23k) yasak.
- Tahmin: 23k kayıtta yalnız `playerid` okumak ~25–50 ms. `DAY_PASSED` simülasyonda art arda geliyor; günlük 50 ms
  simülasyonu fark edilir yavaşlatabilir. **Önce ölçülmeli.** Hedef < 30 ms; aşılırsa N günde bir ya da yalnızca
  maç günü/pencere günleri.
- Format önerisi: `updates/<save8>_<YYYYMMDD>_<HHMMSS>__delta.json` (oyun tarihi, save_uid, oyuncu → alanlar). Commit:
  önce `.tmp`, sonra `os.rename` (Lua'da var). Snapshot değildir; `manifest.jsonl`'e girmez.
- Importer: `player_updates(save_uid, game_date, playerid, field, value, imported_at)` tablosu.
- Backend: son snapshot'tan **daha yeni** delta'ları piyasaya bindirir; her oyuncu için `dataDate` = en yeni kaynak
  tarihi. UI: "1 Eylül itibarıyla" etiketi, eskiyse soluk.
- Format değişikliği: `VERSION` → 0.3.0, `make_sample_export.py` delta da üretmeli.

### 3.3 Event log
- Var: `events.jsonl`, 35 event tipi (enum'lar LE `C:\FC27LE`'ye taşındıktan sonra yükleniyor).
- Sorun: kayıt yalnızca event adı + tarih. Handler'ın 3. argümanının (`event`) içeriği bilinmiyor; içinden oyuncu/takım
  okunabiliyor mu **araştırılmalı**.
- ~~Daha güvenilir kaynak: DB'deki `transfers` tablosu.~~ Oyunda denendi: FC 27'de `transfers` yalnızca bir yer tutucu
  satır içeriyor (§11). Haber akışının kaynağı **snapshot farkı** (kulüp, OVR, POT değişimi); bonservis bilinmiyor.
  Event'ler "ne zaman ve ne tür" bilgisi olarak yanına konur.

## 4. İzleme listesi (site → oyun, salt-okuma)
- Shortlist henüz yok (Faz 2, `app.db`).
- Öneri: backend shortlist değişince `C:\FCExport\in\watchlist.json` yazar (`save_uid`, `playerIds`, `updatedAt`).
  Atomik yazım: geçici dosya + `File.Move(overwrite)`. Lua her hafif güncellemede okur (küçük dosya, `io.open` +
  `imports/external/json`).
- Backend `fc_career.db`'ye yazmıyor; bu dosya export klasöründe ama ayrı `in/` alt klasöründe, importer görmez.
- Kullanıcı takımı listeye otomatik girer (`GetUserTeamID` + `teamplayerlinks`).
- Oyundaki takip listesi: DB'de shortlist tablosu **yok** (268 tablo tarandı; yalnızca `career_scoutmission`,
  `career_scouts`). `USER_SHORTLISTED` (136) event'i var ama hangi oyuncu olduğu bilinmiyor (§3.3'teki aynı soru).

## 5. Taşıma katmanı
### 5.1 HTTP: LE kaynak kodundan bulgular
- `HTTP:send(req)` doğrudan C fonksiyonu `SendHTTPRequest`'i çağırıp **yanıtı döndürüyor: senkron.** Event handler
  içinden çağrılırsa yanıt gelene kadar oyun thread'i durur.
- `timeout` birimi belirsiz: LE'nin kendi testinde `10000 -- 1s` ve `50000 -- 5s` yazıyor. **DOĞRULANACAK.**
- Backend kapalıyken `127.0.0.1`'e bağlantı normalde hemen reddedilir (ms). Backend açık ama takılıysa oyun
  timeout kadar bekler. **Oyunda ölçülmeli.**
- Lua'da zamanlayıcı yok: komut kuyruğunu (`GET /api/commands`) yoklamak ancak bir event handler'ı içinde olur
  (`DAY_PASSED` vb.). **Oyun menüde dururken komut çalışmaz**; "Fotoğraf üret" gibi butonlar bir sonraki gün
  ilerlemesine kadar bekler.
- Mimari çakışma: `POST /api/ingest`'in verisini backend nereye yazacak? `fc_career.db` importer'ın ve salt-okunur.
  Backend gelen veriyi ya `app.db`'ye ya da export klasörüne dosya olarak yazmalı. İkincisi dosya köprüsünün aynısı.

### 5.2 Öneri
- **Dosya köprüsü ana yol** olarak kalsın: backend kapalıyken veri kaybolmuyor, importer sonra alıyor, zaten test edildi.
  Gecikme importer'ın `--watch` aralığı kadar (şu an 10 sn, 2 sn'ye inebilir).
- **HTTP opsiyonel hızlandırıcı:** yalnızca "yeni veri var" bildirimi (backend → SSE → frontend) ve hafif güncelleme
  sonrası tek POST. Kısa timeout (ölçülen birimle ~200 ms). Hata olursa sessizce dosyaya düşülür; aynı veri dosyada
  zaten var, kuyruk gerekmez.
- Komut kuyruğu (site → oyun) Faz 4 ile birlikte düşünülmeli; salt-okuma komutlar ("şimdi export al") bile ancak
  bir sonraki event'te çalışır.

## 6. Oyuna yazma (Faz 4, ayrı onay)
FC 27 LE v27.1.3'te bulunanlar (global C fonksiyonları, `le_capabilities.txt`):
| Planlanan | Durum |
|---|---|
| `AddPlayerToTransferList` / `AddPlayerToLoanList` / `RemovePlayerFromLists` / `IsPlayerTransferListed` | **Yok.** LE'nin v1 kütüphanesindeki sarmalayıcılar `cAddPlayerToTransferList` vb. çağırıyor, bu C fonksiyonları yok |
| `CreateOfferForPlayer` | **Yok** |
| `SetPlayerMorale` / `SetPlayerForm` / `SetPlayerFitness` | Var (`SetPlayerSharpness` yok) |
| `cTransferPlayer`, `cLoanPlayer`, `cReleasePlayer`, `TerminateLoan` | Var, ama müzakeresiz anında işlem (hile niteliğinde, riskli) |
| `EditDBTableField`, `InsertDBTableRow`, `DeleteDBTableRowByAddr`, `ExecuteSQL`, `Write*` | Var. **Ham yazım; yasak** |

Öneri:
- Faz 4 park. İlk aday yalnızca kullanıcı takımı için `SetPlayerForm/Morale/Fitness` (LE'nin kendi örnek script'leri
  bunu yapıyor). Transfer listesi/teklif LE güncellemesini bekler.
- Kod tabanında `ExecuteSQL`, `EditDBTableField`, `InsertDBTableRow`, `DeleteDBTableRow*`, `Write*` çağrısı olmadığını
  test/grep ile zorla.
- Komut geçmişi `app.db`'de; her komuttan sonra değer yeniden okunarak doğrulanır; save yedeği hatırlatması.

## 7. Oyuncu fotoğrafları
- `PlayerCapture*` fonksiyonlarının hiçbiri FC 27 LE v27.1.3'te yok (0/6). Özellik **bloklu**.
- Hazır olan: backend `faces/<playerid>.png` sunuyor, yoksa baş harfli avatar. LE güncellenince `le_capabilities.lua`
  tekrar çalıştırılıp bakılır. İnternetten görsel çekmek kapsam dışı (PLAN §7).

## 8. Riskler
| Risk | Durum ve önlem |
|---|---|
| Oyunun donması | Tam snapshot ~5 sn, bölünemez (`Sleep`/zamanlayıcı yok). Ayda bir. Hafif güncelleme ölçülmeden açılmaz; bütçe < 30 ms |
| LE TABLE iterasyon durumu | Durum (`current_record_idx`) TABLE **nesnesinde**. `LE.db:GetTable` her çağrıda yeni nesne döndürdüğü için iki farklı tabloyu iç içe dolaşmak çalışır; **aynı nesneyi** iç içe dolaşmak bozulur. Ayrıca `TABLE:new()` varsayılanları sınıf tablosuna yazıyor (metatable hatası), sınıf alanlarına güvenilmemeli. Kural: her tablo tek geçişte Lua tablosuna okunur, birleştirme Lua'da yapılır (`club_teams_by_player` gibi) |
| Save bozulması | Okuma tarafında yok: hiçbir DB/bellek yazımı yapılmıyor. Bellek ofsetleri (takvim, bütçe) oyun güncellemesiyle kayarsa okuma çöp döner ya da oyun çökebilir, save etkilenmez. Tarih için akıl kontrolü var; `fc_probe.lua` ile yeniden doğrulanır |
| Kayıt sırasında export | `PREPARE_FOR_SAVE` / save sırasında snapshot alınmamalı |
| Eşzamanlı yazma (dosya) | Snapshot: manifest en son. Delta ve `watchlist.json`: tmp + rename. `events.jsonl`: yarım satır atlanıyor |
| Eşzamanlı yazma (SQLite) | Tek yazar importer, WAL, backend ReadOnly. **Açık risk:** iki importer aynı anda (ör. `start.ps1` iki kez). Kilit dosyası/mutex ile tek örnek |
| Save değiştirme | Her delta/watchlist `save_uid` taşır; farklı save'in verisi bindirilmez |
| HTTP | Senkron; backend takılırsa oyun bekler. Kısa timeout, hata → dosya |
| LE sürüm farkları | Fonksiyonlar `pcall` ile çağrılıyor; her LE güncellemesinde `le_capabilities.lua` + `fc_probe.lua` |

## 9. `le_capabilities.lua` (ve oyun içi denemelere) bağlı olanlar
`C:\FCExport\le_capabilities.txt` LE taşınmadan **önce** alındı (v2 yüklü değilken). Taşındıktan sonra yeniden
çalıştırılmalı.

| Konu | Bugünkü bilgi | Nasıl doğrulanır |
|---|---|---|
| v2 `LE.db` | Var (taşımadan sonra) | `le_capabilities` yeniden |
| `HTTP` modülü / `SendHTTPRequest` | C fonksiyonu var, `HTTP` global'i v2 ile gelir | `le_capabilities` yeniden |
| `HTTP:send` timeout birimi, kapalı backend'de süre | Belirsiz | Oyunda küçük test script'i |
| `GetCurrentDate`, bütçe fonksiyonları | Yok → bellek ofseti | `fc_probe.lua` |
| `GetPlayersStats` | Yok | LE güncellemesi |
| `Sleep` / periyodik kanca | Yok | LE güncellemesi |
| `PlayerCapture*` | Yok | LE güncellemesi |
| Transfer listesi / teklif fonksiyonları | Yok | LE güncellemesi |
| `SetPlayerForm/Morale/Fitness` | Var | — |
| Event handler'ın `event` argümanı | Bilinmiyor | Oyunda `USER_SHORTLISTED`, `TRANSFER_MOVE_COMPLETE` ile döküm |
| `teamplayerlinks.injury` anlamı | Snapshot'ta hep 0 | Sakat bir oyuncuyla karşılaştırma |
| Hafif güncellemenin süresi | Tahmin 25–50 ms | Oyunda ölçüm |

## 10. Önerilen sıra ve faz eşleşmesi
1. **Hemen (Faz 1 bakımı, risk yok):** `AUTO_SNAPSHOT_ON_MONTH` açık (+ `PREPARE_FOR_SAVE` koruması), snapshot'a
   `transfers`, `playerloans`, `playersuspensions` eklenir (exporter 0.3.0), importer tek örnek kilidi,
   `make_sample_export.py` FC 27 biçimine. `le_capabilities.lua` yeniden çalıştırılır.
2. **Faz 2a:** shortlist (`app.db`), snapshot farkından haber akışı (+ event log).
3. **Faz 2b:** `watchlist.json` → `DAY_PASSED` hafif güncelleme (önce oyunda süre ölçümü), delta formatı, importer
   `player_updates`, backend bindirme, UI'da oyuncu başına veri tarihi.
4. **Faz 3:** HTTP: önce timeout/bloklama ölçümü; sonra yalnızca bildirim (SSE). Komut kuyruğu salt-okuma komutlarla.
5. **Faz 4 (ayrı onay):** yalnızca mevcut güvenli fonksiyonlar (`SetPlayerForm/Morale/Fitness`, kullanıcı takımı).
6. **Park:** fotoğraflar, transfer listesi/teklif (LE güncellemesine bağlı).

## 11. Oyunda doğrulananlar (17 Ekim 2026, exporter 0.3.0)

Oyun 17.10.2029'dan 20.11.2029'a ilerletildi.

- **Otomatik aylık snapshot çalışıyor:** `MONTH_PASSED` (1 Kasım) sonrası ilk günde (2 Kasım) `auto_month` snapshot'ı
  alındı, 5,8 sn. Importer `--watch` hemen içeri aldı. Elle snapshot 6,4 sn.
- **`le_capabilities` (v2 yüklüyken):** `LE` / `LE.db` (268 tablo, 23.427 oyuncu), `HTTP` modülü, `GetCMEventNameByID`,
  1.048 `ENUM_*` var. `Sleep`, `GetCurrentDate`, `GetTeamIdFromPlayerId`, `GetPlayersStats`, `PlayerCapture*` yok.
- **Transfer listesi fonksiyonları yanıltıcı:** `AddPlayerToTransferList`, `AddPlayerToLoanList`, `RemovePlayerFromLists`,
  `IsPlayerTransferListed` LE'nin v1 kütüphanesinde tanımlı **sarmalayıcılar**; çağırdıkları `cAddPlayerToTransferList`
  vb. C fonksiyonları yok, çağrılırsa hata verir. `GetTransferBudget`/`SetTransferBudget` yalnızca uyarı basan eski
  fonksiyonlar. `le_capabilities.lua` artık bunları ayrı gösteriyor. §6'daki değerlendirme değişmedi.
- **`transfers` ve `playersuspensions` boş:** ikisinde de yalnızca `-1` dolu yer tutucu satır var; aynı dönemde 6
  `SUSPENSION` event'i gelmesine rağmen. Transfer dönemi (Ocak) içinde yeniden bakılacak. Export maliyeti önemsiz,
  tablolar export'ta kalıyor.
- **`playerloans` bayat:** 1.426 satır, bitiş tarihleri 2026-10-06 – 2028-02-29 (oyun 2029'da). Başlangıç veritabanından
  kalma; güncel kiralıklar LE'nin kendi kodunda da bellekteki LoansManager'dan okunuyor. DB'den kiralık bilgisi
  çıkarılamıyor.
- **Genel ders:** FC 27 kariyerinde oyuncu tablosu (OVR, POT, sözleşme, maaş, kulüp bağlantısı) güncel; kiralık, ceza,
  transfer geçmişi, takvim ve bütçe gibi kariyer durumu bellekteki manager'larda. Bunlar ancak bellek ofsetleriyle
  (takvim/bütçe gibi) okunabilir.
- **Event log:** 34 oyun gününde 75 event. Event'ler hâlâ detaysız (oyuncu/takım yok).
