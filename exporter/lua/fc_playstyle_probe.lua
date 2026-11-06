--[[
  fc_playstyle_probe.lua  —  oyunun PlayStyle kurallarını CSV'ye yazar (salt okuma)

  NE YAPAR
    playstyle_attribute_requirement ve ilgili tabloları C:/FCExport/ps_<tablo>.csv dosyalarına çıkarır.
    Yıldız aday script'i EA'nın özellik eşiklerini buradan öğrenecek (docs/star-prospects-playstyles-plan-2026-11-01.md).

  OYUNDA HİÇBİR ŞEYİ DEĞİŞTİRMEZ. Belleğe doğrudan erişmez, yalnız LE'nin tablo okumasını kullanır.
  Kariyer yüklüyken Lua Engine'den çalıştır. Özet: C:/FCExport/fc_playstyle_probe.txt
]]

local OUT_DIR = "C:/FCExport/"
local TABLES = { "playstyle_attribute_requirement", "playstyles", "signature_playstyles", "signatureabilitymap", "signature_perks",
    "perks", "specialization_perks", "attributecategorymap", "attribute_strengths", "archetypes" }
local MAX_ROWS = 20000

local out = io.open(OUT_DIR .. "fc_playstyle_probe.txt", "w")
local function w(s)
    if out then out:write(tostring(s), "\n") out:flush() end
    print("[FC-PLAYSTYLE] " .. tostring(s))
end

local function open_table(name)
    if type(LE) ~= "table" or type(LE.db) ~= "table" then return nil end
    local ok, tbl = pcall(LE.db.GetTable, LE.db, name)
    if ok and type(tbl) == "table" and type(tbl.fields) == "table" then return tbl end
    return nil
end

local function cell(value)
    local text = tostring(value == nil and "" or value)
    if text:find('[",\n]') then return '"' .. text:gsub('"', '""') .. '"' end
    return text
end

-- TABLE nesnesi iterasyon durumunu paylaşıyor; tablolar sırayla okunur.
local function dump(name)
    local tbl = open_table(name)
    if not tbl then w(name .. ": açılamadı") return end
    local fields = {}
    for field in pairs(tbl.fields) do fields[#fields + 1] = field end
    table.sort(fields)
    local file = io.open(OUT_DIR .. "ps_" .. name .. ".csv", "w")
    if not file then w(name .. ": dosya açılamadı") return end
    file:write(table.concat(fields, ","), "\n")
    local count, rec = 0, tbl:GetFirstRecord()
    while rec and rec > 0 and count < MAX_ROWS do
        local row = {}
        for i, field in ipairs(fields) do
            local ok, value = pcall(tbl.GetRecordFieldValue, tbl, rec, field)
            row[i] = cell(ok and value or "")
        end
        file:write(table.concat(row, ","), "\n")
        count = count + 1
        rec = tbl:GetNextValidRecord()
    end
    file:close()
    w(string.format("%-34s %6d satır, alanlar: %s", name, count, table.concat(fields, ", ")))
end

w("fc_playstyle_probe 0.1.0 — " .. os.date("%Y-%m-%d %H:%M:%S"))
for _, name in ipairs(TABLES) do
    local ok, err = pcall(dump, name)
    if not ok then w(name .. " HATA: " .. tostring(err)) end
end
w("— bitti —")
if out then out:close() end
if type(MessageBox) == "function" then pcall(MessageBox, "FC PlayStyle Probe", "Bitti.\n" .. OUT_DIR .. "fc_playstyle_probe.txt") end
