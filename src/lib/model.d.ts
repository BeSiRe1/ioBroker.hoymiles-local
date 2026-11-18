export interface DailyCounter { value: number; confirmed: boolean; boundary: number | null }
export interface DailyState { schema: number; zone: string; day: string; counters: Record<string, DailyCounter> }
export interface ArchiveDay { energy: number; monthCredit: number; yearCredit: number; averageCredit: number; final: boolean; counted: boolean; imported: boolean; observed: boolean; text: string }
export interface Scope { days: Record<string, ArchiveDay>; months: Record<string, number>; years: Record<string, number>; closedMonths: Record<string, string>; closedYears: Record<string, string>; averageSum: number; averageCount: number; startDate: string; imported: boolean }
export interface Archive { schema: number; zone: string; day: string; scopes: Record<string, Scope> }
export interface BackupPayload { daily: DailyState; yields: Archive }
export interface Settings { host: string; port?: number; interval?: number; historyInterval?: number; timeout?: number; backupToUserdata?: boolean }
export type Packet = Record<string, any>;

export type RawNumber = string | number;
export interface InverterSample {
  serial_number?: RawNumber;
  active_power?: RawNumber;
  voltage?: RawNumber;
  current?: RawNumber;
  temperature?: RawNumber;
}
export interface PvSample {
  serial_number?: RawNumber;
  port_number?: RawNumber;
  energy_daily?: RawNumber;
  energy_total?: RawNumber;
}
export interface LivePacket {
  sgs_data?: InverterSample[];
  pv_data?: PvSample[];
  dtu_power?: RawNumber;
  dtu_daily_energy?: RawNumber;
  timestamp?: RawNumber;
}
export interface HistoryPacket {
  power_array?: number[];
  absolute_start?: number;
  step_time?: number;
  daily_energy?: number;
  total_energy?: number;
  relative_power?: number;
  warning_number?: number;
}
export interface AlarmRecord { code?: number; s_time?: number; e_time?: number }
export interface AlarmPacket { warns?: AlarmRecord[]; messages?: { data?: { warns?: AlarmRecord[] } }[] }
