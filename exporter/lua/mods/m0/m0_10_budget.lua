-- M0/10 — Transfer ve maaş bütçesinin bellekteki yeri. SALT-OKUMA.
-- Oyunda Finans / transfer bütçesi ekranındaki değerleri tam sayı olarak aşağıya yaz (€, ör. 123890000).
-- Script BudgetManager ve FinanceManager'ın ilk 0x800 baytında bu değerleri (int32 ve int64) arar.
-- Sıra: ekrandaki iki değeri yaz → çalıştır → dosyayı bana gönder.
-- Çıktı: C:/FCExport/m0/10_budget.txt
local EXPECTED_TRANSFER = 0   -- ör. 123890000
local EXPECTED_WAGE = 0       -- haftalık ya da yıllık; ekranda ne yazıyorsa
-- Mali Durum > Bütçe ekranındaki diğer kalemler (başlangıç bütçesi, satılan/alınan oyuncular ...): finans verisinin yerini bulmak için
local EXTRA_VALUES = {}

FCM_DIR = "C:/FC27LE/lua/scripts/"
local M = dofile(FCM_DIR .. "fcm_common.lua")
local r = M.report("10_budget.txt")
r:add(string.format("== M0/10 bütçe | oyun tarihi %s | %s | beklenen transfer %d, maaş %d", M.date_str(), os.date(),
    EXPECTED_TRANSFER, EXPECTED_WAGE))

local function manager(name)
    local id = _G["ENUM_FCEGameModesFCECareerMode" .. name]
    if type(id) ~= "number" or type(GetManagerObjByTypeId) ~= "function" then return 0, id end
    local ok, v = pcall(GetManagerObjByTypeId, id)
    return ok and v or 0, id
end

local targets = {}
local function want(v, label)
    if v > 0 then
        targets[v] = label
        targets[v // 1000] = label .. "/1000"
    end
end
want(EXPECTED_TRANSFER, "transfer bütçesi")
want(EXPECTED_WAGE, "maaş bütçesi")
for _, v in ipairs(EXTRA_VALUES) do want(v, "ek " .. v) end

for _, name in ipairs({ "BudgetManager", "FinanceManager" }) do
    local addr, id = manager(name)
    r:add(string.format("%s (tip %s) @ 0x%X", name, tostring(id), addr))
    if addr > 0 then
        r:add(string.format("  +0x038 int32 = %d (transfer bütçesi adayı)", ReadInteger(addr + 0x38)))
        for off = 0, 0x800 - 4, 4 do
            local v32 = ReadInteger(addr + off)
            if targets[v32] then r:add(string.format("  +0x%03X int32 %d  <- %s", off, v32, targets[v32])) end
            if off % 8 == 0 then
                local v64 = ReadQword(addr + off)
                if targets[v64] and v64 ~= v32 then r:add(string.format("  +0x%03X int64 %d  <- %s", off, v64, targets[v64])) end
            end
        end
    end
end
if next(targets) == nil then r:add("EXPECTED_TRANSFER / EXPECTED_WAGE girilmedi; yalnızca +0x38 yazıldı.") end
r:save("a")
