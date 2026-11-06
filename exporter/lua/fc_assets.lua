--[[
  fc_assets.lua  —  oyundaki yüz, arma ve bayrak görsellerini diske çıkarır (Live Editor Lua Engine)

  NE YAPAR
    Live Editor'ün LegacyFileExist / LegacyFileExport fonksiyonlarıyla oyunun "legacy" UI görsellerini
    (DDS) CONFIG.OUT_DIR altına kopyalar:
      heads/p<playerid>.dds      data/ui/imgAssets/heads/p<playerid>.DDS
      crests/l<teamid>.dds       data/ui/imgAssets/crest/dark/l<teamid>.dds (yoksa crest50x50/dark)
      flags/f_<nationid>.dds     data/ui/imgAssets/flags/f_<nationid>.dds (yoksa flagsSmall)
    Önce olmayanlar atlanır, daha önce çıkarılanlar yeniden yazılmaz. Sonuç assets_manifest.json'a yazılır.
    Oyun stili ikonları için aday yolları dener ve bulunanları log'a/manifest'e yazar.

  OYUNDA HİÇBİR ŞEYİ DEĞİŞTİRMEZ. Sadece oyunun dosyalarını okur ve OUT_DIR'e yazar.

  KURULUM
    - OUT_DIR ve alt klasörleri (heads, crests, flags, playstyles) ÖNCEDEN oluştur (Lua klasör oluşturamaz).
    - LE v26.3.6+ gerekir (LegacyFileExist / LegacyFileExport). Kariyer yüklüyken Lua Engine'den çalıştır.
    - Sonra: python -m tools.assets convert C:\FCExport\assets  (DDS -> PNG, uygulamanın klasörlerine)

  İmza (oyunda doğrulandı, 28.10.2026): bool LegacyFileExist(string path), bool LegacyFileExport(string path, string outpath).
  İlk çalıştırma: 8695 yüz, 839 arma, 217 bayrak; oyun stili ikonu denenen yollarda yok.
]]

local CONFIG = {
    OUT_DIR = "C:/FCExport/assets",
    -- "league": kullanıcının ligindeki takımların oyuncuları + MIN_OVERALL ve üstü herkes. "all": tüm oyuncular.
    PLAYER_SCOPE = "all",
    MIN_OVERALL = 70,
    EXPORT_CRESTS = true,
    EXPORT_FLAGS = true,
    PROBE_PLAYSTYLES = true,
    YIELD_EVERY = 200,
}

local VERSION = "0.1.0"

local function log(msg) print("[FC-ASSETS] " .. tostring(msg)) end

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

-- Tablo okuma: LE v2 (LE.db), yoksa v1 GetDBTableRows (fc_export.lua ile aynı yöntem)
local function read_rows(table_name, fields)
    if type(LE) == "table" and type(LE.db) == "table" and type(LE.db.GetTable) == "function" then
        local ok, tbl = pcall(LE.db.GetTable, LE.db, table_name)
        if ok and type(tbl) == "table" and type(tbl.fields) == "table" then
            local rows, rec = {}, tbl:GetFirstRecord()
            while rec and rec > 0 do
                local row = {}
                for _, f in ipairs(fields) do if tbl.fields[f] then row[f] = tbl:GetRecordFieldValue(rec, f) end end
                rows[#rows + 1] = row
                rec = tbl:GetNextValidRecord()
            end
            return rows
        end
    end
    local raw = try("GetDBTableRows", table_name)
    if type(raw) ~= "table" then return {} end
    local rows = {}
    for i, r in ipairs(raw) do
        local row = {}
        for _, f in ipairs(fields) do
            local c = r[f]
            if type(c) == "table" or type(c) == "userdata" then c = c.value end
            row[f] = c
        end
        rows[i] = row
    end
    return rows
end

local function num(v) return math.tointeger(tonumber(v) or -1) or -1 end

-- Kaynak yolun büyük/küçük harf biçimlerini dener; ilk var olanı döndürür.
local function find_source(candidates)
    for _, p in ipairs(candidates) do
        if try("LegacyFileExist", p) == true then return p end
    end
    return nil
end

local stats = { exported = 0, skipped = 0, missing = 0, failed = 0 }
local manifest = { version = VERSION, heads = {}, crests = {}, flags = {}, playstyles = {}, errors = {} }

local function export_one(kind, id, candidates, target)
    yield()
    if exists_on_disk(target) then
        stats.skipped = stats.skipped + 1
        manifest[kind][#manifest[kind] + 1] = id
        return
    end
    local src = find_source(candidates)
    if not src then stats.missing = stats.missing + 1 return end
    local ok = try("LegacyFileExport", src, target)
    if ok and exists_on_disk(target) then
        stats.exported = stats.exported + 1
        manifest[kind][#manifest[kind] + 1] = id
    else
        stats.failed = stats.failed + 1
        if #manifest.errors < 20 then manifest.errors[#manifest.errors + 1] = src end
    end
end

local function heads(pid)
    local b = "data/ui/imgAssets/heads/p" .. pid
    return { b .. ".DDS", b .. ".dds" }
end

local function json_list(t)
    local parts = {}
    for i, v in ipairs(t) do parts[i] = type(v) == "number" and tostring(v) or ('"' .. tostring(v):gsub('"', '\\"') .. '"') end
    return "[" .. table.concat(parts, ",") .. "]"
end

---------------------------------------------------------------------------
-- MAIN
---------------------------------------------------------------------------
if type(LegacyFileExist) ~= "function" or type(LegacyFileExport) ~= "function" then
    log("LegacyFileExist/LegacyFileExport yok: Live Editor v26.3.6+ gerekir.")
    if type(MessageBox) == "function" then pcall(MessageBox, "FC Assets", "Bu Live Editor sürümünde LegacyFileExport yok.") end
    return
end

-- Yazma ve imza testi: bilinen bir kafa dosyasıyla (listedeki ilk var olan) dene.
local probe_target = CONFIG.OUT_DIR .. "/_probe.dds"
local probe_src = find_source({ "data/ui/imgAssets/heads/p86391.DDS", "data/ui/imgAssets/heads/p279086.DDS" })
log("probe kaynak: " .. tostring(probe_src))
if probe_src then
    local r, err = try("LegacyFileExport", probe_src, probe_target)
    log("probe LegacyFileExport -> " .. tostring(r) .. " " .. tostring(err) .. " dosya=" .. tostring(exists_on_disk(probe_target)))
    if not exists_on_disk(probe_target) then
        log("Dosya yazılamadı: OUT_DIR (" .. CONFIG.OUT_DIR .. ") ve alt klasörleri var mı?")
        if type(MessageBox) == "function" then pcall(MessageBox, "FC Assets", "Yazılamadı: " .. CONFIG.OUT_DIR .. "\nKlasörleri oluştur ve tekrar dene.") end
        return
    end
end

-- Oyuncular
local user_team = num(try("GetUserTeamID"))
local links = read_rows("teamplayerlinks", { "playerid", "teamid" })
local league_of = {}
for _, r in ipairs(read_rows("leagueteamlinks", { "teamid", "leagueid" })) do league_of[num(r.teamid)] = num(r.leagueid) end
local user_league = league_of[user_team]
local wanted = {}
if CONFIG.PLAYER_SCOPE ~= "all" then
    for _, r in ipairs(links) do
        if user_league and league_of[num(r.teamid)] == user_league then wanted[num(r.playerid)] = true end
    end
end
local players = read_rows("players", { "playerid", "overallrating" })
local count = 0
for _, p in ipairs(players) do
    local pid = num(p.playerid)
    if pid > 0 and (CONFIG.PLAYER_SCOPE == "all" or wanted[pid] or num(p.overallrating) >= CONFIG.MIN_OVERALL) then
        export_one("heads", pid, heads(pid), CONFIG.OUT_DIR .. "/heads/p" .. pid .. ".dds")
        count = count + 1
    end
end
log("oyuncu adayı: " .. count .. " (lig " .. tostring(user_league) .. ")")

if CONFIG.EXPORT_CRESTS then
    for _, t in ipairs(read_rows("teams", { "teamid" })) do
        local id = num(t.teamid)
        if id > 0 then
            export_one("crests", id, { "data/ui/imgAssets/crest/dark/l" .. id .. ".dds", "data/ui/imgAssets/crest50x50/dark/l" .. id .. ".dds",
                "data/ui/imgAssets/crest/light/l" .. id .. ".dds" }, CONFIG.OUT_DIR .. "/crests/l" .. id .. ".dds")
        end
    end
end

if CONFIG.EXPORT_FLAGS then
    for _, n in ipairs(read_rows("nations", { "nationid" })) do
        local id = num(n.nationid)
        if id > 0 then
            export_one("flags", id, { "data/ui/imgAssets/flags/f_" .. id .. ".dds", "data/ui/imgAssets/flagsSmall/f_" .. id .. ".dds" },
                CONFIG.OUT_DIR .. "/flags/f_" .. id .. ".dds")
        end
    end
end

-- Oyun stili ikonları: yol bilinmiyor; makul adayları dene, bulunanları kaydet.
if CONFIG.PROBE_PLAYSTYLES then
    local dirs = { "data/ui/imgAssets/playstyles/", "data/ui/imgAssets/playstyle/", "data/ui/imgAssets/traits/",
        "data/ui/imgAssets/playerTraits/", "data/ui/imgAssets/icons/playstyles/", "data/ui/imgAssets/fut/playstyles/" }
    local names = {}
    for i = 0, 63 do
        names[#names + 1] = "ps_" .. i; names[#names + 1] = "playstyle_" .. i; names[#names + 1] = "trait_" .. i
        names[#names + 1] = tostring(i); names[#names + 1] = "t" .. i
    end
    for _, d in ipairs(dirs) do
        for _, n in ipairs(names) do
            for _, ext in ipairs({ ".dds", ".DDS", ".png" }) do
                yield()
                local p = d .. n .. ext
                if try("LegacyFileExist", p) == true then
                    local target = CONFIG.OUT_DIR .. "/playstyles/" .. (n:gsub("[^%w_]", "_")) .. ext:lower()
                    try("LegacyFileExport", p, target)
                    manifest.playstyles[#manifest.playstyles + 1] = p
                end
            end
        end
    end
    log("oyun stili ikonu bulunan: " .. #manifest.playstyles)
end

local f = io.open(CONFIG.OUT_DIR .. "/assets_manifest.json", "w")
if f then
    f:write('{"version":"' .. VERSION .. '","exported_at":"' .. os.date("!%Y-%m-%dT%H:%M:%SZ") .. '",',
        '"stats":{"exported":' .. stats.exported .. ',"skipped":' .. stats.skipped .. ',"missing":' .. stats.missing .. ',"failed":' .. stats.failed .. '},',
        '"heads":' .. json_list(manifest.heads) .. ',"crests":' .. json_list(manifest.crests) .. ',"flags":' .. json_list(manifest.flags) .. ',',
        '"playstyles":' .. json_list(manifest.playstyles) .. ',"errors":' .. json_list(manifest.errors) .. '}')
    f:close()
end

local summary = string.format("Yeni %d, zaten var %d, oyunda yok %d, hata %d", stats.exported, stats.skipped, stats.missing, stats.failed)
log(summary)
if type(MessageBox) == "function" then pcall(MessageBox, "FC Assets", summary .. "\nKlasör: " .. CONFIG.OUT_DIR) end
