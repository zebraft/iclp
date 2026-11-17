import Checklist from './review';
export const dynamic='force-dynamic';
export const metadata={title:'挑書',referrer:'no-referrer',robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <Checklist id={id}/>;}
