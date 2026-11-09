import type { ServerResponse } from "node:http";

export function json(res:ServerResponse, status:number, data:unknown, headers:Record<string,string>={}) {
  const body = JSON.stringify(data);
  res.writeHead(status, { "content-type":"application/json; charset=utf-8", "content-length":Buffer.byteLength(body), ...headers });
  res.end(body);
}
export function ok(res:ServerResponse, data:unknown) { json(res,200,{data}); }
export function created(res:ServerResponse, data:unknown) { json(res,201,{data}); }
export function noContent(res:ServerResponse, headers:Record<string,string>={}) { res.writeHead(204,headers); res.end(); }
