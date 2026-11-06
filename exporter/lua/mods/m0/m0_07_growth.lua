-- M0/07 — growthprofile dağılımı ve PLAYER_GROWTH (53) event'inin ne sıklıkla geldiği.
-- SALT-OKUMA. Çalıştırınca dağılımı yazar ve event'i saymaya başlar (oyun gününe göre, dosyaya eklenir).
-- Sıra: çalıştır → 1 ay ilerlet → dosyayı bana gönder.
-- Çıktı: C:/FCExport/m0/07_growth.txt
FCM_DIR = "C:/FC27LE/lua/scripts/"
local M = dofile(FCM_DIR .. "fcm_common.lua")
local r = M.report("07_growth.txt")
local date = M.date_str()
r:add("== M0/07 growthprofile | oyun tarihi " .. date .. " | " .. os.date())

local rows = M.read_rows("players", { "growthprofile", "birthdate", "overallrating", "potential", "gender" },
    function(p) return p.gender == 0 end) or {}
local by = {}
for _, p in ipairs(rows) do
    local g = by[p.growthprofile] or { n = 0, age = 0, gap = 0, young = 0 }
    local age = M.age(p.birthdate, date) or 0
    g.n, g.age, g.gap = g.n + 1, g.age + age, g.gap + (p.potential - p.overallrating)
    if age <= 21 then g.young = g.young + 1 end
    by[p.growthprofile] = g
end
local keys = {}
for k in pairs(by) do keys[#keys + 1] = k end
table.sort(keys)
r:add("growthprofile | oyuncu | ort. yaş | ort. POT−OVR | ≤21 yaş")
for _, k in ipairs(keys) do
    local g = by[k]
    r:add(string.format("%13s | %6d | %8.1f | %12.1f | %d", tostring(k), g.n, g.age / g.n, g.gap / g.n, g.young))
end
r:save("a")

if not FCM07_REGISTERED and type(AddEventHandler) == "function" then
    FCM07_REGISTERED = true
    FCM07_COUNTS = {}
    AddEventHandler("post__CareerModeEvent", function(_, id)
        if id ~= 53 then return end
        local d = M.date_str()
        FCM07_COUNTS[d] = (FCM07_COUNTS[d] or 0) + 1
        if FCM07_COUNTS[d] == 1 then M.write("07_growth.txt", "PLAYER_GROWTH: " .. d .. " (ilk)\n", "a") end
    end)
    AddEventHandler("post__CareerModeEvent", function(_, id)
        if id ~= 17 then return end -- MONTH_PASSED: ayın sayımını yaz
        local lines = { "PLAYER_GROWTH sayıları (MONTH_PASSED " .. M.date_str() .. "):" }
        for d, n in pairs(FCM07_COUNTS) do lines[#lines + 1] = "  " .. d .. ": " .. n end
        M.write("07_growth.txt", table.concat(lines, "\n") .. "\n", "a")
    end)
    M.write("07_growth.txt", "PLAYER_GROWTH sayacı kuruldu\n", "a")
end
