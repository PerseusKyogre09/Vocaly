<script lang="ts">
  import { Handle, Position } from '@xyflow/svelte';
  import { AudioLines, MessageCircleQuestion, ListChecks, Info, BadgeCheck, GitBranch, Zap, UserRound, CircleStop, CheckCircle2, AlertTriangle } from 'lucide-svelte';
  export let data:any; export let selected=false;
  const icons:any={trigger_started:AudioLines,trigger_greeting:AudioLines,trigger_user:AudioLines,ask:MessageCircleQuestion,collect:ListChecks,inform:Info,confirm:BadgeCheck,condition:GitBranch,condition_check:GitBranch,required_field:GitBranch,integration:Zap,action:Zap,handoff:UserRound,end:CircleStop,success:CheckCircle2,fallback:AlertTriangle};
  const categories:any={trigger_started:'TRIGGER',trigger_greeting:'TRIGGER',trigger_user:'TRIGGER',ask:'CONVERSATION',collect:'CONVERSATION',inform:'CONVERSATION',confirm:'CONVERSATION',condition:'LOGIC',condition_check:'LOGIC',required_field:'LOGIC',integration:'ACTION',action:'ACTION',handoff:'HANDOFF',end:'ENDING',success:'ENDING',fallback:'FALLBACK'};
  $: Icon=icons[data.kind]||MessageCircleQuestion;
  $: branches=['condition','condition_check','required_field'].includes(data.kind);
</script>
<div class="flow-node" class:selected class:error={data.invalid} data-kind={data.kind}>
  <Handle type="target" position={Position.Left} />
  <div class="node-kicker">{categories[data.kind]||'STEP'}</div>
  <div class="node-head"><span class="node-icon"><Icon size={14}/></span><strong>{data.config?.name||data.label}</strong></div>
  <div class="node-preview">{data.preview||data.config?.question||data.config?.instructions||'Configure this step in the inspector.'}</div>
  {#if branches}<div class="branch-labels"><span>TRUE</span><span>FALSE</span></div><Handle id="true" type="source" position={Position.Right} style="top:68%"/><Handle id="false" type="source" position={Position.Right} style="top:88%"/>{:else if data.kind==='action'}<div class="branch-labels"><span>SUCCESS</span><span>FAILURE</span></div><Handle id="success" type="source" position={Position.Right} style="top:68%"/><Handle id="failure" type="source" position={Position.Right} style="top:88%"/>{:else}<Handle type="source" position={Position.Right}/>{/if}
</div>
<style>
  .flow-node{width:230px;background:#111522;border:1px solid #303950;border-radius:10px;padding:12px 14px;color:#eef0fa;box-shadow:0 8px 24px #05071188;position:relative}.flow-node.selected{border-color:#a687ff;box-shadow:0 0 0 2px #a687ff33,0 12px 28px #05071199}.flow-node.error{border-color:#f87171}.node-kicker{font:9px 'DM Mono',monospace;letter-spacing:1.2px;color:#a99bed;margin-bottom:8px}.node-head{display:flex;gap:8px;align-items:center;font-size:12px}.node-icon{color:#a687ff}.node-preview{font-size:10px;line-height:1.45;color:#a7adc1;margin-top:8px;max-height:42px;overflow:hidden}.branch-labels{display:flex;justify-content:space-between;margin-top:9px;font:8px 'DM Mono';color:#b7c0d6}.branch-labels span:first-child{color:#9be6b1}.branch-labels span:last-child{color:#f4a7a7}:global(.flow-node .svelte-flow__handle){width:9px;height:9px;background:#63d8e8;border:2px solid #101522}:global(.svelte-flow__node.selected .flow-node){border-color:#a687ff}
</style>
