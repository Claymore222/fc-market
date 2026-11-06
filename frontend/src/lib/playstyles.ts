// Oyun stilleri: kısa açıklama (kendi metnimiz) ve LE önerisi için anahtar özellik eşikleri.
// Adlar config/field-map.json playStyles etiketleriyle aynı. Eşikler tahmini (oyunun kuralı değil); öneri yalnız yol gösterir,
// uygulama oyuna yazmaz: oyun stili LE → Oyuncu Editörü'nden elle eklenir.

export interface PlayStyleInfo {
  en: string
  desc: string
  /** Önerinin dayandığı özellikler ve eşikleri */
  needs: [string, number][]
  /** Ek koşul (ör. beceri yıldızı) */
  skillMoves?: number
  goalkeeper?: boolean
}

export const PLAY_STYLES: Record<string, PlayStyleInfo> = {
  'Plase şut': { en: 'Finesse Shot', desc: 'Kavisli, köşeye yerleştirilen şutlar daha hızlı ve isabetli.', needs: [['finishing', 80], ['curve', 80]] },
  'Aşırtma şut': { en: 'Chip Shot', desc: 'Kaleciyi aşırtmaya çalışan vuruşlar daha isabetli.', needs: [['finishing', 80], ['composure', 80]] },
  'Sert şut': { en: 'Power Shot', desc: 'Ceza sahası dışından çok sert ve hızlı şutlar.', needs: [['shotpower', 86], ['longshots', 80]] },
  'Duran top': { en: 'Dead Ball', desc: 'Serbest vuruş ve kornerlerde daha keskin, isabetli toplar.', needs: [['freekickaccuracy', 82], ['curve', 80]] },
  'İsabetli kafa': { en: 'Precision Header', desc: 'Güçten çok yön ve isabetle vurulan kafalar.', needs: [['headingaccuracy', 82], ['jumping', 75]] },
  'Akrobatik': { en: 'Acrobatic', desc: 'Röveşata, makas gibi akrobatik vuruş ve uzaklaştırmalar.', needs: [['agility', 85], ['volleys', 80]] },
  'Yerden sert şut': { en: 'Low Driven Shot', desc: 'Yerden giden, sert ve isabetli şutlar.', needs: [['shotpower', 82], ['finishing', 80]] },
  'Fark yaratan': { en: 'Gamechanger', desc: 'Sıra dışı, yaratıcı bitirici vuruşlar.', needs: [['finishing', 84], ['composure', 84]], skillMoves: 4 },
  'Keskin pas': { en: 'Incisive Pass', desc: 'Savunmayı yaran, koşu yoluna atılan ara paslar.', needs: [['vision', 82], ['shortpassing', 82]] },
  'Hızlı pas': { en: 'Pinged Pass', desc: 'Yerden hızlı ve sert pas.', needs: [['shortpassing', 85], ['longpassing', 78]] },
  'Uzun top': { en: 'Long Ball Pass', desc: 'Uzun ve havadan atılan paslar daha isabetli.', needs: [['longpassing', 85]] },
  'Tiki taka': { en: 'Tiki Taka', desc: 'Tek dokunuşla kısa ve isabetli paslar.', needs: [['shortpassing', 85], ['agility', 80]] },
  'Kavisli orta': { en: 'Whipped Pass', desc: 'Kanattan sert ve kavisli ortalar.', needs: [['crossing', 85], ['curve', 80]] },
  'Yaratıcı': { en: 'Inventive', desc: 'Topuk, rabona gibi yaratıcı paslar.', needs: [['vision', 84], ['ballcontrol', 84]], skillMoves: 4 },
  'Jokey': { en: 'Jockey', desc: 'Rakibi karşılarken daha çevik ve dengeli.', needs: [['defensiveawareness', 82], ['agility', 75]] },
  'Blok': { en: 'Block', desc: 'Şut ve pasları uzanarak daha kolay keser.', needs: [['defensiveawareness', 82], ['standingtackle', 80]] },
  'Pas arası': { en: 'Intercept', desc: 'Pas arasına girme ve topu kazanma daha etkili.', needs: [['interceptions', 86]] },
  'Önsezi': { en: 'Anticipate', desc: 'Ayakta müdahalelerde topu daha temiz alır.', needs: [['standingtackle', 86]] },
  'Kayarak müdahale': { en: 'Slide Tackle', desc: 'Kayarak müdahalelerde topu daha sık kazanır.', needs: [['slidingtackle', 86]] },
  'Hava hakimi': { en: 'Aerial Fortress', desc: 'Hava toplarında savunmada üstün.', needs: [['jumping', 85], ['headingaccuracy', 78], ['strength', 80]] },
  'Teknik': { en: 'Technical', desc: 'Dripling sırasında daha sıkı ve hassas top kontrolü.', needs: [['dribbling', 86], ['ballcontrol', 86]] },
  'Süratli': { en: 'Rapid', desc: 'Topla sürat koşusunda daha hızlı ve kontrollü.', needs: [['sprintspeed', 88], ['dribbling', 80]] },
  'İlk dokunuş': { en: 'First Touch', desc: 'Topu ilk dokunuşta daha temiz alır.', needs: [['ballcontrol', 88]] },
  'Hilebaz': { en: 'Trickster', desc: 'Çalım hareketlerini daha etkili yapar.', needs: [['agility', 86], ['dribbling', 82]], skillMoves: 4 },
  'Baskıya dayanıklı': { en: 'Press Proven', desc: 'Baskı altında topu korumada daha iyi.', needs: [['ballcontrol', 84], ['composure', 84], ['strength', 70]] },
  'Çabuk adım': { en: 'Quick Step', desc: 'Daha patlayıcı ilk adım ve hızlanma.', needs: [['acceleration', 90]] },
  'Yorulmaz': { en: 'Relentless', desc: 'Maç boyunca daha az yorulur, daha çabuk toparlanır.', needs: [['stamina', 88]] },
  'Uzun taç': { en: 'Long Throw', desc: 'Taç atışlarını daha uzağa atar.', needs: [['strength', 78], ['longpassing', 78]] },
  'Sert': { en: 'Bruiser', desc: 'İkili mücadelelerde rakibi daha kolay omuzlar.', needs: [['strength', 88], ['aggression', 80]] },
  'Koruyucu': { en: 'Enforcer', desc: 'Fiziksel mücadelede topu korur, düşmez.', needs: [['strength', 85], ['balance', 75]] },
  'Uzağa atış': { en: 'Far Throw', desc: 'Kaleci elle çok uzağa ve isabetli atar.', needs: [['gkkicking', 80]], goalkeeper: true },
  'Ayak hakimiyeti': { en: 'Footwork', desc: 'Kaleci ayakla kurtarışlarda daha başarılı.', needs: [['gkreflexes', 86]], goalkeeper: true },
  'Orta kesici': { en: 'Cross Claimer', desc: 'Kaleci ortaları daha güvenle tutar.', needs: [['gkhandling', 85], ['jumping', 70]], goalkeeper: true },
  'Kaleden çıkış': { en: 'Rush Out', desc: 'Kaleci kalesinden daha hızlı ve isabetli çıkar.', needs: [['gkpositioning', 85], ['reactions', 80]], goalkeeper: true },
  'Uzun uzanma': { en: 'Far Reach', desc: 'Kaleci uzak köşelere daha iyi uzanır.', needs: [['gkdiving', 87]], goalkeeper: true },
  'Çelici': { en: 'Deflector', desc: 'Kaleci tutamadığı şutları güvenli yöne çeler.', needs: [['gkreflexes', 84], ['gkhandling', 80]], goalkeeper: true },
}

export interface StyleSuggestion { name: string; info: PlayStyleInfo; score: number; plus: boolean }

/**
 * LE ile eklenebilecek oyun stilleri: oyuncuda olmayan ve anahtar özellikleri eşiği geçenler (en iyi 4); oyun stili olup
 * özellikleri eşiğin 6 puan üstünde olanlar için oyun stili+ yükseltmesi.
 */
export function suggestPlayStyles(attrs: Record<string, number | null | undefined>, owned: string[], plus: string[],
  goalkeeper: boolean, skillMoves: number | null | undefined): StyleSuggestion[] {
  const out: StyleSuggestion[] = []
  for (const [name, info] of Object.entries(PLAY_STYLES)) {
    if (!!info.goalkeeper !== goalkeeper || plus.includes(name)) continue
    if (info.skillMoves && (skillMoves ?? 0) < info.skillMoves) continue
    const margins = info.needs.map(([k, min]) => (attrs[k] ?? 0) - min)
    if (margins.some(m => m < 0)) continue
    const score = margins.reduce((a, b) => a + b, 0) / margins.length
    const has = owned.includes(name)
    if (has && score < 6) continue
    out.push({ name, info, score, plus: has })
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 4)
}
