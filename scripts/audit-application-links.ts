/** Read-only audit. Never logs credentials, uploads a CV, clicks Apply, or submits a form. */
import { mkdir, writeFile } from "node:fs/promises"
import { jobLink } from "../supabase/functions/_shared/job-sites"
const out = process.env.ODDS_AUDIT_OUT || "/tmp/odds-application-audit"
const sb = process.env.VITE_SUPABASE_URL!, key = process.env.VITE_SUPABASE_ANON_KEY!
if (!sb || !key) throw Error("Missing public database configuration")
await mkdir(out, { recursive: true })
type Row = { id: string; title: string; employer_display: string; url: string | null; ats: string | null; source: string | null; closed_at: string | null; body: string | null }
const rows: Row[] = []
for (let offset=0;;offset+=500) {
  const res = await fetch(`${sb}/rest/v1/postings?select=id,title,employer_display,url,ats,source,closed_at,body&order=id&offset=${offset}&limit=500`, {headers:{apikey:key,Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(30000)})
  if (!res.ok) throw Error(`Database read failed (${res.status})`)
  const part = await res.json() as Row[]; rows.push(...part)
  if (part.length<500) break
}
const inventory = rows.map(({body,...r})=>({...r,description_characters:(body||"").replace(/<[^>]*>/g," ").trim().length,recognized_link: r.url ? jobLink(r.url,true) : null}))
await writeFile(`${out}/inventory.json`,JSON.stringify({at:new Date().toISOString(),rows:inventory},null,2))
console.log(`Snapshot: ${rows.length} jobs; ${rows.filter(r=>!r.closed_at).length} marked open`)
function safe(url:string): URL {
  const u=new URL(url)
  if(u.protocol!=="https:" || u.username || u.password || !u.hostname.includes(".") || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname) || u.hostname.includes(":") || /\.(local|internal|test)$/.test(u.hostname)) throw Error("Non-public or unsupported URL")
  return u
}
type Probe = {url:string;host:string;verdict:string;status?:number;final_url?:string;note?:string;form_controls?:number;job_schema?:boolean;application_links?:string[]}
const circuit = new Map<string,number>()
async function probe(url:string):Promise<Probe> {
  let current=safe(url); const host=current.hostname
  if((circuit.get(host)||0)>=3) return {url,host,verdict:"not_verified_host_blocked",note:"Earlier reads from this host were blocked; no further requests sent."}
  try {
    const signal=AbortSignal.timeout(12000)
    for(let i=0;i<6;i++) {
      const res=await fetch(current,{redirect:"manual",signal,headers:{"User-Agent":"Odds-LinkAudit/1.0","Accept":"text/html,application/xhtml+xml"}})
      if([301,302,303,307,308].includes(res.status) && res.headers.get("location")) { await res.body?.cancel(); current=safe(new URL(res.headers.get("location")!,current).href); continue }
      if([401,403,429,999].includes(res.status)) {await res.body?.cancel(); circuit.set(host,(circuit.get(host)||0)+1);return {url,host,status:res.status,final_url:current.href,verdict:"blocked_or_auth_required"}}
      const reader=res.body?.getReader(); let html=""; if(reader){const decoder=new TextDecoder();while(html.length<600000){const part=await reader.read();if(part.done)break;html+=decoder.decode(part.value,{stream:true})}await reader.cancel().catch(()=>{})}
      const base={url,host,status:res.status,final_url:current.href}
      if([404,410].includes(res.status))return {...base,verdict:"http_not_found"}
      if(!res.ok)return {...base,verdict:"http_error"}
      if(/just a moment|verify you are human|access denied|captcha-delivery|cf-chl-|challenge-platform/i.test(html)){circuit.set(host,(circuit.get(host)||0)+1);return {...base,verdict:"challenge_not_verified"}}
      if(/\/authwall|\/login|\/signin|\/checkpoint/.test(current.pathname))return {...base,verdict:"login_not_verified"}
      const application_links=[...html.matchAll(/href=["']([^"']+)["'][^>]*>\s*(?:<[^>]+>\s*)*(?:Apply(?: now)?|Solliciteer|Solliciteren)/gi)].slice(0,8).map(m=>{try{return safe(new URL(m[1].replace(/&amp;/g,"&"),current).href).href}catch{return ""}}).filter(Boolean)
      const closed=/no longer accepting applications|this (?:job|position) (?:is no longer available|has been filled|has expired)|job (?:not found|no longer available)|vacature (?:is gesloten|niet meer beschikbaar)/i.test(html)
      return {...base,verdict:closed?"possible_closed_requires_review":"http_reachable_only",form_controls:(html.match(/<(?:input|select|textarea)\b/gi)||[]).length,job_schema:/["']@type["']\s*:\s*["']JobPosting/i.test(html),application_links}
    }
    return {url,host,verdict:"redirect_limit"}
  } catch(e) {circuit.set(host,(circuit.get(host)||0)+1);return {url,host,verdict:"network_unverified",note:e instanceof Error?e.name:"Network error"}}
}
const urls=[...new Set(rows.filter(r=>!r.closed_at&&r.url).map(r=>r.url!))]
const queues=new Map<string,string[]>(); const probes:Probe[]=[]
for(const url of urls){try{const host=safe(url).hostname;const list=queues.get(host)||[];list.push(url);queues.set(host,list)}catch{probes.push({url,host:"",verdict:"invalid_or_unsupported_url"})}}
let completed=0
// At most eight hosts at once, one request per host. Blocked hosts stop after three reads.
const groups=[...queues.values()]; let next=0
await Promise.all(Array.from({length:8},async()=>{while(next<groups.length){const group=groups[next++];for(const url of group){probes.push(await probe(url));completed++;if(completed%100===0)console.log(`Classified ${completed}/${urls.length} unique open-job URLs`);await Bun.sleep(50)}}}))
const byUrl=new Map(probes.map(p=>[p.url,p]))
const report=inventory.map(r=>({...r,probe:r.closed_at?{verdict:"database_closed_not_probed"}:!r.url?{verdict:"missing_url"}:byUrl.get(r.url)}))
const summary:Record<string,number>={};for(const r of report){const k=r.probe?.verdict||"unknown";summary[k]=(summary[k]||0)+1}
const providers:Record<string,{total:number;open:number;unrecognized:number;thin_description:number}>={}
for(const r of report){const k=(r.ats||"unspecified").toLowerCase();const p=providers[k]||={total:0,open:0,unrecognized:0,thin_description:0};p.total++;if(!r.closed_at)p.open++;if(!r.recognized_link)p.unrecognized++;if(r.description_characters<120)p.thin_description++}
await writeFile(`${out}/report.json`,JSON.stringify({at:new Date().toISOString(),total:rows.length,unique_open_urls:urls.length,summary,providers,rows:report},null,2))
const csv=(v:unknown)=>`"${String(v??"").replaceAll('"','""')}"`
await writeFile(`${out}/jobs.csv`,["id,title,company,provider,database_closed,url,recognized,description_characters,link_verdict,http_status,final_url",...report.map(r=>[r.id,r.title,r.employer_display,r.ats,Boolean(r.closed_at),r.url,Boolean(r.recognized_link),r.description_characters,r.probe?.verdict,"status" in (r.probe||{})?(r.probe as Probe).status:"","final_url" in (r.probe||{})?(r.probe as Probe).final_url:""].map(csv).join(","))].join("\n"))
await writeFile(`${out}/summary.md`,`# Odds application audit\n\nSnapshot: ${new Date().toISOString()}\n\n${rows.length} database rows inspected. ${urls.length} unique primary URLs on jobs marked open classified. Archived jobs were not network-probed.\n\nHTTP reachability is not proof of an open job or successful autofill. Site blocks, login gates, network failures and circuit-skipped URLs remain unverified. No forms were submitted and no personal files uploaded during this audit.\n\n| Link result | Jobs |\n|---|---:|\n${Object.entries(summary).map(([k,n])=>`| ${k} | ${n} |`).join("\n")}\n\n| Provider | All jobs | Open | Unrecognized URL | Description <120 characters |\n|---|---:|---:|---:|---:|\n${Object.entries(providers).map(([k,p])=>`| ${k} | ${p.total} | ${p.open} | ${p.unrecognized} | ${p.thin_description} |`).join("\n")}\n`)
console.log(JSON.stringify({total:rows.length,summary,providers},null,2))
