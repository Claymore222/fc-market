namespace FcMarket.Api.Domain;

/// <summary>config/position-ratings.json: pozisyon → (ham özellik adı → ağırlık).</summary>
public sealed class PositionRatingConfig
{
    /// <summary>Ana pozisyonun hesaplanan genelini DB'deki OVR'a eşitleyip diğerlerini aynı farkla kaydır.</summary>
    public bool CalibrateToOverall { get; set; } = true;
    /// <summary>Ağırlığın en az bu oranı bilinen özelliklerden gelmeli, yoksa pozisyon geneli boş.</summary>
    public double MinKnownWeight { get; set; } = 0.5;
    public Dictionary<string, Dictionary<string, double>> Positions { get; set; } = new();
}

public sealed record PositionRating(string Position, int? Rating);

/// <summary>
/// Oyuncunun her pozisyondaki geneli (oyundaki "pozisyon genelleri" ekranı gibi).
/// FC bu değerleri DB'de tutmaz, özelliklerden hesaplar; burada aynı yaklaşım ağırlıklı ortalamayla yapılır.
/// </summary>
public static class PositionRatings
{
    public static IReadOnlyList<PositionRating> Compute(PositionRatingConfig cfg, IReadOnlyDictionary<string, int?> attributes,
        string? primaryPosition, int? overall)
    {
        var raw = cfg.Positions.ToDictionary(p => p.Key, p => Raw(p.Value, attributes, cfg.MinKnownWeight));

        double offset = 0;
        if (cfg.CalibrateToOverall && overall is { } ovr && primaryPosition is not null
            && raw.TryGetValue(primaryPosition, out var primaryRaw) && primaryRaw is { } pr)
            offset = ovr - pr;

        return raw.Select(r => new PositionRating(r.Key,
                r.Value is { } v ? Math.Clamp((int)Math.Round(v + offset, MidpointRounding.AwayFromZero), 1, 99) : null))
            .ToList();
    }

    /// <summary>Bilinen özelliklerin ağırlıklı ortalaması (yuvarlanmamış); bilinen ağırlık yetersizse null.</summary>
    public static double? Raw(Dictionary<string, double> weights, IReadOnlyDictionary<string, int?> attributes, double minKnownWeight)
    {
        double total = 0, known = 0, sum = 0;
        foreach (var (attr, w) in weights)
        {
            if (w <= 0) continue;
            total += w;
            if (attributes.TryGetValue(attr, out var v) && v is { } value)
            {
                known += w;
                sum += w * value;
            }
        }
        if (total <= 0 || known / total < minKnownWeight) return null;
        return sum / known;
    }
}
