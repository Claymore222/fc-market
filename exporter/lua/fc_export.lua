--[[
  fc_export.lua  —  FC Career Mode -> dosya export'u (Live Editor Lua Engine)

  NE YAPAR
    1) Çalıştırıldığı anda bir "snapshot" alır:
         - meta (save id, oyun tarihi, kullanıcı takımı, bütçeler)
         - seçili DB tabloları (CSV)
         - oyuncu isimleri (CSV)
         - sezon istatistikleri (CSV)
         - tüm tabloların şeması (JSON) -> veri keşfi için
    2) Career event'lerini events.jsonl dosyasına hafif bir log olarak yazar
       (transfer, sakatlık, şampiyonluk, maç sonu ...).
    3) İsteğe bağlı: her ay başında otomatik snapshot.

  OYUNDA HİÇBİR ŞEYİ DEĞİŞTİRMEZ. Sadece okur ve dosyaya yazar.

  KURULUM
    - CONFIG.OUT_DIR klasörünü ÖNCEDEN oluştur (Lua klasör oluşturamaz).
    - Bu dosyayı Live Editor'ün lua/scripts klasörüne koy.
    - Career save'i yükle -> Live Editor -> Features -> Lua Engine -> çalıştır.
    - Event log her oyun oturumunda script tekrar çalıştırılınca devreye girer.

  KAYNAKLAR (doğrulanan fonksiyonlar)
    - LUA API v1: IsInCM, GetSaveUID, GetCurrentDate, GetUserTeamID, GetTeamName,
      GetPlayerName, GetPlayersStats, GetDBTablesNames, GetDBTableFields,
      GetDBTableRows, GetTransferBudget
    - LUA API v2: AddEventHandler("post__CareerModeEvent", fn)
    - fc26-mcp le_bridge.lua (FC 26'da çalışıyor): require "imports/external/json",
      io.open, os.rename, Sleep, GetUserTransferBudget, GetUserWageBudget
    FC 27'de isimler değişmişse ilgili çağrı pcall ile atlanır ve log'a yazılır.

  FC 27 / LE v27.1.3 (oyunda denendi)
    - Live Editor klasörü ASCII bir yolda olmalı (ör. C:\FC27LE). "Masaüstü" gibi Türkçe karakterli
      yolda Lua kütüphaneleri yüklenemiyor, LE (v2) nil kalıyor.
    - GetCurrentDate, GetTeamIdFromPlayerId, GetPlayersStats ve bütçe fonksiyonları yok. Tarih ve
      bütçe career manager'larından (CONFIG ofsetleri), kulüp teamplayerlinks'ten okunur.
]]

---------------------------------------------------------------------------
-- AYARLAR
---------------------------------------------------------------------------
local CONFIG = {
    -- Çıktı klasörü. ÖNCEDEN OLUŞTUR. Windows'ta da "/" kullanabilirsin.
    OUT_DIR = "C:/FCExport",

    -- Export edilecek DB tabloları. Olmayan tablo atlanır.
    -- Yeni tablo eklemek için önce schema.json'a bak.
    TABLES = {
        "players",
        "teams",
        "teamplayerlinks",
        "leagueteamlinks",
        "leagues",
        "nations",
        "career_playercontract",  -- FC 27'de yok (sözleşme players'ta), eski sürümler için duruyor
        "transfers",              -- alıcı/satıcı takım, bonservis, tarih (haber akışı)
        "playerloans",            -- kiralık oyuncular
        "playersuspensions",      -- cezalar
        -- 0.4.0: CMTracker ekranları (fikstür, sezon, akademi, gözlemciler). Boş/bayat olabilir; oyunda doğrulanacak.
        "fixtures",                         -- maç takvimi: tarih, saat, ev/deplasman, lig sırası, form
        "career_calendar",                  -- sezon başı/sonu, transfer dönemleri
        "career_playermatchratinghistory",  -- oyuncu maç puanları (tarih, dakika, mevki, puan)
        "prevcompetitionstats",             -- geçmiş sezon istatistikleri (maç, gol, asist, kart)
        "career_youthplayers",              -- altyapı akademisi oyuncuları
        "career_youthplayerhistory",        -- akademi oyuncularının maç/gol sayıları
        "career_scouts",                    -- gözlemciler (deneyim, bilgi, bölge)
        "career_scoutmission",              -- gözlemci görevleri
        "career_managerawards",             -- menajer ödülleri
        "career_clinchedobjectives",        -- yönetim hedefleri bayrakları
        "playerformdiff",                   -- oyuncu form değişimi (OVR eski/yeni)
        "teamformdiff",                     -- takım reyting değişimi
    },

    EXPORT_SCHEMA       = true,   -- tüm tabloların alan listesi (veri keşfi)
    EXPORT_PLAYER_NAMES = true,   -- playerid -> isim
    EXPORT_STATS        = true,   -- GetPlayersStats()
    ENABLE_EVENT_LOG    = true,   -- events.jsonl
    -- Ay geçince otomatik snapshot (FC 27'de ~5 sn donma). MONTH_PASSED'dan sonraki ilk DAY_PASSED'da alınır;
    -- kayıt hazırlığı (PREPARE_FOR_SAVE) sırasında ve aynı oyun gününde ikinci kez alınmaz.
    AUTO_SNAPSHOT_ON_MONTH = true,
    -- Her oyun günü hafif export (partial): yalnız kullanıcının kadrosu, ligindeki takımların oyuncuları ve
    -- WATCHLIST_FILE'daki oyuncular (uygulama yazar; satır başına bir playerid). Ay başı tam snapshot'la aynı gün alınmaz.
    AUTO_DAILY = true,
    -- Kariyer yüklendikten sonraki ilk DAY_PASSED'da tam snapshot (oturum/kariyer başına bir kez). lua/autorun'dan
    -- çalışırken menüde başlar; o anda snapshot alınamaz, bu yüzden ilk oyun gününü bekler.
    AUTO_SESSION_SNAPSHOT = true,
    DAILY_TABLES = { "players", "teamplayerlinks", "career_playermatchratinghistory" },
    WATCHLIST_FILE = "watchlist.txt",
    -- Otomatik export sıklığı: uygulama bu dosyaya daily, weekly, monthly ya da quarterly yazar; her oyun günü okunur.
    SCHEDULE_FILE = "export_schedule.txt",
    DEFAULT_SCHEDULE = "monthly",

    YIELD_EVERY = 1000,           -- bu kadar satırda bir Sleep(1) (oyunu kilitlememek için)

    -- GetCurrentDate / bütçe fonksiyonları yoksa (FC 27) career manager belleğinden okunur.
    -- Oyun güncellemesiyle değişebilir; bkz. docs/data-dictionary.md.
    CALENDAR_DATE_OFFSET   = 0x34, -- CalendarManager: gün, ay, yıl (int32 × 3). 17.10.2029 ile doğrulandı
    TRANSFER_BUDGET_OFFSET = 0x38, -- BudgetManager: transfer bütçesi (int32). DOĞRULANACAK
}

-- events.jsonl'e yazılacak event'ler (isim olarak; FC 27'de olmayanlar atlanır)
local LOGGED_EVENTS = {
    "USER_MATCH_COMPLETED", "USER_MATCH_COMPLETED_IN_TOURNAMENT",
    "NON_USER_MATCH_RESULT",
    "TRANSFER_MOVE_COMPLETE", "TRANSFER_BID_REJECTED", "TRANSFER_BID_COUNTER_OFFER",
    "PRE_CONTRACT_COMPLETE", "PLAYER_CONTRACT_ACCEPTED", "PLAYER_CONTRACT_TERMINATION",
    "TRANSFER_WINDOW_OPENING_SOON", "TRANSFER_WINDOW_CLOSED", "DEADLINE_DAYS_STARTED",
    "INJURY", "LONGTERM_INJURY", "BACK_FROM_INJURY", "SUSPENSION",
    "PLAYERS_RETIRED", "YOUTH_PLAYER_PROMOTION", "YOUTH_PLAYER_ADDED_TO_YOUTH_ACADEMY",
    "COMPETITION_CHAMPION", "CHAMPION_OF_COMPETITION", "CHAMPION_OF_CHAMPIONS_LEAGUE",
    "CHAMPION_OF_EUROPA_LEAGUE", "CHAMPION_OF_EUROPA_CONFERENCE_LEAGUE",
    "PROMOTED_TEAMS", "RELEGATED_TEAMS",
    "PLAYER_OF_THE_MONTH", "PLAYER_OF_THE_YEAR", "MANAGER_OF_THE_MONTH",
    "HAT_TRICK", "TEAM_WINS_AGAINST_RIVAL", "UNDERDOG_TEAM_WINS_AGAINST_BIGGER_OPPONENT",
    "JOB_OFFER_RECEIVED", "MONTH_PASSED", "SEASON_ENDED", "END_OF_SEASON_REACHED",
}

---------------------------------------------------------------------------
-- YARDIMCILAR
---------------------------------------------------------------------------
local VERSION = "0.7.0"  -- 0.7.0: export sıklığı uygulamadan seçilir (günlük/haftalık/aylık/3 aylık). 0.6.0: lua/autorun uyumu (menüde başlarsa handler'ı sessizce kurar), oturum başı tam snapshot; 0.5.0: günlük hafif export (kadro, lig, izleme listesi); 0.4.0: fikstür, sezon, akademi, gözlemci tabloları; 0.3.0: transfers/playerloans/playersuspensions, otomatik aylık snapshot
                         -- 0.2.1: FC 27'de eksik fonksiyonlar için tarih/bütçe/kulüp yedekleri (format aynı)
                         -- 0.2.0: FC 27 LUA API v2 (LE.db) + yeni enum önekleri

-- LE'de print zaten log'a gidiyor; Log da çağrılırsa her satır iki kez yazılıyordu.
local function log(msg)
    print("[FC-EXPORT] " .. tostring(msg))
end

-- pcall ile güvenli çağrı: fonksiyon yoksa veya hata verirse nil döner
local function try(fn_name, ...)
    local fn = _G[fn_name]
    if type(fn) ~= "function" then return nil, "missing: " .. fn_name end
    local ok, res = pcall(fn, ...)
    if not ok then return nil, tostring(res) end
    return res
end

local function yield_tick(i)
    if CONFIG.YIELD_EVERY > 0 and i % CONFIG.YIELD_EVERY == 0 and type(Sleep) == "function" then
        pcall(Sleep, 1)
    end
end

local function path(name)
    return CONFIG.OUT_DIR .. "/" .. name
end

-- JSON (Live Editor ile gelen kütüphane; yoksa basit yedek encoder)
local json
do
    local ok, mod = pcall(require, "imports/external/json")
    if ok and type(mod) == "table" and type(mod.encode) == "function" then
        json = mod
    else
        local function esc(s)
            return (s:gsub('[%c"\\]', function(c)
                local map = { ['"'] = '\\"', ['\\'] = '\\\\', ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t' }
                return map[c] or string.format("\\u%04x", c:byte())
            end))
        end
        local function enc(v)
            local t = type(v)
            if t == "nil" then return "null"
            elseif t == "boolean" then return tostring(v)
            elseif t == "number" then
                if v ~= v or v == math.huge or v == -math.huge then return "null" end
                return tostring(v)
            elseif t == "string" then return '"' .. esc(v) .. '"'
            elseif t == "table" then
                if #v > 0 or next(v) == nil then
                    local out = {}
                    for i = 1, #v do out[i] = enc(v[i]) end
                    return "[" .. table.concat(out, ",") .. "]"
                end
                local out = {}
                for k, val in pairs(v) do
                    out[#out + 1] = '"' .. esc(tostring(k)) .. '":' .. enc(val)
                end
                return "{" .. table.concat(out, ",") .. "}"
            end
            return '"' .. esc(tostring(v)) .. '"'
        end
        json = { encode = enc }
        log("UYARI: imports/external/json bulunamadı, yedek encoder kullanılıyor")
    end
end

-- Event isimleri ve v2 yardımcıları (FC 27: GetUserTeamID vb. helpers.lua'da yeniden tanımlı)
pcall(require, "imports/career_mode/enums")
pcall(require, "imports/career_mode/helpers")

-- FC 27'de enum öneki değişti: ENUM_FCEGameModesCM_EVENT_MSG_*  (eski: ENUM_CM_EVENT_MSG_*)
local function event_id_by_name(name)
    local id = _G["ENUM_FCEGameModesCM_EVENT_MSG_" .. name]
    if type(id) ~= "number" then id = _G["ENUM_CM_EVENT_MSG_" .. name] end
    return type(id) == "number" and id or nil
end

-- LUA API v2 veritabanı (LE.db). FC 27 bununla geliyor; yoksa v1 fonksiyonlarına düşülür.
local function v2_db()
    if type(LE) == "table" and type(LE.db) == "table" and type(LE.db.GetTable) == "function" then
        return LE.db
    end
    return nil
end

local function write_file(name, content, mode)
    local f, err = io.open(path(name), mode or "w")
    if not f then
        log("Dosya açılamadı: " .. path(name) .. " (" .. tostring(err) .. ")  -> OUT_DIR klasörü var mı?")
        return false
    end
    f:write(content)
    f:close()
    return true
end

local function csv_cell(v)
    if v == nil then return "" end
    local s = tostring(v)
    if s:find('[,"\r\n]') then
        s = '"' .. s:gsub('"', '""') .. '"'
    end
    return s
end

-- rows: dizi; columns: alan adları dizisi; getter(row, col) -> değer
local function write_csv(name, columns, rows, getter)
    local f, err = io.open(path(name), "w")
    if not f then
        log("CSV açılamadı: " .. path(name) .. " (" .. tostring(err) .. ")")
        return 0
    end
    local header = {}
    for i, c in ipairs(columns) do header[i] = csv_cell(c) end
    f:write(table.concat(header, ","), "\n")
    local n = 0
    for i, row in ipairs(rows) do
        local cells = {}
        for j, c in ipairs(columns) do
            local ok, v = pcall(getter, row, c)
            cells[j] = csv_cell(ok and v or nil)
        end
        f:write(table.concat(cells, ","), "\n")
        n = n + 1
        yield_tick(i)
    end
    f:close()
    return n
end

local function int(v) return math.tointeger(tonumber(v) or 0) or math.floor(tonumber(v) or 0) end

-- v2 career manager nesnesinden int32 oku (helpers.lua: GetManagerObjByTypeId). Okunamazsa nil.
local function manager_int(type_id, offset)
    if type(GetManagerObjByTypeId) ~= "function" or type(ReadInteger) ~= "function" or type(type_id) ~= "number" then
        return nil
    end
    local ok, addr = pcall(GetManagerObjByTypeId, type_id)
    if not ok or type(addr) ~= "number" or addr <= 0 then return nil end
    local ok2, v = pcall(ReadInteger, addr + offset)
    return (ok2 and type(v) == "number") and v or nil
end

-- Okunamazsa 0, 0, 0 döner.
local function game_date()
    local d = try("GetCurrentDate")
    if type(d) == "table" and int(d.year) > 0 then return int(d.year), int(d.month), int(d.day) end

    -- FC 27: GetCurrentDate yok, tarih CalendarManager'da gün/ay/yıl olarak duruyor.
    local cal, off = ENUM_FCEGameModesFCECareerModeCalendarManager, CONFIG.CALENDAR_DATE_OFFSET
    local day, month, year = manager_int(cal, off), manager_int(cal, off + 4), manager_int(cal, off + 8)
    if day and month and year and year >= 2000 and year <= 2100
        and month >= 1 and month <= 12 and day >= 1 and day <= 31 then
        return year, month, day
    end
    return 0, 0, 0
end

local function game_date_str()
    local y, m, d = game_date()
    return string.format("%04d-%02d-%02d", y, m, d)
end

---------------------------------------------------------------------------
-- EXPORT ADIMLARI
---------------------------------------------------------------------------

-- DB alanı objesinden bilinen anahtarları güvenle oku (userdata olabilir)
local function field_meta(field)
    local function get(k)
        local ok, v = pcall(function() return field[k] end)
        if not ok or v == nil or type(v) == "function" then return nil end
        local t = type(v)
        -- JSON'a sadece ilkel tipler girsin (userdata/enum -> metin)
        return (t == "string" or t == "number" or t == "boolean") and v or tostring(v)
    end
    local out = {}
    for _, k in ipairs({ "name", "type", "depth", "rangelow", "rangehigh" }) do out[k] = get(k) end
    -- FC 27 v1 alan nesnesi: field_type_name, min, max
    out.type = out.type or get("field_type_name")
    out.rangelow = out.rangelow or get("min")
    out.rangehigh = out.rangehigh or get("max")
    return out
end

local function table_columns(table_name)
    local fields = try("GetDBTableFields", table_name)
    if type(fields) ~= "table" then return nil end
    local cols = {}
    for _, f in ipairs(fields) do
        local meta = field_meta(f)
        if meta.name then cols[#cols + 1] = meta.name end
    end
    return cols, fields
end

local function db_value(row, col)
    local cell = row[col]
    if cell == nil then return nil end
    if type(cell) == "table" or type(cell) == "userdata" then return cell.value end
    return cell
end

-- v2: LE.db:GetTable -> kayıt kayıt oku. NOT: LE'nin TABLE nesnesi iterasyon durumunu
-- paylaşıyor; iki tabloyu aynı anda (iç içe) dolaşma. Burada hep sırayla okunuyor.
-- keep_ids verilirse yalnız playerid'si kümede olan kayıtlar (playerid alanı olmayan tablo atlanır).
local function export_table_v2(snap, table_name, keep_ids)
    local db = v2_db()
    if not db then return nil end
    local ok, tbl = pcall(db.GetTable, db, table_name)
    if not ok or type(tbl) ~= "table" or type(tbl.fields) ~= "table" then return nil end
    if keep_ids and not tbl.fields["playerid"] then return nil end
    local cols = {}
    for fname in pairs(tbl.fields) do cols[#cols + 1] = fname end
    table.sort(cols)
    if #cols == 0 then return nil end

    local recs = {}
    local rec = tbl:GetFirstRecord()
    while rec and rec > 0 do
        if not keep_ids or keep_ids[int(tbl:GetRecordFieldValue(rec, "playerid"))] then recs[#recs + 1] = rec end
        rec = tbl:GetNextValidRecord()
    end
    local n = write_csv(snap .. "__" .. table_name .. ".csv", cols, recs,
        function(r, c) return tbl:GetRecordFieldValue(r, c) end)

    local ids
    if tbl.fields["playerid"] then
        ids = {}
        for i, r in ipairs(recs) do ids[i] = tbl:GetRecordFieldValue(r, "playerid") end
    end
    log(string.format("%-24s %6d satır (v2)", table_name, n))
    return n, ids
end

local function export_table(snap, table_name, keep_ids)
    local n2, ids2 = export_table_v2(snap, table_name, keep_ids)
    if n2 then return n2, ids2 end
    if keep_ids then return nil end  -- hafif export yalnız v2 ile (v1 tüm tabloyu belleğe alıyor)

    local cols = table_columns(table_name)
    if not cols or #cols == 0 then
        log("Tablo atlandı (alan listesi yok): " .. table_name)
        return nil
    end
    local rows, err = try("GetDBTableRows", table_name)
    if type(rows) ~= "table" then
        log("Tablo atlandı (" .. tostring(err) .. "): " .. table_name)
        return nil
    end
    local n = write_csv(snap .. "__" .. table_name .. ".csv", cols, rows, db_value)
    log(string.format("%-24s %6d satır (v1)", table_name, n))
    local ids
    for _, c in ipairs(cols) do
        if c == "playerid" then
            ids = {}
            for i, row in ipairs(rows) do ids[i] = db_value(row, "playerid") end
            break
        end
    end
    return n, ids
end

local function export_schema_v2(snap)
    local db = v2_db()
    if not db or type(db.Load) ~= "function" then return false end
    local ok = pcall(function() if (db.tables_count or 0) == 0 then db:Load() end end)
    if not ok or type(db.tables) ~= "table" then return false end
    local schema, count = {}, 0
    for tname, tbl in pairs(db.tables) do
        local list = {}
        for fname, f in pairs(type(tbl.fields) == "table" and tbl.fields or {}) do
            local d = type(f.fld_desc) == "table" and f.fld_desc or {}
            list[#list + 1] = { name = fname, type = f.type, depth = d.depth, rangelow = d.min }
        end
        table.sort(list, function(a, b) return a.name < b.name end)
        schema[tostring(tname)] = list
        count = count + 1
    end
    if count == 0 then return false end
    write_file(snap .. "__schema.json", json.encode(schema))
    log("schema.json: " .. count .. " tablo (v2)")
    return true
end

local function export_schema(snap)
    if export_schema_v2(snap) then return true end
    local names = try("GetDBTablesNames")
    if type(names) ~= "table" then log("Şema atlandı: GetDBTablesNames yok"); return false end
    local schema = {}
    for i, tname in ipairs(names) do
        local fields = try("GetDBTableFields", tname)
        local list = {}
        if type(fields) == "table" then
            for _, f in ipairs(fields) do list[#list + 1] = field_meta(f) end
        end
        schema[tostring(tname)] = list
        yield_tick(i)
    end
    write_file(snap .. "__schema.json", json.encode(schema))
    log("schema.json: " .. #names .. " tablo")
    return true
end

-- Bir tablonun istenen alanları (v2, yoksa v1). Olmayan alan nil gelir. Tablo yoksa nil.
local function read_rows(table_name, fields)
    local db = v2_db()
    if db then
        local ok, tbl = pcall(db.GetTable, db, table_name)
        if ok and type(tbl) == "table" and type(tbl.fields) == "table" then
            local present = {}
            for _, f in ipairs(fields) do
                if tbl.fields[f] then present[#present + 1] = f end
            end
            local rows = {}
            local rec = tbl:GetFirstRecord()
            while rec and rec > 0 do
                local row = {}
                for _, f in ipairs(present) do row[f] = tbl:GetRecordFieldValue(rec, f) end
                rows[#rows + 1] = row
                rec = tbl:GetNextValidRecord()
            end
            return rows
        end
    end
    local raw = try("GetDBTableRows", table_name)
    if type(raw) ~= "table" then return nil end
    local rows = {}
    for i, r in ipairs(raw) do
        local row = {}
        for _, f in ipairs(fields) do row[f] = db_value(r, f) end
        rows[i] = row
    end
    return rows
end

-- GetTeamIdFromPlayerId yoksa (FC 27): playerid -> kulüp teamid, teamplayerlinks'ten.
-- Milli takımlar (leagues.isinternationalleague = 1 olan liglerin takımları) atlanır.
local function club_teams_by_player()
    local tpl = read_rows("teamplayerlinks", { "playerid", "teamid" })
    if type(tpl) ~= "table" then log("club_teamid atlandı: teamplayerlinks okunamadı"); return nil end
    local national = {}
    local leagues = read_rows("leagues", { "leagueid", "isinternationalleague" }) or {}
    local intl = {}
    for _, l in ipairs(leagues) do
        if int(l.isinternationalleague) == 1 then intl[int(l.leagueid)] = true end
    end
    for _, l in ipairs(read_rows("leagueteamlinks", { "leagueid", "teamid" }) or {}) do
        if intl[int(l.leagueid)] then national[int(l.teamid)] = true end
    end
    if next(intl) == nil then log("UYARI: uluslararası lig bulunamadı, milli takımlar ayıklanamadı") end

    local club = {}
    for _, r in ipairs(tpl) do
        local pid, tid = int(r.playerid), int(r.teamid)
        if not national[tid] and club[pid] == nil then club[pid] = tid end
    end
    return club
end

-- player_ids: export_table("players") tarafından döndürülen playerid dizisi
local function export_player_names(snap, player_ids)
    if type(player_ids) ~= "table" or #player_ids == 0 then return 0 end
    -- club_teamid: GetTeamIdFromPlayerId kulübü döndürür (milli takımları atlar). FC 27'de yok.
    local clubs = type(GetTeamIdFromPlayerId) ~= "function" and club_teams_by_player() or nil
    local n = write_csv(snap .. "__player_names.csv", { "playerid", "name", "club_teamid" }, player_ids,
        function(pid, col)
            if col == "playerid" then return pid end
            if col == "club_teamid" then
                if clubs then return clubs[int(pid)] end
                return try("GetTeamIdFromPlayerId", int(pid))
            end
            return try("GetPlayerName", int(pid))
        end)
    log(string.format("%-24s %6d satır%s", "player_names", n, clubs and " (kulüp: teamplayerlinks)" or ""))
    return n
end

local STAT_KEYS = { "playerid", "teamid", "compobjid", "app", "goals", "assists", "avg",
    "yellow", "red", "two_yellow", "clean_sheets", "motm", "goals_conceded", "saves" }

local function export_stats(snap)
    local stats = try("GetPlayersStats")
    if type(stats) ~= "table" then log("İstatistik atlandı: GetPlayersStats yok"); return 0 end
    local n = write_csv(snap .. "__player_stats.csv", STAT_KEYS, stats,
        function(row, col) return row[col] end)
    log(string.format("%-24s %6d satır", "player_stats", n))
    return n
end

local function export_meta(snap, save_uid, files)
    local y, m, d = game_date()
    local user_teamid = try("GetUserTeamID")
    local meta = {
        exporter_version = VERSION,
        snapshot_id = snap,
        save_uid = save_uid,
        game_date = string.format("%04d-%02d-%02d", y, m, d),
        exported_at = os.date("!%Y-%m-%dT%H:%M:%SZ"),
        user_teamid = user_teamid,
        user_team_name = user_teamid and try("GetTeamName", user_teamid) or nil,
        -- GetTransferBudget çağrılmıyor: LE'nin v1 kütüphanesinde değer döndürmeden uyarı basıyor.
        transfer_budget = try("GetUserTransferBudget")
            or manager_int(ENUM_FCEGameModesFCECareerModeBudgetManager, CONFIG.TRANSFER_BUDGET_OFFSET),
        wage_budget = try("GetUserWageBudget"),
        files = files,
    }
    write_file(snap .. "__meta.json", json.encode(meta))
    return meta
end

---------------------------------------------------------------------------
-- SNAPSHOT
---------------------------------------------------------------------------
local function take_snapshot(reason)
    local save_uid = try("GetSaveUID") or "unknown"
    local y, m, d = game_date()
    if y == 0 then
        -- Tarihsiz snapshot yaş/sözleşme hesaplarını bozar; hiç almamak daha iyi.
        log("Snapshot alınmadı: oyun tarihi okunamadı (GetCurrentDate yok, CALENDAR_DATE_OFFSET tutmadı)")
        return nil
    end
    local snap = string.format("%s_%04d%02d%02d_%s",
        tostring(save_uid):sub(1, 8), y, m, d, os.date("%H%M%S"))

    log("Snapshot başlıyor: " .. snap .. " (" .. tostring(reason) .. ")")
    local started = os.clock()
    local files = {}

    local player_rows
    for _, tname in ipairs(CONFIG.TABLES) do
        local n, rows = export_table(snap, tname)
        if n then
            files[#files + 1] = tname
            if tname == "players" then player_rows = rows end
        end
    end
    if CONFIG.EXPORT_PLAYER_NAMES and export_player_names(snap, player_rows) > 0 then
        files[#files + 1] = "player_names"
    end
    if CONFIG.EXPORT_STATS and export_stats(snap) > 0 then
        files[#files + 1] = "player_stats"
    end
    if CONFIG.EXPORT_SCHEMA then export_schema(snap) end

    local meta = export_meta(snap, save_uid, files)

    -- manifest satırı EN SON yazılır: importer sadece manifest'teki
    -- snapshot'ları okur, böylece yarım yazılmış dosyalar hiç okunmaz.
    write_file("manifest.jsonl", json.encode({
        snapshot_id = snap, save_uid = save_uid, game_date = meta.game_date,
        exported_at = meta.exported_at, reason = reason, files = files,
    }) .. "\n", "a")

    log(string.format("Snapshot bitti: %s  (%d dosya, %.1f sn)", snap, #files, os.clock() - started))
    FCEXPORT_LAST_SNAPSHOT_DATE = meta.game_date
    return snap
end

-- Günlük hafif export: kullanıcının kadrosu + ligindeki takımların oyuncuları + izleme listesi. manifest'te
-- partial=true; importer bunu son tam snapshot'ın üzerine bindirir.
local function daily_player_ids()
    local ids, n = {}, 0
    local function add(pid) pid = int(pid); if pid > 0 and not ids[pid] then ids[pid] = true; n = n + 1 end end
    local user_team = int(try("GetUserTeamID") or 0)
    local league
    local links = read_rows("leagueteamlinks", { "teamid", "leagueid" }) or {}
    for _, r in ipairs(links) do if int(r.teamid) == user_team then league = int(r.leagueid) end end
    local in_league = {}
    for _, r in ipairs(links) do if league and int(r.leagueid) == league then in_league[int(r.teamid)] = true end end
    in_league[user_team] = true
    for _, r in ipairs(read_rows("teamplayerlinks", { "playerid", "teamid" }) or {}) do
        if in_league[int(r.teamid)] then add(r.playerid) end
    end
    local f = io.open(path(CONFIG.WATCHLIST_FILE), "r")
    if f then
        for line in f:lines() do local m = line:match("%d+"); if m then add(m) end end
        f:close()
    end
    return ids, n
end

local function take_daily_snapshot()
    local save_uid = try("GetSaveUID") or "unknown"
    local y, m, d = game_date()
    if y == 0 then log("Günlük export alınmadı: oyun tarihi okunamadı"); return nil end
    local snap = string.format("%s_%04d%02d%02d_%s_d", tostring(save_uid):sub(1, 8), y, m, d, os.date("%H%M%S"))
    local started = os.clock()
    local ids, count = daily_player_ids()
    local files, player_ids = {}, nil
    for _, tname in ipairs(CONFIG.DAILY_TABLES) do
        local n, rows = export_table(snap, tname, ids)
        if n then
            files[#files + 1] = tname
            if tname == "players" then player_ids = rows end
        end
    end
    if CONFIG.EXPORT_PLAYER_NAMES and export_player_names(snap, player_ids) > 0 then files[#files + 1] = "player_names" end
    local meta = export_meta(snap, save_uid, files)
    write_file("manifest.jsonl", json.encode({
        snapshot_id = snap, save_uid = save_uid, game_date = meta.game_date, exported_at = meta.exported_at,
        reason = "auto_day", partial = true, files = files,
    }) .. "\n", "a")
    log(string.format("Günlük export bitti: %s  (%d oyuncu, %.1f sn)", snap, count, os.clock() - started))
    FCEXPORT_LAST_DAILY_DATE = meta.game_date
    return snap
end

---------------------------------------------------------------------------
-- EVENT LOG
---------------------------------------------------------------------------
local LOGGED_IDS = {}
for _, name in ipairs(LOGGED_EVENTS) do
    local id = event_id_by_name(name)
    if id then LOGGED_IDS[id] = name end
end

local MONTH_PASSED_ID = event_id_by_name("MONTH_PASSED")
local DAY_PASSED_ID = event_id_by_name("DAY_PASSED")
local SAVE_IDS = {}
for _, n in ipairs({ "PREPARE_FOR_SAVE", "PREPARE_FOR_FIRST_SAVE" }) do
    local id = event_id_by_name(n)
    if id then SAVE_IDS[id] = true end
end

local SCHEDULES = { daily = true, weekly = true, monthly = true, quarterly = true }
local function export_schedule()
    local f = io.open(CONFIG.OUT_DIR .. "/" .. CONFIG.SCHEDULE_FILE, "r")
    if not f then return CONFIG.DEFAULT_SCHEDULE end
    local mode = (f:read("*l") or ""):match("^%s*(%a+)")
    f:close()
    return SCHEDULES[mode] and mode or CONFIG.DEFAULT_SCHEDULE
end

-- Aylık otomatik snapshot: MONTH_PASSED'da işaretlenir, sonraki ilk DAY_PASSED'da alınır. Son görülen event bir
-- kayıt hazırlığıysa bir sonraki güne ertelenir. Durum global: script yeniden çalıştırılınca kaybolmasın.
local function auto_snapshot(event_id)
    if not CONFIG.AUTO_SNAPSHOT_ON_MONTH then return end
    if event_id == MONTH_PASSED_ID then FCEXPORT_SNAPSHOT_PENDING = true end
    local saving = FCEXPORT_SAVING
    FCEXPORT_SAVING = SAVE_IDS[event_id] == true
    if event_id ~= DAY_PASSED_ID or not FCEXPORT_SNAPSHOT_PENDING or saving then return end
    if FCEXPORT_LAST_SNAPSHOT_DATE == game_date_str() then
        FCEXPORT_SNAPSHOT_PENDING = false
        return
    end
    if export_schedule() == "quarterly" then
        local _, month = game_date()
        if month % 3 ~= 1 then -- yalnız Ocak, Nisan, Temmuz, Ekim
            FCEXPORT_SNAPSHOT_PENDING = false
            return
        end
    end
    local ok, snap = pcall(take_snapshot, "auto_month")
    if not ok then log("Otomatik snapshot hata verdi: " .. tostring(snap)) end
    FCEXPORT_SNAPSHOT_PENDING = false
end

-- Günlük hafif export: her DAY_PASSED'da (kayıt hazırlığında değilken), günde bir kez; ay başı tam snapshot alındıysa atlanır.
local function auto_daily(event_id)
    if not CONFIG.AUTO_DAILY or event_id ~= DAY_PASSED_ID or FCEXPORT_SAVING then return end
    local mode = export_schedule()
    if mode ~= "daily" and mode ~= "weekly" then return end
    FCEXPORT_DAYS_SINCE_DAILY = (FCEXPORT_DAYS_SINCE_DAILY or 6) + 1
    if mode == "weekly" and FCEXPORT_DAYS_SINCE_DAILY < 7 then return end
    local today = game_date_str()
    if FCEXPORT_LAST_DAILY_DATE == today or FCEXPORT_LAST_SNAPSHOT_DATE == today then return end
    FCEXPORT_DAYS_SINCE_DAILY = 0
    local ok, snap = pcall(take_daily_snapshot)
    if not ok then log("Günlük export hata verdi: " .. tostring(snap)) end
end

-- Oturum başı tam snapshot: bu LE oturumunda bu kariyer için tam snapshot alınmadıysa ilk DAY_PASSED'da alınır.
local function auto_session(event_id)
    if not CONFIG.AUTO_SESSION_SNAPSHOT or event_id ~= DAY_PASSED_ID or FCEXPORT_SAVING then return end
    local uid = tostring(try("GetSaveUID"))
    if FCEXPORT_SESSION_UID == uid then return end
    FCEXPORT_SESSION_UID = uid
    if FCEXPORT_LAST_SNAPSHOT_DATE == game_date_str() then return end
    local ok, snap = pcall(take_snapshot, "auto_session")
    if not ok then log("Oturum snapshot'ı hata verdi: " .. tostring(snap)) end
end

function FCExport__OnCareerEvent(events_manager, event_id, event)
    auto_session(event_id)
    auto_snapshot(event_id)
    auto_daily(event_id)
    local name = LOGGED_IDS[event_id]
    if not name then return end

    if CONFIG.ENABLE_EVENT_LOG then
        local line = json.encode({
            save_uid = try("GetSaveUID"),
            game_date = game_date_str(),
            event = name,
            event_id = event_id,
            real_time = os.date("!%Y-%m-%dT%H:%M:%SZ"),
        })
        write_file("events.jsonl", line .. "\n", "a")
    end
end

---------------------------------------------------------------------------
-- MAIN
---------------------------------------------------------------------------
-- Kariyer dışında (ör. lua/autorun'dan menüde) snapshot alınmaz; yalnız handler sessizce kurulur ve ilk oyun
-- gününde oturum snapshot'ı alınır (AUTO_SESSION_SNAPSHOT).
local in_cm = try("IsInCM") ~= false
if not in_cm then
    log("Career Mode'da değilsin: handler kuruluyor, kariyerin ilk oyun gününde tam snapshot alınacak.")
end

-- Yazma testi (OUT_DIR yoksa erkenden uyar)
if not write_file("_write_test.txt", "ok " .. os.date() .. "\n") then
    log("OUT_DIR'e yazılamadı: " .. CONFIG.OUT_DIR)
    if type(MessageBox) == "function" then
        pcall(MessageBox, "FC Export", "OUT_DIR'e yazılamadı: " .. CONFIG.OUT_DIR .. "\nKlasörü oluştur ve tekrar dene.")
    end
    return
end

local snap
if in_cm then
    snap = take_snapshot("manual")
    if snap then FCEXPORT_SESSION_UID = tostring(try("GetSaveUID")) end
end

-- Handler oturum başına bir kez kaydedilir ve global FCExport__OnCareerEvent'i adıyla çağırır: script yeniden
-- çalıştırılınca (ör. güncellendikten sonra) yeni kod oyunu yeniden başlatmadan devreye girer.
if CONFIG.ENABLE_EVENT_LOG or CONFIG.AUTO_SNAPSHOT_ON_MONTH or CONFIG.AUTO_DAILY or CONFIG.AUTO_SESSION_SNAPSHOT then
    if not FCEXPORT_DISPATCH_REGISTERED then
        if type(AddEventHandler) == "function" then
            AddEventHandler("post__CareerModeEvent", function(...) return FCExport__OnCareerEvent(...) end)
            FCEXPORT_DISPATCH_REGISTERED = true
            local cnt = 0
            for _ in pairs(LOGGED_IDS) do cnt = cnt + 1 end
            log("Event log aktif (" .. cnt .. " event tipi izleniyor)")
            if cnt == 0 then
                log("UYARI: career event enum'ları bulunamadı (ENUM_FCEGameModesCM_EVENT_MSG_*). lua/libs/v2/imports/career_mode/enums.lua yüklenebiliyor mu?")
            end
        else
            log("UYARI: AddEventHandler yok, event log devre dışı")
        end
    else
        log("Event handler zaten kayıtlı (bu oturumda), yeni kod devrede")
    end
end

if in_cm and type(MessageBox) == "function" then
    pcall(MessageBox, "FC Export", snap and ("Snapshot tamam: " .. snap .. "\nKlasör: " .. CONFIG.OUT_DIR)
        or "Snapshot ALINMADI: oyun tarihi okunamadı. Live Editor log'undaki [FC-EXPORT] satırlarına bak.")
end
