import { requireChatGPTUser } from './chatgpt-auth';
import Client from './ui';
export const dynamic='force-dynamic';
export default async function Page(){await requireChatGPTUser('/');return <Client/>;}
