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
  | UsageStatus
  | HerdrTabLabels
  | GithubStatus
  | ConcertsStatus
  | AgendaStatus
  | JardinStatus
  | PomodoroStatus
  | PerfilStatus
  | SearchRoomStatus
  | ConnectionsStatus;

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
  | RefreshConcerts
  | SearchConcerts
  | AddConcert
  | DisconnectGoogle
  | RefreshAgenda
  | AddAgendaItem
  | CompleteAgendaTask
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
  | ScheduleSearchResult;

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
}

export interface CharacterSpriteSet {
  down: string[][][];
  up: string[][][];
  right: string[][][];
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
  source?: AnonymousSchema_248;
}

export type AnonymousSchema_248 = 'extension' | 'spotify';

export interface MusicLyrics {
  type: 'musicLyrics';
  title?: string;
  artist?: string;
  loading?: boolean;
  synced?: boolean;
  instrumental?: boolean;
  source?: AnonymousSchema_255;
  lines?: MusicLyricLine[];
}

export type AnonymousSchema_255 = 'spotify' | 'lrclib';

export interface MusicLyricLine {
  text: string;
  timeMs?: number;
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
}

export type AgendaItemKind = 'event' | 'task';

export interface AgendaCalendar {
  id: string;
  name: string;
  color?: string;
  writable: boolean;
  busyOnly: boolean;
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
  action: AnonymousSchema_527;
}

export type AnonymousSchema_527 = 'previous' | 'togglePlay' | 'next';

export interface DisconnectSpotify {
  type: 'disconnectSpotify';
}

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
