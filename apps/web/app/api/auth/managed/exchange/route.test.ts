import {beforeEach,expect,test,vi} from "vitest";
import {POST} from "./route";
const mocks=vi.hoisted(()=>({open:vi.fn(),rate:vi.fn()}));
vi.mock("@/lib/constants",()=>({WEBAPP_URL:"http://localhost:3036"}));
vi.mock("@/modules/auth/managed/session",()=>({openManagedSession:mocks.open}));
vi.mock("@/modules/core/rate-limit/helpers",()=>({applyIPRateLimit:mocks.rate}));
vi.mock("@/modules/auth/lib/pramaan-signin/session",()=>({sessionCookieFor:()=>({name:"forms.session_token",value:"signed-session",attributes:{httpOnly:true,path:"/",sameSite:"lax"}})}));
const request=(body:unknown,origin="http://localhost:3036")=>new Request("http://localhost:3036/api/auth/managed/exchange",{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();mocks.open.mockResolvedValue({token:"token",expiresAt:new Date()});mocks.rate.mockResolvedValue(undefined);});
test("valid same-origin exchange sets the local session cookie",async()=>{
 const response=await POST(request({token:"verified-token",callbackUrl:"http://localhost:3036/workspaces"}));expect(response.status).toBe(200);expect(response.headers.get("set-cookie")).toContain("HttpOnly");expect(response.headers.get("cache-control")).toBe("no-store");expect(await response.json()).toEqual({destination:"http://localhost:3036/workspaces"});
});
test("cross-origin exchanges cannot reach token verification",async()=>{
 expect((await POST(request({token:"token"},"https://attacker.example.test"))).status).toBe(403);expect(mocks.open).not.toHaveBeenCalled();
});
test("a refused token creates no session cookie",async()=>{
 mocks.open.mockRejectedValue(new Error("private remote detail"));const response=await POST(request({token:"refused"}));expect(response.status).toBe(401);expect(response.headers.has("set-cookie")).toBe(false);expect(JSON.stringify(await response.json())).not.toContain("private");
});
test("an outside callback cannot become a redirect target",async()=>{
 const response=await POST(request({token:"token",callbackUrl:"https://attacker.example.test"}));expect(await response.json()).toEqual({destination:"http://localhost:3036"});
});
test("oversized bodies are refused before verification",async()=>{
 const response=await POST(request({token:"x".repeat(20000)}));expect(response.status).toBe(401);expect(mocks.open).not.toHaveBeenCalled();
});
