-- M0/11 — Event handler'ın 3. argümanı (event) içinde oyuncu/takım bilgisi var mı? SALT-OKUMA.
-- Seçili event'lerde argümanın tipini yazar; sayıysa (bellek adresi) ilk 16 int32'yi okur ve bilinen
-- playerid / teamid değerlerini işaretler. Event başına en fazla 15 kayıt.
-- Sıra: çalıştır → birkaç gün/hafta ilerlet (maç oyna; sakatlık, gelişim, transfer teklifi gibi olaylar gelsin) →
-- dosyayı bana gönder.
-- Çıktı: C:/FCExport/m0/11_event_args.txt
FCM_DIR = "C:/FC27LE/lua/scripts/"
local M = dofile(FCM_DIR .. "fcm_common.lua")

local WATCH = { [53] = "PLAYER_GROWTH", [109] = "YOUTH_PLAYER_ADDED_TO_YOUTH_ACADEMY", [86] = "TRANSFER_MOVE_COMPLETE",
    [96] = "TRANSFER_BID_COUNTER_OFFER", [165] = "INJURY", [20] = "SUSPENSION", [37] = "ABOUT_TO_ENTER_PREMATCH",
    [112] = "YOUTH_PLAYER_PROMOTION", [136] = "USER_SHORTLISTED" }
local MAX_PER_EVENT = 15

local players, teams, np, nt = {}, {}, 0, 0
for _, p in ipairs(M.read_rows("players", { "playerid" }) or {}) do players[p.playerid] = true; np = np + 1 end
for _, t in ipairs(M.read_rows("teams", { "teamid" }) or {}) do teams[t.teamid] = true; nt = nt + 1 end
M.write("11_event_args.txt", string.format("== M0/11 başladı | oyun tarihi %s | %s | %d oyuncu, %d takım tanındı\n",
    M.date_str(), os.date(), np, nt), "a")

FCM11_SEEN = FCM11_SEEN or {}
local function inspect(_, id, event)
    local name = WATCH[id]
    if not name then return end
    FCM11_SEEN[id] = (FCM11_SEEN[id] or 0) + 1
    if FCM11_SEEN[id] > MAX_PER_EVENT then return end
    local line = string.format("%s %s (%d) arg tipi %s", M.date_str(), name, id, type(event))
    if type(event) == "number" and event > 0x10000 then
        local vals = {}
        for k = 0, 15 do
            local ok, v = pcall(ReadInteger, event + k * 4)
            v = ok and v or "?"
            local tag = (players[v] and "=oyuncu:" .. M.name(v)) or (teams[v] and "=takım:" .. M.team_name(v)) or ""
            vals[#vals + 1] = string.format("+%02X:%s%s", k * 4, tostring(v), tag)
        end
        line = line .. string.format(" @0x%X | %s", event, table.concat(vals, " "))
    elseif type(event) == "table" then
        local keys = {}
        for k, v in pairs(event) do keys[#keys + 1] = tostring(k) .. "=" .. tostring(v) end
        line = line .. " | " .. table.concat(keys, ", ")
    end
    M.write("11_event_args.txt", line .. "\n", "a")
end

if not FCM11_REGISTERED and type(AddEventHandler) == "function" then
    FCM11_REGISTERED = true
    AddEventHandler("post__CareerModeEvent", function(...) pcall(inspect, ...) end)
end
