--[[
  fc_memprobe.lua  —  kariyer yöneticilerinin bellekteki başlıklarını okur (salt okuma, GÜVENLİ mod)

  NE YAPAR
    LE'nin kendi kütüphanesindeki yöntemle (imports/career_mode/helpers.lua) GetManagerObjByTypeId(id) ile ceza, hedef,
    puan tablosu, takvim vb. yöneticilerin adresini alır ve YALNIZ bu nesnenin ilk 0x180 baytını okur. İçindeki
    [başlangıç, bitiş] işaretçi çiftleri dizi adayı olarak raporlanır ama TAKİP EDİLMEZ (geçersiz adres oyunu çökertebilir;
    fc_diagnose.lua'nın ilk sürümü bu yüzden çöktü). Bir sonraki adımda yalnız doğrulanmış diziler okunur.

  OYUNDA HİÇBİR ŞEYİ DEĞİŞTİRMEZ. ÇIKTI: C:/FCExport/fc_memprobe.txt (her satır anında yazılır)
  Kariyer yüklüyken Lua Engine'den çalıştır.
]]

local OUT = "C:/FCExport/fc_memprobe.txt"
local out = io.open(OUT, "w")
local function w(s)
    if out then out:write(tostring(s), "\n") out:flush() end
    print("[FC-MEMPROBE] " .. tostring(s))
end

local TARGETS = { {114, "Suspension"}, {98, "SeasonObjective"}, {94, "ManagerModeSeasonObjective"}, {132, "CompetitionObjectives"},
    {133, "ClubObjectives"}, {146, "Objective"}, {100, "ObjectivesHistory"}, {108, "StandingsView"}, {102, "SeasonStats"},
    {60, "ManagerHistory"}, {128, "Trophy"}, {24, "Calendar"}, {20, "ActiveCompetitions"}, {46, "Fixture"},
    {48, "PreSeasonTour"}, {43, "Finance"}, {50, "IniSettings"}, {67, "NextMatch"}, {129, "User"}, {96, "Scout"} }

local function ptr_ok(p) return type(p) == "number" and p > 0x10000 and p < 0x7FFF00000000 end

w("fc_memprobe 0.1.0 — " .. os.date("%Y-%m-%d %H:%M:%S"))
if type(GetManagerObjByTypeId) ~= "function" or type(ReadBytes) ~= "function" then
    w("GetManagerObjByTypeId/ReadBytes yok")
else
    for _, t in ipairs(TARGETS) do
        local ok, mgr = pcall(GetManagerObjByTypeId, t[1])
        if not ok or not ptr_ok(mgr) then
            w(string.format("%-26s id=%3d yok (%s)", t[2], t[1], tostring(mgr)))
        else
            local okb, bytes = pcall(ReadBytes, mgr, 0x180)
            if not okb or type(bytes) ~= "table" then
                w(string.format("%-26s id=%3d adres=0x%X okunamadı", t[2], t[1], mgr))
            else
                w(string.format("%-26s id=%3d adres=0x%X", t[2], t[1], mgr))
                local hex = {}
                for i = 1, #bytes do hex[#hex + 1] = string.format("%02x", bytes[i]) end
                for row = 0, #bytes - 1, 32 do
                    w(string.format("   +0x%03X %s", row, table.concat(hex, " ", row + 1, math.min(row + 32, #bytes))))
                end
                -- işaretçi çiftleri (takip edilmez)
                local function q(i) -- i: 0 tabanlı bayt konumu
                    local v = 0
                    for k = 7, 0, -1 do v = v * 256 + bytes[i + k + 1] end
                    return v
                end
                for off = 0, #bytes - 16, 8 do
                    local b, e = q(off), q(off + 8)
                    if ptr_ok(b) and ptr_ok(e) and e > b and e - b <= 8 * 1024 * 1024 then
                        w(string.format("   dizi adayı +0x%03X: 0x%X..0x%X (%d bayt)", off, b, e, e - b))
                    end
                end
            end
        end
    end
end
w("— bitti —")
if out then out:close() end
if type(MessageBox) == "function" then pcall(MessageBox, "FC MemProbe", "Bitti.\n" .. OUT) end
