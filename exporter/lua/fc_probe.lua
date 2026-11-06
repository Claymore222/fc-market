-- fc_probe.lua: oyun tarihi, kullanıcı takımı ve bütçe bellekte nerede? (SALT-OKUMA, birkaç saniye)
-- Çalıştırmadan önce oyundaki tarihi ve transfer bütçesini not et. Çıktı: C:/FCExport/fc_probe.txt
local out = {}
local function w(...)
    local t = {}
    for i = 1, select("#", ...) do t[#t + 1] = tostring((select(i, ...))) end
    out[#out + 1] = table.concat(t, " ")
end

-- v2 yüklü değilse elle başlat (LE klasörü ASCII bir yolda olmalı)
if type(LE) ~= "table" then
    local ok, err = pcall(require, "main")
    w("v2 elle başlatma:", ok, ok and "" or err)
end
for _, m in ipairs({ "imports/services/enums", "imports/career_mode/enums", "imports/career_mode/helpers" }) do
    local ok, err = pcall(require, m)
    if not ok then w("require", m, "HATA:", err) end
end
w("LE:", type(LE), "| GetManagerObjByTypeId:", type(GetManagerObjByTypeId), "| ReadInteger:", type(ReadInteger))

if type(GetUserTeamID) == "function" then
    local ok, tid = pcall(GetUserTeamID)
    local name = ""
    if ok and type(GetTeamName) == "function" then name = select(2, pcall(GetTeamName, tid)) end
    w("GetUserTeamID:", ok, tid, name)
end

local function manager(type_id)
    if type(GetManagerObjByTypeId) ~= "function" or type(type_id) ~= "number" then return 0 end
    local ok, addr = pcall(GetManagerObjByTypeId, type_id)
    return (ok and type(addr) == "number") and addr or 0
end

local function plugin(clss)
    if type(GetPlugin) ~= "function" or type(clss) ~= "number" then return 0 end
    local ok, addr = pcall(GetPlugin, clss)
    return (ok and type(addr) == "number") and addr or 0
end

local function valid_ymd(v)
    local y, m, d = v // 10000, (v // 100) % 100, v % 100
    return y >= 2000 and y <= 2100 and m >= 1 and m <= 12 and d >= 1 and d <= 31
end

-- LE'nin imports/core/date.lua FromGregorianDays'i ile aynı (gün 0 = 1582-10-15)
local function gdays_to_str(days)
    local a = days + 2331205
    local b = (4 * a + 3) // 146097
    local c = a - (146097 * b) // 4
    local d = (4 * c + 3) // 1461
    local e = c - (1461 * d) // 4
    local m = (5 * e + 2) // 153
    return string.format("%04d-%02d-%02d", 100 * b + d - 4800 + m // 10, m + 3 - 12 * (m // 10), e - (153 * m + 2) // 5 + 1)
end

local function read_int(addr)
    local ok, v = pcall(ReadInteger, addr)
    return (ok and type(v) == "number") and v or nil
end

local function scan_date(label, addr, size)
    w(string.format("== %s @ 0x%X", label, addr))
    if addr == 0 then w("  adres 0, atlandı"); return end
    for off = 0, size - 4, 4 do
        local v = read_int(addr + off)
        if v and valid_ymd(v) then
            w(string.format("  +0x%03X YYYYMMDD %d", off, v))
        elseif v and v >= 155000 and v <= 175000 then
            w(string.format("  +0x%03X gün %d -> %s", off, v, gdays_to_str(v)))
        end
    end
    for off = 0, size - 12, 4 do
        local a, b, c = read_int(addr + off), read_int(addr + off + 4), read_int(addr + off + 8)
        if a and b and c and b >= 1 and b <= 12 then
            if a >= 1 and a <= 31 and c >= 2000 and c <= 2100 then w(string.format("  +0x%03X gün/ay/yıl %d/%d/%d", off, a, b, c)) end
            if c >= 1 and c <= 31 and a >= 2000 and a <= 2100 then w(string.format("  +0x%03X yıl/ay/gün %d/%d/%d", off, a, b, c)) end
        end
    end
end

local function scan_money(label, addr, size)
    w(string.format("== %s @ 0x%X (100.000 - 2.000.000.000 arası int'ler)", label, addr))
    if addr == 0 then w("  adres 0, atlandı"); return end
    for off = 0, size - 4, 4 do
        local v = read_int(addr + off)
        if v and v >= 100000 and v <= 2000000000 then w(string.format("  +0x%03X %d", off, v)) end
    end
end

scan_date("CalendarManager", manager(ENUM_FCEGameModesFCECareerModeCalendarManager), 0x400)
scan_date("CalendarService", plugin(ENUM_djb2CalendarService_CLSS), 0x200)
scan_money("BudgetManager", manager(ENUM_FCEGameModesFCECareerModeBudgetManager), 0x400)
scan_money("FinanceManager", manager(ENUM_FCEGameModesFCECareerModeFinanceManager), 0x400)

local text = table.concat(out, "\n")
print(text)
local f = io.open("C:/FCExport/fc_probe.txt", "w")
if f then f:write(text); f:close() end
if type(MessageBox) == "function" then pcall(MessageBox, "FC Probe", "Bitti: C:/FCExport/fc_probe.txt") end
