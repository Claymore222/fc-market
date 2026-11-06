using System.Collections.Concurrent;
using System.Globalization;
using FcMarket.Api.Analysis;
using FcMarket.Api.Data;
using FcMarket.Api.Domain;
using FcMarket.Api.FieldMaps;
using Microsoft.Data.Sqlite;

namespace FcMarket.Api.Market;

/// <summary>Haber akışı eşikleri (appsettings.json → Feed).</summary>
public sealed class FeedOptions
{
    /// <summary>Herkes için gelişim haberi: OVR en az bu kadar artmalı.</summary>
    public int OvrJump { get; set; } = 3;
    /// <summary>Herkes için potansiyel revizyonu: |ΔPOT| en az bu kadar.</summary>
    public int PotJump { get; set; } = 3;
    public int DefaultLimit { get; set; } = 500;
    public int MaxLimit { get; set; } = 3000;
}

/// <summary>
/// Kayıt içi dünya/kulüp transfer arşivi (career_transfer_archive + raw_career_transfers) ile ardışık snapshot
/// farklarını birleştirir. Tek kayıtlı kariyerde bile sezon başından itibaren yapılan tüm transferler bonservis,
/// maaş, serbest kalma bedeli ve sezon etiketiyle döner.
/// </summary>
public sealed class FeedService(CareerDb db, FieldMapProvider fieldMaps, MarketService market, ShortlistService shortlist,
    MarketOptions marketOptions, FeedOptions options, SeasonOptions? seasonOptions = null)
{
    /// <summary>Transfer türleri (FeedItem.Kind).</summary>
    public const string KindPermanent = "permanent", KindLoan = "loan", KindLoanReturn = "loanReturn", KindFree = "free",
        KindReleased = "released";

    public const string Transfer = "transfer", Growth = "growth", Decline = "decline", Potential = "potential",
        Contract = "contract", Retired = "retired", NewPlayer = "new", Event = "event";

    private static readonly string[] TypeOrder = [Transfer, Growth, Potential, Contract, Decline, NewPlayer, Retired, Event];

    private int StartMonth => seasonOptions?.StartMonth ?? 7;

    private sealed record Fact(string Name, int? ClubId, int? Ovr, int? Pot, int? EndYear);

    private sealed class SnapshotFacts
    {
        public required Dictionary<int, Fact> Players { get; init; }
        public required HashSet<int> HiddenPlayers { get; init; }
        public required Dictionary<int, string?> Teams { get; init; }
        public required Dictionary<int, int?> TeamLeague { get; init; }
        public required Dictionary<int, string?> Leagues { get; init; }
        /// <summary>Kiralık oyuncular: oyuncu → sahibi olan kulüp.</summary>
        public required Dictionary<int, int?> Loans { get; init; }
    }

    private const int MaxCachedFacts = 24;
    private readonly ConcurrentDictionary<string, Lazy<SnapshotFacts>> _facts = new();

    public FeedResponse Get(FeedQuery q)
    {
        var data = market.Get(q.SaveUid);
        var save = data.Snapshot.SaveUid;
        var map = fieldMaps.Current;
        var types = q.Types is { Length: > 0 } ? q.Types.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .ToHashSet(StringComparer.OrdinalIgnoreCase) : null;
        var limit = Math.Clamp(q.Limit ?? options.DefaultLimit, 1, options.MaxLimit);

        using var con = db.Open();
        var snaps = CareerDb.PerGameDay(db.Lineage(con, save, data.Snapshot.Branch, data.Snapshot.SnapshotId));
        var starred = shortlist.Ids(save);
        var userTeam = data.Snapshot.UserTeamId;

        var items = new List<FeedItem>();
        var recorded = snaps.Count > 0 ? LoadRecordedTransfers(con, map, data.Snapshot, snaps, starred, userTeam) : [];
        items.AddRange(recorded);
        var recordedMoves = recorded
            .Where(r => r.PlayerId is not null)
            .Select(r => (r.PlayerId!.Value, r.ToClubId, r.Season))
            .ToHashSet();

        for (var i = 1; i < snaps.Count; i++)
            items.AddRange(Diff(Facts(con, map, snaps[i - 1]), Facts(con, map, snaps[i]), snaps[i].Date, map, starred, userTeam, recordedMoves));

        // Legacy events have no branch/session identity. Do not attribute another timeline's events to this one.
        foreach (var e in db.Branches(con, save).Count <= 1 ? db.EventCounts(con, save) : [])
            if (e.Date is { } d && d <= data.Snapshot.GameDate)
                items.Add(new FeedItem(d, Event, null, null, null, null, null, null, null, null, null, null,
                    false, false, e.Event, e.Count, Season: Metrics.SeasonLabel(d, StartMonth)));

        var currentSeason = Metrics.SeasonLabel(data.Snapshot.GameDate, StartMonth);
        var availableSeasons = items.Where(x => x.Type == Transfer && x.Season is not null)
            .Select(x => x.Season!)
            .Append(currentSeason)
            .Distinct(StringComparer.Ordinal)
            .OrderByDescending(x => x, StringComparer.Ordinal)
            .ToList();

        int? userLeague = userTeam is { } ut ? data.Players.FirstOrDefault(p => p.ClubId == ut)?.LeagueId : null;
        IEnumerable<FeedItem> filtered = items;
        if (types is not null) filtered = filtered.Where(x => types.Contains(x.Type));
        if (q.Season is { Length: > 0 } seasonFilter && !string.Equals(seasonFilter, "all", StringComparison.OrdinalIgnoreCase))
            filtered = filtered.Where(x => string.Equals(x.Season ?? Metrics.SeasonLabel(x.Date, StartMonth), seasonFilter, StringComparison.OrdinalIgnoreCase));
        if (q.WatchedOnly == true) filtered = filtered.Where(x => x.Shortlisted || x.UserTeam);
        if (q.MyLeague == true && userLeague is { } ul) filtered = filtered.Where(x => x.Type == Event || x.LeagueId == ul);

        var ordered = filtered
            .OrderByDescending(x => x.Date)
            .ThenByDescending(x => x.Shortlisted || x.UserTeam)
            .ThenBy(x => Array.IndexOf(TypeOrder, x.Type))
            .ThenByDescending(x => x.Fee ?? 0)
            .ThenByDescending(x => Math.Abs((x.After ?? 0) - (x.Before ?? 0)))
            .ThenBy(x => x.PlayerName, StringComparer.Ordinal)
            .ToList();

        return new FeedResponse(data.Snapshot, snaps.Count, ordered.Count, ordered.Take(limit).ToList(), userLeague, availableSeasons, currentSeason);
    }

    private List<FeedItem> LoadRecordedTransfers(SqliteConnection con, FieldMap map, SnapshotInfo active, IReadOnlyList<SnapshotRow> snaps,
        HashSet<int> starred, int? userTeam)
    {
        var tipFacts = Facts(con, map, snaps[^1]);
        var rawRows = new Dictionary<(DateOnly Date, int PlayerId, int FromTeamId, int ToTeamId), (long? Fee, long? Wage, long? Clause)>();

        foreach (var ar in TransferEvidenceReader.ReadArchiveRows(con, active.SaveUid, active.Branch ?? 0, active.GameDate))
        {
            rawRows.TryAdd((ar.Date, ar.PlayerId, ar.FromTeamId, ar.ToTeamId), (ar.Fee, ar.Wage, ar.Clause));
        }

        var schema = ResolvedSchema.FromDb(map, con);
        var careerSec = map.CareerTransfer;
        if (schema.HasTable(careerSec) && schema.Column(careerSec, "playerId") is not null)
        {
            string[] fields = ["playerId", "fromTeamId", "toTeamId", "fee", "wage", "clause", "date"];
            var marks = string.Join(",", snaps.Select((_, i) => $"$s{i}"));
            using var cmd = con.CreateCommand();
            cmd.CommandText = $"SELECT {string.Join(",", fields.Select(f => schema.Select(careerSec, f)))} FROM {schema.Table(careerSec)} WHERE snapshot_id IN ({marks})";
            for (var i = 0; i < snaps.Count; i++) cmd.Parameters.AddWithValue($"$s{i}", snaps[i].SnapshotId);
            using var r = cmd.ExecuteReader();
            while (r.Read())
            {
                object? V(int i) => r.IsDBNull(i) ? null : r.GetValue(i);
                if (MarketLoader.Int(V(0)) is not { } pid || pid <= 0 ||
                    MarketLoader.Int(V(1)) is not { } from || from < 0 ||
                    MarketLoader.Int(V(2)) is not { } to || to <= 0 || from == to ||
                    MarketLoader.Int(V(6)) is not { } ymd ||
                    !DateOnly.TryParseExact(ymd.ToString(CultureInfo.InvariantCulture), "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) ||
                    date > active.GameDate) continue;
                rawRows.TryAdd((date, pid, from, to), (MarketLoader.Long(V(3)), MarketLoader.Long(V(4)), MarketLoader.Long(V(5))));
            }
        }

        if (rawRows.Count == 0) return [];

        Dictionary<int, string>? fallbackNames = null;
        var missingIds = rawRows.Keys.Select(k => k.PlayerId).Where(id => !tipFacts.Players.ContainsKey(id) && !tipFacts.HiddenPlayers.Contains(id)).Distinct().ToList();
        if (missingIds.Count > 0 && schema.HasTable(map.Names) && schema.Column(map.Names, "playerId") is { } npid && schema.Column(map.Names, "name") is { } nname)
        {
            fallbackNames = new Dictionary<int, string>();
            using var ncmd = con.CreateCommand();
            ncmd.CommandText = $"SELECT {npid}, {nname} FROM {schema.Table(map.Names)} WHERE snapshot_id IN (SELECT snapshot_id FROM snapshots WHERE save_uid = $save) AND {nname} IS NOT NULL";
            ncmd.Parameters.AddWithValue("$save", active.SaveUid);
            using var nr = ncmd.ExecuteReader();
            while (nr.Read())
                if (MarketLoader.Int(nr.IsDBNull(0) ? null : nr.GetValue(0)) is { } id && MarketLoader.Str(nr.IsDBNull(1) ? null : nr.GetValue(1)) is { Length: > 0 } nm)
                    fallbackNames.TryAdd(id, nm);
        }

        string? Club(int id) => map.IsFreeAgentTeam(id) ? map.FreeAgents.Label : tipFacts.Teams.GetValueOrDefault(id);
        (int? Id, string? Name) League(int clubId)
        {
            var lid = tipFacts.TeamLeague.GetValueOrDefault(clubId);
            return (lid, lid is { } l ? tipFacts.Leagues.GetValueOrDefault(l) : null);
        }

        var result = new List<FeedItem>(rawRows.Count);
        foreach (var ((date, pid, from, to), (fee, wage, clause)) in rawRows)
        {
            if (tipFacts.HiddenPlayers.Contains(pid)) continue;
            var name = tipFacts.Players.TryGetValue(pid, out var pf) ? pf.Name : fallbackNames?.GetValueOrDefault(pid) ?? $"#{pid}";
            var (lid, lname) = League(map.IsFreeAgentTeam(to) ? from : to);
            var star = starred.Contains(pid);
            var mine = userTeam is { } u && (from == u || to == u || (pf?.ClubId == u));
            var kind = map.IsFreeAgentTeam(from) ? KindFree
                : map.IsFreeAgentTeam(to) ? KindReleased
                : tipFacts.Loans.TryGetValue(pid, out var owner) && owner == from ? KindLoan
                : fee is 0 ? KindFree
                : KindPermanent;
            var season = Metrics.SeasonLabel(date, StartMonth);
            result.Add(new FeedItem(date, Transfer, pid, name, from, Club(from), to, Club(to),
                lid, lname, null, null, star, mine, null, 1, kind,
                fee, wage is > 0 ? wage : null, clause is > 0 ? clause : null, season));
        }
        return result;
    }

    private IEnumerable<FeedItem> Diff(SnapshotFacts prev, SnapshotFacts cur, DateOnly date, FieldMap map,
        HashSet<int> starred, int? userTeam, HashSet<(int PlayerId, int? ToClubId, string? Season)> recordedMoves)
    {
        var season = Metrics.SeasonLabel(date, StartMonth);
        string? Club(SnapshotFacts f, int? id) =>
            id is null ? null : map.IsFreeAgentTeam(id) ? map.FreeAgents.Label : f.Teams.GetValueOrDefault(id.Value);
        (int? Id, string? Name) League(SnapshotFacts f, int? clubId)
        {
            var lid = clubId is { } c ? f.TeamLeague.GetValueOrDefault(c) : null;
            return (lid, lid is { } l ? f.Leagues.GetValueOrDefault(l) : null);
        }
        FeedItem Item(string type, int id, Fact f, SnapshotFacts src, int? fromClub, int? toClub, int? before, int? after,
            string? kind = null)
        {
            var (lid, lname) = League(src, toClub ?? f.ClubId);
            var star = starred.Contains(id);
            var mine = userTeam is { } u && (f.ClubId == u || fromClub == u || toClub == u);
            return new FeedItem(date, type, id, f.Name, fromClub, Club(prev, fromClub), toClub, Club(cur, toClub),
                lid, lname, before, after, star, mine, null, 1, kind, Season: season);
        }

        foreach (var (id, now) in cur.Players)
        {
            if (!prev.Players.TryGetValue(id, out var was))
            {
                yield return Item(NewPlayer, id, now, cur, null, now.ClubId, null, now.Ovr);
                continue;
            }
            var watched = starred.Contains(id) || (userTeam is { } u && (now.ClubId == u || was.ClubId == u));

            if (now.ClubId != was.ClubId && !recordedMoves.Contains((id, now.ClubId, season)))
                yield return Item(Transfer, id, now, cur, was.ClubId, now.ClubId, null, null, TransferKind(map, prev, cur, id, was.ClubId, now.ClubId));

            if (now.Ovr is { } o1 && was.Ovr is { } o0 && o1 != o0)
            {
                if (o1 - o0 >= options.OvrJump || (watched && o1 > o0))
                    yield return Item(Growth, id, now, cur, null, now.ClubId, o0, o1);
                else if (watched && o1 < o0)
                    yield return Item(Decline, id, now, cur, null, now.ClubId, o0, o1);
            }

            if (now.Pot is { } p1 && was.Pot is { } p0 && p1 != p0 && (Math.Abs(p1 - p0) >= options.PotJump || watched))
                yield return Item(Potential, id, now, cur, null, now.ClubId, p0, p1);

            if (watched && now.EndYear != was.EndYear && !map.IsFreeAgentTeam(now.ClubId))
                yield return Item(Contract, id, now, cur, null, now.ClubId, was.EndYear, now.EndYear);
        }

        foreach (var (id, was) in prev.Players)
            if (!cur.Players.ContainsKey(id))
                yield return Item(Retired, id, was, prev, was.ClubId, null, was.Ovr, null);
    }

    /// <summary>
    /// Kulüp değişiminin türü (kayıttan çıkarım, kesin değil): serbest oyuncu imzası, kiralık (yeni kulüpte eski kulübünden
    /// kiralık görünüyor), kiralıktan dönüş, yoksa bonservisli.
    /// </summary>
    private static string TransferKind(FieldMap map, SnapshotFacts prev, SnapshotFacts cur, int id, int? from, int? to)
    {
        if (map.IsFreeAgentTeam(from)) return KindFree;
        if (map.IsFreeAgentTeam(to)) return KindReleased;
        if (cur.Loans.TryGetValue(id, out var owner) && owner == from) return KindLoan;
        if (prev.Loans.TryGetValue(id, out var was) && was == to) return KindLoanReturn;
        return KindPermanent;
    }

    private SnapshotFacts Facts(SqliteConnection con, FieldMap map, SnapshotRow snap)
    {
        var key = $"{snap.SnapshotId}|{snap.Revision}|{fieldMaps.Version}|{marketOptions.IncludeWomen}";
        if (_facts.Count >= MaxCachedFacts && !_facts.ContainsKey(key)) _facts.Clear();
        return _facts.GetOrAdd(key, _ => new Lazy<SnapshotFacts>(() => LoadFacts(con, map, snap.SnapshotId, snap.Date))).Value;
    }

    private SnapshotFacts LoadFacts(SqliteConnection con, FieldMap map, string snap, DateOnly gameDate)
    {
        var s = ResolvedSchema.FromDb(map, con);
        var names = MarketLoader.Keyed(con, s, map.Names, snap, "playerId", ["name", "clubTeamId"]);
        var contracts = MarketLoader.Keyed(con, s, map.Contract, snap, "playerId", ["endYear"]);
        var hideGender = marketOptions.IncludeWomen ? null : map.WomenGenderCode;

        var players = new Dictionary<int, Fact>();
        var hidden = new HashSet<int>();
        foreach (var (id, v) in MarketLoader.Keyed(con, s, map.Player, snap, "id", ["overall", "potential", "gender"]))
        {
            if (hideGender is { } hg && MarketLoader.Int(v[2]) == hg)
            {
                hidden.Add(id);
                continue;
            }
            var n = names.GetValueOrDefault(id);
            players[id] = new Fact(MarketLoader.Str(n?[0]) ?? $"#{id}", MarketLoader.Int(n?[1]),
                MarketLoader.Int(v[0]), MarketLoader.Int(v[1]), MarketLoader.Int(contracts.GetValueOrDefault(id)?[0]));
        }

        return new SnapshotFacts
        {
            Players = players,
            HiddenPlayers = hidden,
            Teams = MarketLoader.Keyed(con, s, map.Team, snap, "id", ["name"]).ToDictionary(kv => kv.Key, kv => MarketLoader.Str(kv.Value[0])),
            TeamLeague = MarketLoader.Keyed(con, s, map.LeagueTeamLink, snap, "teamId", ["leagueId"], orderBy: "leagueId")
                .ToDictionary(kv => kv.Key, kv => MarketLoader.Int(kv.Value[0])),
            Leagues = MarketLoader.Keyed(con, s, map.League, snap, "id", ["name"]).ToDictionary(kv => kv.Key, kv => MarketLoader.Str(kv.Value[0])),
            Loans = ClubService.Loans(con, s, snap, gameDate).ToDictionary(kv => kv.Key, kv => kv.Value.From),
        };
    }
}

public sealed class FeedQuery
{
    public string? SaveUid { get; set; }
    /// <summary>Virgülle: transfer,growth,decline,potential,contract,retired,new,event</summary>
    public string? Types { get; set; }
    /// <summary>Sezon filtresi (ör. "2026/27", "2030/31", "all").</summary>
    public string? Season { get; set; }
    /// <summary>Yalnızca shortlist ve kullanıcı takımı.</summary>
    public bool? WatchedOnly { get; set; }
    /// <summary>Yalnızca kullanıcı takımının liginde (event'ler her zaman dahil).</summary>
    public bool? MyLeague { get; set; }
    public int? Limit { get; set; }
}

/// <param name="ToClub">transfer/new: yeni kulüp; growth/decline/potential/contract: oyuncunun kulübü.</param>
/// <param name="Before">growth/decline: OVR, potential: POT, contract: bitiş yılı, retired: son OVR.</param>
/// <param name="After">Aynı alanın yeni değeri; new: ilk OVR.</param>
/// <param name="Event">Yalnızca type = event: event adı (ör. INJURY); Count o gün kaç kez geldiği.</param>
/// <param name="Kind">Yalnızca transfer: permanent, loan, loanReturn, free (serbest imza), released (serbest kaldı).</param>
/// <param name="Fee">Gerçekleşen bonservis/fesih bedeli (EUR); kayıt dışıysa null.</param>
/// <param name="Wage">Transferde bağlanan yeni haftalık maaş (EUR); kayıt dışıysa null.</param>
/// <param name="ReleaseClause">Transferde bağlanan serbest kalma bedeli (EUR); yoksa null.</param>
/// <param name="Season">Sezon etiketi (ör. "2026/27").</param>
public sealed record FeedItem(
    DateOnly Date, string Type, int? PlayerId, string? PlayerName,
    int? FromClubId, string? FromClub, int? ToClubId, string? ToClub,
    int? LeagueId, string? League, int? Before, int? After,
    bool Shortlisted, bool UserTeam, string? Event, int Count, string? Kind = null,
    long? Fee = null, long? Wage = null, long? ReleaseClause = null, string? Season = null);

public sealed record FeedResponse(SnapshotInfo Snapshot, int SnapshotCount, int Total, IReadOnlyList<FeedItem> Items,
    int? UserLeagueId, IReadOnlyList<string>? Seasons = null, string? CurrentSeason = null);
