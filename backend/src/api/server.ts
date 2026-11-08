import "dotenv/config";
import { prisma } from "../db.js";
import { createApi } from "./app.js";

const {server,config,reviews,beginDrain,operationalSnapshot}=createApi();
/* Review reminders (24/36/44 h), 48 h overdue and stuck-draft retries. Idempotent: notifications are deduplicated by key, so restarts and overlapping runs never duplicate. */
const reviewTimer=setInterval(()=>{void reviews.maintenance().catch(e=>console.error(JSON.stringify({ts:new Date().toISOString(),level:"error",event:"review_maintenance_failed",reason:String(e?.message??e).slice(0,160)})))},5*60_000);
reviewTimer.unref();
void reviews.maintenance().catch(()=>undefined);
server.requestTimeout=config.requestTimeoutMs;
server.headersTimeout=config.headersTimeoutMs;
server.keepAliveTimeout=config.keepAliveTimeoutMs;
server.maxRequestsPerSocket=1000;

/* Development binds to loopback only (a LAN / tunnel could otherwise reach the API directly). Containers and production listen on all interfaces (API_HOST overrides). */
const listenHost=process.env.API_HOST?.trim()||(process.env.NODE_ENV==="production"?"0.0.0.0":"127.0.0.1");
server.listen(config.port,listenHost,()=>{console.log(`MMRI API v1.10.0 listening on ${listenHost}:${config.port}`);console.log(JSON.stringify({ts:new Date().toISOString(),level:"info",event:"service_started",service:"mmri-api",version:"1.10.0",port:config.port,releaseSha:config.releaseSha,instanceId:config.instanceId}));});

let closing=false;
async function shutdown(signal:string,exitCode=0){
  if(closing)return;
  closing=true;
  beginDrain();
  const started=Date.now();
  console.log(JSON.stringify({ts:new Date().toISOString(),level:"info",event:"service_draining",signal,activeRequests:operationalSnapshot().activeRequests,drainMs:config.shutdownDrainMs,forceTimeoutMs:config.shutdownForceTimeoutMs,releaseSha:config.releaseSha,instanceId:config.instanceId}));

  let finished=false;
  const finish=async(code:number,forced=false)=>{
    if(finished)return; finished=true;
    try{await prisma.$disconnect();}catch(error){console.error(JSON.stringify({ts:new Date().toISOString(),level:"error",event:"database_disconnect_failed",releaseSha:config.releaseSha,instanceId:config.instanceId}));}
    console.log(JSON.stringify({ts:new Date().toISOString(),level:code===0?"info":"error",event:"service_stopped",signal,forced,durationMs:Date.now()-started,releaseSha:config.releaseSha,instanceId:config.instanceId}));
    process.exit(code);
  };

  const forceTimer=setTimeout(()=>{
    console.error(JSON.stringify({ts:new Date().toISOString(),level:"error",event:"service_shutdown_forced",signal,activeRequests:operationalSnapshot().activeRequests,releaseSha:config.releaseSha,instanceId:config.instanceId}));
    try{server.closeAllConnections?.();}catch{}
    void finish(exitCode||1,true);
  },config.shutdownForceTimeoutMs);
  forceTimer.unref();

  const startClose=()=>{
    server.close(error=>{
      clearTimeout(forceTimer);
      if(error){console.error(JSON.stringify({ts:new Date().toISOString(),level:"error",event:"http_server_close_failed",signal,releaseSha:config.releaseSha,instanceId:config.instanceId}));}
      void finish(error?1:exitCode,false);
    });
    try{server.closeIdleConnections?.();}catch{}
  };

  if(config.shutdownDrainMs===0)startClose();
  else { const drainTimer=setTimeout(startClose,config.shutdownDrainMs); drainTimer.unref(); }
}

for(const signal of ["SIGINT","SIGTERM"] as const){
  process.on(signal,()=>void shutdown(signal));
}
process.on("uncaughtException",error=>{
  console.error(JSON.stringify({ts:new Date().toISOString(),level:"error",event:"uncaught_exception",errorName:error instanceof Error?error.name:"Error",errorMessage:error instanceof Error?error.message:String(error),releaseSha:config.releaseSha,instanceId:config.instanceId}));
  void shutdown("uncaughtException",1);
});
process.on("unhandledRejection",reason=>{
  console.error(JSON.stringify({ts:new Date().toISOString(),level:"error",event:"unhandled_rejection",errorName:reason instanceof Error?reason.name:"Error",releaseSha:config.releaseSha,instanceId:config.instanceId}));
  void shutdown("unhandledRejection",1);
});
