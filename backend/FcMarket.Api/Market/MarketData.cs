using System.Globalization;
using System.Text;
using System.Text.Json.Serialization;
using FcMarket.Api.Data;
using FcMarket.Api.Domain;

namespace FcMarket.Api.Market;

/// <summary>Piyasa tablosunun bir satırı: kanonik alanlar + türetilmiş metrikler. Liste DTO'su olarak da serileşir.</summary>
public sealed class MarketPlayer
{
    public int Id { get; init; }
    public string Name { get; init; } = "";
    public int? Age { get; init; }
    public DateOnly? BirthDate { get; init; }
    public string? Position { get; init; }
    public string? Position2 { get; init; }
    public IReadOnlyList<string> Positions { get; init; } = [];
    public string? PositionGroup { get; init; }
    public int? Overall { get; init; }
    public int? Potential { get; init; }
    /// <summary>Önceki snapshot'a göre OVR farkı (gelişim oku).</summary>
    public int? OvrDelta { get; init; }
    public double? GrowthPerMonth { get; init; }
    public int? NationId { get; init; }
    public string? Nation { get; init; }
    /// <summary>ISO 3166 iki harfli ülke kodu (bayrak için); bilinmiyorsa null.</summary>
    public string? NationCode { get; init; }
    public int? ClubId { get; init; }
    public string? Club { get; init; }
    /// <summary>Kulübü field-map'teki serbest oyuncu takımlarından biri; aktif sözleşme/maaş boş, kaynak tutar ayrı.</summary>
    public bool IsFreeAgent { get; init; }
    public int? LeagueId { get; init; }
    public string? League { get; init; }
    public int? FootCode { get; init; }
    public string? Foot { get; init; }
    public int? Height { get; init; }
    public int? Weight { get; init; }
    public int? SkillMoves { get; init; }
    public int? WeakFoot { get; init; }
    public long? Wage { get; init; }
    /// <summary>Kaynakta tutulan maaş; serbest oyuncuda aktif sözleşme veya maaş talebi anlamına gelmez.</summary>
    public long? RecordedWage { get; init; }
    public int? ContractEnd { get; init; }
    public int? ContractYearsLeft { get; init; }
    public long? Value { get; init; }
    public int? Opportunity { get; init; }
    /// <summary>Kart değerleri (field-map cardStats ile hesaplanan, tahmini).</summary>
    public int? Pace { get; init; }
    public int? Shooting { get; init; }
    public int? Passing { get; init; }
    public int? Dribbling { get; init; }
    public int? Defending { get; init; }
    public int? Physical { get; init; }
    /// <summary>Doğrudan kayıtlı kaleci özellikleri; kart değeri tahmini değildir.</summary>
    public int? GkDiving { get; init; }
    public int? GkHandling { get; init; }
    public int? GkKicking { get; init; }
    public int? GkReflexes { get; init; }
    public int? GkPositioning { get; init; }
    [JsonIgnore] public IReadOnlyList<int> RoleCodes { get; init; } = [];
    [JsonIgnore] public IReadOnlyList<string> NaturalPositionGroups { get; init; } = [];
    [JsonIgnore] public IReadOnlyList<int> PlayStyleIds { get; init; } = [];
    [JsonIgnore] public IReadOnlyList<int> PlayStylePlusIds { get; init; } = [];

    [JsonIgnore] public string SearchKey { get; init; } = "";
    [JsonIgnore] public ValueBreakdown ValueBreakdown { get; init; } = null!;
    [JsonIgnore] public OpportunityBreakdown OpportunityBreakdown { get; init; } = null!;

    /// <summary>Aramada büyük/küçük harf ve aksan farkını yok say ("İ", "ı", "ş" ...).</summary>
    public static string Normalize(string s)
    {
        var d = s.Replace('ı', 'i').Replace('İ', 'I').Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(d.Length);
        foreach (var ch in d)
            if (CharUnicodeInfo.GetUnicodeCategory(ch) != UnicodeCategory.NonSpacingMark)
                sb.Append(char.ToLowerInvariant(ch));
        return sb.ToString();
    }
}

/// <param name="CareerKey">API'de saveUid parametresine verilecek anahtar ("save" ya da "save@dal").</param>
public sealed record SnapshotInfo(
    string SnapshotId, string SaveUid, DateOnly GameDate, int SeasonEndYear, string? ExportedAt,
    int? UserTeamId, string? UserTeamName, long? TransferBudget, long? WageBudget, long? Branch = null,
    string? CareerKey = null, string Source = "export", long Revision = 0);

/// <summary>Bir snapshot'ın bellekteki piyasası. Filtre/sıralama burada yapılır (20k oyuncu için ms mertebesi).</summary>
public sealed class MarketData
{
    public required SnapshotInfo Snapshot { get; init; }
    public SnapshotInfo? Previous { get; init; }
    public required ResolvedSchema Schema { get; init; }
    public required IReadOnlyList<MarketPlayer> Players { get; init; }
    public DateTime LoadedAt { get; } = DateTime.UtcNow;

    private Dictionary<int, MarketPlayer>? _byId;
    public MarketPlayer? Find(int id) => (_byId ??= Players.ToDictionary(p => p.Id)).GetValueOrDefault(id);

    private static readonly StringComparer TrCompare = StringComparer.Create(new CultureInfo("tr-TR"), CompareOptions.IgnoreCase);
    private readonly System.Collections.Concurrent.ConcurrentDictionary<string, Lazy<Dictionary<string, int>>> _ranks = new();

    /// <summary>
    /// Metin alanı için Türkçe alfabetik sıra numarası. Kültüre duyarlı karşılaştırma pahalı olduğu için
    /// her alanın farklı değerleri bir kez sıralanır, sıralama sırasında tamsayı karşılaştırılır.
    /// </summary>
    public IReadOnlyDictionary<string, int> Ranks(string field, Func<MarketPlayer, string?> selector) =>
        _ranks.GetOrAdd(field, _ => new Lazy<Dictionary<string, int>>(() =>
            Players.Select(selector).OfType<string>().Distinct().Order(TrCompare)
                .Select((v, i) => (v, i)).ToDictionary(x => x.v, x => x.i))).Value;

    private const int MaxSortedOrders = 32;
    private readonly System.Collections.Concurrent.ConcurrentDictionary<string, Lazy<MarketPlayer[]>> _sorted = new();

    /// <summary>
    /// Tüm oyuncuların verilen sıralamadaki hali. 20k oyuncuyu her istekte sıralamak 30–60 ms sürüyor;
    /// snapshot değişmediği sürece her sıralama bir kez hesaplanır.
    /// </summary>
    public IReadOnlyList<MarketPlayer> Sorted(string key, Func<MarketPlayer[]> sort)
    {
        if (_sorted.Count >= MaxSortedOrders && !_sorted.ContainsKey(key)) _sorted.Clear();
        return _sorted.GetOrAdd(key, _ => new Lazy<MarketPlayer[]>(sort)).Value;
    }
}
