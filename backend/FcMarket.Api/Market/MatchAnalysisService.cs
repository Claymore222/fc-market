using Dapper;
using FcMarket.Api.Data;
using FcMarket.Api.FieldMaps;

namespace FcMarket.Api.Market;

/// <summary>Score-based analysis only. Detailed match metrics are not inferred from season totals.</summary>
public sealed class MatchAnalysisService(CareerDb db, FieldMapProvider maps, MarketLoader loader, ILogger<MatchAnalysisService> logger)
{
    public MatchAnalysisView Get(string? saveUid, int limit = 5, int? competitionId = null)
    {
        if (limit is not (5 or 10 or 20) || competitionId is < 0) throw new BadRequestException("Maç aralığı veya yarışma geçersiz.");
        using var con = db.Open();
        con.Execute("BEGIN;");
        try
        {
            var selected = db.LatestSnapshot(con, saveUid);
            var snapshot = loader.ToInfo(selected);
            var schema = ResolvedSchema.FromDb(maps.Current, con);
            // Daily snapshots can carry forward blocks without their original observation day. Prefer an
            // actual save checkpoint and expose its date, rather than labelling inherited data as current.
            var availableSources = schema.HasTable(schema.Map.CareerFixture)
                ? con.Query<string>($"SELECT DISTINCT snapshot_id FROM {schema.Table(schema.Map.CareerFixture)}").ToHashSet() : [];
            var source = db.Snapshots(con, selected.SaveUid).Where(s => s.Source == "save" && s.Branch == selected.Branch && s.Date <= selected.Date && availableSources.Contains(s.SnapshotId))
                .OrderByDescending(s => s.SnapshotId == selected.SnapshotId).ThenByDescending(s => s.Date).ThenByDescending(s => s.ExportedAt, StringComparer.Ordinal).FirstOrDefault();
            var sourceId = source?.SnapshotId;
            var blocks = sourceId is null ? null : CareerBlocks.Load(con, schema, sourceId, allowFallback: false);
            var sourceInfo = blocks is { Fixtures.Count: > 0 } ? loader.ToInfo(source!) : null;
            Dictionary<int, string> Names(Dictionary<string, string> section)
            {
                if (sourceId is null || !schema.HasTable(section)) return [];
                using var cmd = con.CreateCommand();
                cmd.CommandText = $"SELECT {schema.Select(section, "id")},{schema.Select(section, "name")} FROM {schema.Table(section)} WHERE snapshot_id=$snap";
                cmd.Parameters.AddWithValue("$snap", sourceId);
                var result = new Dictionary<int, string>();
                using var r = cmd.ExecuteReader();
                while (r.Read()) if (MarketLoader.Int(r.IsDBNull(0) ? null : r.GetValue(0)) is { } id && !r.IsDBNull(1)) result.TryAdd(id, r.GetString(1));
                return result;
            }
            var teams = Names(schema.Map.Team); var leagues = Names(schema.Map.League);
            string Comp(int id) => CareerBlocks.CompetitionName(blocks?.CompetitionCodes.GetValueOrDefault(id),
                league => leagues.GetValueOrDefault(league), schema.Map.CompetitionLabels) ?? $"Yarışma #{id}";
            var all = blocks is null || snapshot.UserTeamId is null ? [] : blocks.TeamFixtures(snapshot.UserTeamId.Value)
                .Where(f => f.Played && f.Date <= source!.Date && f.HomeGoals is >= 0 and <= 99 && f.AwayGoals is >= 0 and <= 99)
                .DistinctBy(f => (f.CompetitionId, f.Date, f.Time, f.HomeSlot, f.AwaySlot, f.Round))
                .OrderByDescending(f => f.Date).ThenByDescending(f => f.Time).ThenBy(f => f.Index).ToArray();
            var competitions = all.Select(f => new MatchCompetition(f.CompetitionId, Comp(f.CompetitionId))).DistinctBy(c => c.Id).OrderBy(c => c.Name).ToArray();
            var filtered = all.Where(f => competitionId is null || f.CompetitionId == competitionId).ToArray();
            var matches = filtered.Take(limit).Select(f =>
            {
                var home = blocks!.TeamOf(f.HomeSlot) == snapshot.UserTeamId;
                var gf = (home ? f.HomeGoals : f.AwayGoals)!.Value; var ga = (home ? f.AwayGoals : f.HomeGoals)!.Value;
                var opponentId = blocks.TeamOf(home ? f.AwaySlot : f.HomeSlot);
                return new AnalysedMatch(f.Index, f.Date, f.CompetitionId, Comp(f.CompetitionId), home, opponentId,
                    opponentId is { } opp ? teams.GetValueOrDefault(opp) ?? $"Takım #{opp}" : "Rakip bilinmiyor",
                    gf, ga, gf > ga ? "W" : gf < ga ? "L" : "D");
            }).ToArray();
            var summary = matches.Length == 0 ? null : new MatchSummary(matches.Length, matches.Count(m => m.Result == "W"),
                matches.Count(m => m.Result == "D"), matches.Count(m => m.Result == "L"), matches.Sum(m => m.GoalsFor), matches.Sum(m => m.GoalsAgainst),
                matches.Count(m => m.GoalsAgainst == 0), matches.Count(m => m.GoalsFor > 0));
            logger.LogInformation("Match summary {Scope} selected {Selected} source {Source} revision {Revision} played {Total} window {Window}",
                snapshot.CareerKey, snapshot.SnapshotId, sourceInfo?.SnapshotId, sourceInfo?.Revision, filtered.Length, matches.Length);
            return new(snapshot, sourceInfo, limit, filtered.Length, matches, summary, competitions);
        }
        finally { con.Execute("ROLLBACK;"); }
    }
}

public sealed record AnalysedMatch(int Id, DateOnly Date, int CompetitionId, string Competition, bool IsHome,
    int? OpponentId, string Opponent, int GoalsFor, int GoalsAgainst, string Result);
public sealed record MatchSummary(int Played, int Won, int Drawn, int Lost, int GoalsFor, int GoalsAgainst, int CleanSheets, int ScoredGames);
public sealed record MatchCompetition(int Id, string Name);
public sealed record MatchAnalysisView(SnapshotInfo Snapshot, SnapshotInfo? FixtureSource, int Limit, int Available,
    IReadOnlyList<AnalysedMatch> Matches, MatchSummary? Summary, IReadOnlyList<MatchCompetition> Competitions);
