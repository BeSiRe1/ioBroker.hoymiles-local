// ============================================================
// [BLOCK:000] Systemkopf
// ============================================================

// ************************************************************
// Hoymiles Local – Adapter
//
// Startet und beendet die lokale Hoymiles-DTU-Anbindung.
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
// [BLOCK:200] Adapterklasse
// [BLOCK:900] Adapterstart und Export
// [BLOCK:1000] Änderungsverlauf
// ============================================================

// ============================================================
// [BLOCK:100] Initialisierung
// ============================================================
'use strict';
import {Adapter} from '@iobroker/adapter-core';
import type {Settings} from './lib/model';
declare global { namespace ioBroker { interface AdapterConfig extends Settings {} } }
import {Publisher} from './lib/publisher';
import {Runtime} from './lib/runtime';
const LEGACY_STATES=['info.yieldBackupStatus','info.yieldBackupError','info.yieldBackupLastSuccess','info.yieldBackupTarget','info.yieldBackupText'];
// ============================================================

// ============================================================
// [BLOCK:200] Adapterklasse
// ============================================================
class HoymilesLocal extends Adapter{
  declare unloading:boolean;
  declare runtime:Runtime;
  declare publisher:Publisher;
  constructor(options={}){
    super({...options,name:'hoymiles-local'});
    this.unloading=false;
    this.on('ready',()=>this.onReady().catch(error=>this.log.error(`Adapterstart fehlgeschlagen: ${error.code||'INITIALIZATION_FAILED'}`)));
    this.on('unload',callback=>this.onUnload(callback));
  }
  async onReady(){
    if(this.unloading)return;
    this.publisher=new Publisher(this);
    await this.publisher.publish('',[{id:'info.connection',val:false,name:'DTU-Verbindung',type:'boolean',role:'indicator.connected'}]);
    for(const id of LEGACY_STATES)if(await this.getObjectAsync(id))await this.delObjectAsync(id).catch(()=>{});
    if(this.unloading)return;
    if(!String(this.config.host||'').trim()){this.log.warn('Bitte die IP-Adresse oder den Hostnamen der DTU in den Instanzeinstellungen eintragen.');return;}
    this.runtime=new Runtime({config:this.config,publisher:this.publisher,log:this.log});await this.runtime.start();
  }
  async onUnload(callback){
    this.unloading=true;
    try{await this.runtime?.stop();if(!this.runtime){await this.setStateAsync('info.connection',{val:false,ack:true});this.publisher?.close();}}
    catch{this.log.debug('Verbindung wurde beim Beenden geschlossen.');}
    finally{callback();}
  }
}
// ============================================================

// ============================================================
// [BLOCK:900] Adapterstart und Export
// ============================================================
if(require.main!==module)module.exports=options=>new HoymilesLocal(options);else new HoymilesLocal();
// ============================================================

// ============================================================
// [BLOCK:1000] Änderungsverlauf
// ============================================================
// 0.3.0.0 (18.11.2026):
// - Nachrichten für Sicherungsstatus und manuelle Wiederherstellung entfernt; die Sicherung läuft wie im Adapter espeasy-s0 automatisch.
// - Nicht mehr verwendete Statusdatenpunkte der alten Ertragssicherung beim Start entfernen.
// - Adapterklasse und Skriptname auf Hoymiles Local umbenannt.
//
// 0.2.0.0 (17.11.2026):
// - Modul auf TypeScript umgestellt.
//
// 0.1.1.2 (17.11.2026):
// - Instanz unter dem eigenen Adapternamen hoymiles-local starten.
//
// 0.1.1.1 (10.11.2026):
// - Statusabfrage und automatische Statusanzeige mit derselben Textformatierung versorgen.
//
// 0.1.1.0 (10.11.2026):
// - Nachrichten für Sicherungsstatus und Wiederherstellung aus der Adapterkonfiguration anbinden.
//
// 0.1.0.0 (07.11.2026):
// - Erste Entwicklungsfassung der lokalen Hoymiles-WLAN-Anbindung.
//
// ============================================================
