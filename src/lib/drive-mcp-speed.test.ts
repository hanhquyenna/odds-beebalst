import { expect, test } from "bun:test"
import { handleDriveMcp } from "../../supabase/functions/mcp/drive"

const id = "11111111-2222-3333-4444-555555555555"
test("MCP navigation action returns the resulting page without a second model request", async () => {
  const original = globalThis.fetch
  const deno = (globalThis as unknown as {Deno?:unknown}).Deno
  const writes: Array<{tool?:string;args?:unknown}> = []
  Object.assign(globalThis,{Deno:{env:{get:()=>"test-secret"}}})
  globalThis.fetch = (async (input: string | URL | Request, init?:RequestInit) => {
    const url=typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    let result:unknown=[]
    if(url.includes("drive_runs?") && !init?.method) result=[{id,status:"running",steps:0,expires_at:new Date(Date.now()+60000).toISOString()}]
    if(url.endsWith("drive_commands") && init?.method === "POST") {
      const body=JSON.parse(typeof init.body === "string" ? init.body : "{}") as {tool:string;args?:unknown};writes.push(body);result=[{id:body.tool==="read_page"?2:1}]
    }
    if(url.includes("drive_commands?id=eq.1") && !init?.method) result=[{status:"done",result:{ok:true,page_pending:true}}]
    if(url.includes("drive_commands?id=eq.2")) result=[{status:"done",result:{url:"https://careers.example.org/application",fields:[{id:"f0",filled:true,by:"odds"}]}}]
    return new Response(JSON.stringify(result),{status:200})
  }) as typeof fetch
  try {
    const res=await handleDriveMcp(new Request("https://test.invalid/drive",{method:"POST",headers:{"x-odds-drive-key":"test-secret"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"click",arguments:{run_id:id,id:"b0"}}})}),{url:"https://test.invalid",serviceKey:"test-key"})
    const json=await res.json() as {result:{content:Array<{text:string}>}}
    const out=JSON.parse(json.result.content[0].text) as {page_pending:boolean;page:{url:string}}
    expect(out.page_pending).toBe(false)
    expect(out.page.url).toEndWith("/application")
    expect(writes.map(x=>x.tool)).toEqual(["click","read_page"])
    expect(writes[1].args).toEqual({after_action:true})
  } finally {
    globalThis.fetch=original
    Object.assign(globalThis,{Deno:deno})
  }
})
