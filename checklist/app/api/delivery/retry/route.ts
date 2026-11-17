import {env} from 'cloudflare:workers';
import {proxyDelivery} from '../../../../lib/delivery-proxy.mjs';
export async function POST(req:Request){return proxyDelivery(req,(env as unknown as Record<string,string>).REVIEW_BACKEND_SERVICE_TOKEN);}
