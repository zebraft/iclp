import {env} from 'cloudflare:workers';
import {googleStatus} from '../../../lib/sheet-sync';
import {recommendationSummary} from '../../../lib/admin-summary.mjs';
import { getLibrarySettings } from '../../../lib/credentials';
import { userId,json,safeError } from '../../../lib/service';
export async function GET(req:Request){try{const id=userId(req);const settings=await getLibrarySettings();const [google,recommendations]=await Promise.all([googleStatus(),recommendationSummary(env.DB,id)]);return json({googleConfigured:google.configured&&google.healthy,google,recommendations,configured:!!(settings.id&&settings.secret),credentialScope:'library',canManage:settings.ownerId===id,symbol:'AAE',allASCoverageVerified:false});}catch(e){return json({error:safeError(e)},401);}}
