-- M0/05 — cm_teamsheets maç öncesi canlı mı? (yabancı kuralı ve büyük maç mod'ları için)
-- SALT-OKUMA. Çalıştırınca şu anki kadro sayfasını döker ve ABOUT_TO_ENTER_PREMATCH (37) /
-- ABOUT_TO_LEAVE_PREMATCH (38) event'lerinde tekrar döker.
-- Sıra: script'i çalıştır → sıradaki maça git → maç öncesi ekranda ilk 11'den bir oyuncuyu değiştir (not al) →
-- maça başla → dosyayı bana gönder.
-- Çıktı: C:/FCExport/m0/05_teamsheet.txt
FCM_DIR = "C:/FC27LE/lua/scripts/"
local M = dofile(FCM_DIR .. "fcm_common.lua")

local function dump(label)
    local r = M.report("05_teamsheet.txt")
    local tid = M.user_team_id()
    r:add(string.format("== %s | oyun tarihi %s | %s | takım %d", label, M.date_str(), os.date("%H:%M:%S"), tid))
    local fields = { "teamid", "captainid" }
    for i = 0, 17 do fields[#fields + 1] = "playerid" .. i end
    local rows = M.read_rows("cm_teamsheets", fields, function(row) return row.teamid == tid end) or {}
    r:add("cm_teamsheets satırı: " .. #rows)
    for _, row in ipairs(rows) do
        for i = 0, 17 do
            local pid = row["playerid" .. i]
            if pid and pid > 0 then r:add(string.format("  %2d %s%s", i, M.name(pid), i == 10 and "   <- ilk 11 sonu" or "")) end
        end
    end
    r:save("a")
end

dump("script çalıştırıldı")
if not FCM05_REGISTERED and type(AddEventHandler) == "function" then
    FCM05_REGISTERED = true
    AddEventHandler("post__CareerModeEvent", function(_, id)
        if id == 37 then pcall(dump, "ABOUT_TO_ENTER_PREMATCH (37)") end
        if id == 38 then pcall(dump, "ABOUT_TO_LEAVE_PREMATCH (38)") end
    end)
end
