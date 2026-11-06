using System.Globalization;
using System.Text.Json;

namespace FcMarket.Api.FieldMaps;

/// <summary>
/// config/field-map.json: kanonik isim -> ham DB alanı. Kod ham alan adlarını yalnızca buradan okur.
/// Her tablo bölümü (player, names, ...) bir sözlüktür; "table" anahtarı export tablo adıdır.
/// </summary>
public sealed class FieldMap
{
    public const string TableKey = "table";

    public Dictionary<string, string> Player { get; set; } = new();
    /// <summary>Analiz özellikleri: kanonik ad → mevcut players özellik alanı. Genel ekranlar için zorunlu değildir.</summary>
    public Dictionary<string, string> AnalysisAttributes { get; set; } = new();
    public Dictionary<string, string> Names { get; set; } = new();
    public Dictionary<string, string> Team { get; set; } = new();
    public Dictionary<string, string> LeagueTeamLink { get; set; } = new();
    public Dictionary<string, string> League { get; set; } = new();
    public Dictionary<string, string> Nation { get; set; } = new();
    public Dictionary<string, string> Contract { get; set; } = new();
    public Dictionary<string, string> Stats { get; set; } = new();
    /// <summary>Kadro bağlantısı (teamplayerlinks): forma no, kadro yeri (ilk 11 pozisyon kodu / yedek / rezerv), form.</summary>
    public Dictionary<string, string> SquadLink { get; set; } = new();
    public Dictionary<string, string> Loan { get; set; } = new();
    public Dictionary<string, string> TransferHistory { get; set; } = new();
    public string TransferHistoryDateEncoding { get; set; } = "epochDays";
    /// <summary>Fikstür (fixtures): tarih 1582-10-14'ten gün, saat ssdd. DOĞRULANACAK.</summary>
    public Dictionary<string, string> Fixture { get; set; } = new();
    /// <summary>Oyuncu maç puanları (career_playermatchratinghistory): tarih yyyymmdd. DOĞRULANACAK.</summary>
    public Dictionary<string, string> MatchRating { get; set; } = new();
    public Dictionary<string, string> YouthPlayer { get; set; } = new();
    public Dictionary<string, string> Scout { get; set; } = new();
    public Dictionary<string, string> TeamOfWeek { get; set; } = new();
    public Dictionary<string, string> PlayerAward { get; set; } = new();
    public Dictionary<string, string> ManagerAward { get; set; } = new();
    public Dictionary<string, string> SeasonGrowth { get; set; } = new();
    public Dictionary<string, string> CareerCompetition { get; set; } = new();
    public Dictionary<string, string> CareerFixture { get; set; } = new();
    public Dictionary<string, string> CareerStanding { get; set; } = new();
    public Dictionary<string, string> CareerStat { get; set; } = new();
    public Dictionary<string, string> CareerRecentMatch { get; set; } = new();
    public Dictionary<string, string> CareerMorale { get; set; } = new();
    public Dictionary<string, string> CareerFitness { get; set; } = new();
    public Dictionary<string, string> CareerScoutNetwork { get; set; } = new();
    public Dictionary<string, string> CareerBoardObjectives { get; set; } = new();
    public Dictionary<string, string> CareerManager { get; set; } = new();
    public Dictionary<string, string> CareerSuspensions { get; set; } = new();
    public Dictionary<string, string> CareerPreseason { get; set; } = new();
    public Dictionary<string, string> CareerFinance { get; set; } = new();
    public Dictionary<string, string> CareerTransfer { get; set; } = new();
    public Dictionary<string, string> CareerTransaction { get; set; } = new();
    public Dictionary<string, string> CareerSeasonHistory { get; set; } = new();
    public Dictionary<string, string> CareerFinanceCategory { get; set; } = new();
    public Dictionary<string, string> CareerObjectiveLabels { get; set; } = new();
    public Dictionary<string, string> CareerObjectiveStatusLabels { get; set; } = new();
    /// <summary>Finans hareketi türü (careerTransaction.kind) → ad.</summary>
    public Dictionary<string, string> TransactionKinds { get; set; } = new();
    /// <summary>Lig dışı yarışma kodu (careerCompetition.code) → ad.</summary>
    public Dictionary<string, string> CompetitionLabels { get; set; } = new();
    /// <summary>Sözleşme yılı bu değerse gerçek sözleşme yoktur (akademi yer tutucusu).</summary>
    public int? ContractPlaceholderYear { get; set; }

    public string BirthdateEpoch { get; set; } = "1582-10-14";
    /// <summary>player.gender bu değerse kadın oyuncu; Market:IncludeWomen kapalıyken piyasada gösterilmez.</summary>
    public int? WomenGenderCode { get; set; }
    public FreeAgentsMap FreeAgents { get; set; } = new();
    /// <summary>Kanonik oyuncu alanına eklenecek sabit (skillMoves oyunda 0 tabanlı: 0–4 → 1–5 yıldız).</summary>
    public Dictionary<string, int> ValueOffsets { get; set; } = new();
    public Dictionary<string, string> Positions { get; set; } = new();
    /// <summary>Kadro yeri kodları (squadLink.slot): diziliş pozisyonları; ana pozisyon kodlarından daha ayrıntılı.</summary>
    public Dictionary<string, string> SlotPositions { get; set; } = new();
    public SquadSlotsMap SquadSlots { get; set; } = new();
    /// <summary>team.buildUpPlay kodu → etiket ("2" → "Dengeli").</summary>
    public Dictionary<string, string> BuildUpPlayLabels { get; set; } = new();
    public Dictionary<string, List<string>> PositionGroups { get; set; } = new();
    public Dictionary<string, string> Feet { get; set; } = new();
    public Dictionary<string, List<string>> AttributeGroups { get; set; } = new();
    public string? GoalkeeperGroup { get; set; }
    /// <summary>Oyuncu detayındaki özellik kategorileri (oyunun 7 başlığı: Hücum, Beceri, ... Kaleci); radar attributeGroups'u kullanır.</summary>
    public Dictionary<string, List<string>> AttributeCategories { get; set; } = new();
    /// <summary>Kart değerleri: pace/shooting/passing/dribbling/defending/physical → (ham özellik → ağırlık). Tahmini.</summary>
    public Dictionary<string, Dictionary<string, double>> CardStats { get; set; } = new();
    /// <summary>Taktik rol kodu (kod % 100) → ad ve mevki; kod ≥ 100 "++" seviyesi.</summary>
    public Dictionary<string, RoleLabel> Roles { get; set; } = new();
    /// <summary>Oyun stili bit numarası (trait1: 0–31, trait2: 32+) → ad.</summary>
    public Dictionary<string, string> PlayStyles { get; set; } = new();
    /// <summary>Oyun stili grubu → bit numaraları (shooting, passing, defending, ballControl, physical, goalkeeper).</summary>
    public Dictionary<string, int[]> PlayStyleCategories { get; set; } = new();
    public PlayerTraitLabels PlayerTraits { get; set; } = new();
    public AccelerationTypeRule AccelerationType { get; set; } = new();
    public Dictionary<string, string> AttributeLabels { get; set; } = new();

    /// <summary>Tüm tablo bölümleri, bölüm adıyla.</summary>
    public IEnumerable<(string Section, Dictionary<string, string> Map)> Sections()
    {
        yield return ("player", Player);
        yield return ("names", Names);
        yield return ("team", Team);
        yield return ("leagueTeamLink", LeagueTeamLink);
        yield return ("league", League);
        yield return ("nation", Nation);
        yield return ("contract", Contract);
        yield return ("stats", Stats);
        yield return ("squadLink", SquadLink);
        yield return ("loan", Loan);
        yield return ("transferHistory", TransferHistory);
        yield return ("fixture", Fixture);
        yield return ("matchRating", MatchRating);
        yield return ("youthPlayer", YouthPlayer);
        yield return ("scout", Scout);
        yield return ("teamOfWeek", TeamOfWeek);
        yield return ("playerAward", PlayerAward);
        yield return ("managerAward", ManagerAward);
        yield return ("seasonGrowth", SeasonGrowth);
        yield return ("careerCompetition", CareerCompetition);
        yield return ("careerFixture", CareerFixture);
        yield return ("careerStanding", CareerStanding);
        yield return ("careerStat", CareerStat);
        yield return ("careerRecentMatch", CareerRecentMatch);
        yield return ("careerMorale", CareerMorale);
        yield return ("careerFitness", CareerFitness);
        yield return ("careerScoutNetwork", CareerScoutNetwork);
        yield return ("careerBoardObjectives", CareerBoardObjectives);
        yield return ("careerManager", CareerManager);
        yield return ("careerSuspensions", CareerSuspensions);
        yield return ("careerPreseason", CareerPreseason);
        yield return ("careerFinance", CareerFinance);
        yield return ("careerTransfer", CareerTransfer);
        yield return ("careerTransaction", CareerTransaction);
        yield return ("careerSeasonHistory", CareerSeasonHistory);
        yield return ("careerFinanceCategory", CareerFinanceCategory);
    }

    public IEnumerable<string> AllAttributes() => AttributeGroups.Values.SelectMany(a => a).Distinct();

    public DateOnly Epoch =>
        DateOnly.TryParseExact(BirthdateEpoch, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)
            ? d
            : new DateOnly(1582, 10, 14);

    public string? PositionLabel(int? code) =>
        code is null or < 0 ? null
        : Positions.TryGetValue(code.Value.ToString(CultureInfo.InvariantCulture), out var label) ? label
        : $"P{code}";

    public string? PositionGroupOf(string? label) =>
        label is null ? null : PositionGroups.FirstOrDefault(g => g.Value.Contains(label)).Key;

    public string? FootLabel(int? code) =>
        code is null ? null
        : Feet.TryGetValue(code.Value.ToString(CultureInfo.InvariantCulture), out var label) ? label
        : code.Value.ToString(CultureInfo.InvariantCulture);

    public int? WithOffset(string canonical, int? value) =>
        value is { } v && ValueOffsets.TryGetValue(canonical, out var offset) ? v + offset : value;

    public bool IsFreeAgentTeam(int? teamId) => teamId is { } t && FreeAgents.TeamIds.Contains(t);

    public static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
    };

    public static FieldMap Load(string path) =>
        JsonSerializer.Deserialize<FieldMap>(File.ReadAllText(path), JsonOptions)
        ?? throw new InvalidDataException($"field-map boş: {path}");
}

/// <summary>Vücut tipi, duygu durumu ve büyüme profili kodları → etiket.</summary>
public sealed class PlayerTraitLabels
{
    public Dictionary<string, string> BodyTypes { get; set; } = new();
    public string UniqueBodyType { get; set; } = "Özel";
    public Dictionary<string, string> Emotions { get; set; } = new();
    public Dictionary<string, string> GrowthProfiles { get; set; } = new();
}

/// <summary>Hızlanma tipi (oyunda alan yok) boy, çeviklik, güç ve hızlanmadan çıkarılır.</summary>
public sealed class AccelerationTypeRule
{
    public int LengthyMinHeight { get; set; } = 188;
    public int LengthyMinStrengthOverAgility { get; set; } = 10;
    public int ExplosiveMaxHeight { get; set; } = 182;
    public int ExplosiveMinAgilityOverStrength { get; set; } = 10;
    public int ExplosiveMinAccelerationOverSprint { get; set; } = -3;

    /// <returns>"Uzun", "Patlayıcı", "Kontrollü"; özellik eksikse null.</returns>
    public string? Classify(int? height, int? agility, int? strength, int? acceleration, int? sprint)
    {
        if (height is not { } h || agility is not { } a || strength is not { } s) return null;
        if (h >= LengthyMinHeight && s - a >= LengthyMinStrengthOverAgility) return "Uzun";
        if (h <= ExplosiveMaxHeight && a - s >= ExplosiveMinAgilityOverStrength
            && acceleration is { } ac && sprint is { } sp && ac - sp >= ExplosiveMinAccelerationOverSprint) return "Patlayıcı";
        return "Kontrollü";
    }
}

public sealed class RoleLabel
{
    public string Name { get; set; } = "";
    public string Position { get; set; } = "";
}

/// <summary>squadLink.slot'ta ilk 11 dışı değerler: yedek kulübesi ve rezerv.</summary>
public sealed class SquadSlotsMap
{
    public int Bench { get; set; } = 28;
    public int Reserve { get; set; } = 29;
}

/// <summary>
/// Serbest oyuncuların bağlı olduğu takımlar (FC 27: "NG - FA"). Kulüp adı yerine Label gösterilir; sözleşme yılı
/// ve maaş anlamsız olduğu için boş sayılır.
/// </summary>
public sealed class FreeAgentsMap
{
    public List<int> TeamIds { get; set; } = new();
    public string Label { get; set; } = "Serbest";
}

/// <summary>Dosya değişince field-map'i yeniden yükler (Faz 0'da eşlemeyi düzeltirken yeniden başlatma gerekmesin).</summary>
public sealed class FieldMapProvider(string path, ILogger<FieldMapProvider> logger)
{
    private readonly object _lock = new();
    private DateTime _loadedStamp;
    private FieldMap? _current;

    public string Path { get; } = path;
    public string? Error { get; private set; }
    /// <summary>Her yeniden yüklemede artar; piyasa cache anahtarına girer.</summary>
    public int Version { get; private set; }

    public FieldMap Current
    {
        get
        {
            lock (_lock)
            {
                var stamp = File.Exists(Path) ? File.GetLastWriteTimeUtc(Path) : DateTime.MinValue;
                if (_current is not null && stamp == _loadedStamp) return _current;
                try
                {
                    _current = FieldMap.Load(Path);
                    Error = null;
                    logger.LogInformation("field-map yüklendi: {Path}", Path);
                }
                catch (Exception ex)
                {
                    Error = $"field-map okunamadı: {ex.Message}";
                    logger.LogError("{Error}", Error);
                    _current ??= new FieldMap();
                }
                _loadedStamp = stamp;
                Version++;
                return _current;
            }
        }
    }
}
