--[[
  le_capabilities.lua — Bu Live Editor sürümü NELERİ destekliyor? (salt-okuma)
  Live Editor -> Features -> Lua Engine'den çalıştır (mümkünse career save yüklüyken).
  Çıktı: OUT_DIR/le_capabilities_<tarih>.txt  (bunu Claude'a gönder; eski raporlar korunur)
]]
local OUT_DIR = "C:/FCExport"   -- fc_export.lua ile aynı klasör (önceden oluştur)

pcall(require, "imports/career_mode/enums")

-- Projede kullanmak istediğimiz fonksiyonlar (kategori -> isimler)
local WANTED = {
    ["Temel / career"] = { "IsInCM", "GetSaveUID", "GetCurrentDate", "GetUserTeamID", "GetTeamName",
        "GetPlayerName", "GetTeamIdFromPlayerId", "Log", "MessageBox", "Sleep" },
    ["Veritabanı (export)"] = { "GetDBTablesNames", "GetDBTableFields", "GetDBTableRows",
        "EditDBTableField", "InsertDBTableRow", "DeleteDBTableRow" },
    ["İstatistik / bütçe"] = { "GetPlayersStats", "GetPlayerStats", "GetTransferBudget",
        "GetUserTransferBudget", "GetUserWageBudget", "SetTransferBudget" },
    ["Event'ler"] = { "AddEventHandler", "GetEventHandlers", "RemoveEventHandler" },
    ["Transfer / liste (yazma)"] = { "TransferPlayer", "LoanPlayer", "CreateOfferForPlayer",
        "AddPlayerToTransferList", "AddPlayerToLoanList", "RemovePlayerFromLists",
        "IsPlayerTransferListed", "ReleasePlayerFromTeam" },
    ["Oyuncu durumu (yazma)"] = { "SetPlayerMorale", "SetPlayerForm", "SetPlayerSharpness", "SetPlayerFitness" },
    ["Miniface / fotoğraf"] = { "PlayerCaptureSetOutputDirectory", "PlayerCaptureSetSize",
        "PlayerCaptureSetType", "PlayerCaptureSetCamera", "PlayerCaptureAddPlayer", "PlayerCaptureStart" },
    -- 27.1.4: Generate Miniface (oyuncu/menajer editörü), Transfer History; 27.1.7: League Standings, Fixtures (tahmini adlar)
    ["Miniface üretimi (27.1.4+)"] = { "GenerateMiniface", "GeneratePlayerMiniface", "PlayerCaptureIsRunning", "PlayerCaptureClear" },
    ["Transfer geçmişi (27.1.4+)"] = { "GetTransferHistory", "GetTransfersHistory", "GetPlayerTransferHistory" },
    ["Lig tablosu / fikstür (27.1.7)"] = { "GetLeagueStandings", "GetStandings", "GetFixtures", "GetTeamFixtures" },
    ["Legacy dosyalar"] = { "LegacyFileExist", "LegacyFileExport", "LegacyFileImport" },
}

-- Adında bu kelimeler geçen her fonksiyon/üye ayrıca listelenir (sürümde yeni gelenleri yakalamak için)
local KEYWORDS = { "capture", "miniface", "face", "head", "transfer", "history", "standing", "fixture", "morale",
    "board", "finance", "objective", "job", "budget", "reveal", "legacy", "loan", "contract", "personality" }

-- LE'nin v1 kütüphanesi (lua/libs/v1/live_editor.lua) bunları C fonksiyonu üstünde sarmalayıcı olarak tanımlıyor.
-- Sarmalayıcı her zaman var; C fonksiyonu yoksa çağrı hata verir. FC 27 LE v27.1.3'te çoğu yok.
local BACKING = {
    TransferPlayer = "cTransferPlayer", LoanPlayer = "cLoanPlayer", ReleasePlayerFromTeam = "cReleasePlayer",
    IsPlayerTransferListed = "cIsPlayerTransferListed", IsPlayerLoanListed = "cIsPlayerLoanListed",
    AddPlayerToTransferList = "cAddPlayerToTransferList", AddPlayerToLoanList = "cAddPlayerToLoanList",
    RemovePlayerFromLists = "cRemovePlayerFromLists", RemovePlayerFromLoanList = "cRemovePlayerFromLoanList",
    RemovePlayerFromTransferList = "cRemovePlayerFromTransferList",
}
-- Değer döndürmeden "deprecated" uyarısı basan eski fonksiyonlar
local STUBS = { GetTransferBudget = true, SetTransferBudget = true }

-- "var" | "sarmalayıcı (cX yok)" | "eski uyarı fonksiyonu" | nil (yok)
local function availability(fn)
    if type(_G[fn]) ~= "function" then return nil end
    if STUBS[fn] then return "eski uyarı fonksiyonu" end
    local c = BACKING[fn]
    if c and type(_G[c]) ~= "function" then return "sarmalayıcı (" .. c .. " yok)" end
    return "var"
end

local out = {}
local function w(s) out[#out + 1] = s end
local function count(t) local n = 0 for _ in pairs(t) do n = n + 1 end return n end

w("Live Editor yetenek raporu — " .. os.date("%Y-%m-%d %H:%M:%S"))
w("Lua sürümü: " .. tostring(_VERSION))
local okCM, inCM = pcall(function() return IsInCM and IsInCM() end)
w("Career Mode'da mı: " .. tostring(okCM and inCM))
w("")

-- 0) LUA API v2 (FC 27'nin asıl API'si)
pcall(require, "imports/career_mode/helpers")
local okHttp = pcall(require, "imports/http/http")
w("=== LUA API v2 ===")
w("LE nesnesi: " .. type(LE) .. "   LE.version: " .. tostring(type(LE) == "table" and LE.version or nil))
w("LE.db:GetTable: " .. tostring(type(LE) == "table" and type(LE.db) == "table" and type(LE.db.GetTable) == "function"))
local okDb, nT = pcall(function() LE.db:Load(); return LE.db.tables_count end)
w("LE.db tablo sayısı: " .. tostring(okDb and nT or "okunamadı"))
local okP, nP = pcall(function()
    local t = LE.db:GetTable("players"); local n, r = 0, t:GetFirstRecord()
    while r > 0 do n = n + 1; r = t:GetNextValidRecord() end
    return n
end)
w("players kayıt sayısı (v2): " .. tostring(okP and nP or "okunamadı"))
w("HTTP modülü: " .. tostring(okHttp and type(HTTP) == "table"))
for _, fn in ipairs({ "GetDBMeta", "GetPlugin", "GetCMEventNameByID", "AddEventHandler", "Sleep" }) do
    w(string.format("  %-22s %s", fn, type(_G[fn]) == "function" and "✓" or "YOK"))
end
w("")

-- 1) İstediğimiz fonksiyonlar var mı?
w("=== PROJE İÇİN GEREKENLER ===")
local cats = {}
for k in pairs(WANTED) do cats[#cats + 1] = k end
table.sort(cats)
for _, cat in ipairs(cats) do
    local have, total = 0, #WANTED[cat]
    local missing, broken = {}, {}
    for _, fn in ipairs(WANTED[cat]) do
        local a = availability(fn)
        if a == "var" then have = have + 1
        elseif a then broken[#broken + 1] = fn .. ": " .. a
        else missing[#missing + 1] = fn end
    end
    w(string.format("[%s] %d/%d%s", cat, have, total,
        #missing > 0 and ("   EKSİK: " .. table.concat(missing, ", ")) or (#broken == 0 and "   ✓" or "")))
    if #broken > 0 then w("    kullanılamaz: " .. table.concat(broken, "; ")) end
end
w("")

-- 1b) Anahtar kelime eşleşmeleri: global fonksiyonlar ve LE.* altındaki üyeler (bir seviye derin)
local function matches(name)
    local l = string.lower(name)
    for _, k in ipairs(KEYWORDS) do if l:find(k, 1, true) then return true end end
    return false
end
w("=== İLGİLİ ADLAR (" .. table.concat(KEYWORDS, ", ") .. ") ===")
local hits = {}
for k, v in pairs(_G) do
    if type(k) == "string" and type(v) == "function" and matches(k) then hits[#hits + 1] = k end
end
if type(LE) == "table" then
    pcall(function()
        for mk, mv in pairs(LE) do
            if matches(tostring(mk)) then hits[#hits + 1] = "LE." .. tostring(mk) .. "(" .. type(mv) .. ")" end
            if type(mv) == "table" then
                for sk, sv in pairs(mv) do
                    if matches(tostring(sk)) then hits[#hits + 1] = "LE." .. tostring(mk) .. "." .. tostring(sk) .. "(" .. type(sv) .. ")" end
                end
            end
        end
    end)
end
table.sort(hits)
w(#hits > 0 and table.concat(hits, "\n") or "(eşleşme yok)")
w("")

-- 1c) LE.* modüllerinin tüm üyeleri (v2 API'sinin yeni parçaları)
if type(LE) == "table" then
    w("=== LE MODÜLLERİ ===")
    local mods = {}
    pcall(function() for mk in pairs(LE) do mods[#mods + 1] = tostring(mk) end end)
    table.sort(mods)
    for _, mk in ipairs(mods) do
        local mv, members = LE[mk], {}
        if type(mv) == "table" then
            pcall(function() for sk, sv in pairs(mv) do members[#members + 1] = tostring(sk) .. "(" .. type(sv):sub(1, 1) .. ")" end end)
            table.sort(members)
        end
        w(string.format("LE.%s  [%s]%s", mk, type(mv), #members > 0 and (": " .. table.concat(members, ", ", 1, math.min(#members, 80))) or ""))
    end
    w("")
end

-- 2) Tüm global fonksiyonlar (sürümün gerçek API'si)
local funcs, tables, enums = {}, {}, 0
for k, v in pairs(_G) do
    if type(k) == "string" then
        if type(v) == "function" then funcs[#funcs + 1] = k
        elseif type(v) == "table" and k ~= "_G" and k ~= "package" then tables[#tables + 1] = k
        elseif type(v) == "number" and k:find("^ENUM_") then enums = enums + 1 end
    end
end
table.sort(funcs); table.sort(tables)
w("=== TÜM GLOBAL FONKSİYONLAR (" .. #funcs .. ") ===")
w(table.concat(funcs, "\n"))
w("")

-- 3) Global tablolar ve içlerindeki fonksiyonlar (örn. LE.db gibi nesne tabanlı API'ler)
w("=== GLOBAL TABLOLAR (" .. #tables .. ") ===")
for _, name in ipairs(tables) do
    local t = _G[name]
    local members = {}
    local ok = pcall(function()
        for mk, mv in pairs(t) do
            if type(mv) == "function" or type(mv) == "table" or type(mv) == "userdata" then
                members[#members + 1] = tostring(mk) .. "(" .. type(mv):sub(1, 1) .. ")"
            end
        end
    end)
    table.sort(members)
    w(string.format("%s  [%d üye]%s", name, ok and count(members) or -1,
        #members > 0 and (": " .. table.concat(members, ", ", 1, math.min(#members, 60))) or ""))
end
w("")
w("ENUM_* sabit sayısı: " .. enums)

-- 4) DB tabloları (varsa)
local okT, names = pcall(function() return GetDBTablesNames and GetDBTablesNames() end)
if okT and type(names) == "table" then
    local list = {}
    for _, n in ipairs(names) do list[#list + 1] = tostring(n) end
    table.sort(list)
    w("")
    w("=== DB TABLOLARI (" .. #list .. ") ===")
    w(table.concat(list, ", "))
end

local text = table.concat(out, "\n")
print(text)
local file = OUT_DIR .. "/le_capabilities_" .. os.date("%Y%m%d_%H%M") .. ".txt"
local f = io.open(file, "w")
if f then
    f:write(text); f:close()
    if type(MessageBox) == "function" then pcall(MessageBox, "LE Capabilities", "Rapor yazıldı: " .. file) end
else
    print("UYARI: " .. OUT_DIR .. " klasörüne yazılamadı. Raporu yukarıdaki konsol çıktısından kopyala.")
end
