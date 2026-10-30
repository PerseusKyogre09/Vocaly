import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { fileURLToPath } from 'node:url';

async function freePort() {
  const server=net.createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  await new Promise(resolve=>server.close(resolve));
  return port;
}
async function waitReady(url) {
  for(let i=0;i<60;i++) { try { const r=await fetch(url);if(r.ok)return; } catch {} await new Promise(r=>setTimeout(r,50)); }
  throw new Error('Bridge failed to start');
}

test('Exotel call stays open when ElevenLabs credentials are unavailable',async t=>{
  const bridgePort=await freePort();const statusPort=await freePort();const secret='phone-fallback-test-secret';const statuses=[];
  const statusServer=await import('node:http').then(({createServer})=>createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;statuses.push(JSON.parse(body));res.writeHead(200);res.end('{}')}));
  await new Promise(resolve=>statusServer.listen(statusPort,'127.0.0.1',resolve));
  const bridge=spawn(process.execPath,['src/server.mjs'],{cwd:fileURLToPath(new URL('..',import.meta.url)),env:{...process.env,PORT:String(bridgePort),VOXFLOW_APP_URL:`http://127.0.0.1:${statusPort}`,PHONE_BRIDGE_SECRET:secret},stdio:['ignore','pipe','pipe']});
  t.after(()=>{bridge.kill();statusServer.close();});
  const base=`http://127.0.0.1:${bridgePort}`;await waitReady(`${base}/`);
  const session={callId:'phone-only',agentId:'agent-a',elevenLabsAgentId:'el-agent-a'};
  const provisioned=await fetch(`${base}/sessions`,{method:'POST',headers:{authorization:`Bearer ${secret}`,'content-type':'application/json'},body:JSON.stringify(session)});
  assert.equal(provisioned.status,201);
  const encoded=Buffer.from(JSON.stringify({...session,exp:Math.floor(Date.now()/1000)+600})).toString('base64url');
  const signature=createHmac('sha256',secret).update(encoded).digest('base64url');
  const socket=new WebSocket(`ws://127.0.0.1:${bridgePort}/ws?token=${encoded}.${signature}&sample-rate=16000`);
  await once(socket,'open');
  socket.send(JSON.stringify({event:'connected'}));
  socket.send(JSON.stringify({event:'start',stream_sid:'stream-a',start:{stream_sid:'stream-a',call_sid:'call-a',media_format:{sample_rate:'16000',encoding:'audio/x-raw',bit_rate:'16'}}}));
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(socket.readyState,WebSocket.OPEN,'bridge must not close the Exotel call when ElevenLabs is unavailable');
  assert.ok(statuses.some(s=>s.status==='agent-unavailable'));
  socket.send(JSON.stringify({event:'media',media:{payload:Buffer.from([0,0,0,0]).toString('base64')}}));
  socket.send(JSON.stringify({event:'stop',stop:{call_sid:'call-a',reason:'callended'}}));
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.ok(statuses.some(s=>s.status==='completed'));
  socket.close();
});
