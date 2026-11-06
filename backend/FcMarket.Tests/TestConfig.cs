using FcMarket.Api.Data;
using FcMarket.Api.Domain;
using FcMarket.Api.FieldMaps;
using Microsoft.Extensions.Configuration;

namespace FcMarket.Tests;

/// <summary>Testler gerçek appsettings.json ve config/field-map.json'u kullanır: formül ile config senkron kalsın.</summary>
public static class TestConfig
{
    public static readonly string RepoRoot = FindRepoRoot();

    private static readonly IConfiguration Config = new ConfigurationBuilder()
        .AddJsonFile(Path.Combine(RepoRoot, "backend", "FcMarket.Api", "appsettings.json"))
        .Build();

    public static ValuationOptions Valuation => Config.GetSection("Valuation").Get<ValuationOptions>()!;
    public static OpportunityOptions Opportunity => Config.GetSection("Opportunity").Get<OpportunityOptions>()!;
    public static SeasonOptions Season => Config.GetSection("Season").Get<SeasonOptions>()!;
    public static MarketOptions Market => Config.GetSection("Market").Get<MarketOptions>()!;

    public static FieldMap FieldMap => FieldMap.Load(Path.Combine(RepoRoot, "config", "field-map.json"));

    public static ReloadingJsonFile<PositionRatingConfig> PositionRatingsFile =>
        new(Path.Combine(RepoRoot, "config", "position-ratings.json"), Microsoft.Extensions.Logging.Abstractions.NullLogger.Instance);

    private static string FindRepoRoot()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
            if (File.Exists(Path.Combine(dir.FullName, "config", "field-map.json")))
                return dir.FullName;
        throw new InvalidOperationException("Repo kökü bulunamadı");
    }
}
