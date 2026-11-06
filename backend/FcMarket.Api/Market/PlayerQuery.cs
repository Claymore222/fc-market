using System.Globalization;

namespace FcMarket.Api.Market;

public sealed class BadRequestException(string message) : Exception(message);

/// <summary>/api/players sorgu parametreleri. Liste parametreleri virgülle ayrılır (pos=ST,CAM).</summary>
public sealed class PlayerQuery
{
    public string? SaveUid { get; set; }
    public string? Q { get; set; }
    public int? AgeMin { get; set; }
    public int? AgeMax { get; set; }
    /// <summary>Pozisyon etiketleri ya da grupları: "ST,CAM" veya "DEF".</summary>
    public string? Pos { get; set; }
    public int? OvrMin { get; set; }
    public int? OvrMax { get; set; }
    public int? PotMin { get; set; }
    public int? PotMax { get; set; }
    public string? League { get; set; }
    public string? Club { get; set; }
    public string? Nation { get; set; }
    /// <summary>Sözleşmesi bu yıl ya da öncesinde bitenler.</summary>
    public int? ContractEndsBy { get; set; }
    /// <summary>true: yalnız serbest oyuncular; false: serbest oyuncular hariç.</summary>
    public bool? FreeAgent { get; set; }
    public long? WageMin { get; set; }
    public long? WageMax { get; set; }
    public int? ContractYearsMin { get; set; }
    public int? ContractYearsMax { get; set; }
    public int? WeakFootMin { get; set; }
    public int? SkillMovesMin { get; set; }
    public string? Role { get; set; }
    public int? RoleLevelMin { get; set; }
    public string? PlayStyle { get; set; }
    public string? PlayStylePlus { get; set; }
    public bool? IncludeSecondary { get; set; }
    public long? ValueMin { get; set; }
    public long? ValueMax { get; set; }
    /// <summary>Ayak etiketi ya da kodu ("Sol" veya "2").</summary>
    public string? Foot { get; set; }
    public int? OppMin { get; set; }
    /// <summary>Çoklu sıralama: "pot,ovr". Yön dir ile aynı sırada: "desc,asc".</summary>
    public string? Sort { get; set; }
    public string? Dir { get; set; }
    /// <summary>1'den başlar.</summary>
    public int? Page { get; set; }
    public int? PageSize { get; set; }
}

public sealed record PagedPlayers(
    SnapshotInfo Snapshot, int Total, int Page, int PageSize, IReadOnlyList<MarketPlayer> Items);

public static class MarketQuery
{
    public static readonly IReadOnlyDictionary<string, Func<MarketData, bool, Comparison<MarketPlayer>>> Sorts =
        new Dictionary<string, Func<MarketData, bool, Comparison<MarketPlayer>>>(StringComparer.OrdinalIgnoreCase)
        {
            ["name"] = (m, d) => ByText(m, "name", p => p.Name, d),
            ["age"] = (_, d) => By(p => p.Age, d),
            ["pos"] = (m, d) => ByText(m, "pos", p => p.Position, d),
            ["ovr"] = (_, d) => By(p => p.Overall, d),
            ["pot"] = (_, d) => By(p => p.Potential, d),
            ["delta"] = (_, d) => By(p => p.OvrDelta, d),
            ["growth"] = (_, d) => By(p => p.GrowthPerMonth, d),
            ["club"] = (m, d) => ByText(m, "club", p => p.Club, d),
            ["league"] = (m, d) => ByText(m, "league", p => p.League, d),
            ["nation"] = (m, d) => ByText(m, "nation", p => p.Nation, d),
            ["foot"] = (m, d) => ByText(m, "foot", p => p.Foot, d),
            ["height"] = (_, d) => By(p => p.Height, d),
            ["value"] = (_, d) => By(p => p.Value, d),
            ["opportunity"] = (_, d) => By(p => p.Opportunity, d),
            ["contract"] = (_, d) => By(p => p.ContractEnd, d),
            ["wage"] = (_, d) => By(p => p.Wage ?? p.RecordedWage, d),
            ["pac"] = (_, d) => By(p => p.Pace, d),
            ["sho"] = (_, d) => By(p => p.Shooting, d),
            ["pas"] = (_, d) => By(p => p.Passing, d),
            ["dri"] = (_, d) => By(p => p.Dribbling, d),
            ["def"] = (_, d) => By(p => p.Defending, d),
            ["phy"] = (_, d) => By(p => p.Physical, d),
            ["gkDiving"] = (_, d) => By(p => p.GkDiving, d),
            ["gkHandling"] = (_, d) => By(p => p.GkHandling, d),
            ["gkKicking"] = (_, d) => By(p => p.GkKicking, d),
            ["gkReflexes"] = (_, d) => By(p => p.GkReflexes, d),
            ["gkPositioning"] = (_, d) => By(p => p.GkPositioning, d),
        };

    public static PagedPlayers Run(MarketData data, PlayerQuery q, int defaultPageSize, int maxPageSize)
    {
        var pageSize = Math.Clamp(q.PageSize ?? defaultPageSize, 1, maxPageSize);
        var page = Math.Max(1, q.Page ?? 1);

        // Tüm oyuncular sıralama başına bir kez sıralanır; filtre sıralı listeyi süzer, sıra bozulmaz.
        var keys = ParseSort(q.Sort, q.Dir);
        var sorted = data.Sorted(string.Join(",", keys.Select(k => $"{k.Key}:{(k.Desc ? "desc" : "asc")}")), () =>
        {
            var all = data.Players.ToArray();
            Array.Sort(all, BuildComparison(data, keys));
            return all;
        });

        var skip = (page - 1) * pageSize;
        var total = 0;
        var items = new List<MarketPlayer>(pageSize);
        foreach (var p in Filter(sorted, q))
        {
            if (total >= skip && items.Count < pageSize) items.Add(p);
            total++;
        }
        return new PagedPlayers(data.Snapshot, total, page, pageSize, items);
    }

    /// <summary>
    /// Yeni snapshot'ın ilk isteği beklemesin: varsayılan sıralama ve metin alanlarının sıra numaraları
    /// (20k isim için ~35 ms) önceden hesaplanır.
    /// </summary>
    public static void Warm(MarketData data)
    {
        Run(data, new PlayerQuery(), 1, 1);
        foreach (var make in Sorts.Values) make(data, true);
    }

    public static IEnumerable<MarketPlayer> Filter(IEnumerable<MarketPlayer> players, PlayerQuery q)
    {
        var term = string.IsNullOrWhiteSpace(q.Q) ? null : MarketPlayer.Normalize(q.Q.Trim());
        var pos = Csv(q.Pos)?.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var leagues = Ints(q.League, "league");
        var clubs = Ints(q.Club, "club");
        var nations = Ints(q.Nation, "nation");
        var feet = Csv(q.Foot)?.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var roles = Ints(q.Role, "role");
        var styles = Ints(q.PlayStyle, "playStyle");
        var plusStyles = Ints(q.PlayStylePlus, "playStylePlus");
        ValidateRange(q.WageMin, q.WageMax, "Maaş");
        ValidateRange(q.ContractYearsMin, q.ContractYearsMax, "Sözleşme süresi");
        if (q.WeakFootMin is < 1 or > 5 || q.SkillMovesMin is < 1 or > 5)
            throw new BadRequestException("Yıldız sınırı 1–5 olmalı.");
        if (q.RoleLevelMin is < 1 or > 2) throw new BadRequestException("Rol seviyesi 1 (+) veya 2 (++) olmalı.");
        if (styles?.Any(b => b is < 0 or > 63) == true || plusStyles?.Any(b => b is < 0 or > 63) == true)
            throw new BadRequestException("Oyun stili kodu 0–63 olmalı.");
        if (roles?.Any(b => b is < 1 or > 99) == true) throw new BadRequestException("Rol kodu 1–99 olmalı.");

        foreach (var p in players)
        {
            if (term is not null && !p.SearchKey.Contains(term, StringComparison.Ordinal)) continue;
            if (!InRange(p.Age, q.AgeMin, q.AgeMax)) continue;
            if (!InRange(p.Overall, q.OvrMin, q.OvrMax)) continue;
            if (!InRange(p.Potential, q.PotMin, q.PotMax)) continue;
            if (pos is not null && !(p.Position is { } pl && pos.Contains(pl)) && !(p.PositionGroup is { } pg && pos.Contains(pg))
                && !(q.IncludeSecondary == true && (p.Positions.Any(pos.Contains) || p.NaturalPositionGroups.Any(pos.Contains)))) continue;
            if (leagues is not null && !(p.LeagueId is { } l && leagues.Contains(l))) continue;
            if (clubs is not null && !(p.ClubId is { } c && clubs.Contains(c))) continue;
            if (nations is not null && !(p.NationId is { } n && nations.Contains(n))) continue;
            if (q.ContractEndsBy is { } by && !p.IsFreeAgent && !(p.ContractEnd is { } e && e <= by)) continue;
            if (q.FreeAgent is { } fa && p.IsFreeAgent != fa) continue;
            if (!InRange(p.Wage ?? p.RecordedWage, q.WageMin, q.WageMax)) continue;
            if (!InRange(p.ContractYearsLeft, q.ContractYearsMin, q.ContractYearsMax)) continue;
            if (!InRange(p.WeakFoot, q.WeakFootMin, null) || !InRange(p.SkillMoves, q.SkillMovesMin, null)) continue;
            if ((roles is not null || q.RoleLevelMin is not null) && !p.RoleCodes.Any(c =>
                (roles is null || roles.Contains(c % 100)) && (c >= 100 ? 2 : 1) >= (q.RoleLevelMin ?? 1))) continue;
            if (styles is not null && !p.PlayStyleIds.Concat(p.PlayStylePlusIds).Any(styles.Contains)) continue;
            if (plusStyles is not null && !p.PlayStylePlusIds.Any(plusStyles.Contains)) continue;
            if (!InRange(p.Value, q.ValueMin, q.ValueMax)) continue;
            if (q.OppMin is { } om && !(p.Opportunity is { } o && o >= om)) continue;
            if (feet is not null && !((p.Foot is { } f && feet.Contains(f))
                                      || (p.FootCode is { } fc && feet.Contains(fc.ToString(CultureInfo.InvariantCulture))))) continue;
            yield return p;
        }
    }

    /// <summary>"pot,ovr" + "desc,asc" -> doğrulanmış (alan, azalan mı) listesi. Yön verilmeyen alan son yönü alır.</summary>
    public static List<(string Key, bool Desc)> ParseSort(string? sort, string? dir)
    {
        var keys = Csv(sort) ?? ["ovr"];
        var dirs = Csv(dir) ?? [];
        var result = new List<(string Key, bool Desc)>();
        for (var i = 0; i < keys.Count; i++)
        {
            if (!Sorts.ContainsKey(keys[i]))
                throw new BadRequestException($"Bilinmeyen sıralama alanı: '{keys[i]}'. Geçerli: {string.Join(", ", Sorts.Keys)}");
            var d = i < dirs.Count ? dirs[i] : (dirs.Count > 0 ? dirs[^1] : "desc");
            result.Add((keys[i].ToLowerInvariant(), !d.Equals("asc", StringComparison.OrdinalIgnoreCase)));
        }
        return result;
    }

    public static Comparison<MarketPlayer> BuildComparison(MarketData data, IEnumerable<(string Key, bool Desc)> keys)
    {
        var chain = keys.Select(k => Sorts[k.Key](data, k.Desc)).ToList();
        chain.Add(Sorts["ovr"](data, true));
        chain.Add((a, b) => a.Id.CompareTo(b.Id)); // kararlı sayfalama için

        return (a, b) =>
        {
            foreach (var c in chain)
            {
                var r = c(a, b);
                if (r != 0) return r;
            }
            return 0;
        };
    }

    // Boş değerler yönden bağımsız olarak hep sona.
    private static Comparison<MarketPlayer> By<T>(Func<MarketPlayer, T?> sel, bool desc) where T : struct, IComparable<T> =>
        (a, b) =>
        {
            T? x = sel(a), y = sel(b);
            if (x is null) return y is null ? 0 : 1;
            if (y is null) return -1;
            var c = x.Value.CompareTo(y.Value);
            return desc ? -c : c;
        };

    private static Comparison<MarketPlayer> ByText(MarketData data, string field, Func<MarketPlayer, string?> sel, bool desc)
    {
        var ranks = data.Ranks(field, sel);
        return By(p => sel(p) is { } v ? ranks[v] : (int?)null, desc);
    }

    private static bool InRange<T>(T? v, T? min, T? max) where T : struct, IComparable<T> =>
        (min is null || (v is { } a && a.CompareTo(min.Value) >= 0)) &&
        (max is null || (v is { } b && b.CompareTo(max.Value) <= 0));

    private static void ValidateRange(long? min, long? max, string name)
    {
        if (min < 0 || max < 0 || min > max) throw new BadRequestException($"{name}: aralık negatif veya ters olamaz.");
    }

    private static List<string>? Csv(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        var list = s.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();
        return list.Count == 0 ? null : list;
    }

    private static HashSet<int>? Ints(string? s, string name) =>
        Csv(s)?.Select(x => int.TryParse(x, NumberStyles.Integer, CultureInfo.InvariantCulture, out var i)
            ? i
            : throw new BadRequestException($"{name}: '{x}' sayı değil")).ToHashSet();
}
