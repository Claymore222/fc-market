--[[
  fc_trophies.lua  —  oyundaki kupa (ve lig logosu) görsellerini bulur ve diske çıkarır (Live Editor Lua Engine)

  NE YAPAR
    1) YOKLAMA: Bilinen üç yarışma (68 Süper Lig, 268 Türkiye Kupası, 223 Şampiyonlar Ligi) için olası yolları
       LegacyFileExist ile dener ve bulunan her yolu log'a ve trophies_probe.txt'ye yazar. (CMTracker kupaları
       "trophy/t68.png" adıyla gösteriyor; oyunun arma yolu da "crest/dark/l<id>.dds" biçiminde.)
    2) ÇIKARMA: Çalışan bir yol kalıbı bulunursa 1..MAX_ID arasındaki tüm kimlikleri dener ve var olanları
       OUT_DIR/trophies/t<id>.dds olarak kopyalar. Lig logoları (data/ui/imgAssets/league/dark/l<id>.dds) da
       OUT_DIR/leagues/l<id>.dds olarak çıkarılır.

  OYUNDA HİÇBİR ŞEYİ DEĞİŞTİRMEZ. Sadece oyunun dosyalarını okur ve OUT_DIR'e yazar.

  KURULUM
    - OUT_DIR/trophies ve OUT_DIR/leagues klasörlerini ÖNCEDEN oluştur (Lua klasör oluşturamaz).
    - Kariyer ya da ana menü açıkken Lua Engine'den çalıştır. Sonra:
      python -m tools.assets convert C:\FCExport\assets
]]

local CONFIG = {
    OUT_DIR = "C:/FCExport/assets",
    PROBE_IDS = { 68, 268, 223 },
    MAX_ID = 3000,
    EXPORT_LEAGUE_LOGOS = true,
    YIELD_EVERY = 200,
}

local VERSION = "0.1.0"

local function log(msg) print("[FC-TROPHIES] " .. tostring(msg)) end

local function try(fn_name, ...)
    local fn = _G[fn_name]
    if type(fn) ~= "function" then return nil, "missing: " .. fn_name end
    local ok, res = pcall(fn, ...)
    if not ok then return nil, tostring(res) end
    return res
end

local function exists_on_disk(p)
    local f = io.open(p, "rb")
    if f then f:close() return true end
    return false
end

local tick = 0
local function yield()
    tick = tick + 1
    if CONFIG.YIELD_EVERY > 0 and tick % CONFIG.YIELD_EVERY == 0 and type(Sleep) == "function" then pcall(Sleep, 1) end
end

local function exists(path)
    yield()
    return try("LegacyFileExist", path) == true
end

-- Aday yol kalıpları: klasör × alt klasör × dosya adı × uzantı. %d = yarışma kimliği.
local DIRS = { "trophies", "trophy", "Trophies", "Trophy", "trophies256x256", "trophy256x256", "trophies128x128", "trophy128x128",
    "trophies512x512", "trophy512x512", "cmTrophies", "cmTrophy", "trophyCabinet", "TrophyCabinet", "cmTrophyCabinet",
    "competition", "competitions", "compTrophies", "league", "leagues", "cmSilverware", "silverware" }
local SUBS = { "", "dark/", "light/", "large/", "small/" }
local NAMES = { "t%d", "t_%d", "trophy_%d", "trophy%d", "tr%d", "l%d", "c%d", "%d" }
local EXTS = { ".dds", ".DDS", ".png" }

local function templates()
    local out = {}
    for _, d in ipairs(DIRS) do
        for _, s in ipairs(SUBS) do
            for _, n in ipairs(NAMES) do
                for _, e in ipairs(EXTS) do out[#out + 1] = "data/ui/imgAssets/" .. d .. "/" .. s .. n .. e end
            end
        end
    end
    return out
end

---------------------------------------------------------------------------
-- MAIN
---------------------------------------------------------------------------
if type(LegacyFileExist) ~= "function" or type(LegacyFileExport) ~= "function" then
    log("LegacyFileExist/LegacyFileExport yok: Live Editor v26.3.6+ gerekir.")
    return
end

local report = { "fc_trophies " .. VERSION }
local function note(line) log(line) report[#report + 1] = line end

-- Doğrulama: bilinen bir lig logosu var mı (LE listesinde olan yol)
note("kontrol league/dark/l341.dds -> " .. tostring(exists("data/ui/imgAssets/league/dark/l341.dds")))

-- 1) Yoklama
local found = {}
for _, tpl in ipairs(templates()) do
    local hits = 0
    for _, id in ipairs(CONFIG.PROBE_IDS) do
        local p = string.format(tpl, id)
        if exists(p) then
            hits = hits + 1
            note("VAR: " .. p)
        end
    end
    if hits > 0 then found[#found + 1] = tpl end
end
note("çalışan kalıp sayısı: " .. #found)

-- 2) Çıkarma
local function export_all(tpl, kind, prefix)
    local n = 0
    for id = 1, CONFIG.MAX_ID do
        local src = string.format(tpl, id)
        if exists(src) then
            local target = CONFIG.OUT_DIR .. "/" .. kind .. "/" .. prefix .. id .. ".dds"
            if not exists_on_disk(target) then try("LegacyFileExport", src, target) end
            if exists_on_disk(target) then n = n + 1 end
        end
    end
    return n
end

if found[1] then
    note("kupalar " .. found[1] .. " kalıbıyla: " .. export_all(found[1], "trophies", "t") .. " dosya")
else
    note("Kupa görseli denenen yollarda bulunamadı.")
end
if CONFIG.EXPORT_LEAGUE_LOGOS then
    note("lig logoları: " .. export_all("data/ui/imgAssets/league/dark/l%d.dds", "leagues", "l") .. " dosya")
end

local f = io.open(CONFIG.OUT_DIR .. "/trophies_probe.txt", "w")
if f then f:write(table.concat(report, "\n"), "\n") f:close() end
log("bitti; rapor " .. CONFIG.OUT_DIR .. "/trophies_probe.txt")
if type(MessageBox) == "function" then
    pcall(MessageBox, "FC Trophies", (found[1] and ("Kupa yolu bulundu: " .. found[1]) or "Kupa yolu bulunamadı") .. "\nRapor: trophies_probe.txt")
end
