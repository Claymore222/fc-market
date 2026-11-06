--[[
  fc_diagnose.lua  —  tek seferde kapsamlı tanı: Live Editor'ün Lua ile neleri okuyabildiğini çıkarır (salt okuma)

  NE YAPAR (oyunda HİÇBİR ŞEYİ DEĞİŞTİRMEZ; yalnız Get*/Is* okuma fonksiyonları ve tablo okuma)
    1. LE sürümü, kariyer durumu, kullanıcı takımı, save UID
    2. İstenen okuma fonksiyonlarının varlığı (lig tablosu, fikstür, istatistik, ceza, hedef...) ve varsa sonuçları
    3. Tüm global fonksiyon adları (LE güncellenince yeni gelenleri görmek için)
    4. GetManagerObjByTypeId(0..31) sonuçları
    5. ENUM_* sabitleri: hedef/ceza/kart/zorluk/aşama/kupa ile ilgili olanlar (hepsi ayrıca enums dosyasına)
    6. Kariyerle ilgili DB tabloları: satır sayısı ve ilk satırlar (playersuspensions, career_calendar, fifaGameSettings...)
    7. Kariyer olay adları (CM events)
    (Bellek incelemesi ayrı: fc_memprobe.lua.)

  ÇIKTI: C:/FCExport/fc_diagnose.txt ve C:/FCExport/fc_diagnose_enums.txt
  Kariyer yüklüyken Lua Engine'den çalıştır. Biraz sürebilir; bitince mesaj kutusu çıkar.
]]

local OUT = "C:/FCExport/fc_diagnose.txt"
local OUT_ENUMS = "C:/FCExport/fc_diagnose_enums.txt"
local VERSION = "0.1.0"

local lines = {}
local out = io.open(OUT, "w")
-- Her satır hemen diske yazılır: oyun çökerse rapor nereye kadar geldiğini gösterir.
local function w(s)
    lines[#lines + 1] = tostring(s)
    if out then out:write(tostring(s), "\n") out:flush() end
end
local function section(t) w("") w("=== " .. t .. " ===") end

local function try(fn_name, ...)
    local fn = _G[fn_name]
    if type(fn) ~= "function" then return false, "yok" end
    return pcall(fn, ...)
end

-- Değeri sınırlı derinlik ve uzunlukla yazıya çevirir.
local function dump(v, depth, budget)
    depth, budget = depth or 0, budget or { n = 400 }
    local t = type(v)
    if t ~= "table" then return t == "string" and string.format("%q", v) or tostring(v) end
    if depth >= 3 then return "{…}" end
    local parts, count = {}, 0
    for k, x in pairs(v) do
        count = count + 1
        if budget.n <= 0 then parts[#parts + 1] = "…" break end
        budget.n = budget.n - 1
        parts[#parts + 1] = tostring(k) .. "=" .. dump(x, depth + 1, budget)
        if count >= 40 then parts[#parts + 1] = "…(" .. tostring(table_count and table_count(v) or "?") .. ")" break end
    end
    return "{" .. table.concat(parts, ", ") .. "}"
end

local function read_table(name, max_rows)
    if type(LE) ~= "table" or type(LE.db) ~= "table" then return nil, "LE.db yok" end
    local ok, tbl = pcall(LE.db.GetTable, LE.db, name)
    if not ok or type(tbl) ~= "table" or type(tbl.fields) ~= "table" then return nil, "tablo yok" end
    local fields = {}
    for f in pairs(tbl.fields) do fields[#fields + 1] = f end
    table.sort(fields)
    local rows, total, rec = {}, 0, tbl:GetFirstRecord()
    while rec and rec > 0 do
        total = total + 1
        if #rows < max_rows then
            local r = {}
            for _, f in ipairs(fields) do r[#r + 1] = f .. "=" .. tostring(tbl:GetRecordFieldValue(rec, f)) end
            rows[#rows + 1] = table.concat(r, " ")
        end
        rec = tbl:GetNextValidRecord()
    end
    return { fields = fields, rows = rows, total = total }
end

---------------------------------------------------------------------------
section("1. ORTAM")
w("fc_diagnose " .. VERSION .. " — " .. os.date("%Y-%m-%d %H:%M:%S"))
w("LE.version: " .. tostring(type(LE) == "table" and LE.version or "?"))
local _, in_cm = try("IsInCM")
w("Kariyerde: " .. tostring(in_cm))
local ok_team, user_team = try("GetUserTeamID")
w("Kullanıcı takımı: " .. tostring(user_team) .. "  " .. tostring(select(2, try("GetTeamName", user_team))))
w("Save UID: " .. tostring(select(2, try("GetSaveUID"))))
w("Milli takım: " .. tostring(select(2, try("GetUserNationalTeamID"))))
w("Transfer bütçesi: " .. tostring(select(2, try("GetUserTransferBudget"))))

-- Kullanıcının ligi (leagueteamlinks)
local user_league
if type(LE) == "table" and type(LE.db) == "table" then
    local ok, tbl = pcall(LE.db.GetTable, LE.db, "leagueteamlinks")
    if ok and type(tbl) == "table" then
        local rec = tbl:GetFirstRecord()
        while rec and rec > 0 do
            if tonumber(tbl:GetRecordFieldValue(rec, "teamid")) == tonumber(user_team) then
                user_league = tonumber(tbl:GetRecordFieldValue(rec, "leagueid"))
                break
            end
            rec = tbl:GetNextValidRecord()
        end
    end
end
w("Kullanıcı ligi: " .. tostring(user_league))

---------------------------------------------------------------------------
section("2. İSTENEN OKUMA FONKSİYONLARI (varsa çağrılır)")
-- Yalnız okuma. Argüman kalıpları: (), (takım), (lig), (takım, lig).
local WANTED = {
    "GetLeagueStandings", "GetStandings", "GetLeagueTable", "GetTable", "GetFixtures", "GetTeamFixtures", "GetLeagueFixtures",
    "GetPlayersStats", "GetPlayerStats", "GetTeamStats", "GetCurrentDate", "GetGameDate", "GetTeamIdFromPlayerId",
    "GetTransferHistory", "GetTransfersHistory", "GetPlayerTransferHistory", "GetUserWageBudget", "GetWageBudget",
    "GetPlayerSuspensions", "GetSuspensions", "GetPlayerSuspension", "GetPlayerCards", "GetPlayerBans",
    "GetBoardObjectives", "GetObjectives", "GetSeasonObjectives", "GetJobSecurity", "GetManagerRating", "GetManagerWage",
    "GetManagerInfo", "GetManagerHistory", "GetCareerSettings", "GetDifficulty", "GetHalfLength", "GetMatchSettings",
    "GetTrophies", "GetTeamTrophies", "GetCompetitions", "GetCompetitionStage", "GetCupProgress", "GetPlayerFitness",
    "GetPlayerSharpness", "GetPlayerMorale", "GetPlayerForm", "GetPlayerInjury", "GetInjuries", "GetScouts", "GetScoutMissions",
    "GetYouthPlayers", "GetFinances", "GetClubFinances", "GetTeamFinances",
}
local arg_sets = { {}, { user_team }, { user_league }, { user_team, user_league } }
for _, name in ipairs(WANTED) do
    if type(_G[name]) == "function" then
        w("VAR  " .. name)
        for i, args in ipairs(arg_sets) do
            local ok, res = pcall(_G[name], table.unpack(args))
            w(string.format("     arg%d %s -> %s %s", i, dump(args), ok and "ok" or "HATA", dump(res)))
        end
    else
        w("yok  " .. name)
    end
end

---------------------------------------------------------------------------
section("3. TÜM GLOBAL FONKSİYONLAR")
local names = {}
for k, v in pairs(_G) do if type(v) == "function" then names[#names + 1] = k end end
table.sort(names)
w(#names .. " fonksiyon: " .. table.concat(names, ", "))
for _, tname in ipairs({ "LE", "MEMORY", "HTTP", "LOGGER" }) do
    local t = _G[tname]
    if type(t) == "table" then
        local ks = {}
        for k, v in pairs(t) do ks[#ks + 1] = tostring(k) .. ":" .. type(v) end
        table.sort(ks)
        w(tname .. " → " .. table.concat(ks, ", "))
    end
end

---------------------------------------------------------------------------
section("4. GetManagerObjByTypeId")
for i = 0, 31 do
    local ok, res = try("GetManagerObjByTypeId", i)
    if ok and res ~= nil and res ~= 0 then w(string.format("%2d -> %s", i, dump(res))) end
end

---------------------------------------------------------------------------
section("5. ENUM SABİTLERİ (ilgili olanlar)")
local enums = {}
for k, v in pairs(_G) do if type(k) == "string" and k:match("^ENUM_") then enums[#enums + 1] = k end end
table.sort(enums)
local KEYS = { "OBJECTIVE", "BOARD", "SUSP", "CARD", "BAN", "DIFFIC", "HALF", "LEVEL", "STAGE", "ROUND", "TROPHY", "CUP",
    "INJUR", "FITNESS", "SCOUT", "PRESEASON", "TOURNAMENT", "JOB", "SECURITY", "WAGE", "FINANCE", "INCOME", "EXPENSE" }
local enum_lines = {}
for _, k in ipairs(enums) do
    local line = k .. " = " .. dump(_G[k])
    enum_lines[#enum_lines + 1] = line
    local up = k:upper()
    for _, key in ipairs(KEYS) do if up:find(key, 1, true) then w(line) break end end
end
w("Toplam ENUM: " .. #enums .. " (hepsi " .. OUT_ENUMS .. ")")
local fe = io.open(OUT_ENUMS, "w")
if fe then fe:write(table.concat(enum_lines, "\n"), "\n") fe:close() end

---------------------------------------------------------------------------
section("6. KARİYER DB TABLOLARI")
local TABLES = { "playersuspensions", "career_clinchedobjectives", "career_calendar", "fifaGameSettings", "career_scoutmission",
    "career_scouts", "career_managerawards", "career_playerawards", "career_teamofweek", "manager", "competition",
    "transfers", "playerloans", "previousteam", "leagueteamlinks" }
for _, t in ipairs(TABLES) do
    local res, err = read_table(t, 5)
    if res then
        w(t .. ": " .. res.total .. " satır; alanlar: " .. table.concat(res.fields, ","))
        for _, r in ipairs(res.rows) do w("   " .. r) end
    else
        w(t .. ": " .. tostring(err))
    end
end
-- Kullanıcı ligindeki tablo alanları (kariyerde güncelleniyor mu?)
if type(LE) == "table" and type(LE.db) == "table" and user_league then
    local ok, tbl = pcall(LE.db.GetTable, LE.db, "leagueteamlinks")
    if ok and type(tbl) == "table" then
        w("Kullanıcı ligi (" .. user_league .. ") satırları:")
        local rec = tbl:GetFirstRecord()
        while rec and rec > 0 do
            if tonumber(tbl:GetRecordFieldValue(rec, "leagueid")) == user_league then
                local f = {}
                for _, k in ipairs({ "teamid", "currenttableposition", "previousyeartableposition", "points", "nummatchesplayed",
                    "homewins", "awaywins", "objective", "champion" }) do f[#f + 1] = k .. "=" .. tostring(tbl:GetRecordFieldValue(rec, k)) end
                w("   " .. table.concat(f, " "))
            end
            rec = tbl:GetNextValidRecord()
        end
    end
end

---------------------------------------------------------------------------
section("7. KARİYER OLAYLARI")
local ev = {}
for id = 0, 400 do
    local ok, n = try("GetCMEventNameByID", id)
    if ok and n and n ~= "" then ev[#ev + 1] = id .. ":" .. tostring(n) end
end
w(#ev .. " olay: " .. table.concat(ev, ", "))

---------------------------------------------------------------------------
w("— bitti —")
if out then out:close() end
print("[FC-DIAGNOSE] bitti: " .. OUT)
if type(MessageBox) == "function" then pcall(MessageBox, "FC Diagnose", "Bitti.\n" .. OUT) end
