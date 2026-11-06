--[[
  fc_minifaces.lua — oyunda yüzü (miniface) olmayan oyuncuları bulur; isteğe bağlı olarak LE ile üretmeyi dener.

  VARSAYILAN: DRY_RUN = true → hiçbir şey üretmez, yalnız rapor yazar:
      C:/FCExport/minifaces_report.txt  (yüzü olmayanlar: kullanıcı kadrosu, ligi, izleme listesi)
  DRY_RUN = false → raporun ilk LIMIT oyuncusu PlayerCapture* ile üretilir (oyuncu başına birkaç saniye; LE örneği
      kadro için ~5 dk diyor). Görseller LE'nin legacy mod klasörüne düşer (oyunun UI'ında da görünür). Kariyer
      verisine, kadroya, sözleşmeye yazılmaz. Önce LIMIT = 1 ile dene.

  Live Editor -> Features -> Lua Engine (kariyer yüklüyken). LE v27.1.4+ gerekir.
]]

local CONFIG = {
    OUT_DIR = "C:/FCExport",
    DRY_RUN = true,
    LIMIT = 1,                      -- DRY_RUN=false iken en fazla bu kadar oyuncu
    INCLUDE_LEAGUE = true,          -- kullanıcının ligindeki takımların oyuncuları
    WATCHLIST_FILE = "watchlist.txt",
    -- Doluysa yalnız bu oyuncular üretilir (yüzü olsa bile; karşılaştırma için). DRY_RUN ve LIMIT yine geçerli.
    -- Yüzü olan oyuncu üretilirse LE mods klasöründeki yeni dosya oyunun orijinal yüzünü ezer; geri almak için o dosyayı sil.
    PLAYER_IDS = {},
}

local function log(msg) print("[FC-MINIFACE] " .. tostring(msg)) end
local function try(fn_name, ...)
    local fn = _G[fn_name]
    if type(fn) ~= "function" then return false, "yok: " .. fn_name end
    return pcall(fn, ...)
end
local function int(v) return math.tointeger(tonumber(v or 0) or 0) or 0 end

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
    return {}
end

local function has_head(pid)
    for _, p in ipairs({ "data/ui/imgAssets/heads/p" .. pid .. ".DDS", "data/ui/imgAssets/heads/p" .. pid .. ".dds" }) do
        local ok, r = try("LegacyFileExist", p)
        if ok and r == true then return true end
    end
    return false
end

-- Adaylar: kullanıcı kadrosu, (isteğe bağlı) ligi, izleme listesi
local okT, user_team = try("GetUserTeamID")
user_team = okT and int(user_team) or 0
local league
local links = read_rows("leagueteamlinks", { "teamid", "leagueid" })
for _, r in ipairs(links) do if int(r.teamid) == user_team then league = int(r.leagueid) end end
local teams = { [user_team] = "kadro" }
if CONFIG.INCLUDE_LEAGUE and league then
    for _, r in ipairs(links) do if int(r.leagueid) == league and not teams[int(r.teamid)] then teams[int(r.teamid)] = "lig" end end
end
local candidates, team_of, why = {}, {}, {}
local forced = {}
for _, pid in ipairs(CONFIG.PLAYER_IDS) do forced[pid] = true end
for _, r in ipairs(read_rows("teamplayerlinks", { "playerid", "teamid" })) do
    local pid, tid = int(r.playerid), int(r.teamid)
    if forced[pid] and not why[pid] then candidates[#candidates + 1] = pid; team_of[pid] = tid; why[pid] = "seçili" end
    if #CONFIG.PLAYER_IDS == 0 and teams[tid] and not why[pid] then candidates[#candidates + 1] = pid; team_of[pid] = tid; why[pid] = teams[tid] end
end
local f = #CONFIG.PLAYER_IDS == 0 and io.open(CONFIG.OUT_DIR .. "/" .. CONFIG.WATCHLIST_FILE, "r")
if f then
    for line in f:lines() do
        local m = line:match("%d+")
        if m and not why[int(m)] then candidates[#candidates + 1] = int(m); why[int(m)] = "izleme" end
    end
    f:close()
end

local missing = {}
for _, pid in ipairs(candidates) do
    if forced[pid] or not has_head(pid) then missing[#missing + 1] = pid end
end
-- Önce kullanıcı kadrosu
table.sort(missing, function(a, b)
    local ra, rb = why[a] == "kadro" and 0 or why[a] == "izleme" and 1 or 2, why[b] == "kadro" and 0 or why[b] == "izleme" and 1 or 2
    if ra ~= rb then return ra < rb end
    return a < b
end)

local lines = { "Yüzü olmayan oyuncular — " .. os.date("%Y-%m-%d %H:%M:%S"),
    string.format("aday %d, yüzsüz %d (kullanıcı takımı %d, lig %s)", #candidates, #missing, user_team, tostring(league)), "" }
for _, pid in ipairs(missing) do
    local okN, name = try("GetPlayerName", pid)
    lines[#lines + 1] = string.format("%d\t%s\t%s\tteam=%s", pid, okN and tostring(name) or "?", why[pid], tostring(team_of[pid]))
end

-- Üretim (DRY_RUN=false). LE'nin kendi örneğindeki API (lua/scripts/generate_minifaces_user_team.lua):
-- "<default>" = LE mods klasörü (mods/legacy/data/ui/imgAssets/heads); oyun ve fc_assets.lua oradan okur.
-- Takımı olmayan (izleme listesindeki serbest) oyuncular atlanır: forma için takım gerekiyor.
if not CONFIG.DRY_RUN then
    lines[#lines + 1] = ""
    lines[#lines + 1] = "=== ÜRETİM ==="
    local gk = {}
    for _, r in ipairs(read_rows("players", { "playerid", "preferredposition1" })) do
        if int(r.preferredposition1) == 0 then gk[int(r.playerid)] = true end
    end
    for _, step in ipairs({
        { "PlayerCaptureSetOutputDirectory", { "<default>" } }, { "PlayerCaptureSetCamera", { 1 } },
        { "PlayerCaptureSetSize", { 256, 256 } }, { "PlayerCaptureSetType", { 1 } }, { "PlayerCaptureSetArgs", { 0, 0 } },
    }) do
        local ok, err = try(step[1], table.unpack(step[2]))
        lines[#lines + 1] = string.format("%s(%s) -> %s %s", step[1], table.concat(step[2], ","), tostring(ok), tostring(err))
    end
    local added = 0
    for _, pid in ipairs(missing) do
        if added >= CONFIG.LIMIT then break end
        local tid = team_of[pid]
        if tid then
            local ok, err = try("PlayerCaptureAddPlayer", pid, tid, gk[pid] == true)
            lines[#lines + 1] = string.format("PlayerCaptureAddPlayer(%d, %d, %s) -> %s %s", pid, tid, tostring(gk[pid] == true), tostring(ok), tostring(err))
            if ok then added = added + 1 end
        end
    end
    if added > 0 then
        local ok, err = try("PlayerCaptureStart")
        lines[#lines + 1] = "PlayerCaptureStart() -> " .. tostring(ok) .. " " .. tostring(err)
    end
end

local text = table.concat(lines, "\n")
print(text)
local out = io.open(CONFIG.OUT_DIR .. "/minifaces_report.txt", "w")
if out then out:write(text); out:close() end
log(string.format("%d yüzsüz oyuncu; rapor: %s/minifaces_report.txt%s", #missing, CONFIG.OUT_DIR, CONFIG.DRY_RUN and " (yalnız rapor)" or ""))
if type(MessageBox) == "function" then
    pcall(MessageBox, "FC Minifaces", string.format("%d yüzsüz oyuncu bulundu.\nRapor: %s/minifaces_report.txt", #missing, CONFIG.OUT_DIR))
end
