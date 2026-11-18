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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Publisher = void 0;
// ============================================================
// ============================================================
// [BLOCK:200] Datenpunktausgabe
// ============================================================
class Publisher {
    constructor(adapter) { this.adapter = adapter; this.known = new Set(); this.groups = new Map(); this.devices = new Set(); this.closed = false; }
    read(prefix, id) { return this.adapter.getStateAsync(prefix ? `${prefix}.${id}` : id); }
    async folder(id, name = id, type = 'channel') {
        if (this.known.has(id) || this.closed)
            return;
        const parent = id.split('.').slice(0, -1).join('.');
        if (parent)
            await this.folder(parent);
        await this.adapter.setObjectNotExistsAsync(id, { type, common: { name }, native: {} });
        this.known.add(id);
    }
    async device(id, name) {
        if (!/^[A-F\d]{8,32}$/.test(id))
            throw Error('INVALID_DEVICE_ID');
        if (this.closed || this.devices.has(id))
            return;
        await this.folder(id, name, 'device');
        if (this.closed)
            return;
        await this.adapter.extendObjectAsync(id, { common: { statusStates: { onlineId: 'info.connected' } } });
        this.devices.add(id);
    }
    async publish(prefix, values, group) {
        if (this.closed)
            return;
        const seen = new Set();
        for (const entry of values) {
            if (!entry || this.closed)
                continue;
            const id = prefix ? `${prefix}.${entry.id}` : entry.id;
            if (!this.known.has(id)) {
                const parent = id.split('.').slice(0, -1).join('.');
                if (parent)
                    await this.folder(parent);
                const common = { name: entry.name, type: entry.type, role: entry.role, read: true, write: false };
                if (entry.unit)
                    common.unit = entry.unit;
                if (entry.states)
                    common.states = entry.states;
                await this.adapter.setObjectNotExistsAsync(id, { type: 'state', common, native: { source: 'local-dtu' } });
                const metadata = {};
                if (entry.unit)
                    metadata.unit = entry.unit;
                if (entry.states)
                    metadata.states = entry.states;
                if (Object.keys(metadata).length)
                    await this.adapter.extendObjectAsync(id, { common: metadata });
                this.known.add(id);
            }
            if (this.closed)
                return;
            await this.adapter.setStateAsync(id, { val: entry.val, ack: true, q: 0 });
            if (group)
                seen.add(id);
        }
        if (group && !this.closed) {
            for (const id of this.groups.get(group) || []) {
                if (!seen.has(id))
                    await this.adapter.setStateAsync(id, { val: null, ack: true, q: 0x40 });
            }
            this.groups.set(group, seen);
        }
    }
    async invalidate(group) {
        await this.invalidateIds(this.groups.get(group) || []);
    }
    async invalidateStoredMeasurements() {
        const objects = await this.adapter.getAdapterObjectsAsync();
        const prefix = this.adapter.namespace + '.';
        const ids = [];
        for (const [fullId, object] of Object.entries(objects)) {
            if (object.type !== 'state' || !fullId.startsWith(prefix))
                continue;
            const id = fullId.slice(prefix.length);
            const [serial, channel, field, ...children] = id.split('.');
            if (!/^[A-F\d]{8,32}$/.test(serial) || !field || children.length)
                continue;
            const measurement = channel === 'inverter' || channel === 'grid' || /^pv\d+$/.test(channel);
            if ((measurement && field !== 'dailyEnergy' && field !== 'serialNumber') || (channel === 'info' && field === 'packetTimestamp'))
                ids.push(id);
        }
        await this.invalidateIds(ids);
    }
    async invalidateIds(ids) {
        for (const id of ids) {
            if (this.closed)
                return;
            const previous = await this.adapter.getStateAsync(id);
            if (previous && !(previous.q & 0x40))
                await this.adapter.setStateAsync(id, { val: previous.val, ack: true, q: (previous.q | 0x40) });
        }
    }
    close() { this.closed = true; }
}
exports.Publisher = Publisher;
