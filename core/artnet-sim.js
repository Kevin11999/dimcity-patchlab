// core/artnet-sim.js — a pretend Art-Net node on loopback, for tests: answers ArtPoll, accepts ArtAddress and ArtIpProg.
import dgram from 'node:dgram';
import { opOf, OP, buildPollReply, parseAddress, parseIpProg, buildIpProgReply } from './artnet.js';

export async function startSim({ port = 6461, ip = '10.90.101.11', mac = '00:50:c2:aa:bb:01', shortName = 'LumiNode 12', longName = 'LumiNode 12 factory', ports = 12 } = {}){
  const st = { ip, mask:'255.255.255.0', mac, shortName, longName, net:0, sub:0, swOut:Array.from({ length:ports }, (_, i) => i), log:[] };
  const sock = dgram.createSocket({ type:'udp4', reuseAddr:true });
  sock.on('message', (msg, r) => {
    const op = opOf(msg);
    if(op === OP.Poll){
      for(let g = 0; g < Math.ceil(ports / 4); g++){
        const pp = st.swOut.slice(g * 4, g * 4 + 4).map(v => ({ output:true, swOut:v }));
        sock.send(buildPollReply({ ip:st.ip, bindIp:st.ip, bindIndex:g + 1, mac:st.mac, net:st.net, sub:st.sub, shortName:st.shortName, longName:st.longName, ports:pp }), r.port, r.address);
      }
    } else if(op === OP.Address){
      const a = parseAddress(msg); st.log.push(['address', a]);
      if(a.shortName) st.shortName = a.shortName; if(a.longName) st.longName = a.longName;
      if(a.net != null) st.net = a.net; if(a.sub != null) st.sub = a.sub;
      a.swOut.forEach((v, i) => { if(v != null) st.swOut[(a.bindIndex - 1) * 4 + i] = v; });
    } else if(op === OP.IpProg){
      const p = parseIpProg(msg); st.log.push(['ipprog', p]);
      if(p.setIp) st.ip = p.ip; if(p.setMask) st.mask = p.mask;
      sock.send(buildIpProgReply(st.ip, st.mask), r.port, r.address);
    }
  });
  await new Promise(res => sock.bind(port, '127.0.0.1', res));
  return { state:st, port, close:() => sock.close() };
}
