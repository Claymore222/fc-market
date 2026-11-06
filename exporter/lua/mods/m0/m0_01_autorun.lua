-- M0/01 — Autorun hangi klasörden çalışıyor; LEInitDoneEvent ve kariyer yükleme (POST_LOAD_PREPARE) sırası.
-- SALT-OKUMA. Bu dosya iki aday autorun klasörüne de kopyalanır; hangisi çalışırsa yolunu yazar.
-- Çıktı: C:/FCExport/m0/01_autorun.txt (her çalışmada eklenir)
local OUT = "C:/FCExport/m0/01_autorun.txt"

local function w(msg)
    local f = io.open(OUT, "a")
    if f then
        f:write(os.date("%Y-%m-%d %H:%M:%S  ") .. msg .. "\n")
        f:close()
    end
    print("[FCM-01] " .. msg)
end

local function safe(fn, ...)
    if type(fn) ~= "function" then return "yok" end
    local ok, v = pcall(fn, ...)
    return ok and tostring(v) or ("hata: " .. tostring(v))
end

w("yüklendi: " .. debug.getinfo(1, "S").source .. " | IsInCM=" .. safe(IsInCM) .. " | LE=" .. type(LE))

if not FCM01_REGISTERED and type(AddEventHandler) == "function" then
    FCM01_REGISTERED = true
    AddEventHandler("post__LEInitDoneEvent", function(...)
        w("post__LEInitDoneEvent | LE=" .. type(LE) .. " | IsInCM=" .. safe(IsInCM) .. " | argüman sayısı=" .. select("#", ...))
    end)
    AddEventHandler("post__CareerModeEvent", function(_, id)
        if id == 29 then -- POST_LOAD_PREPARE
            w("POST_LOAD_PREPARE (kariyer yüklendi) | save=" .. safe(GetSaveUID) .. " | takım=" .. safe(GetUserTeamID))
        end
    end)
    w("handler'lar kuruldu")
end
