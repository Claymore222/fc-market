using System.Globalization;
using FcMarket.Api.Data;
using FcMarket.Api.FieldMaps;
using FcMarket.Api.Market;
using Microsoft.Data.Sqlite;

namespace FcMarket.Api.Analysis;

public sealed record ArchivedTransferRow(DateOnly Date, string Season, int PlayerId, int FromTeamId, int ToTeamId, long? Fee, long? Wage, long? Clause, string Source);

public static class TransferEvidenceReader
{
    public static Dictionary<int, TransferEvidence> Read(SqliteConnection con, ResolvedSchema schema, string snapshot, DateOnly today, bool includeFree = false)
    {
        var map = schema.Map;
        var teams = schema.HasTable(map.Team) ? MarketLoader.Keyed(con, schema, map.Team, snapshot, "id", ["name"]) : new();
        string? TeamName(int id) => map.IsFreeAgentTeam(id) ? map.FreeAgents.Label : MarketLoader.Str(teams.GetValueOrDefault(id)?[0]);
        var rows = new List<(int Id, TransferEvidence Evidence)>();

        var section = map.TransferHistory;
        if (schema.HasTable(section) && schema.Column(section, "playerId") is not null)
        {
            string[] fields = ["playerId", "fromTeamId", "toTeamId", "amount", "date"];
            using var cmd = con.CreateCommand();
            cmd.CommandText = $"SELECT {string.Join(',', fields.Select(f => schema.Select(section, f)))} FROM {schema.Table(section)} WHERE snapshot_id=$snap";
            cmd.Parameters.AddWithValue("$snap", snapshot);
            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                object? V(int i) => reader.IsDBNull(i) ? null : reader.GetValue(i);
                if (MarketLoader.Int(V(0)) is not { } id || id <= 0 || MarketLoader.Long(V(3)) is not { } amount || amount < 0 ||
                    MarketLoader.Int(V(1)) is not { } from || from < 0 || MarketLoader.Int(V(2)) is not { } to || to <= 0 || from == to || MarketLoader.Int(V(4)) is not { } encoded) continue;
                DateOnly? date = null;
                if (map.TransferHistoryDateEncoding == "epochDays" && encoded > 0 && encoded <= today.DayNumber - map.Epoch.DayNumber)
                    date = map.Epoch.AddDays(encoded);
                else if (map.TransferHistoryDateEncoding == "yyyyMMdd" && DateOnly.TryParseExact(encoded.ToString(CultureInfo.InvariantCulture), "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var ymd)) date = ymd;
                if (date is null || date.Value.Year < 1900 || date > today) continue;
                rows.Add((id, new(amount, date.Value, from, TeamName(from), to, TeamName(to), snapshot)));
            }
        }

        var careerSec = map.CareerTransfer;
        if (schema.HasTable(careerSec) && schema.Column(careerSec, "playerId") is not null)
        {
            string[] fields = ["playerId", "fromTeamId", "toTeamId", "fee", "date"];
            using var cmd = con.CreateCommand();
            cmd.CommandText = $"SELECT {string.Join(',', fields.Select(f => schema.Select(careerSec, f)))} FROM {schema.Table(careerSec)} WHERE snapshot_id=$snap";
            cmd.Parameters.AddWithValue("$snap", snapshot);
            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                object? V(int i) => reader.IsDBNull(i) ? null : reader.GetValue(i);
                if (MarketLoader.Int(V(0)) is not { } id || id <= 0 || MarketLoader.Long(V(3)) is not { } amount ||
                    (includeFree ? amount < 0 : amount <= 0) ||
                    MarketLoader.Int(V(1)) is not { } from || from < 0 || MarketLoader.Int(V(2)) is not { } to || to <= 0 || from == to ||
                    MarketLoader.Int(V(4)) is not { } encoded ||
                    !DateOnly.TryParseExact(encoded.ToString(CultureInfo.InvariantCulture), "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) ||
                    date.Year < 1900 || date > today) continue;
                rows.Add((id, new(amount, date, from, TeamName(from), to, TeamName(to), snapshot)));
            }
        }

        if (CareerDb.TableExists(con, "career_transfer_archive") && CareerDb.TableExists(con, "snapshots"))
        {
            using var metaCmd = con.CreateCommand();
            metaCmd.CommandText = "SELECT save_uid, COALESCE(branch, 0) FROM snapshots WHERE snapshot_id=$snap LIMIT 1";
            metaCmd.Parameters.AddWithValue("$snap", snapshot);
            using var mr = metaCmd.ExecuteReader();
            if (mr.Read() && !mr.IsDBNull(0))
            {
                var uid = mr.GetString(0);
                var branch = mr.GetInt64(1);
                mr.Close();
                foreach (var ar in ReadArchiveRows(con, uid, branch, today))
                {
                    if (ar.Fee is not { } amount || (includeFree ? amount < 0 : amount <= 0)) continue;
                    rows.Add((ar.PlayerId, new(amount, ar.Date, ar.FromTeamId, TeamName(ar.FromTeamId), ar.ToTeamId, TeamName(ar.ToTeamId), snapshot)));
                }
            }
        }

        var result = new Dictionary<int, TransferEvidence>();
        foreach (var group in rows.GroupBy(r => r.Id))
        {
            var latest = group.Max(r => r.Evidence.Date);
            var events = group.Where(r => r.Evidence.Date == latest).Select(r => r.Evidence).Distinct().ToArray();
            // Two incompatible same-day records cannot establish a unique last fee.
            if (events.Length == 1) result[group.Key] = events[0];
        }
        return result;
    }

    public static List<ArchivedTransferRow> ReadArchiveRows(SqliteConnection con, string saveUid, long activeBranch, DateOnly today)
    {
        if (!CareerDb.TableExists(con, "career_transfer_archive")) return [];
        var raw = new List<(long Branch, ArchivedTransferRow Row)>();
        using var cmd = con.CreateCommand();
        cmd.CommandText = "SELECT branch, season, source, transfer_date, playerid, from_teamid, to_teamid, fee, wage, clause " +
                          "FROM career_transfer_archive WHERE save_uid = $uid AND transfer_date <= $today";
        cmd.Parameters.AddWithValue("$uid", saveUid);
        cmd.Parameters.AddWithValue("$today", today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
        using var r = cmd.ExecuteReader();
        while (r.Read())
        {
            object? V(int i) => r.IsDBNull(i) ? null : r.GetValue(i);
            var br = MarketLoader.Long(V(0)) ?? 0;
            var season = MarketLoader.Str(V(1)) ?? "";
            var source = MarketLoader.Str(V(2)) ?? "world";
            if (MarketLoader.Str(V(3)) is not { } dstr ||
                !DateOnly.TryParseExact(dstr, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) ||
                date.Year < 1900 || date > today) continue;
            if (MarketLoader.Int(V(4)) is not { } pid || pid <= 0 ||
                MarketLoader.Int(V(5)) is not { } from || from < 0 ||
                MarketLoader.Int(V(6)) is not { } to || to <= 0 || from == to) continue;
            raw.Add((br, new ArchivedTransferRow(date, season, pid, from, to, MarketLoader.Long(V(7)), MarketLoader.Long(V(8)), MarketLoader.Long(V(9)), source)));
        }
        if (raw.Count == 0) return [];

        // Her sezon için en güncel dünya tablosunu seç (aktif dal o sezonda dünya tablosuna sahipse ve geri kalmamışsa öncelikli).
        var chosenWorldBranch = new Dictionary<string, long>(StringComparer.Ordinal);
        foreach (var g in raw.Where(x => x.Row.Source == "world").GroupBy(x => x.Row.Season, StringComparer.Ordinal))
        {
            var maxDate = g.Max(x => x.Row.Date);
            var best = g.GroupBy(x => x.Branch)
                .OrderByDescending(b => b.Key == activeBranch && b.Max(x => x.Row.Date) >= maxDate)
                .ThenByDescending(b => b.Max(x => x.Row.Date))
                .ThenByDescending(b => b.Count())
                .ThenByDescending(b => b.Key == activeBranch)
                .First().Key;
            chosenWorldBranch[g.Key] = best;
        }

        var dedup = new Dictionary<(DateOnly Date, int PlayerId, int FromTeamId, int ToTeamId), ArchivedTransferRow>();
        foreach (var (br, row) in raw
            .Where(x => x.Row.Source != "world" || (chosenWorldBranch.TryGetValue(x.Row.Season, out var wb) && x.Branch == wb))
            .OrderByDescending(x => x.Branch == activeBranch)
            .ThenByDescending(x => x.Row.Date))
        {
            dedup.TryAdd((row.Date, row.PlayerId, row.FromTeamId, row.ToTeamId), row);
        }
        return dedup.Values.ToList();
    }
}
