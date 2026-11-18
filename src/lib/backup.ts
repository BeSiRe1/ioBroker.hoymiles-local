// ============================================================
// [BLOCK:000] Systemkopf
// ============================================================

// ************************************************************
// Hoymiles Local – Ertragssicherung
//
// Sichert Tageszähler und Ertragsarchiv als Datei unter 0_userdata.0.
//
// Version: 0.3.0.0 (18.11.2026)
//
// ************************************************************
// ============================================================

// ============================================================
// BLOCK-NAVIGATION (STRG+F → BLOCK:XYZ)
// ============================================================
// [BLOCK:000] Systemkopf
// [BLOCK:100] Initialisierung
// [BLOCK:200] Dateiformat
// [BLOCK:300] Sicherungsdatei
// [BLOCK:900] Modulexport
// [BLOCK:1000] Änderungsverlauf
// ============================================================

// ============================================================
// [BLOCK:100] Initialisierung
// ============================================================
'use strict';
import type {BackupPayload, Settings} from './model';
import {Daily} from './daily';
import {YieldArchive} from './yields';
const BACKUP_META_ID='0_userdata.0';
const BACKUP_DIR='hoymiles-local';
const FORMAT_VERSION=1;
const BACKUP_INTERVAL_MS=5*60*1000;
const serialValid=x=>typeof x==='string'&&/^[A-F\d]{8,32}$/.test(x);
// ============================================================

// ============================================================
// [BLOCK:200] Dateiformat
// ============================================================
function backupPath(serial:string){return `${BACKUP_DIR}/${serial}.json`;}
function serialize(serial:string,payload:BackupPayload,namespace:string,now:number){
  return JSON.stringify({format:FORMAT_VERSION,savedAt:new Date(now).toISOString(),instance:namespace,device:{serial},daily:payload.daily,yields:payload.yields},null,2);
}
function parse(data,serial:string,now:number):{payload:BackupPayload;savedAt:string;instance:string}|null{
  try{
    const json=JSON.parse(String(data));
    if(!json||json.format!==FORMAT_VERSION||json.device?.serial!==serial||!json.daily||!json.yields)return null;
    new Daily(now,json.daily);new YieldArchive(now,json.yields);
    return {payload:{daily:json.daily,yields:json.yields},savedAt:String(json.savedAt||''),instance:String(json.instance||'')};
  }catch{return null;}
}
// ============================================================

// ============================================================
// [BLOCK:300] Sicherungsdatei
// ============================================================
class YieldBackup{
  declare adapter: ioBroker.Adapter;
  declare config: Settings;
  declare log: ioBroker.Logger;
  declare now: () => number;
  declare lastWrite: number;
  declare lastContent: string;
  declare metaChecked: boolean;
  declare blocked: string;
  declare lastError: string;

  constructor({adapter,config,log,now=Date.now}:{adapter:ioBroker.Adapter;config:Settings;log?:ioBroker.Logger;now?:()=>number}){this.adapter=adapter;this.config=config;this.log=log||adapter.log;this.now=now;this.lastWrite=0;this.lastContent=undefined;this.metaChecked=false;this.blocked=undefined;this.lastError=undefined;}
  enabled(){return this.config.backupToUserdata!==false;}
  async read(serial:string){
    if(!this.enabled()||!serialValid(serial))return null;
    const file=backupPath(serial);
    let exists:boolean;
    try{exists=await this.adapter.fileExistsAsync(BACKUP_META_ID,file);}catch{exists=false;}
    if(!exists)return null;
    try{
      const result=await this.adapter.readFileAsync(BACKUP_META_ID,file);
      const parsed=parse(result.file,serial,this.now());
      if(!parsed){this.blocked=serial;this.log?.warn(`Sicherungsdatei ${BACKUP_META_ID}/${file} ist ungültig und wird nicht überschrieben.`);}
      return parsed;
    }catch{
      this.blocked=serial;this.log?.warn(`Sicherungsdatei ${BACKUP_META_ID}/${file} konnte nicht gelesen werden und wird nicht überschrieben.`);
      return null;
    }
  }
  async write(serial:string,payload:BackupPayload,force=false){
    if(!this.enabled()||!serialValid(serial)||this.blocked===serial)return;
    const now=this.now();
    if(!force&&now-this.lastWrite<BACKUP_INTERVAL_MS)return;
    const content=JSON.stringify({serial,daily:payload.daily,yields:payload.yields});
    if(content===this.lastContent&&now-this.lastWrite<BACKUP_INTERVAL_MS)return;
    this.lastWrite=now;
    try{
      await this.ensureMeta();
      await this.adapter.writeFileAsync(BACKUP_META_ID,backupPath(serial),serialize(serial,payload,this.adapter.namespace,now));
      this.lastContent=content;this.lastError=undefined;
    }catch(e){
      const code=e?.message||'BACKUP_WRITE_FAILED';
      if(code!==this.lastError)this.log?.warn(`Sicherungsdatei ${BACKUP_META_ID}/${backupPath(serial)} konnte nicht geschrieben werden (${code}).`);
      this.lastError=code;
    }
  }
  async ensureMeta(){
    if(this.metaChecked)return;
    const object=await this.adapter.getForeignObjectAsync(BACKUP_META_ID);
    if(!object)await this.adapter.setForeignObjectAsync(BACKUP_META_ID,{type:'meta',common:{name:'User files and data',type:'meta.user'},native:{}});
    this.metaChecked=true;
  }
}
// ============================================================

// ============================================================
// [BLOCK:900] Modulexport
// ============================================================
export {YieldBackup,BACKUP_META_ID,BACKUP_DIR,BACKUP_INTERVAL_MS,backupPath,serialize,parse};
// ============================================================

// ============================================================
// [BLOCK:1000] Änderungsverlauf
// ============================================================
// 0.3.0.0 (18.11.2026):
// - Sicherung als Datei 0_userdata.0/hoymiles-local/<DTU>.json wie im Adapter espeasy-s0; Ordnerauswahl, Statusdatenpunkte und manuelle Wiederherstellung entfernt.
// - Ungültige oder nicht lesbare Sicherungsdateien werden nicht überschrieben.
//
// 0.2.0.0 (17.11.2026):
// - Modul auf TypeScript umgestellt.
//
// 0.1.0.1 (10.11.2026):
// - Sicherungsstatus einheitlich für Statusabfrage und fortlaufende Anzeige formatieren.
//
// 0.1.0.0 (10.11.2026):
// - Vollständige externe Ertragssicherung mit Gerätebindung, Prüfung und verlustfreier Wiederherstellung ergänzen.
//
// ============================================================
