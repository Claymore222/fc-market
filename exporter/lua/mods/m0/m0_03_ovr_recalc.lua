-- M0/03 — Oyun overallrating'i özelliklerden yeniden hesaplıyor mu? modifier'ın etkisi.
-- İki deneme oyuncusu (kullanıcının liginden, başka takımlardan, 18–21 yaş):
--   A: ana pozisyonun en ağırlıklı 4 özelliği +6, overallrating'e DOKUNULMAZ
--   B: yalnızca overallrating +3, özelliklere dokunulmaz
-- Her ikisinde modifier değeri raporlanır (değiştirilmez).
-- Sıra: DRY_RUN=true → DRY_RUN=false (uygula) → oyunda iki oyuncunun OVR'ına bak → 1 ay ilerlet → tekrar çalıştır.
-- RESTORE = true → eski değerleri geri yazar.
-- Çıktı: C:/FCExport/m0/03_ovr_recalc.txt
local DRY_RUN = true
local RESTORE = false

FCM_DIR = "C:/FC27LE/lua/scripts/"
local M = dofile(FCM_DIR .. "fcm_common.lua")
local STATE = "03_state"
local r = M.report("03_ovr_recalc.txt")
r:add("== M0/03 OVR yeniden hesabı | oyun tarihi " .. M.date_str() .. " | " .. os.date())

local function fields_of(p)
    local f = { "overallrating", "modifier", "potential" }
    for _, a in ipairs(p.attrs or {}) do f[#f + 1] = a end
    return f
end

local state = M.load_state(STATE)
if state and state.applied then
    for _, p in ipairs(state.players) do
        local by, tbl = M.players_by_id({ [p.playerid] = true }, fields_of(p))
        local row = by[p.playerid]
        if RESTORE then
            for f, v in pairs(p.before) do M.set_player_field(tbl, row, f, v, { report = r }) end
        else
            r:add(string.format("%s (%s): uygulandığında OVR %s → şimdi OVR %s, modifier %s → %s, POT %s",
                M.name(p.playerid), p.role, p.before.overallrating, row.overallrating, p.before.modifier, row.modifier, row.potential))
            for _, a in ipairs(p.attrs or {}) do
                r:add(string.format("    %-18s önce %s, yazılan %s, şimdi %s", a, p.before[a], p.after[a], row[a]))
            end
        end
    end
    if RESTORE then
        M.clear_state(STATE)
        r:add("Eski değerler geri yazıldı.")
    else
        r:add("Yorum: A'nın OVR'ı arttıysa oyun özelliklerden yeniden hesaplıyor. B'nin OVR'ı geri düştüyse yalnızca OVR yazmak kalıcı değil.")
    end
    r:save("a")
    return
end

local picks = M.pick_league_youngsters(2, 18, 21)
if #picks < 2 then
    r:add("İki uygun oyuncu bulunamadı.")
    r:save("a")
    return
end

local players = {}
for i, pick in ipairs(picks) do
    local pos = M.weights().positions[pick.preferredposition1] or "CM"
    local p = { playerid = pick.playerid, role = i == 1 and "A: özellikler +6" or "B: yalnız OVR +3",
        attrs = i == 1 and M.top_attributes(pos, 4) or {} }
    local by, tbl = M.players_by_id({ [p.playerid] = true }, fields_of(p))
    local row = by[p.playerid]
    p.before, p.after = { overallrating = row.overallrating, modifier = row.modifier }, {}
    r:add(string.format("%s: %s (id %d), %s, %s, OVR %d, modifier %d", p.role, M.name(p.playerid), p.playerid,
        M.team_name(pick.teamid), pos, row.overallrating, row.modifier))
    if i == 1 then
        for _, a in ipairs(p.attrs) do
            p.before[a], p.after[a] = row[a], math.min(99, row[a] + 6)
            M.set_player_field(tbl, row, a, p.after[a], { report = r, dry_run = DRY_RUN })
        end
    else
        p.after.overallrating = math.min(99, row.overallrating + 3)
        M.set_player_field(tbl, row, "overallrating", p.after.overallrating, { report = r, dry_run = DRY_RUN })
    end
    players[i] = p
end

if DRY_RUN then
    r:add("DRY-RUN: hiçbir şey yazılmadı.")
else
    M.save_state(STATE, { applied = true, players = players, date = M.date_str() })
    r:add("UYGULANDI. Oyunda iki oyuncunun OVR'ına hemen bak (not al), sonra 1 ay ilerlet ve tekrar çalıştır.")
end
r:save("a")
