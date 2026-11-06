using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace FcMarket.Desktop;

static class ScriptLogging
{
    const string Header = "-- FC_MARKET_LOGGING_V1\n";
    const string Begin = "-- FC_MARKET_BODY_BEGIN\n";
    const string End = "\n-- FC_MARKET_BODY_END\n";
    public static string Root(string exportDir) => Path.Combine(exportDir, "logs", "lua");
    static string Quote(string s) => "\"" + s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "\\r").Replace("\n", "\\n") + "\"";
    public static string Unwrap(string content)
    {
        if (!content.StartsWith("-- FC_MARKET_LOGGING_V1")) return content;
        if (!content.StartsWith(Header)) throw new InvalidOperationException("Log sarmalayıcısının biçimi değişmiş; dosya korunuyor.");
        var begin = content.IndexOf(Begin, StringComparison.Ordinal);
        var end = content.LastIndexOf(End, StringComparison.Ordinal);
        if (begin < 0 || end < begin) throw new InvalidOperationException("Log sarmalayıcısı eksik; dosya korunuyor.");
        var body = content[(begin + Begin.Length)..end];
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(body)));
        if (!content.StartsWith(Header + "-- Original-SHA256: " + hash + "\n"))
            throw new InvalidOperationException("Loglanmış script sonradan değiştirilmiş; dosya korunuyor.");
        return body;
    }

    public static byte[] Wrap(string root, string name, string body, string exportDir = @"C:\FCExport")
    {
        if (!Regex.IsMatch(name, @"^[A-Za-z0-9_-]+$")) throw new ArgumentException("Geçersiz script adı.");
        body = Unwrap(body);
        var module = File.ReadAllText(Path.Combine(root, "tools", "scriptlogging", "fc_logging.lua"));
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(body)));
        var directory = Path.Combine(Root(exportDir), name).Replace('\\', '/');
        var library = name is "fcm_common" or "fcm_weights" ? "true" : "false";
        var prefix = Header + "-- Original-SHA256: " + hash + "\nlocal __fcm_log = (function()\n" + module +
            "\nend)().start(" + Quote(name) + ", " + Quote(directory) + ", " + library + ")\n" +
            "local print = function(...) return __fcm_log:print(...) end\n" +
            "local AddEventHandler = AddEventHandler\n" +
            "if type(AddEventHandler) == 'function' then\n local original = AddEventHandler\n AddEventHandler = function(event, fn) return original(event, __fcm_log:callback(fn)) end\nend\n" +
            "local function __fcm_body(...)\n" + Begin;
        var suffix = End + "end\nlocal __fcm_args = table.pack(...)\n" +
            "local __fcm_result = table.pack(xpcall(function() return __fcm_body(table.unpack(__fcm_args, 1, __fcm_args.n)) end, function(err) return __fcm_log:trace(err) end))\n" +
            "__fcm_log:finish(__fcm_result[1], __fcm_result[2])\n" +
            "if not __fcm_result[1] then error(__fcm_result[2], 0) end\nreturn table.unpack(__fcm_result, 2, __fcm_result.n)\n";
        return Encoding.UTF8.GetBytes(prefix + body + suffix);
    }

    public static void Prepare(string exportDir, string name)
    {
        if (!Regex.IsMatch(name, @"^[A-Za-z0-9_-]+$")) throw new ArgumentException("Geçersiz script adı.");
        Directory.CreateDirectory(Path.Combine(Root(exportDir), name));
    }
}
