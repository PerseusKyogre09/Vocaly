import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWorkflow, compileWorkflow, createWorkflowTemplate, getAgentWorkflow } from '../../src/lib/workflow.mjs';

const simple = () => ({nodes:[
  {id:'t',type:'trigger_started',data:{label:'Start',config:{}}},
  {id:'q',type:'ask',data:{label:'Ask',config:{question:'What date?',required:true,maxRetries:2}}},
  {id:'e',type:'success',data:{label:'Done',config:{message:'Thank you'}}}
],edges:[{id:'a',source:'t',target:'q'},{id:'b',source:'q',target:'e'}]});

test('validates missing triggers, endings, and disconnected nodes',()=>{
  const graph=simple();graph.nodes.push({id:'orphan',type:'inform',data:{config:{instructions:'Answer'}}});
  const issues=validateWorkflow(graph);
  assert.ok(issues.some(i=>i.code==='unreachable'&&i.nodeId==='orphan'));
  assert.ok(validateWorkflow({nodes:[],edges:[]}).some(i=>i.code==='missing_trigger'));
  assert.ok(validateWorkflow({nodes:[graph.nodes[0]],edges:[]}).some(i=>i.code==='missing_ending'));
});

test('compiles connected conversation steps in trigger order',()=>{
  const result=compileWorkflow(simple());
  assert.equal(result.ok,true);
  assert.ok(result.instructions.indexOf('Start:')<result.instructions.indexOf('Ask:'));
  assert.ok(result.instructions.includes('What date?'));
  assert.ok(result.instructions.includes('End (success)'));
});

test('requires both condition branches and emits explicit branching',()=>{
  const graph={nodes:[
    {id:'t',type:'trigger_started',data:{config:{}}},
    {id:'c',type:'condition',data:{config:{variable:'has_name',operator:'equals',value:'true'}}},
    {id:'yes',type:'success',data:{config:{message:'Continue'}}},
    {id:'no',type:'fallback',data:{config:{message:'Ask again'}}}
  ],edges:[{id:'1',source:'t',target:'c'},{id:'2',source:'c',target:'yes',sourceHandle:'true',label:'TRUE'},{id:'3',source:'c',target:'no',sourceHandle:'false',label:'FALSE'}]};
  const result=compileWorkflow(graph);
  assert.equal(result.ok,true);
  assert.match(result.instructions,/Branch: Evaluate has_name equals true/);
  assert.match(result.instructions,/TRUE path/);
  assert.match(result.instructions,/FALSE path/);
  graph.edges.pop();
  assert.ok(validateWorkflow(graph).some(i=>i.code==='missing_branches'));
});

test('blocks unsupported integrations and cycles before compilation',()=>{
  const graph=simple();graph.nodes.splice(2,0,{id:'api',type:'integration',data:{config:{integration:'Calendar'}}});graph.edges=[{id:'a',source:'t',target:'q'},{id:'b',source:'q',target:'api'},{id:'c',source:'api',target:'e'}];
  assert.equal(compileWorkflow(graph).ok,false);
  assert.ok(validateWorkflow(graph).some(i=>i.code==='unsupported_integration'));
  const cycle=simple();cycle.edges.push({id:'loop',source:'e',target:'q'});
  assert.ok(validateWorkflow(cycle).some(i=>i.code==='cycle'));
});

test('templates are editable persisted graphs with agent-isolated data',()=>{
  const one=createWorkflowTemplate('Appointment Booking');
  const two=createWorkflowTemplate('Lead Qualification');
  assert.ok(one.nodes.length>=4&&one.edges.length>=3);
  assert.ok(two.nodes.length>=4&&two.edges.length>=3);
  const storedByAgent=new Map([['agent-a',one],['agent-b',two]]);
  assert.notDeepEqual(storedByAgent.get('agent-a'),storedByAgent.get('agent-b'));
  assert.equal(storedByAgent.get('agent-a').version,1);
  assert.ok(storedByAgent.get('agent-a').nodes.some(n=>n.data.config.fields));
});

test('debounced autosave writes only the latest graph and serializes in-flight edits', async()=>{
  const {createDebouncedAutosave}=await import('../../src/lib/workflow-autosave.mjs');
  const saved=[];const states=[];let release;
  const autosave=createDebouncedAutosave(async value=>{saved.push(value);if(saved.length===1)await new Promise(resolve=>{release=resolve})},state=>states.push(state),20);
  autosave.schedule({agentId:'a',nodes:[1],edges:[]});
  autosave.schedule({agentId:'a',nodes:[2],edges:[]});
  const flushing=autosave.flush();
  await new Promise(resolve=>setImmediate(resolve));
  autosave.schedule({agentId:'a',nodes:[3],edges:[]});
  release();
  await flushing;
  assert.deepEqual(saved.map(s=>s.nodes),[[2],[3]]);
  assert.equal(states.at(-1),'Saved');
  autosave.dispose();
});

test('persisted graph snapshots remain scoped to their selected agent',()=>{
  const a={id:'a',workflow:createWorkflowTemplate('Appointment Booking')};
  const b={id:'b',workflow:createWorkflowTemplate('Customer Support')};
  const loadedB=getAgentWorkflow(b);
  const loadedA=getAgentWorkflow(a);
  assert.equal(loadedB.nodes[0].data.config.name,'Start');
  assert.equal(loadedB.nodes.some(n=>n.data.kind==='condition'),true);
  assert.equal(loadedA.nodes.some(n=>n.data.kind==='collect'),true);
  assert.notDeepEqual(loadedA.nodes,loadedB.nodes);
  assert.equal(compileWorkflow(loadedB).ok,true);
  loadedA.nodes.pop();
  assert.equal(a.workflow.nodes.length,5,'editing the loaded copy does not mutate the saved record');
});

test('normalizes legacy default nodes into the styled editor without hiding their saved descriptions',()=>{
  const loaded=getAgentWorkflow({workflow:{nodes:[{id:'legacy-trigger',type:'default',position:{x:1,y:2},data:{label:'Incoming call',description:'Start here'}}],edges:[]}});
  assert.equal(loaded.nodes[0].type,'workflow');
  assert.equal(loaded.nodes[0].data.kind,'trigger_started');
  assert.equal(loaded.nodes[0].data.config.instructions,'Start here');
});

test('legacy calendar demo labels no longer become false ending nodes',()=>{
  const migrated=getAgentWorkflow({workflow:{nodes:[
    {id:'t',type:'default',data:{label:'Incoming call',description:'Trigger · Start conversation'}},
    {id:'c',type:'default',data:{label:'Collect details',description:'Ask · Name, date, appointment type'}},
    {id:'a',type:'default',data:{label:'Check calendar',description:'Action · Mock availability lookup'}},
    {id:'r',type:'default',data:{label:'Confirm booking',description:'Respond · Read back the slot'}},
    {id:'h',type:'default',data:{label:'Human handoff',description:'Fallback · Route to clinic staff'}}
  ],edges:[
    {id:'1',source:'t',target:'c'},{id:'2',source:'c',target:'a'},{id:'3',source:'a',target:'r'},{id:'4',source:'a',target:'h',label:'If unavailable'}
  ]}});
  assert.equal(migrated.nodes.find(n=>n.id==='a').data.kind,'action');
  assert.equal(migrated.nodes.find(n=>n.id==='r').data.kind,'confirm');
  assert.deepEqual(migrated.nodes.find(n=>n.id==='c').data.config.fields.map(f=>f.name),['Name','date','appointment type']);
  assert.equal(migrated.edges.find(e=>e.id==='3').sourceHandle,'success');
  assert.equal(migrated.edges.find(e=>e.id==='4').sourceHandle,'failure');
  assert.ok(validateWorkflow(migrated).some(i=>i.code==='missing_ending'));
});
