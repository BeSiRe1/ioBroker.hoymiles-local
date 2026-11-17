// ============================================================
// [BLOCK:000] Systemkopf
// ============================================================
// ************************************************************
// Hoymiles WiFi – Adapter
//
// Startet und beendet die lokale Hoymiles-DTU-Anbindung.
//
// Version: 0.2.0.0 (17.11.2026)
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
Object.defineProperty(exports, "__esModule", { value: true });
const adapter_core_1 = require("@iobroker/adapter-core");
const publisher_1 = require("./lib/publisher");
const runtime_1 = require("./lib/runtime");
const backup_1 = require("./lib/backup");
// ============================================================
// ============================================================
// [BLOCK:200] Adapterklasse
// ============================================================
class HoymilesWifi extends adapter_core_1.Adapter {
    constructor(options = {}) {
        super({ ...options, name: 'hoymiles-local' });
        this.unloading = false;
        this.on('ready', () => this.onReady().catch(error => this.log.error(`Adapterstart fehlgeschlagen: ${error.code || 'INITIALIZATION_FAILED'}`)));
        this.on('unload', callback => this.onUnload(callback));
        this.on('message', message => this.onMessage(message).catch(() => { if (message?.callback)
            this.sendTo(message.from, message.command, { error: 'BACKUP_COMMAND_FAILED' }, message.callback); }));
    }
    async onReady() {
        if (this.unloading)
            return;
        this.publisher = new publisher_1.Publisher(this);
        await this.publisher.publish('', [{ id: 'info.connection', val: false, name: 'DTU-Verbindung', type: 'boolean', role: 'indicator.connected' }]);
        if (this.unloading)
            return;
        if (!String(this.config.host || '').trim()) {
            this.log.warn('Bitte die IP-Adresse oder den Hostnamen der DTU in den Instanzeinstellungen eintragen.');
            return;
        }
        this.runtime = new runtime_1.Runtime({ config: this.config, publisher: this.publisher, log: this.log });
        await this.runtime.start();
    }
    async onUnload(callback) {
        this.unloading = true;
        try {
            await this.runtime?.stop();
            if (!this.runtime) {
                await this.setStateAsync('info.connection', { val: false, ack: true });
                this.publisher?.close();
            }
        }
        catch {
            this.log.debug('Verbindung wurde beim Beenden geschlossen.');
        }
        finally {
            callback();
        }
    }
    async onMessage(message) {
        if (!message?.callback || !['yieldBackupStatus', 'yieldBackupRestore'].includes(message.command))
            return;
        if (!this.runtime) {
            this.sendTo(message.from, message.command, { error: 'ADAPTER_NOT_READY' }, message.callback);
            return;
        }
        if (message.command === 'yieldBackupRestore') {
            this.sendTo(message.from, message.command, await this.runtime.restoreBackup(), message.callback);
            return;
        }
        const state = await this.runtime.backupStatus();
        const text = (0, backup_1.formatBackupStatus)(state);
        this.sendTo(message.from, message.command, { text, result: text }, message.callback);
    }
}
// ============================================================
// ============================================================
// [BLOCK:900] Adapterstart und Export
// ============================================================
if (require.main !== module)
    module.exports = options => new HoymilesWifi(options);
else
    new HoymilesWifi();
