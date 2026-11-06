# Oyun içi mod'lar (Faz 5): plan ve M0 doğrulama rehberi

> Durum: **onaylandı** (17 Ekim 2026). M0 doğrulama script'leri ve tek takımlık yıldız aday script'i hazır, oyunda
> denenmedi: [M0 rehberi](#ek-m0-oyun-içi-doğrulama-rehberi). PlayerCapture (miniface yakalama) FC 27 LE v27.1.3'te yok:
> DLL'de yalnızca arayüzden PNG içe aktarma var, Lua'dan çağrılamıyor.
> Kaynaklar: `C:\FC 27 Live Editor\lua` (LE v27.1.3: `libs/v1`, `libs/v2`, `scripts/`, `DOC.MD`), `FCLiveEditor.DLL` içindeki
> metinler, `C:\FCExport\le_capabilities.txt` (v2 yüklüyken, 17.10.2026) ve gerçek `schema.json` (2.11.2029).
>
> **Bu belge oyuna yazmayı planlıyor.** CLAUDE.md'deki "Oyuna yazan hiçbir özellik ekleme (Faz 4, ayrı karar)"
> kuralı uygulama başlamadan önce senin kararınla güncellenmeli. Piyasa uygulaması (backend/frontend) salt-okuma kalır.

## 1. Özet

| # | Mod | Yapılabilirlik | En büyük engel | İş |
|---|---|---|---|---|
| 0 | Altyapı: autorun loader, save başına durum, dry-run, yedek | ✅ | Autorun klasörünün yeri oyunda denenmeli | S |
| ★ | Her takıma yıldız aday (**B: mevcut genci yükselt**) | ✅ | OVR'ın oyun tarafından yeniden hesaplanması | M |
| ★ | Her takıma yıldız aday (A: yeni oyuncu oluştur) | ❌ | `CreatePlayer` FC 27 LE'de yok; ham ekleme gerekir | – |
| 4 | Finansal Fair Play | ❓ (yalnızca uyarı ✅) | Gelir verisi yok; transfer yasağı API'si (`cAddTransferBan`) yok | S (uyarı) |
| 1 | Süper Lig yabancı kuralı | ❓ (uyarı ✅, ceza ❓) | Maç kadrosu (`cm_teamsheets`) canlı mı; para cezası bellek yazımı ister | M |
| 3 | Patlama/sönme gelişim | ✅/❓ | Oyunun kendi gelişim sistemi değişikliği ezebilir | M |
| 2 | Altın nesil akademi | ❓ | Akademi üretim şablonunun (`career_youthplayerposattributes`) etkisi bilinmiyor | M |
| 5 | Büyük maç psikolojisi | ✅ kendi takımın / ❌ rakip | `SetPlayerForm/Morale` yalnızca kullanıcı takımında çalışıyor | S |
| 6 | Hoca kovulma zinciri | ❌ **yapma** | API yok; `manager.teamid` + kariyer bellek durumu ham yazım | – |

Önerilen sıra: **0 → ★B → 4 (uyarı) → 1 (uyarı) → 3 → 2 → 5**, 6 yok. Senin sıran (4 → 1 → 3 → 2 → 5 → 6) yakın; farklar:
yıldız aday en güvenli yazma yolunu (oyuncu özellikleri) ilk kez gerçek veride doğrular, diğer mod'lar ona dayanır;
FFP ve yabancı kuralı ilk sürümde yalnızca uyarı.

## 2. Live Editor'den kesinleşenler

**Otomatik başlatma ve event'ler** (DLL metinleri):
- LE açılışta `lua/autorun` klasöründeki script'leri çalıştırıyor ("Executing scripts from lua/autorun"). Veri
  klasöründe `C:\FC 27 Live Editor\lua\autorun` boş olarak duruyor. **Hangi klasör olduğu oyunda denenecek.**
- Lua'nın görebildiği yalnızca iki event türü var: `pre__/post__LEInitDoneEvent` ve `pre__/post__CareerModeEvent`.
  Kariyer olayları `CareerModeEvent`'in id'leriyle ayrılıyor (`ENUM_FCEGameModesCM_EVENT_MSG_*`). Zamanlayıcı ve
  `Sleep` yok: mod'lar yalnızca bu event'lerde çalışabilir.
- İlgili id'ler: `POST_LOAD_PREPARE` 29 (kariyer yüklendi), `DAY_PASSED` 15, `MONTH_PASSED` 17,
  `ABOUT_TO_ENTER_PREMATCH` 37, `PLAYER_GROWTH` 53, `YOUTH_PLAYER_ADDED_TO_YOUTH_ACADEMY` 109,
  `END_OF_SEASON_REACHED` 19, `SEASON_ENDED` 24, `PREPARE_FOR_SAVE` 28.

**Yazma fonksiyonları** (`le_capabilities.txt`'deki global fonksiyonlar):
| Fonksiyon | Durum | Not |
|---|---|---|
| `LE.db:GetTable(t):SetRecordFieldValue(rec, alan, v)` | Var | LE'nin kendi örnekleri (`99ovr_99pot.lua`, `is_retiring=0.lua`, `mass_edit_age.lua`) `players`'a böyle yazıyor |
| `PlayerHasDevelopementPlan`, `PlayerSetValueInDevelopementPlan` | Var | Kullanıcı takımında özellikler, workrate, skill moves, zayıf ayak plandan okunuyor; potansiyel planda değil |
| `SetPlayerForm`, `SetPlayerMorale` | Var | DOC.MD: **yalnızca kullanıcı takımındaki oyuncular** |
| `SetPlayerFitness` | Var | Kısıt belirtilmemiş |
| `TransferPlayer`/`cTransferPlayer`, `LoanPlayer`, `ReleasePlayerFromTeam`, `TerminateLoan` | Var | Anında işlem; DOC.MD "save'i bozabilir" uyarısı veriyor |
| `CreatePlayer`, `DeletePlayer` | **Yok** | DOC.MD'de anlatılıyor ama FC 27 LE'de yok |
| `cAddTransferBan` vb. (`transfer_ban_manager.lua`) | **Yok** | Kütüphane FC 25'ten kalma; C tarafı yok |
| `PlayerDevelopmentManager*` (özel gelişim hızı) | **Yok** | Aynı şekilde FC 25'ten kalma |
| `AddPlayerToTransferList` vb. | Yok | Sarmalayıcı, C fonksiyonu yok |
| `GetUserTransferBudget`/`SetTransferBudget` | Yok / uyarı fonksiyonu | Bütçe yalnızca `BudgetManager` belleğinden (+0x38, doğrulanmadı) |
| `InsertDBTableRow`, `EditDBTableField`, `DeleteDBTableRow*`, `ExecuteSQL`, `Write*` | Var | **Ham yazım; kullanılmayacak** (yalnızca `players` alanları LE'nin TABLE API'siyle) |

**Okuma yardımcıları:** `GetCurrentDate` (LE'nin `imports/other/helpers.lua`'sı da `CalendarManager+0x34` okuyor, bizim
bulgumuzla aynı), `GetUserTeamID`, `GetUserSeniorTeamPlayerIDs` (`cm_teamsheets`'ten), `IsPlayerLoanedOut`
(bellekteki LoansManager), `GetPlayerIDSForTeam`.

**Önemli alanlar** (`schema.json`):
- `players.modifier` (−5…+10): OVR'a eklenen gizli düzeltme. LE örnekleri OVR'ı değiştirirken bunu 0'lıyor.
- `players.growthprofile` (0…15): gelişim eğrisi profili; anlamı **DOĞRULANACAK**.
- `players.potential`, `overallrating` (1…127), tüm özellikler, `personality`, `emotion`, `isretiring`.
- Akademi: `career_youthplayers` (`playerid`, `playertier`, `potentialvariance`, `swinglowpotential`,
  `monthsinsquad`), `career_youthplayerposattributes` (yaş + pozisyon grubu başına özellik ve **potential** şablonu),
  `career_regenplayerattributes`, `career_birthingpool` (yüz/saç/ten havuzu).
- Maç: `fixtures` (ev/deplasman, yarışma, tarih), `rivals` (`teamid1/2`, `rivaltype`, yoğunluk), `competition`
  (`competitionimportance`), `cm_teamsheets` (`playerid0..`).
- Finans tablosu yok. `teams.clubworth`, `profitability`, `popularity` statik değerler.

**Düzeltme (TABLE iterasyonu):** iterasyon durumu (`current_record_idx`) TABLE **nesnesinde**. `LE.db:GetTable` her
çağrıda yeni nesne döndürdüğü için iki farklı tabloyu iç içe dolaşmak çalışır; **aynı nesneyi** iç içe dolaşmak
bozulur. Kural yine de geçerli: her tablo tek geçişte Lua tablosuna okunur, birleştirme Lua'da yapılır.

**Uyarı (bayat tablolar):** Ekim–Kasım 2029 snapshot'larında `transfers`, `playersuspensions` boş, `playerloans`
bayattı (data-dictionary.md). `fixtures`, `cm_teamsheets`, `career_youthplayers` gibi tabloların kariyer
sırasında güncellenip güncellenmediği **her biri için oyunda kontrol edilmeli**; aksi halde mod yanlış veriyle çalışır.

## 3. Ortak altyapı (Faz M0)

- **Loader** (`fcm_loader.lua`, autorun): `post__LEInitDoneEvent`'te mod'ları `require` eder, tek bir
  `post__CareerModeEvent` handler'ı kurar ve id'ye göre mod'lara dağıtır (`fc_export.lua`'daki "adıyla çağır" deseni:
  script yeniden çalışınca yeni kod devreye girer). `POST_LOAD_PREPARE`'de aktif save'in durumunu yükler.
- **Save başına durum:** `C:\FC 27 Live Editor\extensions\careers\<GetSaveUID()>\fcm_mods.json` (LE'nin kendi
  `players_development.json` kuralıyla aynı yer). Örnek: `{"goldenGen": {"lastSeason": 2028, "nextAt": 2032},
  "ffp": {"warnings": 2}, "boom": {"<playerid>": "late"}}`. Yazım tmp + `os.rename`. Durum, kariyer kaydedilmeden
  önce yazılabileceği için (save'le senkron değil) her kayıt bir **oyun tarihi** taşır; tarih save'deki oyun
  tarihinden ilerideyse (kaydetmeden çıkılmış) o kayıt yok sayılır.
- **Dry-run:** her mod'un `DRY_RUN = true` varsayılanı. Değişiklikler `C:\FCExport\mods\<mod>_<tarih>.csv`'ye
  (oyuncu, alan, eski, yeni) ve LE log'una yazılır. Tek seferlik script'lerde akış: dry-run → raporu incele →
  `DRY_RUN = false` ile tekrar çalıştır. Event mod'larında dry-run yalnızca loglar.
- **Yedek:** her yazan çalıştırmadan önce son `CmMgrC*` kaydı `C:\FCSaveBackup\<tarih>_<save8>\`'e kopyalanır
  (Lua `io` ile ikili kopya). Yedek alınamazsa yazma yapılmaz.
- **Yazma kuralı:** yalnızca `players` tablosundaki oyuncu alanları (`SetRecordFieldValue`) ve LE'nin
  `SetPlayerForm/Morale/Fitness`, `PlayerSetValueInDevelopementPlan` fonksiyonları. `teamplayerlinks`,
  `career_playercontract`, `cm_teamsheets`, `manager`, `teams` ve `career_*` tablolarına yazım yok; bellek `Write*` yok.
  Kod tabanında bu fonksiyonların çağrılmadığı grep ile kontrol edilir.
- **Gelişim planı:** kullanıcı takımındaki oyuncuda (`GetUserSeniorTeamPlayerIDs`) `PlayerHasDevelopementPlan`
  doğruysa her özellik yazımı `PlayerSetValueInDevelopementPlan` ile tekrarlanır; potansiyel yalnızca `players`'ta.

## 4. Mod'lar

### ★ Her takıma bir yıldız aday

| | A) Yeni oyuncu oluştur | B) Mevcut genci yükselt |
|---|---|---|
| API | `CreatePlayer` (**yok**), yerine `InsertDBTableRow` (`players`, `editedplayernames`) + `teamplayerlinks` satırı + `TransferPlayer` | `players` alanları (`SetRecordFieldValue`) + gelişim planı |
| Kadro tablosu | Yazılır (yasak) | Dokunulmaz |
| Görünüm, isim | `career_birthingpool`'dan yüz/saç/ten seçmek, `editedplayernames`'e isim eklemek gerekir; yüzsüz/garip oyuncu riski | Mevcut oyuncu, değişmez |
| Kadro limiti | Dolu kadroda transfer başarısız olabilir ya da limit aşılır | Etkilenmez |
| Save riski | Yüksek (DOC.MD bile `TransferPlayer` için uyarıyor) | Düşük-orta: yalnızca oyuncu değerleri |
| Geri alma | Zor (oyuncu silme `DeletePlayer` de yok) | Dry-run raporundaki eski değerlerle geri yazılabilir |

**Öneri: B.** A FC 27 LE'de ancak yasak ham yazımla yapılabilir.

B'nin tasarımı (tek seferlik script `fcm_star_prospects.lua`):
1. **Kapsam:** `leagueteamlinks` + `leagues` ile; varsayılan: milli takımlar (`isinternationalleague`), kadın ligleri
   (`iswomencompetition`), "Free Agents League" ve adı `[DO NOT USE]` içeren takımlar hariç. Seçili ligler listesi
   parametre. Kullanıcı takımı dahil/hariç parametre.
2. **Aday:** takımın kadrosundaki (`teamplayerlinks`, okuma) 17–21 yaş, kiralık olmayan (`IsPlayerLoanedOut`),
   emekli olmayan oyuncular. Pozisyon: takımın en zayıf pozisyon grubundaki (grup ortalama OVR'ı en düşük) gençler
   önce; yoksa en yüksek POT'lu genç. Aday yoksa takım raporda "aday yok" diye geçer.
3. **Hedef (parametrik):** `hedefOVR = max(MIN_OVR, takım ilk 11 ortalaması + uniform(5, 10))`, en fazla `MAX_OVR`;
   `hedefPOT = max(MIN_POT, hedefOVR + uniform(6, 12))`, en fazla 94. Varsayılanlar `MIN_OVR = 70`, `MIN_POT = 85`.
   Küçük liglerde takım ortalamasına göre ölçeklenir; 50 ortalamalı bir takıma 70'lik oyuncu, bir kerelik bir "yıldız"
   olur ama ligi bozmaz. Hedef, oyuncunun mevcut OVR'ının altındaysa dokunulmaz.
4. **Tutarlı özellikler:** `config/position-ratings.json`'daki pozisyon ağırlıklarıyla, oyuncunun ana pozisyon
   puanı hedef OVR'a eşit olacak şekilde özellikler oranlı artırılır (ağırlığı yüksek özellik daha çok). Kaleci
   özellikleri saha oyuncusunda yükseltilmez. Sonra `overallrating = hedefOVR`, `modifier = 0`,
   `potential = hedefPOT`. Script, ağırlıklardan hesaplanan OVR ile hedefi karşılaştırıp sapmayı raporlar.
5. **Rapor:** `C:\FCExport\mods\star_prospects_<tarih>.csv`: takım, lig, oyuncu, yaş, pozisyon, eski/yeni OVR ve POT,
   değişen özellikler. Uygulama aynı çalışmada yazılan eski değerleri de saklar (geri alma script'i bunu okur).
6. **Kendi takımın:** gelişim planı kuralı (bölüm 3).

Riskler ve açık sorular:
- **OVR yeniden hesaplanıyor mu?** Oyun `overallrating`'i aylık gelişimde özelliklerden yeniden hesaplıyorsa, yalnızca
  OVR'ı değiştirmek kalıcı olmaz; tutarlı özellik yükseltmesi bu yüzden şart. İlk denemede tek takım + bir ay ilerletip
  kontrol.
- Pozisyon ağırlıkları yaklaşık (`position-ratings.json` oyunla karşılaştırılmadı): oyun OVR'ı hedeften birkaç puan
  farklı çıkabilir.
- ~700 takım × ~35 alan ≈ 25k yazım, tek seferlik; oyun birkaç saniye donar.
- Değer ve maaş dengesi: oyuncunun maaşı/sözleşmesi değişmez; oyun ilk sözleşme yenilemesinde düzeltir.

### 4 — Finansal Fair Play
- **Ölçüm:** `MONTH_PASSED`'da kullanıcı takımının yıllık maaş yükü (`players.wage` × 52, kadro `teamplayerlinks`'ten)
  bütçeyle karşılaştırılır. Gelir verisi yok (`FinanceManager` örneği bulunamadı; `teams.profitability` statik);
  oran bu yüzden **maaş yükü / (transfer bütçesi + maaş bütçesi)** gibi bir vekil olur. Bütçe `BudgetManager`
  belleğinden (transfer +0x38 doğrulanmadı; maaş bütçesinin yeri bilinmiyor).
- **Yaptırım:** transfer yasağı API'si FC 27 LE'de yok (`cAddTransferBan`). Para cezası bütçe belleğine yazmak
  demek (ham bellek yazımı). **İlk sürüm yalnızca uyarı** (`MessageBox` + log, uyarı sayısı save durumunda).
- Risk düşük (yalnızca okuma). İş: S. Yaptırım ancak bütçe ofsetleri doğrulanıp bellek yazımına izin verilirse.

### 1 — Süper Lig yabancı kuralı
- **Ölçüm:** `ABOUT_TO_ENTER_PREMATCH` (37) anında maç kadrosu. Kaynak `cm_teamsheets` (`playerid0..`, ilk 11 +
  yedekler) ya da LE'nin `GetUserSeniorTeamPlayerIDs`'i. Yabancı = `players.nationality` ≠ ligin ülkesi
  (`leagues.countryid` → Türkiye 48). Limit parametrik (ör. maç kadrosunda en çok N yabancı).
- **Açık soru:** `cm_teamsheets` maç öncesi ekranda yaptığın değişiklikle güncelleniyor mu, yoksa bellekte mi?
  Oyunda dökümle kontrol edilecek. Güncellenmiyorsa kontrol "kadroda kayıtlı yabancı sayısı"na düşer.
- **Yaptırım:** maçı engellemek mümkün değil (event'i iptal edecek bir mekanizma yok). Uyarı ✅; ısrarda para cezası
  bütçe belleğine yazım (❓, FFP ile aynı engel).
- İş: M (teamsheet doğrulaması dahil).

### 3 — Patlama/sönme gelişim
- Gençlere (≤ 21) gizli özellik: `late` (geç açılan) ya da `early` (erken sönen); olasılık parametrik, seçim save
  durumuna yazılır (DB'ye değil).
- `MONTH_PASSED` (ve gerekirse `PLAYER_GROWTH` 53) sırasında: `late` oyuncularda 20–23 yaş arası POT ve ilgili
  özellikler +1…+3 (ayda en fazla bir kez); `early` olanlarda 23 yaştan sonra POT −1…−3. Değerler `players`'a,
  kullanıcı takımında gelişim planına da.
- **Açık sorular:** oyunun kendi gelişimi (`growthprofile`, aylık büyüme) bizim değişikliği ezip ezmediği;
  `PLAYER_GROWTH` event'inin ne zaman ve kimin için geldiği. Önce `growthprofile` dağılımı ve bir oyuncuda deneme.
- Risk: orta (yalnızca oyuncu değerleri). İş: M.

### 2 — Altın nesil akademi
- `SEASON_ENDED`'da zar: son altın nesilden beri 4–7 sezon geçtiyse olasılık artar; durum save JSON'unda.
- İki yol:
  - **a) Akademiye gelen oyuncuyu yükselt:** `YOUTH_PLAYER_ADDED_TO_YOUTH_ACADEMY` (109) sonrası
    `career_youthplayers`'taki yeni oyuncuların `players.potential`'ını (ve özelliklerini) yükselt. Yalnızca
    `players`'a yazar; tercih edilen.
  - **b) Üretim şablonunu geçici değiştir:** `career_youthplayerposattributes.potential`'ı altın nesil süresince
    yükselt, sonra geri al. `career_*` tablosuna yazım (kurala aykırı) ve etkisi bilinmiyor; önerilmez.
- **Açık sorular:** `career_youthplayers` kariyer sırasında güncel mi; akademi oyuncuları `players` tablosunda mı;
  `playertier`/`potentialvariance` anlamı.
- İş: M.

### 5 — Büyük maç psikolojisi
- Büyük maç: `fixtures`'ta bir sonraki maç (kullanıcı takımı) + `rivals` (derbi) ya da `competition.competitionimportance`
  (final/önemli maç). `fixtures`'ın güncelliği **DOĞRULANACAK**.
- `ABOUT_TO_ENTER_PREMATCH`'te kullanıcı takımında tecrübeye (yaş, `internationalrep`) göre `SetPlayerForm`/
  `SetPlayerMorale` ± küçük değer. **Rakip için yol yok:** DOC.MD bu fonksiyonları kullanıcı takımıyla sınırlıyor; rakibin
  formu `teamplayerlinks.form`'da (kadro tablosu, yasak). Rakibe etki ancak kendi takımına göreli bonusla.
- Risk düşük. İş: S.

### 6 — Hoca kovulma zinciri
- **Yapma.** LE'de hoca değiştiren bir fonksiyon yok; `manager.teamid`'e ve formasyon tablolarına ham yazım
  gerekir, kariyerin bellek durumu (yöneticiler, hedefler, haberler) bununla senkron olmaz. Save bozulma riski en
  yüksek madde. LE güncellemesinde bir API çıkarsa yeniden bakılır.

## 5. Oyunda doğrulanacaklar (le_capabilities / schema / deneme)

| # | Konu | Nasıl |
|---|---|---|
| 1 | **Doğrulandı (17.10.2026, M0/01):** autorun klasörü `C:\FC 27 Live Editor\lua\autorun`. LE v1+v2'yi başlattıktan hemen sonra çalışır (`LE` hazır, kariyer yok); `LEInitDoneEvent` ~40 sn sonra gelir (kariyer yine yok); `POST_LOAD_PREPARE` kariyer yüklenince. Loader `imports/career_mode/helpers`'ı kendisi `require` etmeli (`GetUserTeamID` oradan gelir). **Kopyalanan kayıt slotu aynı Save UID'yi taşıyor:** save başına durum dosyası slotlar arasında paylaşılır, durum kayıtları oyun tarihiyle ayırt edilmeli | M0/01 |
| 2 | `SetRecordFieldValue` ile yazılan `players` değerleri kaydedip yükleyince kalıcı mı | Tek oyuncu, kaydet → yeniden yükle |
| 3 | OVR özelliklerden yeniden hesaplanıyor mu; `modifier`'ın etkisi | Tek oyuncu, bir ay ilerlet |
| 4 | `PlayerSetValueInDevelopementPlan` FC 27'de çalışıyor mu | Kendi takımından bir oyuncu |
| 5 | `cm_teamsheets` maç öncesi canlı mı | `ABOUT_TO_ENTER_PREMATCH`'te döküm |
| 6 | `fixtures`, `career_youthplayers` güncel mi | Snapshot'a ekleyip iki ay karşılaştır |
| 7 | `growthprofile` anlamı, `PLAYER_GROWTH` event'inin sıklığı | Dağılım + event log |
| 8 | `SetPlayerForm/Morale` rakip oyuncuda (sessizce başarısız mı) | Deneme |
| 9 | `IsPlayerLoanedOut` FC 27'de doğru mu (LoansManager ofsetleri) | Bilinen kiralık oyuncu |
| 10 | Bütçe: `BudgetManager` +0x38 transfer bütçesi mi; maaş bütçesi nerede; `FinanceManager` | Transfer ekranıyla karşılaştırma, `fc_probe.lua` |
| 11 | Event handler'ın 3. argümanı (`event`) içinde oyuncu/takım var mı | `PLAYER_GROWTH`, `YOUTH_PLAYER_ADDED` dökümü |

`schema.json`'a bağlı: `players.modifier`/`growthprofile`/`potential` aralıkları, `career_youthplayers`,
`career_youthplayerposattributes`, `fixtures`, `rivals`, `competition.competitionimportance`, `cm_teamsheets`,
`leagues.isinternationalleague`/`iswomencompetition`/`countryid` (hepsi 2.11.2029 şemasında var).

## 6. Fazlar

- **M0 — Altyapı ve doğrulama:** loader, save durumu, dry-run/rapor, yedek; §5'teki 1–4 ve 9 numaralı denemeler.
- **M1 — Yıldız aday (B):** önce tek takım + bir ay ilerletme denemesi, sonra lig, sonra tamamı. Geri alma script'i.
- **M2 — FFP ve yabancı kuralı (yalnızca uyarı):** §5/5 ve §5/10 sonuçlarına göre.
- **M3 — Patlama/sönme:** §5/3 ve §5/7 sonrası.
- **M4 — Altın nesil (yol a):** §5/6 ve §5/11 sonrası.
- **M5 — Büyük maç (kendi takımın):** §5/6 (`fixtures`) ve §5/8 sonrası.
- **Yaptırımlar (para cezası) ve hoca kovulma:** yok; bütçe ofsetleri doğrulanıp bellek yazımına ayrıca izin
  verilirse yeniden değerlendirilir.

## Ek: M0 oyun içi doğrulama rehberi

Her script tek bir şeyi test eder ve sonucunu `C:\FCExport\m0\` altına yazar. Script'ler
`C:\FC 27 Live Editor\lua\scripts\` klasöründe (`m0_*.lua`, ortak dosyalar `fcm_common.lua`, `fcm_weights.lua`).
Kaynakları repoda: `exporter/lua/mods/`. Plan: yukarıdaki §5.

**Bütün testler ayrı bir test kayıt slotunda yapılır, asıl kariyerinde değil.**

### 0. Hazırlık (bir kez)

1. Asıl kariyerini oyunda kaydet ve oyunu kapat. Sonra yedek al:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\tools\backup-saves.ps1 backup -Label asil-kariyer
   ```
2. Oyunu `C:\FC 27 Live Editor\Launcher.exe` ile aç, asıl kariyerini yükle ve **yeni bir slota kaydet** (kaydetme ekranında boş
   bir slot seç). Bundan sonra yalnızca bu test slotunu yükle.
3. Ana menüye çık, test slotunun da yedeğini al (oyun menüdeyken alınabilir):
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\tools\backup-saves.ps1 backup -Label test-baslangic
   ```
   Bir şey bozulursa: oyunu kapat, `... backup-saves.ps1 list`, sonra `... backup-saves.ps1 restore <yedek-adı>`.
4. Script'te ayar değiştirmek: dosyayı Not Defteri'nde aç, ilk satırlardaki değeri değiştir (ör.
   `local DRY_RUN = true` → `false`), kaydet ve Lua Engine'de tekrar çalıştır. LE dosyayı her çalıştırmada yeniden okur.
5. "Kaydet → çık → yükle" her yerde şu demek: oyunda kaydet (test slotu), **ana menüye çık**, test slotunu yeniden yükle.

### Önerilen sıra

| Sıra | Script | Ne test eder | Yazar mı | Süre |
|---|---|---|---|---|
| 1 | `m0_01_autorun` | Autorun hangi klasörden çalışıyor | Hayır | oyun açılışı |
| 2 | `m0_10_budget` | Transfer ve maaş bütçesinin bellekteki yeri | Hayır | 2 dk |
| 3 | `m0_09_loans` | Güncel kiralık listesi bellekten okunabiliyor mu | Hayır | 2 dk |
| 4 | `m0_06_tables_fresh` | `fixtures`, akademi vb. tablolar güncelleniyor mu | Hayır | 3 çalıştırma |
| 5 | `m0_07_growth`, `m0_11_event_args` | `growthprofile`, `PLAYER_GROWTH`, event argümanları | Hayır | 4 ile birlikte |
| 6 | `m0_05_teamsheet` | Maç kadrosu tablosu maç öncesi canlı mı | Hayır | bir maç |
| 7 | `m0_02_write_persist` | `players`'a yazılan değer kaydet/yükle sonrası kalıcı mı | **Evet** | 5 dk |
| 8 | `m0_04_devplan` | Gelişim planına yazma çalışıyor mu | **Evet** | 5 dk |
| 9 | `m0_03_ovr_recalc` | Oyun OVR'ı özelliklerden yeniden hesaplıyor mu | **Evet** | 1 ay ilerletme |
| 10 | `m0_08_form_opponent` | Form/moral rakip oyuncuda çalışıyor mu | **Evet** | 2 dk |
| 11 | `fcm_star_prospects` | Yıldız aday, tek takımda | **Evet** | kaydet/yükle + 1 ay |

Her adımdan sonra bana haber ver; dosyayı ben okurum.

### 1. Autorun (`m0_01_autorun`)
Probe iki aday klasöre kopyalandı: `C:\FC 27 Live Editor\lua\autorun\` ve `C:\FC 27 Live Editor\lua\autorun\`.
1. Oyunu tamamen kapat, `C:\FC 27 Live Editor\Launcher.exe` ile aç.
2. Test slotunu yükle, kariyer ana ekranı gelince bekle.
3. Haber ver. `01_autorun.txt` hangi klasörden yüklendiğini ve `LEInitDoneEvent` / kariyer yükleme sırasını gösterir.
   Test bitince probe'u iki klasörden de kaldırırım.

### 2. Bütçe (`m0_10_budget`)
1. Kariyerde finans ekranına gir (transfer ve maaş bütçesinin göründüğü ekran). İki değeri tam sayı olarak not et
   (ör. 123.890.000 € → `123890000`; maaş bütçesi haftalık mı yıllık mı, ekranda ne yazıyorsa).
2. `m0_10_budget.lua`'nın başında `EXPECTED_TRANSFER` ve `EXPECTED_WAGE` değerlerini yaz, kaydet.
3. Lua Engine'de çalıştır.

### 3. Kiralıklar (`m0_09_loans`)
1. Çalıştır.
2. Oyunda kendi kadronda kiralık gönderdiğin oyuncuların listesine bak (ya da transfer merkezindeki kiralık
   oyuncular). 2–3 isim yaz; dosyadaki bellek listesiyle karşılaştıracağız.

### 4–5. Tablolar, gelişim, event'ler (`m0_06`, `m0_07`, `m0_11`)
1. Üçünü de bir kez çalıştır (07 ve 11 bu oturum için sayaç kurar; oyunu kapatana kadar çalışır).
2. Bir hafta ilerlet (en az bir maç oyna ya da simüle et), `m0_06_tables_fresh`'i tekrar çalıştır.
3. Ay değişene kadar ilerlet, `m0_06_tables_fresh`'i bir kez daha çalıştır.
4. Haber ver: `06_tables_fresh.txt`, `07_growth.txt`, `11_event_args.txt`.

### 6. Maç kadrosu (`m0_05_teamsheet`)
1. Çalıştır (şu anki kadro sayfasını döker).
2. Sıradaki maça git. Maç öncesi ekranda ilk 11'den bir oyuncuyu yedekle değiştir; kimi kiminle değiştirdiğini not et.
3. Maça başla (oynayabilir ya da simüle edebilirsin). Haber ver; değişikliği yazarsın, dosyayla karşılaştırırız.

### 7. Yazımın kalıcılığı (`m0_02_write_persist`)
1. Çalıştır (DRY-RUN). Dosyada seçilen oyuncu (senin ligindeki başka bir takımdan genç) ve iki değişiklik yazar.
2. `DRY_RUN = false` yap, tekrar çalıştır.
3. Oyunda oyuncuyu bul (transfer arama ekranında adıyla), profilinde dosyada yazan özelliğe bak.
4. Kaydet → çık → yükle. Script'i tekrar çalıştır: dosyada **KALICI** ya da **KALICI DEĞİL** yazar.
5. İstersen geri al: `RESTORE = true`, çalıştır.

### 8. Gelişim planı (`m0_04_devplan`)
1. Çalıştır (DRY-RUN): kendi takımından gelişim planı olan bir oyuncu seçer. X = `shortpassing` yalnızca tabloya,
   Y = `longpassing` tablo + plana +3 yazılacak.
2. `DRY_RUN = false`, çalıştır.
3. Oyunda oyuncunun özellik ekranında iki değere bak, not et.
4. Kaydet → çık → yükle, tekrar çalıştır ve ekrana yine bak. Bana dört değeri yaz (X ve Y, yüklemeden önce ve sonra).

### 9. OVR yeniden hesabı (`m0_03_ovr_recalc`)
1. Çalıştır (DRY-RUN): iki genç seçer. A'nın pozisyonundaki en önemli 4 özellik +6 (OVR'a dokunmadan),
   B'nin yalnızca OVR'ı +3.
2. `DRY_RUN = false`, çalıştır.
3. Oyunda iki oyuncunun OVR'ına hemen bak, not et.
4. Ay değişene kadar ilerlet, tekrar çalıştır. Dosya A'nın ve B'nin OVR'ının nasıl değiştiğini yazar.
5. İstersen `RESTORE = true` ile geri al.

### 10. Rakipte form/moral (`m0_08_form_opponent`)
1. Çalıştır (DRY-RUN), sonra `DRY_RUN = false` ile tekrar.
2. Oyunda iki oyuncunun (rakip ve kendi oyuncun) form ve moral göstergesine bak; değişeni bana yaz.

### 11. Yıldız aday, tek takım (`fcm_star_prospects`)
Bu adıma 7–9 geçtikten sonra geç.
1. Hangi takımda denemek istediğini bana yaz; id'sini ben veririm.
2. Script'in başında `TEAM_IDS = { <id> }` yap. Çalıştır (DRY-RUN), rapor `star_prospects.txt`'de: seçilen genç,
   eski/yeni OVR ve POT, değişen özellikler.
3. `DRY_RUN = false`, çalıştır. Oyunda oyuncunun profiline bak (OVR, POT, özellikler).
4. Kaydet → çık → yükle. `MODE = "verify"` yap, çalıştır.
5. Bir ay ilerlet, yine `MODE = "verify"` ile çalıştır.
6. Geri almak için: `MODE = "restore"`, `DRY_RUN = false`.

Tek takım denemesi geçerse (değerler kalıcı, OVR beklenen yerde) `ALL_TEAMS = true` ile önce DRY-RUN raporunu
birlikte inceleriz.
