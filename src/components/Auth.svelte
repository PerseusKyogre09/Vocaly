<script lang="ts">
  import { ArrowRight, Github, KeyRound, Mail, ShieldCheck } from 'lucide-svelte';

  let mode: 'sign-in' | 'sign-up' = 'sign-in';
  let name = '';
  let email = '';
  let password = '';
  let error = '';
  let busy = false;

  async function readAuthResponse(response: Response) {
    const text = await response.text();
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`Authentication server returned a non-JSON response (${response.status}). Reload the page and try again.`);
    }
  }

  async function submit() {
    busy = true;
    error = '';
    try {
      const endpoint = mode === 'sign-in' ? '/api/auth/sign-in/email' : '/api/auth/sign-up/email';
      const body = mode === 'sign-in' ? { email, password } : { name, email, password };
      const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await readAuthResponse(response);
      if (!response.ok) throw new Error(data?.message || data?.error || 'Authentication failed.');
      window.location.assign('/app');
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Authentication failed.';
    } finally {
      busy = false;
    }
  }

  async function social(provider: 'github' | 'google') {
    error = '';
    const response = await fetch('/api/auth/sign-in/social', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider, callbackURL: '/app' })
    });
    const data = await readAuthResponse(response);
    if (!response.ok || !data?.url) {
      error = data?.message || data?.error || `${provider} sign-in is not configured.`;
      return;
    }
    window.location.assign(data.url);
  }
</script>

<svelte:head><title>Vocaly — Sign in</title></svelte:head>
<main class="auth-shell">
  <a class="brand" href="/"><span class="mark"><i></i><i></i><i></i></span>Vocaly</a>
  <section class="auth-card">
    <div class="eyebrow"><ShieldCheck size={14}/> PRIVATE WORKSPACE</div>
    <h1>{mode === 'sign-in' ? 'Welcome back.' : 'Create your workspace.'}</h1>
    <p>{mode === 'sign-in' ? 'Sign in to access your agents and test runs.' : 'Your agents, workflows and Reality Lab runs stay scoped to your account.'}</p>
    <form onsubmit={(event) => { event.preventDefault(); submit(); }}>
      {#if mode === 'sign-up'}<label>Name<input bind:value={name} autocomplete="name" required /></label>{/if}
      <label><Mail size={14}/> Email<input bind:value={email} type="email" autocomplete="email" required /></label>
      <label><KeyRound size={14}/> Password<input bind:value={password} type="password" minlength="8" autocomplete={mode === 'sign-in' ? 'current-password' : 'new-password'} required /></label>
      {#if error}<div class="error">{error}</div>{/if}
      <button class="primary" disabled={busy}>{busy ? 'Working…' : mode === 'sign-in' ? 'Sign in' : 'Create account'} <ArrowRight size={15}/></button>
    </form>
    <div class="divider"><span>OR</span></div>
    <div class="socials"><button onclick={() => social('github')}><Github size={15}/> GitHub</button><button onclick={() => social('google')}>G Google</button></div>
    <button class="switch" onclick={() => { mode = mode === 'sign-in' ? 'sign-up' : 'sign-in'; error = ''; }}>{mode === 'sign-in' ? 'Need an account? Create one' : 'Already have an account? Sign in'}</button>
  </section>
</main>

<style>
  :global(body){background:#0b0b0d}.auth-shell{min-height:100vh;display:grid;place-items:center;padding:30px;color:#f0ede6}.brand{position:fixed;top:28px;left:34px;font-weight:800;font-size:21px}.brand>span:last-child{color:#a687ff}.mark{display:inline-flex;align-items:end;gap:2px;height:18px;width:20px;margin-right:8px}.mark i{width:5px;border:1px solid #d8f56a}.mark i:first-child{height:8px}.mark i:nth-child(2){height:17px;background:#d8f56a}.mark i:last-child{height:12px}.auth-card{width:min(100%,430px);border:1px solid #302f31;padding:38px;background:#111012}.eyebrow{display:flex;align-items:center;gap:8px;color:#d8f56a;font:10px 'DM Mono';letter-spacing:1px}.auth-card h1{font-size:42px;letter-spacing:-2px;font-weight:500;margin:24px 0 10px}.auth-card>p{color:#92908d;font-size:13px;line-height:1.6;margin-bottom:28px}.auth-card form{display:grid;gap:15px}.auth-card label{display:grid;gap:7px;color:#aaa;font:10px 'DM Mono';letter-spacing:.7px}.auth-card label svg{display:inline;vertical-align:middle;margin-right:5px;color:#a687ff}.auth-card input{background:#0b0b0d;border:1px solid #3a383b;color:#f0ede6;padding:12px;font:13px Manrope;outline:0}.auth-card input:focus{border-color:#a687ff}.primary{border:0;background:#d8f56a;color:#0b0b0d;padding:13px;font-weight:800;display:flex;justify-content:center;align-items:center;gap:8px}.primary:disabled{opacity:.5}.error{border:1px solid #8e3d4d;color:#ff9baa;padding:10px;font-size:12px}.divider{display:flex;align-items:center;gap:10px;color:#666;font:9px 'DM Mono';margin:25px 0}.divider:before,.divider:after{content:'';height:1px;background:#302f31;flex:1}.socials{display:grid;grid-template-columns:1fr 1fr;gap:10px}.socials button{background:#19181b;color:#f0ede6;border:1px solid #3a383b;padding:11px;display:flex;justify-content:center;gap:7px}.switch{display:block;margin:24px auto 0;background:none;border:0;color:#a687ff;font-size:11px}
</style>
