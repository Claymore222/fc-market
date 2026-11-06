using System.Drawing.Drawing2D;

namespace FcMarket.Desktop;

/// <summary>Startup screen: the bar only shows that work is running, because the importer reports no percentage.</summary>
sealed class LoadingScreen : Control
{
    const int TickMs = 33, MessageMs = 1900, FadeMs = 280, BarWidth = 240, BarHeight = 4;
    static readonly Color Background = Color.FromArgb(16, 28, 46), Ink = Color.FromArgb(216, 229, 245),
        Track = Color.FromArgb(32, 55, 80), Accent = Color.FromArgb(141, 184, 239);
    readonly System.Windows.Forms.Timer timer = new() { Interval = TickMs };
    readonly Font titleFont = new("Segoe UI", 20, FontStyle.Bold), textFont = new("Segoe UI", 10);
    string[] messages = [""];
    string? failure;
    int index, elapsed, sliding;

    public LoadingScreen()
    {
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
        Dock = DockStyle.Fill; BackColor = Background;
        timer.Tick += (_, _) => Advance();
        // With Windows animations off the bar stays still and messages still change.
        timer.Start();
    }

    public void ShowStage(params string[] stage)
    {
        messages = stage; index = 0; elapsed = 0; Invalidate();
    }

    public void ShowError(string text)
    {
        failure = text; timer.Stop(); Invalidate();
    }

    void Advance()
    {
        elapsed += TickMs; sliding += TickMs;
        if (elapsed >= MessageMs) { elapsed = 0; index = (index + 1) % messages.Length; }
        Invalidate();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.Clear(Background);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
        using var centered = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
        if (failure is not null)
        {
            using var error = new SolidBrush(Ink);
            g.DrawString(failure, textFont, error, new RectangleF(24, 24, Width - 48, Height - 48), centered);
            return;
        }
        var middle = Height / 2;
        using (var title = new SolidBrush(Ink))
            g.DrawString("FC MARKET", titleFont, title, new RectangleF(0, middle - 62, Width, 40), centered);
        var left = (Width - BarWidth) / 2;
        Bar(g, left, middle - 8, BarWidth, Track);
        Moving(g, left, middle - 8);
        var fade = Math.Min(1f, Math.Min(elapsed, MessageMs - elapsed) / (float)FadeMs);
        if (messages.Length == 1) fade = 1;
        using var line = new SolidBrush(Color.FromArgb((int)(fade * 255), Ink));
        g.DrawString(messages[index], textFont, line, new RectangleF(16, middle + 10, Width - 32, 28), centered);
    }

    void Moving(Graphics g, int left, int top)
    {
        const int Segment = 72, Cycle = 1500;
        if (!SystemInformation.UIEffectsEnabled) { Bar(g, left, top, BarWidth, Accent); return; }
        var t = sliding % Cycle / (float)Cycle;
        var eased = t < .5f ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
        var x = left - Segment + (BarWidth + Segment) * eased;
        var state = g.Save();
        g.SetClip(new Rectangle(left, top, BarWidth, BarHeight));
        Bar(g, x, top, Segment, Accent);
        g.Restore(state);
    }

    static void Bar(Graphics g, float x, float y, float width, Color color)
    {
        using var brush = new SolidBrush(color);
        using var path = new GraphicsPath();
        path.AddArc(x, y, BarHeight, BarHeight, 90, 180);
        path.AddArc(x + width - BarHeight, y, BarHeight, BarHeight, 270, 180);
        path.CloseFigure();
        g.FillPath(brush, path);
    }

    protected override void OnVisibleChanged(EventArgs e)
    {
        base.OnVisibleChanged(e);
        if (!Visible || failure is not null) timer.Stop();
        else if (!timer.Enabled) timer.Start();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) { timer.Dispose(); titleFont.Dispose(); textFont.Dispose(); }
        base.Dispose(disposing);
    }
}
