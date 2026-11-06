-- M0/04 — Kendi takımında gelişim planı: PlayerSetValueInDevelopementPlan FC 27'de çalışıyor mu?
-- Kendi takımından gelişim planı olan bir oyuncu seçilir. İki özellik +3:
--   X: yalnızca players tablosuna yazılır
--   Y: players tablosu + PlayerSetValueInDevelopementPlan
-- Beklenen (DOC.MD): oyun plandaki değeri kullanır → X oyunda değişmez görünür, Y görünür.
-- Sıra: DRY_RUN=true → DRY_RUN=false → oyunda oyuncunun özellik ekranına bak → kaydet/çık/yükle → tekrar çalıştır
-- ve ekrana yine bak. RESTORE = true → eski değerleri geri yazar (Y için plana da).
-- Çıktı: C:/FCExport/m0/04_devplan.txt
local DRY_RUN = true
local RESTORE = false

FCM_DIR = "C:/FC27LE/lua/scripts/"
local M = dofile(FCM_DIR .. "fcm_common.lua")
local STATE = "04_state"
local r = M.report("04_devplan.txt")
r:add("== M0/04 gelişim planı | oyun tarihi " .. M.date_str() .. " | " .. os.date())

if type(PlayerHasDevelopementPlan) ~= "function" or type(PlayerSetValueInDevelopementPlan) ~= "function" then
    r:add("Gelişim planı fonksiyonları yok.")
    r:save("a")
    return
end

local user = M.user_team_players()
local state = M.load_state(STATE)
if state and state.applied then
    local by, tbl = M.players_by_id({ [state.playerid] = true }, { state.x, state.y })
    local row = by[state.playerid]
    if RESTORE then
        M.set_player_field(tbl, row, state.x, state.before[state.x], { report = r })
        M.set_player_field(tbl, row, state.y, state.before[state.y], { report = r, user_team = user })
        M.clear_state(STATE)
        r:add("Eski değerler geri yazıldı.")
    else
        r:add(string.format("%s: players tablosunda %s = %s (yazılan %s), %s = %s (yazılan %s)", M.name(state.playerid),
            state.x, row[state.x], state.after[state.x], state.y, row[state.y], state.after[state.y]))
        r:add("Oyundaki özellik ekranında: " .. state.x .. " (yalnız tablo) ve " .. state.y .. " (tablo + plan) kaç görünüyor? Bana yaz.")
    end
    r:save("a")
    return
end

local chosen
for pid in pairs(user) do
    local ok, has = pcall(PlayerHasDevelopementPlan, pid)
    if ok and has then
        chosen = pid
        break
    end
end
local count, with_plan = 0, 0
for pid in pairs(user) do
    count = count + 1
    local ok, has = pcall(PlayerHasDevelopementPlan, pid)
    if ok and has then with_plan = with_plan + 1 end
end
r:add(string.format("Kendi takımın: %d oyuncu, %d tanesinde gelişim planı var.", count, with_plan))
if not chosen then
    r:add("Gelişim planı olan oyuncu yok.")
    r:save("a")
    return
end

local x, y = "shortpassing", "longpassing"
local by, tbl = M.players_by_id({ [chosen] = true }, { x, y })
local row = by[chosen]
local after = { [x] = math.min(99, row[x] + 3), [y] = math.min(99, row[y] + 3) }
r:add(string.format("Oyuncu: %s (id %d). X = %s (yalnız tablo), Y = %s (tablo + plan)", M.name(chosen), chosen, x, y))
M.set_player_field(tbl, row, x, after[x], { report = r, dry_run = DRY_RUN })
M.set_player_field(tbl, row, y, after[y], { report = r, dry_run = DRY_RUN, user_team = user })
if DRY_RUN then
    r:add("DRY-RUN: hiçbir şey yazılmadı.")
else
    M.save_state(STATE, { applied = true, playerid = chosen, x = x, y = y,
        before = { [x] = row[x], [y] = row[y] }, after = after })
    r:add("UYGULANDI. Oyunda oyuncunun özellik ekranında " .. x .. " ve " .. y .. " değerlerine bak.")
end
r:save("a")
