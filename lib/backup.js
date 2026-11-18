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
Object.defineProperty(exports, "__esModule", { value: true });
exports.BACKUP_INTERVAL_MS = exports.BACKUP_DIR = exports.BACKUP_META_ID = exports.YieldBackup = void 0;
exports.backupPath = backupPath;
exports.serialize = serialize;
exports.parse = parse;
const daily_1 = require("./daily");
const yields_1 = require("./yields");
const BACKUP_META_ID = '0_userdata.0';
exports.BACKUP_META_ID = BACKUP_META_ID;
const BACKUP_DIR = 'hoymiles-local';
exports.BACKUP_DIR = BACKUP_DIR;
const FORMAT_VERSION = 1;
const BACKUP_INTERVAL_MS = 5 * 60 * 1000;
exports.BACKUP_INTERVAL_MS = BACKUP_INTERVAL_MS;
const serialValid = x => typeof x === 'string' && /^[A-F\d]{8,32}$/.test(x);
// ============================================================
// ============================================================
// [BLOCK:200] Dateiformat
// ============================================================
function backupPath(serial) { return `${BACKUP_DIR}/${serial}.json`; }
function serialize(serial, payload, namespace, now) {
    return JSON.stringify({ format: FORMAT_VERSION, savedAt: new Date(now).toISOString(), instance: namespace, device: { serial }, daily: payload.daily, yields: payload.yields }, null, 2);
}
function parse(data, serial, now) {
    try {
        const json = JSON.parse(String(data));
        if (!json || json.format !== FORMAT_VERSION || json.device?.serial !== serial || !json.daily || !json.yields)
            return null;
        new daily_1.Daily(now, json.daily);
        new yields_1.YieldArchive(now, json.yields);
        return { payload: { daily: json.daily, yields: json.yields }, savedAt: String(json.savedAt || ''), instance: String(json.instance || '') };
    }
    catch {
        return null;
    }
}
// ============================================================
// ============================================================
// [BLOCK:300] Sicherungsdatei
// ============================================================
class YieldBackup {
    constructor({ adapter, config, log, now = Date.now }) { this.adapter = adapter; this.config = config; this.log = log || adapter.log; this.now = now; this.lastWrite = 0; this.lastContent = undefined; this.metaChecked = false; this.blocked = undefined; this.lastError = undefined; }
    enabled() { return this.config.backupToUserdata !== false; }
    async read(serial) {
        if (!this.enabled() || !serialValid(serial))
            return null;
        const file = backupPath(serial);
        let exists;
        try {
            exists = await this.adapter.fileExistsAsync(BACKUP_META_ID, file);
        }
        catch {
            exists = false;
        }
        if (!exists)
            return null;
        try {
            const result = await this.adapter.readFileAsync(BACKUP_META_ID, file);
            const parsed = parse(result.file, serial, this.now());
            if (!parsed) {
                this.blocked = serial;
                this.log?.warn(`Sicherungsdatei ${BACKUP_META_ID}/${file} ist ungültig und wird nicht überschrieben.`);
            }
            return parsed;
        }
        catch {
            this.blocked = serial;
            this.log?.warn(`Sicherungsdatei ${BACKUP_META_ID}/${file} konnte nicht gelesen werden und wird nicht überschrieben.`);
            return null;
        }
    }
    async write(serial, payload, force = false) {
        if (!this.enabled() || !serialValid(serial) || this.blocked === serial)
            return;
        const now = this.now();
        if (!force && now - this.lastWrite < BACKUP_INTERVAL_MS)
            return;
        const content = JSON.stringify({ serial, daily: payload.daily, yields: payload.yields });
        if (content === this.lastContent && now - this.lastWrite < BACKUP_INTERVAL_MS)
            return;
        this.lastWrite = now;
        try {
            await this.ensureMeta();
            await this.adapter.writeFileAsync(BACKUP_META_ID, backupPath(serial), serialize(serial, payload, this.adapter.namespace, now));
            this.lastContent = content;
            this.lastError = undefined;
        }
        catch (e) {
            const code = e?.message || 'BACKUP_WRITE_FAILED';
            if (code !== this.lastError)
                this.log?.warn(`Sicherungsdatei ${BACKUP_META_ID}/${backupPath(serial)} konnte nicht geschrieben werden (${code}).`);
            this.lastError = code;
        }
    }
    async ensureMeta() {
        if (this.metaChecked)
            return;
        const object = await this.adapter.getForeignObjectAsync(BACKUP_META_ID);
        if (!object)
            await this.adapter.setForeignObjectAsync(BACKUP_META_ID, { type: 'meta', common: { name: 'User files and data', type: 'meta.user' }, native: {} });
        this.metaChecked = true;
    }
}
exports.YieldBackup = YieldBackup;
