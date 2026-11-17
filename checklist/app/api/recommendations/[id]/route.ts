import {env} from 'cloudflare:workers';
import {proxyReview} from '../../../../lib/review-proxy.mjs';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){return proxyReview(req,(await params).id,(env as unknown as Record<string,string>).REVIEW_BACKEND_SERVICE_TOKEN);}
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){return proxyReview(req,(await params).id,(env as unknown as Record<string,string>).REVIEW_BACKEND_SERVICE_TOKEN);}
