--[[
  fcm_star_duzelt.lua — devam eden kariyeri güncel yıldız aday kurallarına çeker. Tek script, iki adım:

    1. Adaylar (fcm_star_prospects.lua, MODE "tune"): POT ve özellikler gerçek oyuncu sınırlarına gelir.
       Aday listesi ve OVR değişmez, oyuncunun kariyerdeki gelişimi silinmez.
    2. PlayStyle (fcm_star_playstyles.lua): daha önce verilenler yok sayılır, yeni kurallarla yeniden seçilir. Kadro gençleri eklenir.

  DRY_RUN = true iken hiçbir şey yazılmaz, sonuç raporlara yazılır: C:/FCExport/m0/star_prospects.txt ve star_playstyles.txt
  Önce kariyeri kaydet ve yedekle. Yazdıktan sonra kaydet → çık → yükle.
]]
local DRY_RUN = true

FCM_DIR = "C:/FC 27 LE v27.1.6/lua/scripts/"
FCM_PREVIEW = {}
FCM_RUN = { dry_run = DRY_RUN, mode = "tune" }
dofile(FCM_DIR .. "fcm_star_prospects.lua")
FCM_RUN = { dry_run = DRY_RUN, mode = "apply", rebuild = true }
dofile(FCM_DIR .. "fcm_star_playstyles.lua")
FCM_RUN, FCM_PREVIEW = nil, nil
