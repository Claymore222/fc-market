import struct
import unittest

from tools.saveimport.career import (COMP, FIXTURE, MATCH_SLOTS, MORALE, MORALE_FIELDS, STANDING, STAT, STAT_BITS, read_career,
                                     recent_matches, season_history, finance_categories, scout_network, preseason_invites, SCOUT,
                                     board_objectives, manager_record, suspensions, club_budget, career_transfers, WORLD_TRANSFER,
                                     CLUB_TRANSFER, CLUB_TRANSFER_SLOTS)


def comp(cid, code):
    rec = b"\xff\x01" + struct.pack("<HHBH", cid, cid, 3, 1) + code.encode().ljust(7, b"\0") + b"TrophyName_Abbr15_68".ljust(33, b"\0")
    assert len(rec) == COMP
    return rec


def fixture(idx, cid, rnd, date, time, hs, hg, aslot, ag, status):
    rec = b"\xff\x01" + struct.pack("<HHBIHHBBHBBB", idx, cid, rnd, date, time, hs, hg, 0xFF, aslot, ag, 0xFF, status)
    assert len(rec) == FIXTURE
    return rec


def standing(idx, group, team, slot, home, away, points):
    rec = b"\xff\x01" + struct.pack("<HHiB", idx, group, team, slot) + bytes(home) + bytes(away) + bytes([points, 0])
    assert len(rec) == STANDING
    return rec


def morale(pid, temper, events=(), **values):
    rec = bytearray(MORALE)
    rec[0] = 1
    struct.pack_into("<II", rec, 1, pid, temper)
    for name, off in MORALE_FIELDS.items():
        struct.pack_into("<I", rec, 1 + off, values.get(name, 50))
    struct.pack_into("<I", rec, MORALE - 4, len(events))
    for e in events:
        name = e.encode()
        rec += b"\x01" + struct.pack("<ffBBBI", -5.0, 2.5, 0, 1, 1, len(name)) + name + b"\x01" + bytes(4)
    return bytes(rec)


def stat(**values):
    v = 0x0101
    for key, (off, width, delta) in STAT_BITS.items():
        v |= ((values.get(key, 0) - delta) & ((1 << width) - 1)) << off
    return v.to_bytes(STAT, "little")


class CareerTests(unittest.TestCase):
    def test_season_history_variable_utf8_names_and_fail_closed(self):
        def row(index, security=74, name='Kroupi'):
            b = bytearray(49)
            b[0] = 1
            struct.pack_into('<I', b, 1, 326)
            b[5], b[6], b[10], b[11] = index, 2, 1, 7
            struct.pack_into('<H', b, 7, 68)
            b[14:17] = bytes([5, 3, 1])
            struct.pack_into('<HHH', b, 17, 10, 4, 10)
            b[23] = 1
            struct.pack_into('<IIIII', b, 25, 90_000_000, 2_500_000, 0, 1, index % 2)
            struct.pack_into('<I', b, 45, security)
            for value in [name, 'Espí']:
                text = value.encode('utf-8')
                b += b'\x01' + struct.pack('<I', len(text)) + text
            return bytes(b)
        payload = b'\x01' + struct.pack('<I', 2) + row(1) + row(2, name='Aktürkoğlu')
        rows = season_history(payload, lambda t: t == 326)
        self.assertEqual([1, 2], [r['seasonindex'] for r in rows])
        self.assertEqual(('Aktürkoğlu', 'Espí', 74, 3, 10), (rows[1]['biggestbuy'], rows[1]['biggestsale'], rows[1]['jobsecurity'], rows[1]['won'], rows[1]['points']))
        self.assertEqual([1, 0], [r['leaguetitles'] for r in rows])
        self.assertEqual((90_000_000, 2_500_000, 0, 1), (rows[0]['biggestbuyfee'], rows[0]['biggestsalefee'], rows[0]['domesticcups'], rows[0]['continentalcups']))
        self.assertEqual([], season_history(payload[:-1], lambda t: t == 326))
        self.assertEqual([], season_history(payload + payload, lambda t: t == 326))
        self.assertEqual([], season_history(b'\x01\x01\0\0\0' + row(1, 101), lambda t: True))
        self.assertEqual([], season_history(payload, lambda t: False))
        self.assertEqual([], season_history(b'\x01\x01\0\0\0' + row(1, name='x' * 129), lambda t: True))

    def test_scout_network_reads_available_and_hired_lists(self):
        def scout(i, cover, nat, first, last, exp=4):
            r = bytearray(SCOUT)
            r[0] = 1
            struct.pack_into('<IIIIIIIIi', r, 1, i, cover, nat, exp, 4, 2, 3250000, 111111, 0)
            r[37:41] = b'\xff\xff\xff\xff'
            r[41:41 + len(first.encode())] = first.encode()
            r[86:86 + len(last.encode())] = last.encode()
            return bytes(r)
        hired = [scout(0, 18, 48, 'Anil', 'Kara'), scout(1, 27, 48, 'Serkan', 'Çakmak')]
        available = [scout(0, 4, 37, 'Mateusz', 'Górski', 3)]
        payload = (b'junk\x01\x04\0\0\0mfts\x01\x01' + struct.pack('<I', 20300728) + b'\x01\x01\x01' + struct.pack('<I', 1)
                   + b''.join(available) + b'\x01\x01' + struct.pack('<I', 2) + b''.join(hired))
        rows = scout_network(payload)
        self.assertEqual(['available', 'hired', 'hired'], [r['list'] for r in rows])
        self.assertEqual([100, 0, 1], [r['scoutkey'] for r in rows])
        self.assertEqual(('Serkan', 'Çakmak', 27, 48, 20300728), (rows[2]['firstname'], rows[2]['lastname'], rows[2]['covernation'],
                                                                  rows[2]['nationality'], rows[2]['newscoutsdate']))
        self.assertEqual([], scout_network(payload[:-1]))
        self.assertEqual([], scout_network(payload + payload))

    def test_preseason_invites_mark_the_entered_tournament(self):
        def record(key, comp, teams, prize):
            k = key.encode()
            return (b'\x01\x01' + struct.pack('<III', 14, 0, comp) + b'\x01' + struct.pack('<I', len(k)) + k + b'\x01'
                    + struct.pack('<I', len(teams)) + struct.pack(f'<{len(teams)}I', *teams) + b'\x01'
                    + struct.pack('<IIII', 2, 1, 13, prize))
        intl = record('cm_pst_eu_intl_cup', 840, [326, 242, 247], 4000000)
        payload = (b'x' * 40 + intl + b'\x01\0\0\0\0\x01' + struct.pack('<I', 20300712) + b'\xf1\x05\0\0\x01\x03\0\0\0'
                   + record('cm_pst_eu_shield', 844, [326, 450], 3900000) + intl + record('cm_pst_champions_trophy', 848, [326], 3800000))
        rows = preseason_invites(payload)
        self.assertEqual(['cm_pst_eu_shield', 'cm_pst_eu_intl_cup', 'cm_pst_champions_trophy'], [r['key'] for r in rows])
        self.assertEqual([0, 1, 0], [r['entered'] for r in rows])
        self.assertEqual(('326,242,247', 4000000, 20300712), (rows[1]['teamids'], rows[1]['prize'], rows[1]['confirmeddate']))
        self.assertEqual([], preseason_invites(b'cm_pst_eu_intl_cup only a string'))

    def test_board_objectives_belong_to_the_user_team_inside_the_table(self):
        def team(tid, objectives):
            return struct.pack('<I', tid) + b'\x01' + struct.pack('<I', len(objectives)) + b''.join(
                b'\x01' + struct.pack('<IIIB', oid, cobj, comp, kind) + struct.pack('<HHH', *levels)
                for oid, cobj, comp, kind, levels in objectives)
        payload = (b'xx' + team(325, [(1, 135, 223, 2, (7, 11, 3))])
                   + team(326, [(2191, 135, 223, 2, (17, 255, 15)), (2195, 1512, 68, 0, (17, 255, 13))])
                   + team(327, [(3, 1512, 68, 0, (12, 14, 6))]))
        valid = {325, 326, 327}.__contains__
        rows = board_objectives(payload, 326, valid)
        self.assertEqual([(223, 2, 17, None, 15), (68, 0, 17, None, 13)],
                         [(r['compid'], r['kind'], r['target'], r['stretch'], r['minimum']) for r in rows])
        self.assertEqual([], board_objectives(payload, 327, valid))  # ardından başka takım yok
        self.assertEqual([], board_objectives(payload, None, valid))

    def test_small_club_budget_with_large_remaining_wage_pool_is_read(self):
        # Chesterfield 22.07.2026: kalan maaş bütçesi sezonluk bütçenin 2,05 katı.
        block = b'\x01\x01\x01' + struct.pack('<qqII', 4000000, 1509200, 1050400, 0) + b'\x01' + struct.pack('<III', 1650, 2156425, 249500)
        self.assertEqual([{"balance": 4000000, "transferbudgetstart": 1509200, "transferbudget": 249500, "wagebudget": 1050400,
                           "wagebudgetleft": 2156425, "wageheadroom": 1650, "unknown": 0}], club_budget(b'zz' + block + bytes(8)))
        self.assertEqual([], club_budget(b'\x01\x01\x01' + struct.pack('<qqII', 1, 2, 0, 0) + b'\x01' + struct.pack('<III', 1, 2, 3)))

    def test_manager_without_a_win_yet_is_read_and_the_placeholder_date_is_ignored(self):
        record = (b'\x01' + struct.pack('<I', 1924) + b'\xff\xff\xff\xff' + b'\x01' + struct.pack('<I', 20260721) + b'\x01'
                  + struct.pack('<I', 20080101) + struct.pack('<6I', 1924, 111657, 0xFFFFFFFF, 0xFFFFFFFF, 15000, 45000) + bytes([0, 0, 2, 0, 0]))
        r = manager_record(record, 1924)[0]
        self.assertEqual((15000, 45000, 20260721, 111657), (r['wage'], r['earnings'], r['lossdate'], r['lossopponent']))
        self.assertEqual((None, None, None), (r['windate'], r['winopponent'], r['winfor']))

    def test_manager_record_reads_wage_earnings_record_matches_and_settings(self):
        record = (b'\x01' + struct.pack('<I', 326) + b'\xff\xff\xff\xff' + b'\x01' + struct.pack('<I', 20280307) + b'\x01'
                  + struct.pack('<I', 20260822) + struct.pack('<6I', 326, 10, 326, 101033, 15000, 3165000) + bytes([0, 1, 4, 10, 0]))
        profile = (bytes(17) + bytes([6, 5]) + bytes(41) + b'\xff\xff\xff\xff' + struct.pack('<II', 326, 68) + b'\xff\xff\xff\xff'
                   + struct.pack('<IIIII', 0, 1512, 5, 15000, 0) + b'\xff\x00\x00\x01' + struct.pack('<I', 3) + b'Ali')
        rows = manager_record(b'zz' + record + b'..' + profile, 326)
        self.assertEqual(1, len(rows))
        r = rows[0]
        self.assertEqual((15000, 3165000, 6, 5, 5), (r['wage'], r['earnings'], r['difficulty'], r['halflength'], r['season']))
        self.assertEqual((20260822, 101033, 10, 0), (r['windate'], r['winopponent'], r['winfor'], r['winagainst']))
        self.assertEqual((20280307, 10, 1, 4), (r['lossdate'], r['lossopponent'], r['lossfor'], r['lossagainst']))
        self.assertEqual([], manager_record(record + record, 326))
        self.assertEqual([], manager_record(record, 1))

    def test_suspensions_keep_user_team_yellows_and_bans(self):
        rows = [(251852, 326, 0, 1, 0), (251852, 1337, 1, 0, 0), (246420, 326, 2, 0, 0), (1, 326, 0, 0, 0), (262071, 326, 2, 0, 1900)]
        body = b''.join(struct.pack('<IIIBBH', pid, tid, y, ban, 1, comp) for pid, tid, y, ban, comp in rows)
        payload = b'x' + b'msus\x01\x01\x01' + struct.pack('<I', len(rows)) + b'\x01\0\0' + body + b'tail'
        got = suspensions(payload, 326)
        self.assertEqual([(251852, 0, 1, 0), (246420, 2, 0, 0), (262071, 2, 0, 1900)],
                         [(r['playerid'], r['yellows'], r['ban'], r['compkey']) for r in got])
        self.assertEqual([], suspensions(payload, None))
        self.assertEqual([], suspensions(payload + payload, 326))

    def test_finance_categories_keep_totals_separate_from_recent_transactions(self):
        values = [(0, 0)] * 23
        values[13], values[16] = (8344500, 0), (0, 2129000)
        prefix = b'mnft\x01\x01' + struct.pack('<I', 8) + b'\x01'
        budget = b'\x01\x01\x01' + struct.pack('<qqII', 418964000, 52600568, 56412980, 0) + b'\x01' + struct.pack('<III', 319865, 55955950, 36916049)
        payload = prefix + b''.join(struct.pack('<II', *v) for v in values) + b'\x01' + budget
        rows = finance_categories(payload)
        self.assertEqual(23, len(rows))
        self.assertEqual({'kind': 13, 'income': 8344500, 'expense': 0}, rows[13])
        self.assertEqual(2129000, sum(r['expense'] for r in rows))
        self.assertEqual([], finance_categories(payload[:-40]))
        self.assertEqual([], finance_categories(payload + payload))

    def test_career_transfers_reads_world_and_club_ring_buffer_and_deduplicates(self):
        def world_rec(seq, pid, from_t, to_t, fee, wage, clause, ymd):
            v_mid = ((pid + 1) & 0x7FFFF) | (((to_t + 1) & 0x3FFFF) << 19) | (((from_t + 1) & 0x3FFFF) << 37) | (seq << 55)
            v_date = ((ymd * 100) << 13) | 0x0A92
            rec = b"\x01\x01" + v_mid.to_bytes(11, "little") + struct.pack("<III", fee | 0x40000000, wage, clause) + v_date.to_bytes(6, "little")
            assert len(rec) == WORLD_TRANSFER
            return rec

        def club_slot(slot_id, ymd, fee, clb, pid, wage, kind):
            rec = struct.pack("<IIIIIIB", slot_id, ymd, fee, clb, pid, wage, kind)
            assert len(rec) == CLUB_TRANSFER
            return rec

        world_block = b"\x07\x01" + struct.pack("<I", 2) + world_rec(4, 223959, 325, 36, 5_350_000, 47_500, 0, 20260702) + world_rec(9, 236403, 52, 2, 20_950_000, 57_500, 8_450_000, 20260705)
        slots = [
            club_slot(0, 20260709, 32_000_000, 2, 258485, 0xFFFFFFFF, 0),       # satış: 326 -> 2
            club_slot(0xFFFFFFFF, 20260131, 9_000_000, 11, 235152, 50_000, 1),  # önceki sezon kış alışı: 11 -> 326
            club_slot(0xFFFFFFFF, 20250831, 239_200, 0xFFFFFFFF, 246106, 0xFFFFFFFF, 2),  # fesih: 326 -> 111592
        ] + [club_slot(i, 20080101, 0, 0xFFFFFFFF, 0, 0, 0) for i in range(3, CLUB_TRANSFER_SLOTS)]
        budget = b"\x01\x01\x01" + struct.pack("<qqII", 418964000, 52600568, 56412980, 0) + b"\x01" + struct.pack("<III", 319865, 55955950, 36916049)
        payload = b"\0" * 32 + world_block + b"\0" * 32 + b"\x00\x00\x00\x00\x01\x01\x01" + b"".join(slots) + b"\0" * 75 + budget
        teams = {325, 36, 52, 2, 11, 326, 111592}
        players = {223959, 236403, 258485, 235152, 246106}
        rows = career_transfers(payload, teams.__contains__, players.__contains__, 326)
        self.assertEqual(5, len(rows))
        self.assertEqual((223959, 325, 36, 5_350_000, 47_500, None, 20260702, "world"),
                         (rows[0]["playerid"], rows[0]["fromteamid"], rows[0]["toteamid"], rows[0]["fee"], rows[0]["wage"], rows[0]["clause"], rows[0]["date"], rows[0]["source"]))
        self.assertEqual(8_450_000, rows[1]["clause"])
        self.assertEqual([(258485, 326, 2, 32_000_000, None, 20260709),
                          (235152, 11, 326, 9_000_000, 50_000, 20260131),
                          (246106, 326, 111592, 239_200, None, 20250831)],
                         [(r["playerid"], r["fromteamid"], r["toteamid"], r["fee"], r["wage"], r["date"]) for r in rows[2:]])
        self.assertEqual(2, len(career_transfers(payload, teams.__contains__, players.__contains__, None)))
        self.assertEqual([], career_transfers(world_block + world_block, teams.__contains__, players.__contains__, None))

    def setUp(self):
        comps = b"".join(comp(1512 + i, f"C{68 + i}") for i in range(3))
        fixtures = b"".join(fixture(i + 1, 1512, i // 2 + 1, 20290819 + i, 1900, 1 + i % 2, 2, 2 - i % 2, 1, 1) for i in range(30))
        fixtures += fixture(31, 1512, 16, 20300101, 1130, 1, 0xFF, 2, 0xFF, 0)
        # 30 kayıt: ilk ikisi gerçek takımlar, gerisi boş grup slotları
        standings = standing(1, 1513, 326, 0, (15, 0, 0, 30, 15), (0, 0, 15, 15, 30), 45)
        standings += standing(2, 1513, 1943, 1, (15, 0, 0, 30, 15), (0, 0, 15, 15, 30), 45)
        standings += b"".join(b"\x00\x01" + struct.pack("<HHi", k, 0, -1) + bytes(13) for k in range(3, 31))
        stats = b"".join(stat(teamid=326, playerid=258923 + i, compid=1512, minutes=450, ratingtotal=350, goals=i % 3,
                              appearances=5, assists=1, yellowcards=1) for i in range(20))
        # Ana bloktan ayrı küçük blok (hazırlık turnuvası): 4 maç, ardında boş slotlar
        empty = b"\xff\x01" + struct.pack("<HH", 5, 0xFFFF) + bytes(7) + b"\xff" * 9
        preseason = b"".join(fixture(i + 1, 1513, 1, 20290717 + i // 2 * 4, 1600, 2 * i, 0xFF, 2 * i + 1, 0xFF, 0) for i in range(4)) + empty * 3
        morales = struct.pack("<I", 2) + morale(258923, 1, morale=14, contract=71, playingtime=76) + morale(
            258924, 3, ["CM_Morale_Update_PlaytimeUnhappy"], morale=46)
        budget = b"\x02\0\0\0\x01\x01\x01" + struct.pack("<qqII", 418964000, 52600568, 56412980, 2749188) + b"\x01" + struct.pack(
            "<III", 319865, 55955950, 36916049)
        txs = b"".join(struct.pack("<IiIIB", i, amount, kind, 20300714, inc) for i, (amount, kind, inc) in enumerate(
            [(4281000, 13, 1), (1066250, 16, 0), (52869, 18, 0)], start=5))
        # 30 kondisyon kaydı: ilki ağır sakat (dönüş 08.09.2030, fizyoterapi, 20 gün), diğerleri yalnız düşük kondisyon
        fit = struct.pack("<BI", 1, 258923) + b"\xff" * 4 + bytes([0, 3, 16, 38]) + struct.pack("<I", 20300908) + bytes([3, 20, 0])
        fit += b"".join(struct.pack("<BI", 1, 258924 + k % 15) + b"\xff" * 4 + bytes([60 + k, 0, 0, 0]) + struct.pack("<I", 20080101)
                        + bytes([0, 0, 1]) for k in range(29))
        self.payload = (b"\0" * 64 + fit + b"\0" * 8 + budget + b"\0" * 24 + txs + b"\xff" * 17 + morales + b"\0" * 32 + comps + b"\0" * 16 + preseason + b"\0" * 70 + fixtures + b"\0" * 40 + standings + b"\0" * 48
                        + stats + b"\0" * 128)

    def test_reads_all_blocks(self):
        c = read_career(self.payload, {326, 1943}.__contains__, lambda p: 258923 <= p < 258943)
        self.assertEqual(["C68", "C69", "C70"], [x["code"] for x in c["career_competitions"]])
        self.assertEqual(35, len(c["career_fixtures"]))
        self.assertEqual([1513] * 4, [f["compid"] for f in c["career_fixtures"] if f["date"] < 20290801])
        f = next(f for f in c["career_fixtures"] if f["compid"] == 1512)
        self.assertEqual((1512, 20290819, 1900, 1, 2, 2, 1, 1), (f["compid"], f["date"], f["time"], f["homeslot"], f["homegoals"],
                                                                 f["awayslot"], f["awaygoals"], f["status"]))
        self.assertEqual((0, 0xFF), (c["career_fixtures"][-1]["status"], c["career_fixtures"][-1]["homegoals"]))
        self.assertEqual([326, 1943], [s["teamid"] for s in c["career_standings"]])
        self.assertEqual(45, c["career_standings"][0]["points"])
        self.assertEqual(20, len(c["career_playerstats"]))
        self.assertEqual([{"balance": 418964000, "transferbudgetstart": 52600568, "transferbudget": 36916049, "wagebudget": 56412980,
                           "wagebudgetleft": 55955950, "wageheadroom": 319865, "unknown": 2749188}], c["career_finance"])
        self.assertEqual([(5, 4281000, 13, 1), (6, 1066250, 16, 0), (7, 52869, 18, 0)],
                         [(t["txindex"], t["amount"], t["kind"], t["income"]) for t in c["career_transactions"]])
        f0, f1 = c["career_playerfitness"][:2]
        self.assertEqual(30, len(c["career_playerfitness"]))
        self.assertEqual((258923, 0, 3, 20300908, 3, 20), (f0["playerid"], f0["fitness"], f0["severity"], f0["returndate"], f0["phase"], f0["daystofit"]))
        self.assertEqual((60, None), (f1["fitness"], f1["returndate"]))
        m = c["career_playermorale"]
        self.assertEqual([(258923, 1, 14, 71, 76, None), (258924, 3, 46, 50, 50, "CM_Morale_Update_PlaytimeUnhappy")],
                         [(r["playerid"], r["temperament"], r["morale"], r["contract"], r["playingtime"], r["events"]) for r in m])
        s = c["career_playerstats"][1]
        self.assertEqual((326, 258924, 1512, 5, 450, 350, 1, 1, 1), (s["teamid"], s["playerid"], s["compid"], s["appearances"],
                                                                  s["minutes"], s["ratingtotal"], s["goals"], s["assists"], s["yellowcards"]))

    def test_recent_matches_keep_played_slots_and_skip_empty_or_unused_ones(self):
        v = int.from_bytes(stat(teamid=326, playerid=258923, compid=1512), "little")
        for base, date, minutes, rating in ((MATCH_SLOTS[3], 260717, 90, 68), (MATCH_SLOTS[4], 260721, 44, 57), (MATCH_SLOTS[0], 260725, 0, 0),
                                               (MATCH_SLOTS[1], 260729, 90, 127)):
            v |= date << base | minutes << (base + 20) | rating << (base + 27)
        record = v.to_bytes(STAT, "little")
        rows = recent_matches(record * 20, 0 - 48, lambda t: True, lambda p: True)
        self.assertEqual({(20260717, 90, 68), (20260721, 44, 57)}, {(r["date"], r["minutes"], r["rating"]) for r in rows})
        self.assertEqual((326, 258923, 1512), (rows[0]["teamid"], rows[0]["playerid"], rows[0]["compid"]))

    def test_missing_blocks_are_empty(self):
        c = read_career(b"\0" * 4096, lambda t: True, lambda p: True)
        self.assertEqual({k: 0 for k in c}, {k: len(v) for k, v in c.items()})


if __name__ == "__main__":
    unittest.main()
