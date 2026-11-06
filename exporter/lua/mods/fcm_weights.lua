-- ÜRETİLDİ: tools/gen_fcm_weights.py <- config/position-ratings.json, config/field-map.json. Elle düzenleme.
return {
    -- preferredposition1 kodu -> etiket
    positions = {
        [0] = "GK",
        [3] = "RB",
        [5] = "CB",
        [7] = "LB",
        [10] = "CDM",
        [12] = "RM",
        [14] = "CM",
        [16] = "LM",
        [18] = "CAM",
        [23] = "RW",
        [25] = "ST",
        [27] = "LW",
    },
    -- pozisyon etiketi -> { özellik = ağırlık } (normalize edilmemiş)
    weights = {
        GK = { gkdiving = 0.21, gkhandling = 0.21, gkkicking = 0.05, gkreflexes = 0.21, gkpositioning = 0.21, reactions = 0.11 },
        CB = { defensiveawareness = 0.17, standingtackle = 0.14, slidingtackle = 0.13, interceptions = 0.13, headingaccuracy = 0.1, strength = 0.1, aggression = 0.07, reactions = 0.05, jumping = 0.03, shortpassing = 0.05, ballcontrol = 0.04 },
        LB = { slidingtackle = 0.14, interceptions = 0.12, defensiveawareness = 0.11, standingtackle = 0.11, crossing = 0.09, stamina = 0.08, reactions = 0.08, sprintspeed = 0.07, ballcontrol = 0.07, shortpassing = 0.07, acceleration = 0.05, headingaccuracy = 0.04 },
        RB = { slidingtackle = 0.14, interceptions = 0.12, defensiveawareness = 0.11, standingtackle = 0.11, crossing = 0.09, stamina = 0.08, reactions = 0.08, sprintspeed = 0.07, ballcontrol = 0.07, shortpassing = 0.07, acceleration = 0.05, headingaccuracy = 0.04 },
        LWB = { crossing = 0.12, slidingtackle = 0.11, interceptions = 0.12, standingtackle = 0.08, defensiveawareness = 0.07, stamina = 0.1, sprintspeed = 0.06, acceleration = 0.04, reactions = 0.08, ballcontrol = 0.08, dribbling = 0.04, shortpassing = 0.1 },
        RWB = { crossing = 0.12, slidingtackle = 0.11, interceptions = 0.12, standingtackle = 0.08, defensiveawareness = 0.07, stamina = 0.1, sprintspeed = 0.06, acceleration = 0.04, reactions = 0.08, ballcontrol = 0.08, dribbling = 0.04, shortpassing = 0.1 },
        CDM = { shortpassing = 0.14, interceptions = 0.14, defensiveawareness = 0.14, standingtackle = 0.12, longpassing = 0.1, ballcontrol = 0.1, reactions = 0.07, stamina = 0.06, slidingtackle = 0.05, aggression = 0.05, strength = 0.04, vision = 0.04 },
        CM = { shortpassing = 0.17, ballcontrol = 0.14, longpassing = 0.13, vision = 0.13, reactions = 0.08, dribbling = 0.07, positioning = 0.06, stamina = 0.06, interceptions = 0.05, standingtackle = 0.05, longshots = 0.04, composure = 0.02 },
        LM = { dribbling = 0.15, ballcontrol = 0.13, shortpassing = 0.11, crossing = 0.1, positioning = 0.08, acceleration = 0.07, reactions = 0.07, vision = 0.07, sprintspeed = 0.06, finishing = 0.06, stamina = 0.05, longshots = 0.05 },
        RM = { dribbling = 0.15, ballcontrol = 0.13, shortpassing = 0.11, crossing = 0.1, positioning = 0.08, acceleration = 0.07, reactions = 0.07, vision = 0.07, sprintspeed = 0.06, finishing = 0.06, stamina = 0.05, longshots = 0.05 },
        CAM = { shortpassing = 0.16, ballcontrol = 0.15, vision = 0.14, dribbling = 0.13, positioning = 0.09, reactions = 0.07, finishing = 0.07, longshots = 0.05, shotpower = 0.05, acceleration = 0.04, agility = 0.03, composure = 0.02 },
        LW = { dribbling = 0.16, ballcontrol = 0.14, finishing = 0.1, crossing = 0.09, shortpassing = 0.09, positioning = 0.09, acceleration = 0.07, reactions = 0.07, sprintspeed = 0.06, vision = 0.06, longshots = 0.04, agility = 0.03 },
        RW = { dribbling = 0.16, ballcontrol = 0.14, finishing = 0.1, crossing = 0.09, shortpassing = 0.09, positioning = 0.09, acceleration = 0.07, reactions = 0.07, sprintspeed = 0.06, vision = 0.06, longshots = 0.04, agility = 0.03 },
        CF = { ballcontrol = 0.15, dribbling = 0.14, positioning = 0.13, finishing = 0.11, reactions = 0.09, shortpassing = 0.09, vision = 0.08, shotpower = 0.05, acceleration = 0.05, sprintspeed = 0.05, longshots = 0.04, headingaccuracy = 0.02 },
        ST = { finishing = 0.18, positioning = 0.13, headingaccuracy = 0.1, shotpower = 0.1, ballcontrol = 0.1, reactions = 0.08, dribbling = 0.07, sprintspeed = 0.05, strength = 0.05, shortpassing = 0.05, acceleration = 0.04, longshots = 0.03, volleys = 0.02 },
    },
    -- tüm özellikler ve kaleci özellikleri (saha oyuncusunda yükseltilmez)
    attributes = {
        "acceleration", "sprintspeed", "finishing", "shotpower", "longshots", "volleys", "penalties", "positioning", "shortpassing", "longpassing", "vision", "crossing", "freekickaccuracy", "curve", "dribbling", "ballcontrol", "agility", "balance", "reactions", "composure", "defensiveawareness", "standingtackle", "slidingtackle", "interceptions", "headingaccuracy", "strength", "stamina", "jumping", "aggression", "gkdiving", "gkhandling", "gkkicking", "gkreflexes", "gkpositioning"
    },
    -- özellik grupları (field-map attributeGroups): grup adı -> özellikler
    groups = {
        ["Hız"] = { "acceleration", "sprintspeed" },
        ["Şut"] = { "finishing", "shotpower", "longshots", "volleys", "penalties", "positioning" },
        ["Pas"] = { "shortpassing", "longpassing", "vision", "crossing", "freekickaccuracy", "curve" },
        ["Top sürme"] = { "dribbling", "ballcontrol", "agility", "balance", "reactions", "composure" },
        ["Savunma"] = { "defensiveawareness", "standingtackle", "slidingtackle", "interceptions", "headingaccuracy" },
        ["Fizik"] = { "strength", "stamina", "jumping", "aggression" },
        ["Kaleci"] = { "gkdiving", "gkhandling", "gkkicking", "gkreflexes", "gkpositioning" },
    },
    goalkeeper = {
        "gkdiving", "gkhandling", "gkkicking", "gkreflexes", "gkpositioning"
    },
}
