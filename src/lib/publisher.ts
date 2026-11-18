// ============================================================
// [BLOCK:000] Systemkopf
// ============================================================

// ************************************************************
// Hoymiles Local – Datenpunktausgabe
//
// Erstellt lesbare Datenpunkte und kennzeichnet fehlgeschlagene Abfragen.
//
// Version: 0.3.0.1 (18.11.2026)
//
// ************************************************************
// ============================================================

// ============================================================
// BLOCK-NAVIGATION (STRG+F → BLOCK:XYZ)
// ============================================================
// [BLOCK:000] Systemkopf
// [BLOCK:100] Initialisierung
// [BLOCK:200] Datenpunktausgabe
// [BLOCK:900] Modulexport
// [BLOCK:1000] Änderungsverlauf
// ============================================================

// ============================================================
// [BLOCK:100] Initialisierung
// ============================================================
'use strict';
// ============================================================

// ============================================================
// [BLOCK:200] Datenpunktausgabe
// ============================================================
class Publisher{
  declare adapter: ioBroker.Adapter;
  declare known: Set<string>;
  declare groups: Map<string,Set<string>>;
  declare devices: Set<string>;
  declare closed: boolean;

  constructor(adapter:ioBroker.Adapter){this.adapter=adapter;this.known=new Set();this.groups=new Map();this.devices=new Set();this.closed=false;}
  read(prefix,id){return this.adapter.getStateAsync(prefix?`${prefix}.${id}`:id);}
  async folder(id,name=id,type:'device'|'channel'='channel'){
    if(this.known.has(id)||this.closed)return;
    const parent=id.split('.').slice(0,-1).join('.');if(parent)await this.folder(parent);
    await this.adapter.setObjectNotExistsAsync(id,{type,common:{name},native:{}});this.known.add(id);
  }
  async device(id,name){
    if(!/^[A-F\d]{8,32}$/.test(id))throw Error('INVALID_DEVICE_ID');
    if(this.closed||this.devices.has(id))return;
    await this.folder(id,name,'device');
    if(this.closed)return;
    await this.adapter.extendObjectAsync(id,{common:{statusStates:{onlineId:'info.connected'}}});
    this.devices.add(id);
  }
  async publish(prefix:string,values,group?:string){
    if(this.closed)return;
    const seen=new Set<string>();
    for(const entry of values){
      if(!entry||this.closed)continue;
      const id=prefix?`${prefix}.${entry.id}`:entry.id;
      if(!this.known.has(id)){
        const parent=id.split('.').slice(0,-1).join('.');if(parent)await this.folder(parent);
        const common:ioBroker.StateCommon={name:entry.name,type:entry.type,role:entry.role,read:true,write:false};if(entry.unit)common.unit=entry.unit;
        if(entry.states)common.states=entry.states;
        await this.adapter.setObjectNotExistsAsync(id,{type:'state',common,native:{source:'local-dtu'}});
        const metadata:Partial<ioBroker.StateCommon>={};if(entry.unit)metadata.unit=entry.unit;if(entry.states)metadata.states=entry.states;
        if(Object.keys(metadata).length)await this.adapter.extendObjectAsync(id,{common:metadata});
        this.known.add(id);
      }
      if(this.closed)return;
      await this.adapter.setStateAsync(id,{val:entry.val,ack:true,q:0});
      if(group)seen.add(id);
    }
    if(group&&!this.closed){for(const id of this.groups.get(group)||[]){if(!seen.has(id))await this.adapter.setStateAsync(id,{val:null,ack:true,q:0x40});}this.groups.set(group,seen);}
  }
  async invalidate(group){
    await this.invalidateIds(this.groups.get(group)||[]);
  }
  async invalidateStoredMeasurements(){
    const objects:Record<string,ioBroker.Object>=await this.adapter.getAdapterObjectsAsync();
    const prefix=this.adapter.namespace+'.';
    const ids=[];
    for(const [fullId,object] of Object.entries(objects)){
      if(object.type!=='state'||!fullId.startsWith(prefix))continue;
      const id=fullId.slice(prefix.length);
      const [serial,channel,field,...children]=id.split('.');
      if(!/^[A-F\d]{8,32}$/.test(serial)||!field||children.length)continue;
      const measurement=channel==='inverter'||channel==='grid'||/^pv\d+$/.test(channel);
      if((measurement&&field!=='dailyEnergy'&&field!=='serialNumber')||(channel==='info'&&field==='packetTimestamp'))ids.push(id);
    }
    await this.invalidateIds(ids);
  }
  async invalidateIds(ids:Iterable<string>){
    for(const id of ids){
      if(this.closed)return;
      const previous=await this.adapter.getStateAsync(id);
      if(previous&&!(previous.q&0x40))await this.adapter.setStateAsync(id,{val:previous.val,ack:true,q:(previous.q|0x40) as ioBroker.State['q']});
    }
  }
  close(){this.closed=true;}
}
// ============================================================

// ============================================================
// [BLOCK:900] Modulexport
// ============================================================
export {Publisher};
// ============================================================

// ============================================================
// [BLOCK:1000] Änderungsverlauf
// ============================================================
// 0.3.0.1 (18.11.2026):
// - Skriptname im Systemkopf auf Hoymiles Local korrigiert.
//
// 0.3.0.0 (17.11.2026):
// - Modul auf TypeScript umgestellt.
//
// 0.2.1.1 (17.11.2026):
// - Gespeicherte Livewerte beim Neustart als veraltet markieren und bestehende Qualitätsmerkmale erhalten.
//
// 0.2.1.0 (07.11.2026): 
// - Einheiten und Alarm-Wertelisten auch an bestehenden Datenpunktobjekten ergänzen.
//
// 0.2.0.0 (07.11.2026): 
// - Die Online-/Offline-Markierung am Geräteobjekt anbinden.
//
// 0.1.0.0 (07.11.2026): 
// - Erste Entwicklungsfassung der lokalen Hoymiles-WLAN-Anbindung.
//
// ============================================================
