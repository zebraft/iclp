import {redirect} from 'next/navigation';
export const dynamic='force-dynamic';
// The researcher interface lives only on 挑書. Keep an old-link redirect for staff.
export default async function Page({params,searchParams}:{params:Promise<{id:string}>,searchParams:Promise<{key?:string}>}){const {id}=await params;const {key}=await searchParams;redirect('https://checklist.example.invalid/recommendations/'+encodeURIComponent(id)+(key?'#'+encodeURIComponent(key):''));}
