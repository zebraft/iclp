import {requireChatGPTUser} from '../../chatgpt-auth';
import Setup from './setup';
export const dynamic='force-dynamic';
export const metadata={title:'設定自動儲存 / Set up automatic saving'};
export default async function Page(){await requireChatGPTUser('/sheets/setup');return <Setup/>;}
