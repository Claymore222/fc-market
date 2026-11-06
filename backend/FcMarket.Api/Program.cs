using System.Net;
using FcMarket.Api.Data;
using FcMarket.Api.Domain;
using FcMarket.Api.Endpoints;
using FcMarket.Api.FieldMaps;
using FcMarket.Api.Market;
using FcMarket.Api.Analysis;
using Microsoft.Extensions.FileProviders;

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

// Göreli yollar repo köküne göre çözülür (config/field-map.json'ı içeren ilk üst klasör).
var repoRoot = FindRepoRoot(builder.Environment.ContentRootPath);
string Resolve(string path) => Path.GetFullPath(Path.IsPathRooted(path) ? path : Path.Combine(repoRoot, path));

var dbPath = Resolve(Environment.GetEnvironmentVariable("FC_CAREER_DB") ?? config["Paths:FcCareerDb"] ?? "fc_career.db");
var fieldMapPath = Resolve(Environment.GetEnvironmentVariable("FC_FIELD_MAP") ?? config["Paths:FieldMap"] ?? "config/field-map.json");
var frontendDist = Resolve(config["Paths:FrontendDist"] ?? "frontend/dist");
var positionRatingsPath = Resolve(config["Paths:PositionRatings"] ?? "config/position-ratings.json");
var facesDir = Resolve(Environment.GetEnvironmentVariable("FC_FACES_DIR") ?? config["Paths:FacesDir"] ?? "faces");
var crestsDir = Resolve(Environment.GetEnvironmentVariable("FC_CRESTS_DIR") ?? config["Paths:CrestsDir"] ?? "crests");
var flagsDir = Resolve(Environment.GetEnvironmentVariable("FC_FLAGS_DIR") ?? config["Paths:FlagsDir"] ?? "flags");
var trophiesDir = Resolve(Environment.GetEnvironmentVariable("FC_TROPHIES_DIR") ?? config["Paths:TrophiesDir"] ?? "trophies");
var leagueLogosDir = Resolve(Environment.GetEnvironmentVariable("FC_LEAGUE_LOGOS_DIR") ?? config["Paths:LeagueLogosDir"] ?? "league-logos");
var playStylesDir = Resolve(Environment.GetEnvironmentVariable("FC_PLAYSTYLES_DIR") ?? config["Paths:PlayStylesDir"] ?? "playstyle-icons");
var appDbPath = Resolve(Environment.GetEnvironmentVariable("FC_APP_DB") ?? config["Paths:AppDb"] ?? "app.db");
// fc_export.lua'nın OUT_DIR'i: günlük export'un izleme listesi (watchlist.txt) buraya yazılır. Varsayılan: fc_career.db'nin klasörü.
var exportDir = Resolve(Environment.GetEnvironmentVariable("FC_EXPORT_DIR") ?? config["Paths:ExportDir"] ?? Path.GetDirectoryName(dbPath)!);

// Güvenlik: varsayılan olarak yalnızca 127.0.0.1. LAN'a açmak için Server:Host ayarı (README'deki uyarıya bak).
var host = IPAddress.Parse(config["Server:Host"] ?? "127.0.0.1");
var port = config.GetValue("Server:Port", 5127);
builder.WebHost.ConfigureKestrel(k => k.Listen(host, port));

T Bind<T>(string section) where T : new() => config.GetSection(section).Get<T>() ?? new T();
builder.Services.AddSingleton(Bind<ValuationOptions>("Valuation"));
builder.Services.AddSingleton(Bind<OpportunityOptions>("Opportunity"));
builder.Services.AddSingleton(Bind<SeasonOptions>("Season"));
builder.Services.AddSingleton(Bind<MarketOptions>("Market"));
builder.Services.AddSingleton(Bind<FeedOptions>("Feed"));
builder.Services.AddSingleton(new CareerDb(dbPath));
builder.Services.AddSingleton(sp => new FieldMapProvider(fieldMapPath, sp.GetRequiredService<ILogger<FieldMapProvider>>()));
builder.Services.AddSingleton(sp => new ReloadingJsonFile<PositionRatingConfig>(positionRatingsPath,
    sp.GetRequiredService<ILoggerFactory>().CreateLogger("PositionRatings")));
builder.Services.AddSingleton(new FaceStore(facesDir));
builder.Services.AddSingleton(new GameImages(new FaceStore(crestsDir), new FaceStore(flagsDir), new FaceStore(trophiesDir),
    new FaceStore(leagueLogosDir)));
builder.Services.AddSingleton(sp => new PlayStyleIcons(Resolve("config/playstyle-assets.json"), playStylesDir,
    new HttpClient { Timeout = TimeSpan.FromSeconds(15) }, sp.GetRequiredService<ILogger<PlayStyleIcons>>()));
builder.Services.AddSingleton<Valuator>();
builder.Services.AddSingleton<OpportunityScorer>();
builder.Services.AddSingleton<MarketLoader>();
builder.Services.AddSingleton<MarketService>();
builder.Services.AddSingleton<RegenService>();
builder.Services.AddSingleton(new AppDb(appDbPath));
// Kayıt yedekleri: paket %LOCALAPPDATA%\FcMarket\save-backups (masaüstü verir), geliştirme saveimport'un varsayılanı.
var backupsDir = Resolve(Environment.GetEnvironmentVariable("FC_SAVE_BACKUPS_DIR") ?? "scratch/saveimport/backups");
builder.Services.AddSingleton(new StorageInfo(dbPath, appDbPath, exportDir, backupsDir,
    [facesDir, crestsDir, flagsDir, trophiesDir, leagueLogosDir, playStylesDir]));
builder.Services.AddSingleton(sp => new ReloadingJsonFile<AnalysisConfig>(Resolve("config/squad-analysis.json"), sp.GetRequiredService<ILoggerFactory>().CreateLogger("SquadAnalysisConfig")));
builder.Services.AddSingleton<SquadAnalysisService>();
builder.Services.AddSingleton(sp => new ReloadingJsonFile<RecruitmentConfig>(Resolve("config/recruitment-profiles.json"), sp.GetRequiredService<ILoggerFactory>().CreateLogger("RecruitmentConfig")));
builder.Services.AddSingleton<RecruitmentService>();
builder.Services.AddSingleton<RecruitmentBoardService>();
builder.Services.AddSingleton(sp => new ReloadingJsonFile<TransferPlanConfig>(Resolve("config/transfer-plans.json"), sp.GetRequiredService<ILoggerFactory>().CreateLogger("TransferPlanConfig")));
builder.Services.AddSingleton(sp => new ReloadingJsonFile<TransferSuggestionConfig>(Resolve("config/transfer-suggestions.json"), sp.GetRequiredService<ILoggerFactory>().CreateLogger("TransferSuggestionConfig")));
builder.Services.AddSingleton<TransferPlanService>();
builder.Services.AddSingleton(sp => new WatchlistFile(exportDir, sp.GetRequiredService<AppDb>(), sp.GetRequiredService<ILogger<WatchlistFile>>()));
builder.Services.AddSingleton<ShortlistService>();
builder.Services.AddSingleton<FeedService>();
builder.Services.AddSingleton<ClubService>();
builder.Services.AddSingleton<MatchAnalysisService>();
// Enum'lar JSON'da adıyla (SquadRole: "XI", "Sub" ...).
builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter()));
builder.Services.AddProblemDetails();

var app = builder.Build();
app.Services.GetRequiredService<WatchlistFile>().Write(); // uygulama açılırken güncel liste

// Yazan istekler (shortlist) yalnızca bu uygulamanın kendi sayfasından gelebilir: başka bir sitenin tarayıcı
// üzerinden 127.0.0.1'e POST atmasını engeller. Origin başlığı olmayan istekler (curl, testler) serbest.
app.Use(async (ctx, next) =>
{
    var method = ctx.Request.Method;
    if (!HttpMethods.IsGet(method) && !HttpMethods.IsHead(method) && !HttpMethods.IsOptions(method)
        && ctx.Request.Headers.Origin is [{ } origin]
        && !(Uri.TryCreate(origin, UriKind.Absolute, out var o)
             && string.Equals(o.Authority, ctx.Request.Host.Value, StringComparison.OrdinalIgnoreCase)))
    {
        await Results.Problem(statusCode: StatusCodes.Status403Forbidden, title: "Başka bir siteden yazma isteği reddedildi")
            .ExecuteAsync(ctx);
        return;
    }
    await next();
});

app.Use(async (ctx, next) =>
{
    try
    {
        await next();
    }
    catch (Exception ex) when (ex is DataUnavailableException or NotFoundException or BadRequestException or AnalysisConflictException)
    {
        var status = ex switch
        {
            NotFoundException => StatusCodes.Status404NotFound,
            BadRequestException => StatusCodes.Status400BadRequest,
            AnalysisConflictException => StatusCodes.Status409Conflict,
            _ => StatusCodes.Status503ServiceUnavailable,
        };
        await Results.Problem(statusCode: status, title: ex.Message).ExecuteAsync(ctx);
    }
});

app.MapApi();

if (Directory.Exists(frontendDist))
{
    // Derlenmiş frontend'i aynı porttan sun: tek komutla ayağa kalkma (Windows'ta start.ps1).
    var files = new PhysicalFileProvider(frontendDist);
    app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = files });
    app.UseStaticFiles(new StaticFileOptions { FileProvider = files });
    app.MapFallbackToFile("{*path:nonfile}", "index.html", new StaticFileOptions { FileProvider = files });
}

var log = app.Services.GetRequiredService<ILogger<Program>>();
log.LogInformation("fc_career.db: {Db} (salt-okunur)", dbPath);
log.LogInformation("field-map:    {FieldMap}", fieldMapPath);
log.LogInformation("app.db:       {AppDb}", appDbPath);
log.LogInformation("yüzler:       {Faces}{Note}", facesDir, Directory.Exists(facesDir) ? "" : " (klasör yok, baş harfler gösterilecek)");
log.LogInformation("armalar:      {Crests}{Note}", crestsDir, Directory.Exists(crestsDir) ? "" : " (klasör yok, renkli kalkan gösterilecek)");
log.LogInformation("frontend:     {Dist}", Directory.Exists(frontendDist) ? frontendDist : "(derlenmemiş, Vite dev server kullan)");
if (!IPAddress.IsLoopback(host))
    log.LogWarning("DİKKAT: Backend {Host} adresini dinliyor, yerel ağdaki herkes erişebilir. Kimlik doğrulama yok.", host);

// Açılışta field-map'i kontrol et; sorun varsa sadece log'a yaz (çökme yok).
try
{
    using var con = app.Services.GetRequiredService<CareerDb>().Open();
    var schema = ResolvedSchema.FromDb(app.Services.GetRequiredService<FieldMapProvider>().Current, con);
    foreach (var w in schema.Warnings) log.LogWarning("field-map: {Warning}", w);
    if (schema.Warnings.Count == 0) log.LogInformation("field-map doğrulandı, eksik alan yok");
}
catch (Exception ex)
{
    log.LogWarning("Veritabanı henüz kullanılamıyor: {Message}", ex.Message);
}

// İlk isteği beklemeden son snapshot'ı belleğe al (20k oyuncuda ~1 sn).
_ = Task.Run(() =>
{
    try { app.Services.GetRequiredService<MarketService>().Get(null); }
    catch (Exception ex) { log.LogDebug("Ön yükleme atlandı: {Message}", ex.Message); }
});

app.Run();

static string FindRepoRoot(string start)
{
    for (var dir = new DirectoryInfo(start); dir is not null; dir = dir.Parent)
        if (File.Exists(Path.Combine(dir.FullName, "config", "field-map.json")))
            return dir.FullName;
    return Directory.GetCurrentDirectory();
}

public partial class Program;
