--[[
  fc_stats_probe.lua  —  oyuncu sezon istatistiklerine giden yolu arar (salt okuma, GÜVENLİ mod)

  NE YAPAR
    1. API: adında istatistik geçen Lua fonksiyonlarını listeler, bilinen adları dener.
    2. Tablolar: 268 tablonun alan adlarında gol, asist, maç, puan arar; hiç incelenmemiş tablolardan örnek satır alır.
    3. Bellek: istatistik yöneticilerinin başlığını fc_memprobe gibi okur. İşaretçiler TAKİP EDİLMEZ.

  OYUNDA HİÇBİR ŞEYİ DEĞİŞTİRMEZ. ÇIKTI: C:/FCExport/fc_stats_probe.txt (her satır anında yazılır)
  Kariyer yüklüyken, en az bir resmi maç oynanmışsa Lua Engine'den çalıştır.
]]

local OUT = "C:/FCExport/fc_stats_probe.txt"
local HEADER_BYTES = 0x300
local SAMPLE_ROWS = 3
local MAX_COUNT = 200000

local out = io.open(OUT, "w")
local function w(s)
    if out then out:write(tostring(s), "\n") out:flush() end
    print("[FC-STATS] " .. tostring(s))
end

pcall(require, "imports/career_mode/enums")
pcall(require, "imports/career_mode/helpers")

local FUNCTIONS = { "GetPlayersStats", "GetPlayerStats", "cGetPlayersStats", "cGetPlayerStats",
    "GetSeasonStats", "GetPlayerSeasonStats", "GetCompetitionStats" }
local NAME_WORDS = { "stat", "season", "appear", "goal", "assist", "motm", "rating", "competition" }
local NOT_STATS = { "state", "status", "static" }
local FIELD_WORDS = { "goal", "assist", "appear", "rating", "avg", "motm", "clean", "yellow", "redcard", "conceded", "save", "stat", "minutes" }
local SAMPLE_TABLES = { "career_playerawards", "career_teamofweek", "teamsheetanalysis", "persistent_events",
    "career_playermatchratinghistory", "prevcompetitionstats" }
local MANAGERS = { { "SeasonStats", 102 }, { "HistoricalStats", 49 }, { "ProfileStats", 93 }, { "StatisticsView", 109 }, { "StatsUtils", 151 } }

local function has_word(text, words)
    local lower = string.lower(text)
    for _, word in ipairs(words) do
        if string.find(lower, word, 1, true) then return true end
    end
    return false
end

local function is_stat_name(name)
    return has_word(name, NAME_WORDS) and not has_word(name, NOT_STATS)
end

local function ptr_ok(p) return type(p) == "number" and p > 0x10000 and p < 0x7FFF00000000 end

local function list_names(title, source)
    local names = {}
    for key, value in pairs(source) do
        if type(key) == "string" and is_stat_name(key) then names[#names + 1] = key .. " (" .. type(value) .. ")" end
    end
    table.sort(names)
    w(string.format("%s: %d ad", title, #names))
    for _, name in ipairs(names) do w("   " .. name) end
end

local function show_rows(rows)
    if type(rows) ~= "table" then return end
    w("   satır: " .. tostring(#rows))
    for i = 1, math.min(#rows, SAMPLE_ROWS) do
        local parts = {}
        if type(rows[i]) == "table" then
            for key, value in pairs(rows[i]) do parts[#parts + 1] = tostring(key) .. "=" .. tostring(value) end
            table.sort(parts)
        end
        w("   " .. table.concat(parts, " "))
    end
end

local function probe_api()
    w("== 1. API ==")
    list_names("_G", _G)
    if type(LE) == "table" then
        list_names("LE", LE)
        if type(LE.players_manager) == "table" then list_names("LE.players_manager", LE.players_manager) end
    end
    for _, name in ipairs(FUNCTIONS) do
        local fn = _G[name]
        if type(fn) ~= "function" then
            w(name .. ": yok")
        else
            local ok, result = pcall(fn)
            w(string.format("%s: var, sonuç=%s (%s)", name, ok and type(result) or "hata", ok and "" or tostring(result)))
            if ok then show_rows(result) end
        end
    end
end

local function open_table(name)
    if type(LE) ~= "table" or type(LE.db) ~= "table" then return nil end
    local ok, tbl = pcall(LE.db.GetTable, LE.db, name)
    if ok and type(tbl) == "table" and type(tbl.fields) == "table" then return tbl end
    return nil
end

local function probe_fields()
    w("== 2. Alan adları ==")
    if type(LE) ~= "table" or type(LE.db) ~= "table" then w("LE.db yok") return end
    if type(LE.db.tables) ~= "table" or next(LE.db.tables) == nil then pcall(LE.db.Load, LE.db) end
    local names = {}
    for name in pairs(LE.db.tables or {}) do names[#names + 1] = tostring(name) end
    table.sort(names)
    w("tablo: " .. #names)
    for _, name in ipairs(names) do
        local found = {}
        for field in pairs(type(LE.db.tables[name].fields) == "table" and LE.db.tables[name].fields or {}) do
            if has_word(field, FIELD_WORDS) and not has_word(field, NOT_STATS) then found[#found + 1] = field end
        end
        table.sort(found)
        if #found > 0 then w(name .. ": " .. table.concat(found, ", ")) end
    end
end

-- TABLE nesnesi iterasyon durumunu paylaşıyor; tablolar sırayla okunur.
local function probe_samples()
    w("== 3. Örnek satırlar ==")
    for _, name in ipairs(SAMPLE_TABLES) do
        local tbl = open_table(name)
        if not tbl then
            w(name .. ": açılamadı")
        else
            local fields = {}
            for field in pairs(tbl.fields) do fields[#fields + 1] = field end
            table.sort(fields)
            w(name .. " alanlar: " .. table.concat(fields, ", "))
            local count, rec = 0, tbl:GetFirstRecord()
            while rec and rec > 0 and count < MAX_COUNT do
                count = count + 1
                if count <= SAMPLE_ROWS then
                    local parts = {}
                    for _, field in ipairs(fields) do
                        local ok, value = pcall(tbl.GetRecordFieldValue, tbl, rec, field)
                        parts[#parts + 1] = field .. "=" .. tostring(ok and value or "?")
                    end
                    w("   " .. table.concat(parts, " "))
                end
                rec = tbl:GetNextValidRecord()
            end
            w("   kayıt: " .. count)
        end
    end
end

local function probe_managers()
    w("== 4. Bellek başlıkları ==")
    if type(GetManagerObjByTypeId) ~= "function" or type(ReadBytes) ~= "function" then
        w("GetManagerObjByTypeId/ReadBytes yok")
        return
    end
    for _, manager in ipairs(MANAGERS) do
        local ok, address = pcall(GetManagerObjByTypeId, manager[2])
        if not ok or not ptr_ok(address) then
            w(string.format("%-16s id=%3d yok (%s)", manager[1], manager[2], tostring(address)))
        else
            local read, bytes = pcall(ReadBytes, address, HEADER_BYTES)
            if not read or type(bytes) ~= "table" then
                w(string.format("%-16s id=%3d adres=0x%X okunamadı", manager[1], manager[2], address))
            else
                w(string.format("%-16s id=%3d adres=0x%X", manager[1], manager[2], address))
                local hex = {}
                for i = 1, #bytes do hex[#hex + 1] = string.format("%02x", bytes[i]) end
                for row = 0, #bytes - 1, 32 do
                    w(string.format("   +0x%03X %s", row, table.concat(hex, " ", row + 1, math.min(row + 32, #bytes))))
                end
                local function q(i)
                    local v = 0
                    for k = 7, 0, -1 do v = v * 256 + bytes[i + k + 1] end
                    return v
                end
                for off = 0, #bytes - 16, 8 do
                    local first, last = q(off), q(off + 8)
                    if ptr_ok(first) and ptr_ok(last) and last > first and last - first <= 8 * 1024 * 1024 then
                        w(string.format("   dizi adayı +0x%03X: 0x%X..0x%X (%d bayt)", off, first, last, last - first))
                    end
                end
            end
        end
    end
end

w("fc_stats_probe 0.1.0 — " .. os.date("%Y-%m-%d %H:%M:%S"))
if type(IsInCM) == "function" then w("kariyer açık: " .. tostring(select(2, pcall(IsInCM)))) end
for _, step in ipairs({ probe_api, probe_fields, probe_samples, probe_managers }) do
    local ok, err = pcall(step)
    if not ok then w("ADIM HATASI: " .. tostring(err)) end
end
w("— bitti —")
if out then out:close() end
if type(MessageBox) == "function" then pcall(MessageBox, "FC Stats Probe", "Bitti.\n" .. OUT) end
