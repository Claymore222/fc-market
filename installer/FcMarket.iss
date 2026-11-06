; FC Market kurulumu (Inno Setup 6). publish.ps1 önce artifacts\FcMarket'i üretir, sonra:
;   ISCC.exe /DAppVersion=0.2.3 installer\FcMarket.iss   →   artifacts\FcMarket-Setup.exe
; Kullanıcı başına kurulur (%LOCALAPPDATA%\Programs\FC Market): yönetici izni gerekmez, güncelleme aynı yere yazar.
; Kullanıcı verisi (%LOCALAPPDATA%\FcMarket, C:\FCExport) kurulum klasörünün dışındadır; güncelleme ona dokunmaz,
; kaldırma yalnız kullanıcı "verileri de sil" derse FC Market'in ürettiklerini siler (FcMarket.exe --uninstall --purge).
; Uygulama içinden güncelleme Setup'ı /SILENT /UPDATE ile çalıştırır; kurulum bitince uygulama yeniden açılır.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
AppId={{789C97F9-E4D8-470C-9515-9D3BB0E773C2}
AppName=FC Market
AppVersion={#AppVersion}
AppVerName=FC Market {#AppVersion}
AppPublisher=Claymore222
AppPublisherURL=https://github.com/Claymore222/fc-market
AppSupportURL=https://github.com/Claymore222/fc-market/issues
AppUpdatesURL=https://github.com/Claymore222/fc-market/releases
DefaultDirName={localappdata}\Programs\FC Market
DefaultGroupName=FC Market
DisableProgramGroupPage=yes
DisableDirPage=auto
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir=..\artifacts
OutputBaseFilename=FcMarket-Setup
SetupIconFile=..\desktop\FcMarket.Desktop\Assets\fc-market.ico
UninstallDisplayIcon={app}\FcMarket.exe
UninstallDisplayName=FC Market
VersionInfoVersion={#AppVersion}
VersionInfoProductName=FC Market
WizardStyle=modern
Compression=lzma2/max
SolidCompression=yes
; Açık FC Market'i [Code] kapatır: Restart Manager penceresiz API/Python süreçlerini kapatamayıp kurulumu durduruyordu.
CloseApplications=no
RestartApplications=no

[Languages]
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl"

[Tasks]
Name: "desktopicon"; Description: "Masaüstüne kısayol ekle"; GroupDescription: "Kısayollar:"

[InstallDelete]
; Güncellemede eski sürümün artık kullanılmayan dosyaları kalmasın (kullanıcı verisi burada değil).
Type: filesandordirs; Name: "{app}\app"
Type: filesandordirs; Name: "{app}\frontend"
Type: filesandordirs; Name: "{app}\tools"
Type: filesandordirs; Name: "{app}\config"
Type: filesandordirs; Name: "{app}\exporter"

[Files]
Source: "..\artifacts\FcMarket\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\FC Market"; Filename: "{app}\FcMarket.exe"; Comment: "FC 27 Kariyer Modu yardımcısı"
Name: "{autodesktop}\FC Market"; Filename: "{app}\FcMarket.exe"; Comment: "FC 27 Kariyer Modu yardımcısı"; Tasks: desktopicon

[Run]
Filename: "{app}\FcMarket.exe"; Description: "FC Market'i şimdi aç"; Flags: nowait postinstall skipifsilent
; Uygulama içinden güncelleme (/UPDATE): kurulum sessiz de olsa bitince uygulama yeniden açılır.
Filename: "{app}\FcMarket.exe"; Flags: nowait; Check: IsUpdate

[UninstallDelete]
; Çalışırken oluşan Python önbellekleri. Kullanıcı verisi (%LOCALAPPDATA%\FcMarket, C:\FCExport) korunur.
Type: filesandordirs; Name: "{app}\tools"
Type: filesandordirs; Name: "{app}\app"

[Code]
// Kurulum/güncelleme ve kaldırmadan önce: FC Market penceresi düzgünce kapatılır (pencere kendi API ve Python
// süreçlerini durdurur); 10 sn içinde kapanmayan ya da arta kalan süreçler sonlandırılır. Yalnız kurulum klasöründen
// çalışan süreçlere dokunulur; bilgisayardaki başka Python'lar etkilenmez.
procedure StopFcMarket(Dir: String);
var
  Script: String;
  Code: Integer;
begin
  Script :=
    '$d = ''' + AddBackslash(Dir) + ''';' +
    '$own = { Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($d, [StringComparison]::OrdinalIgnoreCase) } };' +
    '& $own | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object { [void]$_.CloseMainWindow() };' +
    '$end = (Get-Date).AddSeconds(10); while ((& $own) -and (Get-Date) -lt $end) { Start-Sleep -Milliseconds 300 };' +
    '& $own | Stop-Process -Force -ErrorAction SilentlyContinue';
  Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    '-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "' + Script + '"', '', SW_HIDE, ewWaitUntilTerminated, Code);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  StopFcMarket(ExpandConstant('{app}'));
  Result := '';
end;

function HasParam(Name: String): Boolean;
var
  I: Integer;
begin
  Result := False;
  for I := 1 to ParamCount do
    if CompareText(ParamStr(I), Name) = 0 then Result := True;
end;

function IsUpdate(): Boolean;
begin
  Result := HasParam('/UPDATE');
end;

// Kaldırma onaylandıktan sonra, dosyalar silinmeden önce: uygulama kapatılır, Live Editor'e koyduğumuz script'ler
// kaldırılır (autorun'daki fc_export.lua yoksa oyunda çalışmaya devam ederdi) ve istenirse FC Market verileri silinir.
// Sessiz kaldırmada veriler yalnız /PURGE ile silinir.
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  Purge: Boolean;
  Args: String;
  Code: Integer;
begin
  if CurUninstallStep <> usUninstall then Exit;
  StopFcMarket(ExpandConstant('{app}'));
  Purge := HasParam('/PURGE');
  if not UninstallSilent then
    Purge := MsgBox('FC Market''in verileri de silinsin mi?' + #13#10 + #13#10 +
      'Silinir: kariyer veritabanı (geçmiş ve gelişim grafikleri), kısa liste, transfer planları, ayarlar, ' +
      'oyundan çıkarılan görseller ve kayıt yedekleri.' + #13#10 +
      'Korunur: oyunun kayıt dosyaları ve Live Editor export''ları (C:\FCExport içindeki CSV''ler).' + #13#10 + #13#10 +
      'Hayır dersen verilerin kalır; FC Market''i yeniden kurunca kaldığın yerden devam eder.',
      mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES;
  Args := '--uninstall';
  if Purge then Args := Args + ' --purge';
  Exec(ExpandConstant('{app}\FcMarket.exe'), Args, '', SW_HIDE, ewWaitUntilTerminated, Code);
  Log(Format('FC Market temizliği: %s, çıkış %d', [Args, Code]));
end;
