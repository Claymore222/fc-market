namespace FcMarket.Desktop;

/// <summary>Bound crash loops without blocking an explicit user retry. No WebView/WinForms dependency.</summary>
sealed class BrowserRecoveryPolicy
{
    readonly Queue<DateTimeOffset> attempts = new();
    public bool Recovering { get; private set; }
    public bool TryBegin(bool manual, DateTimeOffset now)
    {
        if (Recovering) return false;
        while (attempts.TryPeek(out var at) && now - at >= TimeSpan.FromMinutes(2)) attempts.Dequeue();
        if (!manual && attempts.Count >= 2) return false;
        if (!manual) attempts.Enqueue(now);
        Recovering = true;
        return true;
    }
    public void Complete() => Recovering = false;
    public static bool SoftwareRendering(bool rtssRunning, string? preference) => preference?.ToLowerInvariant() switch
    { "software" => true, "hardware" => false, _ => rtssRunning };
    public static bool Allowed(string? url, Uri origin) => Uri.TryCreate(url, UriKind.Absolute, out var uri) &&
        uri.Scheme == origin.Scheme && uri.Host == origin.Host && uri.Port == origin.Port && uri.UserInfo.Length == 0;
}
