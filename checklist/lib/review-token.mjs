// Fragment capabilities stay out of HTTP request URLs and server access logs.
export function consumeReviewToken(href,replace){
 const url=new URL(href),queryToken=url.searchParams.get('key'),token=queryToken||url.hash.slice(1);
 if(queryToken){url.searchParams.delete('key');url.hash=token;replace(url.pathname+url.search+url.hash);}
 return token;
}
