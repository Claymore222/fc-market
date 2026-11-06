-- M0/06 — fixtures, career_youthplayers ve benzeri tablolar kariyer sırasında güncelleniyor mu?
-- SALT-OKUMA. Her çalıştırmada o anki özeti dosyaya EKLER; iki çalıştırma arası karşılaştırılır.
-- Sıra: şimdi çalıştır → 1 hafta ilerlet (bir maç oyna) → tekrar çalıştır → 1 ay ilerlet → tekrar çalıştır.
-- Çıktı: C:/FCExport/m0/06_tables_fresh.txt
FCM_DIR = "C:/FC27LE/lua/scripts/"
local M = dofile(FCM_DIR .. "fcm_common.lua")
local r = M.report("06_tables_fresh.txt")
local tid = M.user_team_id()
r:add(string.format("== M0/06 | oyun tarihi %s | %s", M.date_str(), os.date()))

local fx = M.read_rows("fixtures", { "fixtureid", "fixturedate", "hometeamid", "awayteamid", "competitionid" }) or {}
local minD, maxD, mine = nil, nil, {}
for _, f in ipairs(fx) do
    if f.fixturedate then
        minD = (not minD or f.fixturedate < minD) and f.fixturedate or minD
        maxD = (not maxD or f.fixturedate > maxD) and f.fixturedate or maxD
    end
    if f.hometeamid == tid or f.awayteamid == tid then mine[#mine + 1] = f end
end
table.sort(mine, function(a, b) return (a.fixturedate or 0) < (b.fixturedate or 0) end)
r:add(string.format("fixtures: %d satır, fixturedate min %s max %s, kendi takımının maçı %d", #fx, tostring(minD), tostring(maxD), #mine))
for i = 1, math.min(6, #mine) do
    local f = mine[i]
    r:add(string.format("  %s  %s - %s  (yarışma %s)", tostring(f.fixturedate), M.team_name(f.hometeamid), M.team_name(f.awayteamid), tostring(f.competitionid)))
end

local youth = M.read_rows("career_youthplayers", { "playerid", "playertier", "potentialvariance", "swinglowpotential", "monthsinsquad" }) or {}
r:add("career_youthplayers: " .. #youth .. " satır")
local ids = {}
for _, y in ipairs(youth) do ids[y.playerid] = true end
local pl = M.players_by_id(ids, { "overallrating", "potential", "birthdate" })
for i = 1, math.min(10, #youth) do
    local y, p = youth[i], pl[youth[i].playerid] or {}
    r:add(string.format("  %s (id %d) tier %s, varyans %s, swing %s, ay %s | players: OVR %s POT %s yaş %s",
        M.name(y.playerid), y.playerid, y.playertier, y.potentialvariance, y.swinglowpotential, y.monthsinsquad,
        tostring(p.overallrating), tostring(p.potential), tostring(p.birthdate and M.age(p.birthdate, M.date_str()))))
end

for _, t in ipairs({ "cm_teamsheets", "playersuspensions", "transfers", "playerloans", "playerformdiff", "teamformdiff" }) do
    r:add(string.format("%s: %d satır", t, #(M.read_rows(t, { "playerid" }) or {})))
end
r:save("a")
