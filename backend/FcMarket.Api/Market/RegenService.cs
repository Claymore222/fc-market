using FcMarket.Api.Data;
using FcMarket.Api.Domain;
using Microsoft.Data.Sqlite;

namespace FcMarket.Api.Market;

/// <summary>Regen izi: kaybolan oyuncu ve kariyerde yeni görülen, ayırt edici alanları tutan oyuncu.</summary>
public sealed record RegenPerson(int Id, DateOnly? BirthDate, int? NationId, int? Position, int? Potential, int? Overall, bool Retiring);

public sealed record RegenCandidate(int Id, string Name, int? Age, string? Position, int? Overall, int? Potential, string? Club, string Confidence);

public sealed record RegenMatch(int Id, string Name, DateOnly? BirthDate, string? Nation, string? NationCode, string? Position, int? Overall, int? Potential,
    IReadOnlyList<RegenCandidate> Candidates);

public sealed record RegenReport(string? BaselineDate, int Departed, IReadOnlyList<RegenMatch> Matches);

/// <summary>
/// EA'nın kuralı yayımlanmadı. Topluluk rehberleri regenin ülke, mevki, doğum günü ve potansiyeli taşıdığını söylüyor; 2029→2030
/// kariyerinde 1.094 ayrılan oyuncunun 185'i bu kuralla aday buldu, en güçlü adayların POT'u birebir aynıydı. Boy ve ayak taşınmıyor.
/// </summary>
public static class RegenFinder
{
    public const int MinRetiredAge = 33;
    public const int StrongPotentialGap = 1;
    public const int PossiblePotentialGap = 3;

    public static string? Confidence(RegenPerson retired, RegenPerson candidate)
    {
        if (retired.BirthDate is not { } a || candidate.BirthDate is not { } b || (a.Month, a.Day) != (b.Month, b.Day)) return null;
        if (retired.NationId is null || retired.NationId != candidate.NationId || retired.Position != candidate.Position) return null;
        if (retired.Potential is not { } p || candidate.Potential is not { } q) return null;
        var gap = Math.Abs(p - q);
        return gap <= StrongPotentialGap ? "Güçlü" : gap <= PossiblePotentialGap ? "Olası" : null;
    }

    public static bool Departed(RegenPerson person, DateOnly gameDate) =>
        person.Retiring || (person.BirthDate is { } b && Metrics.Age(b, gameDate) >= MinRetiredAge);
}

public sealed class RegenService(CareerDb db, MarketService market)
{
    private static readonly string[] Fields = ["birthdate", "nationality", "position1", "potential", "overall", "isRetiring"];

    public RegenReport Get(string? saveUid)
    {
        var data = market.Get(saveUid);
        var s = data.Schema;
        var map = s.Map;
        using var con = db.Open();
        var tip = db.LatestSnapshot(con, saveUid);
        var lineage = db.Lineage(con, tip.SaveUid, tip.Branch, tip.SnapshotId);
        var current = People(con, data, tip.SnapshotId);
        var baseline = lineage.FirstOrDefault(x => x.SnapshotId != tip.SnapshotId);
        if (baseline is null || current.Count == 0) return new RegenReport(null, 0, []);
        var first = People(con, data, baseline.SnapshotId);
        if (first.Count == 0) return new RegenReport(baseline.GameDate, 0, []);

        var today = DateOnly.Parse(tip.GameDate);
        var departed = first.Values.Where(p => !current.ContainsKey(p.Id) && RegenFinder.Departed(p, today)).ToList();
        var fresh = current.Values.Where(p => !first.ContainsKey(p.Id))
            .ToLookup(p => (p.NationId, p.BirthDate?.Month, p.BirthDate?.Day));
        var names = Names(con, data, lineage);
        string? Label(int? code) => code is { } c ? map.Positions.GetValueOrDefault(c.ToString()) : null;
        var matches = new List<RegenMatch>();
        foreach (var person in departed.OrderByDescending(p => p.Overall ?? 0))
        {
            var candidates = fresh[(person.NationId, person.BirthDate?.Month, person.BirthDate?.Day)]
                .Select(q => (Player: data.Find(q.Id), Confidence: RegenFinder.Confidence(person, q)))
                .Where(x => x.Player is not null && x.Confidence is not null)
                .OrderByDescending(x => x.Confidence == "Güçlü").ThenByDescending(x => x.Player!.Potential)
                .Select(x => new RegenCandidate(x.Player!.Id, x.Player.Name, x.Player.Age, x.Player.Position, x.Player.Overall, x.Player.Potential,
                    x.Player.Club, x.Confidence!))
                .ToList();
            if (candidates.Count == 0) continue;
            var nation = candidates.Select(c => data.Find(c.Id)).First();
            matches.Add(new RegenMatch(person.Id, names.GetValueOrDefault(person.Id) ?? $"Oyuncu #{person.Id}", person.BirthDate, nation?.Nation, nation?.NationCode,
                Label(person.Position), person.Overall, person.Potential, candidates));
        }
        return new RegenReport(baseline.GameDate, departed.Count, matches);
    }

    private static Dictionary<int, RegenPerson> People(SqliteConnection con, MarketData data, string snapshot)
    {
        var map = data.Schema.Map;
        return MarketLoader.Keyed(con, data.Schema, map.Player, snapshot, "id", Fields).ToDictionary(kv => kv.Key, kv =>
        {
            int? V(int i) => MarketLoader.Int(kv.Value[i]);
            return new RegenPerson(kv.Key, Metrics.BirthDate(V(0), map.Epoch), V(1), V(2), V(3), V(4), V(5) == 1);
        });
    }

    /// <summary>Kayıttan gelen ilk anlık görüntüde isim olmayabilir; soy ağacındaki bütün export'lar taranır.</summary>
    private static Dictionary<int, string> Names(SqliteConnection con, MarketData data, IReadOnlyList<SnapshotRow> lineage)
    {
        var names = new Dictionary<int, string>();
        foreach (var snapshot in lineage)
            foreach (var kv in MarketLoader.Keyed(con, data.Schema, data.Schema.Map.Names, snapshot.SnapshotId, "playerId", ["name"]))
                if (MarketLoader.Str(kv.Value[0]) is { Length: > 0 } name) names.TryAdd(kv.Key, name);
        return names;
    }
}
