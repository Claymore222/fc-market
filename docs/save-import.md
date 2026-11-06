# Kariyer kaydı okuma ve senkron

**29.10.2026 güncellemesi:** Normal görünüm son okunmuş kayıttır; kaydedilmemiş export ayrı önizlemede tutulur.
Kaynak başına hata yalıtımı, yeniden deneme ve aynı-ID revision yenilemesi uygulanmıştır. Güncel kullanım ve
testler: [sync-hardening-2026-10-29.md](sync-hardening-2026-10-29.md). Aşağıdaki günlük otomasyon isteğe bağlıdır;
kullanıcının mevcut kurulumunda kapalıdır.

Kariyer kaydının (`CmMgrC*`) formatı, okuyucu (`tools/saveimport`), export ile birleştirme ve otomatik senkron. Alan düzeyindeki doğrulamalar: [data-dictionary.md](data-dictionary.md).

## Uygulama doğrulaması (28.10.2026)

- [x] S1: `CmMgrC20261024175128313` (17.07.2030), referans
  `84af764b_20300717_174946`: players 3.583.096, teams 92.510,
  teamplayerlinks 405.008 alan; toplam 4.080.614 / 4.080.614 **%100 eşleşme**.
- Önemli düzeltme: ham dosyadaki 9 bayt görünen tanımlar Zstandard literal
  parçalarıdır. İlk Zstandard frame açılınca 17.632.769 bayt payload, 212.023 ve
  1.001.703 ofsetlerinde standart T3DB, 36 bayt tablo başlığı ve 16 bayt alan
  tanımları çıkar. Sıkıştırılmış DB ofsetleri üzerinden okumak yanlıştır.
- En yeni yuva (28.10) başka kariyer: `8d24c146…`, 09.08.2026, takım 1935.
  15.10 ve 24.10 yuvaları `84af764b…` UID'sini paylaşır; slot/dal ayrımı gerekir.
- S1 testleri: 6 Python, 133 backend, 13 Playwright başarılı. Çalışan API'nin
  exe kilidi nedeniyle backend testleri `dotnet test --artifacts-path
  C:\dev\fc27LiveEditorTransferMarket\scratch\dotnet-tests` ile ayrı derlendi.
- [x] S2: birleşik importer, klasör izleme, içerik adresli yedek, kaynak ve
  revision, yuva/dal ayrımı. Gerçek 3 yuva + 4 export aktarımı: 2 UID, 3 yuva,
  4 birleşik snapshot. 17.07.2030 tek snapshot, iki kaynak, 36.916.049 transfer
  bütçesi korunuyor. Tekrar çalıştırma 0 export/0 save; SQLite integrity_check=ok.
  Kanıt DB: `scratch/saveimport/integration.db` (oyun verisi, git dışı).
- Slot anahtarı `(LE UID, kayıt başlığı)`; aynı başlıkla açılan ayrı yuvalar
  otomatik ayırt edilemez. Ayrı başlık kullanılmalı. LE UID bulunmazsa yerel
  slot kimliği kullanılır, export'a tahmini eşleme yapılmaz.

## Otomatik senkron (28.10.2026)

| Kaynak | Ne zaman | Ne yapar |
|---|---|---|
| Kariyer kaydı (`CmMgrC*`) | Oyun kaydettiğinde (otomatik kayıt / çıkış) | Tam snapshot + fikstür, canlı tablo, oyuncu istatistikleri |
| Günlük export (`fc_export.lua` 0.5.0, `auto_day`) | Her `DAY_PASSED` (kayıt hazırlığında değilken, günde bir) | Kullanıcının kadrosu, ligindeki takımların oyuncuları ve `watchlist.txt` (shortlist; backend yazar): `players`, `teamplayerlinks`, maç puanları + bütçe/tarih. Manifest'te `partial: true` |
| Aylık export (`auto_month`) | Ay değişince | Her şey (değişmedi) |
| Sıklık (0.7.0) | Ayarlar → Export sıklığı, `C:\FCExport\export_schedule.txt` | `daily`, `weekly`: hafif export + ay başı tam; `monthly` (varsayılan): yalnız ay başı; `quarterly`: Ocak/Nisan/Temmuz/Ekim. Oturumun ilk günündeki tam export her modda alınır |

Birleştirme (`tools/saveimport/store.py import_partial`): günlük export, aynı kariyerin o güne kadarki son tam snapshot'ının
kopyası üzerine oyuncu bazında yazılır; kariyer/dal başına tek **kayan** günlük snapshot tutulur (veritabanı şişmesin diye; tam
snapshot ~35 MB). Takip edilen oyuncuların günlük OVR/POT/kulüp değerleri `player_daily`'de kalır ve oyuncu geçmiş grafiğine
eklenir. Aynı gün tam veri (kayıt ya da ay başı) varsa günlük atlanır. Eski importer (`exporter/tools/importer.py`) kısmi
export'ları yok sayar. Masaüstü uygulaması kayıt klasörü varsa birleşik izleyiciyi (`python -m tools.saveimport watch`, 10 sn)
başlatır. **Oyunda denenecek:** günlük export'un donma süresi (log: "Günlük export bitti … sn").

Yeni kayıt yuvası (01.11.2026): aynı kariyerin yeni yuvası, o güne kadarki en yeni daldan `fork_date` ile ayrılır; eski dallar değiştirilmedi. Günlük export tabanı, en son yazılan tam verinin dalından seçilir.

## Bulgular

### Kayıt dosyaları

- Yer: `%LOCALAPPDATA%\EA SPORTS FC 27\settings\CmMgrC<tarih>` (her kariyer yuvası ayrı dosya, sabit 15 793 835 bayt).
  CMTracker Live aynı klasörü izliyor ve `Career_Mode_Tracker_LIVE_Backups` altına yedek alıyor.
- Başlık: `FBCHUNKS` kapsayıcısı + kayıt adı ("Kariyer Modu - Teknik Direktör İlerlemesi 2") + oyuncu adı.
- İçerik (~5,5 MB dolu, gerisi sıfır):

| Bölge | İçerik | Okunabilirlik |
|---|---|---|
| DB 1 (`DB\0\x08`, 17 tablo) | `career_teamofweek`, `career_playerawards`, `career_playergrowthuserseason`, `career_playermatchratinghistory`, `career_managerawards`, `career_youthplayers`, `career_scouts`, `career_scoutmission`, `persistent_events`, `cm_teamsheets`, `clubcoefficients`, `nationcoefficients`… | Çözülebilir |
| DB 2 (`DB\0\x08`, 27 tablo) | `players`, `teams`, `teamplayerlinks`, `leagueteamlinks`, `manager`, `formations`, `default_teamsheets`… (kariyerde değişen ana tablolar) | Çözülebilir |
| `BNRY` "cds" bloğu | Yarışma ağacı, fikstür/sonuç, canlı tablo, oyuncu istatistikleri (çözüldü, data-dictionary "Kariyer kaydındaki kariyer blokları"); e-posta/haber, moral, finans, yönetim (çözülmedi) | Kısmen |

### Veritabanı formatı

- Klasik EA "T3DB": tablo dizini (4 harfli kısa ad + konum), her tabloda alan tanımları ve bit düzeyinde paketlenmiş kayıtlar.
- Kısa adlar ↔ gerçek adlar: FC 26 meta dosyası (`fifa_ng_db-meta.xml`) FC 27 kaydındaki tablo adlarını doğru çözüyor
  (`lyxL` = teams, `CZUM` = players…); alanların bit genişlikleri de birebir aynı.
- FC 27: kayıt Zstandard ile sıkıştırılmış; açılan ilk çerçevede standart T3DB v8 (36 bayt tablo başlığı, 16 bayt alan
  tanımı). Sıkıştırılmış veride görünen "9 baytlık tanımlar" yanıltıcıdır (ilk araştırmadaki hata).
- Referans: MIT lisanslı [fc26-mcp](https://github.com/INSANE0777/Fc26-live-editor-mcp) FC 26 kadro/kariyer dosyalarını
  okuyor (format bilgisi ve meta dosyası için). Kodunu kopyalamadan kendi okuyucumuzu yazarız; meta XML lisansı kontrol edilir.
- İsim tabloları ve ligler/ülkeler gibi değişmeyen tablolar kayıtta yok: bunlar export'tan (zaten var) ya da oyunun
  kadro dosyasından gelir.

### Export ile karşılaştırma (17.07.2030 doğrulaması)

Live Editor export'unda `fixtures`, `leagueteamlinks` sıra/puanı ve `prevcompetitionstats` başlangıç verisinde kalıyor
(data-dictionary.md). Kayıttaki DB 2'deki `leagueteamlinks` güncel mi, ilk iş olarak bakılacak; değilse güncel tablo
BNRY bloğunda.

## Mimari

```
Oyun ── kayıt (CmMgrC*) ──► saveimport (salt-okunur kopya) ──┐
   └─ Live Editor ── fc_export.lua ── C:\FCExport ──► importer ──┴─► fc_career.db (snapshot + kaynak) ──► API / arayüz
```

- **Yeni araç `tools/saveimport/`** (Python; `exporter/` değişmez): kayıt klasörünü izler, dosyanın kopyasını alır
  (oyunun dosyasına asla yazmaz, kilitlemez), DB 1/DB 2 tablolarını `raw_*` biçiminde mevcut `fc_career.db`'ye yazar.
- **Kaynak ve birleştirme:** `snapshots.source` = `export` | `save`. Aynı kariyer ve aynı oyun gününde iki kaynak varsa
  tek snapshot: kariyer tabloları kayıttan, bellekte okunan alanlar (bütçe vb.) export'tan. Çakışan alanlar için kural
  tablosu `config/save-map.json`'da.
- **Ayrı kariyerler:** her `CmMgrC` dosyası bir kariyer yuvası; kimlik kayıttaki kariyer kimliğinden (`career_users`/
  başlık) ve LE'nin `GetSaveUID` değeriyle eşlenir. Mevcut dal (branch) sistemi aynen kullanılır; arayüzdeki kariyer
  seçici kayıttan gelen kariyerleri de listeler.
- **Alan adları:** kısa ad → ad eşlemesi meta dosyasından; BNRY'den çözülen her alan `config/save-map.json`'da sürüm ve
  "DOĞRULANACAK" notuyla.

## Aşamalar (S1–S6)

| Faz | İş | Kabul |
|---|---|---|
| S1 | FC 27 T3DB okuyucu (Zstandard açma, tablo başlığı, alan tanımları, kayıtlar); testler örnek dosya parçalarıyla | Aynı oyun günündeki kayıt ve LE export'u için `players`, `teams`, `teamplayerlinks` alanlarının ≥ %99,9'u aynı |
| S2 | `saveimport` → `fc_career.db`: snapshot, kaynak sütunu, kariyer kimliği, klasör izleme, yedek kopya | İki farklı kariyer yuvası ayrı kariyer olarak görünür; aynı gün export + kayıt tek snapshot olur |
| S3 | Kayıttaki ek tablolar arayüzde: haftanın takımı, sezon ödülleri kazananları, oyuncu gelişim geçmişi, maç puanları, menajer ödülleri | Home'daki "Haftanın takımı", "Ödül yarışı", oyuncu gelişim grafiği CMTracker ile aynı oyuncuları gösterir |
| S4 | BNRY araştırması (zaman sınırlı, alan alan): fikstür ve sonuçlar, takvim, lig tablosu, oyuncu sezon istatistikleri, moral, finans, yönetim hedefleri/iş güvencesi, menajer karnesi | Her alan için: aynı kayıt CMTracker'a da yüklenir, değerler birebir; en az 3 farklı oyun gününde tutar |
| S5 | Arayüzde kalan boş kartların doldurulması ve "export'ta yok" metinlerinin kaldırılması | CMTracker Home'daki 9 bölümün tüm kartları veriyle dolu |

S4 yöntemi: art arda oyun günlerinde kayıt al → blokları karşılaştır → değişen baytları bilinen değerlerle eşle
(CMTracker'ın gösterdiği moral 52, bütçe 60 M, maç skorları vb.). Her çözülen yapı test dosyasıyla sabitlenir.

### Moral ve finans (29.10.2026, `tools/saveimport/career.py`)

Kaynak: CMTracker'a yüklü Fenerbahçe 17.07.2030 kaydı (`CmMgrC20261024175128313`), CMTracker'ın gösterdiği değerlerle
birebir; 9 kayıtta (3 kariyer) tek eşleşme. Para birimi oyunda EUR; CMTracker dolara çeviriyor (×1,14).

- **Moral** (`career_playermorale`, yalnız kullanıcı takımı): u32 oyuncu sayısı + oyuncu başına 67 bayt
  (`[01][playerid][mizaç u32 0–4]`, +24 takım performansı, +28 oyuncu performansı, +40 sözleşme, +44 moral, +52 oynama süresi;
  +32/+36 bilinmiyor) ve kayıt sonunda u32 olay sayısı + olaylar (`CM_Morale_Update_PlaytimeUnhappy` gibi; biçim tek örnekten).
- **Bütçe** (`career_finance`): `01 01 01` ardından i64 kasa (DOĞRULANACAK), i64 sezon başı transfer bütçesi, u32 sezonluk
  maaş bütçesi, u32 bilinmiyor, `01`, u32 haftalık maaş boşluğu, u32 kalan maaş bütçesi (her hafta maaş kadar azalır), u32
  kalan transfer bütçesi. 17.07.2030'da 52,6 M€ / 36,9 M€ / 319,9 B€ = CMTracker 60,0 M$ / 42,1 M$ / 364,6 B$; LE bütçesiyle aynı.
- **Son finans hareketleri** (`career_transactions`): 17 bayt `[u32 sıra][i32 tutar][u32 tür][u32 tarih][u8 gelir]`. Türler
  13 forma satışı, 16 oyuncu maaşları, 18 personel maaşları, 22 diğer (field-map `transactionKinds`); diğer türler DOĞRULANACAK.
- **Dünya ve kulüp transfer geçmişi (Çözüldü — 31.10.2026, `career_transfers`, `BLOCK_VERSION = 9`):** 31 baytlık Dünya Transfer Tablosu (`\x01` + `u32 adet` + `[01 01][u32 bonservis EUR][u32 tarih yyyymmdd][u32 yeni_kulüp][u32 oyuncu_id][u32 sıra][u32 eski_kulüp][u32 haftalık_maaş][u8 bayrak][u32 serbest_kalma_bedeli]`) ve `_BUDGET` önündeki `q - 325` ofsetinde 10×25 baytlık Kullanıcı Kulübü Transfer Halkası (`[u32 slot_id][u32 tarih][u32 bonservis][u32 karşı_kulüp][u32 oyuncu_id][u32 maaş][u8 yön: 1=alış, 0=satış, 2=serbest]`). `career_transfer_archive` tablosu sezon geçişlerinde sıfırlanan dünya tablosunu sezon etiketiyle (`2026/27`, `2029/30`, `2030/31`) kalıcı olarak saklar.
- **Eski ipucu (yukarıda çözüldü):** bütçe bloğunun hemen önünde kullanıcı kulübünün bu sezonki transferleri: `ff ff ff ff`, u32 tarih,
  u32 bonservis (EUR), u32 kulüp, u32 oyuncu, u32 maaş(?), u8 (ör. 31.08.2029 Kroupi 90 M€). Önündeki `ff..`/`01 01 01`
  ayraçlarıyla başka listeler (maaş geçmişi: tarih, haftalık maaş toplamı, oyuncu sayısı).
- **Menajer karnesi (sezon):** kayıtta ayrı alan yok; oyunun Kariyer Özeti (O-G-B-M, A-Y, en farklı galibiyet/mağlubiyet) bu
  sezonun oynanmış fikstürlerinden (hazırlık dahil) hesaplanıyor. Gençlerbirliği'nde 3 ardışık kayıtta oyunun ekranıyla birebir
  (3-2-0-1 6-5 → 4-2-1-1 8-7 → 5-2-2-1 8-7). Önceki sezonların karnesi kayıtta bulunamadı.
- **Aranıp bulunamayanlar (29.10.2026):** iş güvencesi (74; geçmiş sezonlar 75, 47), menajer sezon karnesi (G-B-M, puan, gol;
  ör. 2029/30 33-12-7, 111 puan, 94-50) — bayt/u16/u32/float ve yıl anahtarlı aramalarla tek anlamlı eşleşme çıkmadı; büyük
  ihtimalle bit alanlı. Sonraki yöntem: bir maçtan önce ve sonra alınan iki kayıtta değişen baytları karşılaştırmak.
- **Henüz yok:** CMTracker'ın sezon gelir/gider toplamları ve kategori kırılımı (kayıtta toplam alanı bulunamadı), iş güvencesi
  (74), yönetim hedefleri, menajer karnesi, ceza/kart sayıları, hazırlık turnuvası davetleri, maç günü bilgisi (hava, yedek sayısı).

## Görseller: yüz, arma, bayrak, oyun stili ikonları (S6)

Kayıtta görsel yok; oyunun kendi dosyalarında var. Live Editor'ün "legacy file" listesinde
(`C:\FC 27 Live Editor\extensions\legacy_filename_hash_list.csv`, 645 kayıt, tam liste değil):

| Görsel | Oyundaki yol | Not |
|---|---|---|
| Oyuncu yüzü (miniface) | `data/ui/imgAssets/heads/p<playerid>.DDS` | Her oyuncuda yok; yoksa siluet (CMTracker da öyle) |
| Arma | `data/ui/imgAssets/crest/dark/l<teamid>.dds`, `crest50x50/dark/…` | Açık tema için `light` klasörü de olabilir (denenecek) |
| Bayrak | `data/ui/imgAssets/flagsSmall/f_<nationid>.dds` | Şimdiki `flag-icons` yerine oyunun bayrağı |
| Oyun stili ikonu | Listede yok | `LegacyFileExist` ile aday yollar denenir; bulunamazsa kendi SVG ikon setimiz (EA ikonu kopyalanmaz) |

Yöntem: LE Lua API'sinde `LegacyFileExist` ve `LegacyFileExport` var (le_capabilities.txt). Yeni bir script
(`exporter/lua/fc_assets.lua`, **exporter/ değişikliği → kullanıcı onayı gerekir**):
1. Önce imzayı `pcall` ile dener ve log'a yazar (dokümantasyon yok).
2. Kullanıcının ligi + izlenen oyuncular + tüm takımlar için yüz/arma/bayrak dosyalarını `C:\FCExport\assets\` altına
   çıkarır; olmayanları atlar. Oyuna yazmaz.
3. `tools/saveimport` (ya da ayrı `tools/assets`) DDS → PNG/WebP çevirir (Pillow 13, BC1/BC3/BC7), backend'in
   `faces/` klasörüne ve yeni `crests/`, `flags/` klasörlerine koyar. API zaten `hasFace` döndürüyor; arma ve bayrak
   için aynı desen.

Görseller yalnız kullanıcının bilgisayarında kalır, depoya girmez, dağıtılmaz. CMTracker'ın CDN'i kullanılmaz.

**Uygulama (28.10.2026):** `exporter/lua/fc_assets.lua` 0.1.0 (kullanıcı onayıyla) ve `python -m tools.assets convert
C:\FCExportssets` hazır; API `/api/teams/{id}/crest`, `/api/nations/{id}/flag` (repo kökü `crests/`, `flags/`, git dışı),
arayüz arma/bayrağı varsa oyunun görselini, yoksa eski çizimi gösterir. Oyun stilleri şimdilik kendi altıgen ikon setimizle
(grup başına; stil+ altın). **Oyunda çalıştırıldı (28.10.2026, 17.07.2030 kaydı):** imza doğrulandı; 9.751 dosya çıkarıldı ve
PNG'ye çevrildi (8.695 yüz 180×180, 839 arma 256×256, 217 bayrak 60×40), 1.686 oyuncunun oyunda yüzü yok (siluet).
Oyun stili ikonları denenen legacy yollarda bulunamadı; kendi ikon setimiz kalıyor.

## Kapsam dışı

- Oyuna ya da kayda yazma: yok (CLAUDE.md). Araç yalnız kopyayı okur.

## Riskler

- **Oyun güncellemeleri** formatı değiştirebilir (FC 26 → 27'de alan tanımı değişti). Önlem: sürüm tespiti, tanınmayan
  formatta export'a geri dönüş, testlerde örnek kayıt parçaları.
- **BNRY bloğu** belgesiz; bazı alanlar hiç çözülemeyebilir. S1–S3 buna bağlı değil, tek başına değer üretir.
- **Lisans/hukuk:** kullanıcının kendi kayıt dosyası, yerelde okunur; dışarı gönderilmez. EA verisi dağıtılmaz.
- **Disk/performans:** kayıt 15,8 MB; okuma < 1 sn hedef. Kopya ve geçmiş için saklama süresi ayarı.
