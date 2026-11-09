import { ApiError } from "../errors.js";

interface Bucket { count:number; resetAt:number; }

export class MemoryRateLimiter {
  private readonly buckets = new Map<string,Bucket>();
  private checks=0;
  constructor(
    private readonly limit:number,
    private readonly windowMs:number,
    private readonly maxBuckets=50_000
  ) {}

  check(key:string): void {
    const now=Date.now();
    this.checks += 1;
    if((this.checks & 255)===0)this.prune(now);
    const current=this.buckets.get(key);
    if (!current || current.resetAt<=now) {
      if(this.buckets.size>=this.maxBuckets)this.prune(now,true);
      this.buckets.set(key,{count:1,resetAt:now+this.windowMs});
      return;
    }
    current.count += 1;
    if (current.count>this.limit) {
      const retryAfterSeconds=Math.max(1,Math.ceil((current.resetAt-now)/1000));
      throw new ApiError(429,"RATE_LIMITED","Too many requests; try again later",{retryAfterSeconds});
    }
  }

  private prune(now:number,force=false){
    for(const [key,bucket] of this.buckets){
      if(bucket.resetAt<=now)this.buckets.delete(key);
    }
    if(force&&this.buckets.size>=this.maxBuckets){
      const overflow=this.buckets.size-this.maxBuckets+1;
      let removed=0;
      for(const key of this.buckets.keys()){
        this.buckets.delete(key);
        removed+=1;
        if(removed>=overflow)break;
      }
    }
  }
}
