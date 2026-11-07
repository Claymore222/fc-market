# Veri sözlüğü

Bu doküman `config/field-map.json`'daki eşlemelerin anlamını ve dayandığı varsayımları anlatır.
Faz 0 (oyunda veri keşfi) sürüyor. İlk gerçek snapshot alındı: 17.10.2029 (kariyerin 4. sezonu), 23.427 oyuncu,
268 tablonun şeması (bkz. [FC 27 / Live Editor v27.1.3](#fc-27--live-editor-v2713)). Field-map'teki tüm tablo ve
alan adları gerçek veride var. Bilinen oyuncularla doğrulananlar aşağıda "doğrulandı" diye işaretli.

> **DOĞRULANACAK** işaretli her satır oyun gerektirir. Doğrulanınca işareti kaldır ve gerçek değeri yaz.

Backend açılışta ve her `/api/health` çağrısında field-map'i `raw_*` tablolarının kolonlarıyla ve
`schema_fields` tablosuyla karşılaştırır. Eksik alan uygulamayı çökertmez: ilgili kolon boş gelir ve
uyarı `/api/health` → `fieldMap.warnings` içinde görünür (UI'da sarı banner).

## Tablolar

| Kanonik bölüm | Ham tablo (`raw_<ad>`) | Kaynak | Durum |
|---|---|---|---|
| `player` | `players` | oyun DB | Doğrulandı: 152 kolon, field-map'teki hepsi var |
| `names` | `player_names` | exporter (`GetPlayerName`; kulüp `GetTeamIdFromPlayerId`, FC 27'de `teamplayerlinks`) | exporter formatı, kesin |
| `team` | `teams` | oyun DB | Doğrulandı (841 takım) |
| `leagueTeamLink` | `leagueteamlinks` | oyun DB | Doğrulandı |
| `league` | `leagues` | oyun DB | Doğrulandı: `leaguename` var, kademe ekiyle ("Turkey Süper Lig (1)") |
| `nation` | `nations` | oyun DB | Doğrulandı: `nationname` var (Türkçe) |
| `contract` | `players` | oyun DB | FC 27'de `career_playercontract` tablosu yok; sözleşme `players` içinde |
| `stats` | `player_stats` | exporter (`GetPlayersStats`) | FC 27 LE v27.1.3'te `GetPlayersStats` yok, tablo boş kalır. `teamplayerlinks`'teki lig istatistikleri güvenilmez (`leagueappearances` 25.167 satırın hepsinde 0, `leaguegoals` anlamsız), kullanılmıyor |

## Oyuncu alanları (`player`)

| Kanonik | Ham | Anlam | Durum |
|---|---|---|---|
| `id` | `playerid` | Oyuncu kimliği, snapshot'lar arasında sabit | kesin |
| `overall` | `overallrating` | OVR (45–97) | Doğrulandı |
| `potential` | `potential` | POT | Doğrulandı |
| `birthdate` | `birthdate` | `birthdateEpoch`'tan (1582-10-14) itibaren gün sayısı | Doğrulandı: Haaland, Bellingham, Arda Güler, Musiala, Kerem Aktürkoğlu, Kenan Yıldız doğum günleri birebir. (LE'nin `imports/core/date.lua`'sı bir gün sonrasını veriyor, kullanılmıyor) |
| `position1` / `position2` | `preferredposition1/2` | Pozisyon kodu (`positions` tablosu), `-1` = yok | Doğrulandı: yalnızca tablodaki 12 kod geçiyor; Haaland 25 = ST, Bellingham/Musiala 18 = CAM |
| `position3` … `position7` | `preferredposition3` … `preferredposition7` | Ek doğal mevkiler; ana mevkiyle birlikte sıralı/tekrarsız `positions`; `-1`/boş atlanır, bilinmeyen kod `P<kod>` | **DOĞRULANACAK**: 24.07.2030 gerçek kaydında Lim Eun Woo CB/RB/CM; Doku LW/LM/RW/RM. Arayüz ve saha haritasında gösterilir; mevki puanı hesabını değiştirmez |
| `bootType` / `bootDesign` | `shoetypecode` / `shoedesigncode` | Krampon modeli/tasarımı kodları | **DOĞRULANACAK**: ürün adları eşlenmedi; Kod #N olarak gösterilir. 0 korunur, eksik kolon Veri yok |
| `bootColor1` / `bootColor2` | `shoecolorcode1` / `shoecolorcode2` | Krampon renk kodları | **DOĞRULANACAK**: renk adı tahmin edilmez |
| `gloveType` | `gkglovetypecode` | Kaleci eldiveni kodu; saha oyuncularında da dolu olabilir | **DOĞRULANACAK**: Kod #N gösterilir; 0'ın eldiven yok anlamına geldiği varsayılmaz |
| `nationality` | `nationality` | `nations.nationid` | Doğrulandı |
| `foot` | `preferredfoot` | `feet` tablosu: 1 = Sağ, 2 = Sol | Doğrulandı (Haaland, Arda Güler sol) |
| `height` / `weight` | `height` / `weight` | cm / kg | Doğrulandı (Haaland 195/94) |
| `skillMoves` | `skillmoves` | Oyunda **0 tabanlı** (0–4 → 1–5 yıldız; Haaland 2 = 3★, Musiala 4 = 5★). `valueOffsets.skillMoves = 1` ile yıldıza çevrilir | Doğrulandı |
| `weakFoot` | `weakfootabilitytypecode` | Zayıf ayak yıldızı, 1–5 | Doğrulandı |
| `gender` | `gender` | 0 = erkek, 1 = kadın (`womenGenderCode`) | Doğrulandı (3.017 kadın oyuncu) |

Özellik alanları (`attributeGroups`) da ham adlarla tutulur. Grup skoru alanların ortalamasıdır.
`goalkeeperGroup` (Kaleci) yalnızca pozisyonu GK olan oyuncularda gösterilir. Türkçe etiketler
`attributeLabels`'ta durur.

## Pozisyon kodları (`positions`) — doğrulandı

| Kod | Etiket | Grup |
|---|---|---|
| 0 | GK | GK |
| 3 | RB | DEF |
| 5 | CB | DEF |
| 7 | LB | DEF |
| 10 | CDM | MID |
| 12 | RM | MID |
| 14 | CM | MID |
| 16 | LM | MID |
| 18 | CAM | MID |
| 23 | RW | ATT |
| 25 | ST | ATT |
| 27 | LW | ATT |

FIFA geleneğinde ara kodlar da var (2 RWB, 4 RCB, 6 LCB, 8 LWB, 9 RDM, 11 LDM, 13 RCM, 15 LCM,
17 RAM, 19 LAM, 20 RF, 21 CF, 22 LF, 24 RS, 26 LS). Tablo dışında kalan bir kod gelirse UI `P<kod>`
gösterir ve oyuncu hiçbir pozisyon grubuna girmez. Gerçek veride bu kodlar görülürse `positions`
ve `positionGroups`'a eklenmeli.

## Kulüp ve lig

- Kulüp, exporter'ın `player_names.club_teamid` alanından gelir. `GetTeamIdFromPlayerId` varsa o kullanılır.
  FC 27'de yok: exporter kulübü `teamplayerlinks`'ten alır, `leagues.isinternationalleague = 1` olan liglerin
  takımlarını (milli takımlar) atlar, kalan ilk takımı yazar. Yalnızca milli takımı olan oyuncunun kulübü boş kalır.
- Serbest oyuncular "NG - FA" (111592) ve "NG - FA Women" (131368) takımlarında, "Free Agents League" (382) liginde.
  Sözleşme yılları anlamsız (2028–2033). Field-map `freeAgents.teamIds`: kulüp adı yerine `freeAgents.label` ("Serbest")
  gösterilir, aktif sözleşme yılı ve `wage` boş sayılır; ham maaş ayrıca `recordedWage` ile **kayıttaki maaş** diye gösterilir.
  **DOĞRULANACAK**: serbest oyuncuda tutarın anlamı (aktif sözleşme, eski maaş veya talep olduğu iddia edilmez).
  Değer ve fırsat skorunda sözleşme "bitti" (0 yıl) kabul edilir; kayıtlı maaş değer hesabına/kadro maaş toplamına katılmaz,
  "sözleşmesi şu yıla kadar bitenler" filtresine dahil edilir.
  Scout ve Transfer maaş sütunu gösterilen tutarla (`wage ?? recordedWage`) sıralanır. Karşılaştırmada serbest oyuncu
  tutarı ayrı satırdadır; aktif maaş avantajı sayılmaz. Tutarlar € olarak tam gösterilir (2400 → 2.400 €, binliğe yuvarlanmaz).
  29.10.2026 salt-okunur kontrol: 24.07.2030 Fenerbahçe snapshot'ında Lim Eun Woo (#465020) kayıtlı maaş 2400,
  aktif maaş/yıl boş, mevkiler CB/RB/CM; krampon 87, tasarım 0, renkler 30/31, eldiven 133.
  Snapshot `save_84af764ba0d247f880ccc658a7e0c7a_2251277bb7cdfb32ca2ec8c3_20300724`: API'deki 20.407 oyuncunun
  (1.761 serbest) kayıtlı maaşları ve tüm mevkileri SQLite `mode=ro` ile kaynak satırlarına karşılaştırıldı: **0 fark, %100**.
  Testler: backend **145 geçti**, Playwright **22 geçti / 1 opt-in atlandı**; ayrıca gerçek kariyer testi **1 geçti**
  (Fenerbahçe → Gençlerbirliği → yeniden açılış → Fenerbahçe; Dal 2 seçimi ve yeniden açılış; 1370/390 px).
  Ekipman kodları ürün adı doğrulaması sayılmaz. Kanıtlar: `scratch/visual-parity/player-fields-check.json`,
  `player-recorded-wage.png`, `player-recorded-wage-mobile.png`. Üretim derlemesi geçti; mevcut >500 kB paket uyarısı sürüyor.
- Kadın oyuncular da DB'de: `players.gender` = 1 (3.017 oyuncu), ligleri `leagues.iswomencompetition` = 1.
  `appsettings.json` → `Market:IncludeWomen` = false iken piyasaya hiç yüklenmezler (ligleri de filtre seçeneklerinden düşer).
- Lig, `leagueteamlinks` üzerinden bulunur. Bir takım birden fazla ligde görünürse en küçük
  `leagueid` alınır. **DOĞRULANACAK**: "Rest of World" gibi sahte ligler nasıl ayrılır?
- **DOĞRULANACAK**: Kiralık oyuncunun `club_teamid`'si kiralandığı kulüp mü, sahibi mi?

## FC 27 / Live Editor v27.1.3

Oyunda `le_capabilities.lua`, `fc_diag.lua` ve `fc_probe.lua` ile görüldü (16 Ekim 2026, oyun sürümü 1.0.141.12554).

- **Live Editor klasörü ASCII bir yolda olmalı** (`C:\FC27LE`). `OneDrive\Masaüstü` altındayken Lua kütüphaneleri
  yüklenemiyor ("ü"), `LE` (v2 API) ve `ENUM_*` sabitleri hiç tanımlanmıyordu.
- Var: v1 DB fonksiyonları (`GetDBTablesNames`, `GetDBTableFields`, `GetDBTableRows`; 268 tablo), v2 `LE.db`,
  `GetSaveUID`, `GetPlayerName`, `GetTeamName`, `IsInCM`, `AddEventHandler`, `SendHTTPRequest`, v2 yardımcılarından
  `GetUserTeamID` ve `GetManagerObjByTypeId`.
- Yok: `GetCurrentDate`, `GetTeamIdFromPlayerId`, `GetPlayersStats`, bütçe fonksiyonları, `Sleep`, miniface yakalama.
- v1 alan nesnesinin anahtarları: `name`, `field_type`, `field_type_name`, `min`, `max`, `is_pkey`, `shortname`.
- `GetPlayerName` uzun isimleri bayt sınırında kesiyor; 23.427 isimden biri ("Tiberiu Căpușă") yarım UTF-8 karakterle
  bitiyor, importer onu "�" ile okuyor.

| Değer | Nereden | Durum |
|---|---|---|
| Oyun tarihi | `CalendarManager` (+0x34 gün, +0x38 ay, +0x3C yıl; int32). `career_calendar.currdate` hep 20080101, kullanılmaz | Doğrulandı (17.10.2029). Aynı tarih +0x40'ta da var; birkaç gün ilerletince hangisinin güncel kaldığı kontrol edilmeli |
| Diğer takvim tarihleri | +0x10 = 1.7.2029, +0x1C = 17.8.2029, +0x28 = 30.6.2030 | Sezon başı/sonu olabilir, kullanılmıyor |
| Kullanıcı takımı | v2 `GetUserTeamID` | Doğrulandı (326, Fenerbahçe SK) |
| Transfer bütçesi | `BudgetManager` +0x38 (int32) = 123.890.000 | **DOĞRULANACAK**: oyundaki transfer ekranıyla karşılaştır |
| Maaş bütçesi | bilinmiyor | Boş |

Ofsetler `fc_export.lua` → `CONFIG.CALENDAR_DATE_OFFSET` / `TRANSFER_BUDGET_OFFSET`. Oyun güncellemesinden sonra
`exporter/lua/fc_probe.lua` yeniden çalıştırılıp kontrol edilmeli.

## Haber akışı için ek tablolar (exporter 0.3.0, henüz field-map'te yok)

| Tablo | Alanlar | Not |
|---|---|---|
| `transfers` | `playerid`, `sellingteamid`, `buyingteamid`, `transferamount`, `transferdate` | FC 27'de **boş**: yalnızca `-1` dolu yer tutucu satır (Ekim–Kasım 2029). Transfer döneminde yeniden bakılacak |
| `playerloans` | `playerid`, `teamidloanedfrom`, `loandateend`, `isloantobuy`, `futureoptiontobuy` | **Bayat**: 1.426 satır, bitişler 2026–2028 (oyun 2029). Tarihler gün sayısı (1582-10-14 tabanı tutarlı). Güncel kiralıklar bellekte (LoansManager); kullanılmıyor |
| `playersuspensions` | `playerid`, `teamid`, `games`, `enddate` | FC 27'de **boş** (yer tutucu satır), cezalar bellekte |

## Kulüp ekranları (Home / Squad) — 28.10.2026, **DOĞRULANACAK**

Kaynak: `config/field-map.json` → `team`, `leagueTeamLink`, `squadLink`, `loan`, `slotPositions`, `squadSlots`.
Değerler FC 27 export'unda (Fenerbahçe, 2.11.2029) okundu; oyun ekranıyla henüz karşılaştırılmadı.

| Alan | Ham alan | Gözlem / varsayım |
|---|---|---|
| İlk 11 / yedek / rezerv | `teamplayerlinks.position` | 0–27 diziliş yeri kodu = ilk 11 (11 farklı kod, 4-2-3-1 oluşturuyor), 28 = yedek (7), 29 = rezerv. **Oyuncunun hangi koda bağlı olduğu güvenilmez** (sol kanat RCB kodunda): yerleri backend pozisyon genellerine göre yeniden atar |
| Forma no, form, sakatlık | `jerseynumber`, `form` (1–5), `injury` (0 = sağlam) | Form ölçeği ve sakatlık değeri doğrulanacak |
| Kaptan, penaltı, serbest vuruş, korner, uzun vuruş | `teams.captainid`, `penaltytakerid`, `freekicktakerid`, `left/rightfreekicktakerid`, `left/rightcornerkicktakerid`, `longkicktakerid` | Oyundaki taktik ekranıyla karşılaştırılmalı |
| Takım reytingleri | `teams.overallrating`, `attackrating`, `midfieldrating`, `defenserating` | 79 / 81 / 79 / 77 |
| Renkler | `teams.teamcolor1r/g/b`, `teamcolor2r/g/b` | Arma yerine kalkan rengi |
| Kupa sayıları | `teams.leaguetitles`, `domesticcups`, `uefa_cl_wins`, `uefa_el_wins`, `uefa_uecl_wins` | Kulübün oyundaki geçmişi; kariyerde kazanılanlar ayrıca izlenmiyor |
| Lig sırası | `leagueteamlinks.currenttableposition` (1 tabanlı), `previousyeartableposition` | **Güncel sıra bayat**: 2.11.2029 ve 17.07.2030 snapshot'larında 841 takımın 811'inde sıra/maç/puan aynı. Backend önceki sezonun snapshot'ıyla karşılaştırıp (%90 aynıysa) sıra ve puanı gizler. `previousyeartableposition` sezon sonunda güncelleniyor (Fenerbahçe 1 = geçen sezon şampiyon); dünya kartı bu durumda geçen sezon şampiyonlarını gösterir |
| Puan, maç, G/B/M, goller | `points`, `nummatchesplayed`, `home/awaywins/draws/losses`, `home/awaygf/ga` | **Bayat**: 6 maç oynanmış ama tüm takımlarda puan ve galibiyet 0. Arayüz yalnız sırayı gösterir; sayılar tutarlıysa (oynanan = G+B+M, puan = 3G+B) tablo açılır |
| Kiralıklar | `playerloans.teamidloanedfrom`, `loandateend` | Bayat satırlar (bitiş oyun tarihinden önce) yok sayılır; FC 27 kaydında hepsi bayat |
| Serbest kalma, katılış, uluslararası ün | `players.releaseclause`, `playerjointeamdate` (gün), `internationalrep` (1–5) | Oyuncu detayında |
| Ülke kodu | `nations.isocountrycode` | Ülke adıyla bitişik geliyor ("TRTürkiye"); ilk iki harf ISO kodu |
| Kart değerleri (HIZ…FİZ) | `cardStats` ağırlıkları | Oyun tutmuyor; EA'nın yaklaşık formülleriyle tahmini |
| Taç atanlar, korner destek | `teams.throwerleft/right`, `cksupport1..9` | CMTracker ile eşleşti (Fenerbahçe, 17.07.2030); cksupport tekrar edebilir, tekilleştirilir |
| Oyun kurma | `teams.buildupplay` → `buildUpPlayLabels` | 2 = Dengeli doğrulandı; diğer kodlar **DOĞRULANACAK** ("Kod N" gösterilir) |
| Popülerlik | `teams.popularity` | Ham değer gösterilir |
| Lig değişimi | `leagueteamlinks.prevleagueid`, `leagues.level/countryid` | Kullanıcı ülkesinde önceki lig ≠ şimdiki lig → yükselen/düşen; aynı ligde birden fazla 1. sıra varsa o lig lider listesine alınmaz |
| Kariyerde kazanılan kupalar | `teams` kupa sayıları, dalın ilk snapshot'ına göre artış | Kupa adı yok; sayı farkı |
| Roller | `players.role1..9` → `roles` | Kod % 100 = rol + mevki, kod ≥ 100 = "++". CMTracker'da 30 oyuncuyla eşlendi; 11/48 (Defender/Wide Back) ayrımı zayıf, listede olmayan kodlar "Rol #N" |
| Oyun stilleri | `players.trait1/2` (stil), `icontrait1/2` (stil+) → `playStyles` | Bit 0–31 trait1, 32+ trait2. 0, 2–17, 19–29 ve kaleci bitleri 32, 35, 36, 37 doğrulandı; 1 (Aşırtma) ve 18 (Kayarak müdahale) sıradan çıkarım, diğer kaleci bitleri **DOĞRULANACAK** |
| Vücut tipi, duygu durumu, büyüme profili, emeklilik | `players.bodytypecode`, `emotion`, `growthprofile`, `isretiring` → `playerTraits` | CMTracker ile 30 oyuncuda birebir. Vücut tipi 3/6/7/9 ve büyüme profili 2/4 **DOĞRULANACAK** |
| Hızlanma tipi | Alan yok; `accelerationType` kuralı (boy, çeviklik, güç, hızlanma, sprint) | Tahmin: 26 oyuncunun 25'i CMTracker ile aynı (veriler 8 ay arayla). **DOĞRULANACAK** |

## Exporter 0.4.0 tabloları — ilk export 17.07.2030 (Fenerbahçe, 28.10.2026)

| field-map | Tablo | Gözlem |
|---|---|---|
| `fixture` | `fixtures` | **Bayat**: 332 maçın hepsi Ekim 2026 (oyunun başlangıç verisi), kariyerde güncellenmiyor. Tarih 1582-10-14'ten gün; `fixturetime` gece yarısından saniye (72000 = 20:00) doğrulandı. Bu sezonun başından eski maçlar gösterilmez → pratikte fikstür yok (hazırlık maçları da tabloda yok) |
| `matchRating` | `career_playermatchratinghistory` | Sezon öncesinde boş (0 satır); ölçek ve tarih biçimi maçlar oynanınca **DOĞRULANACAK** |
| `youthPlayer` | `career_youthplayers` | Doğrulandı: 9 akademi oyuncusu, hepsi `players`'ta (15–17 yaş). `playertier` 0–3 |
| `scout` | `career_scouts` | Doğrulandı: 3 gözlemci, deneyim/bilgi 4 |
| `stats` | `prevcompetitionstats` | **Kariyer verisi değil**: oyunun başlangıcındaki gerçek hayat sezonu (2025/26; Arribas → Almería, Kroupi → Bournemouth), güncellenmiyor. Oyuncu detayında "kariyer öncesi" diye ayrı gösterilir |
| — | `career_managerawards` | 4 satır (typeid 0, sezon 1–3, `receiveddate` 1582-10-14'ten gün); tür adları bilinmiyor, kullanılmıyor |
| — | `career_calendar` | Tek satır, tarihler 20080101 (şablon); kullanılmaz |
| — | `career_scoutmission`, `career_clinchedobjectives` | Boş |
| — | `playerformdiff`, `teamformdiff` | 50'şer satır; kullanılmıyor |

## Sözleşme (`contract`)

- FC 27'de ayrı sözleşme tablosu yok: `players.wage` ve `players.contractvaliduntil`.
- `wage`: haftalık maaş varsayıldı (€; Haaland 615.624). **DOĞRULANACAK**: oyundaki sözleşme ekranıyla karşılaştır.
- `endYear` = `contractvaliduntil`: sözleşmenin bittiği yıl (2028–2037). Musiala 2030 → 2029/30 sezonu sonunda bitiyor
  (oyunla karşılaştırılmalı).
- Bir oyuncu için birden fazla satır varsa ilki alınır.
- Gerçek oyunda sözleşme bilgisi `players.contractvaliduntil` gibi bir alanda da olabilir.
  O durumda `contract.table` = `players` yapılabilir.

## İstatistikler (`stats`)

- Satırlar yarışma (`competitionId`) bazında. Detay ekranında toplanarak gösterilir.
- `ratingSum` (`avg`): örnek veride maç başı puanların **toplamı**. Ortalama = `ratingSum / appearances`.
  **DOĞRULANACAK**: `GetPlayersStats`'ın `avg` alanı toplam mı, ortalama mı?
- **Bellek denemesi (01.11.2026, LE 27.1.6, 26.07.2026 oyun günü):** LE'de istatistik fonksiyonu ve güncel sezon tablosu yok.
  `StatisticsView` yöneticisindeki (id 109) bir dizide 260 baytlık oyuncu×yarışma×takım kaydı bulundu; dosyada 12 bayt başlık var.
  Uzaklıklar: `+0x00` oyuncu, `+0x04` maç, `+0x0C` dakika, `+0x10` gol, `+0x20` puan toplamı (float), `+0x24` sarı,
  `+0x30` yenilen, `+0x34` gol yememe, `+0x38` ortalama (float), `+0x88`'den itibaren 0x24 aralıkla son maçlar
  (tarih, dakika, puan `+0x18` float), sonda yarışma ve takım. Kayıttaki 25.07 değerleriyle tutuyor, bir maç daha yeni.
  Asist, kırmızı ve maçın adamı **DOĞRULANMADI**. Kapsam dar: 8 takım, 116 kayıt (kayıtta 1.856). Yönetici düzeni oturumlar arasında
  değiştiği için dizi her seferinde başlıktan aranır (`exporter/lua/fc_stats_dump.lua`). Otomatik export'a eklenmedi; son maçlar artık kayıttan okunuyor.

## Regen izi (`/api/regens`, Scout → Regenler)

EA kuralı yayımlamadı; oyunda da "şunun regeni" alanı yok. Topluluk rehberleri ülke, mevki, doğum günü ve potansiyelin taşındığını söylüyor.
Aday kuralı: kaybolan oyuncu 33+ yaşında ya da `isRetiring`; yeni oyuncu aynı ülke, gün-ay ve ana mevkide; POT farkı ≤1 "Güçlü", ≤3 "Olası".
2029/30 kariyerinde 1.094 ayrılandan 185'i aday buldu, en üstteki adayların POT'u birebir aynı (Ederson 90 → Wesley Machado 90).
Boy ve ayak şanstan farklı değil. Ronaldo ve Modrić adaysız kaldı; her emekliliğin izi çıkmıyor. Eşleşme olasılıktır, kesin değildir.

## Türetilmiş metrikler (backend `Domain/Metrics.cs`)

| Metrik | Formül | Not |
|---|---|---|
| Yaş | `snapshots.game_date − (birthdateEpoch + birthdate gün)`, tam yıl | Gerçek tarih değil, **oyun tarihi** |
| Sezon bitiş yılı | Oyun ayı ≥ `Season.StartMonth` (7) ise yıl+1, değilse yıl | Örn. 2026-08 → 2027 |
| Sözleşmede kalan yıl | `endYear − sezon bitiş yılı`, en az 0 | PLAN'daki "endYear − oyun yılı" yerine sezon bazlı; Ağustos'ta biten yıl = bu sezon sonu sayılır. **DOĞRULANACAK** |
| Gelişim (ok) | Son snapshot OVR − önceki snapshot OVR | |
| Gelişim hızı | (son OVR − pencere başı OVR) / ay; pencere = son `Market.GrowthWindowSnapshots` snapshot | Tek snapshot varsa boş |
| Tahmini değer | `AgeCurve`: ln değer ≈ OVR eğimi (0.105) + yaş eğrisi (24'e kadar +%19/yıl genç primi, sonrası −%18/yıl) + 0.541·ln(haftalık maaş / 10.000); katsayılar `appsettings.json` → `Valuation` | Oyunun kendi değeri DB'de yok. CMTracker değerlerine 339 oyuncuyla uyduruldu (R² 0.98); yine de tahmin |
| Fırsat skoru | Ağırlıklı ortalama × 100; ağırlıklar `appsettings.json` → `Opportunity` | Bileşenler aşağıda |

Fırsat skoru bileşenleri (her biri 0–1):
- **Büyüme alanı**: `(POT − OVR) / GrowthRoomMax` (20)
- **Gelişim hızı**: `aylık ΔOVR / GrowthRateMax` (1 OVR/ay = tam puan)
- **Sözleşme**: kalan yıl 0 → 1.0, 1 → 0.6, 2 → 0.25, 3+ → 0 (ucuzluk)
- **Yaş**: `AgeFull` (21) ve altı → 1, `AgeZero` (30) ve üstü → 0, arası doğrusal

Bilinmeyen bileşen (ör. tek snapshot varken gelişim hızı) skora katılmaz, ağırlıklar yeniden normalize edilir.

## Pozisyon genelleri (`config/position-ratings.json`) — DOĞRULANACAK

FC her pozisyondaki geneli DB'de tutmaz, özelliklerden hesaplar. Detay ekranındaki saha haritası aynı yaklaşımı
kullanır:
- Her pozisyon için özellik ağırlıkları `config/position-ratings.json`'da. Katsayılar FIFA/FC topluluğunda bilinen
  formüllerden yaklaşık alındı ve normalize edilir.
- Eksik özellik varsa kalan ağırlıklarla hesaplanır; bilinen ağırlık `minKnownWeight`'in (%50) altındaysa boş kalır.
- `calibrateToOverall`: ana pozisyonun hesaplanan geneli DB'deki OVR'a eşitlenir, diğer pozisyonlar aynı farkla
  kayar. Böylece uluslararası itibar bonusu gibi formül dışı farklar haritayı tablodaki OVR'dan koparmaz.
- **DOĞRULANACAK:** Oyundaki "pozisyon genelleri" ekranından 3–4 oyuncunun değerlerini al, haritayla karşılaştır.
  Fark büyükse katsayıları güncelle (backend dosyayı yeniden başlatmadan yeniden okur).
- Örnek veride özellikler pozisyondan bağımsız rastgele üretildiği için harita neredeyse düz görünür. Bu beklenen bir durum.

## Oyuncu yüzleri — DOĞRULANACAK

- Backend `faces/<playerid>.png|.jpg|.webp` dosyalarını `GET /api/players/{id}/face` ile sunar
  (klasör: `Paths:FacesDir` ya da `FC_FACES_DIR`). Dosya yoksa arayüz baş harfleri gösterir.
- İnternetten görsel çekilmez (PLAN §7: dışarıya veri gönderilmez).
- **DOĞRULANACAK:** Live Editor'ün oyuncu yüz dokusunu/görselini dışa aktaran bir fonksiyonu var mı?
  Varsa `fc_export.lua`'ya eklenmesi export formatını değiştirir; önce karar verilmeli (CLAUDE.md).

## Performans notu

`fc_career.db` salt-okunur açıldığı için backend index oluşturmaz; index'leri importer kurar:
- `playerid` ya da `teamid` kolonu olan her `raw_*` tablosunda `(snapshot_id, playerid)` ve `(snapshot_id, teamid)`.
  Eski veritabanlarına importer'ın ilk açılışında eklenir. 20k oyuncu × 12 snapshot'ta `v_player_latest` 17 sn'den
  0,6 sn'ye, `/api/players/{id}/history` soğukken ~1,4 sn'den ~4 ms'ye iniyor.
- `player_current`: `v_player_latest`'in `(snapshot_id, playerid)` index'li düz kopyası (her save'in son snapshot'ı).
  Yeni snapshot gelince `player_current_new`'e yazılır, tek transaction'da eskisiyle yer değiştirir (~50 ms).

Backend `player_current`'ı kullanmıyor: piyasa son snapshot'ı zaten belleğe alıyor ve değer/fırsat/gelişim gibi
türetilmiş alanlar C#'ta, ayarlanabilir katsayılarla hesaplanıyor; SQL'de sıralanamazlar. Yüklemeyi
`player_current`'tan yapmak 20k oyuncuda ~2 ms kazandırıyor ve isim/kulüp için field-map yerine importer'ın sabit
join'ine bağlanmayı gerektiriyor. Sayfa sorgusu süresini her istekte yeniden yapılan sıralama belirliyordu; artık her
sıralama snapshot başına bir kez hesaplanıp önbellekte tutuluyor.

## Export'ta olmayan CMTracker verileri — 28.10.2026

Oyunun tablo şemasında (schema.json, 268 tablo) moral, yönetim güveni/hedefleri, menajer karnesi ve gelir-gider
kalemleri **yok**; bunlar kayıt dosyasında/bellekte, Live Editor tablo API'siyle okunamaz. Tabloda olup henüz export
edilmeyenler: `career_playerawards` (sezon ödülleri), `career_teamofweek` (haftanın takımı),
`career_playergrowthuserseason`. Eklenmeleri exporter değişikliği, kullanıcı onayı gerekir.
# Kariyer kaydı okuyucusu — 28.10.2026

- **DOĞRULANACAK (başka oyun sürümleri):** FC 27 FBCHUNKS içinde ilk Zstandard
  frame (bu üç dosyada 2790) T3DB'leri içerir. Açılmış payload'da DB başlangıçları
  212023 ve 1001703. Ofsetler keşif kanıtıdır, okuyucuda sabit kullanılmaz.
- **DOĞRULANACAK (başka sürümler):** tablo başlığı 36 bayt; kayıt boyu +4 u32,
  kapasite +16 u16, yazılmış kayıt +18 u16, iptal sayısı +20 u16, alan sayısı
  +24 u8. Alan tanımı 16 bayt: type u32, bitOffset u32, shortname[4], width u32.
  Kaydın son baytındaki 0x80 iptal işaretidir. Integer değerine XML rangelow eklenir.
- `config/saveimport` FC 26 meta + FC 27 farklarını tutar. Referans
  `84af764b_20300717_174946` ile 4.080.614 oyuncu/takım/bağlantı alanı %100 aynı.
- **DOĞRULANACAK:** LE UID, `agents` tablosunda `firstname=Live`,
  `surname=Editor`, `agentid=499999` satırının `commonname` alanıdır. Üç mevcut
  yuvada çözüldü, iki export UID'siyle karşılaştırıldı; bu LE'nin yazdığı işarettir,
  oyunun yerel kariyer kimliği olarak varsayılmamalıdır.
- **DOĞRULANACAK:** ilk BNRY başlığında +13 u32 kullanıcı takım ID'si;
  +33/+34/+35 baytları gün/ay/(yıl−2000). Üç yuvada 326/326/1935 ve
  17.10.2029/17.07.2030/09.08.2026 okunuyor. Art arda üç gün S4 kontrolü bekliyor.


## Kariyer kaydındaki kariyer blokları (S4) — 28.10.2026

Kaynak: `tools/saveimport/career.py` → `raw_career_competitions`, `raw_career_fixtures`, `raw_career_standings`,
`raw_career_playerstats` (field-map `careerCompetition`, `careerFixture`, `careerStanding`, `careerStat`). FC 26 düzenleri
(eafc-db-kit docs/career-data.md, MIT) FC 27'de BNRY "cds" içinde korunmuş; bölüm etiketleri yok, kayıt desenleriyle bulunur.

| Blok | Kayıt | FC 27 farkı / doğrulama |
|---|---|---|
| Yarışma ağacı | 49 bayt: `FF 01`, id, id, seviye, üst, 7 bayt kod, 33 bayt ad anahtarı | Kod `C<leagueid>` lig adıyla eşleşir (1512 = C68 = Süper Lig). Lig dışı kodlar `competitionLabels`; C223/C268 **DOĞRULANACAK** |
| Fikstür ve sonuçlar | 22 bayt (FC 26 ile aynı): sıra, yarışma, tur, tarih yyyymmdd, saat HHmm, ev/deplasman slotu, skor, penaltı, durum | 17.07.2030: Fenerbahçe fikstürü CMTracker'la aynı (19.07 16:00 Bournemouth, 23.07 16:00 Hoffenheim). Üç kayıtta lig slotlarının tamamında fikstür sonuçları = puan tablosu (256/256, 256/256, 220/220) |
| Canlı puan tablosu | 23 bayt (FC 26 ile aynı); sıra kayıtta yok (puan, averaj, atılan gol) | Üç kayıtta puan = 3G+B tüm lig satırlarında. 17.10.2029 Fenerbahçe 7 maç 17 puan 5-2-0 13:3 |
| Oyuncu sezon istatistiği | **64 bayt** (FC 26: 73). Bitler: takım 16(18)+1, oyuncu 34(19)+1, yarışma 53(11), dakika 65(15), puan toplamı ×10 80(12), gol 104(9), sarı 113(6), kırmızı 120(5), maç 125(7), asist 139(8), yenilen 162(8), gol yememe 170(6) | Blok puan tablosu bölümünün 48 bayt ardında; boş slotun anahtarı sıfır. Takım×lig golü = oyuncu golleri 20/30, 220/222, 22/22; en çok oynayan = takım maçı 30/30, 221/222, 22/22. 17.07.2030 CMTracker sezon liderleri birebir (Costa 7 maç / 7.4, Avom Ebong 1 asist). Sarı/kırmızı/gol yememe **DOĞRULANACAK**; maçın adamı ve kurtarış çözülmedi |
| Oyuncunun son maçları | Aynı 64 baytın kuyruğunda 68 bitlik beş dönen slot (179, 247, 315, 383, 451): tarih 0(20) +20000000, dakika 20(7), puan ×10 27(7) | `career_playerrecentmatches`. 01.11.2026 belleğiyle 129/129 satır tutuyor. Kariyer öncesi tarihli satırlar da var; simüle maçlar her zaman yazılmıyor, süre almadığı maç ve 0/127 puanlı slot atlanır. Mevki alanı çözülmedi |

**CMTracker ile üç gün doğrulaması:** CMTracker'da yalnız 17.07.2030 kaydı var; 17.10.2029 ve 09.08.2026 iç tutarlılıkla
doğrulandı. Üç ayrı oyun gününde CMTracker karşılaştırması için oyunda ilerleyip her günün kaydını CMTracker'a yüklemek gerekir.

**29.10.2026 güncellemesi:** moral/bütçe ve son hareketlerin ardından sezon arşivi, yönetim güveni, lig hedefi ve finans
kategori toplamları da çözüldü; düzen ve sınırlar aşağıda. **Çözülmeyen:** kupa hedefleri/asgari başarı koşulları,
menajer maaşı ve kazançları, tüm kariyerin en farklı galibiyeti. Tek başına sayı eşleşmesi üretim alanı sayılmaz.
Colchester gibi export'u olmayan kariyerlerde oyuncu adları yok (kayıttaki DB'de isim tablosu yok).

## Genişletilmiş Scout ve kariyer arşivi — 29.10.2026

Scout: `wageMin/Max` gösterilen haftalık € tutarını (`wage ?? recordedWage`) süzer; serbest tutarın anlamı önceki nottadır.
`freeAgent` true/false, `contractYearsMin/Max` sezon sonuna kalan yıl (serbest 0), `weakFootMin/skillMovesMin` 1–5 yıldız.
`role` taban rol kodlarının OR listesi; `roleLevelMin=2` seçilen rolün kendisinde ++ ister.
`playStyle` 0–63 bit OR listesi (+ dahil), `playStylePlus` yalnız icontrait; farklı filtreler AND uygulanır.
İki işaretli 32-bit alan uint olarak birleştirilir. Eksik değer sınır filtresine eşleşmez. `includeSecondary=true`
mevki ve grup aramasını tüm doğal mevkilere genişletir. Negatif/ters aralık, yıldız/rol/stil sınırı ihlali 400 verir.

| Yeni bölüm / alanlar | Kaynak ve düzen | Anlam / durum |
|---|---|---|
| `careerSeasonHistory` → `career_seasonhistory` | BNRY: marker1/u32 adet, ardışık sezon satırları; 49 bayt başlık + iki marker1/u32-uzunluk/UTF8 ad | **DOĞRULANACAK**; tek aday, bilinen takım, ardışık sezon, O=G+B+M, güven 0–100 ve metin/buffer sınırları zorunlu; kesik/belirsiz blok boş |
| `teamId`, `seasonIndex`, `leagueId`, `positionCode` | Satır +1 u32 takım; +5 u8 sezon; +7 u16 lig; +10 u8 henüz çözülemeyen kod (255 boş) | **DOĞRULANACAK**; +10 final lig sırası olarak **kullanılmaz**: 2028/29 kod 2, CMTracker final sıra 1. Sezon yılı snapshot'ın sezon sonu − son indeks + indeks. Son indeks güncel; önceki satırlar tamamlanan sezon |
| `played`, `won`, `drawn`, `lost`, `goalsFor`, `goalsAgainst`, `points` | +14/+15/+16/+23 u8; +17/+19/+21 u16 | **DOĞRULANACAK**; tüm yarışmaların kayıtlı sezon karnesi. Puan yeniden hesaplanmaz: 2028/29 kayıtta 136, 3G+B=139; CMTracker da 136 gösterir |
| `jobSecurity` | +45 u32 | **DOĞRULANACAK**; 17.07.2030 referansı 74. Gençlerbirliği 15/16/24 Ağustos'ta 80/90/91; güvenli/tehlikeli eşik veya sezon başı farkı türetilmez |
| `objective`, `objectiveStatus` | +11/+6 u8; etiketler config `careerObjectiveLabels` / `careerObjectiveStatusLabels` | **DOĞRULANACAK**; hedef 7=Ligi kazan; durum 0=Sürüyor, 1=Karşılanmadı, 2=Karşılandı, Fenerbahçe'nin 5 sezonuyla eşleşti. Kupa/asgari hedeflere genellenmez |
| `biggestBuy`, `biggestSale` | +49'dan sonraki iki UTF8 metin | **DOĞRULANACAK**; sezonun kayıttaki transfer adları (Kroupi/Espí, Antony/Greenwood vb.). Ücret ve ID henüz yorumlanmadı |
| `careerFinanceCategory` → `career_financecategories`: `kind`, `income`, `expense` | `mnft` +11'den 23 adet `<u32 gelir,u32 gider>`; bütçe bloğu ve sınırlar doğrulanır | **DOĞRULANACAK**; sezon toplamları; 0 gerçek sıfır. Son hareketlerin sınırlı listesinden toplanmaz. Adı bilinmeyen tür kodla gösterilir |

17.07.2030 arşivi: 53/42/7/4 (150:46), 54/29/13/12 (92:52), 56/44/7/5 (133:39), 52/33/12/7 (94:50),
güncel sezon 0 maç. Toplam **215/148/39/28, 469:187**; CMTracker ile aynı. 24.07.2030'da güncel sezon 2/2/0/0,
toplam **217/150/39/28, 473:187**. Yeni toplamın üstüne güncel fikstür ayrıca eklenmez.
Finans 17.07.2030: **43.432.480 € / 48.687.237 €**, ×1,14 = CMTracker'ın yaklaşık **49,5 M$ / 55,5 M$**.
24.07.2030: **47.661.655 € / 49.806.356 €**. 10 kopyada sezon bloğu ve 23 finans satırı tek aday olarak okundu.

Backend yalnız seçili dalın soy ağacından arşiv seçer; her arşiv tek dosyanın tüm sezonlarını içerir. Arşiv yoksa
`observedSeasons` her sezondan tek gerçek snapshot ve tarihli kısmi gözlem sunar; başka dal/export fallback'i kullanılmaz.
Importer `save_block_versions=2` ile bilinen hash'in kariyer bloklarını bir kez yeniler; oyuncu tabloları, dal kimliği,
oyun/gözlem tarihi korunur, revision artar. Aynı günün eski kaynağı yeni kaynağı ezemez.
Asıl `C:\FCExport\fc_career.db` bu çalışmada değiştirilmedi: önizleme, SQLite read-only backup'ıyla üretilen
`scratch/career-research/preview.db` üzerinde. Masaüstü importer'ı yeniden başladığında mevcut oyun kayıtlarını kopyalayarak yeni blok sürümünü işler.
Doğrulama ve çalıştırma: [scout-career-data-2026-10-29.md](scout-career-data-2026-10-29.md).

## Kondisyon, sakatlık ve ceza adayı — 29.10.2026

Kaynak: Fenerbahçe 17.07.2030 kaydı (`scratch/saveimport/CmMgrC20261024175128313`) ve aynı gün CMTracker Sakatlık odası.

- **`career_playerfitness`** (`careerFitness`, tools/saveimport `player_fitness`): 20 baytlık kayıt
  `[01][playerid][ff ff ff ff][kondisyon u8][şiddet u8][tür u8][bölge u8][beklenen dönüş u32 yyyymmdd][aşama u8][gün u8][u8]`.
  Sakat değilse tarih 20080101. Blokta yalnız kondisyonu tam olmayan ya da sakat oyuncular var; **listede olmayan oyuncu 100**.
  Doğrulama: 10 oyuncunun kondisyonu birebir (Kroupi 0, Read 0, Costa 28, Avom 49, Baum 66, Borza 69, Zechiël 69, Ayari 77,
  Ngoy 78, Mbangula 85); bu kuralla kadro ortalaması 80 = CMTracker. Kroupi: şiddet 3 = Ağır, aşama 3 = Fizyoterapi,
  dönüş 08.09.2030, tam kondisyona 20 gün. Sakat sayılma: dönüş tarihi oyun tarihinden sonra.
  **DOĞRULANACAK:** şiddet 1–2, aşama 1–2 ve 4–6 (24.07'de Kroupi aşama 4), tür/bölge kodları.
- **Ceza/kart adayı (arayüzde yok):** 16 baytlık kayıtlar `[playerid][takım][sayı][00 01 00 00]`. 17.07.2030'da Doku/Hendriks/Ngoy
  `[326][2]` (CMTracker: 2 kıtasal sarı), Adeyemi `[1337][1]` (CMTracker: ceza 1; 1337 büyük ihtimalle Almanya milli takımı).
  Yarışma (iç/kıtasal) ayrımı görünmediği için anlamı belirsiz; bağlanmadı.

## Sezon arşivinden kupalar ve bonservisler — 29.10.2026

`career_seasonhistory` başlığına (49 bayt, satır başından) yeni alanlar (`careerSeasonHistory`):
`+25` en pahalı alım bonservisi (u32, EUR), `+29` en pahalı satış bonservisi, `+33` yerel kupa, `+37` kıtasal kupa, `+41` lig şampiyonluğu.

- **Lig şampiyonluğu doğrulandı:** Fenerbahçe 2026/27–2029/30 için 1/0/1/1 = CMTracker final sıraları 1/2/1/1.
  Kupa müzesi artık bu kulübün arşiv satırlarının toplamı (`CareerSpan.TrophiesSource = "archive"`); arşiv yoksa
  eski kulüp sayacı artışı ("counters") kullanılır ve boş liste "kupa yok" diye gösterilmez (sayaçlar kariyerde artmıyor).
- **Bonservis:** Kroupi 90 M€ = transfer kaydı; değer 0 ise gösterilmez.
- **DOĞRULANACAK:** yerel/kıtasal kupa. 24.07.2030 kaydında 2027/28 yerel kupa 1 (lig 2. bitti, makul) ama oyun ekranıyla bakılmadı.
- Mevcut kayıt snapshot'ları kendi kayıt yedeklerinden yeniden dolduruldu (önce DB yedeği); `BLOCK_VERSION = 4` watcher'ın
  bilinen kayıtları bir kez yeniden çözmesini sağlar.

## Finans kategorileri Home'da — 29.10.2026

`career_financecategories` mevcut kayıt snapshot'larına yedeklerinden dolduruldu (önce DB yedeği). 17.07.2030 toplamları
43.432.480 € / 48.687.237 € = CMTracker ×1,14 ile aynı; kategori toplamı doğrulandı, tek tek kategori adları değil.
- **Tür 0 = "Oyuncu satışı"** (`transactionKinds`): 2030/31'de 32 M€ = Jörgensen satışı, sezon arşivindeki en pahalı satış bonservisiyle birebir.
- Tür 3 (gelir 3,09 M€ ve gider 2,12 M€ birlikte) ve tür 22'nin sezon gideri (44,3 M€; son hareketlerde "Diğer") **DOĞRULANACAK**.
- Home finans kartı: transfer ve sezonluk maaş bütçesi çubukları, sezon gelir/gider/net ve en büyük 3 gelir/gider kategorisi.
  Son hareket günlüğü yoksa da ayrıntı penceresi açılır; hareketler sezon toplamı yerine kullanılmaz.

## Menajer ve yönetim — 29.10.2026

- **İş güvencesi:** değer güncel sezon satırının `jobsecurity` alanı; değişim, bu kulüpteki son tamamlanan sezonun değerine göre
  (24.07.2030: 2029/30 sonu 74 → ±0). Durum adı (Güvende ≥70, Dengeli ≥45, Baskı altında ≥25, Kritik) **uygulamanın yorumu**;
  oyun eşik ya da etiket yazmıyor.
- **Karne:** kariyer toplamına lig şampiyonluğu sayısı ve tüm sezonların en pahalı alım/satışı (sezon arşivi `+25/+29`) eklendi.
  Alım bonservisi Kroupi 90 M€ ile doğrulandı; satış bonservisi (ör. 2029/30 Espí 180 M€) **DOĞRULANACAK**.
- Sezon tablosu tamamlanan sezonları "Tamamlandı", güncel sezonu "Kayıt tarihi itibarıyla" diye ayırır; final sıra alanı
  (+10) doğrulanmadığı için gösterilmez. Kupa sütunu yalnız arşiv sayaçlarından, hedef başarısından türetilmez.
- **Çözülmeyen:** kupa/Avrupa hedefleri ve asgari koşullar, menajer maaşı/kazancı, zorluk, devre süresi.

## Altyapı, gözlem ve ödül yarışı — 29.10.2026

- **Akademi:** `youthPlayer` alanları Home'da: akademide ay (`monthsinsquad`), POT ± (`potentialvariance`), kademe (`playertier`);
  belirsizlik ve kademe anlamı **DOĞRULANACAK**. 24.07.2030 Fenerbahçe kaydında `career_youthplayers` 9 satır ve 9'u da
  oyuncu tablosuyla eşleşiyor; CMTracker'daki 10. genç bu tabloda yok (terfi etmiş ya da rapordaki oyuncu olabilir), tahmin edilmez.
- **Gözlemciler:** `career_scouts` satırları altyapı gözlemcileri (`state` hep 0); `career_scoutmission` boş. Ana takım/küresel
  transfer ağı gözlemcileri ve görev/dönüş tarihleri kayıtta okunamıyor; arayüzde bu açıkça yazıyor.
- **Ödül yarışı:** kulüp yarışı (lig tablosunun ilk üçü; maç yoksa ya da tablo güncel değilse `previousyeartableposition` ile
  geçen sezonun ilk üçü) ve oyuncu ödülleri (kayıttaki kazananlar) ayrı bölümler. 24.07.2030: 1. Fenerbahçe = sezon arşivindeki lig şampiyonluğu.

## CMTracker karşılaştırması: Fenerbahçe 24.07.2030 — 29.10.2026

Aynı kayıt (`CmMgrC20261029014018748`) CMTracker'a yüklendi, Home ve Youth sekmeleri alan alan karşılaştırıldı.

**Birebir:** kariyer 217 maç 150-39-28 473:187; kondisyon ortalaması 74 (bizde 73,6), Kroupi Ağır, dönüş 08.09.2030;
bütçe 60,0/42,1 M$ ve maaş boşluğu 369,5 B$ (×1,1404); sezon gelir/gider 54,3/56,8 M$; iş güvencesi 74, sezon başına göre 0;
sezon arşivi (G-B-M, puan, gol, hedef, alım/satış adları); moral 61; ilk üç (Fenerbahçe, Beşiktaş, Galatasaray).

**Yeni çözülenler:**
- **Kondisyon aşaması 4 = "Gym work"** (Spor salonu); 17.07'de 3 = Fizyoterapi.
- **Akademi 10 genç:** CMTracker akademi takımındaki (teamplayerlinks, 112264) herkesi sayıyor. Kingsley Orji (19, CDM, sözleşmesiz)
  `career_youthplayers`'ta yok; backend artık akademi takımının youthPlayer satırı olmayan oyuncularını da ekliyor (tier/ay null).
- **`career_scoutnetwork`** (`careerScoutNetwork`, `scout_network`): `mfts` işaretinden sonra u32 yeni gözlemci tarihi (yyyymmdd),
  `01 01 01` + u32 adet + işe alınabilir liste, `01 01` + u32 adet + işe alınmış liste. Kayıt 131 bayt: `[01][u32 sıra]
  [u32 kapsadığı ülke (alınabilirde bölge 4)][u32 uyruk][u32 deneyim][u32 bilgi][u32 ?][u32 ücret?][u32 ?][i32 ?][ff×4][+41 ad 16]
  [+86 soyad 16]`. CMTracker: 6 işe alınmış (Fransa, İtalya, Almanya, İspanya + 2), 5 alınabilir, yeni gözlemciler 28.07.2030.
  5 kayıtta (3 kariyer) tek aday. Deneyim/bilgi 0–5 yıldız (CMTracker 4 = 4 dolu yıldız). Ücret ve diğer alanlar **DOĞRULANACAK**.
- **`career_preseason`** (`careerPreseason`, `preseason_invites`): `cm_pst_*` anahtarlı kayıtlar `[01 01][u32][u32][u32 yarışma]
  [01 u32 uzunluk anahtar][01 u32 n][n takım][01 u32 2][u32][u32][u32 ödül EUR]`; ilk kayıt katılınan turnuva ve ardından onay
  tarihi, sonra davet listesi. CMTracker: International Cup ENTERED $4,6M (4,0 M€), Shield ve Champions Trophy DECLINED
  $4,4M/$4,3M (3,9/3,8 M€), onay 12.07.2030, 8 takım birebir. Yarışma 840 = CRTR (CMTracker'da "Competition 840").

**CMTracker'da olup bizde olmayanlar (kaynak bulunamadı):** menajer maaşı $17,1K ve kariyer kazancı $3,6M (15.000 € adayı oyuncu
sözleşme pazarlığı çıktı), en farklı kariyer galibiyeti 10–0 Konyaspor, zorluk (Ultimate) ve devre süresi (5 dk), yönetim
hedeflerinde asgari basamak (lig 13, kupa 15, Avrupa 15), sezon final sırası (CMTracker 1/2/1/1; ham +10 1/2/2/1 tutmuyor),
kart/ceza ayrımı (Adeyemi ceza 1; Doku/Hendriks/Ngoy 0 yerel · 2 kıtasal; aday kayıtlar birden çok tabloda), maç bilgisi
(hava, yedek 9, 5 değişiklik 3 pencerede, 5 sarıda ceza). CMTracker sezon tablosunda kupa göstermiyor ve finans kategorilerini
yalnız 4 başlıkla veriyor (tür 0/3/22 "Other").

## Yönetim hedefleri ve menajer karnesi kayıttan — 29.10.2026

- **`career_boardobjectives`** (`careerBoardObjectives`, `board_objectives`): tüm takımların hedefleri tek tabloda,
  `[u32 takım][01][u32 n]` + n × 20 bayt `[01][u32 hedef kimliği][u32 yarışma nesnesi][u32 yarışma kodu][u8 tür 0 lig/1 yerel kupa/
  2 kıtasal][u16 hedef][u16 üst hedef, 255 yok][u16 asgari, 255 yok]`. Basamak 0–17, 17 = kazan. Yalnız kullanıcı takımı saklanır;
  kayıt tablonun içinde olmalı (ardından başka takım). Fenerbahçe 24.07.2030 = CMTracker: Süper Lig hedef 17 asgari 13,
  Türkiye Kupası ve Şampiyonlar Ligi 17/15. 17.10.2029 kaydında bulunamadı (sezon ortası düzeni **DOĞRULANACAK**).
  Basamak → sıra/tur eşlemesi bilinmiyor; CMTracker de "Level N" gösteriyor. Hedef durumu yalnız lig için sezon arşivinde.
- **`career_manager`** (`careerManager`, `manager_record`): `[01][u32 takım][ff×4][01][u32 en farklı mağlubiyet tarihi][01][u32 en farklı
  galibiyet tarihi][u32 takım][u32 mağlubiyet rakibi][u32 takım][u32 galibiyet rakibi][u32 haftalık maaş][u32 kariyer kazancı][00]
  [u8 mağ. atılan][u8 yenilen][u8 gal. atılan][u8 yenilen]`. Menajer profili (`[ff×4][takım][lig][ff×4][0][?][sezon no][maaş][0][ff 00 00]
  [01 u32 ad]`) 43/42 bayt önünde zorluk (0 Başlangıç … 6 Ultimate) ve devre süresi (dk).
  Fenerbahçe 24.07.2030 = CMTracker: 15.000 € ($17,1K), kazanç 3.165.000 € ($3,6M), en farklı galibiyet 10–0 Konyaspor
  (22.08.2026), Ultimate, 5 dk. Kazanç haftalık maaşla artar (17.07: 3.150.000; 17.10.2029: 2.565.000 = 40 hafta eksik).
  En farklı mağlubiyet 1–4 Manchester City (07.03.2028; CMTracker göstermiyor). Gençlerbirliği 1/6 (Amatör, 6 dk) **DOĞRULANACAK**.
- **Kupa tarihçesi adayı (bağlanmadı):** menajer karnesinin ardından `01 u32 n` + n × `[01][u32 takım][u16 yarışma nesnesi][u16 ulaşılan aşama]
  [u8 sezon][u8][u8][8 bayt kod]`; sezon × yarışma (Süper Lig 1512, Türkiye Kupası 1487, Avrupa 135). CMTracker'ın "History by season".
- CMTracker kupa dolabı Türkiye Kupası 2027/28'i gösteriyor: sezon arşivindeki **yerel kupa (+33) doğrulandı**.

## Kupa görselleri — 29.10.2026

CMTracker kupa dolabı görselleri kendi CDN'inden veriyor ama adlar oyunun düzeninde: `DB/27/trophy/t68.png` (lig kimliği),
`t268` (Türkiye Kupası), `t223` (Şampiyonlar Ligi); armalar da oyunla aynı (`crest/dark/l326`). Yani görseller oyundan çıkarılmış.
LE'nin bilinen dosya listesinde kupa yolu yok (lig logoları var: `data/ui/imgAssets/league/dark/l<id>.dds`).
`exporter/lua/fc_trophies.lua` (salt okuma) 2.640 aday yolu `LegacyFileExist` ile yoklar, bulduğu kalıpla tüm kupaları ve lig
logolarını `C:\FCExport\assets\trophies|leagues` altına çıkarır, raporu `trophies_probe.txt`'ye yazar. `tools.assets convert`
bunları `trophies/<id>.png` ve `league-logos/<id>.png` yapar; API `/api/competitions/{id}/trophy`, `/api/leagues/{id}/logo`.
Kazanılan kupanın kimliği: lig = sezonun lig kimliği, yerel/kıtasal kupa = bu sezonun yönetim hedefindeki yarışma kodu.
Oyunda çalıştırılıp yol doğrulanana kadar arayüz kupa ikonu gösterir. CMTracker'ın CDN'i kullanılmaz.

**Oyunda doğrulandı (29.10.2026, LE v27.1.6):** yol `data/ui/imgAssets/trophy/t<id>.dds` (180×180; `trophy256x256/` de var),
159 kupa ve 183 lig logosu (`league/dark/l<id>.dds`, 256×256) çıkarıldı. Yerel/kıtasal kupa adı yönetim hedefindeki yarışma adından.

## Kart birikimi ve cezalar — 29.10.2026

**`career_suspensions`** (`careerSuspensions`, `suspensions`): `msus` işareti, `01 01 01` + u32 adet + 3 bayt, ardından adet × 16 bayt
`[u32 oyuncu][u32 takım][u32 sarı kart][u8 ceza maçı][u8 1][u16 yarışma kodu]`; tüm oyuncular, sırasız (24.07.2030: 2.672 kayıt).
Yalnız kullanıcı takımının kart/ceza satırları saklanır. Fenerbahçe 24.07.2030 CMTracker'la birebir: Adeyemi ceza 1 (ayrıca Almanya
1337 için 1 sarı), Doku/Hendriks/Ngoy 2 sarı (CMTracker "0 yerel · 2 kıtasal"; kod 0). Kod 0/1565/1900 → yarışma eşlemesi
**DOĞRULANACAK** (Ngoy'un kod 1900 ile ayrıca 2 sarısı var; CMTracker göstermiyor). Hendriks'in iki kod-0 satırı var.
Doğrulama yöntemi: resmi bir maçta sarı kart görüldükten önce/sonra iki kayıt. 24.07 → 28.07 (Wolves hazırlık maçı 4–2, kart yok):
tablo 2.672 → 2.695 kayıt, kullanıcı takımında değişiklik yok; maçın oyuncu istatistikleri (CRTR) kayda işlendi.

## Lua tanısı (fc_diagnose / fc_memprobe) — 29.10.2026, LE v27.1.6

- Okuma API'si: puan tablosu, fikstür, istatistik, ceza, hedef, tarih fonksiyonlarının hiçbiri yok (DOC.MD'deki
  GetPlayersStats/GetCurrentDate bu sürümde tanımsız). `playersuspensions` yer tutucu, `career_calendar` 2008, `fifaGameSettings`
  genel oyun ayarı (kariyerin zorluk/devresi değil). `leagueteamlinks.previousyeartableposition` güncel (Fenerbahçe 1).
- Bellek: `GetManagerObjByTypeId(114)` (SuspensionManager) +0x18/+0x20 = dizi başı/sonu, +0x28 kapasite: 43.120 bayt = 2.695 × 16,
  kayıttaki `msus` tablosuyla aynı kayıt ve düzen; yarışma ayrımı için ek alan yok. İşaretçi takip eden ilk sürüm oyunu çökertti;
  bellek okuması yalnız doğrulanmış dizilerle yapılmalı. Sonuç: kayıt dosyası Lua'dan zengin; yeni Lua okuyucusu gerekmedi.
## Uygulama senkron durumu (29.10.2026)

Bu bölüm oyun alanlarını değil, importer'ın kendi veri sözleşmesini tanımlar; ham oyun alanı eşlemesi eklenmedi.
`save_heads`: kayıt yuvası → son başarıyla okunmuş dosyanın snapshot'ı, kaynak yolu ve dosya yazılma zamanı.
`import_issues`: aktarılamayan kaynak kimliği, dosya adı, hata ve ilk/son gözlem zamanları; dosya düzelince temizlenir.
`GET /api/sync`: `current` seçili veri, `saved` kariyerin son okunmuş kaydı, `pendingExport` bundan sonra gözlemlenen
ve kayıtla birleştirilmemiş export, `issues` hata listesi. Oyunun açık/kapalı olduğunu veya hangi yuvanın belleğe
yüklendiğini bildirmez. API salt-okunurdur. Normal kariyer anahtarı kayıt işaretçisini; açık dal anahtarı arşiv
ucunu seçer. Kayıt yoksa export kullanılabilir. Ayrıntı ve kanıt: [sync-hardening-2026-10-29.md](sync-hardening-2026-10-29.md).

## Kadro analizi — veri ve tercih sözleşmesi (30.10.2026, Faz A)

Yeni oyun alanı çözülmedi. `config/field-map.json/analysisAttributes`, mevcut oyuncu özelliklerine 34 kanonik
analiz anahtarı verir. Ham adlar yalnız map'tedir; okuyucu özellikleri tek toplu sorguda, seçili snapshot ve
kullanıcı takımının oyuncu kimlikleriyle sınırlar. OVR/POT, yaş, tüm geçerli mevkiler, ham kadro yeri/form,
ayak, rol/PlayStyle kodları, sözleşme, kondisyon ve kiralık kayıtları aynı SQLite okuma işlemi içinde alınır.
Kadro yerleri bir optimizasyon sonucu değildir; tahmini diziliş yalnız 11 ham yerin şablonla tam eşleşmesidir.

- `AnalysisValue.state`: `known` (okunmuş), `missing` (yok), `unverified` (anlam/güncellik doğrulanmalı).
  `coverage` alanlarının ayrıca `partial` durumu vardır. Bilginin okunması, anlamının veya güncelliğinin doğrulandığını göstermez.
- Her kaynak: seçili snapshot kimliği, kaynak türü ve biliniyorsa oyun günü. Günlük snapshot'ın devraldığı
  tablolarda özgün gözlem tarihi saklanmadığı için `kind=inherited`, `gameDate=null` döner; yeni gün iddiası yapılmaz.
  Eski DB'de tablo kaynağı yoksa `unknown`. Kullanıcı takımının eksik satırları başka snapshot'tan doldurulmaz.
- Gerçek sıfır maaş/özellik/kondisyon korunur. Null sıfır değildir; kondisyon satırı yoksa 100 veya sağlıklı sayılmaz.
  Rol alanında 0 boş yatkınlıktır; tüm rol alanlarının null olması okunmamış bilgidir. Rol kodları taktik görevi değildir.
- Transfer bütçesi EUR; `wageHeadroom` EUR/hafta. Sezonluk maaş bütçesi haftalık boşluğa çevrilmez. Kaynaktaki bütçe
  kullanıcının transferlere ayırdığı tutardan ayrıdır; yalnız açık “Bu tutarı kullan” işlemiyle tercihe kopyalanır.
- Takımın oyun kurma/savunma derinliği alanları aktif kullanıcı taktiği olarak **DOĞRULANACAK**; profile otomatik
  atanmaz. Kiralık tablosunun kapsam/güncelliği de **DOĞRULANACAK**; satır yokluğu kiralık değildir demek değildir.

`app.db/manager_profiles` oyun alanı değildir. Birincil anahtar `(career_key,view_mode)`; `view_mode=saved|preview`.
Tercih JSON'u, iyimser kilit sürümü, güncelleme zamanı, kaynak snapshot/revision ve yapılandırma sürümü saklanır.
Kaydedilmemiş export profili, aynı dalın kayıtlı profiline taşınmaz. GET varsayılanları kalıcılaştırmaz.
PUT eski snapshot/revision/kural sürümü veya profil sürümüyle gelirse 409 döner. Güncel kadroda olmayan oyuncu,
lig veya role ait tercih sessizce silinmez; kullanıcı açıkça temizler. Kaydetme oyuna veya kariyer DB'sine yazmaz.

Faz A veri/prefs altyapısıdır; ihtiyaç veya öneri puanı üretmez. Gerçek kopyada 24 oyuncu, 816/816 özellik,
216/216 rol alanı, 96/96 stil alanı; kondisyon 13/24. Kanıt: [squad-analysis-phase-a-2026-10-30.md](squad-analysis-phase-a-2026-10-30.md).

## Export metin uyarıları ve maç özeti (30.10.2026)

İki export'un `player_names` kaynağında (25 ve 29.07.2030, oyuncu 254289, satır 15071) geçerli UTF-8 adın
sonunda tek başına `C4` baytı bulundu: `Tiberiu Căpuș` + eksik karakter. Bu farklı dosya kodlaması değildir;
diğer aksanlı adlar geçerlidir. Yalnız field-map `names.name` alanının sonundaki yarım çok baytlı karakter
`U+FFFD` (`�`) ile işaretlenir. Adın doğru son harfi tahmin edilmez, orijinal CSV'ye yazılmaz.
Ortadaki bozuk bayt, bozuk başlık, sayı veya başka alanın bozulması başarısız aktarım olarak kalır.

Importer'ın `import_warnings` tablosu başarılı aktarımın metin uyarısını kaynak/dosya/satır/alan/oyuncu/bayt
bilgisiyle tutar; `import_issues` aktarım hataları içindir. `/api/sync.warnings` eski DB'de boş listedir.
Uyarılar tekrar açılışta korunur ve UI'da başarısız kaynak sayısına katılmaz. Ham oyun alanı eklenmedi.

`GET /api/matches?saveUid=...&limit=5|10|20&competitionId=...`: aynı UID/dal içinde, seçili günden ileri
olmayan, gerçekten `source=save` olan ve kariyer fikstürü içeren en yakın kayıt seçilir. Seçili snapshot'ın
kendi kaydı önceliklidir. Günlük devralınmış bloklar yeni günün maçı diye etiketlenmez. Kaynak snapshot ve
tarihi `fixtureSource` olarak açıkça döner; kaynak yoksa `summary=null`, maç listesi boştur.

Oynanmış işareti, iki tarafın geçerli skoru ve kaynak gününden ileri olmayan tarih gerekir. Farklı takımın,
gelecek tarihli, oynanmamış ve tekrar eden aynı fikstürün satırları sayılmaz. 0–0 geçerli sonuçtur.
Ev/deplasman skorları kullanıcı takımına çevrilir. G/B/M skor üzerinden hesaplanır; penaltı galibi çözülmedi.
Hazırlık turnuvası tüm yarışmalarda dahildir; yarışma filtresiyle ayrılır. Sezon toplamı bir maça atanmaz.

23/27.07 tarihli mevcut LE dakika/puan satırları bulundu; kapsam ve puan ölçeği **DOĞRULANACAK**.
Topla oynama, pas yüzdesi, şut/xG ve maç bazlı golcü/asist kaynağı **DOĞRULANACAK**; ilk özet bunları üretmez.
Test ve yarın gereken oyun adımları: [match-analysis-and-next-game-test-2026-10-30.md](match-analysis-and-next-game-test-2026-10-30.md).

## Kadro derinliği ve ihtiyaç raporu — Faz B (30.10.2026)

Yeni ham oyun alanı eklenmedi. `DepthAnalysis`, Faz A'nın tek snapshot kapsamındaki kadrosunu kullanır.
`config/squad-analysis.json/depth` sürümlü model kurallarıdır; **oyun formülü değildir, kalibrasyonu DOĞRULANACAK**.

- `starterId` / `rotationId`: kayıtlı mevkilerle ortak kapasite kısıtlı atama. Oyuncu bir dizilişte yalnız bir yere
  atanır. Önce ilk 11 kapsamı, sonra bağımsız rotasyon kapsamı, sonra ilk 11/rotasyon OVR toplamı ve ana mevki
  eşitlik çözümü eniyilenir. Sabit oyuncu ID sırası deterministik sonuç üretir. İki diziliş ayrı senaryodur.
- `teamReference`: en yüksek en çok 11 bilinen OVR'ın üst medyanı; en az `minBaselinePlayers=5` gerekir.
  İlk seçenek/rotasyon tabanı `max(0,referans−proje farkı)`; farklar config'tedir. Lig seviyesi çıkarılmaz.
  OVR başka mevkinin resmî reytingine dönüştürülmez; özellik/rol uyumu Faz C'ye aittir.
- `priority`: `urgent` ilk seçenek açığı, `window` bağımsız rotasyon/kalite açığı, `next-season` sözleşme/gelecek
  kapsamı, `sufficient` mevcut modelde yeterli, `unknown` karar için veri yetersiz. Eksik mevki veya OVR varsa
  `conditional=true`. Kadro kaynağı tamamen yoksa ihtiyaç kararı/puanı yoktur; boş kaynak 11 gerçek açık sayılmaz.
- `needScore`: model endeksi; acil 100, rotasyon açığı 70, ilk seçenek kalite açığı 75+fark (en çok 95),
  rotasyon kalite açığı 50+fark (en çok 69), gelecek 40, yeterli 0. En güçlü gerekçe kullanılır; puanlar toplanmaz.
  Eksik kaliteyle yeterlilik iddiası kurulamaz. Bunlar sürüm 1 öncelik kurallarıdır, başarı olasılığı değildir.
- `readyStarterId` / `readyRotationId`: yalnız kaynağı ve günü belli, güncel `returnDate` gelecekte olanlar
  hariç tutularak aynı ortak atama yeniden yapılır. `temporaryGap` bu havuzda oluşan ek açığı belirtir.
  Kısa/uzun ayrımı config'te 45 gündür; sakatlık tek başına kalıcı transfer endeksini artırmaz. Ham sakatlık işareti,
  eksik/eski dönüş günü veya düşük kondisyon otomatik yokluk sayılmaz. Eksik kondisyon 100 değildir.
- `nextSeasonStarterId` / `nextSeasonRotationId`: sözleşme bitiş yılı `seasonEndYear` ve öncesi olanlar,
  **yenilenmediği varsayımıyla** çıkarılır. Kesin ayrılış tarihi değildir; önce yenileme seçeneği açıklanır.
  Sözleşmesi bilinmeyen korunur, sonuç üst sınırdır. Kiralık tablosu Faz A'da `unverified` olduğundan fiilen
  otomatik oyuncu çıkarmaz. İleride `known` gelen doğrulanmış kiralık yönü/bitişi senaryoda değerlendirilebilir.
- `developmentId`: yapısal atamada kullanılmayan, en çok 23 yaş, bilinen POT ≥ takım referansı olan ek oyuncu;
  yine kapasitesi bir. POT gelişim garantisi değildir. Bugünkü/gelecek görünümünde ikinci hazır alternatif gibi
  gösterilmez. Kadro dışında akademi ve kiralıktan dönecek oyuncular kapsamda yoktur.
- Yaş yalnız ardıl planı notudur; satış/emeklilik/düşüş puanı üretmez. `departurePlayerIds` gerçekleşmiş satış
  değildir; kadro korunur. Bütçe/maaş ve stil tercihleri bu aşamada ihtiyaç puanını değiştirmez.

`POST /api/analysis/run` snapshot/revision/config ve profil sürümünü denetler; eski istek 409'dur. Ekrandaki
kaydedilmemiş profil kullanılabilir; profil ayrıca kaydedilmez. `app.db/analysis_runs` rapor JSON'u yanında tam
girdi context/profilini tutar. ID: kapsam, saved/preview, snapshot/revision, config hash, profil hash ve motor sürümü.
Yeni veri veya tercih eski rapora sessizce uygulanmaz. Rapor UI'da oturumluk gösterilir; yeniden açılışta kullanıcı
aynı girdilerle tekrar hesaplar, aynı ID'li rapor yenilenir. Kalıcı rapor arşivi ekranı henüz yoktur.

Gerçek kopya kanıtı ve sınırlar: [squad-analysis-phase-b-2026-10-30.md](squad-analysis-phase-b-2026-10-30.md).

## Oyuncu önerileri — Faz C (30.10.2026)

Yeni ham oyun alanı çözülmedi. Özellik adları `field-map.analysisAttributes`, rol/PlayStyle/ayak etiketleri mevcut
map'ten gelir. `config/recruitment-profiles.json` kanonik özelliklerle **model kurallarıdır; katsayıların maç
sonucuyla kalibrasyonu DOĞRULANACAK**. FC'nin resmî uyum veya simülasyon formülü değildir.

- `target`: mevkinin taban ağırlıklarına seçili hücum/savunma/tempo, savunma çizgisi ≥65 ve seçili rolün
  ek ağırlıkları eklenir. Mevkiye uymayan stil eklentisi uygulanmaz. İki kanat tercihinin ayak istekleri çelişirse
  sessizce biri seçilmez; ayak tercihi boş kalır. `matchMode` için uydurma simülasyon etkisi yoktur.
- `attributeScore`: tüm ağırlıklı özellikler biliniyorsa ağırlıklı ortalama. Kısmi yüksek alanlar yeniden
  normalleştirilip oyuncuya avantaj sağlamaz; bir ağırlıklı alan bile eksikse aday sıralanmaz. Kritik temel
  özellikler (ör. stoperde savunma bilinci/müdahale) takım referansı−25 tabanını da geçer.
- `starter`: en az model ilk seçenek tabanı ve mevcut ilk oyuncunun OVR'ı. Mevcut oyuncu varsa ≥1 OVR
  veya ≥2 profil özelliği endeksi katkısı gerekir. `rotation` aynı kuralı model rotasyon tabanı/yedeğe uygular.
  Bağımsız yedek yoksa mevcut oyuncu uydurulmaz, katkı “yeni alternatif sağlar” olarak gösterilir.
- `development`: en çok 23 yaş, POT ≥ takım referansı, POT−OVR ≥4; OVR en az rotasyon tabanı−10.
  Hazır ilk 11/yedek tabanını geçmeyen genç yalnız yatırım grubunda yer alabilir. POT gelişim garantisi değildir.
  Gruplar amaç alternatifleridir; bir oyuncu birden çok gruba girebilir, eşzamanlı iki transfer sayılmaz.
- `qualityScore`: `clamp(50 + (OVR−karşılaştırılan OVR veya amaç tabanı)×3,0,100)`.
  `developmentScore`: `clamp(50+(POT−takım referansı)×3+max(POT−OVR,0)×2+max(23−yaş,0),0,100)`.
  Yaş/POT eksik ve gelişim ağırlığı >0 ise puan üretilmez. Hemen sonuç profilinde gelişim ağırlığı 0 olduğundan
  eksik POT oyuncuyu hazır katkı grubundan otomatik atmaz; POT 0 diye varsayılmaz.
- `score`: hemen sonuç için özellik/katkı/gelişim = %70/%30/%0; dengeli %75/%20/%5;
  genç proje %65/%10/%25. Ek katkı: istenen rol +1/++2, uygun normal stil 0,25/+stil 0,5 (en çok 1,5),
  istenen ayak 0,5, tercih edilen lig 0,5. Aynı +stil normal olarak tekrar sayılmaz. Sonuç 0–100'e sınırlanır.
  Bunlar sürümlü başlangıç katsayılarıdır; rol, özellik ve OVR ayrı kavramlardır. Rol aşinalığı atanmış görev değildir.
- `roleLevel`: gözlenmiş kod %100 rol, ≥100 ise ++. Eksik kolonlar yokluk kanıtı sayılmaz; olumlu işaret
  gözlendiyse gösterilir, tam olmayan kaynaktan “rolü yok” sonucu çıkarılmaz. PlayStyle alanları da aynı kapsam
  uyarısını taşır. Stil/rol desteği zayıf temel özellik veya OVR tabanını geçersiz kılamaz.
- Kadro ve kulüp bağı kendi takımı olanlar, güncel olası kendi kiralıkları dış havuzdan çıkarılır. Kiralık
  tablosunun güncelliği doğrulanmadığından bu dışlama temkinlidir. Kulüp bağı bilinmeyen serbest varsayılmaz.
  Kullanıcı yaş aralığı zorunlu koşul, tercih edilen lig küçük ek katkıdır. Eski oyuncu sırf yaşı yüzünden atılmaz.
- `internal`: aynı mevkiyi kayıtlı oynayabilen kadro seçenekleri ayrı. Başka yerde kullanılıyorsa kaydırmanın
  o yeri açabileceği belirtilir; bu oyuncu ikinci bağımsız yedek olarak sunulmaz. Akademi/terfi bu aşamada yoktur.

### Bireysel maliyet — güncel politika, recruitment-2

30.10.2026 transfer merkezi teslimi önceki keyfî bonservis/maaş çarpanlarını kaldırdı. Kulüplü oyuncunun
`feeLow/High` alanları null; istenen güncel bedel bilinmiyor. Serbest oyuncuda yalnız bonservis 0, toplam maliyet
değil. `wageLow/High` mevcut veya kayıtlı haftalık ücretin aynısı; yeni sözleşme talebi/aralığı değildir.

`referenceAmount/referenceKind`: serbest oyuncuda 0/`free-agent`; kimlikli tarihli son transfer varsa
o bedel/`last-transfer`; yoksa mevcut etiketli değer modeli/`value-model`. Model değeri kartta bonservis diye
sunulmaz. Geçmiş transfer yeni satış fiyatı değildir. Bu referans ve mevcut/kayıtlı maaş, güvenlik payı düşülmüş
iki ayrı bütçeyle yalnız ön eleme için kıyaslanır. İmza/temsilci ücretleri, yeni maaş ve kulübün kabulü bilinmez.

`reference-within`: iki referans da bütçede; `reference-above`: bilinenlerden en az biri bütçeyi aşıyor;
`unknown`: bütçe veya referans eksik. Bilinen aşım, diğer alan eksik olsa da aşım olarak korunur. Gerçek 0 kaybolmaz.
Öneri sırası bu durumlar (within, unknown, above), sonra model endeksi ve ID'dir; kullanıcı puan/OVR ile de sıralayabilir.
API en çok 10, yeni ekran varsayılan 5 (3/5/10 seçilebilir) aday gösterir; toplam ve elenme sayıları ayrıca tutulur.
Ortak transfer paketi bütçesi yoktur.

### Kaynak, saklama ve geçersizleştirme

`GET /api/analysis/{id}/candidates?saveUid=...&formation=...&slot=...` yalnız bu kapsam/view_mode raporunu okur.
`DepthReport.profileVersion` artık raporun üretildiği kalıcı profil sürümünü de tutar. Snapshot, revision, B
yapılandırması veya profil sürümü değiştiyse (cache hit olsa bile) 409; başka kariyer/dal/önizleme raporu 404'tür.
Raporun seçilmemiş dizilişi/yeri 400'dür. Yeni veriyi eski raporla karıştırmak yerine yeniden analiz gerekir.

Havuz, tek SQLite okuma işlemi içinde yalnız seçili snapshot'tan okunur. Diğer export/geçmişten eksik özellik
tamamlanmaz. Özellik ve rol/stil kapsamı toplu sorgulanır; oyuncu başına HTTP/Detail yoktur. En çok iki havuz ve
48 sonuç süreç belleğinde tutulur. Her istek güncellik denetiminden geçer. `sources` alanında tablo kaynağı ve
biliniyorsa gözlem günü vardır; devralınmış tabloda gün null kalır. Ekranın kaynak tarihi tüm alanların yeniden
gözlendiği iddiası değildir.

`app.db/recruitment_runs`: analiz ID, hedef diziliş/yeri, öneri kural hash'i, motor sürümüyle tam kural JSON'u ve
gerekçeli sonuç JSON'u saklanır. Aynı rapor/profil sürümü/hedef/kural için tek kayıt; profil otomatik kaydedilmez.
`analysis_runs` tam context/profil girdisini taşımaya devam eder. Tarihsel rapor arşivi ekranı henüz yoktur.
Yerel log `RecruitmentService` kategorisinde kaynak/revision, hedef, kural hash'i, havuz/eleme sayısı ve süredir.
Masaüstünde mevcut `logs/app/api` yönlendirmesi kullanılır; dış servise oyuncu veya kayıt gönderilmez.

Doğrulama ve performans: [squad-analysis-phase-c-2026-10-30.md](squad-analysis-phase-c-2026-10-30.md).

## Transfer merkezi, lig ve tercihler — 30.10.2026

- `field-map.transferHistory`: `transfers` tablosunda `playerid`, `sellingteamid`, `buyingteamid`,
  `transferamount`, `transferdate`; tutar EUR kabulü ve `transferHistoryDateEncoding=epochDays` **DOĞRULANACAK**.
  Okuyucu yalnız seçili snapshot'ta doğrudan oyuncu ID'siyle, geçmiş tarih, farklı/geçerli kulüpler ve ≥0 bedelle
  bağlar. Son günün çelişkili iki hareketi varsa bedel göstermez; eş tekrarları birleştirir. Aynı gün 0 korunur.
  Alternatif `yyyyMMdd` kodlaması yalnız config'te açıkça seçilirse okunur. Gelecek tarih veya belirsiz kod atılır.
  Fenerbahçe test kopyasında tablo yalnız -1/yer tutucu satırlar içerdiği için kullanılabilir ücret yoktur.
  Sezon arşivindeki isimli en pahalı alım/satım, ID kanıtı olmadan oyuncuya bağlanmaz. Gerçek ücretli satırla oyun
  doğrulaması hâlâ gerekir; sentetik test kimlik/tarih/çakışma/sıfır davranışını doğrular.
- `league.starterReference`: kendi ligindeki kulüplerin bilinen OVR'lı en iyi en çok 11 oyuncusunun ortalamaları
  arasındaki medyan; kulüp başına en az 5 oyuncu ve toplam en az 2 ölçülebilir kulüp gerekir. Bu bir **model
  referansıdır**, resmî lig reytingi değildir. `measuredClubs` kapsamı gösterir. Kalite bileşeni varsa %80 mevcut
  katkı, %20 lig seviyesi uyumu olarak birleşir; özellik bileşenine ikinci kez eklenmez. Eşikler config'tedir.
- Rotasyon adayının OVR'ı mevcut ilk seçeneği (yoksa takım referansını) geçemez. Aynı OVR'da daha uygun özellik
  profili geçerli olabilir. Genç yatırım ayrı amaçtır; adaylar birlikte alınacak paket değildir.
- `manager_profiles.PlayerPreferences`: kanonik mevkiye bağlı sınırlı tercih ID'leri. Hızlı/teknik/dengeli bek,
  hızlı/teknik/içe kat eden kanat, pivot/hareketli/bitirici forvet, teknik/golcü 10. Ağırlık ve etiket eşikleri
  `recruitment-profiles.json` v2'de, geçerli seçenekler `squad-analysis.json` v3'te. Pivot ≥185 cm, kısa hareketli
  forvet ≤183 cm; boy yoksa koşul geçilmiş sayılmaz. Model tercihidir; oyun performansıyla kalibrasyon
  **DOĞRULANACAK**. “Hızlı bek”, “teknik 10”, “4-3-3 kanadı” notları yalnız önerilen mevki ve bilinen özellikten
  türetilir; oyuncunun gerçek takım taktiği/kişiliği diye sunulmaz.
- `GET /api/recruitment/board`: geçerli kayıtlı profil → kayıttaki diziliş eşleşmesi → açık model varsayımı.
  Boş profil bütçesi için bilinen kayıt bütçesi yalnız etkili analizde kullanılır; `profile/save/unknown` kaynak
  etiketi döner. Sıfır korunur. İlk açılış profili otomatik kaydetmez. 14 mevki, mevcut diziliş dışındakiler
  alternatif senaryo. CF yok; veri yoksa aday uydurulmaz. Sonuç başı/sonu kaynak ve profil değişimi denetlenir.
- İsteğe bağlı kartlarda yalnız “Tercihleri uygula” profili yazar. Atla/kapat yazmaz; eski sürümle kaydetme 409
  kullanıcının taslağını korur. Analiz/öneri raporları kendi app.db tablolarında motor `recruitment-3`, tam config,
  snapshot/revision ve profil sürümüyle tutulur; tarihsel raporlar yeni veriymiş gibi yeniden kullanılmaz.

Teslim, ekran adresleri, gerçek kariyerler ve test kanıtı:
[transfer-hub-and-theme-delivery-2026-10-30.md](transfer-hub-and-theme-delivery-2026-10-30.md).

### Takımın kısa raporu — öncelik metni

Transfer ekranındaki özet yeni ham alan veya AI çıkarımı kullanmaz. Board'un yalnız `inFormation=true`
mevkilerinden `urgent → window → next-season`, eşitlikte azalan `needScore` sıralamasıyla üretilir; sayfanın açıldığı
mevki de aynı sıradan seçilir. Alternatif diziliş açıkları bu sıraya eklenmez. `sufficient` transfer ihtiyacı sayılmaz;
`unknown` veya `conditional/quality-unknown/roster-unknown` nedenleri eksik veri uyarısına girer.

Bu dönemin inceleme sırası ile gelecek sezon hazırlığı ayrı cümlelerdir. Her satırda raporun gerçek
`starter-gap/starter-quality/league-starter/rotation-gap/league-rotation/rotation-quality` gerekçesi; gelecek sezonda önce `contract/future-gap`
gösterilir. Metin yoksa belirsizlik korunur; sözleşme sonu kesin ayrılık sayılmaz. İlk üç satır görünür, devamı
açılır. Bilinen yapısal açık yoksa ve kaynak tam görünüyorsa modelin takviye gerektirmediği söylenir; veri eksikse
aynı kesinlik kullanılmaz. Sonuç model raporudur, ortak bütçeli transfer paketi değildir.

[Gerçek iki kariyer ve arayüz testleri](transfer-priority-and-design-elements-2026-10-30.md).

### Scout'ta doğrudan kaleci özellikleri — 30.10.2026

Liste DTO'su `gkDiving/gkHandling/gkKicking/gkReflexes/gkPositioning`, mevcut `analysisAttributes` eşlemesinden
seçili snapshot'ta toplu okunur. Yeni ham alan çözümü yoktur. Bunlar 0–99 kayıt değerleri; eksik/geçersiz null,
gerçek 0 korunur. PAC–PHY tahminiyle karıştırılmaz. Yalnız GK filtresi bu beş alanı otomatik başa alır;
karma filtrede kalıcı sütun tercihleri geçerlidir. Detay sayfasının Kaleci kategorisiyle karşılaştırma:
[kaynak, test ve gerçek veri kanıtı](scout-width-and-trophy-fixes-2026-10-30.md).

## Lig kıyası, beklenen maaş ve erişilebilirlik — 30.10.2026

Yeni ham oyun alanı yoktur; değerler mevcut alanlardan hesaplanır, hesaplanan alanlar DOĞRULANACAK kabul edilir.

| Alan | Kaynak | Birim ve anlam |
|---|---|---|
| Mevki reytingi | `analysisAttributes` + `config/position-ratings.json` | 1–99 tahmin, yalnız kayıtlı mevkilerde, OVR'ı aşmaz |
| `teamReference` | Dizilişe atanan 11'in mevki reytingi ortalaması | Yuvarlanmış; az oyuncu yerleşirse en yüksek OVR'lar |
| `lines`, `league` | `leagueteamlinks`, `teamplayerlinks`, oyuncu özellikleri | Rakip kulüplere aynı atama; medyan ve sıra. Kariyer verisi: DOĞRULANACAK |
| `cost.expectedWage` | Kulüp veya lig maaşlarına `ln maaş ~ OVR` uyumu | EUR/hafta; talep değildir |
| `unreachable` | `internationalPrestige`, değer, maaş, OVR | Eşikler `recruitment-profiles.json`, prestij etkisi DOĞRULANACAK |
| `contracts`, `xi` | Kadro bağlantısı, sözleşme, maaş | Kayıtlı 11'e dayanır; kayıttaki 11 son maç dizilişi olmayabilir |
| `leagueObjective` | `careerBoardObjectives` | Seviye 0–17; sıraya çevrilmez |

Kurallar ve test kanıtı: [recruitment-logic-fix-2026-10-30.md](recruitment-logic-fix-2026-10-30.md).

## Arayüzde lig yarışması ve kayıt yuvası bağlamı — 31.10.2026

- `ClubView.leagueCompetitionId`: mevcut `careerCompetition` config eşlemesinden `CareerBlocks.LeagueCompetition`
  ile bulunan kariyer yarışması kimliği. `C` + `club.leagueId` koduna karşılık gelir; örneğin lig 68,
  yarışma 1512. İki kimlik doğrudan karşılaştırılmaz. Eşleme bulunamazsa null; arayüz kupa sınıflandırması
  uydurmaz. Yeni ham oyun alanı eklenmedi. Kaynak eşlemesi mevcut kayıt çözümlemesine dayanır;
  farklı liglerde oyun karşılaştırması DOĞRULANACAK.
- `BranchInfo.slots`: importer'ın `save_slots` metaverisindeki dal/yuva ilişkisi; oyun alanı değildir.
  Başlık, yalnız dosya adı ve yuvanın son oyun tarihi gösterilir. Ebeveynlik kanıtı sayılmaz.
- Kupa sezonları mevcut `managerCareer.seasons` arşivinden, yalnız aynı kulüp ve tamamlanmış sezonlar.
  Yerel/kıtasal kupa alanlarının DOĞRULANACAK durumu sürer; eksik değer sıfıra çevrilmez.

## Transfer satırındaki gösterimler — 31.10.2026

Yeni ham alan veya hesaplama yok. `RecruitmentCandidate.score` seçili mevki/amaç için uyum puanı;
`tags` mevcut motor eşiklerinden üretilen profil etiketleri; `overallGain` tahmini mevki reytingi farkıdır.
`lastTransfer` gözlenen geçmiş bedeldir, güncel satış fiyatı değildir. `cost.referenceAmount` yalnız
`referenceKind=value-model` ise değer tahmini olarak gösterilir. `expectedWage` mevcut maaşa eşit
olsa bile tahmin etiketini korur; yoksa `recordedWageOnly` ile kayıtlı serbest maaşı/aktif mevcut maaş
ayrılır. Maaş, erişilebilirlik ve profil eşiklerinin DOĞRULANACAK durumu devam eder.
İstenen bonservis ve yeni ücret talebi bu alanlardan türetilmez.

## Ortak transfer paketi — 31.10.2026

Yeni ham oyun alanı eklenmedi. Tüm sonuçlar seçili snapshot'ın mevcut analiz/öneri/kadro/akademi alanlarından
ve kullanıcının açık senaryo girdisinden türetilir. Model maliyetleri, bağımsız derinlik ve satış bütçesi etkisi
**DOĞRULANACAK**; oyun teklif kabulü veya gerçek ücret talebi değildir.

| Alan | Kaynak ve anlam |
|---|---|
| `TransferPlanSource` | Kanonik scopeKey, saved/preview, snapshot/revision, analiz/öneri/paket config hash'leri, profil sürümü. app.db bağlamı; ham oyun alanı değil |
| `PlanAcquisition.fee/weeklyWage/signingFee` | Kullanıcı senaryosu, EUR / EUR-hafta / EUR. Null referans/tahmin varsa kullanır; ek ücret null bilinmiyor. 0 gerçek kullanıcı varsayımı olarak korunur |
| `TransferPlanPlayer.feeSource/wageSource` | `user`, `last-transfer`, `value-model`, `free-agent`, terfide `internal`; maaş `user/estimate/current/unknown`. Satıştaki current, mevcut maaşın serbest kalma varsayımıdır |
| `PlanBudget.transferBudget/weeklyWageBudget` | Board'un etkili profilindeki ayrılmış bütçe × (1−rezerv/100); bir kez uygulanır. Null bilinmiyor, 0 sıfır |
| `knownFees/knownWeeklyWages/knownSigningFees` | Alış + terfi için yalnız bilinen tutar toplamları; her birinin unknown sayacı ayrı. Terfi bonservisi 0, ücret/ek ücret sıfır varsayılmaz |
| `remainingWithoutSales` | Bütçe − bilinen alış/terfi bedelleri − bilinen ek ücretler. Gerekli bütçe/bedel yoksa null; bilinmeyen ek ücretler hariç olduğu açıkça yazılır |
| `remainingWithSales` | Yukarıdaki kalan + kullanıcının satış geliri. Gelir bilinmiyorsa null; gerçekleşmiş bütçe değildir |
| `wageRemainingWithoutSales/WithSales` | Haftalık bütçe − yeni tahmini/girilmiş ücretler; koşullu versiyon mevcut satış oyuncularının bilinen maaşının tamamını ekler. Kesintiler/oyun bütçe dağıtımı doğrulanmadı |
| `before/after` | Aynı senaryo dizilişinde DepthAnalysis ataması. Önce satış oyuncusu çıkarılır, alış/terfi eklenir; tek oyuncu tek bağımsız yer. Kaynak lig kulüplerinde alınan oyuncu ikinci kez tutulmaz |
| `warnings.unassigned/depth-loss` | Yeni oyuncunun ilk 11/rotasyon/gelişim atamasına yerleşmemesi veya dolu bağımsız ilk 11/rotasyon sayısının azalması; model bulgusu |
| `transfer_plans.version/updated_at` | app.db kaydının artan sürümü ve UTC zamanı; oyun tarihi değildir. Tek kayıt career_key + view_mode; eski sonuç source farkıyla bayat kalır |

Yeni sözleşmenin bitiş tarihi tahmin edilmez. Akademinin POT'u bugünkü reytinge çevrilmez. Durum hesapları,
null/sıfır davranışı, kalıcılık, güvenlik ve gerçek iki kariyer kanıtı:
[transfer-packages-2026-10-31.md](transfer-packages-2026-10-31.md).

## Kayıt içi dünya/kulüp transfer geçmişi, sezon arşivi ve değer kalibrasyonu — 31.10.2026

### 1. İkili kayıt blokları (`careerTransfer` → `raw_career_transfers` ve `career_transfer_archive`)

FC 27'de T3DB içindeki `transfers` tablosu boş yer tutucu (`-1`) satırlarından ibaretken, sıkıştırılmış `save.payload` (`BNRY`/`cds`) içinde iki ayrı gerçek transfer tablosu bulundu ve 4 kariyer / 11 kayıt kopyasında %100 doğrulandı (`tools/saveimport/career.py` → `career_transfers`, `BLOCK_VERSION = 9`):

| Kaynak | Konum ve başlık | Kayıt boyutu ve düzeni | Kapsam ve davranış |
|---|---|---|---|
| Dünya Transfer Tablosu (`source='world'`) | `\x01` + `u32 count` (`1..20000`), ardından `01 01` | 31 bayt: `[01 01][u32 fee][u32 date yyyymmdd][u32 to_teamid][u32 playerid][u32 seq][u32 from_teamid][u32 wage][u8 flag][u32 clause]` (`0xFFFFFFFF` clause → `null`) | Sezon başından (2 Temmuz) kayıt gününe kadar tüm yapay zekâ transferleri (ör. Chesterfield 984, Colchester 1.377, Gençlerbirliği 1.655, Fenerbahçe 2029/30 1.930, 2030/31 1.008 kayıt) |
| Kullanıcı Kulübü Halkası (`source='club'`) | `_BUDGET` (`career_finance`) bloğunun önünde `q - 332` (`\x00\x00\x00\x00\x01\x01\x01`), kayıtlar `q - 325` | 10 × 25 bayt dairesel tampon: `[u32 slot_id][u32 date yyyymmdd][u32 fee][u32 counterparty_teamid][u32 playerid][u32 wage][u8 kind]` (`kind`: `1` = alış, `0` = satış, `2` = serbest bırakma) | Kullanıcının kendi kulübünün son 10 transferi; yeni sezonda üzerine yazılmamış (`slot_id = 0xFFFFFFFF`) yuvalarda önceki sezonun transferleri kalır |

- **Sezon bazlı kalıcı arşiv (`career_transfer_archive`):** Oyun her yeni sezon başında (2 Temmuz) 31 baytlık dünya tablosunu sıfırladığı için `tools/saveimport/store.py` içindeki `archive_transfers` her kayıttaki transferleri `PRIMARY KEY(save_uid, branch, transfer_date, playerid, from_teamid, to_teamid)` ve `season` etiketiyle (`2026/27`, `2029/30`, `2030/31`) silmeden biriktirir. `upgrade_backed_up_saves` ile diskte yedeği duran geçmiş sezon kayıtları da otomatik yükseltilir.
- **Akış ve oyuncu profili (`FeedService`, `TransferEvidenceReader`, `PlayerProfile.lastTransfer`):**
  - `/api/feed` (`FeedService.cs`) `season` sorgu parametresi alır; yanıtta `seasons`, `currentSeason` ve her transfer öğesinde `fee`, `wage`, `releaseClause`, `season` döner. Aynı sezonda birden fazla kayıt dalı varsa aktif dalın (veya en güncel dünya tablosuna sahip dalın) kayıtları seçilerek tekrarlar önlenir; ardışık snapshot farklarıyla (`Diff`) `(PlayerId, ToClubId, Season)` üzerinden tekilleştirilir.
  - `TransferEvidenceReader` hem `raw_transfers`, hem `raw_career_transfers`, hem de `career_transfer_archive` tablolarını okur. Öneri motorunda (`includeFree: false`) bedelsiz (`fee = 0`) imzalar oyuncunun referans değerini `0 €` yapmaması için hariç tutulur; oyuncu profilinde (`includeFree: true`, `PlayerProfile.lastTransfer`) ise bedelsiz imzalar dahil oyuncunun son transferi (*"21 Tem 2026 tarihinde X kulübünden €2M bonservisle geldi"*) gösterilir.

### 2. Tahmini değer (`Valuator`) kalibrasyonu (`backend/FcMarket.Api/appsettings.json`)

Kayıt arşivinden çözülen **3.894 gerçek bonservisli erkek oyuncu transferi** ve CMTracker referans örnekleri üzerinden `Valuation` parametreleri güncellendi:

- `BaseValue`: `1.150.000` (`BaseOverall: 60`)
- `Exponent`: `0,112`
- `PeakAge`: `24`, `YouthPremiumPerYear`: `0,125`, `AgeDeclinePerYear`: `0,185`
- `ReferenceWage`: `10.000`, `WageElasticity`: `0,52`
- `ContractMultipliers`: `0 → 0,4`, `1 → 0,7`, `2+ → 1,0`
- `RoundTo`: `50.000`

## Kulüp incelemesi — 07.11.2026

Scout → Takımlar → **İncele** (ya da başka bir kulübün kadro sayfasındaki *Kulüp incelemesi*): kullanıcının gitmeyi
düşündüğü bir takımı kendi takımı gibi değerlendirir. API: `GET /api/club/review?teamId=` (salt-okunur).

| Bölüm | Kaynak | Not |
|---|---|---|
| Diziliş | `formations` (field-map `teamFormation`): `formationname`, `defenders/midfielders/attackers`, `position0..10` (slot kodu → `slotPositions`) | Takımın oyundaki kayıtlı varsayılan taktiği; maç içinde yapay zekâ değiştirebilir. FC 27 kaydında 871 takımda dolu. |
| Diziliş karakteri | `formations.offensiverating` | Dizilişe bağlı 0–4 (5-4-1=0, 5-3-2=1, 4-2-3-1=2, 4-3-3/3-4-2-1=3, 3-4-3=4); takımın ayrı bir tercihi değil. Etiketler `config/club-review.json`. |
| Oyun kurma | `teams.buildupplay` | 0–3; yalnız 2 = "Dengeli" doğrulandı. Diğer kodlar etiketsiz gösterilir. |
| Savunma çizgisi | `teams.defensivedepth` | 25–95, lig geneli ort. ~51. < 40 derin, > 60 yüksek (`club-review.json` → `defensiveLine`). Ligin ortalaması yanında gösterilir. |
| İhtiyaçlar | Kadro derinliği motoru (`DepthAnalysis`), incelenen takım "kendi takımı" sayılarak | Kayıtlı diziliş `squad-analysis.json`'da yoksa aynı 11 yerli ya da en çok ortak temel mevkisi olan diziliş kullanılır ("en yakın tanımlı diziliş" etiketi). 3-4-2-1 bu iş için eklendi. Lig kıyası o takımın kendi ligindeki kulüplerle. |
| Tahmini bütçe | `teams.clubworth` | Oyun yapay zekâ kulüplerinin bütçesini kayıtta tutmuyor. Sezon başı transfer bütçesi ≈ 2637,3 × kulüp değeri ^ 0,7646; kullanıcının 5 gerçek sezon başı bütçesine (Colchester, Chesterfield, Gençlerbirliği, Fenerbahçe ×2; 3 lig) log-log kalibre, hepsi ±%1. Ekranda ±%15 aralık. Kulüp değeri kalibre kulüplerin aralığının 1,25 katı dışındaysa "kaba işaret" uyarısı (ör. Real Madrid ~514 M€ güvenilir değil). Maaş bütçesi tahmin edilmez. |

Kullanıcı kulübüne ait girdiler (gerçek bütçe, maaş alanı, yönetim hedefi) incelenen takım için okunmaz. **İş teklifleri**
ne veritabanı tablolarında ne de çözülen kariyer bloklarında var; ayrı bir kayıt araştırması gerekir (yol haritası 2).
