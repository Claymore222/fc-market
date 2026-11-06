-- M0/08 — SetPlayerForm / SetPlayerMorale başka takımın oyuncusunda çalışıyor mu? (DOC.MD: yalnızca kendi takımın)
-- Bir rakip oyuncu (kullanıcının liginden) ve kendi takımından bir oyuncu için form 90, moral 90 denenir.
-- teamplayerlinks.form öncesi/sonrası okunur (yalnızca okuma; bu tabloya yazılmaz).
-- Sıra: DRY_RUN=true → DRY_RUN=false → oyunda iki oyuncunun profilindeki form/moral göstergesine bak → bana yaz.
-- Çıktı: C:/FCExport/m0/08_form_opponent.txt
local DRY_RUN = true

FCM_DIR = "C:/FC27LE/lua/scripts/"
local M = dofile(FCM_DIR .. "fcm_common.lua")
local r = M.report("08_form_opponent.txt")
r:add("== M0/08 form/moral | oyun tarihi " .. M.date_str() .. " | " .. os.date() .. (DRY_RUN and " | DRY-RUN" or ""))

local function link_form(pid)
    local rows = M.read_rows("teamplayerlinks", { "playerid", "teamid", "form" }, function(row) return row.playerid == pid end) or {}
    local parts = {}
    for _, row in ipairs(rows) do parts[#parts + 1] = string.format("takım %d form %s", row.teamid, tostring(row.form)) end
    return table.concat(parts, ", ")
end

local opponent = M.pick_league_youngsters(1, 18, 30)[1]
local mine
for pid in pairs(M.user_team_players()) do mine = pid break end
for _, item in ipairs({ { "rakip", opponent and opponent.playerid }, { "kendi takımın", mine } }) do
    local label, pid = item[1], item[2]
    if pid then
        r:add(string.format("%s: %s (id %d) | önce: %s", label, M.name(pid), pid, link_form(pid)))
        if not DRY_RUN then
            local okF, eF = pcall(SetPlayerForm, pid, 90)
            local okM, eM = pcall(SetPlayerMorale, pid, 90)
            r:add(string.format("    SetPlayerForm: %s | SetPlayerMorale: %s", okF and "hatasız" or tostring(eF), okM and "hatasız" or tostring(eM)))
            r:add("    sonra: " .. link_form(pid))
        end
    end
end
r:add(DRY_RUN and "DRY-RUN: çağrı yapılmadı." or "Oyunda iki oyuncunun form ve moraline bak, bana yaz.")
r:save("a")
