using FcMarket.Api.FieldMaps;
using Microsoft.Data.Sqlite;

namespace FcMarket.Api.Data;

/// <summary>
/// Field-map'in o anki veritabanına uygulanmış hali: hangi tablo/kolon gerçekten var.
/// SQL'e yalnızca PRAGMA ile varlığı doğrulanmış adlar (tırnaklı) girer; eksik alan NULL olur.
/// </summary>
public sealed class ResolvedSchema
{
    private readonly Func<string, IReadOnlySet<string>?> _columns;

    public FieldMap Map { get; }
    public List<string> Warnings { get; }

    public ResolvedSchema(FieldMap map, Func<string, IReadOnlySet<string>?> columns,
        IReadOnlyDictionary<string, IReadOnlySet<string>> schemaFields)
    {
        Map = map;
        var cache = new Dictionary<string, IReadOnlySet<string>?>(StringComparer.OrdinalIgnoreCase);
        _columns = t => cache.TryGetValue(t, out var c) ? c : cache[t] = columns(t);
        Warnings = FieldMapValidator.Validate(map, _columns, schemaFields);
    }

    public static ResolvedSchema FromDb(FieldMap map, SqliteConnection con) =>
        new(map, t => CareerDb.RawColumns(con, t), CareerDb.SchemaFields(con));

    public bool HasTable(Dictionary<string, string> section) =>
        section.TryGetValue(FieldMap.TableKey, out var t) && _columns(t) is not null;

    /// <summary>"raw_players" gibi tırnaklı tablo adı. Önce <see cref="HasTable"/> kontrol edilmeli.</summary>
    public string Table(Dictionary<string, string> section) =>
        Quote(CareerDb.RawTableName(section[FieldMap.TableKey]));

    /// <summary>Kolon varsa tırnaklı adı, yoksa null.</summary>
    public string? Column(Dictionary<string, string> section, string canonical) =>
        section.TryGetValue(canonical, out var raw) ? RawColumn(section, raw) : null;

    /// <summary>Ham alan adıyla (özellikler için) kolon; yoksa null.</summary>
    public string? RawColumn(Dictionary<string, string> section, string raw)
    {
        if (!section.TryGetValue(FieldMap.TableKey, out var t) || _columns(t) is not { } cols) return null;
        var clean = CareerDb.ImporterIdent(raw);
        return cols.Contains(clean) ? Quote(clean) : null;
    }

    /// <summary>SELECT parçası: kolon varsa "tablo"."kolon", yoksa NULL.</summary>
    public string Select(Dictionary<string, string> section, string canonical, string? alias = null) =>
        (Column(section, canonical) is { } c ? $"{alias ?? Table(section)}.{c}" : "NULL");

    private static string Quote(string ident) => $"\"{ident.Replace("\"", "\"\"")}\"";
}
