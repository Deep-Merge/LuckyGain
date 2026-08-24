const page = await fetch('http://127.0.0.1:5173/src/lib/db/client.ts').then(r => r.text());
console.log(page.split('\n').slice(0, 15).join('\n'));
const deps = await fetch('http://127.0.0.1:5173/node_modules/.vite/deps/sql__js.js').then(async r => ({status:r.status, text: r.status===200 ? (await r.text()).slice(0,200) : await r.text().then(t=>t.slice(0,200))})).catch(e => ({err:String(e)}));
console.log('deps', deps);
