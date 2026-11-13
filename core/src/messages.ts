/**
 * AUTO-GENERATED FROM core/asyncapi.yaml. DO NOT EDIT MANUALLY.
 *
 * Run `npm run asyncapi:generate` to regenerate.
 *
 * Source of truth: the yaml at core/asyncapi.yaml.
 * Editors and clients in any language can consume the spec directly.
 */

export type ServerMessage =
  | ProviderCapabilities
  | AgentCreated
  | AgentClosed
  | AgentSelected
  | ExistingAgents
  | AgentStatus
  | AgentToolStart
  | AgentToolDone
  | AgentToolsClear
  | AgentToolPermission
  | AgentToolPermissionClear
  | AgentAttention
  | SubagentToolStart
  | SubagentToolDone
  | SubagentClear
  | SubagentToolPermission
  | AgentTeamInfo
  | AgentContextUsage
  | LayoutLoaded
  | OfficesLoaded
  | OfficeAccess
  | FurnitureAssetsLoaded
  | CharacterSpritesLoaded
  | PetSpritesLoaded
  | FloorTilesLoaded
  | WallTilesLoaded
  | CarpetTilesLoaded
  | SettingsLoaded
  | HooksStatus
  | HooksConsentRequest
  | ExternalAssetDirectoriesUpdated
  | AreaMappingsLoaded
  | WorkspaceFolders
  | AgentDiagnostics
  | MusicNowPlaying
  | MusicStatus
  | MusicLyrics
  | PlaylistStatus
  | UsageStatus
  | HerdrTabLabels
  | GithubStatus
  | ConcertsStatus
  | AgendaStatus
  | JardinStatus
  | PomodoroStatus
  | PerfilStatus
  | SearchRoomStatus
  | ConnectionsStatus
  | OfertasStatus
  | OfertasResults
  | OfertasAsistenteEstado
  | OfertasAsistenteResultado
  | DecksStatus
  | DecksSearchResults
  | DecksCardInfo
  | DecksImportResult;

export type ClientMessage =
  | WebviewReady
  | LaunchAgent
  | FocusAgent
  | CloseAgent
  | SaveAgentSeats
  | SaveLayout
  | SetSoundEnabled
  | SetLastSeenVersion
  | SetAlwaysShowLabels
  | SetGhostHeadlessAgents
  | SetShadowsEnabled
  | SetOwnerEnabled
  | SetParticlesEnabled
  | SetDayNightMode
  | SetHooksEnabled
  | HooksConsentResponse
  | SetHooksInfoShown
  | SetWatchAllSessions
  | ExportLayout
  | ImportLayout
  | OpenSessionsFolder
  | AddExternalAssetDirectory
  | RemoveExternalAssetDirectory
  | SaveAreaMappings
  | SetShowAreas
  | RequestDiagnostics
  | SetMusicEnabled
  | InstallMusicExtension
  | MusicControl
  | DisconnectSpotify
  | PlaylistCommand
  | RefreshConcerts
  | SearchConcerts
  | AddConcert
  | DisconnectGoogle
  | RefreshAgenda
  | AddAgendaItem
  | CompleteAgendaTask
  | AgendaPlanAction
  | SetAgendaPlanPrefs
  | RefreshJardin
  | SaveJardinPlant
  | DeleteJardinPlant
  | MarkJardinCare
  | SaveJardinSupply
  | DeleteJardinSupply
  | ResolveJardinInbox
  | RemoveJardinPhoto
  | StartPomodoro
  | PausePomodoro
  | ResumePomodoro
  | StopPomodoro
  | CreateSearchRequest
  | LaunchSearchAgent
  | MarkSearchResult
  | DeleteSearchRequest
  | SaveSearchCriteria
  | ScheduleSearchResult
  | SearchOfertas
  | SaveOfertasWatch
  | DeleteOfertasWatch
  | CheckOfertas
  | SetOfertasSettings
  | MarkOfertasAlertsSeen
  | OfertasAsistenteInvestigar
  | OfertasAsistenteSimilares
  | OfertasAsistenteCancelar
  | SetOfertasAsistente
  | DecksOpen
  | DecksSearch
  | DecksCards
  | DecksSave
  | DecksDelete
  | DecksImport;

export interface ProviderCapabilities {
  type: 'providerCapabilities';
  readingTools: string[];
  subagentToolNames: string[];
}

export interface AgentCreated {
  type: 'agentCreated';
  id: number;
  folderName?: string;
  profile?: string;
  isExternal?: boolean;
  palette?: number;
  hueShift?: number;
}

export interface AgentClosed {
  type: 'agentClosed';
  id: number;
}

export interface AgentSelected {
  type: 'agentSelected';
  id: number;
}

export interface ExistingAgents {
  type: 'existingAgents';
  agents: number[];
  agentMeta: Record<string, AgentSeatMeta>;
  folderNames: Record<string, string>;
  profiles?: Record<string, string>;
  externalAgents: Record<string, boolean>;
}

export interface AgentSeatMeta {
  palette?: number;
  hueShift?: number;
  seatId?: string;
}

export interface AgentStatus {
  type: 'agentStatus';
  id: number;
  status: AgentActivityStatus;
  awaitingInput?: boolean;
}

export type AgentActivityStatus = 'active' | 'thinking' | 'waiting';

export interface AgentToolStart {
  type: 'agentToolStart';
  id: number;
  toolId: string;
  status: string;
  toolName?: string;
  permissionActive?: boolean;
  runInBackground?: boolean;
  isTeammateSpawn?: boolean;
}

export interface AgentToolDone {
  type: 'agentToolDone';
  id: number;
  toolId: string;
  failed?: boolean;
}

export interface AgentToolsClear {
  type: 'agentToolsClear';
  id: number;
}

export interface AgentToolPermission {
  type: 'agentToolPermission';
  id: number;
}

export interface AgentToolPermissionClear {
  type: 'agentToolPermissionClear';
  id: number;
}

export interface AgentAttention {
  type: 'agentAttention';
  id: number;
  estado: AgentAttentionState;
  motivo: string;
  desde: number;
  detalle?: string;
}

export type AgentAttentionState = 'trabajando' | 'esperandote' | 'atorado' | 'fallo' | 'termino';

export interface SubagentToolStart {
  type: 'subagentToolStart';
  id: number;
  parentToolId: string;
  toolId: string;
  status: string;
}

export interface SubagentToolDone {
  type: 'subagentToolDone';
  id: number;
  parentToolId: string;
  toolId: string;
}

export interface SubagentClear {
  type: 'subagentClear';
  id: number;
  parentToolId: string;
}

export interface SubagentToolPermission {
  type: 'subagentToolPermission';
  id: number;
  parentToolId: string;
}

export interface AgentTeamInfo {
  type: 'agentTeamInfo';
  id: number;
  teamName?: string;
  agentName?: string;
  isTeamLead?: boolean;
  leadAgentId?: number;
  teamUsesTmux?: boolean;
}

export interface AgentContextUsage {
  type: 'agentContextUsage';
  id: number;
  contextTokens: number;
  maxContextTokens: number;
}

export interface LayoutLoaded {
  type: 'layoutLoaded';
  layout: Record<string, any> | null;
  wasReset?: boolean;
}

export interface OfficesLoaded {
  type: 'officesLoaded';
  current: string;
  floor?: string;
  mainFloors?: FloorInfo[];
  mainLabel?: string;
  mainTitle?: string;
  offices: OfficeInfo[];
}

export interface FloorInfo {
  id: string;
  level: number;
  button?: string;
  label: string;
  roof?: boolean;
}

export interface OfficeInfo {
  id: string;
  label: string;
  title?: string;
  profiles: string[];
  alsoInMain?: string[];
  mainProfile?: string;
  floors?: FloorInfo[];
}

export interface OfficeAccess {
  type: 'officeAccess';
  privileged: boolean;
}

export interface FurnitureAssetsLoaded {
  type: 'furnitureAssetsLoaded';
  catalog: FurnitureAssetMessage[];
  sprites: Record<string, string[][]>;
}

export interface FurnitureAssetMessage {
  id: string;
  name: string;
  label: string;
  category: string;
  file: string;
  width: number;
  height: number;
  footprintW: number;
  footprintH: number;
  isDesk: boolean;
  canPlaceOnWalls: boolean;
  groupId?: string;
  canPlaceOnSurfaces?: boolean;
  backgroundTiles?: number;
  orientation?: string;
  state?: string;
  mirrorSide?: boolean;
  rotationScheme?: string;
  animationGroup?: string;
  frame?: number;
}

export interface CharacterSpritesLoaded {
  type: 'characterSpritesLoaded';
  characters: CharacterSpriteSet[];
  names?: Record<string, number>;
  owner?: OwnerSheet;
}

export interface CharacterSpriteSet {
  down: string[][][];
  up: string[][][];
  right: string[][][];
}

export interface OwnerSheet {
  sheet: number;
  name?: string;
  emotes?: OwnerEmote[];
}

export interface OwnerEmote {
  id: string;
  frames: string[][][];
  fps: number;
  loops: number;
  idle?: boolean;
}

export interface PetSpritesLoaded {
  type: 'petSpritesLoaded';
  pets: PetSpriteFrameSet[];
  petNames: string[];
  petLightColors?: string[];
}

export interface PetSpriteFrameSet {
  walkDown: string[][][];
  idleDown: string[][][];
  walkUp: string[][][];
  idleUp: string[][][];
  walkRight: string[][][];
}

export interface FloorTilesLoaded {
  type: 'floorTilesLoaded';
  sprites: string[][][];
}

export interface WallTilesLoaded {
  type: 'wallTilesLoaded';
  sets: string[][][][];
}

export interface CarpetTilesLoaded {
  type: 'carpetTilesLoaded';
  sets: string[][][][];
}

export interface SettingsLoaded {
  type: 'settingsLoaded';
  soundEnabled: boolean;
  lastSeenVersion: string;
  extensionVersion: string;
  watchAllSessions: boolean;
  alwaysShowLabels: boolean;
  ghostHeadlessAgents: boolean;
  hooksEnabled: boolean;
  hooksInfoShown: boolean;
  externalAssetDirectories: string[];
  showAreas: boolean;
  shadowsEnabled: boolean;
  particlesEnabled: boolean;
  dayNightMode: DayNightMode;
  ownerEnabled?: boolean;
}

export type DayNightMode = 'auto' | 'day' | 'night';

export interface HooksStatus {
  type: 'hooksStatus';
  providerId: string;
  installed: boolean;
}

export interface HooksConsentRequest {
  type: 'hooksConsentRequest';
  providerId: string;
  headline: string;
  disclosure: string;
}

export interface ExternalAssetDirectoriesUpdated {
  type: 'externalAssetDirectoriesUpdated';
  dirs: string[];
}

export interface AreaMappingsLoaded {
  type: 'areaMappingsLoaded';
  mappings: Record<string, string[]>;
}

export interface WorkspaceFolders {
  type: 'workspaceFolders';
  folders: WorkspaceFolder[];
}

export interface WorkspaceFolder {
  name: string;
  path: string;
}

export interface AgentDiagnostics {
  type: 'agentDiagnostics';
  agents: Record<string, any>[];
}

export interface MusicNowPlaying {
  type: 'musicNowPlaying';
  track?: MusicTrack;
}

export interface MusicTrack {
  title: string;
  artist: string;
  album?: string;
  cover?: string;
  isPaused: boolean;
  positionMs: number;
  durationMs: number;
  device?: string;
}

export interface MusicStatus {
  type: 'musicStatus';
  enabled: boolean;
  spicetifyFound: boolean;
  extensionInstalled: boolean;
  controls?: boolean;
  token?: string;
  message?: string;
  spotifyConfigured?: boolean;
  spotifyConnected?: boolean;
  source?: AnonymousSchema_260;
}

export type AnonymousSchema_260 = 'extension' | 'spotify';

export interface MusicLyrics {
  type: 'musicLyrics';
  title?: string;
  artist?: string;
  loading?: boolean;
  synced?: boolean;
  instrumental?: boolean;
  source?: AnonymousSchema_267;
  lines?: MusicLyricLine[];
}

export type AnonymousSchema_267 = 'spotify' | 'lrclib';

export interface MusicLyricLine {
  text: string;
  timeMs?: number;
}

export interface PlaylistStatus {
  type: 'playlistStatus';
  configured: boolean;
  connected: boolean;
  needsReconnect: boolean;
  busy?: PlaylistBusy;
  error?: string;
  note?: string;
  playlists: PlaylistSource[];
  artists: PlaylistArtist[];
  recipes: PlaylistRecipe[];
  preview?: PlaylistPreview;
  lists: PlaylistDay[];
  rejected: PlaylistSong[];
  autoPlay: boolean;
  editing?: PlaylistEditing;
  found?: PlaylistSong[];
  proposal?: PlaylistProposal;
}

export type PlaylistBusy =
  | 'sources'
  | 'preview'
  | 'creating'
  | 'deleting'
  | 'loading'
  | 'searching'
  | 'saving'
  | 'improving';

export interface PlaylistSource {
  id: string;
  name: string;
  count?: number;
}

export interface PlaylistArtist {
  id: string;
  name: string;
}

export interface PlaylistRecipe {
  id: string;
  name: string;
  top: boolean;
  liked: boolean;
  surprise: boolean;
  playlists: string[];
  artists: PlaylistArtist[];
  decades: number[];
  minutes: number;
  discover: boolean;
  avoidRecent: boolean;
}

export interface PlaylistPreview {
  recipeName: string;
  request?: string;
  origin?: string;
  targetMs: number;
  totalMs: number;
  songs: PlaylistSong[];
}

export interface PlaylistSong {
  uri: string;
  title: string;
  artist: string;
  album?: string;
  year?: number;
  durationMs: number;
  discover?: boolean;
}

export interface PlaylistDay {
  id: string;
  name: string;
  day: string;
  kept: boolean;
  count: number;
  totalMs: number;
  url?: string;
  madeWith?: string;
  missing?: boolean;
}

export interface PlaylistEditing {
  id: string;
  name: string;
  songs: PlaylistSong[];
}

export interface PlaylistProposal {
  id: string;
  label: string;
  remove: PlaylistSong[];
  add: PlaylistSong[];
  totalMs: number;
  note?: string;
}

export interface UsageStatus {
  type: 'usageStatus';
  profiles: UsageProfile[];
}

export interface UsageProfile {
  profile: string;
  updatedAt?: string;
  fiveHour?: UsageLimit;
  sevenDay?: UsageLimit;
  otherLimits?: UsageNamedLimit[];
  sessions: UsageSession[];
}

export interface UsageLimit {
  pct: number;
  resetsAt?: string;
}

export interface UsageNamedLimit {
  key: string;
  pct: number;
  resetsAt?: string;
}

export interface UsageSession {
  id: string;
  folder?: string;
  model?: string;
  costUsd?: number;
  tokens?: number;
  contextPct?: number;
  updatedAt?: string;
}

export interface HerdrTabLabels {
  type: 'herdrTabLabels';
  labels: Record<string, string>;
}

export interface GithubStatus {
  type: 'githubStatus';
  login: string;
  totalRepos: number;
  repos: GithubRepo[];
  pullRequests: GithubPullRequest[];
  weeks: number[][];
  updatedAt: string;
}

export interface GithubRepo {
  name: string;
  url: string;
  private: boolean;
  pushedAt?: string;
  stars: number;
  commits: number;
  openPullRequests: number;
}

export interface GithubPullRequest {
  repo: string;
  number: number;
  title: string;
  url: string;
  author?: string;
}

export interface ConcertsStatus {
  type: 'concertsStatus';
  googleConfigured: boolean;
  googleConnected: boolean;
  reconnectInDays?: number;
  ticketmasterConfigured: boolean;
  concerts: CalendarConcert[];
  found: FoundConcert[];
  searching: boolean;
  error?: string;
}

export interface CalendarConcert {
  id: string;
  title: string;
  artist: string;
  start: string;
  allDay: boolean;
  location?: string;
  link?: string;
}

export interface FoundConcert {
  id: string;
  artist: string;
  name: string;
  start: string;
  allDay: boolean;
  venue?: string;
  city?: string;
  url?: string;
}

export interface AgendaStatus {
  type: 'agendaStatus';
  connected: boolean;
  from: string;
  days: number;
  items: AgendaItem[];
  saving: boolean;
  error?: string;
  calendars?: AgendaCalendar[];
  sharedCalendar?: string;
  homeCalendar?: string;
  plan?: AgendaPlan;
}

export interface AgendaItem {
  id: string;
  kind: AgendaItemKind;
  title: string;
  start?: string;
  end?: string;
  allDay: boolean;
  location?: string;
  link?: string;
  calendar?: string;
  busy?: boolean;
  list?: string;
  listName?: string;
}

export type AgendaItemKind = 'event' | 'task';

export interface AgendaCalendar {
  id: string;
  name: string;
  color?: string;
  writable: boolean;
  busyOnly: boolean;
}

export interface AgendaPlan {
  days: AgendaPlanDay[];
  leftover: AgendaPlanLeftover[];
  prefs: AgendaPlanPrefs;
}

export interface AgendaPlanDay {
  day: string;
  blocks: AgendaPlanBlock[];
  minutes: number;
}

export interface AgendaPlanBlock {
  id: string;
  start: string;
  end: string;
  startsAt: string;
  minutes: number;
  title: string;
  why: string;
  tasks: AgendaPlanTask[];
  round?: boolean;
  quick?: boolean;
  part?: number;
  parts?: number;
}

export interface AgendaPlanTask {
  id: string;
  title: string;
  minutes: number;
  source: AgendaPlanMinutesSource;
  listName?: string;
}

export type AgendaPlanMinutesSource = 'manual' | 'mark' | 'rule' | 'default';

export interface AgendaPlanLeftover {
  title: string;
  minutes: number;
  why: string;
  tasks: AgendaPlanTask[];
}

export interface AgendaPlanPrefs {
  blockMinutes: number;
  dailyBlocks: number;
  smallMinutes: number;
  marginMinutes: number;
  soonDays: number;
  workDays: number[];
  morning: AgendaPlanRange;
  work: AgendaPlanRange;
  evening: AgendaPlanRange;
  weekend: AgendaPlanRange;
  rest: AgendaPlanRange[];
  rules: AgendaPlanRule[];
  gardenList: string;
  gardenMinutes: number;
  gardenRules: AgendaPlanRule[];
  gardenSetupMinutes: number;
  morningNotice: boolean;
  morningAt: string;
  remindMinutes: number;
}

export interface AgendaPlanRange {
  from: string;
  to: string;
}

export interface AgendaPlanRule {
  word: string;
  minutes: number;
}

export interface JardinStatus {
  type: 'jardinStatus';
  connected: boolean;
  today: string;
  plants: JardinPlant[];
  supplies: JardinSupply[];
  inbox: JardinInboxItem[];
  recent: JardinRecent[];
  checks: JardinCheck[];
  saving: boolean;
  syncedAt?: string;
  defaultTime: string;
  calendarName: string;
  taskListName: string;
  folderName: string;
  eventPrefix: string;
  error?: string;
}

export interface JardinPlant {
  id: string;
  name: string;
  species?: string;
  place?: string;
  notes?: string;
  photos: string[];
  furniture?: string;
  cares: JardinCare[];
}

export interface JardinCare {
  kind: JardinCareKind;
  everyDays: number;
  time: string;
  last?: string;
  due: string;
  synced: boolean;
}

export type JardinCareKind = 'regar' | 'abonar' | 'limpiar' | 'podar';

export interface JardinSupply {
  id: string;
  name: string;
  category: JardinSupplyCategory;
  quantity: number;
  unit: string;
  min: number;
  buying: boolean;
}

export type JardinSupplyCategory =
  'planta' | 'herramienta' | 'tierra' | 'abono' | 'maceta' | 'otro';

export interface JardinInboxItem {
  id: string;
  kind: JardinInboxKind;
  source: JardinInboxSource;
  name: string;
  text?: string;
  photo?: string;
  receivedAt: string;
  why: string;
  newPlant?: JardinPlantInput;
}

export type JardinInboxKind = 'note' | 'photo';

export type JardinInboxSource = 'drive' | 'local';

export interface JardinPlantInput {
  id?: string;
  name: string;
  species?: string;
  place?: string;
  notes?: string;
  furniture?: string;
  cares: JardinCareInput[];
}

export interface JardinCareInput {
  kind: JardinCareKind;
  everyDays: number;
  time?: string;
  last?: string;
  first?: string;
}

export interface JardinRecent {
  at: string;
  text: string;
}

export interface JardinCheck {
  id: string;
  label: string;
  state: ConnectionState;
  detail: string;
  help?: string;
}

export type ConnectionState = 'ok' | 'warn' | 'off' | 'idea';

export interface PomodoroStatus {
  type: 'pomodoroStatus';
  phase: PomodoroPhase;
  running: boolean;
  endsAt?: string;
  remainingMs?: number;
  totalMs: number;
  doneToday: number;
  untilLong: number;
  suggested: PomodoroPhase;
}

export type PomodoroPhase = 'idle' | 'focus' | 'short' | 'long';

export interface PerfilStatus {
  type: 'perfilStatus';
  profile?: PerfilProfile;
}

export interface PerfilProfile {
  code: string;
  name: string;
  role?: string;
  strategy?: string;
  traits: PerfilTrait[];
  facts?: string[];
  source?: string;
  date?: string;
}

export interface PerfilTrait {
  letter: string;
  name: string;
  percent: number;
}

export interface SearchRoomStatus {
  type: 'searchRoomStatus';
  room: string;
  requests: SearchRequest[];
  criteria: SearchCriteriaSet[];
  launcher: SearchLauncher;
  calendar?: string;
  saving: boolean;
  error?: string;
}

export interface SearchRequest {
  id: string;
  text: string;
  place?: string;
  when?: string;
  criteriaId: string;
  createdAt: string;
  state: SearchRequestState;
  note?: string;
  brief: string;
  resultsNote?: string;
  results: SearchResult[];
}

export type SearchRequestState = 'nuevo' | 'buscando' | 'esperando' | 'listo' | 'error';

export interface SearchResult {
  id: string;
  name: string;
  kind: string;
  rating?: number;
  reviews?: number;
  phone?: string;
  address?: string;
  link?: string;
  source?: string;
  why: string;
  score: number;
  verdict: SearchResultVerdict;
  mark?: SearchResultMark;
}

export type SearchResultVerdict = 'recomendado' | 'descartado';

export type SearchResultMark = 'contactado' | 'descartado' | 'agendado';

export interface SearchCriteriaSet {
  id: string;
  label: string;
  rules: string[];
}

export interface SearchLauncher {
  available: boolean;
  detail?: string;
}

export interface ConnectionsStatus {
  type: 'connectionsStatus';
  connections: ConnectionInfo[];
}

export interface ConnectionInfo {
  id: string;
  name: string;
  feature: string;
  purpose: string;
  auth: string;
  state: ConnectionState;
  detail?: string;
  lastUsedAt?: string;
}

export interface OfertasStatus {
  type: 'ofertasStatus';
  watches: OfertasWatch[];
  alerts: OfertasAlert[];
  sources: OfertasSource[];
  settings: OfertasSettings;
  checking: boolean;
}

export interface OfertasWatch {
  id: string;
  query: string;
  target?: number;
  mustHave: string[];
  exclude: string[];
  best?: OfertasOffer;
  others?: OfertasOffer[];
  lowest?: number;
  lowestAt?: string;
  history: OfertasPoint[];
  checkedAt?: string;
  nextCheckAt?: string;
  note?: string;
  reached: boolean;
  error?: string;
  reference?: OfertasReference;
  pick?: OfertasPick;
  verdict?: OfertasVerdict;
  asistente?: OfertasWatchAsistente;
}

export interface OfertasOffer {
  sourceId: string;
  store: string;
  title: string;
  price: number;
  listPrice?: number;
  seller?: string;
  official: boolean;
  sellerUnknown?: boolean;
  freeShipping?: boolean;
  url: string;
  image?: string;
  installments?: OfertasInstallments;
}

export interface OfertasInstallments {
  months?: number;
  bank?: string;
}

export interface OfertasPoint {
  at: string;
  price: number;
}

export interface OfertasReference {
  price: number;
  at: string;
}

export interface OfertasPick {
  offer: OfertasOffer;
  reason: string;
}

export interface OfertasVerdict {
  kind: OfertasVerdictKind;
  reason: string;
}

export type OfertasVerdictKind = 'good' | 'normal' | 'expensive' | 'unknown';

export interface OfertasWatchAsistente {
  precio?: OfertasAsistenteInvestigacion;
  similares?: OfertasAsistenteBusquedaSimilares;
}

export interface OfertasAsistenteInvestigacion {
  precioTipico?: number;
  minimoVisto?: number;
  maximoVisto?: number;
  nota: string;
  confianza: OfertasAsistenteConfianza;
  fuentes: OfertasAsistenteFuente[];
  revisado: string;
}

export type OfertasAsistenteConfianza = 'alta' | 'media' | 'baja';

export interface OfertasAsistenteFuente {
  titulo: string;
  url: string;
  fecha?: string;
  precio?: number;
}

export interface OfertasAsistenteBusquedaSimilares {
  similares: OfertasAsistenteSimilar[];
  revisado: string;
}

export interface OfertasAsistenteSimilar {
  tipo: OfertasAsistenteTipoSimilar;
  nombre: string;
  porque: string;
  precioAprox?: number;
  consulta: string;
  fuentes: OfertasAsistenteFuente[];
}

export type OfertasAsistenteTipoSimilar = 'compa' | 'alternativa';

export interface OfertasAlert {
  id: string;
  watchId: string;
  at: string;
  kind: OfertasAlertKind;
  text: string;
  price?: number;
  store?: string;
  url?: string;
  seen: boolean;
}

export type OfertasAlertKind = 'target' | 'drop' | 'lowest' | 'community';

export interface OfertasSource {
  id: string;
  name: string;
  state: OfertasSourceState;
  fragile: boolean;
  enabled: boolean;
  detail?: string;
  count?: number;
  lastOkAt?: string;
}

export type OfertasSourceState = 'ok' | 'error' | 'blocked' | 'nokey' | 'off' | 'idle';

export interface OfertasSettings {
  everyMinutes: number;
  buenFin: boolean;
  dropPercent: number;
  disabledSources: string[];
}

export interface OfertasResults {
  type: 'ofertasResults';
  requestId: string;
  query: string;
  searching: boolean;
  groups: OfertasGroup[];
  deals: OfertasDeal[];
  sources: OfertasSource[];
  links: OfertasLink[];
}

export interface OfertasGroup {
  key: string;
  title: string;
  offers: OfertasOffer[];
  pick?: OfertasPick;
  verdict?: OfertasVerdict;
}

export interface OfertasDeal {
  id: string;
  title: string;
  price?: number;
  merchant?: string;
  temperature: number;
  url: string;
  publishedAt?: string;
  expired: boolean;
  installments?: OfertasInstallments;
}

export interface OfertasLink {
  name: string;
  url: string;
}

export interface OfertasAsistenteEstado {
  type: 'ofertasAsistenteEstado';
  installed: boolean;
  enabled: boolean;
  available: boolean;
  model: string;
  busy: boolean;
  job?: OfertasAsistenteJob;
  product?: string;
  startedAt?: string;
  watchId?: string;
  requestId?: string;
  groupKey?: string;
}

export type OfertasAsistenteJob = 'precio' | 'similares';

export interface OfertasAsistenteResultado {
  type: 'ofertasAsistenteResultado';
  job: OfertasAsistenteJob;
  product: string;
  ok: boolean;
  reason?: OfertasAsistenteFallo;
  detail?: string;
  watchId?: string;
  requestId?: string;
  groupKey?: string;
  precio?: OfertasAsistenteInvestigacion;
  similares?: OfertasAsistenteBusquedaSimilares;
}

export type OfertasAsistenteFallo =
  'no-cli' | 'off' | 'busy' | 'no-subscription' | 'timeout' | 'cancelled' | 'bad-output' | 'failed';

export interface DecksStatus {
  type: 'decksStatus';
  decks: DecksDeck[];
  folder: string;
  db: DecksDb;
  problems: string[];
}

export interface DecksDeck {
  id: string;
  name: string;
  owner: string;
  createdAt: string;
  updatedAt: string;
  cover: number;
  box: DecksBox;
  notes: string;
  main: number[];
  extra: number[];
  side: number[];
}

export interface DecksBox {
  color: string;
}

export interface DecksDb {
  state: DecksDbState;
  count?: number;
  updatedAt?: string;
  detail?: string;
}

export type DecksDbState = 'missing' | 'loading' | 'ready' | 'error';

export interface DecksSearchResults {
  type: 'decksSearchResults';
  requestId: string;
  query: string;
  cards: DecksCard[];
}

export interface DecksCard {
  id: number;
  name: string;
  kind: DecksCardKind;
  extraDeck: boolean;
  type: string;
  frameType: string;
  desc: string;
  race?: string;
  attribute?: string;
  level?: number;
  atk?: number;
  def?: number;
  archetype?: string;
  banTcg?: DecksBan;
  banOcg?: DecksBan;
}

export type DecksCardKind = 'monster' | 'spell' | 'trap';

export type DecksBan = 'Banned' | 'Limited' | 'Semi-Limited';

export interface DecksCardInfo {
  type: 'decksCardInfo';
  cards: DecksCard[];
  missing: number[];
}

export interface DecksImportResult {
  type: 'decksImportResult';
  requestId: string;
  ok: boolean;
  deck?: DecksDeck;
  problems: string[];
}

export interface WebviewReady {
  type: 'webviewReady';
  office?: string;
  floor?: string;
}

export interface LaunchAgent {
  type: 'launchAgent';
  folderPath?: string;
  bypassPermissions?: boolean;
}

export interface FocusAgent {
  type: 'focusAgent';
  id: number;
}

export interface CloseAgent {
  type: 'closeAgent';
  id: number;
}

export interface SaveAgentSeats {
  type: 'saveAgentSeats';
  seats: Record<string, SeatAssignment>;
}

export interface SeatAssignment {
  palette: number;
  hueShift: number;
  seatId: string | null;
}

export interface SaveLayout {
  type: 'saveLayout';
  layout: Record<string, any>;
}

export interface SetSoundEnabled {
  type: 'setSoundEnabled';
  enabled: boolean;
}

export interface SetLastSeenVersion {
  type: 'setLastSeenVersion';
  version: string;
}

export interface SetAlwaysShowLabels {
  type: 'setAlwaysShowLabels';
  enabled: boolean;
}

export interface SetGhostHeadlessAgents {
  type: 'setGhostHeadlessAgents';
  enabled: boolean;
}

export interface SetShadowsEnabled {
  type: 'setShadowsEnabled';
  enabled: boolean;
}

export interface SetOwnerEnabled {
  type: 'setOwnerEnabled';
  enabled: boolean;
}

export interface SetParticlesEnabled {
  type: 'setParticlesEnabled';
  enabled: boolean;
}

export interface SetDayNightMode {
  type: 'setDayNightMode';
  mode: DayNightMode;
}

export interface SetHooksEnabled {
  type: 'setHooksEnabled';
  providerId: string;
  enabled: boolean;
}

export interface HooksConsentResponse {
  type: 'hooksConsentResponse';
  providerId: string;
  choice: HooksConsentChoice;
}

export type HooksConsentChoice = 'install' | 'notNow' | 'never';

export interface SetHooksInfoShown {
  type: 'setHooksInfoShown';
}

export interface SetWatchAllSessions {
  type: 'setWatchAllSessions';
  enabled: boolean;
}

export interface ExportLayout {
  type: 'exportLayout';
}

export interface ImportLayout {
  type: 'importLayout';
}

export interface OpenSessionsFolder {
  type: 'openSessionsFolder';
}

export interface AddExternalAssetDirectory {
  type: 'addExternalAssetDirectory';
  path?: string;
}

export interface RemoveExternalAssetDirectory {
  type: 'removeExternalAssetDirectory';
  path: string;
}

export interface SaveAreaMappings {
  type: 'saveAreaMappings';
  mappings: Record<string, string[]>;
}

export interface SetShowAreas {
  type: 'setShowAreas';
  enabled: boolean;
}

export interface RequestDiagnostics {
  type: 'requestDiagnostics';
}

export interface SetMusicEnabled {
  type: 'setMusicEnabled';
  enabled: boolean;
}

export interface InstallMusicExtension {
  type: 'installMusicExtension';
}

export interface MusicControl {
  type: 'musicControl';
  action: AnonymousSchema_813;
}

export type AnonymousSchema_813 = 'previous' | 'togglePlay' | 'next';

export interface DisconnectSpotify {
  type: 'disconnectSpotify';
}

export interface PlaylistCommand {
  type: 'playlistCommand';
  action: PlaylistAction;
  recipe?: PlaylistRecipe;
  uri?: string;
  id?: string;
  play?: boolean;
  text?: string;
  minutes?: number;
  name?: string;
  uris?: string[];
  mode?: PlaylistImproveMode;
  avoidRecent?: boolean;
}

export type PlaylistAction =
  | 'open'
  | 'preview'
  | 'reroll'
  | 'reject'
  | 'unreject'
  | 'create'
  | 'cancel'
  | 'keep'
  | 'delete'
  | 'saveRecipe'
  | 'deleteRecipe'
  | 'setAutoPlay'
  | 'describe'
  | 'play'
  | 'openList'
  | 'closeList'
  | 'searchSongs'
  | 'saveList'
  | 'improve'
  | 'applyImprove'
  | 'dropImprove'
  | 'checkLists'
  | 'forget';

export type PlaylistImproveMode = 'more' | 'bin' | 'reroll' | 'discover' | 'text';

export interface RefreshConcerts {
  type: 'refreshConcerts';
}

export interface SearchConcerts {
  type: 'searchConcerts';
}

export interface AddConcert {
  type: 'addConcert';
  id: string;
}

export interface DisconnectGoogle {
  type: 'disconnectGoogle';
}

export interface RefreshAgenda {
  type: 'refreshAgenda';
}

export interface AddAgendaItem {
  type: 'addAgendaItem';
  kind: AgendaItemKind;
  title: string;
  date?: string;
  time?: string;
  endTime?: string;
  calendar?: string;
}

export interface CompleteAgendaTask {
  type: 'completeAgendaTask';
  id: string;
}

export interface AgendaPlanAction {
  type: 'agendaPlanAction';
  action: AgendaPlanActionKind;
  ids: string[];
  minutes?: number;
}

export type AgendaPlanActionKind = 'done' | 'skip' | 'minutes';

export interface SetAgendaPlanPrefs {
  type: 'setAgendaPlanPrefs';
  prefs?: AgendaPlanPrefs;
  reset?: boolean;
}

export interface RefreshJardin {
  type: 'refreshJardin';
}

export interface SaveJardinPlant {
  type: 'saveJardinPlant';
  plant: JardinPlantInput;
  fromInbox?: string;
}

export interface DeleteJardinPlant {
  type: 'deleteJardinPlant';
  id: string;
}

export interface MarkJardinCare {
  type: 'markJardinCare';
  plantId: string;
  kind: JardinCareKind;
}

export interface SaveJardinSupply {
  type: 'saveJardinSupply';
  supply: JardinSupplyInput;
}

export interface JardinSupplyInput {
  id?: string;
  name: string;
  category: JardinSupplyCategory;
  quantity: number;
  unit: string;
  min: number;
}

export interface DeleteJardinSupply {
  type: 'deleteJardinSupply';
  id: string;
}

export interface ResolveJardinInbox {
  type: 'resolveJardinInbox';
  id: string;
  action: JardinInboxAction;
  plantId?: string;
  kind?: JardinCareKind;
}

export type JardinInboxAction = 'care' | 'photo' | 'discard';

export interface RemoveJardinPhoto {
  type: 'removeJardinPhoto';
  plantId: string;
  photo: string;
}

export interface StartPomodoro {
  type: 'startPomodoro';
  phase: PomodoroBlock;
}

export type PomodoroBlock = 'focus' | 'short' | 'long';

export interface PausePomodoro {
  type: 'pausePomodoro';
}

export interface ResumePomodoro {
  type: 'resumePomodoro';
}

export interface StopPomodoro {
  type: 'stopPomodoro';
}

export interface CreateSearchRequest {
  type: 'createSearchRequest';
  room: string;
  text: string;
  place?: string;
  when?: string;
  criteriaId: string;
}

export interface LaunchSearchAgent {
  type: 'launchSearchAgent';
  room: string;
  id: string;
}

export interface MarkSearchResult {
  type: 'markSearchResult';
  room: string;
  requestId: string;
  resultId: string;
  mark: SearchResultMarkChoice;
}

export type SearchResultMarkChoice = 'contactado' | 'descartado' | 'ninguno';

export interface DeleteSearchRequest {
  type: 'deleteSearchRequest';
  room: string;
  id: string;
}

export interface SaveSearchCriteria {
  type: 'saveSearchCriteria';
  room: string;
  criteria: SearchCriteriaSet[];
}

export interface ScheduleSearchResult {
  type: 'scheduleSearchResult';
  room: string;
  requestId: string;
  resultId: string;
  title: string;
  date: string;
  time?: string;
}

export interface SearchOfertas {
  type: 'searchOfertas';
  requestId: string;
  query: string;
}

export interface SaveOfertasWatch {
  type: 'saveOfertasWatch';
  id?: string;
  query: string;
  target?: number;
  mustHave?: string[];
  exclude?: string[];
  reference?: OfertasReference;
}

export interface DeleteOfertasWatch {
  type: 'deleteOfertasWatch';
  id: string;
}

export interface CheckOfertas {
  type: 'checkOfertas';
  id?: string;
}

export interface SetOfertasSettings {
  type: 'setOfertasSettings';
  everyMinutes?: number;
  buenFin?: boolean;
  dropPercent?: number;
  disabledSources?: string[];
}

export interface MarkOfertasAlertsSeen {
  type: 'markOfertasAlertsSeen';
}

export interface OfertasAsistenteInvestigar {
  type: 'ofertasAsistenteInvestigar';
  producto: string;
  precioActual?: number;
  tienda?: string;
  watchId?: string;
  requestId?: string;
  groupKey?: string;
}

export interface OfertasAsistenteSimilares {
  type: 'ofertasAsistenteSimilares';
  producto: string;
  presupuesto?: number;
  watchId?: string;
  requestId?: string;
  groupKey?: string;
}

export interface OfertasAsistenteCancelar {
  type: 'ofertasAsistenteCancelar';
}

export interface SetOfertasAsistente {
  type: 'setOfertasAsistente';
  enabled?: boolean;
  model?: string;
}

export interface DecksOpen {
  type: 'decksOpen';
}

export interface DecksSearch {
  type: 'decksSearch';
  requestId: string;
  query: string;
}

export interface DecksCards {
  type: 'decksCards';
  ids: number[];
}

export interface DecksSave {
  type: 'decksSave';
  deck: DecksDeck;
}

export interface DecksDelete {
  type: 'decksDelete';
  id: string;
}

export interface DecksImport {
  type: 'decksImport';
  requestId: string;
  text: string;
}
