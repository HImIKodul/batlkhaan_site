import type { IncomingMessage, ServerResponse } from "node:http";

export interface RouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  params: Record<string,string>;
  query: URLSearchParams;
  requestId: string;
  principal?: { userId:string; email:string; tokenVersion:number };
}
export type Handler = (ctx: RouteContext) => Promise<void>;
export interface Route { method:string; path:string; regex:RegExp; keys:string[]; auth:boolean; handler:Handler; }

export class Router {
  readonly routes: Route[] = [];
  add(method:string, path:string, handler:Handler, auth=true) {
    const keys:string[] = [];
    const pattern = path.split("/").map(part => {
      if (part.startsWith(":")) { keys.push(part.slice(1)); return "([^/]+)"; }
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }).join("/");
    this.routes.push({ method:method.toUpperCase(), path, regex:new RegExp(`^${pattern}/?$`), keys, auth, handler });
  }
  match(method:string, pathname:string): { route:Route; params:Record<string,string> } | null {
    for (const route of this.routes) {
      if (route.method !== method.toUpperCase()) continue;
      const match = route.regex.exec(pathname);
      if (!match) continue;
      return { route, params:Object.fromEntries(route.keys.map((k,i)=>[k,decodeURIComponent(match[i+1])])) };
    }
    return null;
  }
}
