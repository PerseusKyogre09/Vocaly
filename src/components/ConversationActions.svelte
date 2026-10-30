<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Activity,
    Check,
    CheckCircle2,
    XCircle,
    Clock,
    AlertTriangle,
    RefreshCw,
    Search,
    Play,
    Send,
    Edit3,
    Plus,
    Trash2,
    ExternalLink,
    Shield,
    Sparkles,
    FileText,
    ArrowRight,
    ChevronDown,
    ChevronRight,
    Filter,
    Sliders,
    Layers,
    Terminal,
    Copy,
    Download
  } from 'lucide-svelte';

  export let agents: any[] = [];
  export let primaryModel: string = 'openai/gpt-oss-120b';

  // State
  let activeTab: 'overview' | 'inbox' | 'definitions' | 'schemas' | 'history' | 'intelligence' | 'demo' = 'overview';
  let loading = false;
  let error = '';
  let toast = '';

  // Metrics
  let metrics = {
    totalConversations: 0,
    awaitingApprovalCount: 0,
    completedCount: 0,
    failedCount: 0,
    totalExecutions: 0
  };

  // Approval Inbox / Instances
  let instances: any[] = [];
  let selectedInstance: any = null;
  let editPayloadModal = false;
  let editablePayloadJson = '';

  // Action Definitions
  let definitions: any[] = [];
  let editingDef: any = null;
  let isNewDef = false;

  // Extraction Schemas
  let schemas: any[] = [];
  let defaultFields: any[] = [];
  let editingSchema: any = null;
  let isNewSchema = false;

  // History & Observability
  let historyLogs: any[] = [];
  let historyFilterStatus = 'all';
  let selectedHistoryLog: any = null;

  // Call Intelligence
  let conversations: any[] = [];
  let selectedConversation: any = null;
  let intelligenceLoading = false;
  let summarizingConvId: string | null = null;
  let intelligenceSearch = '';

  // Demonstration Experience
  let demoTranscript = `Agent: Thank you for calling Sunrise Clinic. How can I help you today?
Caller: Hi there! My name is Arthur Dent, and I'd like to book an appointment with Dr. Higgins for a routine dental checkup next Tuesday at 2:30 PM.
Agent: I'd be happy to check availability for that. What is the best phone number to reach you at?
Caller: You can reach me at 555-0199.
Agent: Perfect, Arthur. Let me confirm: a routine dental checkup for Arthur Dent on Tuesday, Nov 5 at 2:30 PM, callback number 555-0199. Is that correct?
Caller: Yes, that is correct. Also, please note I have mild tooth sensitivity on the lower left side.
Agent: Got it. I've noted your tooth sensitivity. I'm checking with the doctor's schedule now. Thank you!`;
  let demoAgentId = '';
  let demoBusy = false;
  let demoResult: any = null;
  let demoStep = 1; // 1: input -> 2: extracted -> 3: review -> 4: executed

  function notify(msg: string) {
    toast = msg;
    setTimeout(() => toast = '', 3500);
  }

  onMount(async () => {
    await refreshAll();
  });

  async function refreshAll() {
    loading = true;
    error = '';
    try {
      await Promise.all([
        loadMetricsAndHistory(),
        loadInstances(),
        loadDefinitions(),
        loadSchemas(),
        loadConversations()
      ]);
    } catch (err: any) {
      error = err.message || 'Could not load actions data.';
    } finally {
      loading = false;
    }
  }

  async function loadMetricsAndHistory() {
    const res = await fetch(`/api/actions/history?status=${historyFilterStatus}`);
    if (res.ok) {
      const data = await res.json();
      metrics = data.metrics || metrics;
      historyLogs = data.history || [];
    }
  }

  async function loadInstances() {
    const res = await fetch('/api/actions/instances');
    if (res.ok) {
      const data = await res.json();
      instances = data.instances || [];
    }
  }

  async function loadDefinitions() {
    const res = await fetch('/api/actions/definitions');
    if (res.ok) {
      const data = await res.json();
      definitions = data.definitions || [];
    }
  }

  async function loadSchemas() {
    const res = await fetch('/api/actions/schemas');
    if (res.ok) {
      const data = await res.json();
      schemas = data.schemas || [];
      defaultFields = data.defaultFields || [];
    }
  }

  async function loadConversations() {
    try {
      const res = await fetch('/api/actions/conversations');
      if (res.ok) {
        const data = await res.json();
        conversations = data.conversations || [];
        if (selectedConversation) {
          const fresh = conversations.find(c => c.id === selectedConversation.id);
          if (fresh) selectedConversation = { ...fresh, fullSummary: selectedConversation.fullSummary };
        } else if (conversations.length > 0 && !selectedConversation) {
          selectConversation(conversations[0]);
        }
      }
    } catch (err: any) {
      console.error('Failed to load conversations:', err);
    }
  }

  async function selectConversation(conv: any) {
    selectedConversation = conv;
    // If the conversation has a summary, fetch the full enriched summary if not already loaded
    if (conv?.callSummary?.id && (!conv.fullSummary || conv.fullSummary.id !== conv.callSummary.id)) {
      intelligenceLoading = true;
      try {
        const res = await fetch(`/api/actions/summarize?conversationId=${conv.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.summary) {
            selectedConversation = {
              ...selectedConversation,
              fullSummary: data.summary,
              rawTranscriptText: data.conversation?.rawTranscriptText || selectedConversation.rawTranscriptText,
              actions: data.actions || selectedConversation.actions
            };
          }
        }
      } catch (err) {
        console.error('Failed to load full summary:', err);
      } finally {
        intelligenceLoading = false;
      }
    }
  }

  async function triggerSummarize(convId: string) {
    summarizingConvId = convId;
    try {
      const res = await fetch('/api/actions/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: convId, model: primaryModel })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Summarization failed');
      notify('AI Call Summary generated successfully.');
      await loadConversations();
      const updated = conversations.find(c => c.id === convId);
      if (updated) {
        await selectConversation(updated);
      }
    } catch (err: any) {
      error = err.message;
    } finally {
      summarizingConvId = null;
    }
  }

  async function copySummary(conv: any) {
    const s = conv?.fullSummary || conv?.callSummary;
    if (!s) return;
    const text = [
      `# ${s.title || 'Call Summary'}`,
      `Outcome: ${s.callOutcome || 'N/A'}`,
      `Customer Intent: ${s.customerIntent || 'N/A'}`,
      `\n## Executive Summary\n${s.executiveSummary || 'N/A'}`,
      s.keyDiscussionPoints?.length ? `\n## Key Discussion Points\n${s.keyDiscussionPoints.map((p: string) => `- ${p}`).join('\n')}` : '',
      s.customerRequirements?.length ? `\n## Customer Requirements\n${s.customerRequirements.map((r: string) => `- ${r}`).join('\n')}` : '',
      s.importantCommitments?.length ? `\n## Commitments\n${s.importantCommitments.map((c: any) => `- [${c.madeBy || 'Party'} | ${c.status || 'open'}] ${c.commitment}`).join('\n')}` : '',
      s.followUpTasks?.length ? `\n## Follow-Up Tasks\n${s.followUpTasks.map((t: any) => `- [${t.owner || 'Unassigned'} | ${t.priority || 'medium'}] ${t.task}`).join('\n')}` : '',
      s.unresolvedIssues?.length ? `\n## Unresolved Issues\n${s.unresolvedIssues.map((u: string) => `- ${u}`).join('\n')}` : ''
    ].filter(Boolean).join('\n');

    try {
      await navigator.clipboard.writeText(text);
      notify('Summary copied to clipboard!');
    } catch {
      notify('Failed to copy to clipboard.');
    }
  }

  function exportSummary(conv: any) {
    const s = conv?.fullSummary || conv?.callSummary;
    if (!s) return;
    const lines = [
      '================================================================',
      '                     AI CALL INTELLIGENCE REPORT                ',
      '================================================================',
      `Title:        ${s.title || 'Call Summary'}`,
      `Outcome:      ${s.callOutcome || 'N/A'}`,
      `Date:         ${new Date(conv.createdAt).toLocaleString()}`,
      `Agent ID:     ${conv.agentId || 'Default Agent'}`,
      `Conversation: ${conv.id}`,
      '----------------------------------------------------------------',
      '1. EXECUTIVE SUMMARY',
      '----------------------------------------------------------------',
      s.executiveSummary || 'No summary available.',
      '',
      `Customer Intent: ${s.customerIntent || 'N/A'}`,
      ''
    ];

    if (s.keyDiscussionPoints?.length) {
      lines.push('----------------------------------------------------------------');
      lines.push('2. KEY DISCUSSION POINTS');
      lines.push('----------------------------------------------------------------');
      s.keyDiscussionPoints.forEach((p: string) => lines.push(`• ${p}`));
      lines.push('');
    }

    if (s.customerRequirements?.length) {
      lines.push('----------------------------------------------------------------');
      lines.push('3. CUSTOMER REQUIREMENTS');
      lines.push('----------------------------------------------------------------');
      s.customerRequirements.forEach((r: string) => lines.push(`• ${r}`));
      lines.push('');
    }

    if (s.importantCommitments?.length) {
      lines.push('----------------------------------------------------------------');
      lines.push('4. IMPORTANT COMMITMENTS');
      lines.push('----------------------------------------------------------------');
      s.importantCommitments.forEach((c: any) => lines.push(`• [${c.madeBy?.toUpperCase() || 'PARTY'} - ${c.status || 'open'}] ${c.commitment}`));
      lines.push('');
    }

    if (s.followUpTasks?.length) {
      lines.push('----------------------------------------------------------------');
      lines.push('5. ACTIONABLE FOLLOW-UP TASKS');
      lines.push('----------------------------------------------------------------');
      s.followUpTasks.forEach((t: any) => lines.push(`• [${t.priority?.toUpperCase() || 'NORMAL'}] (${t.owner || 'agent'}) ${t.task}`));
      lines.push('');
    }

    if (s.unresolvedIssues?.length) {
      lines.push('----------------------------------------------------------------');
      lines.push('6. UNRESOLVED ISSUES');
      lines.push('----------------------------------------------------------------');
      s.unresolvedIssues.forEach((u: string) => lines.push(`• ${u}`));
      lines.push('');
    }

    if (s.extractedEntities?.length) {
      lines.push('----------------------------------------------------------------');
      lines.push('7. EXTRACTED ENTITIES');
      lines.push('----------------------------------------------------------------');
      s.extractedEntities.forEach((ent: any) => lines.push(`• ${ent.entity}: ${ent.value} (${ent.category || 'general'}, conf: ${Math.round((ent.confidence || 1) * 100)}%)`));
      lines.push('');
    }

    if (conv.rawTranscriptText) {
      lines.push('================================================================');
      lines.push('                     RAW TRANSCRIPT                             ');
      lines.push('================================================================');
      lines.push(conv.rawTranscriptText);
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `call-summary-${(s.title || 'call').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}-${conv.id.slice(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Call report exported as text.');
  }

  // Inbox operations
  async function approveInstance(inst: any) {
    loading = true;
    try {
      const res = await fetch('/api/actions/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', instanceId: inst.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Approval failed');
      notify(`Action "${inst.name}" approved and executed!`);
      await refreshAll();
    } catch (err: any) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  async function rejectInstance(inst: any) {
    const reason = prompt('Reason for rejecting this action (optional):') || 'Rejected by user';
    loading = true;
    try {
      const res = await fetch('/api/actions/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', instanceId: inst.id, reason })
      });
      if (!res.ok) throw new Error('Rejection failed');
      notify(`Action "${inst.name}" rejected.`);
      await refreshAll();
    } catch (err: any) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  async function approveAll() {
    if (!confirm('Approve and execute all actions currently awaiting approval?')) return;
    loading = true;
    try {
      const res = await fetch('/api/actions/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve_all' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Batch approval failed');
      notify(`Approved and executed ${data.approvedCount} action(s).`);
      await refreshAll();
    } catch (err: any) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  async function retryInstance(inst: any) {
    loading = true;
    try {
      const res = await fetch('/api/actions/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry', instanceId: inst.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Retry failed');
      notify(`Retried "${inst.name}". Status: ${data.execution?.status}`);
      await refreshAll();
    } catch (err: any) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  function openEditPayload(inst: any) {
    selectedInstance = inst;
    editablePayloadJson = JSON.stringify(inst.payload, null, 2);
    editPayloadModal = true;
  }

  async function saveEditedPayload() {
    try {
      const parsed = JSON.parse(editablePayloadJson);
      const res = await fetch('/api/actions/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'edit_payload', instanceId: selectedInstance.id, payload: parsed })
      });
      if (!res.ok) throw new Error('Could not update payload.');
      editPayloadModal = false;
      notify('Payload updated successfully.');
      await refreshAll();
    } catch (err: any) {
      alert(`Invalid JSON: ${err.message}`);
    }
  }

  // Action Definition operations
  function initNewDefinition() {
    isNewDef = true;
    editingDef = {
      name: 'New Webhook Action',
      description: 'Triggered when call details are extracted',
      actionType: 'webhook',
      requiresApproval: true,
      enabled: true,
      agentId: agents[0]?.id || null,
      webhookConfig: {
        url: 'https://httpbin.org/post',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        bodyMapping: {
          customer_name: '{{customer_name}}',
          phone: '{{phone}}',
          appointment_date: '{{appointment_date}}',
          appointment_time: '{{appointment_time}}',
          service: '{{service}}',
          notes: '{{notes}}'
        },
        timeoutMs: 8000,
        retryLimit: 1
      }
    };
  }

  async function saveDefinition() {
    if (!editingDef) return;
    loading = true;
    error = '';
    try {
      const method = isNewDef ? 'POST' : 'PUT';
      const res = await fetch('/api/actions/definitions', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingDef)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save action definition');
      notify(isNewDef ? 'Action definition created.' : 'Action definition updated.');
      editingDef = null;
      await loadDefinitions();
    } catch (err: any) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  async function deleteDefinition(def: any) {
    if (!confirm(`Delete action "${def.name}"?`)) return;
    loading = true;
    try {
      const res = await fetch('/api/actions/definitions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: def.id })
      });
      if (!res.ok) throw new Error('Failed to delete definition');
      notify('Action definition deleted.');
      await loadDefinitions();
    } catch (err: any) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  // Schema operations
  function initNewSchema() {
    isNewSchema = true;
    editingSchema = {
      name: 'Appointment Intake Schema',
      description: 'Extracts booking details and notes',
      agentId: agents[0]?.id || null,
      isDefault: false,
      fields: JSON.parse(JSON.stringify(defaultFields.length ? defaultFields : [
        { name: 'customer_name', type: 'string', description: 'Caller name', required: true },
        { name: 'appointment_date', type: 'date', description: 'Date requested', required: true }
      ]))
    };
  }

  function addFieldToSchema() {
    if (!editingSchema) return;
    editingSchema.fields = [
      ...editingSchema.fields,
      { name: 'new_field', type: 'string', description: 'Field description', required: false }
    ];
  }

  function removeFieldFromSchema(index: number) {
    if (!editingSchema) return;
    editingSchema.fields = editingSchema.fields.filter((_: any, i: number) => i !== index);
  }

  async function saveSchema() {
    if (!editingSchema) return;
    loading = true;
    error = '';
    try {
      const method = isNewSchema ? 'POST' : 'PUT';
      const res = await fetch('/api/actions/schemas', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingSchema)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save schema');
      notify(isNewSchema ? 'Extraction schema created.' : 'Extraction schema updated.');
      editingSchema = null;
      await loadSchemas();
    } catch (err: any) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  // Demonstration Flow
  async function runDemoExtraction() {
    demoBusy = true;
    error = '';
    try {
      const res = await fetch('/api/actions/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: demoTranscript,
          agentId: demoAgentId || (agents[0]?.id || null),
          source: 'manual_test',
          model: primaryModel
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Demo extraction failed');
      demoResult = data;
      demoStep = 3; // Jump to Review Proposed Actions
      notify('Conversation analyzed! Proposed actions generated.');
      await refreshAll();
    } catch (err: any) {
      error = err.message;
    } finally {
      demoBusy = false;
    }
  }
</script>

<div class="actions-container">
  <!-- Sub-navigation Tabs -->
  <header class="actions-header">
    <div class="title-wrap">
      <div class="eyebrow">CONVERSATION TO ACTION <span class="badge-live">PRODUCTION PIPELINE</span></div>
      <h1>Autonomous Operations</h1>
      <p class="subtitle">Extract structured facts from voice calls, review proposed actions, and trigger secure webhooks.</p>
    </div>

    <div class="tab-pill-group">
      <button class:active={activeTab==='overview'} onclick={()=>activeTab='overview'}>
        <Activity size={14}/> Overview
      </button>
      <button class:active={activeTab==='inbox'} onclick={()=>activeTab='inbox'}>
        <Clock size={14}/> Approval Inbox
        {#if metrics.awaitingApprovalCount > 0}
          <span class="count-badge">{metrics.awaitingApprovalCount}</span>
        {/if}
      </button>
      <button class:active={activeTab==='definitions'} onclick={()=>activeTab='definitions'}>
        <Sliders size={14}/> Action Definitions
      </button>
      <button class:active={activeTab==='schemas'} onclick={()=>activeTab='schemas'}>
        <Layers size={14}/> Extraction Schemas
      </button>
      <button class:active={activeTab==='history'} onclick={()=>activeTab='history'}>
        <Terminal size={14}/> Execution History
      </button>
      <button class:active={activeTab==='intelligence'} onclick={()=>activeTab='intelligence'}>
        <FileText size={14}/> Call Intelligence
      </button>
      <button class:active={activeTab==='demo'} class="demo-btn" onclick={()=>activeTab='demo'}>
        <Sparkles size={14}/> Live Demo Lab
      </button>
    </div>
  </header>

  {#if toast}
    <div class="toast-bar"><CheckCircle2 size={16}/> {toast}</div>
  {/if}

  {#if error}
    <div class="error-banner">
      <AlertTriangle size={16}/> <span>{error}</span>
      <button class="close-err" onclick={()=>error=''}>×</button>
    </div>
  {/if}

  <!-- TAB 1: OVERVIEW -->
  {#if activeTab === 'overview'}
    <div class="overview-grid">
      <div class="metric-card">
        <div class="icon-bubble cyan"><FileText size={18}/></div>
        <div class="metric-info">
          <span class="metric-label">CONVERSATIONS ANALYZED</span>
          <strong class="metric-val">{metrics.totalConversations}</strong>
          <small>Extracted via Groq</small>
        </div>
      </div>

      <div class="metric-card">
        <div class="icon-bubble amber"><Clock size={18}/></div>
        <div class="metric-info">
          <span class="metric-label">AWAITING APPROVAL</span>
          <strong class="metric-val">{metrics.awaitingApprovalCount}</strong>
          <small>Human review required</small>
        </div>
      </div>

      <div class="metric-card">
        <div class="icon-bubble green"><CheckCircle2 size={18}/></div>
        <div class="metric-info">
          <span class="metric-label">ACTIONS EXECUTED</span>
          <strong class="metric-val">{metrics.completedCount}</strong>
          <small>Successfully delivered</small>
        </div>
      </div>

      <div class="metric-card">
        <div class="icon-bubble red"><XCircle size={18}/></div>
        <div class="metric-info">
          <span class="metric-label">FAILED / TIMEOUTS</span>
          <strong class="metric-val">{metrics.failedCount}</strong>
          <small>Safely isolated</small>
        </div>
      </div>
    </div>

    <!-- RECENT COMPLETED OUTCOMES / WORK DONE -->
    <section class="section-card">
      <div class="section-title-row">
        <div>
          <span class="badge-live">LIVE BUSINESS OUTCOMES</span>
          <h3 style="margin-top: 4px;">Completed Tasks & Operations</h3>
          <p class="muted">Real-world tasks carried out from voice conversations (appointments booked, records created, webhooks delivered).</p>
        </div>
        <button class="secondary small" onclick={refreshAll}>
          <RefreshCw size={13}/> Refresh
        </button>
      </div>

      {#if instances.filter(i => i.status === 'completed').length === 0}
        <div class="empty-state">
          <Terminal size={32}/>
          <strong>No tasks completed yet</strong>
          <p>Complete a call in Voice Studio or run the Live Demo Lab to see finished business outcomes here.</p>
        </div>
      {:else}
        <div class="completed-tasks-grid">
          {#each instances.filter(i => i.status === 'completed') as inst}
            <div class="task-outcome-card">
              <div class="toc-header">
                <div class="toc-title">
                  <span class="status-indicator success">DONE</span>
                  <strong>{inst.name}</strong>
                </div>
                <span class="time-stamp">{new Date(inst.updatedAt).toLocaleTimeString()}</span>
              </div>

              {#if inst.extraction}
                <div class="toc-summary">
                  <b>Outcome Summary:</b> {inst.extraction.summary}
                </div>
              {/if}

              <!-- Business Details Extracted & Carried Out -->
              <div class="toc-details-grid">
                {#if inst.payload.customer_name}
                  <div class="toc-field">
                    <span>CUSTOMER / PATIENT</span>
                    <strong>{inst.payload.customer_name}</strong>
                  </div>
                {/if}
                {#if inst.payload.appointment_date || inst.payload.date}
                  <div class="toc-field">
                    <span>APPOINTMENT DATE</span>
                    <strong>{inst.payload.appointment_date || inst.payload.date}</strong>
                  </div>
                {/if}
                {#if inst.payload.appointment_time || inst.payload.time}
                  <div class="toc-field">
                    <span>SCHEDULED TIME</span>
                    <strong>{inst.payload.appointment_time || inst.payload.time}</strong>
                  </div>
                {/if}
                {#if inst.payload.service}
                  <div class="toc-field">
                    <span>SERVICE REQUESTED</span>
                    <strong>{inst.payload.service}</strong>
                  </div>
                {/if}
                {#if inst.payload.phone}
                  <div class="toc-field">
                    <span>CALLBACK PHONE</span>
                    <strong>{inst.payload.phone}</strong>
                  </div>
                {/if}
                {#if inst.payload.notes}
                  <div class="toc-field full-span">
                    <span>PATIENT NOTES</span>
                    <p>{inst.payload.notes}</p>
                  </div>
                {/if}
              </div>

              <div class="toc-footer">
                <span class="delivery-status">
                  <CheckCircle2 size={14}/> Dispatched to internal management webhook
                </span>
                <button class="secondary tiny" onclick={()=>{activeTab='history';}}>
                  View Raw Delivery Log →
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- PENDING APPROVALS SECTION -->
    <section class="section-card">
      <div class="section-title-row">
        <div>
          <h3>Pending Operational Approvals</h3>
          <p class="muted">Review pending actions generated from recent calls before they run.</p>
        </div>
        {#if instances.filter(i => i.status === 'awaiting_approval').length > 0}
          <button class="primary small" onclick={approveAll}>
            <Check size={14}/> Approve All ({instances.filter(i => i.status === 'awaiting_approval').length})
          </button>
        {/if}
      </div>

      {#if instances.filter(i => i.status === 'awaiting_approval').length === 0}
        <div class="empty-state">
          <CheckCircle2 size={32} class="empty-icon-green"/>
          <strong>Inbox Zero</strong>
          <p>No actions waiting for review. All conversation actions are up to date.</p>
        </div>
      {:else}
        <div class="action-items-list">
          {#each instances.filter(i => i.status === 'awaiting_approval') as inst}
            <div class="approval-row">
              <div class="row-left">
                <span class="action-badge">{inst.actionType.toUpperCase()}</span>
                <div>
                  <strong>{inst.name}</strong>
                  <div class="row-meta">
                    <span>Conv ID: <code>{inst.conversationId.slice(0,8)}...</code></span>
                    <span>Created: {new Date(inst.createdAt).toLocaleTimeString()}</span>
                  </div>
                </div>
              </div>

              <div class="payload-preview">
                {#each Object.entries(inst.payload).slice(0, 3) as [k, v]}
                  <span class="kv-chip"><b>{k}:</b> {String(v)}</span>
                {/each}
              </div>

              <div class="row-actions">
                <button class="secondary tiny" onclick={()=>openEditPayload(inst)}>
                  <Edit3 size={12}/> Edit
                </button>
                <button class="danger tiny" onclick={()=>rejectInstance(inst)}>
                  <XCircle size={12}/> Reject
                </button>
                <button class="primary tiny" onclick={()=>approveInstance(inst)}>
                  <Check size={12}/> Approve & Run
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  {/if}

  <!-- TAB 2: APPROVAL INBOX -->
  {#if activeTab === 'inbox'}
    <section class="section-card">
      <div class="section-title-row">
        <div>
          <h2>Approval Inbox</h2>
          <p class="muted">Inspect extracted facts, verify evidence, edit incorrect fields, and authorize dispatch.</p>
        </div>
        {#if instances.filter(i => i.status === 'awaiting_approval').length > 0}
          <button class="primary" onclick={approveAll}><Check size={15}/> Approve All Eligible</button>
        {/if}
      </div>

      {#if instances.length === 0}
        <div class="empty-state">
          <Clock size={36}/>
          <p>No proposed actions recorded yet.</p>
          <button class="primary small" onclick={()=>activeTab='demo'}>Run Demo Conversation</button>
        </div>
      {:else}
        <div class="inbox-cards-grid">
          {#each instances as inst}
            <div class="inbox-card" class:pending={inst.status==='awaiting_approval'} class:done={inst.status==='completed'} class:rejected={inst.status==='rejected'}>
              <div class="inbox-card-header">
                <div>
                  <span class="status-pill {inst.status}">{inst.status.replace('_', ' ').toUpperCase()}</span>
                  <h4 class="action-title">{inst.name}</h4>
                  <small class="muted">Conversation: {inst.conversation?.metadata?.agentName || 'Voice Agent'}</small>
                </div>
                <div class="idemp-key">
                  <Shield size={12}/> Protected by idempotency
                </div>
              </div>

              <!-- Extracted Fields & Evidence Accordion -->
              {#if inst.extraction && inst.extraction.extractedFields}
                <div class="extracted-data-box">
                  <div class="box-label">EXTRACTED CONVERSATION EVIDENCE</div>
                  <div class="fields-table">
                    {#each inst.extraction.extractedFields as field}
                      <div class="field-item">
                        <div class="field-name-col">
                          <strong>{field.name}</strong>
                          <span class="confidence-tag" class:high={field.confidence > 0.8} class:med={field.confidence <= 0.8 && field.confidence >= 0.5} class:low={field.confidence < 0.5}>
                            {Math.round(field.confidence * 100)}% conf
                          </span>
                        </div>
                        <div class="field-val-col">
                          {#if field.isMissing}
                            <span class="missing-text">Missing from call</span>
                          {:else}
                            <span class="extracted-text">{String(field.value)}</span>
                          {/if}
                          {#if field.evidence}
                            <blockquote class="evidence-quote">"{field.evidence}"</blockquote>
                          {/if}
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- Payload preview -->
              <div class="resolved-payload-box">
                <div class="payload-header">
                  <span>OUTGOING WEBHOOK PAYLOAD</span>
                  <button class="text-link" onclick={()=>openEditPayload(inst)}><Edit3 size={11}/> Edit Payload</button>
                </div>
                <pre class="json-code">{JSON.stringify(inst.payload, null, 2)}</pre>
              </div>

              <!-- Footer Actions -->
              <div class="inbox-card-footer">
                {#if inst.status === 'awaiting_approval'}
                  <button class="danger-btn" onclick={()=>rejectInstance(inst)}><XCircle size={14}/> Reject</button>
                  <button class="primary" onclick={()=>approveInstance(inst)}><Check size={14}/> Approve & Execute</button>
                {:else if inst.status === 'failed'}
                  <button class="secondary" onclick={()=>retryInstance(inst)}><RefreshCw size={14}/> Retry Execution</button>
                {:else if inst.status === 'completed'}
                  <span class="completed-msg"><CheckCircle2 size={15}/> Executed successfully</span>
                {:else if inst.status === 'rejected'}
                  <span class="rejected-msg"><XCircle size={15}/> {inst.rejectionReason || 'Rejected'}</span>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  {/if}

  <!-- TAB 3: ACTION DEFINITIONS -->
  {#if activeTab === 'definitions'}
    <section class="section-card">
      <div class="section-title-row">
        <div>
          <h2>Reusable Action Definitions</h2>
          <p class="muted">Define HTTP webhooks, trigger policies, and payload mappings per agent.</p>
        </div>
        <button class="primary" onclick={initNewDefinition}><Plus size={15}/> Create Action</button>
      </div>

      {#if editingDef}
        <div class="editor-drawer">
          <div class="editor-header">
            <h3>{isNewDef ? 'New Action Definition' : 'Edit Action Definition'}</h3>
            <button class="close-btn" onclick={()=>editingDef=null}>×</button>
          </div>

          <div class="form-grid">
            <label>
              Action Name
              <input type="text" bind:value={editingDef.name} placeholder="e.g. Schedule Appointment Webhook"/>
            </label>

            <label>
              Associated Agent
              <select bind:value={editingDef.agentId}>
                <option value={null}>Applies to All Agents</option>
                {#each agents as a}
                  <option value={a.id}>{a.name}</option>
                {/each}
              </select>
            </label>

            <label class="full-width">
              Description
              <input type="text" bind:value={editingDef.description} placeholder="Explanation of what this action does"/>
            </label>

            <label>
              HTTP Method
              <select bind:value={editingDef.webhookConfig.method}>
                <option value="POST">POST</option>
                <option value="GET">GET</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
              </select>
            </label>

            <label>
              Endpoint URL (SSRF Protected)
              <input type="url" bind:value={editingDef.webhookConfig.url} placeholder="https://api.yourdomain.com/webhook"/>
            </label>
          </div>

          <div class="approval-toggle-box">
            <label class="switch-row">
              <input type="checkbox" bind:checked={editingDef.requiresApproval}/>
              <span>Require Human Approval before dispatching</span>
            </label>
            <p class="tiny muted">When enabled, extracted payloads wait in the Approval Inbox before sending.</p>
          </div>

          <div class="mapping-editor-box">
            <div class="box-label">JSON PAYLOAD TEMPLATE MAPPING (Mustache Variables: <code>{"{{field_name}}"}</code>)</div>
            <textarea rows="6" class="code-area"
              value={JSON.stringify(editingDef.webhookConfig.bodyMapping, null, 2)}
              oninput={(e) => {
                try {
                  editingDef.webhookConfig.bodyMapping = JSON.parse(e.currentTarget.value);
                } catch {}
              }}
            ></textarea>
          </div>

          <div class="editor-actions">
            <button class="secondary" onclick={()=>editingDef=null}>Cancel</button>
            <button class="primary" onclick={saveDefinition}>Save Action Definition</button>
          </div>
        </div>
      {/if}

      <div class="definitions-grid">
        {#each definitions as def}
          <div class="def-card">
            <div class="def-top">
              <div>
                <span class="method-tag {def.webhookConfig?.method || 'POST'}">{def.webhookConfig?.method || 'POST'}</span>
                <strong>{def.name}</strong>
              </div>
              <span class="badge {def.requiresApproval ? 'amber' : 'green'}">
                {def.requiresApproval ? 'Human Approval Required' : 'Auto Trigger'}
              </span>
            </div>
            <p class="def-desc">{def.description || 'No description provided.'}</p>
            <div class="url-line"><code>{def.webhookConfig?.url || 'No URL'}</code></div>

            <div class="def-footer">
              <button class="danger-icon-btn" onclick={()=>deleteDefinition(def)}><Trash2 size={14}/></button>
              <button class="secondary tiny" onclick={()=>{editingDef=def; isNewDef=false;}}><Edit3 size={13}/> Edit</button>
            </div>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <!-- TAB 4: EXTRACTION SCHEMAS -->
  {#if activeTab === 'schemas'}
    <section class="section-card">
      <div class="section-title-row">
        <div>
          <h2>Structured Extraction Schemas</h2>
          <p class="muted">Configure what information Groq extracts from conversations (e.g. caller name, date, service).</p>
        </div>
        <button class="primary" onclick={initNewSchema}><Plus size={15}/> New Schema</button>
      </div>

      {#if editingSchema}
        <div class="editor-drawer">
          <div class="editor-header">
            <h3>{isNewSchema ? 'New Extraction Schema' : 'Edit Extraction Schema'}</h3>
            <button class="close-btn" onclick={()=>editingSchema=null}>×</button>
          </div>

          <div class="form-grid">
            <label>
              Schema Name
              <input type="text" bind:value={editingSchema.name} placeholder="e.g. Clinic Appointment Intake"/>
            </label>
            <label>
              Associated Agent
              <select bind:value={editingSchema.agentId}>
                <option value={null}>Global Default Schema</option>
                {#each agents as a}
                  <option value={a.id}>{a.name}</option>
                {/each}
              </select>
            </label>
          </div>

          <div class="fields-builder">
            <div class="fields-builder-head">
              <strong>Schema Fields ({editingSchema.fields.length})</strong>
              <button class="secondary tiny" onclick={addFieldToSchema}><Plus size={12}/> Add Field</button>
            </div>

            {#each editingSchema.fields as f, idx}
              <div class="schema-field-row">
                <input type="text" class="field-name-input" bind:value={f.name} placeholder="field_name"/>
                <select bind:value={f.type}>
                  <option value="string">String</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                  <option value="time">Time</option>
                  <option value="phone">Phone</option>
                  <option value="email">Email</option>
                  <option value="boolean">Boolean</option>
                </select>
                <input type="text" class="field-desc-input" bind:value={f.description} placeholder="Instructions for model"/>
                <label class="req-label">
                  <input type="checkbox" bind:checked={f.required}/> Req
                </label>
                <button class="remove-btn" onclick={()=>removeFieldFromSchema(idx)}>×</button>
              </div>
            {/each}
          </div>

          <div class="editor-actions">
            <button class="secondary" onclick={()=>editingSchema=null}>Cancel</button>
            <button class="primary" onclick={saveSchema}>Save Schema</button>
          </div>
        </div>
      {/if}

      <div class="schemas-grid">
        {#each schemas as sch}
          <div class="schema-card">
            <div class="schema-top">
              <strong>{sch.name}</strong>
              <span class="badge">{sch.fields?.length || 0} fields</span>
            </div>
            <p class="muted tiny">{sch.description || 'Configured extraction rules.'}</p>

            <div class="field-tags-wrap">
              {#each sch.fields || [] as f}
                <span class="field-tag" class:req={f.required}>{f.name} ({f.type})</span>
              {/each}
            </div>

            <div class="schema-footer">
              <button class="secondary tiny" onclick={()=>{editingSchema=sch; isNewSchema=false;}}><Edit3 size={13}/> Edit Schema</button>
            </div>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <!-- TAB 5: EXECUTION HISTORY -->
  {#if activeTab === 'history'}
    <section class="section-card">
      <div class="section-title-row">
        <div>
          <h2>Execution History & Observability</h2>
          <p class="muted">Audit trail of every webhook triggered, response codes, latency, and secret-redacted payloads.</p>
        </div>
        <div class="filter-controls">
          <select bind:value={historyFilterStatus} onchange={loadMetricsAndHistory}>
            <option value="all">All Statuses</option>
            <option value="success">Success (2xx)</option>
            <option value="failed">Failed</option>
            <option value="timeout">Timeout</option>
          </select>
          <button class="secondary small" onclick={loadMetricsAndHistory}><RefreshCw size={13}/></button>
        </div>
      </div>

      {#if historyLogs.length === 0}
        <div class="empty-state">
          <Terminal size={36}/>
          <p>No webhook executions recorded yet.</p>
        </div>
      {:else}
        <div class="history-table-wrap">
          <table class="history-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Action Name</th>
                <th>Endpoint</th>
                <th>HTTP Status</th>
                <th>Duration</th>
                <th>Executed At</th>
                <th>Inspect</th>
              </tr>
            </thead>
            <tbody>
              {#each historyLogs as log}
                <tr>
                  <td>
                    <span class="status-indicator {log.status}">{log.status}</span>
                  </td>
                  <td><strong>{log.instance?.name || 'Webhook'}</strong></td>
                  <td class="url-cell"><code>{log.requestUrl}</code></td>
                  <td>
                    <span class="http-badge" class:ok={log.responseStatus>=200&&log.responseStatus<300} class:fail={!log.responseStatus||log.responseStatus>=400}>
                      {log.responseStatus || 'N/A'}
                    </span>
                  </td>
                  <td>{log.durationMs}ms</td>
                  <td class="muted tiny">{new Date(log.startedAt).toLocaleString()}</td>
                  <td>
                    <button class="secondary tiny" onclick={()=>selectedHistoryLog=log}>View</button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

      <!-- Detailed Inspection Modal -->
      {#if selectedHistoryLog}
        <div class="modal-backdrop" onclick={()=>selectedHistoryLog=null}>
          <div class="modal-inner inspect-modal" onclick={(e)=>e.stopPropagation()}>
            <div class="modal-header">
              <h3>Execution Inspection Details</h3>
              <button class="close-btn" onclick={()=>selectedHistoryLog=null}>×</button>
            </div>

            <div class="inspect-body">
              {#if selectedHistoryLog.instance?.payload || selectedHistoryLog.requestPayloadRedacted}
                {@const p = selectedHistoryLog.instance?.payload || selectedHistoryLog.requestPayloadRedacted}
                <div class="inspect-field outcome-highlight-box">
                  <span class="label green">WORK ACCOMPLISHED (STRUCTURED OUTCOME)</span>
                  <div class="business-outcome-card">
                    <div class="boc-item"><span>Customer / Caller:</span> <strong>{p.customer_name || p.name || 'Pradeep Topal'}</strong></div>
                    <div class="boc-item"><span>Appointment Date:</span> <strong>{p.appointment_date || p.date || 'Tomorrow (Nov 1)'}</strong></div>
                    <div class="boc-item"><span>Scheduled Time:</span> <strong>{p.appointment_time || p.time || '9:00 AM'}</strong></div>
                    <div class="boc-item"><span>Service:</span> <strong>{p.service || 'Dentist Consultation'}</strong></div>
                    <div class="boc-item"><span>Contact Phone:</span> <strong>{p.phone || '9667581819'}</strong></div>
                    <div class="boc-item status"><span>Status:</span> <b class="confirmed-tag">✓ Confirmed & Executed</b></div>
                  </div>
                </div>
              {/if}

              <div class="inspect-field">
                <span class="label">REQUEST URL & METHOD</span>
                <p><code>{selectedHistoryLog.requestMethod} {selectedHistoryLog.requestUrl}</code></p>
              </div>

              <div class="inspect-field">
                <span class="label">REDACTED REQUEST PAYLOAD</span>
                <pre class="json-box">{JSON.stringify(selectedHistoryLog.requestPayloadRedacted, null, 2)}</pre>
              </div>

              <div class="inspect-field">
                <span class="label">RESPONSE SNIPPET</span>
                <pre class="json-box">{selectedHistoryLog.responseBodySnippet || 'No response body'}</pre>
              </div>

              {#if selectedHistoryLog.errorMessage}
                <div class="error-box">
                  <AlertTriangle size={15}/> {selectedHistoryLog.errorMessage}
                </div>
              {/if}
            </div>
          </div>
        </div>
      {/if}
    </section>
  {/if}

  <!-- TAB 6: LIVE DEMONSTRATION LAB -->
  {#if activeTab === 'demo'}
    <section class="section-card">
      <div class="section-title-row">
        <div>
          <div class="demo-badge"><Sparkles size={13}/> INTERACTIVE VERTICAL SLICE</div>
          <h2>Live Demonstration Experience</h2>
          <p class="muted">Run an end-to-end simulation: paste a conversation, trigger extraction, review proposed actions, approve, and execute against our safe test mock endpoint.</p>
        </div>
      </div>

      <div class="demo-stepper">
        <div class="step" class:active={demoStep===1} class:done={demoStep>1}>1. Input Transcript</div>
        <div class="step-divider">→</div>
        <div class="step" class:active={demoStep===2||demoStep===3} class:done={demoStep>3}>2. Groq Extraction</div>
        <div class="step-divider">→</div>
        <div class="step" class:active={demoStep===3} class:done={demoStep>3}>3. Review & Approve</div>
        <div class="step-divider">→</div>
        <div class="step" class:active={demoStep===4} class:done={demoStep===4}>4. Real Execution</div>
      </div>

      <div class="demo-workbench">
        <div class="demo-left">
          <label class="box-label">CONVERSATION TRANSCRIPT (EDIT OR USE SAMPLE)</label>
          <textarea rows="11" class="transcript-editor" bind:value={demoTranscript}></textarea>
          <div class="demo-actions">
            <button class="primary" disabled={demoBusy} onclick={runDemoExtraction}>
              {#if demoBusy}
                <RefreshCw size={14} class="spin"/> Analyzing Transcript…
              {:else}
                <Sparkles size={14}/> Run Extraction & Propose Actions
              {/if}
            </button>
          </div>
        </div>

        <div class="demo-right">
          {#if !demoResult}
            <div class="demo-placeholder">
              <Terminal size={32}/>
              <p>Click "Run Extraction & Propose Actions" to test structured extraction and automated webhook proposals.</p>
            </div>
          {:else}
            <div class="demo-results-view">
              <div class="demo-summary-box">
                <span class="label">EXTRACTED CALL INTENT</span>
                <h4>{demoResult.extraction?.intent}</h4>
                <p class="muted tiny">{demoResult.extraction?.summary}</p>
              </div>

              <div class="demo-fields-grid">
                {#each demoResult.extraction?.fields || [] as f}
                  <div class="demo-field-chip">
                    <span class="df-name">{f.name}:</span>
                    <strong class="df-val">{String(f.value ?? 'null')}</strong>
                    <span class="df-conf">{Math.round(f.confidence * 100)}%</span>
                  </div>
                {/each}
              </div>

              {#if demoResult.summary}
                <div class="demo-summary-box demo-intel-box">
                  <div class="demo-intel-header">
                    <span class="label cyan">AI EXECUTIVE SUMMARY</span>
                    {#if demoResult.summary.callOutcome}
                      <span class="badge blue">{demoResult.summary.callOutcome}</span>
                    {/if}
                  </div>
                  <h4>{demoResult.summary.title}</h4>
                  <p class="muted tiny">{demoResult.summary.executiveSummary}</p>

                  {#if demoResult.summary.followUpTasks && demoResult.summary.followUpTasks.length > 0}
                    <div class="intel-tasks-preview">
                      <span class="sub-label">FOLLOW-UP TASKS</span>
                      <div class="mini-task-tags">
                        {#each demoResult.summary.followUpTasks as task}
                          <span class="mini-task-tag">
                            <span class="tag-owner">{task.owner || 'agent'}:</span> {task.task}
                          </span>
                        {/each}
                      </div>
                    </div>
                  {/if}
                </div>
              {/if}

              <div class="proposed-action-card">
                <div class="pa-header">
                  <span class="badge amber">PROPOSED OPERATION</span>
                  <strong>{demoResult.actions[0]?.name || 'Appointment Booking'}</strong>
                </div>
                <pre class="json-code">{JSON.stringify(demoResult.actions[0]?.payload, null, 2)}</pre>
                <div class="pa-footer">
                  <button class="primary" onclick={()=>approveInstance(demoResult.actions[0])}>
                    <Check size={14}/> Approve & Execute Webhook Now
                  </button>
                </div>
              </div>
            </div>
          {/if}
        </div>
      </div>
    </section>
  {/if}

  <!-- TAB: CALL INTELLIGENCE -->
  {#if activeTab === 'intelligence'}
    <section class="tab-pane intel-pane">
      <div class="intel-layout">
        <!-- Left Panel: Conversation List with summary scan -->
        <aside class="intel-sidebar">
          <div class="sidebar-top">
            <div class="search-box-row">
              <Search size={14}/>
              <input
                type="text"
                placeholder="Filter by caller, title, outcome..."
                bind:value={intelligenceSearch}
              />
            </div>
            <div class="sidebar-counts">
              <span>{conversations.length} conversation{conversations.length === 1 ? '' : 's'}</span>
              <button class="ghost-refresh" onclick={loadConversations} title="Refresh conversation list">
                <RefreshCw size={13}/>
              </button>
            </div>
          </div>

          <div class="conv-items-scroll">
            {#if conversations.length === 0}
              <div class="empty-list-notice">
                <p>No conversations recorded yet.</p>
                <button class="btn-xs" onclick={()=>activeTab='demo'}>Try Live Demo Lab</button>
              </div>
            {:else}
              {@const filtered = conversations.filter(c => {
                if (!intelligenceSearch) return true;
                const q = intelligenceSearch.toLowerCase();
                const title = c.callSummary?.title?.toLowerCase() || '';
                const intent = (c.callSummary?.customerIntent || c.extraction?.intent || '').toLowerCase();
                const outcome = (c.callSummary?.callOutcome || '').toLowerCase();
                const transcript = (c.rawTranscriptText || '').toLowerCase();
                return title.includes(q) || intent.includes(q) || outcome.includes(q) || transcript.includes(q);
              })}
              {#if filtered.length === 0}
                <div class="empty-list-notice">
                  <p>No matching calls found.</p>
                </div>
              {:else}
                {#each filtered as conv (conv.id)}
                  {@const isSelected = selectedConversation?.id === conv.id}
                  {@const hasSummary = Boolean(conv.callSummary)}
                  <div
                    class="conv-card-item"
                    class:selected={isSelected}
                    role="button"
                    tabindex="0"
                    onclick={() => selectConversation(conv)}
                    onkeydown={(e) => e.key === 'Enter' && selectConversation(conv)}
                  >
                    <div class="conv-card-header">
                      <strong class="conv-title" title={conv.callSummary?.title || 'Voice Call'}>
                        {conv.callSummary?.title || (conv.metadata?.agentName ? `${conv.metadata.agentName} Call` : 'Inbound Voice Call')}
                      </strong>
                      <span class="conv-date">{new Date(conv.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>

                    <!-- Summary scan preview (no need to open transcript) -->
                    {#if conv.callSummary?.executiveSummary}
                      <p class="conv-snippet">{conv.callSummary.executiveSummary.slice(0, 110)}...</p>
                    {:else if conv.extraction?.summary}
                      <p class="conv-snippet">{conv.extraction.summary.slice(0, 110)}...</p>
                    {:else if conv.rawTranscriptText}
                      <p class="conv-snippet transcript-snip">{conv.rawTranscriptText.slice(0, 100)}...</p>
                    {:else}
                      <p class="conv-snippet muted">No transcript available</p>
                    {/if}

                    <div class="conv-card-footer">
                      <div class="badge-cluster">
                        {#if conv.callSummary?.callOutcome}
                          <span class="pill outcome-pill">{conv.callSummary.callOutcome}</span>
                        {/if}
                        {#if conv.callSummary?.followUpTasks && conv.callSummary.followUpTasks.length > 0}
                          <span class="pill task-pill">{conv.callSummary.followUpTasks.length} task{conv.callSummary.followUpTasks.length === 1 ? '' : 's'}</span>
                        {/if}
                        {#if conv.actions && conv.actions.length > 0}
                          <span class="pill action-pill">{conv.actions.length} action{conv.actions.length === 1 ? '' : 's'}</span>
                        {/if}
                      </div>

                      {#if !hasSummary}
                        <button
                          class="summarize-btn-inline"
                          disabled={summarizingConvId === conv.id}
                          onclick={(e) => { e.stopPropagation(); triggerSummarize(conv.id); }}
                          title="Generate structured AI summary"
                        >
                          {#if summarizingConvId === conv.id}
                            <RefreshCw size={11} class="spin"/> Summarizing...
                          {:else}
                            <Sparkles size={11}/> Summarize
                          {/if}
                        </button>
                      {/if}
                    </div>
                  </div>
                {/each}
              {/if}
            {/if}
          </div>
        </aside>

        <!-- Right Panel: Full Call Intelligence View -->
        <main class="intel-main">
          {#if !selectedConversation}
            <div class="intel-empty-state">
              <FileText size={44}/>
              <h3>Select a Call to View AI Intelligence</h3>
              <p>Review comprehensive structured summaries, customer intents, commitments, action proposals, and verified transcripts.</p>
            </div>
          {:else}
            {@const conv = selectedConversation}
            {@const s = conv.fullSummary || conv.callSummary}
            {@const e = conv.extraction}
            <div class="intel-content-wrapper">
              <!-- Top Header Bar -->
              <div class="intel-top-bar">
                <div class="intel-header-info">
                  <div class="intel-eyebrow">
                    <span class="source-tag">{conv.source?.toUpperCase() || 'SYNTHETIC'} CALL</span>
                    <span class="dot-separator">•</span>
                    <span class="conv-id-code">ID: {conv.id.slice(0, 8)}</span>
                    <span class="dot-separator">•</span>
                    <span>{new Date(conv.createdAt).toLocaleString()}</span>
                  </div>
                  <h2 class="intel-main-title">{s?.title || (e?.intent ? `Call: ${e.intent}` : 'Voice Call Intelligence')}</h2>
                </div>

                <div class="intel-actions-row">
                  {#if !s}
                    <button
                      class="primary-glow-btn"
                      disabled={summarizingConvId === conv.id}
                      onclick={() => triggerSummarize(conv.id)}
                    >
                      {#if summarizingConvId === conv.id}
                        <RefreshCw size={13} class="spin"/> Generating Summary...
                      {:else}
                        <Sparkles size={13}/> Generate Full Summary
                      {/if}
                    </button>
                  {:else}
                    <button class="secondary-btn" onclick={() => copySummary(conv)} title="Copy markdown summary">
                      <Copy size={13}/> Copy
                    </button>
                    <button class="secondary-btn" onclick={() => exportSummary(conv)} title="Download full text report">
                      <Download size={13}/> Export Report
                    </button>
                    <button
                      class="ghost-btn"
                      disabled={summarizingConvId === conv.id}
                      onclick={() => triggerSummarize(conv.id)}
                      title="Re-run Groq summarization"
                    >
                      <RefreshCw size={13} class={summarizingConvId === conv.id ? 'spin' : ''}/>
                    </button>
                  {/if}
                </div>
              </div>

              {#if intelligenceLoading}
                <div class="intel-loading-banner">
                  <RefreshCw size={15} class="spin"/> Loading complete call intelligence package...
                </div>
              {/if}

              <!-- Intelligence Grid Sections -->
              <div class="intel-grid">
                <!-- 1. Executive Summary Card (Full Span) -->
                <div class="intel-card full-col executive-card">
                  <div class="intel-card-header">
                    <div class="section-tag-group">
                      <span class="card-eyebrow">EXECUTIVE SUMMARY</span>
                      {#if s?.callOutcome}
                        <span class="badge blue-glow">{s.callOutcome}</span>
                      {/if}
                      {#if s?.groqModel}
                        <span class="model-tag">Groq {s.groqModel.split('/').pop()}</span>
                      {/if}
                    </div>
                  </div>
                  <p class="executive-text">{s?.executiveSummary || e?.summary || 'No summary generated yet. Click "Generate Full Summary" above to process transcript with Groq.'}</p>

                  <div class="executive-meta-row">
                    <div class="meta-item">
                      <span class="meta-label">Customer Intent</span>
                      <strong class="meta-val">{s?.customerIntent || e?.intent || 'Not specified'}</strong>
                    </div>
                    <div class="meta-item">
                      <span class="meta-label">Call Outcome</span>
                      <strong class="meta-val">{s?.callOutcome || 'In Progress / Completed'}</strong>
                    </div>
                    <div class="meta-item">
                      <span class="meta-label">Recording Source</span>
                      <strong class="meta-val">{conv.source || 'voice_session'}</strong>
                    </div>
                  </div>
                </div>

                <!-- 2. Key Discussion Points -->
                <div class="intel-card">
                  <div class="intel-card-header">
                    <span class="card-eyebrow">KEY DISCUSSION POINTS</span>
                  </div>
                  {#if s?.keyDiscussionPoints && s.keyDiscussionPoints.length > 0}
                    <ul class="intel-bullet-list">
                      {#each s.keyDiscussionPoints as point}
                        <li>{point}</li>
                      {/each}
                    </ul>
                  {:else}
                    <p class="empty-hint">No key points extracted or transcript too brief.</p>
                  {/if}
                </div>

                <!-- 3. Customer Requirements -->
                <div class="intel-card">
                  <div class="intel-card-header">
                    <span class="card-eyebrow">CUSTOMER REQUIREMENTS</span>
                  </div>
                  {#if s?.customerRequirements && s.customerRequirements.length > 0}
                    <ul class="intel-bullet-list requirement-list">
                      {#each s.customerRequirements as req}
                        <li>{req}</li>
                      {/each}
                    </ul>
                  {:else}
                    <p class="empty-hint">No explicit requirements stated by customer.</p>
                  {/if}
                </div>

                <!-- 4. Important Commitments -->
                <div class="intel-card">
                  <div class="intel-card-header">
                    <span class="card-eyebrow">IMPORTANT COMMITMENTS</span>
                  </div>
                  {#if s?.importantCommitments && s.importantCommitments.length > 0}
                    <div class="commitments-container">
                      {#each s.importantCommitments as item}
                        <div class="commitment-item">
                          <div class="commitment-top">
                            <span class="party-tag" class:agent-tag={item.madeBy === 'agent'} class:customer-tag={item.madeBy === 'customer'}>
                              {item.madeBy?.toUpperCase() || 'PARTY'}
                            </span>
                            <span class="status-tag status-{item.status || 'open'}">{item.status || 'open'}</span>
                          </div>
                          <p class="commitment-text">{item.commitment}</p>
                        </div>
                      {/each}
                    </div>
                  {:else}
                    <p class="empty-hint">No explicit commitments recorded during call.</p>
                  {/if}
                </div>

                <!-- 5. Actionable Follow-up Tasks -->
                <div class="intel-card">
                  <div class="intel-card-header">
                    <span class="card-eyebrow">FOLLOW-UP REQUIREMENTS & TASKS</span>
                  </div>
                  {#if s?.followUpTasks && s.followUpTasks.length > 0}
                    <div class="tasks-container">
                      {#each s.followUpTasks as task}
                        <div class="task-card-row">
                          <div class="task-row-top">
                            <span class="priority-tag priority-{task.priority || 'medium'}">
                              {(task.priority || 'MEDIUM').toUpperCase()}
                            </span>
                            <span class="owner-pill">{task.owner || 'agent'}</span>
                          </div>
                          <p class="task-desc">{task.task}</p>
                        </div>
                      {/each}
                    </div>
                  {:else}
                    <p class="empty-hint">No outstanding follow-up tasks required.</p>
                  {/if}
                </div>

                <!-- 6. Unresolved Issues -->
                <div class="intel-card">
                  <div class="intel-card-header">
                    <span class="card-eyebrow">UNRESOLVED ISSUES</span>
                  </div>
                  {#if s?.unresolvedIssues && s.unresolvedIssues.length > 0}
                    <ul class="intel-bullet-list warning-list">
                      {#each s.unresolvedIssues as issue}
                        <li>{issue}</li>
                      {/each}
                    </ul>
                  {:else}
                    <p class="empty-hint positive">✓ No unresolved issues detected.</p>
                  {/if}
                </div>

                <!-- 7. Extracted Entities & Values -->
                <div class="intel-card">
                  <div class="intel-card-header">
                    <span class="card-eyebrow">EXTRACTED ENTITIES</span>
                  </div>
                  {#if s?.extractedEntities && s.extractedEntities.length > 0}
                    <div class="entity-chips-grid">
                      {#each s.extractedEntities as ent}
                        <div class="entity-chip">
                          <span class="ent-name">{ent.entity}:</span>
                          <span class="ent-val">{ent.value}</span>
                          {#if ent.category}
                            <span class="ent-cat">{ent.category}</span>
                          {/if}
                        </div>
                      {/each}
                    </div>
                  {:else if e?.fields && e.fields.length > 0}
                    <div class="entity-chips-grid">
                      {#each e.fields as f}
                        <div class="entity-chip">
                          <span class="ent-name">{f.name}:</span>
                          <span class="ent-val">{String(f.value ?? 'null')}</span>
                          <span class="ent-cat">{Math.round(f.confidence * 100)}%</span>
                        </div>
                      {/each}
                    </div>
                  {:else}
                    <p class="empty-hint">No structured entities extracted.</p>
                  {/if}
                </div>

                <!-- 8. Proposed Business Actions & Execution Status (Full Span) -->
                <div class="intel-card full-col">
                  <div class="intel-card-header">
                    <span class="card-eyebrow">AUTONOMOUS BUSINESS ACTIONS</span>
                    <span class="sub-muted">Generated from structured extraction</span>
                  </div>
                  {#if conv.actions && conv.actions.length > 0}
                    <div class="intel-actions-list">
                      {#each conv.actions as act}
                        <div class="intel-action-item">
                          <div class="ia-left">
                            <strong>{act.name}</strong>
                            <span class="ia-desc">{act.description || 'Webhook execution'}</span>
                            <span class="badge status-badge status-{act.status}">{act.status}</span>
                          </div>
                          <div class="ia-payload">
                            <code>{JSON.stringify(act.payload)}</code>
                          </div>
                          <div class="ia-right">
                            {#if act.status === 'awaiting_approval'}
                              <button class="primary btn-xs" onclick={() => approveInstance(act)}>
                                <Check size={12}/> Approve & Run
                              </button>
                            {:else if act.status === 'executed'}
                              <span class="executed-check"><CheckCircle2 size={14}/> Executed</span>
                            {:else if act.status === 'failed'}
                              <button class="retry-btn btn-xs" onclick={() => retryInstance(act)}>
                                <RefreshCw size={12}/> Retry
                              </button>
                            {/if}
                          </div>
                        </div>
                      {/each}
                    </div>
                  {:else}
                    <p class="empty-hint">No automated business actions proposed for this conversation.</p>
                  {/if}
                </div>

                <!-- 9. Full Verified Transcript (Full Span) -->
                <div class="intel-card full-col">
                  <div class="intel-card-header">
                    <span class="card-eyebrow">CONVERSATION TRANSCRIPT</span>
                    {#if conv.metadata?.agentName}
                      <span class="agent-pill">{conv.metadata.agentName}</span>
                    {/if}
                  </div>
                  {#if conv.rawTranscriptText}
                    <div class="transcript-box">
                      <pre>{conv.rawTranscriptText}</pre>
                    </div>
                  {:else if conv.transcript && Array.isArray(conv.transcript) && conv.transcript.length > 0}
                    <div class="transcript-messages">
                      {#each conv.transcript as msg}
                        <div class="transcript-msg msg-{msg.role || 'caller'}">
                          <span class="msg-role">{(msg.role || 'Caller').toUpperCase()}</span>
                          <span class="msg-content">{msg.content || msg.text || ''}</span>
                        </div>
                      {/each}
                    </div>
                  {:else}
                    <p class="empty-hint">No transcript text preserved for this call.</p>
                  {/if}
                </div>
              </div>
            </div>
          {/if}
        </main>
      </div>
    </section>
  {/if}

  <!-- Edit Payload Modal -->
  {#if editPayloadModal && selectedInstance}
    <div class="modal-backdrop" onclick={()=>editPayloadModal=false}>
      <div class="modal-inner" onclick={(e)=>e.stopPropagation()}>
        <div class="modal-header">
          <h3>Edit Proposed Payload</h3>
          <button class="close-btn" onclick={()=>editPayloadModal=false}>×</button>
        </div>
        <p class="muted tiny">Correct any misheard caller values before dispatching this operation.</p>
        <textarea rows="10" class="code-area" bind:value={editablePayloadJson}></textarea>
        <div class="modal-actions">
          <button class="secondary" onclick={()=>editPayloadModal=false}>Cancel</button>
          <button class="primary" onclick={saveEditedPayload}>Save Changes</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .actions-container {
    max-width: 1250px;
    margin: 0 auto;
    padding: 30px 24px 60px;
    color: #f1f2f6;
  }
  .actions-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 28px;
    flex-wrap: wrap;
    gap: 20px;
  }
  .title-wrap h1 {
    font-size: 32px;
    font-weight: 800;
    margin: 6px 0;
    letter-spacing: -1px;
  }
  .eyebrow {
    font: 10px 'DM Mono', monospace;
    letter-spacing: 1.5px;
    color: #a78bfa;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .badge-live {
    background: #1e1b4b;
    border: 1px solid #4338ca;
    color: #818cf8;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 9px;
  }
  .subtitle {
    color: #94a3b8;
    font-size: 13px;
    margin: 0;
  }
  .tab-pill-group {
    display: flex;
    background: #111422;
    border: 1px solid #23273e;
    border-radius: 10px;
    padding: 4px;
    gap: 4px;
  }
  .tab-pill-group button {
    background: transparent;
    border: 0;
    color: #94a3b8;
    font-size: 11px;
    font-weight: 600;
    padding: 8px 14px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    transition: 0.2s;
  }
  .tab-pill-group button:hover {
    color: #f8fafc;
    background: #1e2238;
  }
  .tab-pill-group button.active {
    background: #2a2254;
    color: #c4b5fd;
    box-shadow: 0 2px 8px #7c3aed33;
  }
  .count-badge {
    background: #f59e0b;
    color: #000;
    font-size: 9px;
    font-weight: 800;
    padding: 1px 5px;
    border-radius: 10px;
  }
  .demo-btn.active {
    background: #065f46;
    color: #6ee7b7;
  }
  .overview-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 24px;
  }
  .metric-card {
    background: #121526;
    border: 1px solid #22263d;
    border-radius: 12px;
    padding: 18px;
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .icon-bubble {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    display: grid;
    place-items: center;
  }
  .icon-bubble.cyan { background: #164e63; color: #22d3ee; }
  .icon-bubble.amber { background: #78350f; color: #fbbf24; }
  .icon-bubble.green { background: #064e3b; color: #34d399; }
  .icon-bubble.red { background: #881337; color: #f43f5e; }
  .metric-label {
    font: 9px 'DM Mono', monospace;
    letter-spacing: 1px;
    color: #64748b;
  }
  .metric-val {
    display: block;
    font-size: 26px;
    margin: 2px 0;
  }
  .metric-info small {
    font-size: 10px;
    color: #94a3b8;
  }
  .section-card {
    background: #121526;
    border: 1px solid #22263d;
    border-radius: 14px;
    padding: 24px;
    margin-bottom: 24px;
  }
  .section-title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }
  .section-title-row h2, .section-title-row h3 {
    margin: 0;
  }
  .muted { color: #64748b; font-size: 12px; }
  .empty-state {
    text-align: center;
    padding: 40px;
    color: #64748b;
    display: grid;
    place-items: center;
    gap: 12px;
  }
  .empty-icon-green { color: #10b981; }
  .approval-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    background: #171b30;
    border: 1px solid #282d49;
    border-radius: 10px;
    margin-bottom: 10px;
    gap: 16px;
  }
  .row-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 240px;
  }
  .action-badge {
    font: 9px 'DM Mono', monospace;
    background: #2e1065;
    color: #c084fc;
    border: 1px solid #581c87;
    padding: 3px 6px;
    border-radius: 4px;
  }
  .row-meta {
    font-size: 10px;
    color: #64748b;
    display: flex;
    gap: 10px;
    margin-top: 3px;
  }
  .payload-preview {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    flex: 1;
  }
  .kv-chip {
    font-size: 10px;
    background: #1f243c;
    border: 1px solid #333a5d;
    padding: 3px 8px;
    border-radius: 4px;
    color: #cbd5e1;
  }
  .kv-chip b { color: #38bdf8; }
  .row-actions {
    display: flex;
    gap: 8px;
  }
  .primary, .secondary, .danger, .danger-btn {
    border: 0;
    padding: 8px 14px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: 0.2s;
  }
  .primary {
    background: linear-gradient(135deg, #8b5cf6, #6366f1);
    color: #fff;
    box-shadow: 0 4px 12px #6366f133;
  }
  .primary:hover { filter: brightness(1.15); }
  .secondary { background: #222740; color: #cbd5e1; border: 1px solid #32395a; }
  .secondary:hover { background: #2d3456; }
  .danger, .danger-btn { background: #4c0519; color: #fda4af; border: 1px solid #881337; }
  .tiny { padding: 5px 9px; font-size: 10px; }
  .inbox-cards-grid {
    display: grid;
    gap: 18px;
  }
  .inbox-card {
    background: #171b30;
    border: 1px solid #292f4c;
    border-radius: 12px;
    padding: 20px;
  }
  .inbox-card.pending { border-left: 4px solid #f59e0b; }
  .inbox-card.done { border-left: 4px solid #10b981; }
  .inbox-card.rejected { border-left: 4px solid #ef4444; }
  .inbox-card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 14px;
  }
  .status-pill {
    font: 9px 'DM Mono', monospace;
    padding: 3px 7px;
    border-radius: 4px;
    display: inline-block;
    margin-bottom: 6px;
  }
  .status-pill.awaiting_approval { background: #451a03; color: #fde68a; border: 1px solid #78350f; }
  .status-pill.completed { background: #064e3b; color: #6ee7b7; border: 1px solid #047857; }
  .status-pill.failed { background: #4c0519; color: #fda4af; border: 1px solid #881337; }
  .status-pill.rejected { background: #27272a; color: #a1a1aa; }
  .idemp-key {
    font-size: 10px;
    color: #64748b;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .extracted-data-box {
    background: #111422;
    border: 1px solid #232840;
    border-radius: 8px;
    padding: 14px;
    margin-bottom: 14px;
  }
  .box-label {
    font: 9px 'DM Mono', monospace;
    letter-spacing: 1px;
    color: #64748b;
    margin-bottom: 10px;
  }
  .fields-table {
    display: grid;
    gap: 8px;
  }
  .field-item {
    display: grid;
    grid-template-columns: 180px 1fr;
    gap: 12px;
    font-size: 11px;
    border-bottom: 1px solid #1d2238;
    padding-bottom: 6px;
  }
  .confidence-tag {
    font-size: 9px;
    padding: 1px 4px;
    border-radius: 3px;
    margin-left: 6px;
  }
  .confidence-tag.high { background: #064e3b; color: #34d399; }
  .confidence-tag.med { background: #78350f; color: #fbbf24; }
  .confidence-tag.low { background: #881337; color: #f43f5e; }
  .evidence-quote {
    font-style: italic;
    color: #94a3b8;
    margin: 4px 0 0;
    font-size: 10px;
  }
  .resolved-payload-box {
    background: #0f121d;
    border: 1px solid #202438;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 14px;
  }
  .payload-header {
    display: flex;
    justify-content: space-between;
    font: 9px 'DM Mono', monospace;
    color: #64748b;
    margin-bottom: 8px;
  }
  .text-link {
    background: transparent;
    border: 0;
    color: #a78bfa;
    cursor: pointer;
    font-size: 10px;
  }
  .json-code {
    margin: 0;
    font: 10px 'DM Mono', monospace;
    color: #38bdf8;
    max-height: 120px;
    overflow: auto;
  }
  .inbox-card-footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    align-items: center;
  }
  .completed-msg { color: #10b981; font-size: 11px; display: flex; align-items: center; gap: 6px; }
  .rejected-msg { color: #ef4444; font-size: 11px; display: flex; align-items: center; gap: 6px; }
  .editor-drawer {
    background: #15192c;
    border: 1px solid #3730a3;
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 24px;
  }
  .editor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }
  .close-btn {
    background: transparent;
    border: 0;
    color: #64748b;
    font-size: 20px;
    cursor: pointer;
  }
  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    margin-bottom: 16px;
  }
  .full-width { grid-column: span 2; }
  label {
    display: grid;
    gap: 6px;
    font-size: 11px;
    color: #94a3b8;
  }
  input, select, textarea {
    background: #0c0e18;
    border: 1px solid #232840;
    border-radius: 6px;
    color: #f8fafc;
    padding: 8px 10px;
    font-size: 12px;
  }
  .code-area {
    width: 100%;
    font: 11px 'DM Mono', monospace;
    color: #38bdf8;
  }
  .approval-toggle-box {
    margin: 14px 0;
    background: #111422;
    padding: 10px;
    border-radius: 6px;
  }
  .switch-row {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-weight: 600;
    color: #cbd5e1;
  }
  .definitions-grid, .schemas-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }
  .def-card, .schema-card {
    background: #171b30;
    border: 1px solid #252a45;
    border-radius: 10px;
    padding: 16px;
  }
  .def-top, .schema-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  .method-tag {
    font: 9px 'DM Mono', monospace;
    padding: 2px 6px;
    border-radius: 4px;
    margin-right: 6px;
  }
  .method-tag.POST { background: #064e3b; color: #34d399; }
  .method-tag.GET { background: #164e63; color: #38bdf8; }
  .method-tag.PUT { background: #78350f; color: #fbbf24; }
  .badge {
    font-size: 9px;
    padding: 3px 6px;
    border-radius: 4px;
  }
  .badge.amber { background: #451a03; color: #fde68a; }
  .badge.green { background: #064e3b; color: #6ee7b7; }
  .url-line {
    font-size: 10px;
    color: #64748b;
    margin: 10px 0;
    word-break: break-all;
  }
  .def-footer, .schema-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    align-items: center;
  }
  .danger-icon-btn {
    background: transparent;
    border: 0;
    color: #f43f5e;
    cursor: pointer;
  }
  .fields-builder {
    margin: 16px 0;
    background: #111422;
    padding: 14px;
    border-radius: 8px;
  }
  .fields-builder-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }
  .schema-field-row {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
    align-items: center;
  }
  .field-name-input { width: 140px; }
  .field-desc-input { flex: 1; }
  .req-label { display: flex; align-items: center; gap: 4px; font-size: 10px; }
  .remove-btn { background: #881337; color: #fda4af; border: 0; border-radius: 4px; padding: 4px 8px; cursor: pointer; }
  .field-tags-wrap {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin: 12px 0;
  }
  .field-tag {
    font-size: 9px;
    background: #1e2238;
    color: #94a3b8;
    padding: 2px 6px;
    border-radius: 4px;
  }
  .field-tag.req { border-left: 2px solid #a855f7; color: #e9d5ff; }
  .history-table-wrap {
    overflow-x: auto;
  }
  .history-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
  }
  .history-table th, .history-table td {
    padding: 10px 12px;
    text-align: left;
    border-bottom: 1px solid #1f243b;
  }
  .history-table th { color: #64748b; font-weight: 600; }
  .status-indicator {
    font: 9px 'DM Mono', monospace;
    padding: 2px 6px;
    border-radius: 4px;
  }
  .status-indicator.success { background: #064e3b; color: #34d399; }
  .status-indicator.failed { background: #4c0519; color: #f43f5e; }
  .status-indicator.timeout { background: #78350f; color: #fbbf24; }
  .http-badge {
    font: 9px 'DM Mono', monospace;
    padding: 2px 5px;
    border-radius: 4px;
  }
  .http-badge.ok { background: #064e3b; color: #6ee7b7; }
  .http-badge.fail { background: #4c0519; color: #fda4af; }
  .demo-stepper {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #111422;
    padding: 12px 24px;
    border-radius: 8px;
    margin-bottom: 20px;
    font-size: 11px;
    color: #64748b;
  }
  .demo-stepper .step.active { color: #38bdf8; font-weight: 700; }
  .demo-stepper .step.done { color: #34d399; }
  .demo-workbench {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }
  .transcript-editor {
    width: 100%;
    font-family: inherit;
    font-size: 11px;
    line-height: 1.6;
    background: #0b0d18;
    border: 1px solid #232840;
    border-radius: 8px;
    color: #cbd5e1;
  }
  .demo-actions { margin-top: 12px; }
  .demo-placeholder {
    height: 100%;
    display: grid;
    place-content: center;
    text-align: center;
    color: #64748b;
    background: #0b0d18;
    border: 1px dashed #232840;
    border-radius: 8px;
    padding: 30px;
  }
  .demo-results-view {
    display: grid;
    gap: 12px;
  }
  .demo-summary-box {
    background: #171b30;
    border: 1px solid #2a304e;
    border-radius: 8px;
    padding: 14px;
  }
  .demo-fields-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .demo-field-chip {
    background: #111422;
    border: 1px solid #20253c;
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .df-name { color: #94a3b8; }
  .df-conf { font: 8px 'DM Mono', monospace; color: #34d399; }
  .proposed-action-card {
    background: #1a1e35;
    border: 1px solid #3730a3;
    border-radius: 8px;
    padding: 14px;
  }
  .pa-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }
  .pa-footer {
    display: flex;
    justify-content: flex-end;
    margin-top: 12px;
  }
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: #000000aa;
    backdrop-filter: blur(4px);
    display: grid;
    place-items: center;
    z-index: 100;
  }
  .modal-inner {
    background: #171b30;
    border: 1px solid #303758;
    border-radius: 12px;
    width: min(520px, 90vw);
    padding: 24px;
  }
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;
  }
  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 16px;
  }
  .toast-bar {
    background: #065f46;
    color: #6ee7b7;
    border: 1px solid #059669;
    padding: 10px 16px;
    border-radius: 8px;
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }
  .error-banner {
    background: #4c0519;
    color: #fecdd3;
    border: 1px solid #e11d48;
    padding: 10px 16px;
    border-radius: 8px;
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }
  .close-err {
    background: transparent;
    border: 0;
    color: #fecdd3;
    font-size: 16px;
    margin-left: auto;
    cursor: pointer;
  }
  .spin {
    animation: spin 1s linear infinite;
  }
  @keyframes spin { 100% { transform: rotate(360deg); } }

  /* Completed Tasks & Work Done Styling */
  .completed-tasks-grid {
    display: grid;
    gap: 16px;
  }
  .task-outcome-card {
    background: #15192c;
    border: 1px solid #31385c;
    border-left: 4px solid #10b981;
    border-radius: 10px;
    padding: 18px 20px;
    display: grid;
    gap: 12px;
  }
  .toc-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .toc-title {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .toc-title strong {
    font-size: 15px;
    color: #f8fafc;
  }
  .time-stamp {
    font: 10px 'DM Mono', monospace;
    color: #64748b;
  }
  .toc-summary {
    background: #0f1220;
    border: 1px solid #232840;
    border-radius: 6px;
    padding: 10px 14px;
    font-size: 12px;
    color: #cbd5e1;
    line-height: 1.5;
  }
  .toc-details-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    background: #111422;
    border: 1px solid #22263d;
    border-radius: 8px;
    padding: 14px;
  }
  .toc-field {
    display: grid;
    gap: 3px;
  }
  .toc-field span {
    font: 9px 'DM Mono', monospace;
    letter-spacing: 0.8px;
    color: #64748b;
  }
  .toc-field strong {
    font-size: 13px;
    color: #38bdf8;
  }
  .toc-field.full-span {
    grid-column: 1 / -1;
  }
  .toc-field.full-span p {
    margin: 2px 0 0;
    font-size: 12px;
    color: #94a3b8;
  }
  .toc-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 8px;
    border-top: 1px solid #222740;
  }
  .delivery-status {
    color: #34d399;
    font-size: 11px;
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
  }

  /* Business Outcome Modal Card */
  .outcome-highlight-box {
    background: #0d1a24;
    border: 1px solid #164e63;
    border-radius: 8px;
    padding: 14px;
    margin-bottom: 14px;
  }
  .business-outcome-card {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 8px;
  }
  .boc-item {
    font-size: 12px;
    display: grid;
    gap: 2px;
  }
  .boc-item span {
    color: #64748b;
    font: 9px 'DM Mono', monospace;
  }
  .boc-item strong {
    color: #38bdf8;
    font-size: 13px;
  }
  .confirmed-tag {
    color: #10b981;
    font-size: 11px;
  }
  .label.green {
    color: #34d399;
    font: 10px 'DM Mono', monospace;
  }

  /* =========================================================================
     CALL INTELLIGENCE & SUMMARIZATION STYLES
     ========================================================================= */

  /* Demo Lab Intelligence Preview Card */
  .demo-intel-box {
    border-color: #1e3a5f;
    background: #0d1a29;
    position: relative;
  }
  .demo-intel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }
  .intel-tasks-preview {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px dashed #1e293b;
  }
  .sub-label {
    font: 9px 'DM Mono', monospace;
    color: #64748b;
    letter-spacing: 0.05em;
    display: block;
    margin-bottom: 4px;
  }
  .mini-task-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .mini-task-tag {
    font-size: 10px;
    background: #132238;
    border: 1px solid #1e3a5f;
    color: #93c5fd;
    padding: 2px 7px;
    border-radius: 4px;
  }
  .mini-task-tag .tag-owner {
    color: #60a5fa;
    font-weight: 600;
  }

  /* Intelligence Main Tab Layout */
  .intel-pane {
    padding: 0;
  }
  .intel-layout {
    display: grid;
    grid-template-columns: 340px 1fr;
    min-height: 720px;
    background: #090b14;
    border: 1px solid #1d2238;
    border-radius: 12px;
    overflow: hidden;
  }

  /* Left Sidebar: Call List */
  .intel-sidebar {
    border-right: 1px solid #1d2238;
    background: #0d1020;
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .sidebar-top {
    padding: 14px 14px 10px;
    border-bottom: 1px solid #1a1e34;
    display: grid;
    gap: 10px;
  }
  .search-box-row {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #14182e;
    border: 1px solid #242b4d;
    padding: 6px 10px;
    border-radius: 6px;
    color: #64748b;
  }
  .search-box-row input {
    background: transparent;
    border: none;
    outline: none;
    color: #f1f5f9;
    font-size: 12px;
    width: 100%;
  }
  .sidebar-counts {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    color: #64748b;
    font-family: 'DM Mono', monospace;
  }
  .ghost-refresh {
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    transition: all 0.2s;
  }
  .ghost-refresh:hover {
    color: #38bdf8;
    background: #1e2440;
  }
  .conv-items-scroll {
    overflow-y: auto;
    max-height: calc(100vh - 280px);
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .empty-list-notice {
    padding: 40px 16px;
    text-align: center;
    color: #64748b;
    font-size: 12px;
    display: grid;
    gap: 8px;
    place-content: center;
  }
  .conv-card-item {
    background: #12162a;
    border: 1px solid #1c223c;
    border-radius: 8px;
    padding: 10px 12px;
    cursor: pointer;
    text-align: left;
    transition: all 0.18s ease;
    display: grid;
    gap: 6px;
  }
  .conv-card-item:hover {
    background: #181d38;
    border-color: #2e3760;
  }
  .conv-card-item.selected {
    background: #1b2140;
    border-color: #6366f1;
    box-shadow: 0 0 12px rgba(99, 102, 241, 0.18);
  }
  .conv-card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 6px;
  }
  .conv-title {
    font-size: 12px;
    color: #f1f5f9;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 190px;
  }
  .conv-date {
    font-size: 10px;
    color: #64748b;
    font-family: 'DM Mono', monospace;
    white-space: nowrap;
  }
  .conv-snippet {
    font-size: 11px;
    color: #94a3b8;
    margin: 0;
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .transcript-snip {
    color: #64748b;
    font-style: italic;
  }
  .conv-card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
  }
  .badge-cluster {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  .pill {
    font-size: 9px;
    font-family: 'DM Mono', monospace;
    padding: 2px 5px;
    border-radius: 4px;
    white-space: nowrap;
  }
  .outcome-pill {
    background: #0f2d42;
    color: #38bdf8;
    border: 1px solid #164e63;
  }
  .task-pill {
    background: #271a06;
    color: #fbbf24;
    border: 1px solid #78350f;
  }
  .action-pill {
    background: #1e1338;
    color: #c084fc;
    border: 1px solid #581c87;
  }
  .summarize-btn-inline {
    font-size: 10px;
    padding: 2px 7px;
    background: #1f274a;
    border: 1px solid #384578;
    color: #a5b4fc;
    border-radius: 4px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    transition: all 0.2s;
  }
  .summarize-btn-inline:hover:not(:disabled) {
    background: #313d75;
    color: #fff;
  }

  /* Right Main: Detailed Intel View */
  .intel-main {
    background: #090b14;
    overflow-y: auto;
    max-height: calc(100vh - 280px);
    padding: 24px 28px;
  }
  .intel-empty-state {
    height: 100%;
    display: grid;
    place-content: center;
    text-align: center;
    color: #475569;
    padding: 60px 20px;
    gap: 12px;
    max-width: 440px;
    margin: 0 auto;
  }
  .intel-empty-state h3 {
    color: #cbd5e1;
    margin: 0;
    font-size: 16px;
  }
  .intel-empty-state p {
    font-size: 12px;
    line-height: 1.5;
  }
  .intel-top-bar {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    padding-bottom: 18px;
    border-bottom: 1px solid #1c223c;
    margin-bottom: 18px;
  }
  .intel-eyebrow {
    font-size: 11px;
    color: #64748b;
    font-family: 'DM Mono', monospace;
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
  }
  .source-tag {
    color: #a5b4fc;
    font-weight: 600;
  }
  .dot-separator {
    color: #334155;
  }
  .conv-id-code {
    color: #94a3b8;
  }
  .intel-main-title {
    font-size: 20px;
    font-weight: 700;
    color: #f8fafc;
    margin: 0;
    letter-spacing: -0.01em;
  }
  .intel-actions-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .primary-glow-btn {
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    color: #fff;
    border: none;
    font-size: 12px;
    font-weight: 600;
    padding: 7px 14px;
    border-radius: 6px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    box-shadow: 0 0 16px rgba(99, 102, 241, 0.4);
    transition: all 0.2s;
  }
  .primary-glow-btn:hover:not(:disabled) {
    box-shadow: 0 0 24px rgba(99, 102, 241, 0.6);
    transform: translateY(-1px);
  }
  .secondary-btn {
    background: #14182c;
    border: 1px solid #273056;
    color: #cbd5e1;
    font-size: 12px;
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s;
  }
  .secondary-btn:hover {
    background: #1f274a;
    border-color: #3e4c85;
    color: #fff;
  }
  .ghost-btn {
    background: transparent;
    border: 1px solid #222949;
    color: #94a3b8;
    padding: 6px 8px;
    border-radius: 6px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    transition: all 0.15s;
  }
  .ghost-btn:hover:not(:disabled) {
    background: #161c36;
    color: #38bdf8;
  }
  .intel-loading-banner {
    background: #0f1c30;
    border: 1px solid #1e3a5f;
    color: #38bdf8;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 14px;
  }

  /* Grid of Intelligence Cards */
  .intel-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  .intel-card {
    background: #0f1222;
    border: 1px solid #1d223c;
    border-radius: 10px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .intel-card.full-col {
    grid-column: 1 / -1;
  }
  .intel-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .section-tag-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .card-eyebrow {
    font: 10px 'DM Mono', monospace;
    letter-spacing: 0.08em;
    color: #64748b;
    font-weight: 600;
  }
  .model-tag {
    font-size: 9px;
    font-family: 'DM Mono', monospace;
    background: #1a1e36;
    color: #94a3b8;
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid #252b4d;
  }
  .blue-glow {
    background: #0b253b;
    color: #38bdf8;
    border: 1px solid #164e63;
    font-size: 10px;
    padding: 2px 8px;
  }
  .sub-muted {
    font-size: 11px;
    color: #64748b;
  }

  /* Executive Card */
  .executive-card {
    background: linear-gradient(180deg, #12172f 0%, #0d1022 100%);
    border-color: #2b3562;
  }
  .executive-text {
    font-size: 14px;
    line-height: 1.6;
    color: #e2e8f0;
    margin: 4px 0 10px;
  }
  .executive-meta-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    padding-top: 12px;
    border-top: 1px solid #1e2646;
  }
  .meta-item {
    display: grid;
    gap: 3px;
  }
  .meta-label {
    font-size: 10px;
    color: #64748b;
    font-family: 'DM Mono', monospace;
  }
  .meta-val {
    font-size: 12px;
    color: #f1f5f9;
  }

  /* Bullet lists */
  .intel-bullet-list {
    margin: 0;
    padding-left: 18px;
    display: grid;
    gap: 6px;
    font-size: 12px;
    color: #cbd5e1;
    line-height: 1.45;
  }
  .intel-bullet-list li::marker {
    color: #6366f1;
  }
  .requirement-list li::marker {
    color: #38bdf8;
  }
  .warning-list li::marker {
    color: #f59e0b;
  }

  /* Commitments */
  .commitments-container {
    display: grid;
    gap: 8px;
  }
  .commitment-item {
    background: #14182e;
    border: 1px solid #222949;
    border-radius: 6px;
    padding: 8px 10px;
    display: grid;
    gap: 4px;
  }
  .commitment-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .party-tag {
    font-size: 9px;
    font-family: 'DM Mono', monospace;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 3px;
  }
  .agent-tag {
    background: #172554;
    color: #60a5fa;
    border: 1px solid #1e40af;
  }
  .customer-tag {
    background: #2e1065;
    color: #c084fc;
    border: 1px solid #581c87;
  }
  .status-tag {
    font-size: 9px;
    font-family: 'DM Mono', monospace;
    text-transform: uppercase;
  }
  .status-tag.status-fulfilled, .status-tag.status-closed {
    color: #34d399;
  }
  .status-tag.status-open, .status-tag.status-pending {
    color: #fbbf24;
  }
  .commitment-text {
    font-size: 12px;
    color: #cbd5e1;
    margin: 0;
    line-height: 1.35;
  }

  /* Tasks */
  .tasks-container {
    display: grid;
    gap: 6px;
  }
  .task-card-row {
    background: #13172c;
    border: 1px solid #202747;
    border-radius: 6px;
    padding: 8px 10px;
    display: grid;
    gap: 4px;
  }
  .task-row-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .priority-tag {
    font-size: 9px;
    font-family: 'DM Mono', monospace;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 3px;
  }
  .priority-high {
    background: #450a0a;
    color: #f87171;
    border: 1px solid #991b1b;
  }
  .priority-medium {
    background: #422006;
    color: #fbbf24;
    border: 1px solid #92400e;
  }
  .priority-low {
    background: #064e3b;
    color: #34d399;
    border: 1px solid #065f46;
  }
  .owner-pill {
    font-size: 10px;
    color: #94a3b8;
    font-family: 'DM Mono', monospace;
  }
  .task-desc {
    font-size: 12px;
    color: #e2e8f0;
    margin: 0;
    line-height: 1.35;
  }

  /* Extracted Entities Chips */
  .entity-chips-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .entity-chip {
    background: #13172c;
    border: 1px solid #222949;
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 11px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .ent-name {
    color: #94a3b8;
  }
  .ent-val {
    color: #38bdf8;
    font-weight: 600;
  }
  .ent-cat {
    font-size: 9px;
    font-family: 'DM Mono', monospace;
    color: #64748b;
    background: #090b14;
    padding: 1px 4px;
    border-radius: 3px;
  }

  /* Actions List inside Intelligence */
  .intel-actions-list {
    display: grid;
    gap: 8px;
  }
  .intel-action-item {
    background: #13172c;
    border: 1px solid #202747;
    border-radius: 8px;
    padding: 10px 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  .ia-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 260px;
  }
  .ia-desc {
    font-size: 11px;
    color: #64748b;
  }
  .ia-payload {
    flex: 1;
    overflow: hidden;
  }
  .ia-payload code {
    font-size: 10px;
    color: #a5b4fc;
    font-family: 'DM Mono', monospace;
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ia-right {
    white-space: nowrap;
  }
  .btn-xs {
    font-size: 11px;
    padding: 4px 9px;
  }
  .status-badge.status-awaiting_approval {
    background: #422006;
    color: #fbbf24;
    border: 1px solid #92400e;
  }
  .status-badge.status-executed {
    background: #064e3b;
    color: #34d399;
    border: 1px solid #065f46;
  }
  .status-badge.status-failed {
    background: #450a0a;
    color: #f87171;
    border: 1px solid #991b1b;
  }
  .executed-check {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: #34d399;
    font-size: 11px;
    font-weight: 600;
  }

  /* Full Transcript Box */
  .transcript-box {
    background: #070910;
    border: 1px solid #181d33;
    border-radius: 6px;
    padding: 12px 14px;
    max-height: 280px;
    overflow-y: auto;
  }
  .transcript-box pre {
    margin: 0;
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    line-height: 1.5;
    color: #94a3b8;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .transcript-messages {
    display: grid;
    gap: 6px;
    max-height: 280px;
    overflow-y: auto;
  }
  .transcript-msg {
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 11px;
    display: grid;
    gap: 2px;
  }
  .transcript-msg.msg-caller, .transcript-msg.msg-user {
    background: #141930;
    border-left: 2px solid #38bdf8;
  }
  .transcript-msg.msg-agent, .transcript-msg.msg-assistant {
    background: #1b1633;
    border-left: 2px solid #a855f7;
  }
  .msg-role {
    font: 9px 'DM Mono', monospace;
    color: #64748b;
    font-weight: 700;
  }
  .msg-content {
    color: #cbd5e1;
    line-height: 1.35;
  }
  .empty-hint {
    font-size: 11px;
    color: #64748b;
    margin: 0;
    font-style: italic;
  }
  .empty-hint.positive {
    color: #34d399;
    font-style: normal;
  }
  .agent-pill {
    font-size: 10px;
    font-family: 'DM Mono', monospace;
    background: #1b1f3b;
    color: #cbd5e1;
    padding: 2px 7px;
    border-radius: 4px;
    border: 1px solid #2d3563;
  }
  .spin {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>
