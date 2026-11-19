import { api } from './api.mjs';
export function createWorker(assets) {
  return {async fetch(request,env) {
    const url=new URL(request.url);
    if(url.pathname.startsWith('/api/'))return api(request,{...env,CLIENT_IP:env.CLIENT_IP||request.headers.get('cf-connecting-ip')||'local',TRUST_PLATFORM_OWNER:!!env.DB&&!env.LOCAL_DEV});
    if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
    let path=url.pathname;
    if(path==='/')path='/index.html';
    if(path.endsWith('/'))path+='index.html';
    if(!assets[path]&&assets[path+'.html'])path+='.html';
    if(!assets[path]&&assets[path+'/index.html'])path+='/index.html';
    const asset=assets[path];if(!asset)return new Response('ページが見つかりません',{status:404});
    return new Response(request.method==='HEAD'?null:asset.content,{headers:{'Content-Type':asset.type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"}});
  }};
}
