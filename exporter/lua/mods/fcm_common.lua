--[[
  fcm_common.lua — Faz 5 mod'ları ve M0 doğrulama script'leri için ortak yardımcılar.
  Script'ler bunu dofile(FCM_DIR .. "fcm_common.lua") ile yükler (FCM_DIR = Live Editor'ün lua/scripts klasörü).

  Yazma kuralları (CLAUDE.md):
    - Yalnızca players tablosu, LE'nin TABLE API'siyle (SetRecordFieldValue) ve LE fonksiyonları.
    - teamplayerlinks, career_playercontract, career_* ve diğer kadro/sözleşme tablolarına yazım yok.
    - DRY_RUN varsayılan açık; her değişiklik önce rapora yazılır.
]]

local M = {}

M.OUT_DIR = "C:/FCExport/m0"

pcall(require, "imports/career_mode/enums")
pcall(require, "imports/career_mode/helpers")   -- GetUserTeamID, GetManagerObjByTypeId, GetUserSeniorTeamPlayerIDs
pcall(require, "imports/other/helpers")         -- GetCurrentDate (CalendarManager +0x34), GetPlayerIDSForTeam
local okJson, json = pcall(require, "imports/external/json")
M.json = okJson and json or nil

function M.log(msg)
    print("[FCM] " .. tostring(msg))
end

local function path(name) return M.OUT_DIR .. "/" .. name end

--- Dosyaya yaz ("w") ya da ekle ("a"). Klasör yoksa false.
function M.write(name, text, mode)
    local f = io.open(path(name), mode or "w")
    if not f then
        M.log("Yazılamadı: " .. path(name) .. " (C:/FCExport/m0 klasörü var mı?)")
        return false
    end
    f:write(text)
    f:close()
    return true
end

--- Satır satır rapor: lines tablosu + tek seferde dosyaya.
function M.report(name)
    local r = { lines = {} }
    function r:add(...)
        local parts = {}
        for i = 1, select("#", ...) do parts[#parts + 1] = tostring((select(i, ...))) end
        self.lines[#self.lines + 1] = table.concat(parts, " ")
    end
    function r:save(mode)
        print(self.lines[#self.lines]) -- LE konsoluna binlerce satır basmak script'i yavaşlatıyor; tamamı dosyada
        return M.write(name, table.concat(self.lines, "\n") .. "\n", mode)
    end
    return r
end

function M.date_str()
    local ok, d = pcall(GetCurrentDate)
    if ok and type(d) == "table" and (d.year or 0) > 0 then
        return string.format("%04d-%02d-%02d", d.year, d.month, d.day)
    end
    return "0000-00-00"
end

--- 1582-10-14 + gün (veri sözlüğünde doğrulandı) → yaş, verilen oyun tarihinde.
function M.age(birthdate_days, date_str)
    if type(birthdate_days) ~= "number" or birthdate_days <= 0 then return nil end
    local y, m, d = date_str:match("(%d+)-(%d+)-(%d+)")
    y, m, d = tonumber(y), tonumber(m), tonumber(d)
    -- Gregoryen gün sayısından tarih (LE date.lua'daki algoritma; gün 0 = 1582-10-15, bu yüzden -1)
    local a = (birthdate_days - 1) + 2331205
    local b = (4 * a + 3) // 146097
    local c = a - (146097 * b) // 4
    local dd = (4 * c + 3) // 1461
    local e = c - (1461 * dd) // 4
    local mm = (5 * e + 2) // 153
    local by, bm, bd = 100 * b + dd - 4800 + mm // 10, mm + 3 - 12 * (mm // 10), e - (153 * mm + 2) // 5 + 1
    local age = y - by
    if m < bm or (m == bm and d < bd) then age = age - 1 end
    return age
end

-- Durum dosyası: C:/FCExport/m0/<name>.json
function M.load_state(name)
    local f = io.open(path(name .. ".json"), "r")
    if not f or not M.json then return nil end
    local text = f:read("a")
    f:close()
    local ok, v = pcall(M.json.decode, text)
    return ok and v or nil
end

function M.save_state(name, value)
    if not M.json then return false end
    return M.write(name .. ".json", M.json.encode(value))
end

function M.clear_state(name)
    os.remove(path(name .. ".json"))
end

--- Bir tabloyu tek geçişte oku. fields: alan adları; filter(row) true dönerse satır alınır.
--- key verilirse filtre yalnız bu alanla çalışır, elenen satırların diğer alanları okunmaz (players tablosunda çok fark eder).
--- Dönen satırlarda _rec (kayıt adresi) da var; yazmak için aynı tbl nesnesi kullanılmalı.
function M.read_rows(table_name, fields, filter, key)
    local tbl = LE.db:GetTable(table_name)
    if type(tbl) ~= "table" or type(tbl.fields) ~= "table" then return nil, nil end
    local present = {}
    for _, f in ipairs(fields) do
        if tbl.fields[f] then present[#present + 1] = f end
    end
    local rows = {}
    local rec = tbl:GetFirstRecord()
    while rec and rec > 0 do
        local row = { _rec = rec }
        if key then row[key] = tbl:GetRecordFieldValue(rec, key) end
        if not key or filter(row) then
            for _, f in ipairs(present) do row[f] = tbl:GetRecordFieldValue(rec, f) end
            if key or not filter or filter(row) then rows[#rows + 1] = row end
        end
        rec = tbl:GetNextValidRecord()
    end
    return rows, tbl
end

--- playerid -> satır, yalnızca istenen oyuncular. Yazmak için dönen tbl kullanılır.
function M.players_by_id(ids, fields)
    local f = { "playerid" }
    for _, x in ipairs(fields) do f[#f + 1] = x end
    local rows, tbl = M.read_rows("players", f, function(r) return ids[r.playerid] end, "playerid")
    local by = {}
    for _, r in ipairs(rows or {}) do by[r.playerid] = r end
    return by, tbl
end

function M.user_team_id()
    local ok, id = pcall(GetUserTeamID)
    return ok and id or 0
end

--- Kullanıcı takımının oyuncuları (teamplayerlinks, salt-okuma).
function M.user_team_players()
    local tid = M.user_team_id()
    local set = {}
    for _, r in ipairs(M.read_rows("teamplayerlinks", { "playerid", "teamid" }, function(r) return r.teamid == tid end) or {}) do
        set[r.playerid] = true
    end
    return set
end

--- Kullanıcı takımının ligi (milli takım ligleri hariç) ve o ligdeki takımlar.
function M.user_league()
    local tid = M.user_team_id()
    local intl = {}
    for _, l in ipairs(M.read_rows("leagues", { "leagueid", "isinternationalleague" }) or {}) do
        if l.isinternationalleague == 1 then intl[l.leagueid] = true end
    end
    local links = M.read_rows("leagueteamlinks", { "leagueid", "teamid" }) or {}
    local league
    for _, r in ipairs(links) do
        if r.teamid == tid and not intl[r.leagueid] then league = r.leagueid end
    end
    local teams = {}
    for _, r in ipairs(links) do
        if r.leagueid == league then teams[r.teamid] = true end
    end
    return league, teams
end

--- Kullanıcının ligindeki CPU takımlarından min_age–max_age yaş, erkek oyuncular; POT'a göre azalan.
--- Her satırda playerid, teamid, age, overallrating, potential, preferredposition1.
function M.pick_league_youngsters(n, min_age, max_age)
    local user = M.user_team_id()
    local _, teams = M.user_league()
    local team_of = {}
    for _, r in ipairs(M.read_rows("teamplayerlinks", { "playerid", "teamid" }) or {}) do
        if teams[r.teamid] and r.teamid ~= user and not team_of[r.playerid] then team_of[r.playerid] = r.teamid end
    end
    local date = M.date_str()
    local rows = M.read_rows("players", { "playerid", "birthdate", "overallrating", "potential", "preferredposition1", "gender" },
        function(r) return team_of[r.playerid] ~= nil and r.gender == 0 end) or {}
    local out = {}
    for _, r in ipairs(rows) do
        r.age = M.age(r.birthdate, date)
        r.teamid = team_of[r.playerid]
        if r.age and r.age >= min_age and r.age <= max_age and r.preferredposition1 ~= 0 then out[#out + 1] = r end
    end
    table.sort(out, function(a, b)
        if a.potential ~= b.potential then return a.potential > b.potential end
        return a.playerid < b.playerid
    end)
    local picked = {}
    for i = 1, math.min(n, #out) do picked[i] = out[i] end
    return picked
end

--- Güncel kiralık oyuncular: bellekteki LoansManager listesi (playerloans tablosu FC 27'de bayat).
--- Kayıt düzeni LE'nin career_mode/helpers.lua IsPlayerLoanedOut'undan: başlangıç +0x40, bitiş +0x48, 0x20 adım.
function M.loaned_out_set()
    local set = {}
    if type(GetManagerObjByTypeId) ~= "function" or not ENUM_FCEGameModesFCECareerModeLoansManager then return set end
    local ok, mgr = pcall(GetManagerObjByTypeId, ENUM_FCEGameModesFCECareerModeLoansManager)
    if not ok or not mgr or mgr <= 0 then return set end
    local first, last = MEMORY:ReadPointer(mgr + 0x40), MEMORY:ReadPointer(mgr + 0x48)
    if not first or not last or last < first or (last - first) // 0x20 > 5000 then return set end
    for rec = first, last - 1, 0x20 do set[ReadInteger(rec)] = true end
    return set
end

function M.name(pid)
    local ok, n = pcall(GetPlayerName, pid)
    return ok and n or ("#" .. tostring(pid))
end

function M.team_name(tid)
    local ok, n = pcall(GetTeamName, tid)
    return ok and n or ("#" .. tostring(tid))
end

local ATTRIBUTE_FIELDS = nil

--- Oyuncu alanı yaz. Kullanıcı takımındaki oyuncuda gelişim planı varsa özellik plana da yazılır
--- (DOC.MD: planın değeri players tablosundan önceliklidir; potansiyel planda değildir).
--- dry_run'da hiçbir şey yazılmaz, yalnızca rapora satır eklenir.
function M.set_player_field(tbl, row, field, value, opts)
    opts = opts or {}
    local old = row[field]
    if opts.report then
        opts.report:add(string.format("%d;%s;%s;%s;%s", row.playerid, M.name(row.playerid), field, tostring(old), tostring(value)))
    end
    if opts.dry_run then return true end
    local ok, err = pcall(tbl.SetRecordFieldValue, tbl, row._rec, field, value)
    if not ok then
        M.log(string.format("Yazılamadı %d %s %s: %s", row.playerid, field, tostring(value), tostring(err)))
        return false
    end
    if opts.user_team and opts.user_team[row.playerid] then
        if not ATTRIBUTE_FIELDS then
            ATTRIBUTE_FIELDS = {}
            for _, a in ipairs(M.weights().attributes) do ATTRIBUTE_FIELDS[a] = true end
        end
        if ATTRIBUTE_FIELDS[field] and type(PlayerHasDevelopementPlan) == "function"
            and PlayerHasDevelopementPlan(row.playerid) then
            pcall(PlayerSetValueInDevelopementPlan, row.playerid, field, value)
        end
    end
    return true
end

local WEIGHTS = nil
function M.weights()
    if not WEIGHTS then WEIGHTS = dofile(FCM_DIR .. "fcm_weights.lua") end
    return WEIGHTS
end

--- Pozisyon için en ağırlıklı n özellik (azalan).
function M.top_attributes(pos_label, n)
    local w = M.weights().weights[pos_label] or {}
    local list = {}
    for a, v in pairs(w) do list[#list + 1] = { a, v } end
    table.sort(list, function(x, y) return x[2] > y[2] end)
    local out = {}
    for i = 1, math.min(n, #list) do out[i] = list[i][1] end
    return out
end

--- Pozisyon ağırlıklarıyla puan (ağırlıklı ortalama).
function M.position_score(pos_label, values)
    local w = M.weights().weights[pos_label]
    if not w then return nil end
    local sum, total = 0, 0
    for a, v in pairs(w) do
        if type(values[a]) == "number" then sum = sum + v * values[a]; total = total + v end
    end
    return total > 0 and sum / total or nil
end

return M
