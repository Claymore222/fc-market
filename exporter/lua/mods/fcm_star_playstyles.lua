--[[
  fcm_star_playstyles.lua — yıldız adaylara PlayStyle verir (docs/star-prospects-playstyles-plan-2026-11-01.md).

  Yalnızca players.trait1/trait2 ve icontrait1/icontrait2 alanları LE'nin TABLE API'siyle yazılır. Oyuncunun var olan PlayStyle'ı
  silinmez. OVR PLUS_MIN_OVR ve üstündeki adayın en güçlü PlayStyle'ı PlayStyle+ olur; aynı bit iki alanda birden durmaz.
  Adaylar star_prospects_state.json dosyasından gelir; önce fcm_star_prospects.lua uygulanmış olmalı.

  ONLY_TEAMS: boşsa durum dosyasındaki bütün adaylar. INCLUDE_USER_YOUTH kullanıcı kadrosunun gençlerini ekler.
  MODE:
    "apply"   — seç ve yaz. DRY_RUN = true ise yalnızca rapor.
    "verify"  — yazılanlar oyunda duruyor mu.
    "restore" — eski değerleri geri yazar (DRY_RUN = false gerekir).
  Çıktılar: C:/FCExport/m0/star_playstyles.txt (rapor, eklenir), star_playstyles_state.json (geri alma için)
]]
local DRY_RUN = true
local MODE = "apply"
local ONLY_TEAMS = {}
local INCLUDE_USER_YOUTH = true         -- kullanıcı kadrosunda listede olmayan gençler de PlayStyle alır; OVR ve POT'a dokunulmaz
local YOUTH_MAX_AGE, YOUTH_MIN_POT = 21, 80
if FCM_RUN then DRY_RUN, MODE = FCM_RUN.dry_run, FCM_RUN.mode end
local REBUILD = FCM_RUN and FCM_RUN.rebuild -- daha önce verilenleri yok sayıp yeni kurallarla yeniden seç

-- Hedef sayı POT'a göre; düşük OVR'da eksik (en az 1). Var olanlar sayılır.
local COUNT_BY_POT = { { 95, 5 }, { 90, 4 }, { 85, 3 }, { 0, 2 } }
local OVR_PENALTY = { { 65, 2 }, { 80, 1 } } -- OVR bu değerin altındaysa o kadar eksik
local MIN_COUNT_OVR = 70                -- bu OVR ve üstü en az 2 PlayStyle alır
local CATEGORY_LIMIT = 2                -- aynı gruptan en fazla bu kadar (ör. iki şut PlayStyle'ı)
local SHARE_WEIGHT = 15                 -- mevkide yaygınlığın ağırlığı
local STYLE_WEIGHT = 8                  -- oyuncunun tarzına uyan PlayStyle'ın öncelik puanı
local MAX_GAP = 15                       -- bağlı özellikleri OVR'ın bu kadar altındaysa o PlayStyle verilmez
local PLUS_MIN_OVR = 82                 -- bu OVR ve üstüne bir PlayStyle+

-- Tarz → öncelikli PlayStyle bitleri (config/field-map.json playStyles). Tarz adları fcm_star_prospects.lua STYLES ile aynı.
local STYLE_BITS = {
    ["sert stoper"] = { 28, 16, 19 }, ["hava hakimi"] = { 19, 4 }, ["hızlı stoper"] = { 25, 14, 17 },
    ["top oynayan stoper"] = { 10, 9, 22 }, ["kesici"] = { 16, 18 }, ["dengeli ön libero"] = { 16, 10 },
    ["derin oyun kurucu"] = { 10, 9, 8 }, ["box-to-box"] = { 26, 16 }, ["oyun kurucu"] = { 8, 13, 11 },
    ["teknik orta saha"] = { 20, 11, 22 }, ["uzaktan şutör"] = { 2, 0, 6 }, ["golcü kanat"] = { 0, 7, 6 },
    ["hızlı kanat"] = { 21, 25, 20 }, ["fizikli kanat"] = { 29, 12, 2 }, ["teknik kanat"] = { 20, 23, 12 },
    ["hızlı forvet"] = { 21, 25, 6 }, ["hedef forvet"] = { 4, 29, 28 }, ["komple forvet"] = { 0, 6, 4 },
    ["bitirici"] = { 7, 6, 0 }, ["hücum beki"] = { 12, 21, 25 }, ["savunmacı bek"] = { 14, 16, 17 },
    ["hızlı bek"] = { 25, 21, 14 }, ["refleks kaleci"] = { 34, 35 }, ["oyun kurucu kaleci"] = { 32, 33 }, ["dengeli kaleci"] = { 33, 34 },
}

FCM_DIR = "C:/FC 27 LE v27.1.6/lua/scripts/"
local M = dofile(FCM_DIR .. "fcm_common.lua")
local W = M.weights()
local P = dofile(FCM_DIR .. "fcm_playstyles.lua")
local SOURCE = "star_prospects_state"
local STATE = "star_playstyles_state"
local r = M.report("star_playstyles.txt")
local date = M.date_str()
r:add(string.format("== yıldız aday PlayStyle | %s | oyun tarihi %s | MODE=%s%s", os.date(), date, MODE, DRY_RUN and " | DRY-RUN" or ""))

local GROUP = { RW = "WING", LW = "WING", RM = "WING", LM = "WING", ST = "FWD", CF = "FWD", CAM = "MID", CM = "MID", CDM = "DM",
    CB = "CB", RB = "FB", LB = "FB", RWB = "FB", LWB = "FB", GK = "GK" }

local STYLE_FIELDS = { "trait1", "trait2", "icontrait1", "icontrait2" }
local function field_of(bit) return bit < 32 and "trait1" or "trait2" end
local function plus_field_of(bit) return bit < 32 and "icontrait1" or "icontrait2" end
local function has(value, bit) return math.floor((value or 0) / 2 ^ (bit % 32)) % 2 == 1 end
local function shifted(value, bit, sign)
    local next_value = (value or 0) + sign * 2 ^ (bit % 32)
    return math.tointeger(next_value) or next_value
end
local function with(value, bit) return shifted(value, bit, 1) end
local function without(value, bit) return shifted(value, bit, -1) end
local function owns(row, bit) return has(row[field_of(bit)], bit) or has(row[plus_field_of(bit)], bit) end

local function read_fields()
    local fields = { "overallrating", "potential", "preferredposition1", "birthdate" }
    for _, f in ipairs(STYLE_FIELDS) do fields[#fields + 1] = f end
    for _, a in ipairs(W.attributes) do fields[#fields + 1] = a end
    return fields
end

local function target_count(row)
    local least = row.overallrating >= MIN_COUNT_OVR and 2 or 1
    for _, band in ipairs(COUNT_BY_POT) do
        if row.potential >= band[1] then
            for _, penalty in ipairs(OVR_PENALTY) do
                if row.overallrating < penalty[1] then return math.max(least, band[2] - penalty[2]) end
            end
            return band[2]
        end
    end
    return least
end

local function owned(row)
    local list = {}
    for bit in pairs(P.needs) do
        if owns(row, bit) then list[#list + 1] = bit end
    end
    return list
end

local function need_average(row, bit)
    local sum = 0
    for _, a in ipairs(P.needs[bit]) do sum = sum + (row[a] or 0) end
    return sum / #P.needs[bit]
end

local function style_rank(style, bit)
    for i, wanted in ipairs(STYLE_BITS[style] or {}) do
        if wanted == bit then return STYLE_WEIGHT - (i - 1) end
    end
    return 0
end

-- Puan: oyuncunun öne çıkan özellikleri (OVR'ına göre), mevkide yaygınlık ve tarz. Fiziği yüksek stoper bu yüzden Sert alır.
-- Rastgele değil, tekrar çalıştırınca aynı sonuç gelir.
local function choose(row, pos, style)
    local shares = P.shares[GROUP[pos] or "MID"] or {}
    local mine, used = owned(row), {}
    for _, bit in ipairs(mine) do used[P.categories[bit]] = (used[P.categories[bit]] or 0) + 1 end
    local need = target_count(row) - #mine
    local pool = {}
    for bit in pairs(shares) do pool[bit] = true end
    for _, bit in ipairs(STYLE_BITS[style] or {}) do pool[bit] = true end
    local options = {}
    for bit in pairs(pool) do
        local fits = P.needs[bit] and (pos == "GK" and bit >= 32 or pos ~= "GK" and need_average(row, bit) >= row.overallrating - MAX_GAP)
        if fits and not owns(row, bit) then
            local score = need_average(row, bit) - row.overallrating + (shares[bit] or 0) * SHARE_WEIGHT + style_rank(style, bit)
            options[#options + 1] = { bit = bit, score = score }
        end
    end
    table.sort(options, function(a, b)
        if a.score ~= b.score then return a.score > b.score end
        return a.bit < b.bit
    end)
    local picked = {}
    for _, option in ipairs(options) do
        if #picked >= need then break end
        local category = P.categories[option.bit]
        if (used[category] or 0) < CATEGORY_LIMIT then
            used[category] = (used[category] or 0) + 1
            picked[#picked + 1] = option.bit
        end
    end
    return picked, #mine
end

-- PlayStyle+: oyuncunun sahip olacağı PlayStyle'lar içinde en yüksek özellikli olan; şutu çok iyiyse şut, ortası iyiyse orta. Tarz eşitliği bozar.
local function choose_plus(row, picked, style)
    if row.overallrating < PLUS_MIN_OVR then return nil end
    local list = owned(row)
    for bit in pairs(P.needs) do
        if has(row[plus_field_of(bit)], bit) then return nil end
    end
    for _, bit in ipairs(picked) do list[#list + 1] = bit end
    local best, best_score
    for _, bit in ipairs(list) do
        local score = need_average(row, bit) + style_rank(style, bit) / STYLE_WEIGHT
        if not best or score > best_score or (score == best_score and bit < best) then best, best_score = bit, score end
    end
    return best
end

local function label(bits)
    local names = {}
    for _, bit in ipairs(bits) do names[#names + 1] = P.names[bit] end
    return #names > 0 and table.concat(names, ", ") or "-"
end

local function id_set(players)
    local ids = {}
    for _, p in ipairs(players) do ids[p.playerid] = true end
    return ids
end

if MODE == "verify" or MODE == "restore" then
    local state = M.load_state(STATE)
    if not state or not state.players then
        r:add("Durum dosyası yok: " .. STATE)
        r:save("a")
        return
    end
    local by, tbl = M.players_by_id(id_set(state.players), read_fields())
    local same = 0
    for _, p in ipairs(state.players) do
        local row = by[p.playerid]
        if not row then
            r:add(string.format("%s (id %d): oyuncu yok", p.name, p.playerid))
        elseif MODE == "restore" then
            for f, v in pairs(p.before) do M.set_player_field(tbl, row, f, v, { dry_run = DRY_RUN }) end
        else
            local changed = {}
            for _, f in ipairs(STYLE_FIELDS) do
                if row[f] ~= p.after[f] then changed[#changed + 1] = string.format("%s %s → %s", f, tostring(p.after[f]), tostring(row[f])) end
            end
            if #changed == 0 then same = same + 1
            else r:add(string.format("%-24s değişmiş: %s", p.name, table.concat(changed, ", "))) end
        end
    end
    if MODE == "verify" then
        r:add(string.format("%d / %d oyuncuda PlayStyle duruyor.", same, #state.players))
    else
        r:add(string.format("%d oyuncu eski haline %s", #state.players, DRY_RUN and "döndürülecekti (DRY-RUN)" or "döndürüldü"))
        if not DRY_RUN then M.clear_state(STATE) end
    end
    r:save("a")
    return
end

local source = M.load_state(SOURCE)
if not source or not source.players then
    r:add("Aday bulunamadı: " .. SOURCE .. ". Önce fcm_star_prospects.lua uygulanmalı.")
    r:save("a")
    return
end
local only = {}
for _, team in ipairs(ONLY_TEAMS) do only[team] = true end
local state = M.load_state(STATE) or { players = {} }
local earlier = {}
for _, p in ipairs(state.players) do earlier[p.playerid] = p end
local chosen = {}
for _, p in ipairs(source.players) do
    if next(only) == nil or only[p.team] then chosen[#chosen + 1] = p end
end

local user = M.user_team_players()
local wanted = id_set(chosen)
if INCLUDE_USER_YOUTH then
    for pid in pairs(user) do wanted[pid] = true end
end
local by, tbl = M.players_by_id(wanted, read_fields())
if INCLUDE_USER_YOUTH then
    local listed = id_set(chosen)
    local squad = M.team_name(M.user_team_id())
    for pid in pairs(user) do
        local row = by[pid]
        local age = row and M.age(row.birthdate, date)
        if row and not listed[pid] and age and age <= YOUTH_MAX_AGE and row.potential >= YOUTH_MIN_POT then
            chosen[#chosen + 1] = { playerid = pid, name = M.name(pid), team = squad, style = "kadro genci" }
        end
    end
end
local added, total = 0, 0
r:add("takım;oyuncu;poz;OVR;tarz;var olan;eklenen;PlayStyle+")
for _, p in ipairs(chosen) do
    local row = by[p.playerid]
    if not row then
        r:add(string.format("%s;%s;oyuncu yok", p.team, p.name))
    else
        local entry = earlier[p.playerid]
        local actual = {}
        for _, f in ipairs(STYLE_FIELDS) do actual[f] = row[f] end
        if REBUILD and entry then
            for _, f in ipairs(STYLE_FIELDS) do row[f] = entry.before[f] end
        end
        for f, v in pairs(FCM_PREVIEW and FCM_PREVIEW[p.playerid] or {}) do row[f] = v end
        local pos = W.positions[row.preferredposition1] or "CM"
        local picked, had = choose(row, pos, p.style)
        local plus = choose_plus(row, picked, p.style)
        r:add(string.format("%s;%s;%s;%d;%s;%d;%s;%s", p.team, p.name, pos, row.overallrating, tostring(p.style), had, label(picked), plus and P.names[plus] or "-"))
        local rebuilt = REBUILD and entry ~= nil
        if #picked > 0 or plus or rebuilt then
            local before, after = {}, {}
            for _, f in ipairs(STYLE_FIELDS) do before[f], after[f] = row[f], row[f] end
            for _, bit in ipairs(picked) do after[field_of(bit)] = with(after[field_of(bit)], bit) end
            if plus then
                after[field_of(plus)] = without(after[field_of(plus)], plus)
                after[plus_field_of(plus)] = with(after[plus_field_of(plus)], plus)
            end
            for f, v in pairs(after) do
                if v ~= actual[f] then M.set_player_field(tbl, row, f, v, { dry_run = DRY_RUN, user_team = user }) end
            end
            -- Yeniden çalıştırma eksik kalanı tamamlar; geri alma ilk değere döner.
            if entry then entry.after = after
            else state.players[#state.players + 1] = { playerid = p.playerid, name = p.name, team = p.team, before = before, after = after } end
            added, total = added + 1, total + #picked
        end
    end
end
r:add(string.format("Toplam: %d oyuncu incelendi, %d oyuncuya %d PlayStyle%s.", #chosen, added, total, DRY_RUN and " verilecekti (DRY-RUN, yazılmadı)" or " verildi"))
if not DRY_RUN and added > 0 then
    state.date = date
    M.save_state(STATE, state)
    r:add("Durum kaydedildi. Kaydet → çık → yükle → MODE = \"verify\" ile kontrol et; sonra 1 ay ilerletip tekrar verify.")
end
r:save("a")
