using System.Globalization;
using FcMarket.Api.Data;
using FcMarket.Api.FieldMaps;
using FcMarket.Api.Market;

namespace FcMarket.Api.Analysis;

/// <summary>
/// Kulüp incelemesi: kullanıcının gitmeyi düşündüğü (ör. iş teklifi gelen) bir takımı, kendi takımı gibi değerlendirir.
/// Oyun tarzı kayıtlı dizilişten, ihtiyaçlar kadro derinliği motorundan (lig kıyasıyla), bütçe kulüp değerinden tahmin edilir.
/// Hiçbir şey yazmaz; kullanıcı kulübüne ait bütçe ve hedefler bu takım için bilinmez.
/// </summary>
public sealed class ClubReviewService(CareerDb db, FieldMapProvider maps, MarketLoader loader, SquadAnalysisService analysis, ReloadingJsonFile<ClubReviewConfig> config)
{
    public ClubReview Get(string? saveUid, int teamId)
    {
        var cfg = config.Current;
        var map = maps.Current;
        var ctx = analysis.Context(saveUid, teamId);
        var snap = ctx.Snapshot;
        using var con = db.Open();
        var schema = ResolvedSchema.FromDb(map, con);
        // Kullanıcının gerçek kariyer başlığı (karşılaştırma için); ctx'te incelenen takım "kendi takımı" yerine geçer.
        var own = loader.ToInfo(db.LatestSnapshot(con, saveUid));

        Dictionary<string, object?>? Row(Dictionary<string, string> section, string idField, int id, string[] fields)
        {
            if (!schema.HasTable(section) || schema.Column(section, idField) is not { } idColumn) return null;
            using var cmd = con.CreateCommand();
            cmd.CommandText = $"SELECT {string.Join(',', fields.Select(f => schema.Select(section, f)))} FROM {schema.Table(section)} WHERE snapshot_id=$snap AND {idColumn}=$id LIMIT 1";
            cmd.Parameters.AddWithValue("$snap", snap.SnapshotId);
            cmd.Parameters.AddWithValue("$id", id);
            using var r = cmd.ExecuteReader();
            return r.Read() ? fields.Select((f, i) => (f, v: r.IsDBNull(i) ? null : r.GetValue(i))).ToDictionary(x => x.f, x => x.v) : null;
        }
        static int? Int(object? v) => v is null ? null : int.TryParse(Convert.ToString(v, CultureInfo.InvariantCulture), NumberStyles.Float, CultureInfo.InvariantCulture, out var n) ? n
            : double.TryParse(Convert.ToString(v, CultureInfo.InvariantCulture), NumberStyles.Float, CultureInfo.InvariantCulture, out var d) ? (int)Math.Round(d) : null;

        // Oyun tarzı: kayıtlı diziliş + takımın oyun kurma ve savunma derinliği.
        var team = Row(map.Team, "id", teamId, ["name", "clubWorth", "buildUpPlay", "defensiveDepth"]) ?? throw new NotFoundException("Takım bulunamadı.");
        string[] positionFields = Enumerable.Range(0, 11).Select(i => "position" + i).ToArray();
        var formation = Row(map.TeamFormation, "teamId", teamId, ["name", "offensiveRating", "defenders", "midfielders", "attackers", .. positionFields]);
        var slots = formation is null ? [] : positionFields.Select(f => Int(formation[f]) is { } code
            ? map.SlotPositions.GetValueOrDefault(code.ToString(CultureInfo.InvariantCulture)) : null).OfType<string>().ToArray();
        var formationName = Convert.ToString(formation?.GetValueOrDefault("name"));
        var depthValue = Int(team["defensiveDepth"]);
        var buildUp = Int(team["buildUpPlay"]);
        var leagueDepth = LeagueAverage(ctx.LeagueClubs?.Select(c => c.TeamId).ToArray() ?? [], "defensiveDepth");
        var tactics = new ClubTactics(formationName, Int(formation?.GetValueOrDefault("offensiveRating")),
            Int(formation?.GetValueOrDefault("offensiveRating")) is { } off ? cfg.OffensiveRatingLabels.GetValueOrDefault(off.ToString(CultureInfo.InvariantCulture)) : null,
            Int(formation?.GetValueOrDefault("defenders")), Int(formation?.GetValueOrDefault("midfielders")), Int(formation?.GetValueOrDefault("attackers")),
            slots, buildUp, buildUp is { } b ? map.BuildUpPlayLabels.GetValueOrDefault(b.ToString(CultureInfo.InvariantCulture)) : null,
            depthValue, DefensiveLineLabel(depthValue, cfg), leagueDepth is { } avg ? Math.Round(avg, 1) : null);

        // İhtiyaçlar: kayıtlı dizilişle (yoksa en yakın tanımlı dizilişle) kadro derinliği, kendi liginin kulüpleriyle kıyas.
        var (analysisFormation, exact) = ChooseFormation(ctx.Catalog, formationName, slots, ctx.SuggestedFormation);
        ClubNeeds? needs = null;
        if (analysisFormation is not null && ctx.Players.Count > 0)
        {
            var (formations, _) = DepthAnalysis.Compute(ctx, new ManagerProfile { Formation = analysisFormation });
            if (formations.FirstOrDefault() is { } depth)
            {
                var names = ctx.Players.ToDictionary(p => p.Id, p => p.Name);
                string? Name(int? id) => id is { } i ? names.GetValueOrDefault(i) : null;
                needs = new(depth.Formation, exact, depth.TeamReference, depth.League, depth.Lines ?? [],
                    depth.Slots.Select(s => new ReviewSlot(s.Slot, s.Position, s.Priority, s.NeedScore, s.StarterId, Name(s.StarterId), s.StarterRating,
                        s.RotationId, Name(s.RotationId), s.RotationRating, s.Conditional, s.Reasons)).ToArray());
            }
        }

        var worth = Int(team["clubWorth"]);
        return new(own, teamId, Convert.ToString(team["name"]) ?? "#" + teamId,
            tactics, Budget(worth, cfg.Budget), needs, ctx.Players.Count);

        double? LeagueAverage(int[] teams, string field)
        {
            if (teams.Length == 0 || !schema.HasTable(map.Team) || schema.Column(map.Team, "id") is not { } idColumn || schema.Column(map.Team, field) is not { } column) return null;
            using var cmd = con.CreateCommand();
            var ps = teams.Select((t, i) => { var p = "$t" + i; cmd.Parameters.AddWithValue(p, t); return p; }).ToArray();
            cmd.CommandText = $"SELECT AVG({column}) FROM {schema.Table(map.Team)} WHERE snapshot_id=$snap AND {idColumn} IN ({string.Join(',', ps)})";
            cmd.Parameters.AddWithValue("$snap", snap.SnapshotId);
            return cmd.ExecuteScalar() is { } v and not DBNull ? Convert.ToDouble(v, CultureInfo.InvariantCulture) : null;
        }
    }

    public static string? DefensiveLineLabel(int? depth, ClubReviewConfig cfg) => depth switch
    {
        null => null,
        var d when d < cfg.DefensiveLine.Deep => "Derin savunma çizgisi",
        var d when d > cfg.DefensiveLine.High => "Yüksek savunma çizgisi",
        _ => "Orta savunma çizgisi",
    };

    /// <summary>Kayıtlı dizilişin adı tanımlıysa o; değilse aynı 11 mevkiyle eşleşen ya da en çok ortak temel mevkisi olan tanımlı diziliş.</summary>
    public static (string? Formation, bool Exact) ChooseFormation(AnalysisConfig cfg, string? name, string[] slots, string? suggested)
    {
        if (name is not null && cfg.Formations.ContainsKey(name)) return (name, true);
        if (slots.Length == 11)
        {
            var same = cfg.Formations.FirstOrDefault(f => f.Value.Order().SequenceEqual(slots.Order())).Key;
            if (same is not null) return (same, true);
            var wanted = slots.Select(cfg.Position).ToArray();
            int Overlap(string[] candidate)
            {
                var left = wanted.ToList(); var hits = 0;
                foreach (var p in candidate.Select(cfg.Position)) if (left.Remove(p)) hits++;
                return hits;
            }
            var best = cfg.Formations.OrderByDescending(f => Overlap(f.Value)).ThenBy(f => f.Key, StringComparer.Ordinal).First();
            return (best.Key, false);
        }
        return suggested is not null && cfg.Formations.ContainsKey(suggested) ? (suggested, false) : (null, false);
    }

    public static ClubBudgetEstimate? Budget(int? clubWorth, ClubBudgetModel model)
    {
        if (clubWorth is not { } worth || worth <= 0 || model.Coefficient <= 0 || model.Exponent <= 0) return null;
        var estimate = model.Coefficient * Math.Pow(worth, model.Exponent);
        long Round(double v) => (long)(Math.Round(v / 10_000) * 10_000);
        // Kalibre edilen kulüplerin değer aralığının dışı: eğri uzatılıyor, rakam yalnız kaba bir işaret.
        var worths = model.Calibration.Select(c => c.ClubWorth).Where(w => w > 0).ToArray();
        var outside = worths.Length == 0 || worth > worths.Max() * 1.25 || worth < worths.Min() / 1.25;
        return new(worth, Round(estimate), Round(estimate * (1 - model.Spread)), Round(estimate * (1 + model.Spread)), model.Calibration.Count, outside);
    }
}

public sealed class ClubReviewConfig
{
    public string Version { get; set; } = "1";
    public ClubBudgetModel Budget { get; set; } = new();
    public Dictionary<string, string> OffensiveRatingLabels { get; set; } = [];
    public DefensiveLineBands DefensiveLine { get; set; } = new();
}
public sealed class ClubBudgetModel
{
    public double Coefficient { get; set; }
    public double Exponent { get; set; }
    public double Spread { get; set; } = 0.15;
    public List<BudgetCalibrationPoint> Calibration { get; set; } = [];
}
public sealed class BudgetCalibrationPoint
{
    public string? Club { get; set; }
    public string? League { get; set; }
    public long ClubWorth { get; set; }
    public long TransferBudgetStart { get; set; }
}
public sealed class DefensiveLineBands { public int Deep { get; set; } = 40; public int High { get; set; } = 60; }

public sealed record ClubTactics(string? Formation, int? OffensiveRating, string? OffensiveLabel, int? Defenders, int? Midfielders, int? Attackers,
    IReadOnlyList<string> Positions, int? BuildUpPlay, string? BuildUpLabel, int? DefensiveDepth, string? DefensiveLineLabel, double? LeagueDefensiveDepth);
public sealed record ClubBudgetEstimate(long ClubWorth, long Estimate, long Low, long High, int CalibrationPoints, bool OutsideCalibration);
public sealed record ReviewSlot(string Slot, string Position, string Priority, int? NeedScore, int? StarterId, string? StarterName, int? StarterRating,
    int? RotationId, string? RotationName, int? RotationRating, bool Conditional, IReadOnlyList<NeedReason> Reasons);
public sealed record ClubNeeds(string Formation, bool FormationExact, int? TeamReference, LeagueStrength? League,
    IReadOnlyList<LineBenchmark> Lines, IReadOnlyList<ReviewSlot> Slots);
public sealed record ClubReview(SnapshotInfo Snapshot, int TeamId, string TeamName, ClubTactics Tactics, ClubBudgetEstimate? Budget,
    ClubNeeds? Needs, int Players);
