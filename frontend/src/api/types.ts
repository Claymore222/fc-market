// Backend DTO'ları (FcMarket.Api, camelCase JSON).

export interface SnapshotInfo {
  snapshotId: string
  saveUid: string
  gameDate: string
  seasonEndYear: number
  exportedAt: string | null
  userTeamId: number | null
  userTeamName: string | null
  transferBudget: number | null
  wageBudget: number | null
  /** Kariyer dalı (kopya slot / eski kayda dönüş); eski veritabanında null. */
  branch: number | null
  /** API'de saveUid parametresine verilecek anahtar: "save" ya da "save@dal". */
  careerKey: string | null
  source?: 'export' | 'save' | 'daily'
  revision?: number
}

export interface MarketPlayer {
  id: number
  name: string
  age: number | null
  birthDate: string | null
  position: string | null
  position2: string | null
  positions?: string[]
  positionGroup: string | null
  overall: number | null
  potential: number | null
  ovrDelta: number | null
  growthPerMonth: number | null
  nationId: number | null
  nation: string | null
  /** ISO 3166 iki harfli ülke kodu (bayrak) */
  nationCode: string | null
  clubId: number | null
  club: string | null
  /** Serbest oyuncu: aktif sözleşme/maaş boş; kaynak tutar recordedWage alanındadır. */
  isFreeAgent: boolean
  leagueId: number | null
  league: string | null
  footCode: number | null
  foot: string | null
  height: number | null
  weight: number | null
  skillMoves: number | null
  weakFoot: number | null
  wage: number | null
  /** Kaynaktaki tutar; serbest oyuncuda aktif sözleşme/maaş talebi değildir. */
  recordedWage?: number | null
  contractEnd: number | null
  contractYearsLeft: number | null
  value: number | null
  opportunity: number | null
  /** Kart değerleri (tahmini, field-map cardStats) */
  pace: number | null
  shooting: number | null
  passing: number | null
  dribbling: number | null
  defending: number | null
  physical: number | null
  /** Kayıttaki doğrudan GK özellikleri; eski API'de alan bulunmayabilir. */
  gkDiving?: number | null
  gkHandling?: number | null
  gkKicking?: number | null
  gkReflexes?: number | null
  gkPositioning?: number | null
}

export interface PagedPlayers {
  snapshot: SnapshotInfo
  total: number
  page: number
  pageSize: number
  items: MarketPlayer[]
}

export interface IdOption { id: number; name: string; count: number }
export interface ClubOption extends IdOption { leagueId: number | null }

export interface FilterOptions {
  roles?: IdOption[]
  playStyles?: IdOption[]
  playStylesPlus?: IdOption[]
  snapshot: SnapshotInfo
  leagues: IdOption[]
  clubs: ClubOption[]
  nations: IdOption[]
  positions: { label: string; group: string | null; count: number }[]
  positionGroups: { key: string; positions: string[] }[]
  feet: { code: number | null; label: string; count: number }[]
  ranges: {
    age: [number, number] | null
    overall: [number, number] | null
    potential: [number, number] | null
    contractEnd: [number, number] | null
    maxValue: number | null
  }
}

export interface ValueBreakdown {
  /** Maaş çarpanı (wage / referans)^esneklik; maaş bilinmiyorsa 1 */
  wageMultiplier?: number
  wage?: number | null
  referenceWage?: number
  wageElasticity?: number
  /** Yaş eğrisi (ageRule = curve) */
  peakAge?: number
  ageDeclinePerYear?: number
  youthPremiumPerYear?: number
  value: number | null
  overall: number | null
  base: number | null
  ageMultiplier: number
  ageRule: 'young' | 'band' | 'curve' | 'unknown'
  ageBandMin: number | null
  ageBandMax: number | null
  contractMultiplier: number
  contractYearsLeft: number | null
  positionMultiplier: number
  position: string | null
  baseValue: number
  baseOverall: number
  exponent: number
  youngMaxAge: number
  youngPotentialFactor: number
  youngMaxMultiplier: number
  roundTo: number
}

export type OpportunityKey = 'growthRoom' | 'growthRate' | 'contract' | 'age'

export interface OpportunityBreakdown {
  score: number | null
  components: { key: OpportunityKey; weight: number; score: number | null; raw: number | null }[]
}

export interface AttributeGroup {
  name: string
  score: number | null
  attributes: { key: string; label: string; value: number | null }[]
}

export interface RegenCandidate { id: number; name: string; age: number | null; position: string | null; overall: number | null; potential: number | null; club: string | null; confidence: string }
export interface RegenMatch { id: number; name: string; birthDate: string | null; nation: string | null; nationCode: string | null; position: string | null; overall: number | null; potential: number | null; candidates: RegenCandidate[] }
export interface RegenReport { baselineDate: string | null; departed: number; matches: RegenMatch[] }

/** Kariyer kaydındaki son maçlardan biri */
export interface RecentMatch { date: string; competition?: string | null; minutes: number; rating: number }

export interface StatLine {
  competitionId: number | null
  /** Yarışma adı */
  competition?: string | null
  /** Dakika (kariyer kaydından) */
  minutes?: number | null
  appearances: number | null
  goals: number | null
  assists: number | null
  ratingSum: number | null
  averageRating: number | null
  yellow: number | null
  red: number | null
  cleanSheets: number | null
  motm: number | null
}

export interface PlayerDetail {
  seasonReference?: { overall: number | null; currentOverall: number | null } | null
  matchRatings?: { date: string | null; minutes: number | null; rating: number | null }[]
  snapshot: SnapshotInfo
  player: MarketPlayer
  value: ValueBreakdown
  opportunity: OpportunityBreakdown
  attributeGroups: AttributeGroup[]
  /** Özelliklerden hesaplanan pozisyon genelleri (ana pozisyon OVR'a kalibre). */
  positionRatings: { position: string; rating: number | null }[]
  /** Yerel faces/ klasöründe görseli var mı (GET /api/players/{id}/face). */
  hasFace: boolean
  contract: { wage: number | null; endYear: number | null; yearsLeft: number | null }
  /** source "save": kariyer kaydındaki bu sezon; "export": oyunun başlangıç verisi (kariyer öncesi) */
  stats: { total: StatLine; competitions: StatLine[]; source?: 'save' | 'export'; recent?: RecentMatch[] } | null
  /** Detaydaki 7 özellik başlığı (Hücum, Beceri, Hareket, Güç, Zihinsel, Savunma, Kaleci); eski API'de yok. */
  attributeCategories?: AttributeGroup[]
  profile?: PlayerProfile
}

export interface PlayerProfile {
  releaseClause: number | null
  joinDate: string | null
  /** Uluslararası ün, 1–5 */
  internationalRep: number | null
  jersey: number | null
  /** Taktik roller (players.role1..9); level 2 = "++" */
  roles?: PlayerRole[]
  playStyles?: string[]
  /** Oyun stili+ (icontrait) */
  playStylesPlus?: string[]
  /** Oyun stili adı → grup (shooting, passing, defending, ballControl, physical, goalkeeper) */
  styleCategories?: Record<string, string>
  /** Özelliklerden tahmin: Patlayıcı / Kontrollü / Uzun */
  accelerationType?: string | null
  bodyType?: string | null
  emotion?: string | null
  growthProfile?: string | null
  retiring?: boolean | null
  equipment?: { bootType: number | null; bootDesign: number | null; bootColor1: number | null; bootColor2: number | null; gloveType: number | null }
  lastTransfer?: { amount: number; date: string; fromTeamId: number; fromClub: string | null; toTeamId: number; toClub: string | null; snapshotId: string } | null
}

export interface PlayerRole {
  code: number
  name: string
  position: string | null
  level: number
}

export interface HistoryPoint {
  snapshotId: string
  gameDate: string
  overall: number | null
  potential: number | null
  clubId: number | null
  club: string | null
  clubChanged: boolean
}

export interface SaveInfo {
  saveUid: string
  userTeamId: number | null
  userTeamName: string | null
  snapshotCount: number
  firstGameDate: string
  lastGameDate: string
  latest: SnapshotInfo
  branches: BranchInfo[]
}

export interface BranchInfo {
  branch: number
  careerKey: string
  parentBranch: number | null
  forkDate: string | null
  snapshotCount: number
  firstGameDate: string
  lastGameDate: string
  lastExportedAt: string | null
  reason: string | null
  /** Son okunan disk kaydının dalı; disk işaretçisi yoksa en son gözlemlenen dal. */
  active: boolean
  slots?: { title: string; fileName: string; gameDate: string | null }[] | null
}

export interface Health {
  status: 'ok' | 'degraded' | 'error'
  checkedAt: string
  database: { path: string; ok: boolean; error: string | null; snapshotCount: number; saveCount: number; eventCount: number }
  latestSnapshot: SnapshotInfo | null
  fieldMap: { path: string; error: string | null; warnings: string[] }
}

export interface SyncInfo {
  current: SnapshotInfo | null
  saved: SnapshotInfo | null
  pendingExport: SnapshotInfo | null
  issues: { fileName: string; message: string }[]
  warnings?: { fileName: string; message: string }[]
}

export interface ShortlistItem {
  playerId: number
  /** Güncel ad; oyuncu artık yoksa eklendiği andaki ad */
  name: string
  note: string | null
  tags: string[]
  targetPrice: number | null
  addedAt: string
  addedSnapshotId: string | null
  addedGameDate: string | null
  addedOverall: number | null
  addedPotential: number | null
  addedClubId: number | null
  addedClub: string | null
  /** Son snapshot'taki hali; emekli/silindiyse null */
  player: MarketPlayer | null
  overallChange: number | null
  clubChanged: boolean
}

export interface ShortlistView {
  snapshot: SnapshotInfo
  items: ShortlistItem[]
  count: number
  targetPriceTotal: number
}

export type FeedType = 'transfer' | 'growth' | 'decline' | 'potential' | 'contract' | 'retired' | 'new' | 'event'

export interface FeedItem {
  date: string
  type: FeedType
  playerId: number | null
  playerName: string | null
  fromClubId: number | null
  fromClub: string | null
  /** transfer/new: yeni kulüp; diğerleri: oyuncunun kulübü */
  toClubId: number | null
  toClub: string | null
  leagueId: number | null
  league: string | null
  before: number | null
  after: number | null
  shortlisted: boolean
  userTeam: boolean
  /** type = event: event adı (ör. INJURY) */
  event: string | null
  count: number
  /** Yalnızca transfer: türü (kayıttan çıkarım) */
  kind?: 'permanent' | 'loan' | 'loanReturn' | 'free' | 'released' | null
  fee?: number | null
  wage?: number | null
  releaseClause?: number | null
  season?: string | null
}

export interface FeedResponse {
  snapshot: SnapshotInfo
  snapshotCount: number
  total: number
  items: FeedItem[]
  userLeagueId: number | null
  seasons?: string[]
  currentSeason?: string | null
}

// --- Kulüp (Home / Squad) ---------------------------------------------------
export interface ClubInfo {
  id: number
  name: string
  leagueId: number | null
  league: string | null
  overall: number | null
  attack: number | null
  midfield: number | null
  defense: number | null
  clubWorth: number | null
  buildUpPlay: number | null
  defensiveDepth: number | null
  domesticPrestige: number | null
  internationalPrestige: number | null
  stadiumCapacity: number | null
  foundationYear: number | null
  leagueTitles: number | null
  domesticCups: number | null
  clWins: number | null
  elWins: number | null
  eclWins: number | null
  rivalTeamId: number | null
  rivalTeam: string | null
  youthDevelopment: number | null
  color1: string | null
  color2: string | null
  popularity?: number | null
  /** Oyun kurma tarzı etiketi (field-map buildUpPlayLabels) */
  buildUpPlayLabel?: string | null
}

/** competitionId: kupa görseli için lig kimliği ya da yarışma kodu (/api/competitions/{id}/trophy) */
export interface TrophyWon { trophy: string; count: number; competitionId?: number | null }
export interface CareerSpan {
  snapshots: number
  firstGameDate: string
  seasonsTracked: number
  /** Bu kulüpte kazanılanlar: sezon arşivinden ("archive") ya da kulüp sayaçlarının artışından ("counters"; kariyerde güncellenmiyor) */
  trophiesWon: TrophyWon[]
  previousSnapshotDate: string | null
  trophiesSource?: "archive" | "counters"
}
export interface LeagueMove { teamId: number; team: string; leagueId: number; league: string | null; fromLeagueId: number; fromLeague: string | null; promoted: boolean }
export interface LeagueLeader { leagueId: number; league: string | null; teamId: number; team: string | null }
export interface WorldInfo { moves: LeagueMove[]; leaders: LeagueLeader[]; leadersFromLastSeason?: boolean }

export interface Standing {
  teamId: number
  team: string
  position: number | null
  points: number | null
  played: number | null
  won: number | null
  drawn: number | null
  lost: number | null
  goalsFor: number | null
  goalsAgainst: number | null
  previousPosition: number | null
  isUser: boolean
}

export type SquadRole = 'XI' | 'Sub' | 'Reserve' | 'Unknown' | 'LoanedOut'

export interface SquadMember {
  player: MarketPlayer
  jersey: number | null
  role: SquadRole
  /** İlk 11 diziliş yeri (RCB, LDM ...) */
  slot: string | null
  slotRating: number | null
  /** Oyunun form değeri (1–5, ölçek doğrulanacak) */
  form: number | null
  injured: boolean
  loanFromTeamId: number | null
  loanEnd: string | null
  /** Bu sezon maç / dakika / ortalama puan (maç puanı geçmişi varsa) */
  appearances?: number | null
  minutes?: number | null
  averageRating?: number | null
  /** Kariyer kaydındaki moral (yalnız kullanıcı takımı) */
  morale?: PlayerMorale | null
  /** Kondisyon ve sakatlık (kariyer kaydı); kayıt bloğu yoksa null */
  fitness?: PlayerFitness | null
}

/** Moral ve oyunun hesapladığı bileşenler (0–100); temperament 0 çok sakin … 4 çok asabi; events oyunun moral olayları. */
/** severity 3 = ağır, phase 3 = fizyoterapi (doğrulandı); diğer kodlar DOĞRULANACAK */
export interface PlayerFitness {
  value: number
  injured: boolean
  severity: number | null
  phase: number | null
  expectedReturn: string | null
  daysToFit: number | null
  injuryType: number | null
}

export interface PlayerMorale {
  value: number
  temperament: number | null
  teamPerformance: number | null
  playerPerformance: number | null
  contract: number | null
  playingTime: number | null
  events: string[]
}

export interface FixtureRow {
  id: number | null
  date: string
  time: string | null
  homeTeamId: number | null
  homeTeam: string | null
  awayTeamId: number | null
  awayTeam: string | null
  competitionId: number | null
  isHome: boolean
  homeLeaguePosition: number | null
  awayLeaguePosition: number | null
  /** Skor (yalnız kariyer kaydından; oynanmamışsa null) */
  homeGoals?: number | null
  awayGoals?: number | null
  competition?: string | null
  round?: number | null
}

export interface AcademyPlayer { player: MarketPlayer; tier: number | null; potentialVariance: number | null; monthsInSquad: number | null }

/** Ana takım gözlemcisi (kariyer kaydı); coverNation yalnız işe alınmışlarda */
export interface NetworkScout { name: string; coverNationId: number | null; coverNation: string | null; coverCode: string | null
  nationId: number | null; nation: string | null; nationCode: string | null; experience: number | null; judgement: number | null }
/** Yönetim hedefi: kind 0 lig, 1 yerel kupa, 2 kıtasal; basamak 0–17 (17 = kazan) */
export interface BoardObjective { competitionId: number; competition: string | null; kind: number; target: number | null; stretch: number | null; minimum: number | null }
/** Menajer karnesi (kariyer kaydı); wage haftalık, earnings kariyer toplamı (EUR); difficulty 0–6 */
export interface ManagerInfo { wage: number | null; earnings: number | null; season: number | null; difficulty: number | null; halfLength: number | null
  biggestWin: RecordMatch | null; biggestLoss: RecordMatch | null }
/** Kart birikimi/ceza (kariyer kaydı); competitionKey ham kod, anlamı doğrulanmadı */
export interface DisciplineRow { playerId: number; name: string; yellows: number; ban: number; competitionKey: number }
export interface ScoutNetwork { newScoutsDate: string | null; hired: NetworkScout[]; available: NetworkScout[] }
/** Hazırlık turnuvası daveti; prize EUR, key oyunun cm_pst_* anahtarı */
export interface PreseasonInvite { competitionId: number; key: string; entered: boolean; prize: number; teams: string[] }
export interface Preseason { confirmedDate: string | null; invites: PreseasonInvite[] }

export interface ScoutInfo { id: number; name: string; experience: number | null; knowledge: number | null; nation: string | null; nationCode: string | null; region: number | null; nationId?: number | null }

export interface SetPiece { role: string; playerId: number; name: string; overall: number | null }

export interface SquadSummary {
  players: number
  averageAge: number | null
  squadValue: number
  wages: number | null
  bestXiAverage: number | null
  expiringThisSeason: number
}

export interface ClubView {
  records?: CareerRecords | null
  snapshot: SnapshotInfo
  club: ClubInfo
  /** Kariyer kaydındaki lig yarışması kimliği; club.leagueId ile aynı kod sistemi değildir. */
  leagueCompetitionId?: number | null
  standing: Standing | null
  table: Standing[]
  /** Puan durumu sayıları tutarlı mı; değilse yalnızca sıra gösterilir. */
  tableConsistent: boolean
  /** Lig tablosu oyunda güncellenmiyor: sıra/puan yok, satırlar geçen sezon sırasına göre */
  tableStale?: boolean
  squad: SquadMember[]
  setPieces: SetPiece[]
  summary: SquadSummary
  /** Kayıtlı tüm takım fikstürü (export veya kariyer kaydından) */
  fixtures?: FixtureRow[]
  academy?: AcademyPlayer[]
  scouts?: ScoutInfo[]
  scoutNetwork?: ScoutNetwork | null
  preseason?: Preseason | null
  objectives?: BoardObjective[] | null
  manager?: ManagerInfo | null
  discipline?: DisciplineRow[] | null
  career?: CareerSpan
  world?: WorldInfo
  /** Kulüp bütçesi ve son finans hareketleri (kariyer kaydı, EUR); yalnız kullanıcı kulübü */
  finance?: ClubFinance | null
  /** Bu sezonun maç karnesi (tüm yarışmalar, hazırlık dahil) */
  seasonRecord?: SeasonRecord | null
  /** Aynı dalın her sezonundaki son kayıt; her satır belirtilen tarihe kadar kısmi gözlemdir. */
  observedSeasons?: { seasonEndYear: number; asOf: string; snapshotId: string; teamId: number; record: SeasonRecord }[]
  managerCareer?: { snapshotId: string; asOf: string; seasons: ManagerSeason[]; played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number } | null
}

export interface ManagerSeason {
  index: number; seasonEndYear: number; teamId: number | null; team: string | null; leagueId: number | null
  position: number | null; objective: string | null; objectiveStatus: string | null; played: number; won: number; drawn: number; lost: number
  goalsFor: number; goalsAgainst: number; points: number | null; jobSecurity: number | null; biggestBuy: string | null; biggestSale: string | null; completed: boolean
  /** Sezonda kazanılan lig/yerel/kıtasal kupa (yerel ve kıtasal DOĞRULANACAK) ve en pahalı alım/satış bonservisi (EUR) */
  leagueTitles?: number | null; domesticCups?: number | null; continentalCups?: number | null
  biggestBuyFee?: number | null; biggestSaleFee?: number | null
}

export interface SeasonRecord {
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  biggestWin: RecordMatch | null
  biggestLoss: RecordMatch | null
}

export interface RecordMatch {
  date: string
  opponentId: number | null
  opponent: string | null
  for: number
  against: number
  competition: string | null
}

export interface ClubFinance {
  categories?: { kind: number; label: string | null; income: number; expense: number }[] | null
  transferBudgetStart: number | null
  transferBudget: number | null
  /** Sezonluk maaş bütçesi ve kalanı (her hafta maaş kadar azalır) */
  wageBudget: number | null
  wageBudgetLeft: number | null
  /** Haftalık maaş boşluğu */
  wageHeadroom: number | null
  transactions: FinanceTransaction[]
}

/** amount: gelir artı, gider eksi; label yoksa tür kodu gösterilir */
export interface FinanceTransaction {
  date: string
  kind: number | null
  label: string | null
  amount: number
}

export interface CareerRecords {
  hasTeamOfWeek: boolean
  hasPlayerAwards: boolean
  hasManagerAwards: boolean
  teamOfWeek: { playerId: number; name: string; rating: number | null; weeks: number | null; month: number | null }[]
  playerAwards: { playerId: number; name: string; teamId: number | null; type: number | null; season: number | null; count: number | null }[]
  managerAwards: { teamId: number | null; type: number | null; season: number | null; count: number | null; date: string | null }[]
}

export interface TeamRow {
  id: number
  name: string
  leagueId: number | null
  league: string | null
  overall: number | null
  attack: number | null
  midfield: number | null
  defense: number | null
  color1: string | null
  color2: string | null
  players: number
  averageAge: number | null
  squadValue: number
  /** En yüksek OVR'lı 11 oyuncunun ortalaması */
  bestXi: number | null
  bestPlayerId: number
  bestPlayer: string
  bestPlayerOverall: number | null
  isUser: boolean
}

export interface TeamsView { snapshot: SnapshotInfo; teams: TeamRow[] }
