// core/netadapters.js — the network adapters of this computer, so PatchLab only looks where the devices are (plain Node, no Electron imports).
// Every adapter has a stable id (its MAC address, else its name), a kind (ethernet / wifi / virtual / other) and a tick:
//   saved[id] when the person ticked it (or not), otherwise ethernet = on and everything else = off.
import os from 'node:os';
import fs from 'node:fs';
import { execFile } from 'node:child_process';

// virtual machines, containers, VPNs, tunnels and the other adapters that never have a lighting network behind them
const VIRTUAL_MAC = /^(00:50:56|00:0c:29|00:05:69|00:1c:14|08:00:27|00:15:5d|00:1c:42|52:54:00|00:16:3e)/i;
const VIRTUAL_NAME = /vmware|vmnet|virtualbox|vboxnet|vbox|hyper-?v|vethernet|wsl|docker|veth|virbr|^br-|bridge\d|thunderbolt bridge|utun|awdl|llw|gif\d|stf\d|^tun\d|^tap|tailscale|zerotier|^zt|wireguard|^wg\d|openvpn|vpn|loopback|pseudo|bluetooth|teredo|isatap|npcap|^ppp|iphone|ipad/i;
const WIFI_NAME = /wi-?fi|wlan|wireless|airport|802\.11|^wl[a-z0-9]+$/i;

export const prefixOf = mask => String(mask || '255.255.255.0').split('.').reduce((n, o) => n + (Number(o) >>> 0).toString(2).replace(/0/g, '').length, 0);

// macOS names its adapters en0, en5 … : the hardware port list says which one is the Wi-Fi and which one is a USB LAN dongle
function hardwareLabels(){
  if(process.platform !== 'darwin') return Promise.resolve(new Map());
  return new Promise(res => execFile('networksetup', ['-listallhardwareports'], { timeout: 4000 }, (e, out) => {
    const m = new Map(); if(e || !out) return res(m);
    for(const b of String(out).split(/\n\s*\n/)){ const p = b.match(/Hardware Port:\s*(.+)/), d = b.match(/Device:\s*(\S+)/); if(p && d) m.set(d[1], p[1].trim()); }
    res(m);
  }));
}
const linux = (name, what) => { try { return fs.existsSync(`/sys/class/net/${name}/${what}`); } catch { return false; } };

export function kindOf(name, mac, label = ''){
  const s = `${name} ${label}`;
  if(VIRTUAL_MAC.test(mac || '') || VIRTUAL_NAME.test(s)) return 'virtual';
  if(WIFI_NAME.test(s) || (process.platform === 'linux' && linux(name, 'wireless'))) return 'wifi';
  if(process.platform === 'linux' && fs.existsSync(`/sys/devices/virtual/net/${name}`)) return 'virtual';
  return 'ethernet';
}

// every adapter with an IPv4 address (loopback left out), ethernet first
export async function listAdapters(saved = {}){
  const labels = await hardwareLabels(), out = [];
  for(const [name, list] of Object.entries(os.networkInterfaces())){
    const v4 = (list || []).filter(a => (a.family === 'IPv4' || a.family === 4) && !a.internal);
    if(!v4.length) continue;
    const mac = v4[0].mac && v4[0].mac !== '00:00:00:00:00:00' ? v4[0].mac.toLowerCase() : '', label = labels.get(name) || '', kind = kindOf(name, mac, label), id = mac || name;
    out.push({ id, name, label: label || name, mac, kind,
      addresses: v4.map(a => ({ address: a.address, netmask: a.netmask || '255.255.255.0', prefix: prefixOf(a.netmask), linkLocal: a.address.startsWith('169.254.') })),
      on: Object.prototype.hasOwnProperty.call(saved || {}, id) ? !!saved[id] : kind === 'ethernet' });
  }
  const order = { ethernet: 0, wifi: 1, other: 2, virtual: 3 };
  return out.sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name));
}
export const selected = async saved => (await listAdapters(saved)).filter(a => a.on);

// the networks of these adapters as ranges: the whole subnet up to a /16, anything wider or narrower becomes the /24 around the address
export function rangesOf(adapters){
  const out = [];
  for(const a of adapters) for(const x of a.addresses) out.push(x.prefix >= 16 && x.prefix <= 30 ? `${x.address}/${x.prefix}` : x.address.split('.').slice(0, 3).join('.') + '.0/24');
  return [...new Set(out)];
}
