#!/usr/bin/env python3
"""
make_sample_export.py — fc_export.lua'nın FC 27'de ürettiği formatta SAHTE bir export klasörü üretir.

Amaç: Oyun olmadan (örn. Mac'te) dashboard geliştirebilmek ve test etmek.

    python make_sample_export.py ./sample_export            # 3 aylık snapshot
    python make_sample_export.py ./sample_export --months 6 --players 3000

Biçim, ilk gerçek FC 27 snapshot'ına (17.10.2029, exporter 0.3.0) göre:
  * Sözleşme ayrı tabloda değil: players.wage (haftalık) ve players.contractvaliduntil (yıl).
  * career_playercontract ve player_stats yok (FC 27 Live Editor'de GetPlayersStats yok).
  * skillmoves 0 tabanlı (0–4), weakfootabilitytypecode 1–5, players.gender (1 = kadın).
  * Serbest oyuncular "NG - FA" (111592) takımında, "Free Agents League" (382) liginde.
  * Milli takımlar "International" (78) liginde; teamplayerlinks'te oyuncunun kulüp + milli takım satırı olabilir.
  * transfers, playerloans, playersuspensions tabloları. Tarih alanları doğum tarihi gibi 1582-10-14'ten
    itibaren gün sayısı varsayıldı (DOĞRULANACAK).
İsimler tamamen uydurmadır.
"""
from __future__ import annotations

import argparse
import csv
import json
import random
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

FIFA_EPOCH = date(1582, 10, 14)  # birthdate = bu tarihten itibaren gün (gerçek veriyle doğrulandı)

POSITIONS = {0: "GK", 3: "RB", 5: "CB", 7: "LB", 10: "CDM", 14: "CM", 18: "CAM",
             12: "RM", 16: "LM", 23: "RW", 27: "LW", 25: "ST"}
ATTRS = ["acceleration", "sprintspeed", "agility", "balance", "jumping", "stamina",
         "strength", "reactions", "aggression", "composure", "interceptions",
         "positioning", "vision", "ballcontrol", "crossing", "dribbling", "finishing",
         "freekickaccuracy", "headingaccuracy", "longpassing", "shortpassing",
         "defensiveawareness", "shotpower", "longshots", "standingtackle",
         "slidingtackle", "volleys", "curve", "penalties",
         "gkdiving", "gkhandling", "gkkicking", "gkreflexes", "gkpositioning"]
PLAYER_COLS = ["playerid", "firstnameid", "lastnameid", "birthdate", "height", "weight", "gender",
               "preferredfoot", "preferredposition1", "preferredposition2", "nationality",
               "overallrating", "potential", "internationalrep", "skillmoves", "weakfootabilitytypecode",
               "wage", "contractvaliduntil", "releaseclause", *ATTRS]
TEAM_COLS = ["teamid", "teamname", "overallrating"]
TPL_COLS = ["artificialkey", "playerid", "teamid", "jerseynumber", "position", "form", "injury",
            "leagueappearances", "leaguegoals", "yellows", "reds"]
LTL_COLS = ["artificialkey", "leagueid", "teamid", "points", "currenttableposition"]
LEAGUE_COLS = ["leagueid", "leaguename", "countryid", "level", "isinternationalleague", "iswomencompetition"]
NATION_COLS = ["nationid", "nationname", "isocountrycode"]
TRANSFER_COLS = ["buyingteamid", "playerid", "sellingteamid", "transferamount", "transferdate"]
LOAN_COLS = ["futureoptiontobuy", "isloantobuy", "loandateend", "playerid", "teamidloanedfrom"]
SUSPENSION_COLS = ["artificialkey", "enddate", "games", "playerid", "teamid"]

# (leagueid, ad, kadın ligi mi)
LEAGUES = [(68, "Turkey Süper Lig (1)", False), (13, "England Premier League (1)", False),
           (53, "Spain Primera División (1)", False), (19, "Germany 1. Bundesliga (1)", False),
           (31, "Italy Serie A (1)", False), (2216, "England WSL (1)", True)]
INTERNATIONAL_LEAGUE = (78, "International")
FREE_AGENTS_LEAGUE = (382, "Free Agents League")
FREE_AGENT_TEAM = 111592
NATIONS = [(48, "Türkiye", "TR"), (14, "İngiltere", "GB"), (45, "İspanya", "ES"), (21, "Almanya", "DE"),
           (27, "İtalya", "IT"), (54, "Brezilya", "BR"), (52, "Arjantin", "AR"), (18, "Fransa", "FR"),
           (34, "Hollanda", "NL")]
SYL = ["ka", "re", "mi", "do", "lu", "ta", "ser", "an", "el", "or", "bu", "ze", "fi", "ra", "no", "ki"]

# FC 27 event id'leri (ENUM_FCEGameModesCM_EVENT_MSG_*)
EVENT_IDS = {"MONTH_PASSED": 17, "TRANSFER_MOVE_COMPLETE": 86, "INJURY": 165}


def fake_name(rng: random.Random) -> str:
    first = "".join(rng.choice(SYL) for _ in range(rng.randint(2, 3))).capitalize()
    last = "".join(rng.choice(SYL) for _ in range(rng.randint(2, 4))).capitalize()
    return f"{first} {last}"


def days(d: date) -> int:
    return (d - FIFA_EPOCH).days


def write_csv(path: Path, cols: list[str], rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(cols)
        for r in rows:
            w.writerow(["" if r.get(c) is None else r.get(c) for c in cols])


def build_world(rng: random.Random, n_players: int, start: date):
    teams, ltl = [], []
    tid = 1
    for leagueid, _, women in LEAGUES:
        for _ in range(5 if women else 10):
            teams.append({"teamid": tid, "teamname": f"Takım {tid}{' Kadın' if women else ' FK'}",
                          "overallrating": rng.randint(65, 85), "_women": women})
            ltl.append({"leagueid": leagueid, "teamid": tid})
            tid += 1
    teams.append({"teamid": FREE_AGENT_TEAM, "teamname": "NG - FA", "overallrating": 50, "_women": False})
    ltl.append({"leagueid": FREE_AGENTS_LEAGUE[0], "teamid": FREE_AGENT_TEAM})
    national = {}
    for nid, name, _ in NATIONS:
        national[nid] = 1300 + nid
        teams.append({"teamid": 1300 + nid, "teamname": name, "overallrating": rng.randint(70, 86), "_women": False})
        ltl.append({"leagueid": INTERNATIONAL_LEAGUE[0], "teamid": 1300 + nid})
    for i, row in enumerate(ltl):
        row["artificialkey"] = i
        row["points"] = 0
        row["currenttableposition"] = 0

    men_clubs = [t["teamid"] for t in teams if not t["_women"] and t["teamid"] < 1000]
    women_clubs = [t["teamid"] for t in teams if t["_women"]]
    players = []
    for i in range(n_players):
        pid = 200000 + i
        woman = rng.random() < 0.12
        free = not woman and rng.random() < 0.05
        age = rng.choices([rng.randint(16, 20), rng.randint(21, 29), rng.randint(30, 37)], [3, 5, 2])[0]
        bday = start - timedelta(days=age * 365 + rng.randint(0, 364))
        pos = rng.choice(list(POSITIONS))
        pos2 = rng.choice([-1, -1, *POSITIONS]) if pos else -1
        ovr = max(45, min(91, int(rng.gauss(68 if age > 20 else 60, 7))))
        pot = max(ovr, min(94, ovr + (rng.randint(5, 25) if age <= 21 else rng.randint(0, 6))))
        wage = int(max(1, ovr - 50) ** 2.4 * rng.uniform(4, 9)) + 400  # haftalık, gerçekte 400 – 960.000
        p = {"playerid": pid, "firstnameid": 1000 + i, "lastnameid": 5000 + i,
             "birthdate": days(bday), "height": rng.randint(165, 198), "weight": rng.randint(62, 92),
             "gender": 1 if woman else 0, "preferredfoot": rng.choice([1, 1, 2]),
             "preferredposition1": pos, "preferredposition2": pos2 if pos2 != pos else -1,
             "nationality": rng.choice(NATIONS)[0], "overallrating": ovr, "potential": pot,
             "internationalrep": rng.randint(1, 3), "skillmoves": rng.choices([0, 1, 2, 3, 4], [10, 45, 35, 8, 2])[0],
             "weakfootabilitytypecode": rng.choices([1, 2, 3, 4, 5], [2, 20, 60, 14, 4])[0],
             "wage": wage, "releaseclause": -1,
             # Serbest oyuncunun eski sözleşme yılı anlamsız ama gerçek veride de dolu geliyor.
             "contractvaliduntil": start.year + rng.randint(-1, 2) if free else start.year + rng.randint(1, 5)}
        for a in ATTRS:
            base = ovr if not a.startswith("gk") or pos == 0 else 12
            p[a] = max(10, min(99, int(rng.gauss(base, 8))))
        p["_name"] = fake_name(rng)
        p["_teamid"] = FREE_AGENT_TEAM if free else rng.choice(women_clubs if woman else men_clubs)
        p["_national"] = national[p["nationality"]] if not woman and ovr >= 78 else None
        players.append(p)
    return teams, ltl, players, national


def evolve(rng: random.Random, players: list[dict], current: date) -> None:
    """Bir ay geçti: gençler gelişir, yaşlılar düşer."""
    for p in players:
        age = (current - (FIFA_EPOCH + timedelta(days=p["birthdate"]))).days / 365.25
        if age < 23 and p["overallrating"] < p["potential"] and rng.random() < 0.35:
            p["overallrating"] += 1
        elif age > 31 and rng.random() < 0.15:
            p["overallrating"] -= 1


def team_links(rng: random.Random, players: list[dict]) -> list[dict]:
    rows = []
    for p in players:
        for teamid in (p["_teamid"], p["_national"]):
            if teamid is None:
                continue
            # leagueappearances gerçek veride hep 0; leaguegoals güvenilmez. Aynısını taklit et.
            rows.append({"artificialkey": len(rows), "playerid": p["playerid"], "teamid": teamid,
                         "jerseynumber": rng.randint(1, 99), "position": p["preferredposition1"],
                         "form": rng.randint(1, 5), "injury": 0, "leagueappearances": 0,
                         "leaguegoals": rng.choice([0, 0, 0, 1, 2, 5]), "yellows": 0, "reds": 0})
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("out_dir", type=Path)
    ap.add_argument("--months", type=int, default=3)
    ap.add_argument("--players", type=int, default=1500)
    ap.add_argument("--seed", type=int, default=27)
    args = ap.parse_args()

    rng = random.Random(args.seed)
    out = args.out_dir
    out.mkdir(parents=True, exist_ok=True)
    start = date(2026, 8, 1)
    save_uid = "SAMPLE0000000000000000000000001"
    teams, ltl, players, _ = build_world(rng, args.players, start)
    leagues = [{"leagueid": lid, "leaguename": name, "countryid": 0, "level": 1,
                "isinternationalleague": 0, "iswomencompetition": int(women)} for lid, name, women in LEAGUES]
    leagues += [{"leagueid": lid, "leaguename": name, "countryid": 0, "level": 1,
                 "isinternationalleague": int(lid == INTERNATIONAL_LEAGUE[0]), "iswomencompetition": 0}
                for lid, name in (INTERNATIONAL_LEAGUE, FREE_AGENTS_LEAGUE)]
    nations = [{"nationid": nid, "nationname": name, "isocountrycode": iso} for nid, name, iso in NATIONS]
    team_name = {t["teamid"]: t["teamname"] for t in teams}
    user_teamid = 1
    men_clubs = [t["teamid"] for t in teams if not t["_women"] and t["teamid"] < 1000]

    tables = {
        "players": PLAYER_COLS, "teams": TEAM_COLS, "teamplayerlinks": TPL_COLS, "leagueteamlinks": LTL_COLS,
        "leagues": LEAGUE_COLS, "nations": NATION_COLS, "transfers": TRANSFER_COLS,
        "playerloans": LOAN_COLS, "playersuspensions": SUSPENSION_COLS,
    }
    string_cols = {"teamname", "leaguename", "nationname", "isocountrycode"}
    schema = {t: [{"name": c, "type": 0 if c in string_cols else 3} for c in sorted(cols)]
              for t, cols in tables.items()}

    transfers, loans, manifest_lines, events = [], [], [], []
    for m in range(args.months):
        current = date(start.year + (start.month - 1 + m) // 12, (start.month - 1 + m) % 12 + 1, 1)
        if m > 0:
            evolve(rng, players, current)
            for _ in range(rng.randint(3, 10)):  # birkaç transfer (yalnızca erkek kulüpleri arasında)
                p = rng.choice([x for x in players if x["gender"] == 0])
                seller, buyer = p["_teamid"], rng.choice(men_clubs)
                if seller == buyer:
                    continue
                p["_teamid"] = buyer
                p["contractvaliduntil"] = current.year + rng.randint(2, 5)
                transfers.append({"buyingteamid": buyer, "playerid": p["playerid"], "sellingteamid": seller,
                                  "transferamount": 0 if seller == FREE_AGENT_TEAM
                                  else rng.randint(1, 60) * 500_000, "transferdate": days(current)})
                events.append({"save_uid": save_uid, "game_date": current.isoformat(),
                               "event": "TRANSFER_MOVE_COMPLETE", "event_id": EVENT_IDS["TRANSFER_MOVE_COMPLETE"]})
            if rng.random() < 0.6:  # ara sıra kiralık
                p = rng.choice([x for x in players if x["gender"] == 0 and x["_teamid"] != FREE_AGENT_TEAM])
                owner = p["_teamid"]
                p["_teamid"] = rng.choice([t for t in men_clubs if t != owner])
                loans.append({"futureoptiontobuy": rng.choice([0, 0, rng.randint(2, 20) * 1_000_000]),
                              "isloantobuy": 0, "loandateend": days(date(current.year + 1, 6, 30)),
                              "playerid": p["playerid"], "teamidloanedfrom": owner})
        stamp = datetime(2026, 10, 16, 20, 0, m, tzinfo=timezone.utc)
        snap = f"{save_uid[:8]}_{current:%Y%m%d}_{stamp:%H%M%S}"

        suspensions = [{"artificialkey": i, "enddate": days(current + timedelta(days=rng.randint(3, 20))),
                        "games": rng.randint(1, 3), "playerid": p["playerid"], "teamid": p["_teamid"]}
                       for i, p in enumerate(rng.sample(players, k=min(5, len(players))))]
        rows = {
            "players": players, "teams": teams, "teamplayerlinks": team_links(rng, players), "leagueteamlinks": ltl,
            "leagues": leagues, "nations": nations, "transfers": transfers, "playerloans": loans,
            "playersuspensions": suspensions,
        }
        for t, cols in tables.items():
            write_csv(out / f"{snap}__{t}.csv", cols, rows[t])
        # club_teamid: exporter'ın teamplayerlinks'ten milli takımları atlayarak bulduğu kulüp
        write_csv(out / f"{snap}__player_names.csv", ["playerid", "name", "club_teamid"],
                  [{"playerid": p["playerid"], "name": p["_name"], "club_teamid": p["_teamid"]} for p in players])
        (out / f"{snap}__schema.json").write_text(json.dumps(schema), encoding="utf-8")

        files = [*tables, "player_names"]
        meta = {"exporter_version": "sample", "snapshot_id": snap, "save_uid": save_uid,
                "game_date": current.isoformat(), "exported_at": stamp.isoformat().replace("+00:00", "Z"),
                "user_teamid": user_teamid, "user_team_name": team_name[user_teamid],
                "transfer_budget": 25_000_000 - m * 2_000_000, "files": files}  # FC 27'de maaş bütçesi okunamıyor
        (out / f"{snap}__meta.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
        manifest_lines.append(json.dumps({k: meta[k] for k in ("snapshot_id", "save_uid", "game_date", "exported_at", "files")}
                                         | {"reason": "sample"}, ensure_ascii=False))
        events.append({"save_uid": save_uid, "game_date": current.isoformat(), "event": "MONTH_PASSED",
                       "event_id": EVENT_IDS["MONTH_PASSED"]})

    (out / "manifest.jsonl").write_text("\n".join(manifest_lines) + "\n", encoding="utf-8")
    with (out / "events.jsonl").open("w", encoding="utf-8") as fh:
        for e in events:
            e["real_time"] = "2026-10-16T20:00:00Z"
            fh.write(json.dumps(e, ensure_ascii=False) + "\n")
    print(f"örnek export yazıldı: {out}  ({args.months} snapshot, {len(players)} oyuncu)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
