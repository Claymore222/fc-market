--[[
  fc_stats_dump.lua  —  istatistik yöneticilerinin yakınındaki bellek dizilerini dosyaya döker (salt okuma)

  NE YAPAR
    SeasonStats, HistoricalStats, ProfileStats ve StatisticsView başlığındaki [başlangıç, bitiş] çiftlerini bulur,
    küçükten büyüğe okuyup C:/FCExport/stats_dump_*.bin dosyalarına yazar.
    Yöneticilerin başlık düzeni oturumlar arasında aynı kalmıyor; bu yüzden uzaklıklar sabit değil, her çalıştırmada aranır.

  RİSK: başlığın ötesindeki adresler okunur, oyun kapanabilir. ÖNCE KARİYERİ KAYDET.
  OYUNA YAZMAZ. Her dizi okunmadan önce log'a yazılır: oyun kapanırsa son satır hangi dizide kaldığını gösterir.
  Kariyer yüklüyken Lua Engine'den çalıştır. Log: C:/FCExport/fc_stats_dump.txt
]]

local OUT = "C:/FCExport/fc_stats_dump.txt"
local DIR = "C:/FCExport/stats_dump_"
local HEADER_BYTES = 0x300
local MIN_BYTES, MAX_BYTES = 1024, 512 * 1024
local CHUNK = 4096
local LINKED_BYTES = 0x1000

local out = io.open(OUT, "w")
local function w(s)
    if out then out:write(tostring(s), "\n") out:flush() end
    print("[FC-DUMP] " .. tostring(s))
end

pcall(require, "imports/career_mode/enums")
pcall(require, "imports/career_mode/helpers")

local MANAGERS = { { "SeasonStats", 102 }, { "HistoricalStats", 49 }, { "ProfileStats", 93 }, { "StatisticsView", 109 } }

local function ptr_ok(p) return type(p) == "number" and p > 0x10000 and p < 0x7FFF00000000 end

local function u64(bytes, offset)
    local v = 0
    for k = 7, 0, -1 do v = v * 256 + bytes[offset + k + 1] end
    return v
end

local function find_arrays()
    local found = {}
    for _, manager in ipairs(MANAGERS) do
        local ok, address = pcall(GetManagerObjByTypeId, manager[2])
        local read, bytes = false, nil
        if ok and ptr_ok(address) then read, bytes = pcall(ReadBytes, address, HEADER_BYTES) end
        if read and type(bytes) == "table" and #bytes == HEADER_BYTES then
            w(string.format("%s adres=0x%X", manager[1], address))
            for offset = 0, HEADER_BYTES - 16, 8 do
                local first, last = u64(bytes, offset), u64(bytes, offset + 8)
                local size = last - first
                if ptr_ok(first) and ptr_ok(last) and size >= MIN_BYTES and size <= MAX_BYTES then
                    found[#found + 1] = { name = manager[1], offset = offset, address = first, size = size }
                end
            end
            -- SeasonStats'ta +0x10 oturumlar arasında işaretçi olarak kalan tek alan.
            local linked = u64(bytes, 0x10)
            if manager[1] == "SeasonStats" and ptr_ok(linked) then
                found[#found + 1] = { name = manager[1] .. "Linked", offset = 0x10, address = linked, size = LINKED_BYTES }
            end
        else
            w(manager[1] .. " okunamadı")
        end
    end
    table.sort(found, function(a, b) return a.size < b.size end)
    return found
end

local function write_chunk(file, bytes)
    for i = 1, #bytes, 1024 do
        file:write(string.char((table.unpack or unpack)(bytes, i, math.min(i + 1023, #bytes))))
    end
end

local function dump(item)
    local path = string.format("%s%s_%03X.bin", DIR, item.name, item.offset)
    w(string.format("okunuyor %s +0x%03X 0x%X %d bayt", item.name, item.offset, item.address, item.size))
    local file = io.open(path, "wb")
    if not file then w("dosya açılamadı: " .. path) return end
    local done = 0
    while done < item.size do
        local count = math.min(CHUNK, item.size - done)
        local ok, bytes = pcall(ReadBytes, item.address + done, count)
        if not ok or type(bytes) ~= "table" or #bytes == 0 then
            w("   okuma durdu: " .. tostring(done))
            break
        end
        write_chunk(file, bytes)
        file:flush()
        done = done + #bytes
    end
    file:close()
    w("   yazıldı: " .. tostring(done) .. " bayt")
end

w("fc_stats_dump 0.1.0 — " .. os.date("%Y-%m-%d %H:%M:%S"))
if type(GetManagerObjByTypeId) ~= "function" or type(ReadBytes) ~= "function" then
    w("GetManagerObjByTypeId/ReadBytes yok")
else
    if type(GetUserTeamID) == "function" then w("takım: " .. tostring(select(2, pcall(GetUserTeamID)))) end
    local arrays = find_arrays()
    w("dizi: " .. #arrays)
    for _, item in ipairs(arrays) do
        local ok, err = pcall(dump, item)
        if not ok then w("HATA: " .. tostring(err)) end
    end
end
w("— bitti —")
if out then out:close() end
if type(MessageBox) == "function" then pcall(MessageBox, "FC Stats Dump", "Bitti.\n" .. OUT) end
