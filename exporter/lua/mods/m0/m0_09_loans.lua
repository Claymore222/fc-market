-- M0/09 — Güncel kiralıklar: bellekteki LoansManager listesi (LE'nin IsPlayerLoanedOut'unun okuduğu yer)
-- ile bayat playerloans tablosu karşılaştırması. SALT-OKUMA.
-- Sıra: çalıştır → oyunda kendi takımının "kiralıktakiler" listesinden 2–3 isim yaz → dosyadaki listeyle karşılaştıracağız.
-- Çıktı: C:/FCExport/m0/09_loans.txt
FCM_DIR = "C:/FC27LE/lua/scripts/"
local M = dofile(FCM_DIR .. "fcm_common.lua")
local r = M.report("09_loans.txt")
r:add("== M0/09 kiralıklar | oyun tarihi " .. M.date_str() .. " | " .. os.date())

local mgr = 0
if type(GetManagerObjByTypeId) == "function" and ENUM_FCEGameModesFCECareerModeLoansManager then
    local ok, v = pcall(GetManagerObjByTypeId, ENUM_FCEGameModesFCECareerModeLoansManager)
    mgr = ok and v or 0
end
r:add(string.format("LoansManager @ 0x%X", mgr))
local in_memory = {}
if mgr > 0 then
    local first, last = MEMORY:ReadPointer(mgr + 0x40), MEMORY:ReadPointer(mgr + 0x48)
    local n = (last - first) // 0x20
    r:add("kayıt sayısı (0x20 adımlı): " .. n)
    for i = 0, math.min(n, 400) - 1 do
        local rec = first + i * 0x20
        local ints = {}
        for k = 0, 7 do ints[#ints + 1] = ReadInteger(rec + k * 4) end
        local pid = ints[1]
        in_memory[pid] = true
        if i < 40 then r:add(string.format("  %s (id %d) | ham: %s", M.name(pid), pid, table.concat(ints, " "))) end
    end
end

local stale = M.read_rows("playerloans", { "playerid" }) or {}
local both = 0
for _, s in ipairs(stale) do if in_memory[s.playerid] then both = both + 1 end end
r:add(string.format("playerloans tablosu: %d satır, bunların %d tanesi bellek listesinde de var", #stale, both))
r:add("Not: LE'nin IsPlayerLoanedOut'u bellekte bulamazsa bayat tabloya da bakıyor; mod'larda yalnızca bellek listesi kullanılmalı.")
r:save("a")
