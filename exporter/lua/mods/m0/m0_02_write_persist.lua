-- M0/02 — players tablosuna SetRecordFieldValue ile yazılan değer kaydet → çık → yükle sonrası kalıcı mı?
-- Deneme oyuncusu: kullanıcının liginde, başka bir takımdan, 18–21 yaş, en yüksek POT'lu oyuncu (gelişim planı yok).
-- Değişiklik: potential +2, ana pozisyonun en ağırlıklı özelliği +5. overallrating'e dokunulmaz.
--
-- Çalıştırma sırası (aynı script):
--   1) DRY_RUN = true  → ne değişeceğini yazar
--   2) DRY_RUN = false → uygular, durumu C:/FCExport/m0/02_state.json'a kaydeder
--   3) kaydet → ana menüye çık → kaydı yükle → tekrar çalıştır → KALICI / KALICI DEĞİL
--   RESTORE = true → eski değerleri geri yazar ve durumu siler
-- Çıktı: C:/FCExport/m0/02_write_persist.txt
local DRY_RUN = true
local RESTORE = false

FCM_DIR = "C:/FC27LE/lua/scripts/"
local M = dofile(FCM_DIR .. "fcm_common.lua")
local STATE = "02_state"
local r = M.report("02_write_persist.txt")
r:add("== M0/02 yazımın kalıcılığı | oyun tarihi " .. M.date_str() .. " | " .. os.date())

local state = M.load_state(STATE)
if state and state.applied then
    local by, tbl = M.players_by_id({ [state.playerid] = true }, state.fields)
    local row = by[state.playerid]
    if not row then
        r:add("Oyuncu bulunamadı: " .. state.playerid)
    elseif RESTORE then
        for f, v in pairs(state.before) do M.set_player_field(tbl, row, f, v, { report = r }) end
        M.clear_state(STATE)
        r:add("Eski değerler geri yazıldı, durum silindi.")
    else
        local all = true
        for f, want in pairs(state.after) do
            local ok = row[f] == want
            all = all and ok
            r:add(string.format("  %-18s önce %s, yazılan %s, şimdi %s  %s", f, state.before[f], want, row[f], ok and "OK" or "FARKLI"))
        end
        r:add(all and "SONUÇ: KALICI (kaydet/yükle sonrası değerler duruyor)" or "SONUÇ: KALICI DEĞİL ya da oyun değiştirdi")
        r:add("Not: kaydedip yeniden yüklemeden çalıştırdıysan bu yalnızca bellekteki değeri gösterir.")
    end
    r:save("a")
    return
end

local pick = M.pick_league_youngsters(1, 18, 21)[1]
if not pick then
    r:add("Uygun oyuncu bulunamadı (kariyer yüklü mü?)")
    r:save("a")
    return
end
local pos = M.weights().positions[pick.preferredposition1] or "CM"
local attr = M.top_attributes(pos, 1)[1]
local by, tbl = M.players_by_id({ [pick.playerid] = true }, { "potential", attr })
local row = by[pick.playerid]
local after = { potential = math.min(99, row.potential + 2), [attr] = math.min(99, row[attr] + 5) }

r:add(string.format("Oyuncu: %s (id %d), %s, %d yaş, pozisyon %s", M.name(pick.playerid), pick.playerid,
    M.team_name(pick.teamid), pick.age, pos))
r:add("Değişiklikler (playerid;ad;alan;eski;yeni):")
for f, v in pairs(after) do M.set_player_field(tbl, row, f, v, { report = r, dry_run = DRY_RUN }) end
if DRY_RUN then
    r:add("DRY-RUN: hiçbir şey yazılmadı. Uygulamak için DRY_RUN = false yapıp tekrar çalıştır.")
else
    M.save_state(STATE, { applied = true, playerid = pick.playerid, fields = { "potential", attr },
        before = { potential = row.potential, [attr] = row[attr] }, after = after, date = M.date_str() })
    r:add("UYGULANDI. Oyunda oyuncunun profilinde " .. attr .. " değerine bak; sonra kaydet → çık → yükle → tekrar çalıştır.")
end
r:save("a")
