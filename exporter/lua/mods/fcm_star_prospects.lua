--[[
  fcm_star_prospects.lua — Faz 5 / M1: her takıma bir "yıldız aday" (yol B: mevcut genci yükselt).

  Kadroya dokunmaz: yalnızca seçilen oyuncunun players alanları (özellikler, overallrating, modifier, potential)
  LE'nin TABLE API'siyle yazılır. Kendi takımında gelişim planı varsa özellikler plana da yazılır.

  İLK DENEME TEK TAKIMDA: TEAM_IDS'e bir takım id'si yaz (ör. { 326 }). ALL_TEAMS = true ancak tek takım denemesi
  (kaydet → çık → yükle, ardından 1 ay) geçtikten sonra.

  MODE:
    "apply"   — aday seç, değerleri hesapla. DRY_RUN = true ise yalnızca rapor; false ise uygular ve durumu kaydeder.
    "verify"  — uygulanan oyuncuların şimdiki değerlerini yazılanlarla karşılaştırır (kalıcılık ve OVR yeniden hesabı).
    "restore" — eski değerleri geri yazar (DRY_RUN = false gerekir).
    "reapply" — önce restore (STATE + EXTRA_STATES), sonra aynı çalıştırmada yeni ayarlarla apply (DRY_RUN = false).
    "tune"    — uygulanmış adayları yeni sınırlara çeker: OVR ve aday listesi değişmez, gelişim silinmez (fcm_star_duzelt.lua).
  Çıktılar: C:/FCExport/m0/star_prospects.txt (rapor, eklenir), star_prospects_state.json (geri alma için)
]]
local DRY_RUN = true
local MODE = "apply"
local TEAM_IDS = { 1924 }          -- ör. { 326 }
local ALL_TEAMS = false      -- true: aşağıdaki filtrelerle tüm takımlar
local SKIP_TEAMS = {}        -- ALL_TEAMS'te atlanacak takımlar (ör. daha önce genç verilenler)

local AGE_MIN, AGE_MAX = 17, 21
local MIN_OVR, MAX_OVR = 1, 82
local MAX_OVR_JUMP = 14                  -- tek seferde en fazla bu kadar OVR (50'lik gencin 73 olmasını önler)
local WEAK_LINK_BONUS = 1               -- hedef: ilk 11'in en düşük OVR'lı oyuncusu + bu (onun pozisyonuna)
local FALLBACK_BELOW = 10               -- o pozisyonda/bölgede genç yoksa: ilk 11 ortalaması − bu
local MIN_POT, MAX_POT = 80, 95
local POT_GAP_MIN = 6                   -- POT hedef OVR'ın en az bu kadar üstünde
-- POT hedef OVR'ın en fazla bu kadar üstünde: 21 yaş altı gerçek gençlerin %90 dilimi. { OVR üst sınırı, fark }
local POT_GAP_BY_OVR = { { 60, 20 }, { 65, 18 }, { 70, 16 }, { 75, 14 }, { 80, 11 }, { 100, 10 } }
local OTHER_ATTR_SHARE = 0.5            -- pozisyon ağırlığı olmayan saha özellikleri bu oranda artar
local KEY_CAP_ABOVE = 6                 -- pozisyon için önemli özellik en fazla hedef OVR + bu (ör. 84 → 90)
local OTHER_CAP_BELOW = 5               -- diğer özellikler en fazla hedef OVR − bu; mevcut yüksek değer düşürülmez
local EXTRA_STATES = {}                 -- restore/reapply'da ayrıca geri alınacak durum dosyaları (adı, .json'suz)
local SEED = 27                         -- dry-run ve uygulama aynı sonucu versin
local STYLE_HIGH, STYLE_LOW = 3, 4       -- tarz öne çıkardığı özellikte gerçek aralığı bu kadar aşabilir, kıstığında bu kadar altına inebilir
local STYLE_FIT_MARGIN = 6                -- tarz uyumu: tavanı düşük gruptaki ortalama en fazla tavan + bu (fizikli kanatta hız ≤ hedef)
local SKIP_USER_TEAM = false
if FCM_RUN then DRY_RUN, MODE = FCM_RUN.dry_run, FCM_RUN.mode end

FCM_DIR = "C:/FC 27 LE v27.1.6/lua/scripts/"
local M = dofile(FCM_DIR .. "fcm_common.lua")
local W = M.weights()
local PROFILES = dofile(FCM_DIR .. "fcm_profiles.lua")
local STATE = "star_prospects_state"
local r = M.report("star_prospects.txt")
local date = M.date_str()
r:add(string.format("== yıldız aday | %s | oyun tarihi %s | MODE=%s%s", os.date(), date, MODE, DRY_RUN and " | DRY-RUN" or ""))

local GROUP = { GK = "GK", RB = "DEF", CB = "DEF", LB = "DEF", RWB = "DEF", LWB = "DEF", CDM = "MID", CM = "MID", CAM = "MID",
    RM = "MID", LM = "MID", RW = "ATT", LW = "ATT", ST = "ATT", CF = "ATT" }

-- Oyun tarzları: her gence pozisyonuna uygun bir tarz rastgele seçilir (SEED + takım). Hedef OVR değişmez; değişen,
-- puanların hangi özelliklere gittiği. Anahtar: grup adı (Hız, Şut, Pas, Top sürme, Savunma, Fizik, Kaleci) ya da
-- tek özellik (özellik grubu ezer).
--   boost: pozisyon için önemli özelliklerin artış hızı çarpanı (1 = normal, 0.3 = yavaş, 1.6 = hızlı)
--   cap:   tavan, hedef OVR'a göre (ör. -6: hedef 84 ise en fazla 78). Önemlilerde varsayılan +KEY_CAP_ABOVE,
--          diğerlerinde −OTHER_CAP_BELOW; +KEY_CAP_ABOVE'u geçemez. Mevcut yüksek değer düşürülmez.
--   lift:  pozisyon ağırlığı olmayan özellik doğrudan hedef + bu seviyeye çıkar (±2 rastgele): yan güç, ör. fizik
--   set:   önemli özellik de olsa doğrudan hedef + bu seviyeye gelir ve orada kalır (ör. fizikli kanatta hız −6)
local STYLES = {
    WING = {
        { name = "hızlı kanat", boost = { ["Hız"] = 1.6, ["Top sürme"] = 1.2 }, cap = { ["Fizik"] = -12 } },
        { name = "fizikli kanat", boost = { ["Pas"] = 1.4, ["Şut"] = 1.2 }, cap = { ["Hız"] = -6 }, set = { ["Hız"] = -6 },
            lift = { ["Fizik"] = -1 } },
        { name = "teknik kanat", boost = { ["Top sürme"] = 1.4, ["Pas"] = 1.3, ["Hız"] = 0.7 }, cap = { ["Hız"] = -2 },
            lift = { ["Top sürme"] = -2, curve = -2 } },
        { name = "golcü kanat", boost = { ["Şut"] = 1.5 }, lift = { ["Şut"] = -3 } },
    },
    FWD = {
        { name = "hızlı forvet", boost = { ["Hız"] = 1.6, ["Şut"] = 1.1 }, cap = { ["Fizik"] = -10 }, lift = { agility = -2 } },
        { name = "hedef forvet", boost = { headingaccuracy = 1.8, strength = 1.8, ["Şut"] = 1.2 },
            cap = { ["Hız"] = -10 }, set = { ["Hız"] = -10 }, lift = { ["Fizik"] = 3 } },
        { name = "komple forvet", lift = { ["Fizik"] = -4, ["Pas"] = -4 } },
        { name = "bitirici", boost = { finishing = 1.5, positioning = 1.5, ["Hız"] = 0.8 }, cap = { ["Hız"] = -3 },
            lift = { volleys = 0, composure = 0 } },
    },
    MID = {
        { name = "oyun kurucu", boost = { ["Pas"] = 1.5 }, cap = { ["Fizik"] = -12, ["Hız"] = -8 }, lift = { ["Pas"] = 0 } },
        { name = "box-to-box", boost = { ["Savunma"] = 1.4, stamina = 1.6 }, lift = { ["Fizik"] = 0, ["Savunma"] = -4 } },
        { name = "teknik orta saha", boost = { ["Top sürme"] = 1.4 }, lift = { ["Hız"] = -1, agility = 0, balance = 0 } },
        { name = "uzaktan şutör", boost = { longshots = 2, ["Şut"] = 1.3 }, lift = { ["Şut"] = -2 } },
    },
    DM = {
        { name = "kesici", boost = { ["Savunma"] = 1.5, aggression = 1.5, strength = 1.5 }, cap = { ["Hız"] = -8 },
            lift = { ["Fizik"] = 2 } },
        { name = "derin oyun kurucu", boost = { ["Pas"] = 1.6, ["Savunma"] = 0.8 }, cap = { ["Fizik"] = -10 },
            lift = { ["Pas"] = -2 } },
        { name = "dengeli ön libero", lift = { ["Fizik"] = -3, ["Hız"] = -4 } },
    },
    CB = {
        { name = "hava hakimi", boost = { headingaccuracy = 1.8, strength = 1.6, jumping = 1.8 }, cap = { ["Hız"] = -10 },
            lift = { ["Fizik"] = 2 } },
        { name = "top oynayan stoper", boost = { ["Pas"] = 1.8, ballcontrol = 1.6 }, cap = { strength = -2, aggression = -4 },
            lift = { ["Pas"] = -6, composure = -2 } },
        { name = "hızlı stoper", boost = { interceptions = 1.5, defensiveawareness = 1.4, slidingtackle = 1.3 },
            cap = { strength = -3, headingaccuracy = -4 }, lift = { ["Hız"] = 4, agility = 0 } },
        { name = "sert stoper", boost = { standingtackle = 1.4, aggression = 1.6, strength = 1.4 }, lift = { ["Fizik"] = 0 } },
    },
    FB = {
        { name = "hücum beki", boost = { crossing = 1.6, ["Hız"] = 1.4, ["Pas"] = 1.3, ["Savunma"] = 0.8 },
            lift = { dribbling = -2, stamina = 0 } },
        { name = "savunmacı bek", boost = { ["Savunma"] = 1.4, ["Hız"] = 0.6 }, cap = { ["Hız"] = -4 }, lift = { ["Fizik"] = -1 } },
        { name = "hızlı bek", boost = { ["Hız"] = 1.8 }, lift = { agility = -2 } },
    },
    GK = {
        { name = "refleks kaleci", boost = { gkreflexes = 1.5, gkdiving = 1.5 } },
        { name = "oyun kurucu kaleci", boost = { gkkicking = 2, gkpositioning = 1.3 } },
        { name = "dengeli kaleci" },
    },
}
local STYLE_GROUP = { RW = "WING", LW = "WING", RM = "WING", LM = "WING", ST = "FWD", CF = "FWD", CAM = "MID", CM = "MID",
    CDM = "DM", CB = "CB", RB = "FB", LB = "FB", RWB = "FB", LWB = "FB", GK = "GK" }
local GROUP_OF = {}
for g, list in pairs(W.groups) do for _, a in ipairs(list) do GROUP_OF[a] = g end end
local function style_val(t, a, default)
    if not t then return default end
    local v = t[a]
    if v == nil then v = t[GROUP_OF[a]] end
    if v == nil then return default end
    return v
end

-- Oyuncuya uyan tarzlar arasından rastgele biri: tavanı düşük tutulan bir grupta oyuncu zaten iyiyse (ör. hızı 86
-- olana "fizikli kanat") o tarz atlanır.
local function pick_style(row, pos, target)
    local list = STYLES[STYLE_GROUP[pos] or "MID"]
    local fit = {}
    for _, st in ipairs(list) do
        local ok = true
        for g, off in pairs(st.cap or {}) do
            if off < 0 and W.groups[g] then
                local sum = 0
                for _, a in ipairs(W.groups[g]) do sum = sum + row[a] end
                if sum / #W.groups[g] > target + off + STYLE_FIT_MARGIN then ok = false end
            elseif off < 0 and type(row[g]) == "number" then
                if row[g] > target + off + STYLE_FIT_MARGIN then ok = false end
            end
        end
        if ok then fit[#fit + 1] = st end
    end
    if #fit == 0 then fit = list end
    return fit[math.random(#fit)]
end
local GROUP_TOP = { GK = 1, DEF = 4, MID = 3, ATT = 3 }

-- Gerçek oyuncu aralığı: aynı mevki ve yakın OVR'daki oyuncuların %15-%90 dilimi (tools/gen_fcm_profiles.py).
local PROFILE_POS = { LWB = "LB", RWB = "RB", CF = "ST" }
local PROFILE_INDEX = {}
for i, a in ipairs(PROFILES.attributes) do PROFILE_INDEX[a] = i end
local function real_range(pos, target, attribute)
    local bands, index = PROFILES.ranges[PROFILE_POS[pos] or pos], PROFILE_INDEX[attribute]
    if not bands or not index then return nil end
    local best
    for _, band in ipairs(PROFILES.bands) do
        if bands[band] and (not best or math.abs(band - target) < math.abs(best - target)) then best = band end
    end
    if not best then return nil end
    return bands[best][index * 2 - 1], bands[best][index * 2]
end

local function pot_gap(overall)
    for _, band in ipairs(POT_GAP_BY_OVR) do
        if overall < band[1] then return band[2] end
    end
    return POT_GAP_MIN
end

local function attr_fields()
    local f = { "overallrating", "modifier", "potential" }
    for _, a in ipairs(W.attributes) do f[#f + 1] = a end
    return f
end

-- verify / restore / reapply -----------------------------------------------------------------------------------
local function undo(state_name, mode)
    local state = M.load_state(state_name)
    if not state or not state.players then
        r:add("Durum dosyası yok: " .. state_name)
        return
    end
    local ids = {}
    for _, p in ipairs(state.players) do ids[p.playerid] = true end
    local by, tbl = M.players_by_id(ids, attr_fields())
    local user = M.user_team_players()
    local n = 0
    for _, p in ipairs(state.players) do
        local row = by[p.playerid]
        if not row then
            r:add(string.format("%s (id %d): oyuncu yok", p.name, p.playerid))
        elseif mode == "restore" then
            for f, v in pairs(p.before) do M.set_player_field(tbl, row, f, v, { dry_run = DRY_RUN, user_team = user }) end
            n = n + 1
        else
            local drift = 0
            for f, v in pairs(p.after) do
                if f ~= "overallrating" and row[f] ~= v then drift = drift + 1 end
            end
            r:add(string.format("%-24s %-20s OVR yazılan %d → şimdi %d | POT %d → %d | modifier %s | farklı özellik %d",
                p.name, p.team, p.after.overallrating, row.overallrating, p.after.potential, row.potential, tostring(row.modifier), drift))
        end
    end
    if mode == "restore" then
        r:add(string.format("%s: %d oyuncu eski haline %s", state_name, n, DRY_RUN and "döndürülecekti (DRY-RUN)" or "döndürüldü"))
        if not DRY_RUN then M.clear_state(state_name) end
    end
end

if MODE == "verify" then
    undo(STATE, "verify")
    r:add("Yorum: OVR yazılanla aynıysa kalıcı. Değiştiyse oyun özelliklerden yeniden hesaplıyor.")
    r:save("a")
    return
end
if MODE == "restore" or MODE == "reapply" then
    if MODE == "reapply" and DRY_RUN then
        r:add("reapply yalnızca DRY_RUN = false ile çalışır (önce geri alıp sonra yeniden uygular).")
        r:save("a")
        return
    end
    undo(STATE, "restore")
    for _, name in ipairs(EXTRA_STATES) do undo(name, "restore") end
    if MODE == "restore" then
        r:save("a")
        return
    end
end

-- tune --------------------------------------------------------------------------------------------------------
-- Uygulanmış adayı yeni sınırlara çeker. OVR aynı kalır; POT ve özellik, yükseltilmeden önceki değerinin altına inmez.
if MODE == "tune" then
    local state = M.load_state(STATE)
    if not state or not state.players then
        r:add("Durum dosyası yok: " .. STATE)
        r:save("a")
        return
    end
    local style_by_name = {}
    for _, list in pairs(STYLES) do
        for _, st in ipairs(list) do style_by_name[st.name] = st end
    end
    local keeper = {}
    for _, a in ipairs(W.goalkeeper) do keeper[a] = true end
    local ids = {}
    for _, p in ipairs(state.players) do ids[p.playerid] = true end
    local fields = attr_fields()
    fields[#fields + 1] = "preferredposition1"
    local by, tbl = M.players_by_id(ids, fields)
    local user = M.user_team_players()
    local preview, touched, pot_lowered, attribute_writes = FCM_PREVIEW or {}, 0, 0, 0
    r:add("takım;oyuncu;poz;OVR;POT;→POT;değişen özellik")
    for _, p in ipairs(state.players) do
        local row = by[p.playerid]
        if row then
            local pos = W.positions[row.preferredposition1] or "CM"
            local style = style_by_name[p.style] or {}
            local weights = W.weights[pos] or W.weights.CM
            local overall = row.overallrating
            local pot = math.max(math.min(row.potential, overall + pot_gap(overall)), overall + POT_GAP_MIN, p.before.potential or 0)
            pot = math.min(pot, row.potential)
            local new, bottom, top = {}, {}, {}
            for _, a in ipairs(W.attributes) do
                new[a], bottom[a], top[a] = row[a], row[a], row[a]
                local low, high = real_range(pos, overall, a)
                if low and ((pos == "GK") == (keeper[a] == true) or (pos == "GK" and weights[a])) then
                    local kept_low = style_val(style.set, a, nil) ~= nil or (style_val(style.cap, a, 0) or 0) < 0
                    local raised = style_val(style.boost, a, 1) >= 1.4
                    local original = p.before[a] or row[a]
                    bottom[a] = math.max(original, low - (kept_low and STYLE_LOW or 0))
                    top[a] = math.max(bottom[a], high + (raised and STYLE_HIGH or 0))
                    new[a] = math.max(bottom[a], math.min(top[a], row[a]))
                end
            end
            -- Oyun OVR'ı özelliklerden hesaplıyor; puanı oyuncunun OVR'ına geri getir.
            for _ = 1, 80 do
                local score = M.position_score(pos, new) or overall
                local step = score > overall + 0.4 and -1 or score < overall - 0.4 and 1 or 0
                if step == 0 then break end
                local pick, room
                for _, a in ipairs(W.attributes) do
                    local free = weights[a] and (step < 0 and new[a] - bottom[a] or top[a] - new[a]) or 0
                    if free > 0 and (not room or free > room) then pick, room = a, free end
                end
                if not pick then break end
                new[pick] = new[pick] + step
            end
            local changes = {}
            for _, a in ipairs(W.attributes) do
                if new[a] ~= row[a] then changes[#changes + 1] = a end
            end
            preview[p.playerid] = { potential = pot }
            for _, a in ipairs(W.attributes) do preview[p.playerid][a] = new[a] end
            if pot ~= row.potential or #changes > 0 then
                touched = touched + 1
                if pot ~= row.potential then pot_lowered = pot_lowered + 1 end
                attribute_writes = attribute_writes + #changes
                r:add(string.format("%s;%s;%s;%d;%d;%d;%d", p.team, p.name, pos, overall, row.potential, pot, #changes))
                if pot ~= row.potential then
                    M.set_player_field(tbl, row, "potential", pot, { dry_run = DRY_RUN, user_team = user })
                    p.after.potential = pot
                end
                for _, a in ipairs(changes) do
                    M.set_player_field(tbl, row, a, new[a], { dry_run = DRY_RUN, user_team = user })
                    p.after[a] = new[a]
                end
            end
        end
    end
    r:add(string.format("Toplam: %d aday, %d oyuncu değişti%s: %d POT, %d özellik.", #state.players, touched, DRY_RUN and " (DRY-RUN, yazılmadı)" or "", pot_lowered, attribute_writes))
    if not DRY_RUN then M.save_state(STATE, state) end
    r:save("a")
    return
end

-- apply -------------------------------------------------------------------------------------------------------
if M.load_state(STATE) and not DRY_RUN then
    r:add("Önceki uygulamanın durumu duruyor. Önce MODE = \"verify\" / \"restore\" ile kapat, sonra tekrar uygula.")
    r:save("a")
    return
end

local wanted = {}
for _, t in ipairs(TEAM_IDS) do wanted[t] = true end
if not ALL_TEAMS and next(wanted) == nil then
    r:add("TEAM_IDS boş. İlk deneme için bir takım id'si yaz (ör. { 326 }).")
    r:save("a")
    return
end

-- Kapsam: milli takımlar, kadın ligleri, serbestler ve "[DO NOT USE]" takımları hariç.
local excluded_league = {}
for _, l in ipairs(M.read_rows("leagues", { "leagueid", "isinternationalleague", "iswomencompetition", "leaguename" }) or {}) do
    if l.isinternationalleague == 1 or l.iswomencompetition == 1 or tostring(l.leaguename):find("Free Agents") then
        excluded_league[l.leagueid] = true
    end
end
local team_ok = {}
for _, lt in ipairs(M.read_rows("leagueteamlinks", { "leagueid", "teamid" }) or {}) do
    if team_ok[lt.teamid] == nil then team_ok[lt.teamid] = true end
    if excluded_league[lt.leagueid] then team_ok[lt.teamid] = false end
end
local user_team = M.user_team_id()
local skip = {}
for _, t in ipairs(SKIP_TEAMS) do skip[t] = true end
local function in_scope(tid)
    if skip[tid] or (SKIP_USER_TEAM and tid == user_team) then return false end
    if ALL_TEAMS then return team_ok[tid] == true and not tostring(M.team_name(tid)):find("DO NOT USE", 1, true) end
    return wanted[tid] == true
end

local squads = {}
for _, l in ipairs(M.read_rows("teamplayerlinks", { "playerid", "teamid" }) or {}) do
    if in_scope(l.teamid) then
        squads[l.teamid] = squads[l.teamid] or {}
        table.insert(squads[l.teamid], l.playerid)
    end
end
local ids = {}
for _, list in pairs(squads) do for _, pid in ipairs(list) do ids[pid] = true end end
-- Yalnız seçim için gereken alanlar okunur; özellikler seçilen genç için ayrıca alınır.
local by, tbl = M.players_by_id(ids, { "overallrating", "modifier", "potential", "birthdate", "preferredposition1", "gender" })
local function load_attributes(row)
    for _, a in ipairs(W.attributes) do row[a] = tbl:GetRecordFieldValue(row._rec, a) end
end
local loaned = M.loaned_out_set()
local user = M.user_team_players()

-- Özellik planı (tarza göre): önemli özellikler en fazla hedef + KEY_CAP_ABOVE, diğerleri en fazla hedef − OTHER_CAP_BELOW
-- (tarzın cap'i bunları değiştirir; oyuncunun zaten sahip olduğu yüksek değer düşürülmez). Önemli özellikler, ağırlıklı
-- ortalamaları hedefe ulaşana kadar tarzın boost çarpanıyla artırılır; tavana gelenler dururken açıklar devam eder.
local function plan_attributes(row, pos, target, style)
    local weights = W.weights[pos] or W.weights.CM
    local gk = {}
    for _, a in ipairs(W.goalkeeper) do gk[a] = true end
    local new, cap, lifted = {}, {}, {}
    for _, a in ipairs(W.attributes) do
        new[a] = row[a]
        local outfield = pos ~= "GK" and not gk[a]
        local lift = outfield and (style_val(style.set, a, nil) or (not weights[a] and style_val(style.lift, a, nil)))
        if lift then
            cap[a] = math.max(row[a], math.min(99, target + math.min(KEY_CAP_ABOVE, lift) + math.random(-2, 2)))
            new[a], lifted[a] = cap[a], true
        elseif weights[a] then
            cap[a] = math.max(row[a], math.min(99, target + math.min(KEY_CAP_ABOVE, style_val(style.cap, a, KEY_CAP_ABOVE))))
        elseif outfield then
            cap[a] = math.max(row[a], math.min(99, target + math.min(KEY_CAP_ABOVE, style_val(style.cap, a, -OTHER_CAP_BELOW))))
        else
            cap[a] = row[a]
        end
    end
    -- Gerçek aralık: aynı mevki ve OVR'daki oyuncuların dışına çıkma. Oyuncunun zaten sahip olduğu değer düşürülmez.
    local floor = {}
    for _, a in ipairs(W.attributes) do
        local low, high = real_range(pos, target, a)
        if low and (pos == "GK") == (gk[a] == true) or low and pos == "GK" and weights[a] then
            local kept_low = style_val(style.set, a, nil) ~= nil or (style_val(style.cap, a, 0) or 0) < 0
            local raised = style_val(style.boost, a, 1) >= 1.4
            local bottom = low - (kept_low and STYLE_LOW or 0)
            cap[a] = math.max(row[a], bottom, math.min(cap[a], high + (raised and STYLE_HIGH or 0)))
            floor[a] = math.max(row[a], bottom)
            new[a] = math.min(cap[a], math.max(new[a], floor[a]))
        end
    end
    -- Tarzın öne çıkardığı önemli özellikler (boost ≥ 1.4) en az hedef OVR'a çıkar: "sert stoper"in gücü düşük kalmasın.
    for _, a in ipairs(W.attributes) do -- sabit sıra: rastgele sayılar dry-run ile uygulamada aynı gelsin
        if weights[a] and style_val(style.boost, a, 1) >= 1.4 then
            new[a] = math.max(new[a], math.min(cap[a], target + math.random(0, 3)))
        end
    end
    local delta0 = target - (M.position_score(pos, new) or row.overallrating)
    if delta0 > 0 then
        for _, a in ipairs(W.attributes) do
            if not weights[a] and not lifted[a] then
                new[a] = math.min(cap[a], math.floor(row[a] + delta0 * OTHER_ATTR_SHARE + 0.5))
            end
        end
    end
    for _ = 1, 15 do
        local delta = target - (M.position_score(pos, new) or row.overallrating)
        if delta <= 0.25 then break end
        local open_w, total_w = 0, 0
        for a, w in pairs(weights) do
            total_w = total_w + w
            if new[a] < cap[a] then open_w = open_w + w * style_val(style.boost, a, 1) end
        end
        if open_w == 0 then break end
        local step, moved = delta * total_w / open_w, false
        for a in pairs(weights) do
            if new[a] < cap[a] then
                local inc = math.floor(step * style_val(style.boost, a, 1) + 0.5)
                if inc > 0 then new[a], moved = math.min(cap[a], new[a] + inc), true end
            end
        end
        if not moved then -- adımlar yuvarlamada 0'a düştüyse: açık kalanların hepsine +1
            for a in pairs(weights) do
                if new[a] < cap[a] then new[a] = new[a] + 1 end
            end
        end
    end
    -- Alt sınırlar puanı hedefin üstüne ittiyse en rahat özelliklerden geri al: oyun OVR'ı özelliklerden yeniden hesaplıyor.
    for _ = 1, 80 do
        if (M.position_score(pos, new) or target) <= target + 0.4 then break end
        local pick, room
        for _, a in ipairs(W.attributes) do
            local bottom = math.max(row[a], floor[a] or row[a])
            if weights[a] and new[a] > bottom and (not room or new[a] - bottom > room) then pick, room = a, new[a] - bottom end
        end
        if not pick then break end
        new[pick] = new[pick] - 1
    end
    return new, M.position_score(pos, new)
end

local applied, n_teams, n_skip = {}, 0, 0
local team_ids = {}
for tid in pairs(squads) do team_ids[#team_ids + 1] = tid end
table.sort(team_ids)
r:add("takım;oyuncu;yaş;poz;OVR;→OVR;POT;→POT;ağırlıklı puan;not")
for _, tid in ipairs(team_ids) do
    n_teams = n_teams + 1
    math.randomseed(SEED + tid)
    local list = {}
    for _, pid in ipairs(squads[tid]) do
        local p = by[pid]
        if p and p.gender == 0 then
            p.age = M.age(p.birthdate, date)
            p.pos = W.positions[p.preferredposition1] or "CM"
            list[#list + 1] = p
        end
    end
    table.sort(list, function(a, b) return a.overallrating > b.overallrating end)
    local top, sum = math.min(11, #list), 0
    for i = 1, top do sum = sum + list[i].overallrating end
    local avg11 = top > 0 and sum / top or 0

    -- İlk 11 (en yüksek OVR'lı 11 oyuncu) içindeki en zayıf halka: genç onun pozisyonuna, onun OVR'ının 1 üstüyle
    -- gelir; böylece oynar ama takımın üstüne çıkmaz.
    local xi = {}
    for i = 1, top do xi[list[i].playerid] = true end
    local weak = list[top]

    local function pick_from(age_min, age_max, match_fn, require_bench)
        local best, best_score
        for _, p in ipairs(list) do
            local bench_ok = not require_bench or not xi[p.playerid]
            local age_ok = (not age_min or (p.age and p.age >= age_min)) and (not age_max or (p.age and p.age <= age_max))
            if age_ok and not loaned[p.playerid] and bench_ok and match_fn(p) then
                local score = p.potential + ((21 - (p.age or 21)) * 2)
                if not best or score > best_score then
                    best = p
                    best_score = score
                end
            end
        end
        return best
    end

    local cand, how
    -- 1. Kademe: 17-21 yaş, kiralık değil, ilk 11 dışı
    if weak then
        cand = pick_from(17, 21, function(p) return p.pos == weak.pos end, true)
        if cand then how = "aynı pozisyon (17-21)" end
        if not cand then
            cand = pick_from(17, 21, function(p)
                return GROUP[p.pos] == GROUP[weak.pos] and (p.pos == "GK") == (weak.pos == "GK")
            end, true)
            if cand then how = "aynı bölge (17-21)" end
        end
    end
    if not cand then
        cand = pick_from(17, 21, function(p) return p.pos ~= "GK" end, true)
        if cand then how = "genel genç (17-21)" end
    end

    -- 2. Kademe (17-21 yoksa): 22-24 yaş esnetme
    if not cand then
        if weak then
            cand = pick_from(22, 24, function(p)
                return GROUP[p.pos] == GROUP[weak.pos] and (p.pos == "GK") == (weak.pos == "GK")
            end, true)
            if cand then how = "aynı bölge (22-24)" end
        end
        if not cand then
            cand = pick_from(22, 24, function(p) return p.pos ~= "GK" end, true)
            if cand then how = "yaş esnetme (22-24)" end
        end
    end

    -- 3. Kademe (24 altı da yoksa): ilk 11 dışındaki en genç saha içi oyuncu
    if not cand then
        local youngest_bench
        for _, p in ipairs(list) do
            if not xi[p.playerid] and not loaned[p.playerid] and p.pos ~= "GK" then
                if not youngest_bench or (p.age and youngest_bench.age and p.age < youngest_bench.age) then
                    youngest_bench = p
                end
            end
        end
        if youngest_bench then
            cand = youngest_bench
            how = "en genç yedek (" .. tostring(cand.age) .. " yaş)"
        end
    end

    -- 4. Kademe (kadro çok darsa): kadrodaki en genç saha içi oyuncu
    if not cand then
        local youngest_any
        for _, p in ipairs(list) do
            if not loaned[p.playerid] and p.pos ~= "GK" then
                if not youngest_any or (p.age and youngest_any.age and p.age < youngest_any.age) then
                    youngest_any = p
                end
            end
        end
        if youngest_any then
            cand = youngest_any
            how = "kadronun en genci (" .. tostring(cand.age) .. " yaş)"
        end
    end

    -- Yıldız aday genç olmalı: yaş aralığında genç yoksa takım atlanır, 26 yaşındakine potansiyel verilmez.
    if cand and (not cand.age or cand.age < AGE_MIN or cand.age > AGE_MAX) then cand = nil end

    local team = M.team_name(tid)
    if not cand then
        n_skip = n_skip + 1
        r:add(string.format("%s;-;-;-;-;-;-;-;-;aday yok (17-21 yaş genç bulunamadı)", team))
    else
        -- 1. Hedef OVR hesaplama
        -- Kullanıcı kuralı: en zayıf yerin +1'i yalnız o mevkide oynayacak gence; değilse genel seviyenin FALLBACK_BELOW altı.
        local same_position = weak and cand.pos == weak.pos
        local weak_target = same_position and (weak.overallrating + WEAK_LINK_BONUS) or math.floor(avg11 - FALLBACK_BELOW + 0.5)
        local target

        -- Durum A: Genç zayıf halkadan düşükse doğrudan ilk 11 seviyesine çekilir
        if cand.overallrating < weak_target then
            target = math.max(weak_target, cand.overallrating + math.random(2, 3))
        else
            -- Durum B: Genç zaten zayıf halka veya üstündeyse mevcut gücüne +2..+4 bonus verilir
            local bonus = math.random(2, 4)
            target = cand.overallrating + bonus
        end

        -- Tavan sınırlamaları:
        -- a) MAX_OVR = 82 (yıldız genç ilk sezondan 85+ olup oyunu kırmasın)
        -- b) Takım ortalamasının en fazla +4 üstü (küçük takımlarda dengesiz uçmasın)
        local team_ceiling = math.max(cand.overallrating, math.floor(avg11 + 4.5))
        target = math.min(target, team_ceiling, MAX_OVR, cand.overallrating + MAX_OVR_JUMP)
        target = math.max(cand.overallrating, target)

        -- 2. Dinamik Potansiyel (POT) Formülü:
        -- Kullanıcı kuralı: 60 OVR takıma 80 POT, 90 OVR takıma 95 POT.
        -- Her takımda en az 80 POT olacak, takım büyüklüğüne göre ölçeklenecek.
        local base_pot = 80 + (avg11 - 60) * 0.5
        local pot_target = math.floor(base_pot + 0.5) + math.random(0, 2)
        pot_target = math.max(MIN_POT, math.min(MAX_POT, pot_target))
        pot_target = math.max(math.min(pot_target, target + pot_gap(target)), target + POT_GAP_MIN)
        local pot = math.max(cand.potential, pot_target)

        local delta_ovr = target - cand.overallrating
        local delta_pot = pot - cand.potential

        if delta_ovr <= 0 and delta_pot <= 0 then
            n_skip = n_skip + 1
            r:add(string.format("%s;%s;%d;%s;%d;-;%d;-;-;zaten zirvede (OVR %d, POT %d)", team, M.name(cand.playerid), cand.age, cand.pos,
                cand.overallrating, cand.potential, target, pot))
        else
            local before, after = { overallrating = cand.overallrating, potential = cand.potential }, { overallrating = target, potential = pot }
            local style_name = "-"
            local score = cand.overallrating

            if delta_ovr > 0 then
                load_attributes(cand)
                local style = pick_style(cand, cand.pos, target)
                style_name = style.name
                local new, sc = plan_attributes(cand, cand.pos, target, style)
                score = sc or target
                for a, v in pairs(new) do
                    if v ~= cand[a] then before[a], after[a] = cand[a], v end
                end
                if cand.modifier ~= 0 then before.modifier, after.modifier = cand.modifier, 0 end
            end

            r:add(string.format("%s;%s;%d;%s;%d;%d;%d;%d;%.1f;tarz: %s, en zayıf %s (%d), %s, ilk 11 ort. %.1f", team,
                M.name(cand.playerid), cand.age, cand.pos, cand.overallrating, target, cand.potential, pot, score or 0,
                style_name, weak and weak.pos or "-", weak and weak.overallrating or 0,
                how, avg11))

            for f, v in pairs(after) do M.set_player_field(tbl, cand, f, v, { dry_run = DRY_RUN, user_team = user }) end
            applied[#applied + 1] = { playerid = cand.playerid, name = M.name(cand.playerid), team = team, style = style_name,
                before = before, after = after }
        end
    end
end

r:add(string.format("Toplam: %d takım, %d oyuncu yükseltildi%s, %d takım atlandı.", n_teams, #applied,
    DRY_RUN and " (DRY-RUN, yazılmadı)" or "", n_skip))
if not DRY_RUN and #applied > 0 then
    M.save_state(STATE, { date = date, players = applied })
    r:add("Durum kaydedildi. Kaydet → çık → yükle → MODE = \"verify\" ile kontrol et; sonra 1 ay ilerletip tekrar verify.")
end
r:save("a")
