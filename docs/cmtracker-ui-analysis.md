# CMTracker UI/UX & Mimari Analiz Raporu (FC 27 Transfer Market Projesi İçin)

> **Tarih:** 27 Ekim 2026  
> **İncelenen Hesap & Save:** `https://cmtracker.net/alima19?ci=6ae1017ca1e491988324c6c7`  
> **Kariyer:** Colchester United FC (Menajer: *A. Clamore*, Sezon: 26/27, Oyun Tarihi: 21 Temmuz 2026)  
> **Toplam Veri Tabanı:** 19.436 Oyuncu  
> **Ekran Görüntüleri Arşivi:** 27 adet tam çözünürlüklü ekran görüntüsü yakalandı ve yerel olarak incelendi (telif nedeniyle repoda tutulmuyor).

---

## 1. Tasarım Sistemi ve Arayüz Belirteçleri (Design Tokens)

CMTracker'ın başarısı; EA Sports FC yayın grafiklerini andıran fütüristik espor teması, neon reyting rozetleri ve klavye/gamepad odaklı hızlı gezinme deneyimidir.

### 1.1. Renk Paleti (Color Tokens)
* **Arka Planlar:**
  * Root Canvas (En alt zemin): `#111111` (`--cmt-black` / `--bg`)
  * Sub-Canvas (İkincil zemin): `#161616` (`--bg-2`)
  * Card / Surface Primary (Kart gövdeleri): `#1e1e1e` (`--surface-card`)
  * Card Hover (Üzerine gelince): `#232323` (`--surface-hover`)
  * Popovers / Slide-out Drawers (Çekmece ve modallar): `#2e2e2e` (`--surface-3`)
* **Kenarlıklar ve Çizgiler:**
  * Subtle Line (Hafif ayırıcı): `#2a2a2a` (`--line`)
  * Strong Line (Vurgulu ayırıcı): `#3a3a3a` (`--line-2`)
* **Vurgu Renkleri (Accents):**
  * Brand Primary (Blurple): `#5865f2` (soft neon parlama: `rgba(88,101,242,.18)`)
  * Pozitif / Onay / Mint Yeşili: `#1bc47d`
  * Uyarı / Kehribar Sarı: `#ffb020`
  * Tehlike / Negatif Kırmızı: `#ff6460`
  * Bilgi / Camgöbeği (Cyan): `#23cad0`
* **EA FC Reyting (OVR / POT) Rozet Renkleri:**
  * `90+` Dünya Yıldızı / Elit: `#12eb83` (neon zümrüt yeşili)
  * `80–89` Harika / Üst Düzey: `#14b341` (canlı çim yeşili)
  * `70–79` Ortalama / Süper Lig: `#ffd200` (parlak sarı)
  * `60–69` Alt Lig / Vasat: `#ff860a` (sıcak turuncu)
  * `<60` Zayıf: `#f84a46` (yumuşak kırmızı)

### 1.2. Tipografi (Typography)
* **Başlıklar ve Büyük Metrikler:** `"Tektur"`, sans-serif (EA Sports FC yayın fontuna çok benzeyen, köşeli fütüristik espor fontu).
* **Gövde Metinleri ve Tablolar:** `"Ubuntu Sans"`, `"Noto Sans"` (11-13px yoğun tablolarda okunurluğu en yüksek font).
* **Sayılar, Kodlar ve ID'ler:** `"Martian Mono"`, monospace (piyasa değerleri, maaşlar ve ID'ler için sabit aralıklı).

### 1.3. Şekiller & Geometri
* **Köşe Yuvarlama (Border Radius):**
  * Küçük butonlar/etiketler: `6px` (`--r-sm`)
  * Standart kartlar: `10px` (`--r-md`)
  * Büyük modallar/paneller: `14px` (`--r-lg`)
  * Pill / Filtre hapları: `999px`
* **Faceted (Kırık) Kart Köşeleri:** Kartların bir köşesi 45 derece kesik (`--cut: 14px`), konsol/oyun havası veriyor.

---

## 2. Sayfa ve Bileşen (Component) Mimarisi

### 2.1. Konsol Tarzı Navigasyon Bumper'ları (`[ Q ]` ve `[ E ]`)
Üst menüde 7 ana sekme bulunur; kullanıcı klavyeden `Q` ve `E` tuşlarına basarak menüler arasında anında kayabilir:
1. `HOME` (Kariyer Kontrol Paneli)
2. `SQUAD` (Kadro Yöneticisi, 2D Saha & Kartlar)
3. `YOUTH` (Gençlik Akademisi & Scout Ağı)
4. `TROPHIES` (Kupa Müzesi)
5. `SCOUT` (19.436 Oyunculu Canlı Veritabanı & Wonderkids)
6. `CHALLENGES` (Kariyer Meydan Okuma Takibi)
7. `COMMENTS` (Kullanıcı Yorumları)

---

### 2.2. HOME (Kariyer Kontrol Paneli) Bileşenleri
* **Hero Banner:**
  * Kulüp logosu, güncel lig sırası, oyun tarihi (`21 Temmuz 2026`), menajer adı (`A. Clamore`).
  * 3'lü mini metrik: Kulüp Genel Gücü (`66 OVR`), Transfer Bütçesi, Haftalık Maaş Bütçesi.
* **Match Calendar (Fikstür Şeridi):**
  * Gelecek 5 maçın takvimi, rakip logo, kupa/lig logosu ve zorluk derecesi.
* **Mini Taktik Sahası:**
  * 4-2-3-1 formasyonunda ilk 11 dizilimi, oyuncu mevkileri ve moral okları.
* **Transfer Market Widget (Canlı Akış):**
  * Dünyada son gerçekleşen 5 büyük transfer (Kulüpler, bonservis, oyuncu).
* **Sözleşmesi Bitenler (Expiring Contracts):**
  * Son 6 veya 12 ayı kalmış kritik kulüp oyuncuları için uyarı kartı.
* **Board Objectives (Yönetim Hedefleri & İş Güvencesi):**
  * Yönetim Güven İndeksi (0-100 gauge göstergesi) ve öncelikli hedefler (Genç gelişimi, finans, marka, lig başarısı).

---

### 2.3. SQUAD (Kadro Yöneticisi)
* **İki Farklı Görünüm Modu:**
  1. **Tablo Görünümü (List View):** Mevki, Forma No, Oyuncu Adı, Yaş, OVR, POT, Piyasa Değeri, Maaş, Sözleşme Bitiş, Form Durumu.
  2. **Kart Görünümü (FUT Style Grid):** Ultimate Team tarzı oyuncu kartları (fotoğraf, bayrak, kulüp arması, OVR/POT ve ana özellikler).
* **İnteraktif 2D Taktik Sahası:**
  * Seçili taktiğe (4-2-3-1) göre saha koordinatlarına yerleştirilmiş oyuncu pulları.
  * Pul üzerinde: Oyuncu vesikalığı, mevki etiketi, OVR ve POT rozeti, moral bonusu (`+1`, `+2`, `+5`).
  * Taktik Verileri: Oyun Kurma Tarzı (`Kısa Pas`), Savunma Derinliği (`25`), Duran Top Sorumluları (Kaptan, Penaltıcı, Sağ/Sol Serbest Vuruş, Kornerler).

---

### 2.4. PLAYER DETAILS (Derin Oyuncu İnceleme Ekranı)
*Örnek: Ronnie Harvey (18 yaş, Colchester United)*
* **Üst Profil Kartı:** Büyük yüz görseli, ülke bayrağı, kulüp arması, OVR / POT rozetleri, piyasa değeri ve sözleşme detayları.
* **Hexagon (6'lı Neon Radar Grafiği):**
  * Hız (Pace), Şut (Shooting), Pas (Passing), Top Sürme (Dribbling), Savunma (Defending), Fizik (Physicality).
  * 6 köşeli parlayan neon çizgiyle oyuncunun güçlü ve zayıf yönlerini bir bakışta gösterir.
* **FC 27 Taktiksel Rolleri (Tactical Roles):**
  * Örn: `Holding: Defend · Roaming · Ball-Winning` (FC 27'nin yeni taktiksel rol sistemi).
* **Rating by Position Matrix (Mevki Uygunluk Haritası):**
  * Mini saha üzerinde oyuncunun alternatif mevkilerde kaç OVR oynadığını hesaplar (ST: 58, CAM: 64, CDM: 67, CB: 65 vb.).
* **Projected Overall by Age Graph (Yaşa Göre Gelişim Eğrisi):**
  * 18 yaşındaki başlangıç noktasından 32 yaşına kadarki tahmini tavan gelişimini gösteren çizgi grafik (Örn: 18 yaş 62 OVR $\rightarrow$ 26 yaş 78 OVR $\rightarrow$ 32 yaş 80 OVR).
* **"Why This Value" (Değer Ayrıştırıcısı):**
  * Piyasa değerini oluşturan çarpanlar:
    * `Yaş: +%144` (Genç olduğu için dev prim)
    * `Potansiyel: +%43` (Tavanı yüksek)
    * `Maaş: -%15` (Düşük maaş çarpanı)
* **34 Nitelik Tablosu:**
  * Fiziksel, Zihinsel ve Teknik 34 özelliğin renkli barlarla detaylı dökümü.

---

### 2.5. SCOUT & WONDERKIDS (Canlı Arama & Filtre Motoru)
* **Veritabanı Boyutu:** Save içindeki **19.436 oyuncunun tamamı**.
* **Filtreleme Rayı (Gelişmiş Sol Panel):**
  * *Genel:* Uyruk, İkinci Uyruk, Bask Kökeni (Athletic Bilbao kuralı için!), Lig, Takım.
  * *Çekirdek:* Yaş aralığı (16-40), OVR aralığı, POT aralığı, Gelişim Farkı (POT - OVR), Gerçek Yüz (Real Face: Var/Yok), Beceri Hareketi (Skill Moves 1-5★), Zayıf Ayak (Weak Foot 1-5★), Serbest Kalma Bedeli (Release Clause).
  * *FC 27 Taktik & Tarz:* PlayStyle ve PlayStyle+ (AND / OR filtreleme), Hızlanma Tipi (Controlled, Explosive, Lengthy), Gelişim Profili (Erken Parlayan, Normal, Geç Açılan).
  * *34 Özellik:* Her özellik için min-max kaydırma çubukları (slider).
* **Wonderkids Sekmesi:**
  * Potansiyele göre azalan sırada dizilmiş liste. Bizim script ile eklediğimiz yıldızlar (Rio Ngumoha 95 POT, Ayyoub Bouaddi 94 POT, Dean Huijsen 94 POT) listenin zirvesinde yer alıyor.
* **Regen / Newgen Filtresi:**
  * Oyunda yapay zekanın ürettiği yeni oyuncuları ayıran `Generated Players` butonu.

---

### 2.6. WORLDWIDE TRANSFER MARKET (Canlı Transfer Çekmecesi)
* Sağdan kayarak açılan (slide-out drawer) global transfer paneli.
* Tüm dünyada sezon içinde gerçekleşmiş transferleri listeler:
  * Örn: Jurriën Timber $\rightarrow$ Barcelona ($96.0M)
  * Eric García $\rightarrow$ Manchester United ($92.7M)
  * Endrick $\rightarrow$ Tottenham ($76.0M)
* Filtreler: `All`, `Permanent (Bonservis)`, `Loan (Kiralık)`, `Free (Serbest)`.
* **Club Needs Radar (Kulüp İhtiyaçları):** Yapay zeka kulüplerinin hangi mevkide eksiği olduğunu ve transfer listelerinde hangi 5 oyuncunun bulunduğunu gösteren radar!

---

## 3. Bizim Uygulamanın Üstünlük Planı (CMTracker'da Olmayan Güçlerimiz)

CMTracker harika bir izleme aracıdır ancak **oyun dosyasına yazma yetkisi yoktur (read-only)**. Bizim Live Editor altyapımız ise oyunun RAM'ine doğrudan yazar. Bu bize benzersiz avantajlar sağlar:

| Özellik | CMTracker | **Bizim Projemiz (FC 27 Transfer Market)** |
| :--- | :--- | :--- |
| **Oyuna Müdahale** | YOK. Oyuna hiçbir şey gönderemez. | **VAR. Canlı TABLE API ile belleğe doğrudan yazar.** |
| **Tek Tıkla Transfer** | Yok (Oyunu açıp menülerde aramak zorundasın). | **Web sayfasında "Takımıma Al", "Sat", "Kovala" butonları anında oyuna işler.** |
| **Yıldız Potansiyeli Basma** | Yok. | **Oyuncunun profiline "Yıldız Yap (+88 POT)" butonu.** |
| **Efsane Regen Avcısı** | Sadece "Generated players" filtreler. | **Otomatik Efsane Dedektörü:** Emekli olan Messi, Ronaldo, Modric'i doğum günü, mevki ve ülkesinden eşleştirip anında haber verir. |
| **Reklamlar / Sponsorlar** | Rainbet, Eneba kumar/bahis bannerları dolu. | **%100 Reklamsız, tertemiz yerel uygulama.** |
| **Senkronizasyon Süresi** | Ücretsiz üyelikte 30 dakika gecikmeli. | **Yerel dosya dinleyiciyle anında sıfır gecikme.** |

---

## 4. Uygulama Yol Haritası (Sonraki Adımlar)

1. **Frontend Tema Güncellemesi:**
   * Tailwind CSS veya CSS Variables ile `#111111` zemin, `#1e1e1e` kartlar ve Tektur font ailesi kurulacak.
2. **Q / E Klavye Dinleyicisi:**
   * Global `keydown` hook'u eklenerek klavyeden `Q` ve `E` ile sekmeler arası geçiş sağlanacak.
3. **Kadro 2D Saha Bileşeni:**
   * SVG / Canvas tabanlı 4-2-3-1 saha dizilimi, oyuncu pulları ve OVR/POT rozetleri eklenecek.
4. **Hexagon Radar & Gelişim Grafiği:**
   * Chart.js / Recharts ile 6'lı özellik radarı ve yaşa göre OVR projeksiyon eğrisi eklenecek.
5. **Oyuna Yazma Aksiyon Butonları:**
   * Kartların üzerine *"Transfer Et"*, *"Potansiyeli 90 Yap"*, *"Sözleşme Yenile"* butonları yerleştirilip Live Editor API'sine bağlanacak.
