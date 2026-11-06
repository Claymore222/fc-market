using System.Globalization;

namespace FcMarket.Api.FieldMaps;

public static class FieldMapValidator
{
    /// <summary>
    /// Field-map'i veritabanındaki gerçek kolonlarla karşılaştırır ve uyarı listesi döner. Asla fırlatmaz.
    /// </summary>
    /// <param name="rawColumns">Export tablo adı -> raw_ tablosundaki kolonlar; tablo yoksa null.</param>
    /// <param name="schemaFields">schema_fields tablosu: export tablo adı -> alanlar (oyunun kendi şeması).</param>
    public static List<string> Validate(
        FieldMap map,
        Func<string, IReadOnlySet<string>?> rawColumns,
        IReadOnlyDictionary<string, IReadOnlySet<string>> schemaFields)
    {
        var warnings = new List<string>();

        foreach (var (section, fields) in map.Sections())
        {
            if (!fields.TryGetValue(FieldMap.TableKey, out var table) || string.IsNullOrWhiteSpace(table))
            {
                warnings.Add($"{section}: 'table' tanımlı değil");
                continue;
            }

            var cols = rawColumns(table);
            if (cols is null)
            {
                warnings.Add($"Tablo yok: raw_{table} ({section}). İlgili kolonlar boş gösterilecek.");
                continue;
            }

            schemaFields.TryGetValue(table, out var schema);
            foreach (var (canonical, raw) in fields)
            {
                if (canonical == FieldMap.TableKey) continue;
                Check(warnings, cols, schema, table, raw, $"{section}.{canonical}");
            }

            if (section == "player")
            {
                foreach (var (group, attrs) in map.AttributeGroups)
                foreach (var attr in attrs)
                    Check(warnings, cols, schema, table, attr, $"attributeGroups.{group}");
            }
        }

        if (!DateOnly.TryParseExact(map.BirthdateEpoch, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _))
            warnings.Add($"birthdateEpoch geçersiz: '{map.BirthdateEpoch}' (yyyy-MM-dd bekleniyor)");

        foreach (var code in map.Positions.Keys)
            if (!int.TryParse(code, NumberStyles.Integer, CultureInfo.InvariantCulture, out _))
                warnings.Add($"positions: '{code}' sayı değil");

        var labels = map.Positions.Values.ToHashSet();
        foreach (var (group, members) in map.PositionGroups)
        foreach (var label in members.Where(l => !labels.Contains(l)))
            warnings.Add($"positionGroups.{group}: '{label}' positions içinde yok");

        if (map.GoalkeeperGroup is { } gk && !map.AttributeGroups.ContainsKey(gk))
            warnings.Add($"goalkeeperGroup '{gk}' attributeGroups içinde yok");

        return warnings;
    }

    private static void Check(List<string> warnings, IReadOnlySet<string> cols, IReadOnlySet<string>? schema,
        string table, string raw, string where)
    {
        if (!cols.Contains(raw))
            warnings.Add($"Alan yok: {table}.{raw} ({where}). Kolon boş gösterilecek.");
        else if (schema is not null && !schema.Contains(raw))
            warnings.Add($"Alan schema.json'da yok: {table}.{raw} ({where})");
    }
}
