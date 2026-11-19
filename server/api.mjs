import { database } from './database.mjs';
import { digest, hashPassword, verifyPassword, passwordNeedsRehash, randomToken } from './crypto.mjs';
import { SLOT_IDS, DEFAULT_SETTINGS } from './constants.mjs';

class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
const fail = (message,status=400) => {throw new HttpError(status,message);};
const json = (data,status=200,headers={}) => new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
const now = () => new Date().toISOString();
export const todayJST = () => new Date(Date.now()+9*3600000).toISOString().slice(0,10);
const plusDays = (date,n) => new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
function text(value,label,max=120){if(typeof value!=='string'||!value.trim()||value.trim().length>max)fail(`${label}を正しく入力してください`);return value.trim();}
function student(value){const id=text(value,'学籍番号',64);if(!/^[a-zA-Z0-9_-]+$/.test(id))fail('学籍番号は半角英数字・ハイフン・アンダースコアで入力してください');return id;}
function password(value){if(typeof value!=='string'||value.length<10||value.length>128)fail('パスワードは10〜128文字で入力してください');return value;}
function dateKey(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)fail('日付が正しくありません');return value;}
function admin(user){if(user?.role!=='admin')fail('管理者権限が必要です',403);}
function loggedIn(user){if(!user)fail('ログインしてください',401);}
function settingsRow(row){return row?{...row,weekly_open_slots:JSON.parse(row.weekly_open_slots)}:structuredClone(DEFAULT_SETTINGS);}
async function getSettings(db){return settingsRow(await db.one('SELECT * FROM settings WHERE id=1'));}
async function getUser(request,db){
  const token=request.headers.get('cookie')?.match(/(?:^|;\s*)keion_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if(!token)return null;
  return db.one('SELECT m.student_id,m.name,m.role FROM sessions s JOIN members m ON m.student_id=s.student_id WHERE s.token_hash=? AND s.expires_at>?',await digest(token),Date.now());
}
function cookie(request,token,maxAge=604800){return `keion_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${new URL(request.url).protocol==='https:'?'; Secure':''}`;}
async function sessionResponse(request,db,user){
  const token=randomToken();
  const result=await db.batch([db.statement('DELETE FROM sessions WHERE expires_at<=?',Date.now()),db.statement('INSERT INTO sessions(token_hash,student_id,expires_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM members WHERE student_id=? AND password_hash=?)',await digest(token),user.student_id,Date.now()+604800000,user.student_id,user.password_hash)]);
  if(!result[1].meta.changes)fail('パスワードが更新されています。再ログインしてください',401);
  return json({user:{student_id:user.student_id,name:user.name,role:user.role}},200,{'Set-Cookie':cookie(request,token)});
}
async function rateLimit(db,key,limit=15){
  const result=await db.one('INSERT INTO login_attempts(key,count,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN login_attempts.reset_at<=? THEN 1 ELSE login_attempts.count+1 END, reset_at=CASE WHEN login_attempts.reset_at<=? THEN excluded.reset_at ELSE login_attempts.reset_at END RETURNING count',key,Date.now()+900000,Date.now(),Date.now());
  if(result.count>limit)fail('試行回数が多いため、15分ほど待ってから再試行してください',429);
}
async function authRateLimit(db,env,kind,id){
  const source=await digest(env.CLIENT_IP||'local');
  await rateLimit(db,'source:'+source,100);
  const key=kind+':'+source+':'+id;
  await rateLimit(db,key);
  return key;
}
async function bodyOf(request){
  if(!request.headers.get('content-type')?.startsWith('application/json'))fail('JSON形式で送信してください',415);
  if(Number(request.headers.get('content-length'))>512000)fail('送信データが大きすぎます',413);
  const raw=await request.text();if(raw.length>512000)fail('送信データが大きすぎます',413);
  let body;try{body=JSON.parse(raw);}catch{fail('送信データが正しくありません');}
  if(!body||typeof body!=='object'||Array.isArray(body))fail('送信データが正しくありません');return body;
}
async function entries(db,raw){
  if(!Array.isArray(raw)||raw.length<1||raw.length>30)fail('バンドメンバーは1〜30名で入力してください');
  const out=[];
  for(const entry of raw){
    if(!entry||typeof entry!=='object'||Array.isArray(entry))fail('メンバー情報の形式が正しくありません');
    const id=student(entry.student_id), name=text(entry.name,'氏名');
    if(out.some(x=>x.student_id===id))fail('メンバーが重複しています');
    const member=await db.one('SELECT name FROM members WHERE student_id=?',id);
    if(!member||member.name!==name)fail(`${id} の学籍番号・氏名を確認してください`);
    out.push({student_id:id,name});
  }return out;
}
async function handle(request,env){
  const url=new URL(request.url),path=url.pathname, db=database(env);
  if(!['GET','POST'].includes(request.method))fail('この操作は対応していません',405);
  if(request.method==='POST'){
    if(request.headers.get('sec-fetch-site')==='cross-site'||(request.headers.get('origin')&&request.headers.get('origin')!==url.origin))fail('別サイトからの操作はできません',403);
  }
  const user=await getUser(request,db);
  if(path==='/api/state'&&request.method==='GET'){
    const needsSetup=!(await db.one('SELECT student_id FROM members LIMIT 1'));
    if(!user)return json({user:null,needsSetup,settings:DEFAULT_SETTINGS,members:[],bands:[],bandMembers:[],roomDays:[],roomSlots:[],reservations:[],requests:[]});
    const first=todayJST().slice(0,7)+'-01', end=plusDays(todayJST(),220);
    const [settings,members,bands,bandMembers,roomDays,roomSlots,reservations,requests]=await Promise.all([
      getSettings(db),user.role==='admin'?db.all('SELECT student_id,name,role FROM members ORDER BY student_id'):db.all('SELECT student_id,name,role FROM members WHERE student_id=?',user.student_id),db.all("SELECT * FROM bands WHERE status='active'"),user.role==='admin'?db.all('SELECT * FROM band_members'):db.all('SELECT * FROM band_members WHERE student_id=?',user.student_id),db.all('SELECT * FROM room_days WHERE date BETWEEN ? AND ?',first,end),db.all('SELECT * FROM room_slots WHERE date BETWEEN ? AND ?',first,end),db.all('SELECT r.*,b.name AS band_name FROM reservations r LEFT JOIN bands b ON b.id=r.band_id WHERE cancelled_at IS NULL AND date BETWEEN ? AND ?',first,end),
      user.role==='admin'?db.all('SELECT * FROM band_requests ORDER BY created_at DESC'):db.all('SELECT * FROM band_requests WHERE student_id=? ORDER BY created_at DESC',user.student_id)
    ]);
    return json({user,needsSetup:false,settings,members,bands,bandMembers,roomDays:roomDays.map(x=>({...x,is_open:!!x.is_open})),roomSlots:roomSlots.map(x=>({...x,is_open:!!x.is_open})),reservations:reservations.map(x=>user.role==='admin'||x.student_id===user.student_id?{...x,bands:{name:x.band_name}}:{id:null,date:x.date,slot_id:x.slot_id,reservation_type:x.reservation_type,student_id:null,band_id:x.band_id,bands:{name:x.band_name}}),requests:requests.map(x=>({...x,member_entries:JSON.parse(x.member_entries)}))});
  }
  if(request.method!=='POST')fail('ページが見つかりません',404);
  const body=await bodyOf(request);
  if(path==='/api/setup'){
    // Hosted setup requires the platform's verified owner-private identity. Local setup is loopback only.
    if(!env.TRUST_PLATFORM_OWNER&&!env.LOCAL_DEV)fail('初期管理者はサーバーの専用コマンドで作成してください',403);
    if(!(env.TRUST_PLATFORM_OWNER&&request.headers.get('oai-authenticated-user-id'))&&!(env.LOCAL_DEV&&['localhost','127.0.0.1'].includes(url.hostname)))fail('サイト所有者としてサインインしてください',403);
    const id=student(body.studentId),name=text(body.name,'氏名'),hash=await hashPassword(password(body.password));
    const result=await db.batch([
      db.statement("INSERT INTO members(student_id,name,role,password_hash,created_at) SELECT ?,?,'admin',?,? WHERE NOT EXISTS(SELECT 1 FROM members)",id,name,hash,now()),
      db.statement('INSERT INTO settings(id,personal_open_days,monthly_band_limit,monthly_personal_limit,weekly_open_slots) VALUES(1,3,8,4,?) ON CONFLICT(id) DO NOTHING',JSON.stringify(DEFAULT_SETTINGS.weekly_open_slots))
    ]);
    if(!result[0].meta.changes)fail('初期設定は完了しています',409);
    return sessionResponse(request,db,{student_id:id,name,role:'admin',password_hash:hash});
  }
  if(path==='/api/login'){
    const id=student(body.studentId);
    const rateKey=await authRateLimit(db,env,'login',id);
    const member=await db.one('SELECT * FROM members WHERE student_id=?',id);
    const valid=typeof body.password==='string'&&body.password.length<=128&&await verifyPassword(body.password,member?.password_hash);
    if(!member||!valid)fail('学籍番号またはパスワードが正しくありません',401);
    if(passwordNeedsRehash(member.password_hash)){
      const hash=await hashPassword(body.password);
      const upgraded=await db.run('UPDATE members SET password_hash=? WHERE student_id=? AND password_hash=?',hash,id,member.password_hash);
      if(!upgraded.meta.changes)fail('認証情報が更新されました。もう一度ログインしてください',401);
      member.password_hash=hash;
    }
    await db.run('DELETE FROM login_attempts WHERE key=?',rateKey);
    return sessionResponse(request,db,member);
  }
  if(path==='/api/register'){
    const id=student(body.studentId);await authRateLimit(db,env,'register',id);
    const member=await db.one('SELECT * FROM members WHERE student_id=?',id);
    if(!member||member.password_hash||!member.invitation_hash||member.invitation_hash!==await digest(String(body.invitationCode||'')))fail('学籍番号・招待コードを確認してください。登録済みの場合はログインしてください',403);
    if(text(body.name,'氏名')!==member.name)fail('登録済みの氏名と一致しません');
    const hash=await hashPassword(password(body.password));
    const result=await db.run('UPDATE members SET password_hash=?,invitation_hash=NULL WHERE student_id=? AND password_hash IS NULL AND invitation_hash=?',hash,id,member.invitation_hash);
    if(!result.meta.changes)fail('登録済みです',409);
    return sessionResponse(request,db,{...member,password_hash:hash});
  }
  if(path==='/api/logout'){
    const token=request.headers.get('cookie')?.match(/keion_session=([a-f0-9]{64})/)?.[1];
    if(token)await db.run('DELETE FROM sessions WHERE token_hash=?',await digest(token));
    return json({ok:true},200,{'Set-Cookie':cookie(request,'',0)});
  }
  loggedIn(user);
  if(path==='/api/password/change'){
    await rateLimit(db,'password:'+user.student_id);
    const next=password(body.newPassword);
    if(next!==body.confirmPassword)fail('新しいパスワードと確認入力が一致しません');
    const member=await db.one('SELECT password_hash FROM members WHERE student_id=?',user.student_id);
    if(typeof body.currentPassword!=='string'||body.currentPassword.length>128||!await verifyPassword(body.currentPassword,member?.password_hash))fail('現在のパスワードが正しくありません',403);
    if(next===body.currentPassword)fail('現在とは異なるパスワードを設定してください');
    const hash=await hashPassword(next);
    const result=await db.batch([
      db.statement('UPDATE members SET password_hash=? WHERE student_id=? AND password_hash=?',hash,user.student_id,member.password_hash),
      db.statement('DELETE FROM sessions WHERE student_id=? AND EXISTS(SELECT 1 FROM members WHERE student_id=? AND password_hash=?)',user.student_id,user.student_id,hash),
      db.statement('DELETE FROM login_attempts WHERE key=? AND EXISTS(SELECT 1 FROM members WHERE student_id=? AND password_hash=?)','password:'+user.student_id,user.student_id,hash),
    ]);
    if(!result[0].meta.changes)fail('パスワードが更新されています。再ログインしてください',409);
    return json({ok:true},200,{'Set-Cookie':cookie(request,'',0)});
  }
  if(path==='/api/reservations'){
    const date=dateKey(body.date),slot=text(body.slot_id,'コマ'),type=body.reservation_type;
    if(!SLOT_IDS.includes(slot)||!['personal','band'].includes(type))fail('予約内容が正しくありません');
    const settings=await getSettings(db),today=todayJST();
    if(date<today||date>plusDays(today,13))fail('予約できるのは今日から14日間です');
    if(type==='personal'&&date>plusDays(today,settings.personal_open_days))fail(`個人予約は${settings.personal_open_days}日後までです`);
    const bandId=type==='band'?text(body.band_id,'バンド'):null;
    const id=crypto.randomUUID();
    await db.run('INSERT INTO reservations(id,date,slot_id,reservation_type,student_id,band_id,created_at) VALUES(?,?,?,?,?,?,?)',id,date,slot,type,user.student_id,bandId,now());
    return json({id},201);
  }
  if(path==='/api/reservations/cancel'){
    const id=text(body.id,'予約');
    const result=await db.run('UPDATE reservations SET cancelled_at=? WHERE id=? AND cancelled_at IS NULL AND (student_id=? OR ?=1)',now(),id,user.student_id,user.role==='admin'?1:0);
    if(!result.meta.changes)fail('予約が見つからないか、削除権限がありません',404);return json({ok:true});
  }
  if(path==='/api/requests'){
    const type=body.request_type,name=text(body.band_name,'バンド名');
    if(!['create','update_members','dissolve'].includes(type))fail('申請種別が正しくありません');
    const band=await db.one("SELECT * FROM bands WHERE name=? AND status='active'",name);
    if(type==='create'&&band)fail('同名のバンドが登録済みです',409);
    if(type!=='create'){
      if(!band)fail('バンドが見つかりません',404);
      if(user.role!=='admin'&&!await db.one('SELECT 1 FROM band_members WHERE band_id=? AND student_id=?',band.id,user.student_id))fail('所属バンドのみ申請できます',403);
    }
    const members=type==='dissolve'?[]:await entries(db,body.member_entries);
    if(type==='create'&&!members.some(x=>x.student_id===user.student_id))fail('作成するバンドに申請者を含めてください');
    const id=crypto.randomUUID();
    await db.run('INSERT INTO band_requests(id,request_type,band_name,band_id,student_id,reason,member_entries,created_at) VALUES(?,?,?,?,?,?,?,?)',id,type,name,band?.id||null,user.student_id,String(body.reason||'').slice(0,2000),JSON.stringify(members),now());
    return json({id},201);
  }
  admin(user);
  if(path==='/api/settings'){
    const current=await getSettings(db);
    for(const key of ['personal_open_days','monthly_band_limit','monthly_personal_limit'])if(body[key]!==undefined){if(!Number.isInteger(body[key])||body[key]<0||body[key]>(key==='personal_open_days'?13:999))fail('予約制限の数値が正しくありません');current[key]=body[key];}
    if(body.weekly_open_slots!==undefined){
      const weekly={};for(let i=0;i<7;i++){const slots=body.weekly_open_slots?.[i];if(!Array.isArray(slots)||slots.some(x=>!SLOT_IDS.includes(x))||new Set(slots).size!==slots.length)fail('曜日ごとのコマ設定が正しくありません');weekly[i]=slots;}current.weekly_open_slots=weekly;
    }
    await db.run('UPDATE settings SET personal_open_days=?,monthly_band_limit=?,monthly_personal_limit=?,weekly_open_slots=? WHERE id=1',current.personal_open_days,current.monthly_band_limit,current.monthly_personal_limit,JSON.stringify(current.weekly_open_slots));return json({ok:true});
  }
  if(path==='/api/room-days'||path==='/api/room-slots'){
    const date=dateKey(body.date);if(date<todayJST()||date>plusDays(todayJST(),220))fail('設定できる日付の範囲外です');
    if(typeof body.is_open!=='boolean')fail('使用可否が正しくありません');
    const note=String(body.note||'').slice(0,500);
    if(path==='/api/room-days')await db.run('INSERT INTO room_days(date,is_open,note) VALUES(?,?,?) ON CONFLICT(date) DO UPDATE SET is_open=excluded.is_open,note=excluded.note',date,Number(body.is_open),note);
    else{if(!SLOT_IDS.includes(body.slot_id))fail('コマが正しくありません');await db.run('INSERT INTO room_slots(date,slot_id,is_open,note) VALUES(?,?,?,?) ON CONFLICT(date,slot_id) DO UPDATE SET is_open=excluded.is_open,note=excluded.note',date,body.slot_id,Number(body.is_open),note);}return json({ok:true});
  }
  if(path==='/api/members/role'){
    const id=student(body.student_id);if(id===user.student_id)fail('自分の権限は変更できません');if(!['admin','member'].includes(body.role))fail('権限が正しくありません');
    const result=await db.run('UPDATE members SET role=? WHERE student_id=?',body.role,id);if(!result.meta.changes)fail('部員が見つかりません',404);return json({ok:true});
  }
  if(path==='/api/members/import'){
    if(!Array.isArray(body.members)||!body.members.length||body.members.length>300)fail('CSVは1〜300名ずつ取り込んでください');
    const statements=[],invitations=[],seen=new Set();
    for(const raw of body.members){
      if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('CSVの各行は部員情報のオブジェクトで指定してください');
      const id=student(raw.student_id),name=text(raw.name,'氏名'),role=raw.role||'member';
      if(seen.has(id))fail(`${id} が重複しています`);seen.add(id);
      if(!['member','admin'].includes(role))fail(`${id} の権限が正しくありません`);
      if(id===user.student_id&&role!=='admin')fail('自分の管理者権限は解除できません');
      const existing=await db.one('SELECT password_hash FROM members WHERE student_id=?',id);
      let hash=null,invite=null;
      if(!existing?.password_hash){
        if(raw.password)hash=await hashPassword(password(raw.password));
        else{const code=randomToken().slice(0,24);invite=await digest(code);invitations.push({student_id:id,name,invitation_code:code});}
      }
      statements.push(db.statement('INSERT INTO members(student_id,name,role,password_hash,invitation_hash,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(student_id) DO UPDATE SET name=excluded.name,role=excluded.role,password_hash=COALESCE(members.password_hash,excluded.password_hash),invitation_hash=CASE WHEN members.password_hash IS NULL THEN excluded.invitation_hash ELSE NULL END',id,name,role,hash,invite,now()));
    }
    await db.batch(statements);return json({count:statements.length,invitations});
  }
  if(path==='/api/requests/review'){
    if(!['approved','rejected'].includes(body.status))fail('承認結果が正しくありません');
    const result=await db.run("UPDATE band_requests SET status=?,reviewed_at=?,reviewed_by=? WHERE id=? AND status='pending'",body.status,now(),user.student_id,text(body.id,'申請'));
    if(!result.meta.changes)fail('申請は処理済みか、見つかりません',409);return json({ok:true});
  }
  fail('操作が見つかりません',404);
}
export async function api(request,env){
  try{return await handle(request,env);}catch(error){
    if(error instanceof HttpError)return json({error:error.message},error.status);
    const message=String(error.message||error);
    const known={E_SLOT_TAKEN:'このコマはすでに予約されています',E_MONTHLY_LIMIT:'月間予約上限に達しています',E_ROOM_CLOSED:'このコマは開放されていません',E_BAND_MEMBER:'有効な所属バンドのみ予約できます',E_DATE_RANGE:'予約できる日付の範囲外です',E_REQUEST_INVALID:'申請内容が現在の部員・バンド情報と一致しません'};
    for(const [key,value]of Object.entries(known))if(message.includes(key))return json({error:value},409);
    if(message.includes('UNIQUE constraint')||error.code==='23505')return json({error:'同じ予約またはバンドがすでに登録されています'},409);
    console.error('API failure',request.method,new URL(request.url).pathname);
    return json({error:'データを保存・取得できませんでした。時間をおいて再試行してください'},503);
  }
}
