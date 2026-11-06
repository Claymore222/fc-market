-- cm_event_logger.lua
-- Salt-okuma keşif script'i (FC Live Editor, Lua API v2).
-- Tüm Career Mode event'lerini adlarıyla loglar. Oyunda hiçbir şeyi değiştirmez.
-- FC 27: isimler LE'nin kendi GetCMEventNameByID (helpers.lua) fonksiyonundan,
-- yoksa ENUM_FCEGameModesCM_EVENT_MSG_* / ENUM_CM_EVENT_MSG_* globallerinden gelir.

pcall(require, "imports/career_mode/enums")
pcall(require, "imports/career_mode/helpers")

local EVENT_NAMES = {}
for k, v in pairs(_G) do
    if type(k) == "string" and type(v) == "number" then
        local name = k:match("^ENUM_FCEGameModesCM_EVENT_MSG_(.+)$") or k:match("^ENUM_CM_EVENT_MSG_(.+)$")
        if name then EVENT_NAMES[v] = name end
    end
end

local function event_name(id)
    if type(GetCMEventNameByID) == "function" then
        local ok, n = pcall(GetCMEventNameByID, id)
        if ok and n then return n end
    end
    return EVENT_NAMES[id] or ("UNKNOWN_" .. tostring(id))
end

-- Sürekli tetiklenip logu dolduranlar
local NOISY = { HOURS_PASSED = true, LIVE_TABLE_UPDATE = true, SCREEN_HAS_DONE_LOADING = true }

function CMEventLogger__OnEvent(events_manager, event_id, event)
    local name = event_name(event_id)
    if not NOISY[name] then
        print(string.format("[CM-LOG] %-45s id=%d data=%s", name, event_id, tostring(event)))
    end
end

AddEventHandler("post__CareerModeEvent", CMEventLogger__OnEvent)
print("[CM-LOG] Career Mode event logger active")
