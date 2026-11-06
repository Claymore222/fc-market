"""FC 27 kariyer kaydındaki veritabanı dışı kariyer blokları (BNRY "cds" içinde): yarışma ağacı, fikstür/sonuçlar,
canlı puan tablosu ve oyuncu sezon istatistikleri.

FC 26'daki kayıt düzenleri (eafc-db-kit docs/career-data.md, MIT) FC 27'de korunmuş; bloklar etiketle değil kayıt
desenleriyle bulunur. Oyuncu istatistiği kaydı FC 27'de 64 bayt ve bazı alanlar kaymış (bit konumları aşağıda, 17.10.2029
kaydında takım toplamlarıyla doğrulandı). Tümü salt-okunur; tanınmayan blok boş liste döndürür.
"""
from __future__ import annotations

import re
import struct

COMP, FIXTURE, STANDING, STAT, MORALE = 49, 22, 23, 64, 67
STAT_GAP, STAT_END_GAP = 48, 64
_FF01 = re.compile(b"\xff\x01", re.S)


def _u16(b, o): return struct.unpack_from("<H", b, o)[0]
def _u32(b, o): return struct.unpack_from("<I", b, o)[0]
def _i32(b, o): return struct.unpack_from("<i", b, o)[0]


def _comp_ok(b, o):
    return (o + COMP <= len(b) and b[o] == 0xFF and b[o + 1] == 1 and _u16(b, o + 2) == _u16(b, o + 4)
            and 1 <= b[o + 6] <= 5 and 32 <= b[o + 9] < 127)


def _fixture_ok(b, o):
    return (o + FIXTURE <= len(b) and b[o] in (0, 0xFF) and b[o + 1] == 1 and 19000101 <= _u32(b, o + 7) <= 21001231
            and b[o + 21] <= 3)


def _standing_ok(b, o):
    return o + STANDING <= len(b) and b[o] in (0, 0xFF) and b[o + 1] == 1 and _u16(b, o + 2) >= 1


def _run(b, start, size, ok):
    o = start
    while ok(b, o + size):
        o += size
    return (o - start) // size + 1


def _find(b, size, ok, need, start=0):
    """need ardışık geçerli kaydın başladığı ilk konum (FF 01 adayları üzerinden)."""
    for m in _FF01.finditer(b, start):
        o = m.start()
        if all(ok(b, o + size * k) for k in range(need)):
            return o
    return None


def competitions(b: bytes) -> list[dict]:
    rows, start = [], 0
    while (o := _find(b, COMP, _comp_ok, 3, start)) is not None:
        n = _run(b, o, COMP, _comp_ok)
        for i in range(n):
            q = o + COMP * i
            rows.append({"compid": _u16(b, q + 2), "level": b[q + 6], "parentid": _u16(b, q + 7),
                         "code": b[q + 9:q + 16].split(b"\0", 1)[0].decode("ascii", "replace"),
                         "namekey": b[q + 16:q + 49].split(b"\0", 1)[0].decode("ascii", "replace")})
        start = o + COMP * n
    return rows


def _fixture(b, q):
    return {"fixtureindex": _u16(b, q + 2), "compid": _u16(b, q + 4), "round": b[q + 6], "date": _u32(b, q + 7),
            "time": _u16(b, q + 11), "homeslot": _u16(b, q + 13), "homegoals": b[q + 15], "homepens": b[q + 16],
            "awayslot": _u16(b, q + 17), "awaygoals": b[q + 19], "awaypens": b[q + 20], "status": b[q + 21]}


def fixtures_and_standings(b: bytes, compids: set[int] | None = None) -> tuple[list[dict], list[dict], int | None]:
    """Fikstür ve puan tablosu kayıtları; üçüncü değer puan tablosu bloğunun sonu (istatistik bloğu bunun ardında).
    compids: bilinen yarışmalar; verilirse ana bloğun dışındaki küçük yarışma blokları da okunur."""
    fixtures, start, covered = [], 0, []
    while (o := _find(b, FIXTURE, _fixture_ok, 30, start)) is not None:
        n = _run(b, o, FIXTURE, _fixture_ok)
        covered.append((o, o + FIXTURE * n))
        fixtures += [_fixture(b, o + FIXTURE * i) for i in range(n) if b[o + FIXTURE * i] == 0xFF]
        start = o + FIXTURE * n
    # Ana bloktan ayrı duran küçük yarışmalar (ör. hazırlık turnuvası CRTR, 12 maç; ardında boş slotlar): sıra numarası
    # 1'den ardışık, aynı ve bilinen yarışmaya ait en az 2 kayıt.
    if compids:
        def same_block(q, k, cid):
            return _fixture_ok(b, q) and b[q] == 0xFF and _u16(b, q + 2) == k + 1 and _u16(b, q + 4) == cid
        for m in _FF01.finditer(b):
            o = m.start()
            if any(a <= o < z for a, z in covered) or not _fixture_ok(b, o) or _u16(b, o + 2) != 1:
                continue
            cid = _u16(b, o + 4)
            if cid not in compids or not same_block(o + FIXTURE, 1, cid):
                continue
            n = 1
            while same_block(o + FIXTURE * n, n, cid):
                n += 1
            covered.append((o, o + FIXTURE * n))
            fixtures += [_fixture(b, o + FIXTURE * i) for i in range(n)]
    # Sıra numarası 1'den ardışık giden en az 30 kayıt (rastlantısal FF 01'leri eler)
    o = next((m.start() for m in _FF01.finditer(b) if all(
        _standing_ok(b, m.start() + STANDING * k) and _u16(b, m.start() + STANDING * k + 2) == k + 1 for k in range(30))), None)
    standings, end = [], None
    if o is not None:
        n = _run(b, o, STANDING, _standing_ok)
        end = o + STANDING * n
        for i in range(n):
            q = o + STANDING * i
            if b[q] != 0xFF:
                continue
            h, a = b[q + 11:q + 16], b[q + 16:q + 21]
            standings.append({"standingindex": _u16(b, q + 2), "groupid": _u16(b, q + 4), "teamid": _i32(b, q + 6), "slot": b[q + 10],
                              "homewins": h[0], "homedraws": h[1], "homelosses": h[2], "homegf": h[3], "homega": h[4],
                              "awaywins": a[0], "awaydraws": a[1], "awaylosses": a[2], "awaygf": a[3], "awayga": a[4],
                              "points": b[q + 21]})
    return fixtures, standings, end


# Oyuncu istatistiği (64 bayt, LSB önce bit alanları). FC 26'dan farklı konumlar 17.10.2029 kaydında doğrulandı;
# yellow/red ve cleansheets daha zayıf (DOĞRULANACAK). Maçın adamı ve kurtarış çözülmedi.
STAT_BITS = {"teamid": (16, 18, -1), "playerid": (34, 19, -1), "compid": (53, 11, 0), "minutes": (65, 15, 0),
             "ratingtotal": (80, 12, 0), "goals": (104, 9, 0), "yellowcards": (113, 6, 0), "redcards": (120, 5, 0),
             "appearances": (125, 7, 0), "assists": (139, 8, 0), "goalsconceded": (162, 8, 0), "cleansheets": (170, 6, 0)}
# Kaydın kuyruğunda oyuncunun o yarışmadaki son maçları: 68 bitlik beş dönen slot. Sıra sabit değil, tarihle sıralanır.
# Tarih 2000 yılından fark olarak YYMMDD. 01.11.2026 belleğiyle 20/20 oyuncuda tutuyor; simüle maçlar her zaman yazılmıyor.
MATCH_SLOTS = (179, 247, 315, 383, 451)
MATCH_BITS = {"date": (0, 20, 20000000), "minutes": (20, 7, 0), "rating": (27, 7, 0)}


def _stat_records(b: bytes, after: int | None, valid_team, valid_player) -> list[tuple[dict, int]]:
    if after is None:
        return []

    def decode(q):
        v = int.from_bytes(b[q:q + STAT], "little")
        return {k: ((v >> o) & ((1 << w) - 1)) + d for k, (o, w, d) in STAT_BITS.items()}

    def ok(q):
        if q + STAT > len(b):
            return False
        r = decode(q)
        return valid_team(r["teamid"]) and valid_player(r["playerid"])

    # FC 27: blok puan tablosu bölümünün 48 bayt ardında (üç kayıtta aynı); olmazsa yakında 20 geçerli kayıtla başlayan hiza.
    offsets = [STAT_GAP] + [k for k in range(256) if k != STAT_GAP]
    start = next((after + k for k in offsets if all(ok(after + k + STAT * i) for i in range(20))), None)
    if start is None:
        return []
    # Slot sayısı sabit değil ve arada uzun boş bölgeler var: boş slot (takım+oyuncu anahtarı sıfır) atlanır; anahtarı dolu
    # ama geçersiz STAT_END_GAP ardışık slot bloğun bittiğini gösterir (ardından başka veri gelir).
    rows, q, misses = [], start, 0
    while q + STAT <= len(b) and misses < STAT_END_GAP:
        if ok(q):
            rows.append((decode(q), int.from_bytes(b[q:q + STAT], "little"))); misses = 0
        elif (int.from_bytes(b[q:q + STAT], "little") >> 16) & ((1 << 37) - 1):
            misses += 1
        q += STAT
    return rows


def player_stats(b: bytes, after: int | None, valid_team, valid_player) -> list[dict]:
    return [row for row, _ in _stat_records(b, after, valid_team, valid_player)]


def recent_matches(b: bytes, after: int | None, valid_team, valid_player) -> list[dict]:
    """Oynanan maçlar; süre almadığı maçlar ve puanı yazılmamış (0 ya da 127) slotlar atlanır."""
    rows = []
    for stat, v in _stat_records(b, after, valid_team, valid_player):
        for base in MATCH_SLOTS:
            match = {k: ((v >> (base + o)) & ((1 << w) - 1)) + d for k, (o, w, d) in MATCH_BITS.items()}
            if match["minutes"] and match["date"] > 20000000 and 0 < match["rating"] <= 100:
                rows.append({"teamid": stat["teamid"], "playerid": stat["playerid"], "compid": stat["compid"], **match})
    return rows


# Kullanıcı takımının oyuncu morali. Blok: u32 oyuncu sayısı, sonra her oyuncu için 67 bayt sabit kısım
# [01][playerid u32][mizaç u32: 0 çok sakin … 4 çok asabi]… (+24 takım performansı, +28 oyuncu performansı, +32/+36
# bilinmiyor, +40 sözleşme, +44 moral, +48 float, +52 oynama süresi, +56 float; oyuncu kimliğine göre) ve +62'de u32 olay
# sayısı; her olay: [01][f32 etki][f32 süre][3 bayt][u32 uzunluk][ad "CM_Morale_…"][5 bayt].
# Fenerbahçe 17.07.2030 kaydında CMTracker'ın 24 oyuncusuyla birebir doğrulandı; olay biçimi Colchester kaydından (tek örnek).
MORALE_FIELDS = {"teamperformance": 24, "playerperformance": 28, "unknown1": 32, "unknown2": 36, "contract": 40,
                 "morale": 44, "playingtime": 52}


def _morale_block(b, q, count, valid_player):
    rows = []
    for _ in range(count):
        if q + MORALE > len(b) or b[q] != 1 or not valid_player(_u32(b, q + 1)) or _u32(b, q + 5) > 4:
            return None
        row = {"playerid": _u32(b, q + 1), "temperament": _u32(b, q + 5),
               **{name: _u32(b, q + 1 + o) for name, o in MORALE_FIELDS.items()}}
        if any(row[name] > 100 for name in MORALE_FIELDS):
            return None
        events, q = [], q + MORALE
        for _ in range(_u32(b, q - 4)):
            size = _u32(b, q + 12)
            name = b[q + 16:q + 16 + size]
            if b[q] != 1 or not name.startswith(b"CM_") or size > 200:
                return None
            events.append(name.decode("ascii", "replace"))
            q += 16 + size + 5
        row["events"] = ",".join(events) or None
        rows.append(row)
    return rows


def player_morale(b: bytes, valid_player) -> list[dict]:
    for m in re.finditer(rb"[\x01-\x60]\x00\x00\x00\x01", b):
        rows = _morale_block(b, m.start() + 4, b[m.start()], valid_player)
        if rows:
            return rows
    return []


# Kulüp bütçesi (EUR, oyunun iç birimi; CMTracker dolara çeviriyor). Blok "01 01 01" ardından: i64 kasa (DOĞRULANACAK),
# i64 sezon başı transfer bütçesi, u32 sezonluk maaş bütçesi, u32 bilinmiyor, u8 01, u32 haftalık maaş boşluğu, u32 kalan
# maaş bütçesi (her hafta maaş kadar azalır), u32 kalan transfer bütçesi. Fenerbahçe 17.07.2030 kaydında CMTracker'la
# (60.0M$ / 42.1M$ / 364.6K$) ve LE'nin bütçesiyle birebir doğrulandı; 9 kayıtta tek eşleşme.
# Kalan maaş bütçesi küçük kulüpte sezon başında sezonluk bütçenin iki katını aşabiliyor (Chesterfield 2,05 kat).
_BUDGET = re.compile(rb"\x01\x01\x01(.{4})\x00\x00\x00\x00(.{4})\x00\x00\x00\x00(.{4})(.{4})\x01(.{4})(.{4})(.{4})", re.S)


def club_budget(b: bytes) -> list[dict]:
    for m in _BUDGET.finditer(b):
        balance, start, wage_budget, unknown, headroom, wage_left, remaining = (struct.unpack("<I", g)[0] for g in m.groups())
        if 0 <= start < 2_000_000_000 and remaining < 2_000_000_000 and headroom < 100_000_000 and 0 < wage_budget and wage_left <= wage_budget * 4:
            return [{"balance": balance, "transferbudgetstart": start, "transferbudget": remaining, "wagebudget": wage_budget,
                     "wagebudgetleft": wage_left, "wageheadroom": headroom, "unknown": unknown}]
    return []


# Son finans hareketleri (17 bayt): [u32 sıra][i32 tutar][u32 tür][u32 tarih yyyymmdd][u8 1 = gelir]; sıra ardışık.
# Türler (Fenerbahçe 14.07.2030, CMTracker'la): 13 forma satışı, 16 oyuncu maaşları, 18 personel maaşları, 22 diğer.
TRANSACTION = 17


def _tx_ok(b, q):
    if q < 0 or q + TRANSACTION > len(b):
        return False
    idx, amount, kind, date = struct.unpack_from("<IiII", b, q)
    return 20000101 <= date <= 21001231 and b[q + 16] <= 1 and kind < 64 and idx < 100000 and amount >= 0


def club_transactions(b: bytes) -> list[dict]:
    for m in re.finditer(rb"[\x00-\x3f]\x00\x00\x00[\x00-\xff]{3}\x01[\x00\x01]", b):
        q = m.start() - 8
        if not all(_tx_ok(b, q + TRANSACTION * k) for k in range(3)):
            continue
        idx = [struct.unpack_from("<I", b, q + TRANSACTION * k)[0] for k in range(3)]
        if idx[1] != idx[0] + 1 or idx[2] != idx[1] + 1:
            continue
        rows = []
        while _tx_ok(b, q):
            i, amount, kind, date = struct.unpack_from("<IiII", b, q)
            if rows and i != rows[-1]["txindex"] + 1:
                break
            rows.append({"txindex": i, "amount": amount, "kind": kind, "date": date, "income": b[q + 16]})
            q += TRANSACTION
        return rows
    return []


def season_history(b: bytes, valid_team) -> list[dict]:
    """49-byte header + two serialized UTF-8 names; all rows must validate, unique candidate only.

    DOĞRULANACAK: FC 27 layout. 17.07.2030 four completed seasons match CMTracker, including total 215/148/39/28.
    Unknown bytes/fees are deliberately not interpreted. Points is the stored value, not recomputed from W/D.
    """
    candidates = []
    def name_at(q):
        if q + 5 > len(b) or b[q] != 1: raise ValueError()
        size = _u32(b, q + 1)
        if size > 128 or q + 5 + size > len(b): raise ValueError()
        return b[q + 5:q + 5 + size].decode("utf-8"), q + 5 + size
    for m in re.finditer(rb"\x01[\x01-\x32]\x00\x00\x00\x01", b):
        count, q, rows = b[m.start() + 1], m.start() + 5, []
        try:
            for index in range(1, count + 1):
                if q + 49 > len(b) or b[q] != 1 or not valid_team(_u32(b, q + 1)) or b[q + 5] != index:
                    raise ValueError()
                played, won, drawn, lost = b[q + 14], b[q + 15], b[q + 16], b[q + 23]
                security = _u32(b, q + 45)
                if played != won + drawn + lost or security > 100 or _u16(b, q + 17) > 2000 or _u16(b, q + 19) > 2000:
                    raise ValueError()
                bought, end = name_at(q + 49)
                sold, end = name_at(end)
                rows.append({"teamid": _u32(b, q + 1), "seasonindex": index, "leagueid": _u16(b, q + 7),
                             "position": None if b[q + 10] == 255 else b[q + 10], "objective": b[q + 11],
                             "objectivestatus": b[q + 6], "played": played, "won": won, "drawn": drawn, "lost": lost,
                             "goalsfor": _u16(b, q + 17), "goalsagainst": _u16(b, q + 19), "points": _u16(b, q + 21),
                             "jobsecurity": security, "biggestbuy": bought or None, "biggestsale": sold or None,
                             # +41 lig şampiyonluğu (17.07.2030: 1/0/1/1 = CMTracker final sırası 1/2/1/1); +33/+37 yerel ve
                             # kıtasal kupa sayısı (FC 26 managerhistory düzeni; Fenerbahçe'de hep 0, DOĞRULANACAK);
                             # +25/+29 sezonun en pahalı alım/satış bonservisi (EUR; Kroupi 90 M€ = transfer kaydı).
                             "leaguetitles": _u32(b, q + 41), "domesticcups": _u32(b, q + 33), "continentalcups": _u32(b, q + 37),
                             "biggestbuyfee": _u32(b, q + 25), "biggestsalefee": _u32(b, q + 29)})
                q = end
            candidates.append(rows)
        except (ValueError, struct.error, UnicodeError):
            continue
    return candidates[0] if len(candidates) == 1 else []


def finance_categories(b: bytes) -> list[dict]:
    """DOĞRULANACAK: 23 income/expense u32 pairs after mnft; distinct from the limited recent transaction log."""
    candidates = []
    for m in re.finditer(b"mnft", b):
        q = m.start()
        if q + 195 >= len(b) or b[q + 4:q + 6] != b"\x01\x01" or b[q + 10] != 1 or b[q + 195] != 1:
            continue
        rows = [{"kind": i, "income": _u32(b, q + 11 + 8 * i), "expense": _u32(b, q + 15 + 8 * i)} for i in range(23)]
        if any(max(r["income"], r["expense"]) >= 2_000_000_000 for r in rows): continue
        if _BUDGET.search(b, q + 195, min(len(b), q + 65536)) is None: continue
        candidates.append(rows)
    return candidates[0] if len(candidates) == 1 else []


# Kondisyon ve sakatlık (20 bayt, oyundaki tüm oyuncular): [01][playerid u32][ff ff ff ff][kondisyon u8][şiddet u8]
# [sakatlık türü u8][bölge u8][beklenen dönüş u32 yyyymmdd; sakat değilse 20080101][tedavi aşaması u8][tam kondisyona gün u8]
# [u8 bilinmiyor]. Fenerbahçe 17.07.2030 kaydında CMTracker'la birebir: 10 oyuncunun kondisyonu ve Kroupi (ağır=3,
# fizyoterapi=3, 08.09.2030, 20 gün). Şiddet/aşama/tür kodlarının geri kalanı DOĞRULANACAK.
FITNESS = 20
_NO_DATE = 20080101


def _fitness_ok(b, q, valid_player):
    return (q + FITNESS <= len(b) and b[q] == 1 and b[q + 5:q + 9] == b"\xff\xff\xff\xff" and b[q + 9] <= 100
            and valid_player(_u32(b, q + 1)) and 20000101 <= _u32(b, q + 13) <= 21001231)


def player_fitness(b: bytes, valid_player) -> list[dict]:
    for m in re.finditer(rb"\x01.{4}\xff\xff\xff\xff", b, re.S):
        q = m.start()
        if not all(_fitness_ok(b, q + FITNESS * k, valid_player) for k in range(30)):
            continue
        rows = []
        while _fitness_ok(b, q, valid_player):
            back = _u32(b, q + 13)
            rows.append({"playerid": _u32(b, q + 1), "fitness": b[q + 9], "severity": b[q + 10], "injurytype": b[q + 11],
                         "bodypart": b[q + 12], "returndate": None if back == _NO_DATE else back, "phase": b[q + 17],
                         "daystofit": b[q + 18], "unknown": b[q + 19]})
            q += FITNESS
        return rows
    return []


# Ana takım gözlemci ağı (FC 27): "mfts" işareti, u32 yeni gözlemci tarihi (yyyymmdd), ardından iki liste (işe alınabilir,
# işe alınmış); her liste 01 01 u32 adet + 131 baytlık kayıtlar: [01][u32 sıra][u32 kapsadığı ülke/bölge][u32 uyruk]
# [u32 deneyim][u32 bilgi][u32 ?][u32 ücret?][u32 ?][i32 ?][ff ff ff ff][ad 16 bayt UTF-8]...[+86 soyad 16 bayt].
# Fenerbahçe 24.07.2030 kaydında CMTracker'la birebir: 6 işe alınmış (Anil Kara Fransa 18, Serkan Çakmak İtalya 27,
# Jáchym Jelínek Almanya 21, Domen Saksida İspanya 45, ...), 5 işe alınabilir, yeni gözlemciler 28.07.2030.
SCOUT = 131


def _scout_list(b, p, kind):
    if p + 6 > len(b) or b[p] != 1 or b[p + 1] != 1:
        return None, p
    n = _u32(b, p + 2)
    if n > 30:
        return None, p
    rows, r = [], p + 6
    for i in range(n):
        if r + SCOUT > len(b) or b[r] != 1 or _u32(b, r + 1) != i or b[r + 37:r + 41] != b"\xff\xff\xff\xff":
            return None, p
        _, idx, cover, nat, exp, judg = struct.unpack_from("<BIIIII", b, r)
        if exp > 10 or judg > 10:
            return None, p
        try:
            first = b[r + 41:r + 57].split(b"\0")[0].decode("utf-8")
            last = b[r + 86:r + 102].split(b"\0")[0].decode("utf-8")
        except UnicodeDecodeError:
            return None, p
        rows.append({"scoutkey": i if kind == "hired" else 100 + i, "list": kind, "slot": i, "covernation": cover, "nationality": nat, "experience": exp,
                     "judgement": judg, "firstname": first, "lastname": last})
        r += SCOUT
    return rows, r


def scout_network(b: bytes) -> list[dict]:
    found = []
    for m in re.finditer(b"mfts\x01\x01", b):
        q = m.start()
        date = _u32(b, q + 6)
        if not 20000101 <= date <= 21001231 or b[q + 10] != 1:
            continue
        available, end = _scout_list(b, q + 11, "available")
        if available is None:
            continue
        hired, _ = _scout_list(b, end, "hired")
        if hired is None:
            continue
        found.append([{**r, "newscoutsdate": date} for r in available + hired])
    return found[0] if len(found) == 1 else []


# Hazırlık turnuvası davetleri: "cm_pst_*" anahtarlı kayıtlar. [01 01][u32 ?][u32 ?][u32 yarışma kodu][01 u32 uzunluk anahtar]
# [01 u32 n][n takım kimliği][01 u32 2][u32][u32][u32 ödül EUR]. İlk kayıt katılınan turnuva, ardından onay tarihi (yyyymmdd);
# sonra 01 u32 adet + davet listesi. Fenerbahçe 24.07.2030: CMTracker "European International Cup ENTERED $4.6M, European
# Shield DECLINED $4.4M, Champions Trophy DECLINED $4.3M, onay 12.07.2030" = 4,0/3,9/3,8 M€ ×1,14.
def _pst_record(b, k):
    """k = anahtarın başı; kayıt (dict, bitiş) ya da None."""
    n = _u32(b, k - 4)
    if b[k - 5] != 1 or b[k - 19:k - 17] != b"\x01\x01" or not 8 <= n <= 64:
        return None
    key = b[k:k + n].decode("ascii", "replace")
    p = k + n
    if b[p] != 1:
        return None
    teams = _u32(b, p + 1)
    if teams > 32:
        return None
    ids = list(struct.unpack_from(f"<{teams}I", b, p + 5))
    p += 5 + 4 * teams
    if b[p] != 1 or _u32(b, p + 1) != 2:
        return None
    prize = _u32(b, p + 13)
    return {"key": key, "compid": _u32(b, k - 9), "teamids": ",".join(map(str, ids)), "prize": prize}, p + 17


def preseason_invites(b: bytes) -> list[dict]:
    keys = [m.start() for m in re.finditer(rb"cm_pst_[a-z_]+", b)]
    keys = keys[next((i for i, k in enumerate(keys) if _pst_record(b, k)), len(keys)):]
    if not keys:
        return []
    entered, end = _pst_record(b, keys[0])
    window = b[end:end + 16]
    date = next((d for o in range(len(window) - 4) if 20000101 <= (d := _u32(window, o)) <= 21001231), None)
    rows = []
    for k in keys[1:]:
        rec = _pst_record(b, k)
        if rec is None or k - keys[0] > 4096:
            break
        rows.append(rec[0])
    if not rows:
        rows = [entered]
    return [{**r, "entered": int(r["key"] == entered["key"] and date is not None), "confirmeddate": date} for r in rows]


def _ymd(v): return 20000101 <= v <= 21001231
NO_TEAM = 0xFFFFFFFF


# Yönetim hedefleri (tüm takımlar tek tabloda): [u32 takım][01][u32 n] + n × 20 bayt
# [01][u32 hedef kimliği][u32 yarışma nesnesi][u32 yarışma kodu][u8 tür 0 lig/1 yerel kupa/2 kıtasal][u16 hedef basamak]
# [u16 üst basamak; 255 yok][u16 asgari basamak]. Basamak 0–17, 17 = kazan. Fenerbahçe 24.07.2030 CMTracker'la birebir:
# Süper Lig hedef 17 asgari 13, Türkiye Kupası ve Şampiyonlar Ligi hedef 17 asgari 15.
OBJECTIVE = 20


def _objectives_at(b, p, valid_team):
    if p + 9 > len(b) or b[p + 4] != 1 or not valid_team(_u32(b, p)):
        return None
    n = _u32(b, p + 5)
    if not 1 <= n <= 6 or p + 9 + n * OBJECTIVE > len(b):
        return None
    rows = []
    for i in range(n):
        r = p + 9 + i * OBJECTIVE
        if b[r] != 1:
            return None
        oid, cobj, comp = struct.unpack_from("<III", b, r + 1)
        kind = b[r + 13]
        target, stretch, minimum = struct.unpack_from("<HHH", b, r + 14)
        if kind > 3 or comp > 100000 or cobj > 100000 or any(v > 17 and v != 255 for v in (target, stretch, minimum)):
            return None
        rows.append({"objectiveid": oid, "compobjid": cobj, "compid": comp, "kind": kind, "target": target,
                     "stretch": None if stretch == 255 else stretch, "minimum": None if minimum == 255 else minimum})
    return rows, p + 9 + n * OBJECTIVE


def board_objectives(b: bytes, team, valid_team) -> list[dict]:
    if team is None:
        return []
    found = []
    for m in re.finditer(re.escape(struct.pack("<I", team) + b"\x01"), b):
        got = _objectives_at(b, m.start(), valid_team)
        # Tablonun içinde olduğunu doğrula: hemen ardından başka bir takımın hedefleri gelir.
        if got and _objectives_at(b, got[1], valid_team):
            found.append(got[0])
    return found[0] if len(found) == 1 else []


# Menajer karnesi: [01][u32 takım][ff ff ff ff][01][u32 en farklı mağlubiyet tarihi][01][u32 en farklı galibiyet tarihi]
# [u32 takım][u32 mağlubiyet rakibi][u32 takım][u32 galibiyet rakibi][u32 haftalık maaş][u32 kariyer kazancı][00]
# [u8 mağlubiyet atılan][u8 yenilen][u8 galibiyet atılan][u8 yenilen]. Fenerbahçe 24.07.2030 CMTracker'la birebir: maaş 15.000 €
# ($17,1K), kazanç 3.165.000 € ($3,6M; 17.07'de 3.150.000 = bir hafta önce), en farklı galibiyet 10–0 Konyaspor.
# Menajer profili: [ff×4][u32 takım][u32 lig][ff×4][u32 0][u32 ?][u32 sezon no][u32 maaş][u32 0][ff 00 00][01 u32 ad]...
# ve 43/42 bayt önce zorluk (0 Başlangıç … 6 Ultimate) ve devre süresi (dk): Fenerbahçe 6/5 = CMTracker "Ultimate, 5 min".
# Kart birikimi ve cezalar: "msus" işareti, 01 01 01 u32 adet, 3 bayt, ardından adet × 16 bayt
# [u32 oyuncu][u32 takım][u32 sarı kart][u8 ceza maçı][u8 1][u16 yarışma kodu?]. Fenerbahçe 24.07.2030 CMTracker'la birebir:
# Adeyemi ceza 1, Doku/Hendriks/Ngoy 2 sarı (CMTracker "2 kıtasal"; kodları 0). Kod 0/1565/1900; yerel/kıtasal eşlemesi
# DOĞRULANACAK (Ngoy'un ayrıca kod 1900 ile 2 sarısı var, CMTracker "0 yerel" diyor). Yalnız kullanıcı takımı saklanır.
SUSPENSION = 16


def suspensions(b: bytes, team) -> list[dict]:
    if team is None:
        return []
    marks = [m.start() for m in re.finditer(b"msus\x01\x01\x01", b)]
    if len(marks) != 1:
        return []
    q = marks[0]
    n = _u32(b, q + 7)
    start = q + 14
    if not 0 < n < 100000 or start + n * SUSPENSION > len(b):
        return []
    rows = []
    for i in range(n):
        pid, tid, yellows, ban, one, comp = struct.unpack_from("<IIIBBH", b, start + i * SUSPENSION)
        if one != 1 or yellows > 50:
            return []
        if tid == team and (yellows or ban):
            rows.append({"rowkey": i, "playerid": pid, "teamid": tid, "yellows": yellows, "ban": ban, "compkey": comp})
    return rows


def manager_record(b: bytes, team) -> list[dict]:
    if team is None:
        return []
    rec = []
    key = b"\x01" + struct.pack("<I", team) + b"\xff\xff\xff\xff\x01"
    for m in re.finditer(re.escape(key), b):
        q = m.start() + 9
        if b[q + 5] != 1:
            continue
        loss_date, win_date = _u32(b, q + 1), _u32(b, q + 6)
        t1, loss_opp, t2, win_opp, wage, earnings = struct.unpack_from("<6I", b, q + 10)
        # Henüz galibiyet ya da yenilgi yoksa takım alanı boş (FFFFFFFF), tarih de yer tutucudur (20080101).
        if t1 not in (team, NO_TEAM) or t2 not in (team, NO_TEAM) or not 0 < wage <= 5_000_000 or earnings < wage - 1 or earnings > 2_000_000_000 or b[q + 34] != 0:
            continue
        lf, la, wf, wa = b[q + 35:q + 39]
        lost, won = t1 == team and _ymd(loss_date), t2 == team and _ymd(win_date)
        rec.append({"wage": wage, "earnings": earnings,
                    "lossdate": loss_date if lost else None, "lossopponent": loss_opp if lost else None,
                    "lossfor": lf if lost else None, "lossagainst": la if lost else None,
                    "windate": win_date if won else None, "winopponent": win_opp if won else None,
                    "winfor": wf if won else None, "winagainst": wa if won else None})
    if len(rec) != 1:
        return []
    profile = []
    pat = re.compile(re.escape(b"\xff\xff\xff\xff" + struct.pack("<I", team)) + rb"(.{4})\xff\xff\xff\xff\x00\x00\x00\x00(.{4})(.{4})(.{4})\x00\x00\x00\x00\xff\x00\x00\x01", re.S)
    for m in pat.finditer(b):
        q = m.start()
        season, wage = _u32(b, q + 24), _u32(b, q + 28)
        diff, half = b[q - 43], b[q - 42]
        if wage == rec[0]["wage"] and diff <= 6 and 1 <= half <= 20 and 1 <= season <= 60:
            profile.append({"season": season, "difficulty": diff, "halflength": half})
    return [{"recordid": 0, **rec[0], **(profile[0] if len(profile) == 1 else {"season": None, "difficulty": None, "halflength": None})}]


# Dünya transfer tablosu (31 bayt): [01][u32 adet] + adet × ([01 01] + 29 bayt).
# 0..10 (88 bit LE): bit 0..18 playerid (-1), bit 19..36 toteamid (-1), bit 37..54 fromteamid (-1), bit 55..87 sıra no;
# +11 u32 bonservis (alt 30 bit, EUR), +15 u32 haftalık maaş (alt 30 bit), +19 u32 serbest kalma (alt 30 bit),
# +23..29 (48 bit LE): ((v >> 13) & 0x7fffffff) // 100 = yyyymmdd transfer tarihi.
# Ayrıca _BUDGET bloğunun 325 bayt önünde kullanıcı kulübünün 10 slotluk (10 × 25 bayt) transfer halkası durur:
# [u32 slot][u32 tarih yyyymmdd][u32 bedel][u32 karşı kulüp][u32 oyuncu][u32 maaş][u8 tür: 1 alış, 0 satış, 2 fesih].
WORLD_TRANSFER = 31
CLUB_TRANSFER = 25
CLUB_TRANSFER_SLOTS = 10
FREE_AGENT_MEN = 111592


def career_transfers(b: bytes, valid_team, valid_player, user_team=None) -> list[dict]:
    candidates = []
    for m in re.finditer(rb"\x01(.{4})\x01\x01", b, re.S):
        cnt = _u32(b, m.start() + 1)
        p0 = m.start() + 5
        if not 1 <= cnt <= 20000 or p0 + cnt * WORLD_TRANSFER > len(b):
            continue
        rows, seqs, ok = [], set(), True
        for i in range(cnt):
            q = p0 + i * WORLD_TRANSFER
            if b[q:q + 2] != b"\x01\x01":
                ok = False
                break
            r = q + 2
            v_mid = int.from_bytes(b[r:r + 11], "little")
            pid = (v_mid & 0x7FFFF) - 1
            to_team = ((v_mid >> 19) & 0x3FFFF) - 1
            from_team = ((v_mid >> 37) & 0x3FFFF) - 1
            seq = v_mid >> 55
            fee = _u32(b, r + 11) & 0x3FFFFFFF
            wage = _u32(b, r + 15) & 0x3FFFFFFF
            clause = _u32(b, r + 19) & 0x3FFFFFFF
            dt = ((int.from_bytes(b[r + 23:r + 29], "little") >> 13) & 0x7FFFFFFF) // 100
            if not (_ymd(dt) and dt != _NO_DATE and valid_player(pid) and valid_team(to_team) and valid_team(from_team)
                    and to_team != from_team and 0 < seq < 100000 and seq not in seqs
                    and fee <= 1_000_000_000 and wage <= 10_000_000):
                ok = False
                break
            seqs.add(seq)
            rows.append({"transferkey": seq, "playerid": pid, "fromteamid": from_team, "toteamid": to_team,
                         "fee": fee, "wage": wage or None, "clause": clause or None, "date": dt, "source": "world"})
        if ok:
            candidates.append(rows)
    rows = list(candidates[0]) if len(candidates) == 1 else []
    seen = {(r["playerid"], r["fromteamid"], r["toteamid"], r["date"]) for r in rows}

    if user_team is not None:
        for m in _BUDGET.finditer(b):
            balance, start, wage_budget, unknown, headroom, wage_left, remaining = (struct.unpack("<I", g)[0] for g in m.groups())
            if not (0 <= start < 2_000_000_000 and remaining < 2_000_000_000 and headroom < 100_000_000 and 0 < wage_budget and wage_left <= wage_budget * 4):
                continue
            q = m.start()
            if q < 332 or b[q - 332:q - 325] != b"\x00\x00\x00\x00\x01\x01\x01":
                break
            for i in range(CLUB_TRANSFER_SLOTS):
                r = q - 325 + i * CLUB_TRANSFER
                _, dt, fee, clb, pid, wg, knd = struct.unpack_from("<IIIIIIB", b, r)
                if not (_ymd(dt) and dt != _NO_DATE and valid_player(pid) and knd <= 2 and fee <= 1_000_000_000):
                    continue
                if knd == 1:
                    if not valid_team(clb) or clb == user_team:
                        continue
                    from_team, to_team = clb, user_team
                elif knd == 0:
                    if not valid_team(clb) or clb == user_team:
                        continue
                    from_team, to_team = user_team, clb
                else:
                    if clb != NO_TEAM:
                        continue
                    from_team, to_team = user_team, FREE_AGENT_MEN
                ident_key = (pid, from_team, to_team, dt)
                if ident_key in seen:
                    continue
                seen.add(ident_key)
                wage = None if wg in (0, NO_TEAM) or wg > 10_000_000 else wg
                rows.append({"transferkey": 100000 + i, "playerid": pid, "fromteamid": from_team, "toteamid": to_team,
                             "fee": fee, "wage": wage, "clause": None, "date": dt, "source": "club"})
            break
    return rows


def read_career(payload: bytes, valid_team, valid_player, user_team=None) -> dict[str, list[dict]]:
    """payload = kaydın açılmış Zstandard çerçevesi. Bulunamayan blok boş liste."""
    comps = competitions(payload)
    fixtures, standings, end = fixtures_and_standings(payload, {c["compid"] for c in comps})
    return {"career_competitions": comps, "career_fixtures": fixtures, "career_standings": standings,
            "career_playerstats": player_stats(payload, end, valid_team, valid_player),
            "career_playerrecentmatches": recent_matches(payload, end, valid_team, valid_player),
            "career_playermorale": player_morale(payload, valid_player),
            "career_playerfitness": player_fitness(payload, valid_player),
            "career_finance": club_budget(payload), "career_transactions": club_transactions(payload),
            "career_seasonhistory": season_history(payload, valid_team), "career_financecategories": finance_categories(payload),
            "career_scoutnetwork": scout_network(payload), "career_preseason": preseason_invites(payload),
            "career_boardobjectives": board_objectives(payload, user_team, valid_team),
            "career_manager": manager_record(payload, user_team), "career_suspensions": suspensions(payload, user_team),
            "career_transfers": career_transfers(payload, valid_team, valid_player, user_team)}
