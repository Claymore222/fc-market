using System.Globalization;
using FcMarket.Api.FieldMaps;

namespace FcMarket.Api.Market;

/// <summary>İki 32-bit oyun stili alanını işaretli SQLite değerlerinde de kayıpsız birleştirir.</summary>
public static class PlayerAbilities
{
    public static int[] StyleBits(object? low, object? high)
    {
        var bits = (ulong)(uint)(MarketLoader.Long(low) ?? 0) | ((ulong)(uint)(MarketLoader.Long(high) ?? 0) << 32);
        return Enumerable.Range(0, 64).Where(b => (bits >> b & 1) == 1).ToArray();
    }

    /// <summary>Yalnız oyuncuya görünen resmi stiller; eşlenmemiş bitler atlanır.</summary>
    public static int[] KnownStyleBits(FieldMap map, object? low, object? high) =>
        StyleBits(low, high).Where(b => map.PlayStyles.ContainsKey(b.ToString(CultureInfo.InvariantCulture))).ToArray();
}
