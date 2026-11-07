using FcMarket.Api.Data;
using FcMarket.Api.Domain;
using FcMarket.Api.FieldMaps;
using FcMarket.Api.Market;
using FcMarket.Api.Analysis;

namespace FcMarket.Api.Endpoints;

public static class ApiEndpoints
{
    public static void MapApi(this WebApplication app)
    {
        var api = app.MapGroup("/api");

        api.MapGet("/health", Health);
        api.MapGet("/saves", (MarketService m) => m.Saves());
        api.MapGet("/sync", (MarketService m, string? saveUid) => m.Sync(saveUid));
        api.MapGet("/settings/theme", (AppDb app) => new ThemeSetting(app.Setting("theme")));
        api.MapPut("/settings/theme", (AppDb app, ThemeSetting body) =>
        {
            if (!ThemeSetting.Valid(body.Theme)) throw new BadRequestException("Geçersiz tema.");
            app.SaveSetting("theme", body.Theme!);
            return body;
        });
        api.MapGet("/settings/storage", (StorageInfo s) => s.Get());
        api.MapGet("/analysis/profile", (SquadAnalysisService a, string? saveUid) => a.Get(saveUid));
        api.MapGet("/matches", (MatchAnalysisService m, string? saveUid, int? limit, int? competitionId) => m.Get(saveUid, limit ?? 5, competitionId));
        api.MapPut("/analysis/profile", (SquadAnalysisService a, string? saveUid, SaveManagerProfile body) => a.Save(saveUid, body));
        api.MapPost("/analysis/run", (SquadAnalysisService a, string? saveUid, SaveManagerProfile body) => a.Run(saveUid, body));
        api.MapGet("/analysis/{id}/candidates", (RecruitmentService r, string id, string? saveUid, string formation, string slot) => r.Get(saveUid, id, formation, slot));
        api.MapGet("/recruitment/board", (RecruitmentBoardService r, string? saveUid) => r.Get(saveUid));
        api.MapGet("/recruitment/plan", (TransferPlanService p, string? saveUid) => p.Get(saveUid));
        api.MapPost("/recruitment/plan/preview", (TransferPlanService p, string? saveUid, TransferPlanRequest body) => p.Preview(saveUid, body));
        api.MapPost("/recruitment/plan/suggestions", (TransferPlanService p, string? saveUid, TransferPlanSuggestionRequest body) => p.Suggest(saveUid, body));
        api.MapPut("/recruitment/plan", (TransferPlanService p, string? saveUid, TransferPlanRequest body) => p.Save(saveUid, body));
        api.MapGet("/club/review", (ClubReviewService r, string? saveUid, int teamId) => r.Get(saveUid, teamId));
        api.MapGet("/regens", (RegenService r, string? saveUid) => r.Get(saveUid));
        api.MapGet("/snapshots", (MarketService m, string? saveUid) => m.Snapshots(saveUid));
        api.MapGet("/filters/options", (MarketService m, string? saveUid) => m.FilterOptions(saveUid));
        api.MapGet("/players", (MarketService m, [AsParameters] PlayerQuery q) => m.Players(q));
        api.MapGet("/players/{id:int}", (MarketService m, int id, string? saveUid) => m.Detail(id, saveUid));
        api.MapGet("/players/{id:int}/history", (MarketService m, int id, string? saveUid) => m.History(id, saveUid));
        api.MapGet("/players/{id:int}/face", (FaceStore faces, int id) =>
            faces.Find(id) is { } f ? Results.File(f.Path, f.ContentType) : Results.NotFound());
        api.MapGet("/teams/{id:int}/crest", (GameImages images, int id) =>
            images.Crests.Find(id) is { } f ? Results.File(f.Path, f.ContentType) : Results.NotFound());
        api.MapGet("/nations/{id:int}/flag", (GameImages images, int id) =>
            images.Flags.Find(id) is { } f ? Results.File(f.Path, f.ContentType) : Results.NotFound());
        api.MapGet("/competitions/{id:int}/trophy", (GameImages images, int id) =>
            images.Trophies?.Find(id) is { } f ? Results.File(f.Path, f.ContentType) : Results.NotFound());
        api.MapGet("/leagues/{id:int}/logo", (GameImages images, int id) =>
            images.Leagues?.Find(id) is { } f ? Results.File(f.Path, f.ContentType) : Results.NotFound());
        api.MapGet("/playstyles/{slug}", async (PlayStyleIcons icons, string slug, CancellationToken cancel) =>
            await icons.Find(slug, cancel) is { } path ? Results.File(path, "image/png") : Results.NotFound());
        api.MapGet("/shortlist", (ShortlistService s, string? saveUid) => s.List(saveUid));
        api.MapPost("/shortlist/{id:int}", (ShortlistService s, int id, string? saveUid) => s.Add(id, saveUid));
        api.MapPut("/shortlist/{id:int}", (ShortlistService s, int id, string? saveUid, ShortlistUpdate body) =>
            s.Update(id, saveUid, body));
        api.MapDelete("/shortlist/{id:int}", (ShortlistService s, int id, string? saveUid) =>
        {
            s.Remove(id, saveUid);
            return Results.NoContent();
        });
        api.MapGet("/feed", (FeedService f, [AsParameters] FeedQuery q) => f.Get(q));
        api.MapGet("/club", (ClubService c, string? saveUid, int? teamId) => c.Get(saveUid, teamId));
        api.MapGet("/teams", (ClubService c, string? saveUid) => c.Teams(saveUid));
        api.Map("/{**rest}", () => Results.Problem(statusCode: 404, title: "Bilinmeyen API yolu"));
    }

    public sealed record HealthReport(
        string Status, DateTime CheckedAt, DatabaseHealth Database, SnapshotInfo? LatestSnapshot, FieldMapHealth FieldMap);

    public sealed record DatabaseHealth(string Path, bool Ok, string? Error, int SnapshotCount, int SaveCount, int EventCount);

    public sealed record FieldMapHealth(string Path, string? Error, IReadOnlyList<string> Warnings);

    /// <summary>Hiç fırlatmaz: DB yoksa bile 200 döner, sorun gövdede raporlanır (UI sarı banner gösterir).</summary>
    private static HealthReport Health(CareerDb db, FieldMapProvider fieldMaps, MarketLoader loader,
        ReloadingJsonFile<PositionRatingConfig> positionRatings)
    {
        var map = fieldMaps.Current;
        var warnings = new List<string>();
        string? dbError = null;
        SnapshotInfo? latest = null;
        int snapshots = 0, saves = 0, events = 0;

        try
        {
            using var con = db.Open();
            var schema = ResolvedSchema.FromDb(map, con);
            warnings.AddRange(schema.Warnings);
            if (positionRatings.Error is { } prError) warnings.Add(prError);
            if (schema.HasTable(map.Player))
                warnings.AddRange(positionRatings.Current.Positions
                    .SelectMany(p => p.Value.Keys.Select(a => (Pos: p.Key, Attr: a)))
                    .Where(x => schema.RawColumn(map.Player, x.Attr) is null)
                    .GroupBy(x => x.Attr)
                    .Select(g => $"position-ratings: Alan yok: {map.Player[FieldMap.TableKey]}.{g.Key} ({string.Join(", ", g.Select(x => x.Pos))})"));
            if (CareerDb.TableExists(con, "snapshots"))
            {
                var all = db.Snapshots(con);
                snapshots = all.Count;
                saves = all.Select(s => s.SaveUid).Distinct().Count();
                if (all.Count > 0) latest = loader.ToInfo(db.LatestSnapshot(con, null));
                else dbError = "Veritabanında hiç snapshot yok.";
            }
            else dbError = "snapshots tablosu yok. Importer henüz hiç çalışmamış.";

            if (CareerDb.TableExists(con, "events"))
                events = Dapper.SqlMapper.ExecuteScalar<int>(con, "SELECT COUNT(*) FROM events");
        }
        catch (Exception ex) when (ex is DataUnavailableException or Microsoft.Data.Sqlite.SqliteException)
        {
            dbError = ex.Message;
        }

        var status = dbError is not null ? "error"
            : warnings.Count > 0 || fieldMaps.Error is not null ? "degraded"
            : "ok";

        return new HealthReport(status, DateTime.UtcNow,
            new DatabaseHealth(db.Path, dbError is null, dbError, snapshots, saves, events),
            latest,
            new FieldMapHealth(fieldMaps.Path, fieldMaps.Error, warnings));
    }
}

/// <summary>Palettes are defined by the frontend; the API only stores a well-formed id.</summary>
public sealed record ThemeSetting(string? Theme)
{
    public static bool Valid(string? theme) => theme is { Length: >= 2 and <= 20 } && theme.All(char.IsAsciiLetterLower);
}
