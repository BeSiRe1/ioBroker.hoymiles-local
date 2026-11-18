'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {YieldBackup,BACKUP_META_ID,BACKUP_INTERVAL_MS,backupPath,serialize,parse}=require('../lib/backup');
const {YieldArchive}=require('../lib/yields');
const {Daily}=require('../lib/daily');
const {Runtime}=require('../lib/runtime');
const {Publisher}=require('../lib/publisher');
const serial='4143A0000001',file='hoymiles-local/'+serial+'.json',now=Date.parse('2026-11-10T12:00:00+01:00');
function payload(time,amount){const daily=new Daily(time);daily.state.counters={'grid.dailyEnergy':{value:amount,confirmed:true,boundary:null},'pv0.dailyEnergy':{value:amount/2,confirmed:true,boundary:null}};const archive=new YieldArchive(time);archive.observe(daily.state);return {daily:JSON.parse(daily.serialize()),yields:JSON.parse(archive.serialize())};}
function memory({backupToUserdata=true}={}){
  const objects=new Map(),states=new Map(),files=new Map(),fileWrites=[],messages=[],faults=new Set();const clock={now};
  const log=Object.fromEntries(['info','warn','debug','error'].map(level=>[level,message=>messages.push({level,message})]));
  const adapter={namespace:'hoymiles-local.0',log,
    fileExistsAsync:async(meta,name)=>{if(faults.has('exists'))throw Error('fixture');return files.has(meta+'/'+name);},
    readFileAsync:async(meta,name)=>{if(faults.has('read'))throw Error('fixture');if(!files.has(meta+'/'+name))throw Error('Not exists');return {file:files.get(meta+'/'+name)};},
    writeFileAsync:async(meta,name,data)=>{if(faults.has('write'))throw Error('fixture');files.set(meta+'/'+name,String(data));fileWrites.push({meta,name,data:String(data)});},
    getForeignObjectAsync:async id=>objects.get(id),setForeignObjectAsync:async(id,obj)=>{objects.set(id,{_id:id,...obj});},
    getStateAsync:async id=>states.get(id),setStateAsync:async(id,s)=>{states.set(id,s);},getObjectAsync:async id=>objects.get(id),
    setObjectNotExistsAsync:async(id,obj)=>{if(!objects.has(id))objects.set(id,{_id:id,...obj});},extendObjectAsync:async(id,obj)=>{const old=objects.get(id)||{};objects.set(id,{...old,...obj,common:{...old.common,...obj.common}});}};
  const config={host:'127.0.0.1',backupToUserdata};
  const backup=()=>new YieldBackup({adapter,config,now:()=>clock.now});
  const runtime=()=>new Runtime({config,publisher:new Publisher(adapter),client:{close(){}},log,now:()=>clock.now});
  const store=(data,id=serial)=>files.set(BACKUP_META_ID+'/'+backupPath(id),serialize(id,data,'hoymiles-local.0',clock.now));
  return {adapter,config,backup,runtime,objects,states,files,fileWrites,messages,faults,clock,store,value:id=>states.get(serial+'.'+id)?.val};
}
test('disabled backup neither reads nor writes files',async()=>{
  const m=memory({backupToUserdata:false}),b=m.backup();m.store(payload(now,1));
  assert.equal(await b.read(serial),null);await b.write(serial,payload(now,1),true);assert.equal(m.fileWrites.length,0);
});
test('backup is written as file below 0_userdata.0 and throttled to five minutes unless forced',async()=>{
  const m=memory(),b=m.backup();
  await b.write(serial,payload(now,1),true);
  assert.equal(m.fileWrites.length,1);assert.equal(m.fileWrites[0].meta,'0_userdata.0');assert.equal(m.fileWrites[0].name,file);
  const record=JSON.parse(m.fileWrites[0].data);assert.equal(record.format,1);assert.equal(record.device.serial,serial);assert.equal(record.instance,'hoymiles-local.0');assert.equal(record.daily.counters['grid.dailyEnergy'].value,1);assert.ok(record.yields.scopes.grid);assert.equal(JSON.stringify(record).includes('127.0.0.1'),false);
  assert.equal(m.objects.get('0_userdata.0').type,'meta');
  await b.write(serial,payload(now,1.5));assert.equal(m.fileWrites.length,1);
  await b.write(serial,payload(now,1),true);assert.equal(m.fileWrites.length,1);
  await b.write(serial,payload(now,1.5),true);assert.equal(m.fileWrites.length,2);
  m.clock.now+=BACKUP_INTERVAL_MS;await b.write(serial,payload(now,1.6));assert.equal(m.fileWrites.length,3);
});
test('write failures are reported once and retried later',async()=>{
  const m=memory(),b=m.backup();m.faults.add('write');
  await b.write(serial,payload(now,1),true);await b.write(serial,payload(now,1.1),true);
  assert.equal(m.messages.filter(x=>x.level==='warn').length,1);m.faults.clear();
  await b.write(serial,payload(now,1.2),true);assert.equal(m.fileWrites.length,1);
});
test('invalid, foreign or unreadable backups are ignored and never overwritten',async()=>{
  assert.equal(parse('{',serial,now),null);
  assert.equal(parse(serialize('4143A0000002',payload(now,1),'x',now),serial,now),null);
  assert.equal(parse(JSON.stringify({format:2,device:{serial},...payload(now,1)}),serial,now),null);
  assert.equal(parse(serialize(serial,payload(Date.parse('2026-11-11T12:00:00+01:00'),1),'x',now),serial,now),null);
  const m=memory(),b=m.backup();m.files.set('0_userdata.0/'+file,'broken');
  assert.equal(await b.read(serial),null);await b.write(serial,payload(now,1),true);
  assert.equal(m.files.get('0_userdata.0/'+file),'broken');assert.equal(m.fileWrites.length,0);
  const r=memory(),c=r.backup();r.store(payload(now,1));r.faults.add('read');
  assert.equal(await c.read(serial),null);r.faults.clear();await c.write(serial,payload(now,0),true);assert.equal(r.fileWrites.length,0);
});
test('a new instance without own data restores daily counters and yields from the backup file',async()=>{
  const m=memory();m.store(payload(now,1.2));
  m.states.set('info.deviceIdentity',{val:JSON.stringify({host:'127.0.0.1',port:10081,serial})});
  const runtime=m.runtime();await runtime.restoreIdentity();await runtime.dailyQueue;
  assert.equal(m.value('grid.dailyEnergy'),1.2);assert.equal(m.value('grid.yields.month'),1.2);assert.equal(m.value('pv0.yields.month'),0.6);
  assert.equal(JSON.parse(m.value('internal.yields')).schema,1);assert.equal(JSON.parse(m.value('internal.dailyEnergy')).day,'2026-11-10');
  assert.ok(m.messages.some(x=>x.level==='warn'&&/wiederhergestellt/.test(x.message)));
  await runtime.stop();
});
test('a backup from an earlier day is archived once and the daily counters restart at zero',async()=>{
  const m=memory();const before=Date.parse('2026-11-09T18:00:00+01:00');m.clock.now=before;m.store(payload(before,2));m.clock.now=now;
  m.states.set('info.deviceIdentity',{val:JSON.stringify({host:'127.0.0.1',port:10081,serial})});
  const runtime=m.runtime();await runtime.restoreIdentity();await runtime.dailyQueue;
  assert.equal(m.value('grid.dailyEnergy'),0);assert.deepEqual(JSON.parse(m.value('grid.yields.daysJson')),[{Datum:'09.11.2026',Ertrag:'2'}]);assert.equal(m.value('grid.yields.month'),2);assert.equal(m.value('grid.yields.daysRecorded'),1);
  await runtime.stop();
  const again=m.runtime();await again.restoreIdentity();await again.dailyQueue;assert.equal(m.value('grid.yields.month'),2);assert.equal(m.value('grid.yields.daysRecorded'),1);await again.stop();
});
test('existing own data takes precedence and is written to the backup file on stop',async()=>{
  const m=memory();m.store(payload(now,5));const own=payload(now,1);
  m.states.set('info.deviceIdentity',{val:JSON.stringify({host:'127.0.0.1',port:10081,serial})});
  m.states.set(serial+'.internal.dailyEnergy',{val:JSON.stringify(own.daily)});m.states.set(serial+'.internal.yields',{val:JSON.stringify(own.yields)});
  const runtime=m.runtime();await runtime.restoreIdentity();await runtime.dailyQueue;
  assert.equal(m.value('grid.dailyEnergy'),1);assert.ok(!m.messages.some(x=>/wiederhergestellt/.test(x.message)));
  const written=m.fileWrites.length;assert.ok(written>=1);assert.equal(JSON.parse(m.files.get('0_userdata.0/'+file)).daily.counters['grid.dailyEnergy'].value,1);
  runtime.daily.state.counters['grid.dailyEnergy'].value=1.5;await runtime.stop();
  assert.equal(m.fileWrites.length,written+1);assert.equal(JSON.parse(m.files.get('0_userdata.0/'+file)).daily.counters['grid.dailyEnergy'].value,1.5);
});
test('admin configuration offers the userdata backup checkbox enabled by default',()=>{
  const schema=require('../admin/jsonConfig.json'),pkg=require('../io-package.json');
  assert.equal(pkg.native.backupToUserdata,true);assert.equal(schema.items.backupToUserdata.type,'checkbox');assert.equal(schema.items.backupToUserdata.default,true);
  assert.equal(pkg.native.backupEnabled,undefined);assert.equal(pkg.native.backupFolder,undefined);assert.equal(pkg.common.messagebox,undefined);
  assert.ok(!Object.keys(schema.items).some(key=>['backupFolder','_backupRestore','_backupStatus','_backupRefresh'].includes(key)));
});
