namespace FcMarket.Api.Domain;

// Tüm katsayılar appsettings.json'da. Koleksiyonlara burada varsayılan verilmez:
// configuration binder listeleri birleştirdiği için değerler yalnızca config'den gelir.

public sealed class ValuationOptions
{
    public double BaseValue { get; set; } = 1_500_000;
    public double BaseOverall { get; set; } = 60;
    public double Exponent { get; set; } = 0.16;

    public int YoungMaxAge { get; set; } = 21;
    public double YoungPotentialFactor { get; set; } = 0.04;
    public double YoungMaxMultiplier { get; set; } = 2.0;
    /// <summary>YoungMaxAge'den sonraki yaş bantları, MaxAge'e göre artan; sonuncusu üst sınırsız sayılır.</summary>
    public List<AgeBand> AgeBands { get; set; } = new();

    /// <summary>Kalan sözleşme yılı -> çarpan ("0", "1"); listede yoksa ContractDefault.</summary>
    public Dictionary<string, double> ContractMultipliers { get; set; } = new();
    public double ContractDefault { get; set; } = 1.0;

    /// <summary>Pozisyon etiketi -> çarpan; listede yoksa PositionDefault.</summary>
    public Dictionary<string, double> PositionMultipliers { get; set; } = new();
    public double PositionDefault { get; set; } = 1.0;

    public long RoundTo { get; set; } = 50_000;

    /// <summary>
    /// true: yaş çarpanı bantlar yerine sürekli eğri: exp(YouthPremiumPerYear × (PeakAge − yaş)) zirvenin altında,
    /// exp(−AgeDeclinePerYear × (yaş − PeakAge)) üstünde. CMTracker değerlerine log-doğrusal uyumla kalibre edilir.
    /// </summary>
    public bool AgeCurve { get; set; }
    public int PeakAge { get; set; } = 24;
    public double AgeDeclinePerYear { get; set; }
    public double YouthPremiumPerYear { get; set; }

    /// <summary>Maaş çarpanı (wage / ReferenceWage)^WageElasticity; esneklik 0 ya da maaş bilinmiyorsa 1.</summary>
    public double ReferenceWage { get; set; } = 10_000;
    public double WageElasticity { get; set; }
}

public sealed class AgeBand
{
    public int MaxAge { get; set; }
    public double Multiplier { get; set; }
}

public sealed class OpportunityOptions
{
    /// <summary>Bileşen anahtarı (growthRoom, growthRate, contract, age) -> ağırlık.</summary>
    public Dictionary<string, double> Weights { get; set; } = new();
    public double GrowthRoomMax { get; set; } = 20;
    public double GrowthRateMax { get; set; } = 1.0;
    /// <summary>Kalan sözleşme yılı -> ucuzluk puanı (0–1); listede yoksa ContractDefault.</summary>
    public Dictionary<string, double> ContractScores { get; set; } = new();
    public double ContractDefault { get; set; } = 0;
    public int AgeFull { get; set; } = 21;
    public int AgeZero { get; set; } = 30;
}

public sealed class SeasonOptions
{
    /// <summary>Yeni sezonun başladığı ay. Bu aydan itibaren sezon bitiş yılı = yıl + 1.</summary>
    public int StartMonth { get; set; } = 7;
}

public sealed class MarketOptions
{
    /// <summary>Gelişim hızı için geriye bakılan snapshot sayısı (son N).</summary>
    public int GrowthWindowSnapshots { get; set; } = 6;
    public int DefaultPageSize { get; set; } = 100;
    public int MaxPageSize { get; set; } = 500;
    /// <summary>Kapalıyken field-map'teki womenGenderCode'lu oyuncular piyasaya hiç yüklenmez.</summary>
    public bool IncludeWomen { get; set; }
}
