import "dotenv/config";
import { prisma } from "../db.js";
import { createApi } from "./app.js";

const {server,config,beginDrain,operationalSnapshot}=createApi();
server.requestTimeout=config.requestTimeoutMs;
server.headersTimeout=config.headersTimeoutMs;
server.keepAliveTimeout=config.keepAliveTimeoutMs;
server.maxRequestsPerSocket=1000;

server.listen(config.port,"0.0.0.0",()=>{console.log(`MMRI API v1.10.0 listening on :${config.port}`);console.log(JSON.stringify({ts:new Date().toISOString(),level:"info",event:"service_started",service:"mmri-api",version:"1.10.0",port:config.port,releaseSha:config.releaseSha,instanceId:config.instanceId}));});

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
