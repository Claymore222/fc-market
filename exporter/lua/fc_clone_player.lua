--[[
  fc_clone_player.lua — bir oyuncunun "kopyası": hedef oyuncunun players kaydındaki tüm alanlar kaynak oyuncununkiyle
  değiştirilir (yüz, saç, vücut tipi, koşu/hızlanma tipi, boy, kilo, ayak, özellikler, potansiyel, oyun stilleri ...).
  Hedefin kimliği korunur: playerid, ad alanları, sözleşme ve kulüp (başka tablolar) aynı kalır. Yaş YEARS_YOUNGER ile.

  Kurallar (CLAUDE.md / docs/career-mods.md): yeni oyuncu satırı EKLENMEZ (InsertDBTableRow yok); yalnız players
  tablosuna LE'nin tablo API'siyle (SetRecordFieldValue) yazılır; kadro/sözleşme tablolarına yazılmaz.

  Kullanım (kariyer yüklüyken, F8 → Lua Engine):
    1) SOURCE_ID ve TARGET_ID'yi yaz, DRY_RUN = true ile çalıştır → C:/FCExport/mods/clone_<tarih>.csv'de değişecek alanlar.
    2) DRY_RUN = false ile tekrar çalıştır → uygular, eski değerleri C:/FCExport/mods/clone_restore_<hedef>.lua'ya yazar.
    3) Geri almak için RESTORE = true ile çalıştır (TARGET_ID aynı).
  Hedef olarak önemsiz bir oyuncu seç (örn. altyapı ya da yedek); onun eski hali yalnız geri alma dosyasında kalır.
]]

local CONFIG = {
    SOURCE_ID = 0,          -- kopyalanacak oyuncu (ör. 246420)
    TARGET_ID = 0,          -- üzerine yazılacak oyuncu
    YEARS_YOUNGER = 0,      -- 0: kaynakla aynı yaş; 10: kaynaktan 10 yaş genç (eksi değer yaşlı)
    DRY_RUN = true,
    RESTORE = false,
    OUT_DIR = "C:/FCExport/mods",
}

-- Hedefte korunacak alanlar (kimlik ve sözleşme). Diğer tüm players alanları kaynaktan kopyalanır.
local KEEP = {
    playerid = true, firstnameid = true, lastnameid = true, commonnameid = true, playerjerseynameid = true,
    contractvaliduntil = true, playerjointeamdate = true, birthdate = true,
}

local function log(msg) print("[FC-CLONE] " .. tostring(msg)) end
local function int(v) return math.tointeger(tonumber(v or 0) or 0) or 0 end
local function name(pid)
    if type(GetPlayerName) ~= "function" then return "?" end
    local ok, n = pcall(GetPlayerName, pid)
    return ok and tostring(n) or "?"
end

local tbl = LE and LE.db and LE.db:GetTable("players")
if not tbl or type(tbl.fields) ~= "table" then
    log("players tablosu okunamadı (kariyer yüklü mü?)")
    return
end

local function find(pid)
    local rec = tbl:GetFirstRecord()
    while rec and rec > 0 do
        if int(tbl:GetRecordFieldValue(rec, "playerid")) == pid then return rec end
        rec = tbl:GetNextValidRecord()
    end
    return nil
end

local function fields()
    local list = {}
    for f in pairs(tbl.fields) do list[#list + 1] = f end
    table.sort(list)
    return list
end

local target = find(CONFIG.TARGET_ID)
if not target then
    log("Hedef oyuncu bulunamadı: " .. tostring(CONFIG.TARGET_ID))
    return
end
local restore_file = CONFIG.OUT_DIR .. "/clone_restore_" .. CONFIG.TARGET_ID .. ".lua"

if CONFIG.RESTORE then
    local ok, before = pcall(dofile, restore_file)
    if not ok or type(before) ~= "table" then
        log("Geri alma dosyası yok: " .. restore_file)
        return
    end
    local n = 0
    for f, v in pairs(before) do
        if tbl.fields[f] then tbl:SetRecordFieldValue(target, f, v); n = n + 1 end
    end
    os.remove(restore_file)
    log(string.format("Geri alındı: %s (%d) %d alan eski haline döndü.", name(CONFIG.TARGET_ID), CONFIG.TARGET_ID, n))
    if type(MessageBox) == "function" then pcall(MessageBox, "FC Clone", "Geri alındı: " .. n .. " alan") end
    return
end

local source = find(CONFIG.SOURCE_ID)
if not source then
    log("Kaynak oyuncu bulunamadı: " .. tostring(CONFIG.SOURCE_ID))
    return
end
if CONFIG.SOURCE_ID == CONFIG.TARGET_ID then
    log("Kaynak ve hedef aynı oyuncu.")
    return
end

-- Değişiklik listesi
local changes, before = {}, {}
for _, f in ipairs(fields()) do
    if not KEEP[f] then
        local new, old = tbl:GetRecordFieldValue(source, f), tbl:GetRecordFieldValue(target, f)
        if new ~= old then changes[#changes + 1] = { f, old, new } end
        before[f] = old
    end
end
-- Yaş: doğum tarihi gün sayısı (1582-10-14'ten). AGE yoksa kaynağın doğum tarihi.
local src_birth, tgt_birth = int(tbl:GetRecordFieldValue(source, "birthdate")), int(tbl:GetRecordFieldValue(target, "birthdate"))
local new_birth = src_birth + math.floor((CONFIG.YEARS_YOUNGER or 0) * 365.25)
before.birthdate = tgt_birth
if new_birth ~= tgt_birth then changes[#changes + 1] = { "birthdate", tgt_birth, new_birth } end

-- Rapor
local stamp = os.date("%Y%m%d_%H%M%S")
local lines = { "kaynak;hedef;alan;eski;yeni" }
for _, c in ipairs(changes) do
    lines[#lines + 1] = string.format("%d;%d;%s;%s;%s", CONFIG.SOURCE_ID, CONFIG.TARGET_ID, c[1], tostring(c[2]), tostring(c[3]))
end
local out = io.open(CONFIG.OUT_DIR .. "/clone_" .. stamp .. ".csv", "w")
if out then out:write(table.concat(lines, "\n")); out:close() end
log(string.format("%s (%d) → %s (%d): %d alan değişecek%s", name(CONFIG.SOURCE_ID), CONFIG.SOURCE_ID, name(CONFIG.TARGET_ID),
    CONFIG.TARGET_ID, #changes, CONFIG.DRY_RUN and " [DRY-RUN, yazılmadı]" or ""))
for i = 1, math.min(#changes, 40) do log("  " .. changes[i][1] .. ": " .. tostring(changes[i][2]) .. " → " .. tostring(changes[i][3])) end

if CONFIG.DRY_RUN then
    if type(MessageBox) == "function" then
        pcall(MessageBox, "FC Clone", string.format("DRY-RUN: %d alan değişecek.\nRapor: %s/clone_%s.csv\nUygulamak için DRY_RUN = false.",
            #changes, CONFIG.OUT_DIR, stamp))
    end
    return
end

-- Geri alma dosyası (yazmadan önce)
local rf = io.open(restore_file, "w")
if not rf then
    log("Geri alma dosyası yazılamadı, değişiklik yapılmadı: " .. restore_file)
    return
end
rf:write("return {\n")
for f, v in pairs(before) do rf:write(string.format("  [%q] = %s,\n", f, tostring(int(v)))) end
rf:write("}\n")
rf:close()

for _, c in ipairs(changes) do tbl:SetRecordFieldValue(target, c[1], c[3]) end
log("UYGULANDI. Geri almak için RESTORE = true.")
if type(MessageBox) == "function" then
    pcall(MessageBox, "FC Clone", string.format("Uygulandı: %d alan.\nGeri alma: RESTORE = true (dosya %s)", #changes, restore_file))
end
