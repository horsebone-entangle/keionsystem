const encoder = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join('');
export const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export async function digest(value) {return hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));}
export const PASSWORD_ITERATIONS = 600000;
export async function hashPassword(password, salt = randomToken(), iterations = PASSWORD_ITERATIONS) {
  const key = await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  const result = await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode(salt),iterations,hash:'SHA-256'},key,256);
  return `pbkdf2-sha256$${iterations}$${salt}$${hex(result)}`;
}
export const passwordNeedsRehash = stored => Number((stored || '').split('$')[1]) < PASSWORD_ITERATIONS;
export async function verifyPassword(password, stored) {
  const parts = (stored || '').split('$');
  if(parts.length !== 4 || parts[0] !== 'pbkdf2-sha256' || !/^[0-9]+$/.test(parts[1]) || !/^[a-f0-9]{64}$/.test(parts[2]) || !/^[a-f0-9]{64}$/.test(parts[3])) return false;
  const iterations=Number(parts[1]);
  if(!Number.isSafeInteger(iterations)||iterations<100000||iterations>2000000)return false;
  const actual = await hashPassword(password,parts[2],iterations);
  let diff = actual.length ^ stored.length;
  for(let i=0;i<actual.length;i++) diff |= actual.charCodeAt(i) ^ (stored.charCodeAt(i)||0);
  return diff === 0;
}
