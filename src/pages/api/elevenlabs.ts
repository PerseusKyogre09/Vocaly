import type { APIRoute } from 'astro';
import { getSession } from '../../lib/session';
import { getDatabase } from '../../lib/db';
import { agentRecord } from '../../lib/db/schema';
export const prerender=false;
const base='https://api.elevenlabs.io/v1';
async function forward(path:string,key:string,init:RequestInit={}){const res=await fetch(`${base}${path}`,{...init,headers:{'xi-api-key':key,'content-type':'application/json',...(init.headers||{})}});const text=await res.text();let data:any;try{data=JSON.parse(text)}catch{data={detail:text}}if(!res.ok)throw new Error(data?.detail?.message||data?.detail||data?.message||`ElevenLabs returned ${res.status}`);return data;}
export const POST:APIRoute=async({request})=>{try{const body=await request.json();const {action,apiKey}=body;if(typeof apiKey!=='string'||apiKey.length<10)return Response.json({error:'A valid ElevenLabs API key is required.'},{status:400});let result;
if(action==='validate'||action==='voices') result=await forward('/voices',apiKey);
else if(action==='create'){const currentSession=await getSession(request);if(!currentSession?.user)return Response.json({error:'Authentication required.'},{status:401});const c=body.config||{};const prompt=[c.systemPrompt||'You are a helpful assistant.','When the caller clearly says goodbye or indicates they are finished (for example: "bye", "goodbye", "that is all", "I am done", "hang up", or "end the call"), respond with a brief friendly farewell and do not continue the conversation. The client will end the call after the farewell.'].join('\n\n');result=await forward('/convai/agents/create',apiKey,{method:'POST',body:JSON.stringify({name:c.name||'Vocaly Agent',conversation_config:{agent:{prompt:{prompt},first_message:c.firstMessage||'Hello! How can I help?',language:(c.language||'en').toLowerCase().startsWith('en')?'en':(c.language||'en').slice(0,2)},tts:{...(c.voiceId?{voice_id:c.voiceId}:{})}},platform_settings:{auth:{enable_auth:true}}})});const createdId=result.agent_id||result.agentId;if(createdId)await getDatabase().insert(agentRecord).values({id:crypto.randomUUID(),userId:currentSession.user.id,elevenLabsAgentId:createdId,name:c.name||'Vocaly Agent',status:'created',createdAt:new Date()}).onConflictDoNothing();}
else if(action==='token'){const id=body.agentId;if(!id)return Response.json({error:'Agent ID is required.'},{status:400});const res=await fetch(`${base}/convai/conversation/get_signed_url?agent_id=${encodeURIComponent(id)}`,{headers:{'xi-api-key':apiKey}});result=await res.json();if(!res.ok)throw new Error(result?.detail?.message||result?.detail||`ElevenLabs returned ${res.status}`);}
else if(action==='list-agents')result=await forward('/convai/agents',apiKey);
else if(action==='conversations')result=await forward('/convai/conversations',apiKey);
else return Response.json({error:'Unsupported ElevenLabs action.'},{status:400});
return Response.json(result);
}catch(e){return Response.json({error:e instanceof Error?e.message:'ElevenLabs request failed.'},{status:502});}};
