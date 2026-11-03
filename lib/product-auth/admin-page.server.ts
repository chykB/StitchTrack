import "server-only";
import {createHash} from "node:crypto";
// Fixed public presentation script only: no imports, identity, role or secrets.
// Authorization and aggregate reads stay in the independently protected API.
const script=`
const button=document.getElementById('refresh'),message=document.getElementById('status'),summary=document.getElementById('summary');
button.addEventListener('click',async()=>{
 if(button.disabled)return;
 button.disabled=true;button.textContent='Updating...';message.textContent='';summary.hidden=true;
 try{
  const response=await fetch('/api/internal/tailor-session/admin-summary',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'content-type':'application/json'},body:'{}'});
  if(!response.ok){message.textContent=response.status===401?'Your session is no longer valid. Log in again.':response.status===403?'Administrator access is required.':'The summary could not be confirmed. Try again later.';return;}
  const data=await response.json();
  if(![data.activeSessions,data.pendingDeletionRequests].every(n=>Number.isSafeInteger(n)&&n>=0)||typeof data.generatedAt!=='string'||!Number.isFinite(Date.parse(data.generatedAt)))throw new Error();
  document.getElementById('sessions').textContent=String(data.activeSessions);
  document.getElementById('deletions').textContent=String(data.pendingDeletionRequests);
  document.getElementById('measured').textContent=data.generatedAt;
  summary.hidden=false;message.textContent='Security summary updated.';
 }catch{message.textContent='The summary could not be confirmed. Try again later.';}
 finally{button.disabled=false;button.textContent='Update security summary';}
});`;
const panel=`<section aria-label="Authentication security"><p>Aggregate security information only. This role grants no access to tailoring-business records.</p>
<button id="refresh" type="button">Update security summary</button><p id="status" role="status" aria-live="polite"></p>
<dl id="summary" hidden><dt>Active sessions</dt><dd id="sessions"></dd><dt>Pending deletion requests</dt><dd id="deletions"></dd><dt>Measured at</dt><dd id="measured"></dd></dl></section>`;
// Always preserve the authorization's actual HTTP status. No account data is
// interpolated into HTML; all UI text and IDs are fixed, dynamic counts use textContent.
export async function administratorPageResponse(result:Response):Promise<Response>{
 let status=result.status;
 if(status===200){try{if((await result.json()).authorized!==true)status=503;}catch{status=503;}}
 const message=status===401?'Sign in with an eligible verified account to continue.':status===403?'Access refused. Administrator permission is required.':status===404?'This page is not available.':'Administration is temporarily unavailable.';
 const body='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>StitchTrack administration</title></head><body><main><h1>StitchTrack administration</h1>'+
  (status===200?panel:'<p role="alert">'+message+'</p>')+(![200,403].includes(status)?'<a href="/auth?login">Return to login</a>':'')+'</main>'+(status===200?'<script>'+script+'</script>':'')+'</body></html>';
 const headers=new Headers(result.headers);
 headers.set('content-type','text/html; charset=utf-8');headers.set('cache-control','no-store');headers.set('x-content-type-options','nosniff');
 headers.delete('content-length');
 headers.set('content-security-policy',"default-src 'none'; script-src 'sha256-"+createHash('sha256').update(script).digest('base64')+"'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
 return new Response(body,{status,headers});
}
