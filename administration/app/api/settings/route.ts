import { saveLibraryCredentials,removeLibraryCredentials,requireLibraryAdmin } from '../../../lib/credentials';
import { userId,sameOrigin,json,safeError } from '../../../lib/service';
import { z } from 'zod';
import { authenticate } from '../../../lib/worldcat.mjs';
export async function POST(req:Request){try{const id=userId(req);sameOrigin(req);await requireLibraryAdmin(id);if(!req.headers.get('content-type')?.startsWith('application/json'))return json({error:'JSON required'},415);const data=z.object({id:z.string().trim().min(1).max(1000),secret:z.string().trim().min(1).max(1000)}).parse(await req.json());await authenticate(data.id.trim(),data.secret.trim());await saveLibraryCredentials(id,data.id.trim(),data.secret.trim());return json({saved:true});}catch(e){return json({error:safeError(e)},400);}}
export async function DELETE(req:Request){try{const id=userId(req);sameOrigin(req);await removeLibraryCredentials(id);return json({removed:true});}catch(e){return json({error:safeError(e)},400);}}
