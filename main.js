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
Object.defineProperty(exports, "__esModule", { value: true });
const adapter_core_1 = require("@iobroker/adapter-core");
const publisher_1 = require("./lib/publisher");
const runtime_1 = require("./lib/runtime");
const LEGACY_STATES = ['info.yieldBackupStatus', 'info.yieldBackupError', 'info.yieldBackupLastSuccess', 'info.yieldBackupTarget', 'info.yieldBackupText'];
// ============================================================
// ============================================================
// [BLOCK:200] Adapterklasse
// ============================================================
class HoymilesLocal extends adapter_core_1.Adapter {
    constructor(options = {}) {
        super({ ...options, name: 'hoymiles-local' });
        this.unloading = false;
        this.on('ready', () => this.onReady().catch(error => this.log.error(`Adapterstart fehlgeschlagen: ${error.code || 'INITIALIZATION_FAILED'}`)));
        this.on('unload', callback => this.onUnload(callback));
    }
    async onReady() {
        if (this.unloading)
            return;
        this.publisher = new publisher_1.Publisher(this);
        await this.publisher.publish('', [{ id: 'info.connection', val: false, name: 'DTU-Verbindung', type: 'boolean', role: 'indicator.connected' }]);
        for (const id of LEGACY_STATES)
            if (await this.getObjectAsync(id))
                await this.delObjectAsync(id).catch(() => { });
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
}
// ============================================================
// ============================================================
// [BLOCK:900] Adapterstart und Export
// ============================================================
if (require.main !== module)
    module.exports = options => new HoymilesLocal(options);
else
    new HoymilesLocal();
