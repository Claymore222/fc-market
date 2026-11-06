using System.Globalization;
using System.Text.Json;
using Dapper;
using FcMarket.Api.Data;

namespace FcMarket.Api.Market;

/// <summary>
/// Shortlist (app.db). Save başına tutulur. Oyuncu eklenirken o anki OVR/POT/kulüp saklanır; liste "eklendiğinden beri"
/// değişimi bunlarla hesaplar. Oyuna hiçbir şey yazılmaz.
/// </summary>
public sealed class ShortlistService(AppDb appDb, MarketService market, WatchlistFile? watchlist = null)
{
    public const int MaxNoteLength = 500, MaxTags = 10, MaxTagLength = 24;

    private sealed class Row
    {
        public string SaveUid { get; set; } = "";
        public long PlayerId { get; set; }
        public string? Note { get; set; }
        public string Tags { get; set; } = "[]";
        public long? TargetPrice { get; set; }
        public string AddedAt { get; set; } = "";
        public string? AddedName { get; set; }
        public string? AddedSnapshotId { get; set; }
        public string? AddedGameDate { get; set; }
        public long? AddedOverall { get; set; }
        public long? AddedPotential { get; set; }
        public long? AddedClubId { get; set; }
        public string? AddedClub { get; set; }
    }

    private const string Columns = "save_uid, player_id, note, tags, target_price, added_at, added_name, added_snapshot_id, " +
                                   "added_game_date, added_overall, added_potential, added_club_id, added_club";

    public ShortlistView List(string? saveUid)
    {
        var data = market.Get(saveUid);
        var save = data.Snapshot.SaveUid;
        using var con = appDb.Open();
        var rows = con.Query<Row>($"SELECT {Columns} FROM shortlist WHERE save_uid = @save ORDER BY added_at", new { save });

        var items = rows.Select(r =>
        {
            var p = data.Find((int)r.PlayerId);
            int? addedOvr = (int?)r.AddedOverall, addedClub = (int?)r.AddedClubId;
            return new ShortlistItem(
                (int)r.PlayerId, p?.Name ?? r.AddedName ?? $"#{r.PlayerId}", r.Note, ParseTags(r.Tags), r.TargetPrice, r.AddedAt, r.AddedSnapshotId,
                ParseDate(r.AddedGameDate), addedOvr, (int?)r.AddedPotential, addedClub, r.AddedClub,
                p,
                p?.Overall is { } now && addedOvr is { } then ? now - then : null,
                p is not null && p.ClubId != addedClub);
        }).ToList();

        return new ShortlistView(data.Snapshot, items, items.Count, items.Sum(i => i.TargetPrice ?? 0));
    }

    /// <summary>Haber akışı ve izleme için: save'deki shortlist oyuncuları.</summary>
    public HashSet<int> Ids(string saveUid)
    {
        using var con = appDb.Open();
        return con.Query<long>("SELECT player_id FROM shortlist WHERE save_uid = @saveUid", new { saveUid })
            .Select(x => (int)x).ToHashSet();
    }

    /// <summary>Ekler; zaten varsa dokunmaz. Oyuncu son snapshot'ta yoksa 404.</summary>
    public ShortlistItem Add(int playerId, string? saveUid)
    {
        var data = market.Get(saveUid);
        var save = data.Snapshot.SaveUid;
        var p = data.Find(playerId) ?? throw new NotFoundException($"Oyuncu bulunamadı: {playerId}");
        using (var con = appDb.Open())
        {
            con.Execute($"INSERT OR IGNORE INTO shortlist ({Columns}) VALUES (@save, @id, NULL, '[]', NULL, @at, @name, @snap, @date, " +
                        "@ovr, @pot, @clubId, @club)",
                new
                {
                    save, id = playerId, at = DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture), name = p.Name,
                    snap = data.Snapshot.SnapshotId, date = data.Snapshot.GameDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                    ovr = p.Overall, pot = p.Potential, clubId = p.ClubId, club = p.Club,
                });
        }
        watchlist?.Write();
        return List(save).Items.Single(i => i.PlayerId == playerId);
    }

    /// <summary>Not, etiket ve hedef fiyatı değiştirir (gönderilen değerler olduğu gibi yazılır, null temizler).</summary>
    public ShortlistItem Update(int playerId, string? saveUid, ShortlistUpdate body)
    {
        var save = market.Get(saveUid).Snapshot.SaveUid;
        var note = string.IsNullOrWhiteSpace(body.Note) ? null : body.Note.Trim();
        if (note is { Length: > MaxNoteLength }) throw new BadRequestException($"Not en fazla {MaxNoteLength} karakter olabilir");
        if (body.TargetPrice is < 0) throw new BadRequestException("Hedef fiyat negatif olamaz");
        var tags = (body.Tags ?? [])
            .Select(t => t.Trim()).Where(t => t.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        if (tags.Count > MaxTags || tags.Any(t => t.Length > MaxTagLength))
            throw new BadRequestException($"En fazla {MaxTags} etiket, her biri en fazla {MaxTagLength} karakter");

        using (var con = appDb.Open())
        {
            var n = con.Execute("UPDATE shortlist SET note = @note, tags = @tags, target_price = @price " +
                                "WHERE save_uid = @save AND player_id = @id",
                new { note, tags = JsonSerializer.Serialize(tags), price = body.TargetPrice, save, id = playerId });
            if (n == 0) throw new NotFoundException($"Oyuncu shortlist'te değil: {playerId}");
        }
        return List(save).Items.Single(i => i.PlayerId == playerId);
    }

    public void Remove(int playerId, string? saveUid)
    {
        var save = market.Get(saveUid).Snapshot.SaveUid;
        using (var con = appDb.Open())
            con.Execute("DELETE FROM shortlist WHERE save_uid = @save AND player_id = @id", new { save, id = playerId });
        watchlist?.Write();
    }

    private static IReadOnlyList<string> ParseTags(string json)
    {
        try { return JsonSerializer.Deserialize<List<string>>(json) ?? []; }
        catch (JsonException) { return []; }
    }

    private static DateOnly? ParseDate(string? s) =>
        DateOnly.TryParseExact(s, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d) ? d : null;
}

public sealed record ShortlistUpdate(string? Note, IReadOnlyList<string>? Tags, long? TargetPrice);

/// <param name="Name">Güncel ad; oyuncu artık yoksa eklendiği andaki ad.</param>
/// <param name="Player">Son snapshot'taki hali; oyuncu artık yoksa (emekli/silindi) null.</param>
/// <param name="OverallChange">Eklendiğinden beri OVR farkı.</param>
public sealed record ShortlistItem(
    int PlayerId, string Name, string? Note, IReadOnlyList<string> Tags, long? TargetPrice, string AddedAt, string? AddedSnapshotId,
    DateOnly? AddedGameDate, int? AddedOverall, int? AddedPotential, int? AddedClubId, string? AddedClub,
    MarketPlayer? Player, int? OverallChange, bool ClubChanged);

public sealed record ShortlistView(SnapshotInfo Snapshot, IReadOnlyList<ShortlistItem> Items, int Count, long TargetPriceTotal);
