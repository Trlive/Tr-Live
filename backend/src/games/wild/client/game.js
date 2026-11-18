/* =====================================================================
   ART — tüm görseller özgün, kodla (canvas) boyanır
   ===================================================================== */
const ART=(()=>{
const TAU=Math.PI*2;
let seed=7;
const rnd=()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646};
const rr=(a,b)=>a+rnd()*(b-a);
let KS=1;
const cv0=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c};
const cv=(w,h)=>{const c=cv0(Math.ceil(w*KS),Math.ceil(h*KS));if(KS!==1)c.getContext('2d').scale(KS,KS);return c};
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const hex=h=>{h=h.replace('#','');return [parseInt(h.substr(0,2),16),parseInt(h.substr(2,2),16),parseInt(h.substr(4,2),16)]};
const mix=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const rgb=(c,a=1)=>`rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;
const shade=(c,k)=>k>=0?mix(c,[255,255,255],k):mix(c,[0,0,0],-k);
/* değer gürültüsü */
const NP=[];for(let i=0;i<512;i++)NP.push(Math.random());
function vnoise(x,y){
  const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi;
  const h=(a,b)=>NP[(((a*57+b*131)%512)+512)%512];
  const s=t=>t*t*(3-2*t);
  const a=h(xi,yi),b=h(xi+1,yi),c=h(xi,yi+1),d=h(xi+1,yi+1);
  const u=s(xf),v=s(yf);return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;
}
const fbm=(x,y)=>vnoise(x,y)*.6+vnoise(x*2.1,y*2.1)*.3+vnoise(x*4.3,y*4.3)*.1;
function lg(x,x0,y0,x1,y1,stops){const g=x.createLinearGradient(x0,y0,x1,y1);stops.forEach(([o,c])=>g.addColorStop(o,c));return g}
function rg(x,x0,y0,r0,x1,y1,r1,stops){const g=x.createRadialGradient(x0,y0,r0,x1,y1,r1);stops.forEach(([o,c])=>g.addColorStop(o,c));return g}
function star4(x,px,py,r,a=1){
  x.save();x.globalAlpha=a;x.translate(px,py);
  const g=rg(x,0,0,0,0,0,r*1.6,[[0,'rgba(255,255,255,.9)'],[.3,'rgba(255,250,210,.5)'],[1,'rgba(255,240,200,0)']]);
  x.fillStyle=g;x.beginPath();x.arc(0,0,r*1.6,0,TAU);x.fill();
  x.fillStyle='#fff';x.beginPath();
  x.moveTo(0,-r);x.quadraticCurveTo(r*.12,-r*.12,r,0);x.quadraticCurveTo(r*.12,r*.12,0,r);x.quadraticCurveTo(-r*.12,r*.12,-r,0);x.quadraticCurveTo(-r*.12,-r*.12,0,-r);x.fill();
  x.restore();
}
/* noktanın path içinde olup olmadığı */
const PT=cv0(4,4).getContext('2d');
const inP=(p,x,y)=>PT.isPointInPath(p,x,y);
function sampleIn(p,bx,by,bw,bh){for(let i=0;i<60;i++){const x=bx+rnd()*bw,y=by+rnd()*bh;if(inP(p,x,y))return [x,y]}return null}
/* kürk fırçası */
function fur(x,path,box,n,colorAt,dirAt,len,wid,alpha=.9){
  x.save();x.clip(path);x.lineCap='round';
  for(let i=0;i<n;i++){
    const p=sampleIn(path,...box);if(!p)continue;
    const [px,py]=p,c=colorAt(px,py);if(!c)continue;
    const d=dirAt(px,py),l=len*rr(.6,1.25),j=rr(-.12,.12);
    const ex=px+d[0]*l,ey=py+d[1]*l,mx=px+d[0]*l*.5-d[1]*l*.18*rr(-1,1),my=py+d[1]*l*.5+d[0]*l*.18*rr(-1,1);
    x.strokeStyle=rgb(shade(c,j),alpha);x.lineWidth=wid*rr(.7,1.2);
    x.beginPath();x.moveTo(px,py);x.quadraticCurveTo(mx,my,ex,ey);x.stroke();
  }
  x.restore();
}
const norm=(x,y)=>{const l=Math.hypot(x,y)||1;return [x/l,y/l]};

/* =================== HARF SEMBOLLERİ =================== */
const GLYPH={
  '10':p=>{p.moveTo(17,27);p.lineTo(31,15);p.lineTo(31,85);p.moveTo(82,50);p.ellipse(65,50,17,33,0,0,TAU)},
  J:p=>{p.moveTo(38,15);p.lineTo(72,15);p.moveTo(63,15);p.lineTo(63,62);p.bezierCurveTo(63,92,24,94,22,66)},
  Q:p=>{p.moveTo(80,46);p.ellipse(50,46,30,33,0,0,TAU);p.moveTo(56,64);p.lineTo(82,88)},
  K:p=>{p.moveTo(30,15);p.lineTo(30,85);p.moveTo(73,15);p.lineTo(35,53);p.moveTo(45,45);p.lineTo(76,85)},
  A:p=>{p.moveTo(17,85);p.lineTo(50,15);p.lineTo(83,85);p.moveTo(32,62);p.lineTo(68,62)}
};
const LETTER_COLORS={
  '10':['#fff7a0','#ff9ae0','#d0108e','#5a0040'],
  J:['#e8fdff','#5ac0ff','#1a3ad0','#0a1460'],
  Q:['#f8ffc0','#60e650','#0a8c2c','#043a10'],
  K:['#fff6c8','#ffbc2a','#d06000','#4a1a00'],
  A:['#ffeec0','#ff7a30','#c0140e','#4a0400']
};
function letter(key,W=208,H=260){
  const c=cv(W,H),x=c.getContext('2d');
  const p=new Path2D();GLYPH[key](p);
  const sc=key==='10'?1.86:1.9,ox=(W-100*sc)/2+6,oy=(H-100*sc)/2+2;
  const lw=21,[c1,c2,c3,c4]=LETTER_COLORS[key];
  const S=(ctx,w,style,dx=0,dy=0)=>{ctx.save();ctx.translate(ox+dx,oy+dy);ctx.scale(sc,sc);ctx.transform(1,0,-.1,1,5,0);ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=w;ctx.strokeStyle=style;ctx.stroke(p);ctx.restore()};
  // gölge
  x.save();x.filter='blur(4px)';S(x,lw+16,'rgba(0,0,0,.6)',0,7);x.restore();
  S(x,lw+15,'#060606');
  // altın kenar
  const gold=lg(x,0,oy,0,oy+100*sc,[[0,'#fff7c8'],[.35,'#ffd24a'],[.6,'#c07a10'],[.8,'#ffe08a'],[1,'#8a4a00']]);
  S(x,lw+8.5,gold);
  S(x,lw+2,c4);
  // dolgu katmanı
  const f=cv(W,H),fx=f.getContext('2d');
  S(fx,lw,'#fff');
  fx.globalCompositeOperation='source-in';
  fx.fillStyle=lg(fx,0,oy+8,0,oy+100*sc-8,[[0,c1],[.42,c2],[1,c3]]);fx.fillRect(0,0,W,H);
  fx.globalCompositeOperation='source-atop';
  // doku
  for(let i=0;i<260;i++){fx.fillStyle=`rgba(255,255,255,${rr(0,.12)})`;fx.beginPath();fx.arc(rr(0,W),rr(0,H),rr(1,3.5),0,TAU);fx.fill()}
  // üst parlama
  fx.fillStyle=lg(fx,0,oy,0,oy+48*sc,[[0,'rgba(255,255,255,.55)'],[1,'rgba(255,255,255,0)']]);fx.fillRect(0,0,W,oy+46*sc);
  // alt gölge
  fx.fillStyle=lg(fx,0,oy+60*sc,0,oy+100*sc,[[0,'rgba(0,0,0,0)'],[1,'rgba(0,0,0,.35)']]);fx.fillRect(0,oy+60*sc,W,H);
  // bevel sırtı
  S(fx,lw*.24,'rgba(255,255,255,.38)',-1.5,-2.5);
  S(fx,lw*.22,'rgba(0,0,0,.18)',2,3);
  x.drawImage(f,0,0,W,H);
  star4(x,ox+30,oy+22,11,.95);star4(x,ox+150,oy+150,6,.7);
  return c;
}

/* =================== YAKUT =================== */
function ruby(W=208,H=260){
  const c=cv(W,H),x=c.getContext('2d'),cx=W/2,cy=H/2+4,R=74;
  const P=(r,a0,n=8)=>Array.from({length:n},(_,i)=>{const a=a0+i*TAU/n;return [cx+Math.cos(a)*r,cy+Math.sin(a)*r*0.95]});
  const out=P(R,-Math.PI/2+Math.PI/8),mid=P(R*.78,-Math.PI/2),tab=P(R*.44,-Math.PI/2+Math.PI/8);
  x.save();x.filter='blur(6px)';x.fillStyle='rgba(0,0,0,.55)';x.beginPath();out.forEach(([a,b],i)=>i?x.lineTo(a,b+8):x.moveTo(a,b+8));x.fill();x.restore();
  const poly=(pts,fill,stroke,lw)=>{x.beginPath();pts.forEach(([a,b],i)=>i?x.lineTo(a,b):x.moveTo(a,b));x.closePath();if(fill){x.fillStyle=fill;x.fill()}if(stroke){x.strokeStyle=stroke;x.lineWidth=lw;x.lineJoin='round';x.stroke()}};
  poly(out,null,'#2a0008',12);
  poly(out,lg(x,cx-R,cy-R,cx+R,cy+R,[[0,'#ff7a8e'],[.5,'#d8102e'],[1,'#5a0010']]));
  const tones=['#ff4a64','#e01a3a','#b00a26','#8a0418','#c0122e','#ff2a4a','#ff6a80','#e83050'];
  for(let i=0;i<8;i++){
    const a=out[i],b=out[(i+1)%8],m=mid[(i+1)%8],t1=tab[i],t2=tab[(i+1)%8];
    poly([a,b,m],tones[i]);poly([t1,t2,m],rgb(shade(hex(tones[(i+3)%8]),.15)));
    poly([a,m,t1],tones[(i+5)%8]);
  }
  poly(tab,rg(x,cx-15,cy-20,4,cx,cy,R*.5,[[0,'#ffd0d8'],[.35,'#ff5a74'],[1,'#c0102c']]));
  x.globalAlpha=.35;for(let i=0;i<8;i++){x.strokeStyle='#fff';x.lineWidth=1.2;x.beginPath();x.moveTo(...out[i]);x.lineTo(...mid[(i+1)%8]);x.lineTo(...tab[i]);x.stroke()}x.globalAlpha=1;
  poly(out,null,'rgba(255,190,200,.8)',2.5);
  x.fillStyle='rgba(255,255,255,.75)';x.beginPath();x.moveTo(cx-40,cy-46);x.lineTo(cx-14,cy-58);x.lineTo(cx-30,cy-30);x.closePath();x.fill();
  star4(x,cx-28,cy-36,15);star4(x,cx+36,cy+28,8,.8);
  return c;
}

/* =================== ORTAK: METAL HALKA =================== */
function goldStroke(x,path,w,y0,y1){
  x.strokeStyle='#2a1200';x.lineWidth=w+6;x.stroke(path);
  x.strokeStyle=lg(x,0,y0,0,y1,[[0,'#fffbe0'],[.18,'#ffd24a'],[.45,'#b86e08'],[.6,'#ffe9a0'],[.82,'#c8820e'],[1,'#7a3e00']]);x.lineWidth=w;x.stroke(path);
  x.strokeStyle='rgba(255,255,255,.5)';x.lineWidth=1.5;x.stroke(path);
}
function rrect(x,y,w,h,r){const p=new Path2D();p.moveTo(x+r,y);p.arcTo(x+w,y,x+w,y+h,r);p.arcTo(x+w,y+h,x,y+h,r);p.arcTo(x,y+h,x,y,r);p.arcTo(x,y,x+w,y,r);p.closePath();return p}

/* =================== FREE MADALYON =================== */
function free(W=208,H=260,scale=1){
  const c=cv(W,H),x=c.getContext('2d'),cx=W/2,cy=H/2+2;
  x.save();x.translate(cx,cy);x.scale(scale,scale);x.translate(-cx,-cy);
  // gölge
  x.save();x.filter='blur(7px)';x.fillStyle='rgba(0,0,0,.55)';x.beginPath();x.arc(cx,cy+8,82,0,TAU);x.fill();x.restore();
  // dişli yıldız
  const gear=new Path2D();const N=18;
  for(let i=0;i<=N*2;i++){const a=i*Math.PI/N-Math.PI/2,r=i%2?78:88;const px=cx+Math.cos(a)*r,py=cy+Math.sin(a)*r;i?gear.lineTo(px,py):gear.moveTo(px,py)}
  gear.closePath();
  x.fillStyle=lg(x,0,cy-88,0,cy+88,[[0,'#fff6c0'],[.3,'#ffc81e'],[.55,'#b86400'],[.75,'#ffd860'],[1,'#8a4600']]);x.fill(gear);
  x.strokeStyle='#5a2800';x.lineWidth=3;x.stroke(gear);
  // iç halkalar
  x.beginPath();x.arc(cx,cy,70,0,TAU);x.fillStyle=lg(x,0,cy-70,0,cy+70,[[0,'#8a4a00'],[.5,'#ffe490'],[1,'#7a3a00']]);x.fill();
  x.beginPath();x.arc(cx,cy,62,0,TAU);x.fillStyle=rg(x,cx-18,cy-24,6,cx,cy,64,[[0,'#ff7a5a'],[.5,'#d01818'],[1,'#5a0008']]);x.fill();
  // ışın deseni
  x.save();x.beginPath();x.arc(cx,cy,62,0,TAU);x.clip();x.globalAlpha=.18;
  for(let i=0;i<20;i++){const a=i*TAU/20;x.fillStyle=i%2?'#fff':'#ffb0a0';x.beginPath();x.moveTo(cx,cy);x.arc(cx,cy,64,a,a+TAU/40);x.fill()}
  x.restore();
  // yıldızlar (üst/alt)
  const st=(sx,sy,r)=>{x.beginPath();for(let i=0;i<10;i++){const a=i*Math.PI/5-Math.PI/2,rr2=i%2?r*.45:r;i?x.lineTo(sx+Math.cos(a)*rr2,sy+Math.sin(a)*rr2):x.moveTo(sx+Math.cos(a)*rr2,sy+Math.sin(a)*rr2)}x.closePath();x.fillStyle=lg(x,0,sy-r,0,sy+r,[[0,'#fffbe0'],[1,'#ffb000']]);x.fill();x.strokeStyle='#7a3a00';x.lineWidth=2;x.stroke()};
  st(cx,cy-40,13);st(cx-30,cy+42,8);st(cx+30,cy+42,8);
  // kurdele
  const rb=new Path2D();
  rb.moveTo(cx-98,cy-6);rb.lineTo(cx-80,cy-22);rb.lineTo(cx+80,cy-22);rb.lineTo(cx+98,cy-6);rb.lineTo(cx+86,cy+8);rb.lineTo(cx+98,cy+24);rb.lineTo(cx+80,cy+30);rb.lineTo(cx-80,cy+30);rb.lineTo(cx-98,cy+24);rb.lineTo(cx-86,cy+8);rb.closePath();
  x.fillStyle=lg(x,0,cy-22,0,cy+30,[[0,'#ff5a3a'],[.5,'#c8100e'],[1,'#7a0004']]);x.fill(rb);
  x.strokeStyle='#ffd24a';x.lineWidth=3;x.stroke(rb);x.strokeStyle='#4a0000';x.lineWidth=1;x.stroke(rb);
  // yazı
  x.font='900 46px "Arial Black","Arial",sans-serif';x.textAlign='center';x.textBaseline='middle';
  x.lineJoin='round';x.strokeStyle='#3a0000';x.lineWidth=9;x.strokeText('FREE',cx,cy+5);
  x.fillStyle=lg(x,0,cy-16,0,cy+24,[[0,'#ffffff'],[.45,'#fff0a0'],[1,'#ffb000']]);x.fillText('FREE',cx,cy+5);
  star4(x,cx-46,cy-50,11,.9);
  x.restore();
  return c;
}

/* =================== JACKPOT 777 =================== */
function jackpot(W=208,H=260){
  const c=cv(W,H),x=c.getContext('2d'),cx=W/2,cy=H/2+6;
  const body=rrect(cx-90,cy-62,180,124,26);
  x.save();x.filter='blur(7px)';x.fillStyle='rgba(0,0,0,.55)';x.translate(0,8);x.fill(body);x.restore();
  x.fillStyle=rg(x,cx,cy-30,10,cx,cy,120,[[0,'#3a3a3a'],[.5,'#141414'],[1,'#000000']]);x.fill(body);
  // ışınlar
  x.save();x.clip(body);x.globalAlpha=.12;for(let i=0;i<24;i++){const a=i*TAU/24;x.fillStyle='#ffd86a';x.beginPath();x.moveTo(cx,cy-10);x.arc(cx,cy-10,160,a,a+TAU/48);x.fill()}x.restore();
  goldStroke(x,body,8,cy-62,cy+62);
  // taç
  const cr=new Path2D();cr.moveTo(cx-34,cy-58);cr.lineTo(cx-40,cy-88);cr.lineTo(cx-18,cy-72);cr.lineTo(cx,cy-96);cr.lineTo(cx+18,cy-72);cr.lineTo(cx+40,cy-88);cr.lineTo(cx+34,cy-58);cr.closePath();
  x.fillStyle=lg(x,0,cy-96,0,cy-58,[[0,'#fffbe0'],[.5,'#ffc81e'],[1,'#a05400']]);x.fill(cr);x.strokeStyle='#5a2800';x.lineWidth=2.5;x.stroke(cr);
  [[cx-40,cy-88],[cx,cy-96],[cx+40,cy-88]].forEach(([a,b])=>{x.beginPath();x.arc(a,b,5,0,TAU);x.fillStyle='#ff2a5a';x.fill();x.strokeStyle='#fff6';x.stroke()});
  // 777
  x.font='900 70px "Arial Black","Arial",sans-serif';x.textAlign='center';x.textBaseline='middle';x.lineJoin='round';
  x.save();x.translate(cx,cy-6);x.scale(.92,1);
  x.strokeStyle='#2a0000';x.lineWidth=13;x.strokeText('777',0,0);
  x.strokeStyle=lg(x,0,-30,0,30,[[0,'#fff3b0'],[.5,'#ffb800'],[1,'#a05000']]);x.lineWidth=7;x.strokeText('777',0,0);
  x.fillStyle=lg(x,0,-28,0,28,[[0,'#ff9a7a'],[.45,'#ff1a1a'],[1,'#8a0000']]);x.fillText('777',0,0);
  x.fillStyle='rgba(255,255,255,.35)';x.fillText('777',0,-2);x.fillStyle=lg(x,0,-28,0,28,[[0,'#ff9a7a'],[.45,'#ff1a1a'],[1,'#8a0000']]);x.fillText('777',0,1);
  x.restore();
  // kurdele + JACKPOT
  const rb=rrect(cx-74,cy+30,148,30,10);
  x.fillStyle=lg(x,0,cy+30,0,cy+60,[[0,'#fff3b0'],[.5,'#ffb800'],[1,'#a05000']]);x.fill(rb);x.strokeStyle='#5a2800';x.lineWidth=2.5;x.stroke(rb);
  x.font='900 22px "Arial Black","Arial",sans-serif';x.fillStyle='#1a1000';x.fillText('JACKPOT',cx,cy+46);
  star4(x,cx-62,cy-40,12);star4(x,cx+66,cy+18,7,.8);
  return c;
}

/* =================== ÇARK =================== */
function wheel(W=208,H=260,withStand=true){
  const c=cv(W,H),x=c.getContext('2d'),cx=W/2,cy=H/2-8,R=72;
  x.save();x.filter='blur(7px)';x.fillStyle='rgba(0,0,0,.5)';x.beginPath();x.arc(cx,cy+10,R+10,0,TAU);x.fill();x.restore();
  if(withStand){
    const st=new Path2D();st.moveTo(cx-14,cy+R-4);st.lineTo(cx+14,cy+R-4);st.lineTo(cx+40,cy+R+40);st.lineTo(cx-40,cy+R+40);st.closePath();
    x.fillStyle=lg(x,cx-40,0,cx+40,0,[[0,'#8a4a00'],[.5,'#ffe08a'],[1,'#8a4a00']]);x.fill(st);x.strokeStyle='#4a2000';x.lineWidth=2;x.stroke(st);
    const base=rrect(cx-52,cy+R+34,104,16,8);x.fillStyle=lg(x,0,cy+R+34,0,cy+R+50,[[0,'#ffe9a0'],[1,'#9a5200']]);x.fill(base);x.stroke(base);
  }
  x.beginPath();x.arc(cx,cy,R+12,0,TAU);x.fillStyle=lg(x,0,cy-R,0,cy+R,[[0,'#fff6c0'],[.4,'#ffc21a'],[.7,'#a05a00'],[1,'#ffd860']]);x.fill();
  x.strokeStyle='#4a2000';x.lineWidth=3;x.stroke();
  const cols=['#ff2a3a','#ffc61a','#2ad04a','#2a8aff','#b44aff','#ff7a1a','#1ad0d0','#ff4ad2'];
  for(let i=0;i<8;i++){const a=i*TAU/8-Math.PI/2-TAU/16;x.beginPath();x.moveTo(cx,cy);x.arc(cx,cy,R,a,a+TAU/8);x.closePath();
    x.fillStyle=rg(x,cx,cy,4,cx,cy,R,[[0,'#fff'],[.25,cols[i]],[1,rgb(shade(hex(cols[i]),-.35))]]);x.fill();x.strokeStyle='#fff8e0';x.lineWidth=2.5;x.stroke()}
  for(let i=0;i<16;i++){const a=i*TAU/16;const bx=cx+Math.cos(a)*(R+6),by=cy+Math.sin(a)*(R+6);
    x.beginPath();x.arc(bx,by,4.2,0,TAU);x.fillStyle=i%2?'#fff':'#fff3a0';x.fill();x.shadowColor='#ffe680';x.shadowBlur=6;x.fill();x.shadowBlur=0}
  x.beginPath();x.arc(cx,cy,17,0,TAU);x.fillStyle=rg(x,cx-5,cy-6,2,cx,cy,18,[[0,'#fffbe0'],[.5,'#ffc21a'],[1,'#8a4600']]);x.fill();x.strokeStyle='#5a2800';x.lineWidth=2;x.stroke();
  const pt=new Path2D();pt.moveTo(cx,cy-R+16);pt.lineTo(cx-13,cy-R-18);pt.lineTo(cx+13,cy-R-18);pt.closePath();
  x.fillStyle=lg(x,0,cy-R-18,0,cy-R+16,[[0,'#ff6a6a'],[1,'#a00010']]);x.fill(pt);x.strokeStyle='#ffe08a';x.lineWidth=2.5;x.stroke(pt);
  x.fillStyle='rgba(255,255,255,.25)';x.beginPath();x.ellipse(cx-22,cy-30,30,16,-.6,0,TAU);x.fill();
  star4(x,cx-40,cy-46,10,.9);
  return c;
}

/* =================== KART ÇERÇEVESİ =================== */
function card(paint,theme){
  const W=208,H=272,c=cv(W,H),x=c.getContext('2d');
  const outer=rrect(10,10,W-20,H-20,30),inner=rrect(20,20,W-40,H-40,22);
  x.save();x.filter='blur(7px)';x.fillStyle='rgba(0,0,0,.6)';x.translate(0,7);x.fill(outer);x.restore();
  x.save();x.clip(inner);
  x.fillStyle=rg(x,W/2,H*.42,10,W/2,H/2,H*.62,theme.bg);x.fillRect(0,0,W,H);
  x.globalAlpha=.09;for(let i=0;i<22;i++){const a=i*TAU/22;x.fillStyle='#ffd86a';x.beginPath();x.moveTo(W/2,H*.42);x.arc(W/2,H*.42,260,a,a+TAU/44);x.fill()}x.globalAlpha=1;
  paint(x,W,H);
  x.fillStyle=lg(x,0,20,0,90,[[0,'rgba(255,255,255,.22)'],[1,'rgba(255,255,255,0)']]);x.fillRect(0,0,W,90);
  x.fillStyle=rg(x,W/2,H/2,H*.35,W/2,H/2,H*.75,[[0,'rgba(0,0,0,0)'],[1,'rgba(0,0,0,.55)']]);x.fillRect(0,0,W,H);
  x.restore();
  goldStroke(x,outer,10,10,H-10);
  x.strokeStyle='rgba(60,20,0,.8)';x.lineWidth=2;x.stroke(inner);
  // köşe taşları
  [[24,24],[W-24,24],[24,H-24],[W-24,H-24]].forEach(([a,b])=>{x.beginPath();x.arc(a,b,6.5,0,TAU);x.fillStyle=rg(x,a-2,b-2,1,a,b,7,[[0,'#fff'],[.4,theme.gem],[1,'#2a0030']]);x.fill();x.strokeStyle='#ffe08a';x.lineWidth=1.5;x.stroke()});
  // üst taş
  const d=new Path2D();d.moveTo(W/2,2);d.lineTo(W/2+14,14);d.lineTo(W/2,28);d.lineTo(W/2-14,14);d.closePath();
  x.fillStyle=lg(x,W/2-14,2,W/2+14,28,[[0,'#fff'],[.4,theme.gem],[1,'#300030']]);x.fill(d);x.strokeStyle='#ffe08a';x.lineWidth=2.5;x.stroke(d);
  if(theme.wild){
    const rb=rrect(30,H-62,W-60,36,14);
    x.fillStyle=lg(x,0,H-62,0,H-26,[[0,'#1c1c1c'],[1,'#050505']]);x.fill(rb);goldStroke(x,rb,4,H-62,H-26);
    x.font='900 italic 31px "Arial Black","Arial",sans-serif';x.textAlign='center';x.textBaseline='middle';x.lineJoin='round';
    x.strokeStyle='#000';x.lineWidth=8;x.strokeText('WILD',W/2,H-43);
    x.fillStyle=lg(x,0,H-58,0,H-28,[[0,'#fffbe0'],[.4,'#ffd84a'],[.75,'#e09a00'],[1,'#ffe08a']]);x.fillText('WILD',W/2,H-43);
  }
  return c;
}

/* =================== GERÇEKÇİ HAYVANLAR: 3B ışıklı kürk boyama =================== */
const LIGHT=(()=>{const l=[-.42,-.6,.68],n=Math.hypot(...l);return l.map(v=>v/n)})();
const ell=(u,v,cx,cy,a,b,c)=>{const p=(u-cx)/a,q=(v-cy)/b,t=1-p*p-q*q;return t>0?c*Math.sqrt(t):0};
const gau=(u,v,cx,cy,sx,sy,A)=>{const p=(u-cx)/sx,q=(v-cy)/sy;return A*Math.exp(-(p*p+q*q)/2)};
const smooth=(e0,e1,x)=>{const t=clamp((x-e0)/(e1-e0),0,1);return t*t*(3-2*t)};
/* yüzey: yükseklik alanı -> normal haritası (cihaz çözünürlüğünde önbellek) */
function surface(W,H,path,hf){
  const k=KS,w=Math.ceil(W*k),h=Math.ceil(H*k);
  const mc=cv0(w,h),mx=mc.getContext('2d');mx.scale(k,k);mx.fillStyle='#fff';mx.fill(path);
  const md=mx.getImageData(0,0,w,h).data,hA=new Float32Array(w*h);
  for(let j=0;j<h;j++)for(let i=0;i<w;i++)hA[j*w+i]=hf((i+.5)/k,(j+.5)/k);
  const N=new Float32Array(w*h*3);
  for(let j=1;j<h-1;j++)for(let i=1;i<w-1;i++){const p=j*w+i,hx=(hA[p+1]-hA[p-1])*k/2,hy=(hA[p+w]-hA[p-w])*k/2,l=Math.hypot(hx,hy,1);N[p*3]=-hx/l;N[p*3+1]=-hy/l;N[p*3+2]=1/l}
  const nAt=(px,py)=>{const i=clamp(Math.round(px*k),1,w-2),j=clamp(Math.round(py*k),1,h-2),p=(j*w+i)*3;return [N[p],N[p+1],N[p+2]]};
  return {w,h,k,md,N,nAt,path};
}
const lit=(n,amb,dif)=>amb+dif*Math.max(0,n[0]*LIGHT[0]+n[1]*LIGHT[1]+n[2]*LIGHT[2]);
const spec=(n,p=24)=>{const hx=LIGHT[0],hy=LIGHT[1],hz=LIGHT[2]+1,l=Math.hypot(hx,hy,hz);return Math.pow(Math.max(0,(n[0]*hx+n[1]*hy+n[2]*hz)/l),p)};
function shadeCol(c,n,o){let s=lit(n,o.amb??.4,o.dif??.82);let r=c[0]*s,g=c[1]*s,b=c[2]*s;
  if(o.rim){const e=Math.pow(1-n[2],2.5)*o.rim[3];r+=o.rim[0]*e;g+=o.rim[1]*e;b+=o.rim[2]*e}
  if(o.sp){const e=spec(n,o.spp||20)*o.sp;r+=255*e;g+=245*e;b+=230*e}
  return [r>255?255:r,g>255?255:g,b>255?255:b]}
/* piksel piksel ışıklı alt katman */
function litLayer(x,W,H,sf,colorAt,o={}){
  const {w,h,k,md,N}=sf,img=new ImageData(w,h),d=img.data;
  for(let j=0;j<h;j++)for(let i=0;i<w;i++){const p=j*w+i,a=md[p*4+3];if(!a)continue;
    const c=colorAt((i+.5)/k,(j+.5)/k),s=shadeCol(c,[N[p*3]||0,N[p*3+1]||0,N[p*3+2]||1],o);
    d[p*4]=s[0];d[p*4+1]=s[1];d[p*4+2]=s[2];d[p*4+3]=a}
  const c=cv0(w,h);c.getContext('2d').putImageData(img,0,0);x.drawImage(c,0,0,W,H);
}

/* akış yönlü kürk dokusu (Line Integral Convolution) */
function licTex(sf,dirAt,lenAt){
  const {w,h,k,md}=sf,n=w*h;
  const NZ=new Float32Array(n),G=[];const gw=Math.ceil(w/3)+2,gh=Math.ceil(h/3)+2;for(let i=0;i<gw*gh;i++)G.push(Math.random());
  for(let j=0;j<h;j++)for(let i=0;i<w;i++){const gx=i/3,gy=j/3,x0=gx|0,y0=gy|0,fx=gx-x0,fy=gy-y0,a=G[y0*gw+x0],b=G[y0*gw+x0+1],c=G[(y0+1)*gw+x0],d=G[(y0+1)*gw+x0+1];
    NZ[j*w+i]=Math.random()*.62+(a+(b-a)*fx+(c-a)*fy+(a-b-c+d)*fx*fy)*.38}
  const DX=new Float32Array(n),DY=new Float32Array(n),LL=new Uint8Array(n);
  for(let j=0;j<h;j++)for(let i=0;i<w;i++){const p=j*w+i;if(!md[p*4+3])continue;const px=(i+.5)/k,py=(j+.5)/k,d=dirAt(px,py);DX[p]=d[0];DY[p]=d[1];LL[p]=Math.min(70,Math.max(2,Math.round(lenAt(px,py)*k*.5)))}
  const T=new Float32Array(n);
  for(let j=0;j<h;j++)for(let i=0;i<w;i++){const p=j*w+i;if(!md[p*4+3])continue;let s=NZ[p],c=1;const L=LL[p];
    for(const sg of[1,-1]){let x=i+.5,y=j+.5;for(let t=0;t<L;t++){const q=(y|0)*w+(x|0);x+=DX[q]*sg;y+=DY[q]*sg;if(x<0||y<0||x>=w||y>=h)break;const r=(y|0)*w+(x|0);if(!md[r*4+3])break;s+=NZ[r];c++}}
    T[p]=Math.max(-1.6,Math.min(1.6,(s/c-.5)*Math.sqrt(12*c)*.42))}
  return {T,DX,DY};
}
/* ışıklı + kürk dokulu katman */
function furLayer(x,W,H,sf,colorAt,dirAt,lenAt,o={}){
  const {w,h,k,md,N}=sf,{T,DX,DY}=licTex(sf,dirAt,lenAt),img=new ImageData(w,h),d=img.data;
  const fa=o.fa??.32,sh=o.sheen??.22,Hx=LIGHT[0],Hy=LIGHT[1],Hz=LIGHT[2]+1,Hl=Math.hypot(Hx,Hy,Hz);
  for(let j=0;j<h;j++)for(let i=0;i<w;i++){const p=j*w+i,a=md[p*4+3];if(!a)continue;
    const nx=N[p*3]||0,ny=N[p*3+1]||0,nz=N[p*3+2]||1,c=colorAt((i+.5)/k,(j+.5)/k),s=shadeCol(c,[nx,ny,nz],o),t=T[p];
    const f=1+fa*t,dif=Math.max(0,nx*LIGHT[0]+ny*LIGHT[1]+nz*LIGHT[2]);
    const th=(DX[p]*Hx+DY[p]*Hy)/Hl,ss=Math.pow(Math.max(0,1-th*th),18)*sh*dif*(.6+.4*Math.max(0,t));
    d[p*4]=Math.min(255,s[0]*f+ss*255);d[p*4+1]=Math.min(255,s[1]*f+ss*240);d[p*4+2]=Math.min(255,s[2]*f+ss*215);d[p*4+3]=a}
  const c=cv0(w,h);c.getContext('2d').putImageData(img,0,0);x.drawImage(c,0,0,W,H);
}
/* maske: çizilen şekillerden (bulanık) 0..1 örnekleyici */
function mask(W,H,draw,blur=0){
  const k=KS,w=Math.ceil(W*k),h=Math.ceil(H*k),c=cv0(w,h),x=c.getContext('2d');
  if(blur)x.filter=`blur(${blur*k}px)`;x.scale(k,k);x.fillStyle='#fff';x.strokeStyle='#fff';draw(x);
  const d=x.getImageData(0,0,w,h).data;
  return (px,py)=>{const i=Math.round(px*k),j=Math.round(py*k);return(i<0||j<0||i>=w||j>=h)?0:d[(j*w+i)*4+3]/255};
}
/* ışıklı kürk telleri — renge göre gruplanıp toplu çizilir */
function hair(x,sf,area,n,colorAt,dirAt,lenAt,wid,alpha,o={}){
  const B=new Map(),add=(key,seg)=>{let b=B.get(key);if(!b){b={p:new Path2D(),c:key};B.set(key,b)}b.p.moveTo(seg[0],seg[1]);b.p.quadraticCurveTo(seg[2],seg[3],seg[4],seg[5])};
  const [bx,by,bw,bh]=area;
  for(let i=0;i<n;i++){
    let px,py,ok=false;for(let t=0;t<30;t++){px=bx+rnd()*bw;py=by+rnd()*bh;if(inP(o.in||sf.path,px,py)){ok=true;break}}if(!ok)continue;
    const c0=colorAt(px,py);if(!c0)continue;
    const nr=sf.nAt(px,py),c=shadeCol(shade(c0,rr(-.08,.08)),nr,o);
    const d=dirAt(px,py),l=lenAt(px,py)*rr(.65,1.2),cu=rr(-.25,.25)*l;
    const mx=px+d[0]*l*.5-d[1]*cu,my=py+d[1]*l*.5+d[0]*cu,ex=px+d[0]*l,ey=py+d[1]*l;
    const q=v=>Math.min(255,Math.round(v/6)*6);
    const key=`${q(c[0])},${q(c[1])},${q(c[2])}`;
    add(key+'|0',[px,py,(px+mx)/2,(py+my)/2,mx,my]);
    add(key+'|1',[mx,my,(mx+ex)/2+(-d[1]*cu*.3),(my+ey)/2+(d[0]*cu*.3),ex,ey]);
  }
  x.save();if(!o.noClip)x.clip(sf.path);x.lineCap='round';
  for(const [k2,b] of B){const [col,part]=k2.split('|');x.strokeStyle=`rgba(${col},${alpha})`;x.lineWidth=part==='0'?wid:wid*.5;x.stroke(b.p)}
  x.restore();
}
/* sivri kavisli şerit (kaplan çizgisi vb.) — simetrik çift */
function taper(p,x0,y0,x1,y1,w,bend,cx,cy,mirror=true){
  for(const s of mirror?[-1,1]:[1]){const X0=cx+s*x0,X1=cx+s*x1,Y0=cy+y0,Y1=cy+y1,dx=X1-X0,dy=Y1-Y0,l=Math.hypot(dx,dy)||1,nx=-dy/l,ny=dx/l;
    const mX=(X0+X1)/2+nx*bend*s,mY=(Y0+Y1)/2+ny*bend*s,ww=w*rr(.85,1.15);
    p.moveTo(X0+nx*ww*.5,Y0+ny*ww*.5);p.quadraticCurveTo(mX+nx*ww*.45,mY+ny*ww*.45,X1,Y1);p.quadraticCurveTo(mX-nx*ww*.45,mY-ny*ww*.45,X0-nx*ww*.5,Y0-ny*ww*.5);p.closePath()}
}
/* gerçekçi göz */
function eye(x,ex,ey,len,ht,rot,iris,o={}){
  x.save();x.translate(ex,ey);x.rotate(rot);
  const al=new Path2D();al.moveTo(-len/2,0);al.quadraticCurveTo(-len*.1,-ht*.95,len/2,-ht*.08);al.quadraticCurveTo(len*.1,ht*.85,-len/2,0);al.closePath();
  x.save();x.filter='blur(1.5px)';x.fillStyle='rgba(0,0,0,.55)';x.scale(1.18,1.35);x.fill(al);x.restore();
  x.fillStyle='#120602';x.save();x.scale(1.12,1.28);x.fill(al);x.restore();
  x.save();x.clip(al);
  const r=ht*(o.ir||.62),ix=o.ix||0;
  x.fillStyle=rg(x,ix,0,0,ix,0,r*1.15,[[0,iris[0]],[.35,iris[1]],[.78,iris[2]],[1,iris[3]]]);x.beginPath();x.arc(ix,0,r*1.18,0,TAU);x.fill();
  x.lineCap='round';for(let i=0;i<46;i++){const a=i*TAU/46+rr(-.05,.05),r0=r*rr(.32,.45),r1=r*rr(.8,1.08);x.strokeStyle=rnd()<.5?'rgba(255,255,220,.22)':'rgba(90,40,0,.28)';x.lineWidth=rr(.4,.9);x.beginPath();x.moveTo(ix+Math.cos(a)*r0,Math.sin(a)*r0);x.lineTo(ix+Math.cos(a)*r1,Math.sin(a)*r1);x.stroke()}
  x.strokeStyle='rgba(40,16,0,.75)';x.lineWidth=r*.16;x.beginPath();x.arc(ix,0,r*1.1,0,TAU);x.stroke();
  x.fillStyle='#000';x.beginPath();if(o.slit)x.ellipse(ix,0,r*.22,r*.82,0,0,TAU);else x.arc(ix,0,r*(o.pr||.42),0,TAU);x.fill();
  x.fillStyle=lg(x,0,-ht,0,ht*.2,[[0,'rgba(0,0,0,.85)'],[.55,'rgba(0,0,0,.25)'],[1,'rgba(0,0,0,0)']]);x.fillRect(-len,-ht,len*2,ht*1.2);
  x.restore();
  x.fillStyle='#fff';x.beginPath();x.ellipse(ix-r*.38,-r*.32,r*.2,r*.15,-.4,0,TAU);x.fill();
  x.fillStyle='rgba(255,255,255,.7)';x.beginPath();x.arc(ix+r*.35,r*.3,r*.08,0,TAU);x.fill();
  x.strokeStyle='rgba(255,255,255,.28)';x.lineWidth=1;x.beginPath();x.moveTo(-len*.35,ht*.28);x.quadraticCurveTo(0,ht*.62,len*.38,ht*.12);x.stroke();
  x.restore();
}
/* diş */
function fang(x,fx,fy,len,dir,w,lean=0){
  const p=new Path2D();p.moveTo(fx-w,fy);p.bezierCurveTo(fx-w*.9,fy+dir*len*.55,fx+lean-w*.25,fy+dir*len*.9,fx+lean,fy+dir*len);p.bezierCurveTo(fx+lean+w*.2,fy+dir*len*.8,fx+w*.8,fy+dir*len*.45,fx+w,fy);p.closePath();
  x.fillStyle=lg(x,fx-w,0,fx+w,0,[[0,'#cdbb98'],[.35,'#fffdf2'],[.7,'#f2e6c8'],[1,'#a8946c']]);x.fill(p);
  x.fillStyle=lg(x,0,fy,0,fy+dir*len,[[0,'rgba(120,90,50,.35)'],[.3,'rgba(0,0,0,0)'],[1,'rgba(90,60,30,.25)']]);x.fill(p);
  x.strokeStyle='rgba(60,30,10,.55)';x.lineWidth=.8;x.stroke(p);
  x.strokeStyle='rgba(255,255,255,.85)';x.lineWidth=1.2;x.beginPath();x.moveTo(fx-w*.35,fy+dir*len*.1);x.quadraticCurveTo(fx-w*.3+lean*.3,fy+dir*len*.5,fx+lean*.8,fy+dir*len*.85);x.stroke();
}
function whiskers(x,cx,cy,list){x.save();x.lineCap='round';
  for(const [sx,sy,ex,ey,bend] of list)for(const s of[-1,1]){const g=lg(x,cx+s*sx,cy+sy,cx+s*ex,cy+ey,[[0,'rgba(255,255,255,.9)'],[1,'rgba(255,255,255,0)']]);
    x.strokeStyle=g;x.lineWidth=1.3;x.beginPath();x.moveTo(cx+s*sx,cy+sy);x.quadraticCurveTo(cx+s*(sx+ex)/2,cy+(sy+ey)/2-bend,cx+s*ex,cy+ey);x.stroke()}x.restore()}

/* =================== KAPLAN =================== */
function smoothPoly(p,pts,close=true){const n=pts.length;p.moveTo((pts[0][0]+pts[n-1][0])/2,(pts[0][1]+pts[n-1][1])/2);for(let i=0;i<n;i++){const a=pts[i],b=pts[(i+1)%n];p.quadraticCurveTo(a[0],a[1],(a[0]+b[0])/2,(a[1]+b[1])/2)}if(close)p.closePath()}
function muzzle(x,W,H,cx,cy,o){
  // bıyık yastıkları: ağzın üst dudağını oluşturur
  const pad=new Path2D();pad.ellipse(cx-o.px,cy+o.py,o.rx,o.ry,-.12,0,TAU);pad.ellipse(cx+o.px,cy+o.py,o.rx,o.ry,.12,0,TAU);
  pad.moveTo(cx-o.px,cy+o.py-o.ry*.9);pad.lineTo(cx+o.px,cy+o.py-o.ry*.9);pad.lineTo(cx+o.px*.4,cy+o.py+o.ry*.55);pad.lineTo(cx-o.px*.4,cy+o.py+o.ry*.55);pad.closePath();
  const phf=(px,py)=>gau(px,py,cx-o.px,cy+o.py,o.rx*.75,o.ry*.75,o.rx*.7)+gau(px,py,cx+o.px,cy+o.py,o.rx*.75,o.ry*.75,o.rx*.7);
  const psf=surface(W,H,pad,phf);
  x.save();x.filter='blur(3px)';x.fillStyle='rgba(0,0,0,.45)';x.translate(0,4);x.fill(pad);x.restore();
  furLayer(x,W,H,psf,(px,py)=>shade(o.col,(fbm(px*.1,py*.1)-.5)*.12),(px,py)=>norm((px-cx)*1.0,(py-cy-o.py+o.ry)*.8),()=>5,{amb:.5,dif:.62,rim:[150,190,255,.25],fa:.3,sheen:.1});
  x.save();x.clip(pad);x.lineCap='round';
  for(let i=0;i<500;i++){const s2=rnd()<.5?-1:1,px=cx+s2*o.px+rr(-o.rx,o.rx),py=cy+o.py+rr(-o.ry,o.ry);x.strokeStyle=`rgba(255,255,255,${rr(.15,.45)})`;x.lineWidth=.6;x.beginPath();x.moveTo(px,py);x.lineTo(px+s2*rr(2,5),py+rr(-1,3));x.stroke()}
  x.restore();
  // alt kenar = siyah dudak
  x.save();x.beginPath();x.rect(cx-o.px-o.rx-2,cy+o.py,(o.px+o.rx+2)*2,o.ry+4);x.clip();x.strokeStyle='rgba(14,4,2,.85)';x.lineWidth=2.4;x.stroke(pad);x.restore();
  x.strokeStyle='rgba(30,10,4,.55)';x.lineWidth=1.4;x.beginPath();x.moveTo(cx,cy+o.py-o.ry*.95);x.lineTo(cx,cy+o.py+o.ry*.35);x.stroke();
  x.fillStyle='rgba(25,10,4,.7)';
  for(const s2 of[-1,1])for(let r=0;r<4;r++)for(let k=0;k<5;k++){const dx=o.px*.35+k*o.rx*.2+r*1.4,dy=-o.ry*.45+r*o.ry*.3;if((dx-o.px)**2/(o.rx*o.rx)+dy*dy/(o.ry*o.ry)>.8)continue;x.beginPath();x.arc(cx+s2*dx+rr(-.8,.8),cy+o.py+dy+rr(-.8,.8),rr(.7,1.05),0,TAU);x.fill()}
}
function snarl(x,cx,cy,o){
  // ağız boşluğu (üst kısmı bıyık yastıklarının altında kalır)
  const m=new Path2D();m.moveTo(cx-o.w,cy+o.top);m.quadraticCurveTo(cx,cy+o.top-6,cx+o.w,cy+o.top);
  m.bezierCurveTo(cx+o.w+3,cy+o.top+o.h*.55,cx+o.w*.55,cy+o.top+o.h,cx,cy+o.top+o.h);m.bezierCurveTo(cx-o.w*.55,cy+o.top+o.h,cx-o.w-3,cy+o.top+o.h*.55,cx-o.w,cy+o.top);m.closePath();
  x.fillStyle=rg(x,cx,cy+o.top+o.h*.45,2,cx,cy+o.top+o.h*.5,o.w*1.1,[[0,'#120002'],[.55,'#44060e'],[.85,'#7a141e'],[1,'#a02a32']]);x.fill(m);
  x.save();x.clip(m);
  x.fillStyle=rg(x,cx,cy+o.top+o.h*.82,2,cx,cy+o.top+o.h*.9,o.w*.75,[[0,'#ffa8b2'],[.6,'#d04c5a'],[1,'#7a1622']]);x.beginPath();x.ellipse(cx,cy+o.top+o.h*.92,o.w*.62,o.h*.34,0,0,TAU);x.fill();
  x.strokeStyle='rgba(110,10,30,.55)';x.lineWidth=1.3;x.beginPath();x.moveTo(cx,cy+o.top+o.h*.68);x.lineTo(cx,cy+o.top+o.h);x.stroke();
  x.fillStyle='rgba(255,255,255,.3)';x.beginPath();x.ellipse(cx-o.w*.22,cy+o.top+o.h*.78,o.w*.2,o.h*.07,-.2,0,TAU);x.fill();
  // alt diş eti + kesiciler
  x.fillStyle='rgba(190,80,100,.85)';x.beginPath();x.ellipse(cx,cy+o.top+o.h+3,o.w*.8,o.h*.2,0,0,TAU);x.fill();
  for(let i=-2;i<=2;i++)if(i)fang(x,cx+i*o.w*.14,cy+o.top+o.h-1,o.h*.18,-1,o.w*.06);
  x.restore();
  fang(x,cx-o.w*.52,cy+o.top-2,o.h*.95,1,o.w*.2,o.w*.06);fang(x,cx+o.w*.52,cy+o.top-2,o.h*.95,1,o.w*.2,-o.w*.06);
  fang(x,cx-o.w*.45,cy+o.top+o.h-2,o.h*.55,-1,o.w*.15,o.w*.04);fang(x,cx+o.w*.45,cy+o.top+o.h-2,o.h*.55,-1,o.w*.15,-o.w*.04);
  x.save();x.beginPath();x.rect(cx-o.w-6,cy+o.top+o.h*.35,o.w*2+12,o.h);x.clip();x.strokeStyle='#0c0202';x.lineWidth=3;x.stroke(m);x.restore();
}
function paintTiger(x,W,H){
  const cx=W/2,cy=H*.52;x.save();x.translate(cx,cy+6);x.scale(.86,.86);x.translate(-cx,-cy);
  // kulaklar (taban başın arkasında)
  for(const s of[-1,1]){const ex=cx+s*62,ey=cy-84;
    const ep=new Path2D();ep.moveTo(ex-s*18,ey+18);ep.bezierCurveTo(ex-s*21,ey-4,ex-s*10,ey-21,ex+s*4,ey-21);ep.bezierCurveTo(ex+s*17,ey-21,ex+s*24,ey-5,ex+s*21,ey+16);ep.closePath();
    x.save();x.filter='blur(3px)';x.fillStyle='rgba(0,0,0,.5)';x.fill(ep);x.restore();
    x.fillStyle=rg(x,ex,ey-6,2,ex,ey,26,[[0,'#3a1a0a'],[.6,'#1a0804'],[1,'#080200']]);x.fill(ep);
    const ip=new Path2D();ip.moveTo(ex-s*11,ey+16);ip.bezierCurveTo(ex-s*13,ey+1,ex-s*6,ey-12,ex+s*3,ey-12);ip.bezierCurveTo(ex+s*11,ey-12,ex+s*15,ey-1,ex+s*13,ey+14);ip.closePath();
    x.fillStyle=rg(x,ex,ey+6,2,ex,ey,16,[[0,'#2a1a14'],[.55,'#9a8676'],[1,'#c8b6a2']]);x.fill(ip);
    x.save();x.clip(ip);x.lineCap='round';for(let i=0;i<160;i++){const px=ex+rr(-13,13),py=ey+rr(-10,16);x.strokeStyle=`rgba(250,244,234,${rr(.25,.75)})`;x.lineWidth=rr(.4,1);x.beginPath();x.moveTo(px,py+5);x.quadraticCurveTo(px+s*1.5,py,px+rr(-2,2)+s*2.5,py-rr(6,12));x.stroke()}x.restore();}
  // baş silüeti: kubbe tepe + tüylü yanak püskülleri
  const R=[[26,-98],[50,-92],[67,-77],[82,-54],[92,-26],[98,-4],[106,10],[122,24],[108,31],[126,46],[106,52],[120,68],[98,72],[106,88],[82,88],[84,102],[58,99],[30,106]];
  const pts=[[0,-97],...R,[0,108],...R.slice().reverse().map(([u,v])=>[-u,v])].map(([u,v])=>[cx+u,cy+v]);
  const head=new Path2D();smoothPoly(head,pts);
  const WM=mask(W,H,m=>{
    m.beginPath();m.ellipse(cx,cy+34,36,22,0,0,TAU);m.fill();
    for(const s of[-1,1]){m.beginPath();m.moveTo(cx+s*58,cy+4);m.lineTo(cx+s*112,cy+14);m.lineTo(cx+s*126,cy+50);m.lineTo(cx+s*104,cy+90);m.lineTo(cx+s*62,cy+80);m.lineTo(cx+s*50,cy+40);m.closePath();m.fill();
      m.beginPath();m.ellipse(cx+s*35,cy-39,15,7,s*.22,0,TAU);m.fill();m.beginPath();m.ellipse(cx+s*40,cy-9,13,6,s*.15,0,TAU);m.fill()}
    m.beginPath();m.ellipse(cx,cy+90,44,22,0,0,TAU);m.fill();
  },3.2);
  const SPp=new Path2D();
  taper(SPp,4,-90,3,-72,8,0,cx,cy);
  taper(SPp,10,-80,42,-88,9.5,-4,cx,cy);taper(SPp,12,-68,52,-77,11,-5,cx,cy);taper(SPp,14,-56,58,-63,11,-5,cx,cy);
  taper(SPp,50,-45,78,-55,9.5,-3,cx,cy);taper(SPp,70,-67,82,-41,10,3,cx,cy);taper(SPp,84,-55,92,-29,9,3,cx,cy);
  taper(SPp,9,-43,5,-32,6,1,cx,cy);taper(SPp,52,-18,76,-6,7.5,2,cx,cy);
  taper(SPp,108,3,64,11,14,4,cx,cy);taper(SPp,116,24,68,29,15,5,cx,cy);taper(SPp,114,44,70,45,14,4,cx,cy);
  taper(SPp,106,64,70,61,11,3,cx,cy);taper(SPp,96,82,74,76,7.5,2,cx,cy);taper(SPp,88,-15,66,-9,8,2,cx,cy);
  const SM=mask(W,H,m=>m.fill(SPp),.8);
  const OL=hex('#f8a447'),OD=hex('#c4520a'),WH=hex('#fbf5ec'),BK=hex('#110503');
  const colorAt=(px,py)=>{const u=px-cx,v=py-cy,n=fbm(px*.09,py*.09);
    let c=mix(OL,OD,clamp(.22+Math.abs(u)/120+(v<-40?(-40-v)/110:0)+(n-.5)*.32,0,1));
    c=mix(c,WH,WM(px,py));c=mix(c,BK,Math.min(1,SM(px,py)*1.15));return c};
  const hf=(px,py)=>{const u=px-cx,v=py-cy;return ell(u,v,0,4,110,110,72)+gau(u,v,0,30,32,24,20)+gau(u,v,-38,-30,16,10,8)+gau(u,v,38,-30,16,10,8)-gau(u,v,-34,-19,10,7,10)-gau(u,v,34,-19,10,7,10)+gau(u,v,0,-28,10,34,8)+gau(u,v,-76,34,28,30,12)+gau(u,v,76,34,28,30,12)+gau(u,v,0,6,18,10,9)};
  const sf=surface(W,H,head,hf);const L={amb:.32,dif:.98,rim:[120,190,255,.32]};
  const dirAt=(px,py)=>{const u=px-cx,v=py-cy;let d=norm(u,v-8);const a=Math.abs(u);if(a>40)d=norm(d[0],d[1]+.6*(a-40)/60);if(v<-30&&a<40)d=norm(u*.6,-1);return d};
  const lenAt=(px,py)=>{const a=Math.abs(px-cx),v=py-cy;return a>62&&v>-10?20:v>70?12:8};
  furLayer(x,W,H,sf,colorAt,dirAt,lenAt,{...L,fa:.34,sheen:.2});
  const box=[cx-128,cy-98,256,210];
  hair(x,sf,box,2400,colorAt,dirAt,lenAt,1.05,.42,L);
  hair(x,sf,box,2600,(px,py)=>{const a=Math.abs(px-cx),v=py-cy;return a>64&&v>-8?colorAt(px,py):null},dirAt,()=>17,1.2,.6,{...L,noClip:true});
  // burun köprüsü ışığı + alın gölgesi
  x.save();x.clip(head);x.globalCompositeOperation='soft-light';x.fillStyle=rg(x,cx-10,cy-50,4,cx-6,cy-40,70,[[0,'rgba(255,240,210,.65)'],[1,'rgba(255,240,210,0)']]);x.fillRect(0,0,W,H);x.restore();
  // ağız, yastıklar, burun
  snarl(x,cx,cy,{w:30,top:40,h:34});
  muzzle(x,W,H,cx,cy,{px:17,py:31,rx:22,ry:15,col:hex('#fbf6ee')});
  const n2=new Path2D();n2.moveTo(cx-21,cy-1);n2.bezierCurveTo(cx-14,cy-8,cx+14,cy-8,cx+21,cy-1);n2.bezierCurveTo(cx+19,cy+8,cx+8,cy+17,cx,cy+19);n2.bezierCurveTo(cx-8,cy+17,cx-19,cy+8,cx-21,cy-1);
  x.save();x.filter='blur(2px)';x.fillStyle='rgba(60,20,8,.45)';x.translate(0,2);x.fill(n2);x.restore();
  x.fillStyle=rg(x,cx-4,cy-1,2,cx,cy+6,24,[[0,'#eab0a2'],[.42,'#c07062'],[.8,'#6a2a1e'],[1,'#241008']]);x.fill(n2);
  x.save();x.clip(n2);for(let i=0;i<90;i++){x.fillStyle=`rgba(70,25,12,${rr(.08,.28)})`;x.beginPath();x.arc(cx+rr(-20,20),cy+rr(-6,18),rr(.4,1.1),0,TAU);x.fill()}
  x.fillStyle='rgba(20,6,2,.55)';x.beginPath();x.moveTo(cx-21,cy+2);x.bezierCurveTo(cx-16,cy+12,cx-6,cy+19,cx,cy+20);x.bezierCurveTo(cx+6,cy+19,cx+16,cy+12,cx+21,cy+2);x.lineTo(cx+19,cy+6);x.bezierCurveTo(cx+12,cy+14,cx+5,cy+16,cx,cy+16);x.bezierCurveTo(cx-5,cy+16,cx-12,cy+14,cx-19,cy+6);x.closePath();x.fill();x.restore();
  x.fillStyle='#160402';for(const s of[-1,1]){x.beginPath();x.moveTo(cx+s*3,cy+12);x.quadraticCurveTo(cx+s*11,cy+6,cx+s*16,cy+10);x.quadraticCurveTo(cx+s*10,cy+14,cx+s*3,cy+12);x.fill()}
  x.fillStyle='rgba(255,255,255,.6)';x.beginPath();x.ellipse(cx-7,cy-2,6.5,2.2,-.12,0,TAU);x.fill();
  // gözler
  for(const s of[-1,1])eye(x,cx+s*34,cy-21,33,14,-s*.24,['#fffbd0','#ffd23a','#e08a00','#5a2600'],{ir:.6});
  whiskers(x,cx,cy,[[32,27,104,8,6],[34,31,110,26,4],[35,35,112,44,2],[32,39,106,62,-2],[29,43,98,78,-4]]);
  x.restore();
}

/* =================== ASLAN (WILD) =================== */
function paintLion(x,W,H){
  const cx=W/2,cy=H*.47;
  // yele şekli
  const mane=new Path2D();
  for(let i=0;i<=120;i++){const t=i/120*TAU,r=1+.07*Math.sin(t*7+.5)+.05*Math.sin(t*13+1.3)+.03*Math.sin(t*23);const px=cx+Math.cos(t)*104*r,py=cy+10+Math.sin(t)*116*r;i?mane.lineTo(px,py):mane.moveTo(px,py)}
  mane.closePath();
  const MD=hex('#24100a'),MM=hex('#8a4e1c'),ML=hex('#e8b060');
  const ridge=(px,py)=>{const u=px-cx,v=py-cy-10,th=Math.atan2(v,u),r=Math.hypot(u/104,v/116);return Math.sin(th*30+fbm(px*.035,py*.035)*7+r*5)};
  const mhf=(px,py)=>{const u=px-cx,v=py-cy-10,r=Math.hypot(u/104,v/116);return ell(u,v,0,0,112,124,60)+gau(u,v,0,-70,50,30,8)+5*ridge(px,py)*smooth(.3,.62,r)+4*fbm(px*.06,py*.06)};
  const msf=surface(W,H,mane,mhf);
  const mcol=(px,py)=>{const u=px-cx,v=py-cy-10,r=Math.hypot(u/104,v/116),n=fbm(px*.05,py*.05),rd=ridge(px,py);
    let c=mix(MD,MM,smooth(.3,.7,r+(n-.5)*.35));c=mix(c,ML,clamp(smooth(.62,1.02,r)*.55+(rd*.5+.5)*.22*smooth(.4,.8,r)+(v<-40?.18:0),0,1));c=shade(c,(rd-.2)*.12);return c};
  const LM={amb:.2,dif:1.12,rim:[255,180,100,.35]};
  const mdir=(px,py)=>{const u=px-cx,v=py-cy-10,t0=Math.atan2(v,u),th=t0+.25*Math.sin(Math.hypot(u,v)*.06+t0*3);return norm(Math.cos(th),Math.sin(th)*1.1+.35)};
  const mlen=(px,py)=>{const r=Math.hypot((px-cx)/104,(py-cy-10)/116);return r<.5?10:22+r*16};
  furLayer(x,W,H,msf,mcol,mdir,mlen,{...LM,fa:.45,sheen:.3});
  hair(x,msf,[cx-110,cy-110,220,240],2400,mcol,mdir,mlen,1,.38,LM);
  hair(x,msf,[cx-110,cy-110,220,240],2200,(px,py)=>{const r=Math.hypot((px-cx)/104,(py-cy-10)/116);return r>.75?mix(mcol(px,py),ML,.4):null},mdir,()=>24,1.3,.55,{...LM,noClip:true});
  // yüz çevresi koyu gölge
  x.save();x.fillStyle=rg(x,cx,cy+6,40,cx,cy+6,80,[[0,'rgba(30,10,0,.55)'],[1,'rgba(30,10,0,0)']]);x.beginPath();x.ellipse(cx,cy+6,78,96,0,0,TAU);x.fill();x.restore();
  // kulaklar
  for(const s of[-1,1]){const ex=cx+s*45,ey=cy-50;const ep=new Path2D();ep.ellipse(ex,ey,12,11,s*.3,0,TAU);
    x.fillStyle=rg(x,ex-s*3,ey-5,2,ex,ey,17,[[0,'#d89a52'],[.75,'#7a4214'],[1,'#2a1004']]);x.fill(ep);
    x.fillStyle=rg(x,ex,ey+3,1,ex,ey+3,9,[[0,'#5a3418'],[1,'rgba(90,52,24,0)']]);x.beginPath();x.ellipse(ex,ey+3,9,8,0,0,TAU);x.fill()}
  // yüz
  const face=new Path2D();
  face.moveTo(cx,cy-62);face.bezierCurveTo(cx+34,cy-64,cx+55,cy-44,cx+58,cy-18);face.bezierCurveTo(cx+62,cy+4,cx+60,cy+30,cx+50,cy+52);
  face.bezierCurveTo(cx+40,cy+72,cx+22,cy+88,cx,cy+90);face.bezierCurveTo(cx-22,cy+88,cx-40,cy+72,cx-50,cy+52);
  face.bezierCurveTo(cx-60,cy+30,cx-62,cy+4,cx-58,cy-18);face.bezierCurveTo(cx-55,cy-44,cx-34,cy-64,cx,cy-62);
  const FM=mask(W,H,m=>{m.beginPath();m.ellipse(cx,cy+44,30,25,0,0,TAU);m.fill();for(const s of[-1,1]){m.beginPath();m.ellipse(cx+s*15,cy+38,17,13,0,0,TAU);m.fill();m.beginPath();m.ellipse(cx+s*26,cy-35,10,5,s*.25,0,TAU);m.fill()}m.beginPath();m.ellipse(cx,cy+82,26,12,0,0,TAU);m.fill()},2.5);
  const DM=mask(W,H,m=>{for(const s of[-1,1]){m.beginPath();m.ellipse(cx+s*24,cy-15,18,10,-s*.3,0,TAU);m.fill();m.beginPath();m.ellipse(cx+s*11,cy-4,4.5,20,s*.12,0,TAU);m.fill();m.beginPath();m.ellipse(cx+s*30,cy+30,6,14,s*.3,0,TAU);m.fill()}},3.5);
  const T1=hex('#d8913e'),T2=hex('#8a4a14'),TM=hex('#efd0a0'),TD=hex('#3a1a04');
  const fcol=(px,py)=>{const u=px-cx,v=py-cy,n=fbm(px*.08,py*.08);let c=mix(T1,T2,clamp(Math.abs(u)/70+(n-.5)*.4+(v>40?.0:0),0,1));c=mix(c,TM,FM(px,py));c=mix(c,TD,DM(px,py)*.75);return c};
  const fhf=(px,py)=>{const u=px-cx,v=py-cy;return ell(u,v,0,10,62,92,56)+gau(u,v,0,42,26,24,18)+gau(u,v,-24,-28,14,8,8)+gau(u,v,24,-28,14,8,8)-gau(u,v,-24,-15,9,6,8)-gau(u,v,24,-15,9,6,8)+gau(u,v,0,-12,10,30,8)+gau(u,v,0,15,15,9,7)};
  const fsf=surface(W,H,face,fhf);const LF={amb:.26,dif:1.05,rim:[255,170,80,.3]};
  const fdir=(px,py)=>{const u=px-cx,v=py-cy;let d=norm(u,v-12);if(v<-24&&Math.abs(u)<30)d=norm(u*.5,-1);return d};
  furLayer(x,W,H,fsf,fcol,fdir,(px,py)=>Math.abs(px-cx)>46?11:6.5,{...LF,fa:.3,sheen:.18});
  hair(x,fsf,[cx-62,cy-64,124,156],2000,fcol,fdir,(px,py)=>Math.abs(px-cx)>46?10:5.5,1,.4,LF);
  hair(x,fsf,[cx-62,cy-64,124,156],900,(px,py)=>shade(fcol(px,py),.22),fdir,()=>4,.7,.28,LF);
  // yüz kenarına taşan yele
  const B2=new Map();
  for(let i=0;i<260;i++){const a=rr(.15,Math.PI-.15)+(rnd()<.5?Math.PI:0);const px=cx+Math.cos(a)*rr(54,62),py=cy+10+Math.sin(a)*rr(70,84);const l=rr(10,22),dx=Math.cos(a)*(rnd()<.35?-1:1),dy=Math.sin(a)+.3;
    const c=shadeCol(mix(MM,ML,rr(0,.6)),msf.nAt(px,py),LM);const q=v=>Math.min(255,Math.round(v/8)*8);const key=`${q(c[0])},${q(c[1])},${q(c[2])}`;let b=B2.get(key);if(!b){b=new Path2D();B2.set(key,b)}b.moveTo(px,py);b.quadraticCurveTo(px+dx*l*.6+dy*3,py+dy*l*.6-dx*3,px+dx*l,py+dy*l)}
  x.save();x.lineCap='round';x.lineWidth=1.3;for(const [k,p] of B2){x.strokeStyle=`rgba(${k},.6)`;x.stroke(p)}x.restore();
  // gözler
  for(const s of[-1,1])eye(x,cx+s*24,cy-16,27,12,-s*.28,['#fff3b0','#f0b020','#b86a00','#4a2000'],{ir:.66});
  x.strokeStyle='rgba(60,25,4,.85)';x.lineCap='round';x.lineWidth=2.2;
  // burun köprüsü kırışıkları
  for(let i=0;i<3;i++){x.strokeStyle='rgba(80,40,10,.5)';x.lineWidth=1.4;x.beginPath();x.moveTo(cx-11,cy-4+i*4);x.quadraticCurveTo(cx,cy-1+i*4,cx+11,cy-4+i*4);x.stroke();x.strokeStyle='rgba(255,230,190,.3)';x.lineWidth=.9;x.beginPath();x.moveTo(cx-10,cy-5.5+i*4);x.quadraticCurveTo(cx,cy-2.5+i*4,cx+10,cy-5.5+i*4);x.stroke()}
  snarl(x,cx,cy,{w:27,top:44,h:32});
  muzzle(x,W,H,cx,cy,{px:15,py:36,rx:19,ry:13,col:hex('#f2dcb6')});
  const n2=new Path2D();n2.moveTo(cx-19,cy+11);n2.bezierCurveTo(cx-12,cy+3,cx+12,cy+3,cx+19,cy+11);n2.bezierCurveTo(cx+16,cy+21,cx+7,cy+28,cx,cy+29);n2.bezierCurveTo(cx-7,cy+28,cx-16,cy+21,cx-19,cy+11);
  x.save();x.filter='blur(2px)';x.fillStyle='rgba(40,14,4,.5)';x.translate(0,2);x.fill(n2);x.restore();
  x.fillStyle=rg(x,cx-3,cy+11,2,cx,cy+16,24,[[0,'#a0604a'],[.45,'#5a2a1a'],[1,'#140402']]);x.fill(n2);
  x.save();x.clip(n2);for(let i=0;i<70;i++){x.fillStyle=`rgba(255,220,200,${rr(.03,.12)})`;x.beginPath();x.arc(cx+rr(-18,18),cy+rr(5,28),rr(.4,1.1),0,TAU);x.fill()}x.restore();
  x.fillStyle='rgba(255,255,255,.45)';x.beginPath();x.ellipse(cx-6,cy+10,6,2,-.1,0,TAU);x.fill();
  x.fillStyle='#080100';for(const s of[-1,1]){x.beginPath();x.moveTo(cx+s*3,cy+22);x.quadraticCurveTo(cx+s*11,cy+17,cx+s*15,cy+21);x.quadraticCurveTo(cx+s*9,cy+25,cx+s*3,cy+22);x.fill()}
  whiskers(x,cx,cy,[[28,33,92,16,5],[30,37,98,32,3],[30,41,96,50,1],[28,45,90,66,-3]]);
}

/* =================== KARTAL =================== */
function paintEagle(x,W,H){
  const cx=W/2,cy=H*.5;x.save();x.translate(cx+22,cy+4);x.scale(.86,.86);x.translate(-cx,-cy);H=H+44;
  // gövde
  const body=new Path2D();body.moveTo(cx-104,H);body.bezierCurveTo(cx-92,cy+36,cx-36,cy+26,cx+8,cy+30);body.bezierCurveTo(cx+62,cy+26,cx+102,cy+44,cx+108,H);body.closePath();
  const fh=(px,py)=>{const rh=15,cw=20,row=Math.floor((py-cy-20)/rh),off=(row&1)*cw/2,col=Math.floor((px-off)/cw);let best=0;
    for(let dr=0;dr<=1;dr++){const r2=row-dr,o2=(r2&1)*cw/2;for(let dc=-1;dc<=1;dc++){const c2=Math.floor((px-o2)/cw)+dc,fx=c2*cw+o2+cw/2,fy=cy+20+r2*rh;
      const lx=(px-fx)/(cw*.62),ly=(py-fy)/(rh*1.7);if(ly<-.2)continue;const d=lx*lx+ly*ly;if(d<1){const hh=(1-d)*(.4+ly*.9);if(hh>best)best=hh}}}return best};
  const fid=(px,py)=>{const rh=15,cw=20,row=Math.floor((py-cy-20)/rh),off=(row&1)*cw/2,col=Math.floor((px-off)/cw);return NP[((row*31+col*17)%512+512)%512]};
  const bhf=(px,py)=>ell(px-cx,py-cy-90,0,0,130,90,60)+fh(px,py)*7;
  const bsf=surface(W,H,body,bhf);const LB={amb:.24,dif:1.1,rim:[255,200,140,.25]};
  furLayer(x,W,H,bsf,(px,py)=>{const t=clamp((py-cy-30)/120,0,1),n=fid(px,py);return shade(mix(hex('#7a4a22'),hex('#2e1a0a'),t*.8),(n-.5)*.35+fh(px,py)*.12-.06)},()=>norm(.12,1),()=>9,{...LB,fa:.3,sheen:.15});
  hair(x,bsf,[cx-110,cy+20,224,H-cy],2600,(px,py)=>shade(mix(hex('#8a5a2c'),hex('#3a2210'),clamp((py-cy-30)/120,0,1)),.15),()=>norm(.15,1),()=>6,.7,.3,LB);
  // baş — düz tepe, belirgin kaş çıkıntısı, 3/4 sola bakış
  const head=new Path2D();
  head.moveTo(cx+80,cy+58);
  head.bezierCurveTo(cx+96,cy+30,cx+98,cy-14,cx+88,cy-44);
  head.bezierCurveTo(cx+76,cy-74,cx+44,cy-84,cx+10,cy-82);
  head.bezierCurveTo(cx-18,cy-80,cx-40,cy-70,cx-50,cy-50);
  head.bezierCurveTo(cx-54,cy-40,cx-52,cy-30,cx-46,cy-22);
  head.bezierCurveTo(cx-44,cy-6,cx-42,cy+10,cx-40,cy+18);
  head.bezierCurveTo(cx-38,cy+36,cx-34,cy+52,cx-30,cy+66);
  head.bezierCurveTo(cx+4,cy+56,cx+44,cy+66,cx+80,cy+58);
  const hhf=(px,py)=>{const u=px-cx,v=py-cy;return ell(u,v,22,-8,82,84,64)+gau(u,v,-22,-40,26,7,14)+gau(u,v,-36,4,16,18,6)-gau(u,v,-18,-25,9,7,7)+gau(u,v,40,-50,40,20,6)};
  const hsf=surface(W,H,head,hhf);const LH={amb:.26,dif:.98,rim:[140,160,255,.5]};
  const hcol=(px,py)=>{const u=px-cx,v=py-cy,n=fbm(px*.09,py*.09);let c=mix(hex('#ffffff'),hex('#cfcde0'),clamp(n*.45+(v+20)/220+(u>40?(u-40)/160:0),0,1));if(u<-30&&v>-30&&v<20)c=mix(c,hex('#fff6dc'),.35);return c};
  const hdir=(px,py)=>{const u=px-cx,v=py-cy;if(v>26)return norm(.3,1);if(u>60)return norm(.25,1);if(v<-55)return norm(1,.05+(u+40)/220);return norm(1,.28+v/150)};
  furLayer(x,W,H,hsf,hcol,hdir,(px,py)=>py-cy>26?14:6,{...LH,fa:.26,sheen:.25});
  hair(x,hsf,[cx-56,cy-88,160,160],2600,hcol,hdir,(px,py)=>py-cy>26?12:4.5,.9,.35,LH);
  hair(x,hsf,[cx+40,cy-70,64,140],1200,(px,py)=>(px-cx>66||py-cy>30)?hcol(px,py):null,hdir,()=>13,1.1,.6,{...LH,noClip:true});
  hair(x,hsf,[cx-34,cy+24,120,46],900,(px,py)=>hcol(px,py),()=>norm(.25,1),()=>20,1.6,.75,{...LH,noClip:true});
  // kaş çıkıntısı ve altındaki gölge
  const brow=new Path2D();brow.moveTo(cx-52,cy-34);brow.quadraticCurveTo(cx-18,cy-56,cx+16,cy-42);brow.quadraticCurveTo(cx-12,cy-38,cx-48,cy-27);brow.closePath();
  x.save();x.clip(head);x.fillStyle=rg(x,cx-16,cy-28,2,cx-16,cy-28,30,[[0,'rgba(30,30,70,.5)'],[1,'rgba(30,30,70,0)']]);x.beginPath();x.ellipse(cx-16,cy-27,34,15,-.12,0,TAU);x.fill();x.restore();
  x.fillStyle=rg(x,cx-18,cy-24,2,cx-18,cy-24,15,[[0,'#cdb050'],[.8,'rgba(190,160,70,.6)'],[1,'rgba(190,160,70,0)']]);x.beginPath();x.ellipse(cx-18,cy-24,15,11,-.15,0,TAU);x.fill();
  eye(x,cx-18,cy-25,22,12,-.1,['#fffbe6','#ffe670','#e8aa18','#704000'],{ir:.6,pr:.38,ix:-1.5});
  hair(x,hsf,[cx-54,cy-56,74,32],900,()=>hex('#ffffff'),()=>norm(1,.1),()=>8,1.1,.85,{...LH,in:brow,noClip:true});
  // gaga — güçlü kanca, 3B gölgeli
  const up=new Path2D();
  up.moveTo(cx-42,cy-25);
  up.bezierCurveTo(cx-60,cy-32,cx-84,cy-28,cx-97,cy-8);
  up.bezierCurveTo(cx-106,cy+6,cx-104,cy+26,cx-92,cy+38);
  up.bezierCurveTo(cx-90,cy+28,cx-86,cy+20,cx-78,cy+15);
  up.bezierCurveTo(cx-62,cy+11,cx-44,cy+10,cx-28,cy+6);
  up.bezierCurveTo(cx-30,cy-6,cx-34,cy-18,cx-42,cy-25);
  const lo=new Path2D();lo.moveTo(cx-80,cy+17);lo.bezierCurveTo(cx-62,cy+19,cx-44,cy+17,cx-29,cy+9);lo.bezierCurveTo(cx-31,cy+24,cx-50,cy+32,cx-70,cy+30);lo.closePath();
  x.save();x.filter='blur(2.5px)';x.fillStyle='rgba(20,15,40,.5)';x.translate(3,6);x.fill(up);x.restore();
  x.fillStyle=lg(x,0,cy+10,0,cy+32,[[0,'#e8b428'],[.6,'#a86408'],[1,'#4a2600']]);x.fill(lo);x.strokeStyle='rgba(60,30,0,.6)';x.lineWidth=.9;x.stroke(lo);
  x.fillStyle=lg(x,cx-70,cy-30,cx-66,cy+36,[[0,'#fff6b8'],[.22,'#ffd84a'],[.55,'#f0a018'],[.85,'#c06a04'],[1,'#7a3e00']]);x.fill(up);
  x.save();x.clip(up);
  x.fillStyle=rg(x,cx-96,cy+24,2,cx-96,cy+24,20,[[0,'rgba(90,45,0,.7)'],[1,'rgba(90,45,0,0)']]);x.beginPath();x.arc(cx-96,cy+24,22,0,TAU);x.fill();
  x.fillStyle=rg(x,cx-60,cy+14,2,cx-60,cy+10,40,[[0,'rgba(120,60,0,.45)'],[1,'rgba(120,60,0,0)']]);x.beginPath();x.ellipse(cx-60,cy+12,44,10,0,0,TAU);x.fill();
  x.fillStyle='rgba(255,253,230,.9)';x.beginPath();x.moveTo(cx-44,cy-23);x.bezierCurveTo(cx-62,cy-29,cx-84,cy-25,cx-96,cy-7);x.bezierCurveTo(cx-84,cy-18,cx-62,cy-22,cx-44,cy-17);x.closePath();x.fill();
  x.fillStyle=lg(x,cx-48,0,cx-28,0,[[0,'rgba(255,236,150,0)'],[1,'rgba(255,240,170,.8)']]);x.beginPath();x.ellipse(cx-35,cy-8,11,14,0,0,TAU);x.fill();
  x.strokeStyle='rgba(255,255,255,.55)';x.lineWidth=1.4;x.beginPath();x.moveTo(cx-100,cy+4);x.quadraticCurveTo(cx-101,cy+18,cx-95,cy+30);x.stroke();
  x.restore();
  x.strokeStyle='rgba(80,40,0,.6)';x.lineWidth=1;x.stroke(up);
  x.fillStyle='#3a1c00';x.beginPath();x.ellipse(cx-46,cy-10,4.4,2.1,-.35,0,TAU);x.fill();
  x.strokeStyle='#2e1400';x.lineWidth=2;x.lineCap='round';x.beginPath();x.moveTo(cx-80,cy+16);x.quadraticCurveTo(cx-52,cy+15,cx-26,cy+5);x.quadraticCurveTo(cx-18,cy+1,cx-11,cy+2);x.stroke();
  x.fillStyle='rgba(255,255,255,.95)';x.beginPath();x.ellipse(cx-72,cy-18,9,2.2,-.25,0,TAU);x.fill();
  x.restore();
}


/* =================== COIN =================== */
function coin(S=64){
  const c=cv(S,S),x=c.getContext('2d'),r=S/2-2,cx=S/2,cy=S/2;
  x.beginPath();x.arc(cx,cy,r,0,TAU);x.fillStyle=lg(x,0,0,0,S,[[0,'#fff6c0'],[.4,'#ffc21a'],[.75,'#b86400'],[1,'#ffd860']]);x.fill();
  x.strokeStyle='#6a3000';x.lineWidth=S*.04;x.stroke();
  x.beginPath();x.arc(cx,cy,r*.74,0,TAU);x.fillStyle=rg(x,cx-r*.2,cy-r*.3,1,cx,cy,r*.8,[[0,'#fff3a0'],[.6,'#f0a400'],[1,'#a05400']]);x.fill();
  x.strokeStyle='rgba(120,60,0,.7)';x.lineWidth=S*.03;x.stroke();
  // taç kabartma
  x.save();x.translate(cx,cy+r*.06);const k=r*.42;
  x.beginPath();x.moveTo(-k,k*.5);x.lineTo(-k*1.05,-k*.6);x.lineTo(-k*.5,-k*.05);x.lineTo(0,-k*.85);x.lineTo(k*.5,-k*.05);x.lineTo(k*1.05,-k*.6);x.lineTo(k,k*.5);x.closePath();
  x.fillStyle='#fff8d0';x.fill();x.strokeStyle='#8a4a00';x.lineWidth=S*.025;x.stroke();x.restore();
  x.fillStyle='rgba(255,255,255,.55)';x.beginPath();x.ellipse(cx-r*.35,cy-r*.45,r*.32,r*.14,-.6,0,TAU);x.fill();
  return c;
}

/* =================== ARKA PLAN =================== */
function background(W,H){
  const c=cv(W,H),x=c.getContext('2d');
  x.fillStyle=lg(x,0,0,0,H,[[0,'#1a1408'],[.3,'#0e0c08'],[.65,'#080706'],[1,'#030303']]);x.fillRect(0,0,W,H);
  // altın güneş ışınları (üst merkez)
  x.save();x.globalCompositeOperation='lighter';
  for(let i=0;i<34;i++){const a=(i/33-.5)*2.4;x.fillStyle=lg(x,0,0,0,H*.75,[[0,`rgba(255,200,60,${i%2?.09:.05})`],[1,'rgba(255,200,60,0)']]);
    x.beginPath();x.moveTo(W/2,-H*.04);x.lineTo(W/2+Math.tan(a-.025)*H,H);x.lineTo(W/2+Math.tan(a+.025)*H,H);x.closePath();x.fill()}
  x.restore();
  // art-deco kemerler + altın çizgiler
  const gl=(w,a)=>{x.lineWidth=w;x.strokeStyle=`rgba(230,180,60,${a})`};
  for(const s of[-1,1]){const ax=W/2+s*W*.43;
    for(let k=0;k<3;k++){gl(W*.0035,.42-k*.11);x.beginPath();const w2=W*(.2-k*.045),h0=H*(.06+k*.03);
      x.moveTo(ax-w2/2,H*.55);x.lineTo(ax-w2/2,h0+w2*.5);x.quadraticCurveTo(ax-w2/2,h0,ax,h0-w2*.12);x.quadraticCurveTo(ax+w2/2,h0,ax+w2/2,h0+w2*.5);x.lineTo(ax+w2/2,H*.55);x.stroke()}
    x.fillStyle=lg(x,ax-W*.035,0,ax+W*.035,0,[[0,'#0c0a06'],[.5,'#3a2c10'],[1,'#0c0a06']]);x.fillRect(ax-W*.02,H*.1,W*.04,H*.45);
    gl(W*.002,.35);for(let i=0;i<4;i++){x.beginPath();x.moveTo(ax-W*.012+i*W*.008,H*.12);x.lineTo(ax-W*.012+i*W*.008,H*.54);x.stroke()}
  }
  // elmas desen (çok hafif)
  x.save();gl(W*.0012,.05);const d=W*.06;for(let yy=0;yy<H*.6;yy+=d)for(let xx=(yy/d%2)*d/2;xx<W;xx+=d){x.beginPath();x.moveTo(xx,yy-d/2);x.lineTo(xx+d/2,yy);x.lineTo(xx,yy+d/2);x.lineTo(xx-d/2,yy);x.closePath();x.stroke()}x.restore();
  // altın toz bokeh
  x.save();x.globalCompositeOperation='lighter';
  for(let i=0;i<90;i++){const bx=rr(0,W),by=rr(0,H*.62),r=rr(W*.003,W*.022);const col=[[255,200,70],[255,170,40],[255,230,150]][i%3];
    x.fillStyle=rg(x,bx,by,0,bx,by,r,[[0,rgb(col,.32)],[1,rgb(col,0)]]);x.beginPath();x.arc(bx,by,r,0,TAU);x.fill()}
  x.restore();
  x.fillStyle=rg(x,W/2,H*.02,10,W/2,H*.02,W*.7,[[0,'rgba(255,200,80,.18)'],[1,'rgba(255,200,80,0)']]);x.fillRect(0,0,W,H);
  return c;
}

/* =================== DIŞA AÇIK API =================== */
const API={};
API.all=function(){
  seed=7;KS=1.5;
  const S={};
  S[0]=letter('10');S[1]=letter('J');S[2]=letter('Q');S[3]=letter('K');S[4]=letter('A');
  S[5]=ruby();
  seed=11;S[6]=card(paintEagle,{bg:[[0,'#5a6a88'],[.5,'#1a2030'],[1,'#040506']],gem:'#3ac8ff'});
  seed=13;S[7]=card(paintTiger,{bg:[[0,'#8a6a1a'],[.5,'#2e2006'],[1,'#060402']],gem:'#5aff9a'});
  seed=17;S[8]=card(paintLion,{bg:[[0,'#9a3a10'],[.5,'#300c02'],[1,'#060100']],gem:'#ff3a6a',wild:true});
  S[9]=free();S[10]=jackpot();S[11]=wheel();
  KS=1;
  return S;
};
Object.assign(API,{letter,ruby,free,jackpot,wheel,card,coin,background,star4,lg,rg,rrect,goldStroke});

/* =================== METİN / ARAYÜZ ÇİZİMLERİ =================== */
function gtext(x,txt,px,py,size,fill,o={}){
  const font=`${o.italic?'italic ':''}900 ${size}px ${o.serif?'Georgia,"Times New Roman",serif':'"Arial Black","Arial",sans-serif'}`;
  x.save();x.font=font;x.textAlign='center';x.textBaseline='middle';x.lineJoin='round';x.translate(px,py);
  if(o.sx)x.scale(o.sx,1);
  const h=size,ow=o.ow??size*.2,rw=o.rw??size*.1;
  x.save();x.filter=`blur(${size*.06}px)`;x.strokeStyle='rgba(0,0,0,.65)';x.lineWidth=ow+rw+4;x.strokeText(txt,0,size*.09);x.restore();
  x.strokeStyle=o.outline||'#22042e';x.lineWidth=ow+(o.rim?rw:0);x.strokeText(txt,0,0);
  if(o.rim){x.strokeStyle=lg(x,0,-h/2,0,h/2,o.rim);x.lineWidth=rw;x.strokeText(txt,0,0)}
  x.fillStyle=lg(x,0,-h*.45,0,h*.45,fill);x.fillText(txt,0,0);
  x.save();x.beginPath();x.rect(-2000,-h,4000,h*.98);x.clip();x.fillStyle=lg(x,0,-h*.5,0,0,[[0,'rgba(255,255,255,.6)'],[1,'rgba(255,255,255,0)']]);x.fillText(txt,0,0);x.restore();
  x.restore();
}
const GOLD=[[0,'#fffbe0'],[.35,'#ffd84a'],[.62,'#e08a00'],[.82,'#ffd56a'],[1,'#b86400']];
const PINKRIM=[[0,'#ffd0fa'],[.5,'#e050f0'],[1,'#7a0aa0']];
function logo(c,text){
  const x=c.getContext('2d'),W=c.width,H=c.height;x.clearRect(0,0,W,H);
  // plaka
  const p=new Path2D();p.moveTo(W*.08,0);p.lineTo(W*.92,0);p.lineTo(W*.86,H*.78);p.quadraticCurveTo(W*.5,H*1.02,W*.14,H*.78);p.closePath();
  x.fillStyle=lg(x,0,0,0,H,[[0,'#1e1e1e'],[1,'#050505']]);x.fill(p);
  x.strokeStyle=lg(x,0,0,0,H,[[0,'#fff2b0'],[.5,'#d4a017'],[1,'#7a5500']]);x.lineWidth=5;x.stroke(p);
  x.save();x.clip(p);x.fillStyle=lg(x,0,0,0,H*.5,[[0,'rgba(255,255,255,.14)'],[1,'rgba(255,255,255,0)']]);x.fillRect(0,0,W,H*.5);x.restore();
  let size=Math.min(H*.5,W*1.55/Math.max(6,text.length));
  gtext(x,text,W/2,H*.43,size,GOLD,{italic:true,rim:[[0,'#fff8d8'],[.5,'#8a5a00'],[1,'#ffe9a0']],outline:'#000',ow:size*.2,rw:size*.1});
  // taç
  const cx=W/2,cy=H*.13,k=H*.085;
  x.beginPath();x.moveTo(cx-k,cy+k*.6);x.lineTo(cx-k*1.15,cy-k*.5);x.lineTo(cx-k*.5,cy);x.lineTo(cx,cy-k*.8);x.lineTo(cx+k*.5,cy);x.lineTo(cx+k*1.15,cy-k*.5);x.lineTo(cx+k,cy+k*.6);x.closePath();
  x.fillStyle=lg(x,0,cy-k,0,cy+k,GOLD);x.fill();x.strokeStyle='#4a1a00';x.lineWidth=2.5;x.stroke();
  [[cx-k*1.15,cy-k*.5],[cx,cy-k*.8],[cx+k*1.15,cy-k*.5]].forEach(([a,b])=>{x.beginPath();x.arc(a,b,k*.18,0,TAU);x.fillStyle='#ff3a8a';x.fill()});
}
function jpTitle(c){const x=c.getContext('2d');x.clearRect(0,0,c.width,c.height);gtext(x,'Jackpot',c.width/2,c.height*.52,c.height*.68,GOLD,{italic:true,serif:true,outline:'#3a1000',rim:[[0,'#fff'],[1,'#ffb0f0']],ow:c.height*.12,rw:c.height*.05})}
function spinText(c,txt,stop){const x=c.getContext('2d');x.clearRect(0,0,c.width,c.height);
  if(stop){gtext(x,txt,c.width/2,c.height*.52,c.height*.62,GOLD,{outline:'#000',ow:c.height*.16,sx:.95});return}
  x.save();x.font=`900 ${c.height*.62}px "Arial Black","Arial",sans-serif`;x.textAlign='center';x.textBaseline='middle';x.translate(c.width/2,c.height*.52);x.scale(.95,1);
  x.fillStyle='rgba(255,250,220,.75)';x.fillText(txt,0,3);x.fillStyle=lg(x,0,-c.height*.3,0,c.height*.3,[[0,'#3a2a00'],[.5,'#140c00'],[1,'#000']]);x.fillText(txt,0,0);x.restore()}
function ribbon(c,txt){const x=c.getContext('2d'),W=c.width,H=c.height;x.clearRect(0,0,W,H);
  const p=new Path2D();p.moveTo(0,H*.2);p.lineTo(W*.1,H*.5);p.lineTo(0,H*.8);p.lineTo(W*.16,H*.8);p.lineTo(W*.16,H);p.lineTo(W*.84,H);p.lineTo(W*.84,H*.8);p.lineTo(W,H*.8);p.lineTo(W*.9,H*.5);p.lineTo(W,H*.2);p.lineTo(W*.84,H*.2);p.lineTo(W*.84,0);p.lineTo(W*.16,0);p.lineTo(W*.16,H*.2);p.closePath();
  x.fillStyle=lg(x,0,0,0,H,[[0,'#fff3a0'],[.45,'#ffc21a'],[1,'#a05a00']]);x.fill(p);x.strokeStyle='#5a2800';x.lineWidth=3;x.stroke(p);
  gtext(x,txt,W/2,H*.52,H*.62,[[0,'#2a2a2a'],[1,'#000']],{outline:'#fff3c0',ow:H*.1})}
function bigTitle(c,txt){const x=c.getContext('2d');x.clearRect(0,0,c.width,c.height);
  const size=c.height*.5;
  gtext(x,txt,c.width/2,c.height*.5,size,GOLD,{italic:true,rim:[[0,'#fff'],[.5,'#8a5a00'],[1,'#ffe9a0']],outline:'#000',ow:size*.2,rw:size*.1,sx:.92});
  star4(x,c.width*.12,c.height*.22,c.height*.08);star4(x,c.width*.88,c.height*.72,c.height*.06)}
function freeIntro(c,n,retrig){const x=c.getContext('2d'),W=c.width,H=c.height;x.clearRect(0,0,W,H);
  const f=free(208,260);x.drawImage(f,W/2-W*.42,-H*.04,W*.84,W*.84*260/208);
  gtext(x,(retrig?'+':'×')+n,W/2,H*.84,H*.2,GOLD,{rim:[[0,'#fff'],[1,'#ff6a3a']],outline:'#3a0000',ow:H*.045,rw:H*.025})}
function freeEnd(c){const x=c.getContext('2d'),W=c.width,H=c.height;x.clearRect(0,0,W,H);
  gtext(x,'FREE',W/2,H*.5,H*.62,GOLD,{rim:[[0,'#ff9a7a'],[1,'#a00a0a']],outline:'#2a0000',ow:H*.12,rw:H*.07});star4(x,W*.18,H*.2,H*.1)}
function jpOverlay(c,tierLabel,col){const x=c.getContext('2d'),W=c.width,H=c.height;x.clearRect(0,0,W,H);
  const j=jackpot(208,260);x.drawImage(j,W/2-130,-10,260,325);
  gtext(x,tierLabel,W/2,H*.86,H*.17,col,{italic:true,outline:'#1a0430',ow:H*.04,rim:GOLD,rw:H*.02})}
function rail(c){const x=c.getContext('2d'),W=c.width,H=c.height;x.clearRect(0,0,W,H);
  x.fillStyle=lg(x,0,H*.3,0,H*.8,[[0,'#fff2b0'],[.5,'#b8860b'],[1,'#3a2a00']]);x.fillRect(W*.06,H*.32,W*.88,H*.42);
  x.save();x.beginPath();x.rect(W*.06,H*.32,W*.88,H*.42);x.clip();
  for(let i=0;i<70;i++){const px=W*.06+i*W*.0135;x.fillStyle=i%2?'#1a1a1a':'#000';x.beginPath();x.moveTo(px,H*.53);x.lineTo(px+W*.0067,H*.36);x.lineTo(px+W*.0135,H*.53);x.lineTo(px+W*.0067,H*.7);x.closePath();x.globalAlpha=.55;x.fill();x.globalAlpha=1}
  x.restore();
  for(const px of[W*.035,W*.965]){x.fillStyle=lg(x,px-24,0,px+24,0,[[0,'#6a4a00'],[.5,'#fff0a0'],[1,'#6a4a00']]);x.beginPath();x.moveTo(px-22,H);x.lineTo(px-16,H*.25);x.lineTo(px,0);x.lineTo(px+16,H*.25);x.lineTo(px+22,H);x.closePath();x.fill();x.strokeStyle='#000';x.lineWidth=2;x.stroke()}}
function header(c,S){const x=c.getContext('2d'),W=c.width,H=c.height;x.clearRect(0,0,W,H);
  x.fillStyle=lg(x,0,0,W,0,[[0,'#0a0a0a'],[.5,'#2a2210'],[1,'#0a0a0a']]);x.fillRect(0,0,W,H);
  x.globalAlpha=.55;[[S[6],-10],[S[7],W-190],[S[8],W-110],[S[10],80]].forEach(([im,px])=>x.drawImage(im,px,-6,140,180));x.globalAlpha=1;
  x.fillStyle=lg(x,0,0,0,H,[[0,'rgba(0,0,0,.25)'],[1,'rgba(0,0,0,.7)']]);x.fillRect(0,0,W,H);x.fillStyle=lg(x,0,H-6,0,H,[[0,'#fff0a0'],[1,'#8a6200']]);x.fillRect(0,H-6,W,6)}
function crazySym(k,S=220){const c=cv(S,S),x=c.getContext('2d'),cx=S/2,cy=S/2;
  if(k==='blank'){x.fillStyle=rg(x,cx,cy,4,cx,cy,S*.42,[[0,'#3a3a70'],[1,'#141432']]);x.beginPath();x.arc(cx,cy,S*.36,0,TAU);x.fill();x.strokeStyle='#6a6aa8';x.lineWidth=4;x.stroke();gtext(x,'—',cx,cy,S*.3,[[0,'#ccd'],[1,'#889']],{outline:'#112'});return c}
  if(k==='+1'){x.save();x.translate(cx,cy);for(let i=0;i<4;i++){x.rotate(TAU/4);x.beginPath();x.ellipse(0,-S*.18,S*.15,S*.2,0,0,TAU);x.fillStyle=lg(x,0,-S*.38,0,0,[[0,'#9aff7a'],[1,'#0a8a2a']]);x.fill();x.strokeStyle='#043a10';x.lineWidth=3;x.stroke()}x.restore();
    gtext(x,'+1',cx,cy+2,S*.3,[[0,'#fff'],[1,'#fff3a0']],{outline:'#043a10',ow:S*.07});return c}
  const gs=Math.round(S*.86),g=coin(gs);x.drawImage(g,(S-gs)/2,(S-gs)/2,gs,gs);
  gtext(x,k,cx,cy+3,S*.3,[[0,'#fff'],[.5,'#ffe08a'],[1,'#ff8a00']],{outline:'#5a1a00',ow:S*.07});return c}
Object.assign(API,{gtext,logo,jpTitle,spinText,ribbon,bigTitle,freeIntro,freeEnd,jpOverlay,rail,header,crazySym,GOLD});

return API;
})();
'use strict';
/* =====================================================================
   SABİTLER — videodan çıkarılan ve doğrulanan oyun matematiği
   ===================================================================== */
const COLS=5,ROWS=3,CW=104,CH=128,NL=50,RX=10,RY=371;
const S10=0,SJ=1,SQ=2,SK=3,SA=4,SR=5,SE=6,ST=7,SW=8,SF=9,SP=10,SH=11;
const SNAME=['10','J','Q','K','A','Yakut','Kartal','Kaplan','WILD','FREE','JACKPOT','Çark'];
// [3'lü, 4'lü, 5'li] — çizgi bahsi çarpanı
const PAY=[[4,10,25],[6,20,60],[8,30,100],[10,40,150],[15,50,250],[20,100,500],[25,200,600],[30,300,1000],[50,500,2000]];
// 50 ödeme çizgisi (0=üst,1=orta,2=alt) — kurallar ekranından çözüldü, gerçek spinlerle doğrulandı
const LINES=('11111 00000 22222 01210 21012 10001 12221 00122 22100 12101 10121 01110 21112 01010 21212 '+
 '11011 11211 00200 22022 02220 20002 12021 10201 02020 20202 20120 02102 02120 20102 21001 '+
 '01221 00222 22000 10212 12010 01012 21210 12200 00112 22110 20000 02222 22220 00002 10101 '+
 '12121 01222 21000 01111 21111').split(' ').map(s=>[...s].map(Number));
const BETS=[4,10,20,50,100,500,1000,5000,8000,10000];
const TIERS=['colossal','mega','big','mini'];
const TLABEL={colossal:'COLOSSAL',mega:'MEGA',big:'BIG',mini:'MINI'};
const TGRAD={colossal:[[0,'#fffbe0'],[.45,'#ffc21a'],[1,'#c06000']],mega:[[0,'#e8fbff'],[.45,'#3ab8ff'],[1,'#1a3ad0']],big:[[0,'#ffe6d0'],[.45,'#ff5a2a'],[1,'#b0100a']],mini:[[0,'#eeffd8'],[.45,'#3ae04a'],[1,'#0a8a2a']]};
const TCSS={colossal:'linear-gradient(#fffbe0,#ffc21a 50%,#c06000)',mega:'linear-gradient(#e8fbff,#3ab8ff 50%,#1a3ad0)',big:'linear-gradient(#ffe6d0,#ff5a2a 50%,#b0100a)',mini:'linear-gradient(#eeffd8,#3ae04a 50%,#0a8a2a)'};
const LCOL=['#ffffff','#7dff5a','#4ad8ff','#ff4a5a','#ffe14a','#ff9a2a','#c07aff','#ff7ad8','#4affc0','#9ab0ff'];
// videodaki 300 hücreden ölçülen sıklıklarla oluşturulan makara şeritleri (sembol adetleri)
const DEF_STRIPS=[[9,12,9,8,3,7,4,1,2,1,4,1],[11,7,6,8,7,5,4,1,4,1,5,1],[10,6,7,10,6,5,4,1,3,2,6,1],[8,6,10,10,7,4,3,1,5,1,5,1],[10,7,7,6,5,5,5,1,4,3,7,1]];
// kontrolsüz (saf rastgele) mod için optimize edilmiş şeritler: doğal RTP ≈ %95.3, isabet ≈ %44, free ≈ 1/146, doğal 5'li jackpot ≈ 1/200.000
const BAL_STRIPS=[[6,11,9,8,5,8,2,2,3,2,4,1],[9,6,6,7,7,6,4,2,5,1,5,2],[7,4,6,12,6,6,4,1,4,2,6,3],[8,5,10,11,7,5,3,2,6,1,2,1],[11,9,8,6,5,6,4,1,5,4,1,1]];
const BOTN=['Rüzgar','YağIz Bey','BOTAN','ZoR BeY','ÇAKIR','HANZADE','DUDAA','EMİN','SEKO','Sebepsiz','MELEK','AZAD','ALE','REİS','VaRe','ÖMER','KAAN','DENİZ','ECE','CİGER','KaYa','SULTAN','Paşa','LEYLA','Asi','ŞAHİN','Mavi','Efe','Neşe','Bora','Yıldız','Hilal','Tuna','Aslı','KRAL','Sessiz','Duman','Gece','Elif','Arda'];
const CRZ_SYMS=['x2','x3','x5','x10','x20','x50','+1','blank'];
const CRZ_MULT={x2:2,x3:3,x5:5,x10:10,x20:20,x50:50};

/* =====================================================================
   DURUM
   ===================================================================== */
const clone=o=>JSON.parse(JSON.stringify(o));
const DEF_ADMIN={pass:'admin123',title:'WILD KING',playerName:'Sen',
  mode:'auto',rtp:92,hit:30,maxWinX:500,bigX:10,megaX:30,superX:60,
  force:'',forceTier:'',freeChance:0.4,freeTbl:{3:3,4:6,5:10},freeMult:1,
  jpChance:0.01,jpMinR:40,jpMaxR:100,strips:BAL_STRIPS,anticip:true,turboOn:true,gambleOn:true,gambleMax:5,gambleWin:50,ldwQuiet:true,autoNeedLimit:false,
  collectNeed:20,crzW:[24,18,12,7,3,1,10,25],crzLives:3,
  botTicker:false,tickerSec:3,broadcastMin:20000,botJpPerHour:0,
  spinSpeed:1};
const DEF_JP={total:38370031,shares:{colossal:70,mega:15,big:10,mini:5},mins:{colossal:500000,mega:250000,big:50000,mini:5000},
  growth:8690,contrib:1,floor:12000000,winners:{colossal:[],mega:[],big:[],mini:[]}};
const DEF={v:3,bal:8052,betIdx:0,prog:0,tickets:0,ticketBets:[],hist:[],free:{left:0,total:0,bet:0},sound:true,music:true,turbo:false,autoCfg:{n:50,loss:0,single:0,stopFree:true},
  stops:[0,0,0,0,0],cur:null,
  stats:{wag:0,paid:0,jpPaid:0,crzPaid:0,spins:0,wins:0,frees:0,jps:0,crz:0,maxWin:0,rtpHist:[]},
  log:[],jp:DEF_JP,admin:DEF_ADMIN};
let S;
// Yalnızca ses/müzik/turbo/otomatik tercihleri bu cihazda tutulur; bakiye ve oyun durumu SUNUCUDAN gelir.
try{S=JSON.parse(localStorage.getItem('wkp'))}catch(e){}
S=Object.assign(clone(DEF),S&&typeof S==='object'?{sound:S.sound,music:S.music,turbo:S.turbo,autoCfg:S.autoCfg,betIdx:S.betIdx|0}:{});
S.v=3;S.admin=clone(DEF_ADMIN);S.stats=clone(DEF.stats);S.jp=clone(DEF_JP);S.free={left:0,total:0,bet:0};S.bal=0;
for(const k of['music','turbo','autoCfg'])if(S[k]===undefined)S[k]=clone(DEF[k]);
const SES={t0:Date.now(),wag:0,won:0,spins:0};
let saveT=0;const save=()=>{clearTimeout(saveT);saveT=setTimeout(()=>{try{localStorage.setItem('wkp',JSON.stringify({sound:S.sound,music:S.music,turbo:S.turbo,autoCfg:S.autoCfg,betIdx:S.betIdx}))}catch(e){}},150)};
// ---- Sunucu bağlantısı (oyun bileti adresten gelir)
const TOKEN=new URLSearchParams(location.search).get('token')||'';
async function api(path,body){
  try{
    const r=await fetch('/api/wildking'+path,{method:body===undefined?'GET':'POST',headers:{'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
    const j=await r.json().catch(()=>({}));
    if(!r.ok)return {ok:false,status:r.status,msg:j.message||'Hata'};
    return Object.assign({ok:true},j);
  }catch(e){return {ok:false,msg:'Bağlantı yok'}}
}
let paySet=false;
function applyServer(j){
  S.bal=j.balance;S.free=j.free;S.prog=j.prog;S.tickets=j.tickets;S.ticketBets=j.ticketBets||[];
  const c=j.config||{};
  if(c.payFactor!=null&&!paySet){paySet=true;for(const row of PAY)for(let i=0;i<row.length;i++)row[i]=row[i]*c.payFactor}
  S.rtp=c.rtp
  if(c.strips){S.admin.strips=c.strips;buildStrips(c.strips)}
  S.fair=c.mode==='pure';
  if(c.gambleMax)S.admin.gambleMax=c.gambleMax;
  S.admin.gambleOn=c.gambleOn!==false;
  if(c.maxBetIdx!=null&&S.betIdx>c.maxBetIdx)S.betIdx=c.maxBetIdx;
  applyPool(j);applyFeed(j.feed);setBal(S.bal);hud();
}

/* =====================================================================
   MOTOR
   ===================================================================== */
const R_=n=>Math.floor(Math.random()*n);
let STRIPS=[];
function buildStrips(counts){
  STRIPS=counts.map((cn,c)=>{
    let a=[];cn.forEach((n,s)=>{for(let i=0;i<n;i++)a.push(s)});if(!a.length)a=[S10];
    let seed=1234+c*977;const r=()=>(seed=seed*16807%2147483647)/2147483647;
    for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]]}
    // aynı makarada iki FREE / iki Çark pencereye (3 hücre) düşmesin
    for(let pass=0;pass<6;pass++)for(let i=0;i<a.length;i++){
      if(a[i]!==SF&&a[i]!==SH)continue;
      for(const d of[1,2]){const j=(i+d)%a.length;if(a[j]===a[i]){for(let t=0;t<a.length;t++){const k=(j+5+t)%a.length,ok=[-2,-1,0,1,2].every(o=>a[(k+o+a.length)%a.length]!==a[i]);if(ok&&a[k]!==SF&&a[k]!==SH&&a[k]!==SP){[a[j],a[k]]=[a[k],a[j]];break}}}}
    }
    return a;
  });
}
const gridFrom=stops=>STRIPS.map((st,c)=>[0,1,2].map(k=>st[(stops[c]+k)%st.length]));
/* =====================================================================
   YARDIMCILAR
   ===================================================================== */
const $=id=>document.getElementById(id);
const fmt=n=>Math.round(n).toLocaleString('en-US');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const rnd=(a,b)=>a+Math.random()*(b-a);
const pick=a=>a[R_(a.length)];
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function toast(t,ms=1800){const e=$('toast');e.textContent=t;e.style.display='block';clearTimeout(toast.h);toast.h=setTimeout(()=>e.style.display='none',ms)}
let SKIP=false;
const waitTap=(ms,el)=>new Promise(res=>{let d=false;const f=()=>{if(d)return;d=true;el.removeEventListener('pointerdown',f);res()};el.addEventListener('pointerdown',f);setTimeout(f,ms)});

/* ---- ses ---- */
let AC=null,musicT=null;
function ac(){if(!AC){try{AC=new(window.AudioContext||window.webkitAudioContext)()}catch(e){}}if(AC&&AC.state==='suspended')AC.resume();return AC}
function tone(f,d=.1,type='sine',v=.05,when=0,slide=0){
  if(!S.sound)return;const a=ac();if(!a)return;
  const t=a.currentTime+when,o=a.createOscillator(),g=a.createGain();o.type=type;o.frequency.setValueAtTime(f,t);
  if(slide)o.frequency.exponentialRampToValueAtTime(slide,t+d);g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);
  o.connect(g);g.connect(a.destination);o.start(t);o.stop(t+d+.03);
}
function noise(d=.08,v=.05,f=1800){if(!S.sound)return;const a=ac();if(!a)return;const b=a.createBuffer(1,a.sampleRate*d,a.sampleRate),ch=b.getChannelData(0);for(let i=0;i<ch.length;i++)ch[i]=(Math.random()*2-1)*(1-i/ch.length);
  const s=a.createBufferSource(),fl=a.createBiquadFilter(),g=a.createGain();fl.type='bandpass';fl.frequency.value=f;g.gain.value=v;s.buffer=b;s.connect(fl);fl.connect(g);g.connect(a.destination);s.start()}
/* arka plan müziği: akor + bas + arpej (sentez) */
const MUS={on:false,t:0,step:0,timer:null,g:null};
const CHORDS=[[57,60,64],[53,57,60],[48,52,55],[55,59,62]];const mf=n=>440*Math.pow(2,(n-69)/12);
function musNote(f,t,d,type,v){const a=AC,o=a.createOscillator(),g=a.createGain();o.type=type;o.frequency.value=f;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.02);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(g);g.connect(MUS.g);o.start(t);o.stop(t+d+.05)}
function musTick(){if(!AC||!MUS.on)return;const spb=60/96/2;while(MUS.t<AC.currentTime+.4){const st=MUS.step,ch=CHORDS[Math.floor(st/16)%4],t=MUS.t;
  if(st%16===0)ch.forEach(n=>musNote(mf(n),t,spb*15,'sine',.018));
  if(st%4===0)musNote(mf(ch[0]-24),t,spb*3.5,'triangle',.05);
  if(st%2===0)musNote(mf(ch[(st/2)%3]+12+(st%8===6?12:0)),t,spb*1.6,'triangle',.012);
  if(st%8===4)musNote(2400,t,.04,'square',.004);
  MUS.t+=spb;MUS.step++}}
function musicSet(on){if(!ac())return;if(on&&!MUS.on){MUS.g=MUS.g||AC.createGain();MUS.g.gain.value=1;MUS.g.connect(AC.destination);MUS.on=true;MUS.t=AC.currentTime+.1;MUS.timer=setInterval(musTick,120)}else if(!on&&MUS.on){MUS.on=false;clearInterval(MUS.timer);try{MUS.g.disconnect()}catch(e){}MUS.g=null}}
const SFX={
  click(){tone(700,.05,'sine',.05)},
  spin(){noise(.25,.05,900);tone(240,.2,'sawtooth',.02,0,480)},
  stop(sc){tone(sc?620:120,sc?.3:.1,sc?'triangle':'square',sc?.06:.035);noise(.05,.05,600)},
  coin(){tone(1800+Math.random()*400,.06,'triangle',.03);tone(2600,.05,'sine',.02,.03)},
  win(n){const b=[523,659,784,1047,1319];for(let i=0;i<Math.min(5,2+n);i++)tone(b[i],.16,'triangle',.06,i*.08)},
  big(){[523,659,784,1047,784,1047,1319,1568].forEach((f,i)=>tone(f,.24,'triangle',.07,i*.12));[262,330,392].forEach((f,i)=>tone(f,1.2,'sine',.04,i*.02))},
  tick(){tone(1200,.025,'square',.015)},
  collect(){tone(880,.1,'triangle',.05);tone(1320,.15,'triangle',.05,.08)},
  free(){[392,523,659,784,1047].forEach((f,i)=>tone(f,.3,'triangle',.07,i*.1))},
  jp(){for(let r=0;r<3;r++)[523,659,784,1047,1319].forEach((f,i)=>tone(f,.25,'square',.04,r*.6+i*.1))}
};

/* =====================================================================
   GÖRSELLER
   ===================================================================== */
let SPR={},URL_={},COIN_URL='',CRZ_URL={};
const ART_VER='wk-v4';
function makeArt(){
  let cache=null;try{cache=JSON.parse(localStorage.getItem('wk3_art'))}catch(e){}
  if(cache&&cache.v===ART_VER&&cache.s&&cache.s[11]){for(const k in cache.s)URL_[k]=cache.s[k]}
  else{SPR=ART.all();for(const k in SPR)URL_[k]=SPR[k].toDataURL('image/webp',.93);try{localStorage.setItem('wk3_art',JSON.stringify({v:ART_VER,s:URL_}))}catch(e){}}
  COIN_URL=ART.coin(96).toDataURL();
  const bg=$('bg').getContext('2d');bg.drawImage(ART.background(1080,2040),0,0);
  ART.logo($('logo'),S.admin.title);ART.logo($('ldLogo'),S.admin.title);
  ART.jpTitle($('jpTitle'));ART.rail($('rail'));
  const HI={};let hl=0;[6,7,8,10].forEach(k=>{const im=new Image();im.onload=()=>{if(++hl===4)['hdC1','hdC2','hdC3','hdC4','hdC5'].forEach(id=>ART.header($(id),HI))};im.src=URL_[k];HI[k]=im});
  CRZ_SYMS.forEach(k=>CRZ_URL[k]=ART.crazySym(k).toDataURL());
  $('coinImg').src=COIN_URL;$('progImg').src=ART.wheel(208,260,false).toDataURL();$('crazyImg').src=URL_[SH];
  $('nImg').src=URL_[SP];
}
const isCard=s=>s===SE||s===ST||s===SW;
const cellHTML=(s,c,r)=>`<div class="cell${isCard(s)?' cd':''}"${c!==undefined?` data-p="${c},${r}"`:''}><img src="${URL_[s]}" alt=""></div>`;

/* =====================================================================
   ODOMETRE (yuvarlanan rakamlar)
   ===================================================================== */
class Odo{
  constructor(el){this.el=el;this.cols=[];this.str=''}
  build(str){this.el.innerHTML='';this.cols=[];
    for(const ch of str){if(ch===','){const s=document.createElement('div');s.className='sep';s.textContent=',';this.el.appendChild(s);continue}
      const d=document.createElement('div');d.className='dg';const col=document.createElement('div');col.className='col';
      col.innerHTML='01234567890'.split('').map(n=>`<div>${n}</div>`).join('');d.appendChild(col);this.el.appendChild(d);this.cols.push(col)}
    this.str=str}
  show(v,target){const fs=fmt(target);if(fs!==this.str)this.build(fs);
    const n=this.cols.length;
    for(let i=0;i<n;i++){const k=n-1-i,p=Math.pow(10,k),q=Math.floor(v/p),low=v-q*p;
      let pos=(q%10)+(k===0?low:Math.max(0,low-(p-1)));if(k===0)pos=v%10;
      this.cols[i].style.transform=`translateY(${-pos*1.15}em)`}}
  run(to,ms){return new Promise(res=>{const t0=performance.now();let lt=0;
    const f=n=>{const p=SKIP?1:Math.min(1,(n-t0)/ms),e=1-Math.pow(1-p,2.2),v=to*e;this.show(p>=1?to:v,to);
      if(n-lt>65&&p<1){SFX.tick();lt=n}p<1?requestAnimationFrame(f):res()};requestAnimationFrame(f)})}
}

/* =====================================================================
   SAHNE / ÖLÇEK
   ===================================================================== */
const stage=$('stage');let SC=1,STH=1000;
function fit(){SC=Math.min(innerWidth/540,innerHeight/960);STH=Math.ceil(Math.max(1000,innerHeight/SC));
  stage.style.transform=`translateX(-50%) scale(${SC})`;stage.style.height=STH+'px';stage.style.top='0px';
  const f=$('fx');if(f){f.width=1080;f.height=STH*2;f.style.height=STH+'px'}}
addEventListener('resize',fit);

/* =====================================================================
   MAKARALAR
   ===================================================================== */
const reelsEl=$('reels'),linesEl=$('lines');
let cur=null,anims=[],quick=false;
function buildReels(){
  reelsEl.innerHTML='';
  for(let c=0;c<COLS;c++){const r=document.createElement('div');r.className='reel';r.style.left=(c*CW)+'px';
    r.innerHTML=`<div class="strip">${cur[c].map((s,k)=>cellHTML(s,c,k)).join('')}</div>`;reelsEl.appendChild(r)}
  const fr=$('rframe');fr.querySelectorAll('.rivet').forEach(e=>e.remove());
  for(const y of[136,264])for(const x of[-4,523]){const d=document.createElement('div');d.className='rivet';d.style.left=x+'px';d.style.top=(y-7)+'px';fr.appendChild(d)}
}
function spinReels(o){
  const g=o.g,stops=o.stops;let sc=0,antN=0;const ant=[];
  for(let c=0;c<COLS;c++){ant[c]=S.admin.anticip&&!turboOn()&&sc>=2?++antN:0;if(g[c].includes(SF))sc++}
  const sp=(S.admin.spinSpeed||1)*(turboOn()?2.3:1);
  return Promise.all([0,1,2,3,4].map(c=>new Promise(res=>{
    const reel=reelsEl.children[c],strip=reel.firstChild,st=STRIPS[c],len=st.length;
    const q=S.stops[c]%len,p=stops[c];
    const minN=(quick?4:Math.round((14+c*5)/sp))+ant[c]*14;
    let n=((q-p+len)%len)+3;while(n<minN)n+=len;
    const seq=[];for(let i=0;i<n;i++)seq.push(st[(p+i)%len]);
    for(let k=0;k<3;k++){seq[k]=g[c][k];seq[n-3+k]=cur[c][k]}
    strip.innerHTML=seq.map(s=>cellHTML(s)).join('');
    const dist=(n-3)*CH,dur=quick?260:(560+c*170)/sp+ant[c]*1200;
    strip.style.transform=`translateY(${-dist}px)`;
    const a=strip.animate([{transform:`translateY(${-dist}px)`,offset:0,easing:'ease-out'},{transform:`translateY(${-dist-16}px)`,offset:.05,easing:'cubic-bezier(.45,.05,.7,1)'},{transform:'translateY(14px)',offset:.93,easing:'ease-out'},{transform:'translateY(0px)',offset:1}],{duration:dur,fill:'forwards'});
    let at=null;if(ant[c]&&!quick){at=setTimeout(()=>{reel.classList.add('ant');tone(300,1,'sawtooth',.02,0,900)},Math.max(0,dur-1200))}
    anims.push(a);
    a.onfinish=()=>{clearTimeout(at);strip.innerHTML=g[c].map((s,k)=>cellHTML(s,c,k)).join('');strip.style.transform='';a.cancel();reel.classList.remove('ant');SFX.stop(g[c].includes(SF));res()};
  })));
}
const cellEl=p=>reelsEl.querySelector(`[data-p="${p}"]`);
function clearFx(){reelsEl.querySelectorAll('.cell').forEach(e=>e.classList.remove('win','dim','scat'));linesEl.innerHTML=''}
function drawLines(list){
  linesEl.innerHTML=list.map(l=>{const ln=LINES[l.li],col=LCOL[l.li%LCOL.length];
    const pts=[[-6,ln[0]],...ln.map((r,c)=>[c*CW+CW/2,r]),[526,ln[4]]].map(([x,r])=>x+','+(r*CH+CH/2)).join(' ');
    return `<polyline class="glow" stroke="${col}" points="${pts}"/><polyline stroke="${col}" points="${pts}"/>`}).join('');
}
function light(set){reelsEl.querySelectorAll('.cell').forEach(e=>{if(!e.dataset.p)return;if(set.has(e.dataset.p))e.classList.add('win');else e.classList.add('dim')})}
let cycT=null;
function stopCycle(){clearInterval(cycT);cycT=null}
function startCycle(R){stopCycle();if(!R||R.lines.length<1)return;let i=0;
  cycT=setInterval(()=>{const l=R.lines[i%R.lines.length];i++;clearFx();drawLines([l]);const ln=LINES[l.li];light(new Set(Array.from({length:l.n},(_,c)=>c+','+ln[c])))},1300)}

/* =====================================================================
   HUD / JACKPOT / TICKER / BİLDİRİM
   ===================================================================== */
let dispBal=0,balTw=null;
function setBal(v,anim){
  cancelAnimationFrame(balTw);
  if(!anim){dispBal=v;$('balv').textContent=fmt(v);return}
  const from=dispBal,t0=performance.now(),ms=anim;
  const f=n=>{const p=Math.min(1,(n-t0)/ms);dispBal=from+(v-from)*p;$('balv').textContent=fmt(dispBal);if(p<1)balTw=requestAnimationFrame(f)};balTw=requestAnimationFrame(f);
}
function curLB(){return S.free.left>0||freeMode?S.free.bet:BETS[S.betIdx]}
function hud(){
  const lb=curLB();$('betn').textContent=fmt(BETS[S.betIdx]);$('tbv').textContent=fmt(lb*NL);
  $('bMinus').classList.toggle('dis',S.betIdx===0);$('bPlus').classList.toggle('dis',S.betIdx===BETS.length-1);
  const need=S.admin.collectNeed;$('progf').style.width=Math.min(100,S.prog/need*100)+'%';$('progt').textContent=S.prog+'/'+need;
  $('crazyN').textContent='x'+S.tickets;$('crazy').classList.toggle('has',S.tickets>0);
  $('turbo').classList.toggle('on',!!S.turbo);$('turbo').classList.toggle('hide',!S.admin.turboOn);sessUI();
  $('rframe').classList.toggle('free',S.free.left>0||freeMode);
  const fb=$('fbanner');if(S.free.left>0||freeMode){fb.style.display='block';ART.ribbon($('fbc'),'FREE '+S.free.left)}else fb.style.display='none';
}
function jpShare(k){return S.jp.total*S.jp.shares[k]/100}
function pools(){$('vTot').textContent=fmt(S.jp.total);$('vCol').textContent=fmt(jpShare('colossal'));$('vMega').textContent=fmt(jpShare('mega'));$('vBig').textContent=fmt(jpShare('big'));$('vMini').textContent=fmt(jpShare('mini'))}
function applyPool(j){if(!j)return;if(j.jackpot){S.jp.total=j.jackpot.total}if(j.winners)S.jp.winners=j.winners;pools()}
const AVC=['#e0457b','#3a8ae8','#1aa86a','#e8a21a','#9a4ae8','#e85a2a','#2ab8c8','#c83ab0'];
const avatar=n=>({c:AVC[[...n].reduce((a,ch)=>a+ch.charCodeAt(0),0)%AVC.length],i:[...n.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g,'')][0]||'★'});
const MEGA='<svg class="mg" viewBox="0 0 24 24" fill="#d4a017"><path d="M3 10v4h3l6 4V6L6 10H3z"/><path d="M15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="#d4a017" stroke-width="2" stroke-linecap="round"/></svg>';
function tickPush(name,syms,amt){
  const av=avatar(name),d=document.createElement('div');d.className='te';
  d.innerHTML=`<div class="l1">${MEGA}<span class="av" style="background:${av.c}">${esc(av.i)}</span><b>${esc(name)}</b> şanslı çekilişten ${syms.map(s=>`<img src="${URL_[s]}" alt="">`).join('')} havuzdan</div><div class="l2"><em>${fmt(amt)}</em> kazandı.</div>`;
  const tin=$('tickIn');tin.appendChild(d);
  if(tin.children.length>3){tin.animate([{transform:'translateY(0)'},{transform:'translateY(-51px)'}],{duration:450,easing:'ease-in-out'}).onfinish=()=>{tin.removeChild(tin.firstChild)}}
}
let feedLast=0;
function applyFeed(list){if(!list)return;const fresh=list.filter(x=>x.id>feedLast);if(!feedLast){feedLast=list.length?list[list.length-1].id:0;fresh.slice(-3).forEach(x=>tickPush(x.name,[x.sym],x.amt));return}
  fresh.forEach(x=>tickPush(x.name,[x.sym],x.amt));if(list.length)feedLast=Math.max(feedLast,list[list.length-1].id)}
let notifQ=[],notifOn=false;
async function notify(name,tier,amt){
  notifQ.push({name,tier,amt});if(notifOn)return;notifOn=true;
  while(notifQ.length){const o=notifQ.shift(),av=avatar(o.name);
    $('nAv').style.background=av.c;$('nAv').textContent=av.i;$('nName').textContent=o.name;$('nTxt').textContent=o.tier+' havuzdan kazandı';$('nVal').textContent=fmt(o.amt);
    $('notif').classList.add('show');await sleep(4200);$('notif').classList.remove('show');await sleep(700)}
  notifOn=false;
}
/* =====================================================================
   EFEKTLER (coin uçuşu, parçacıklar)
   ===================================================================== */
const fxC=$('fx'),fxX=fxC.getContext('2d');let parts=[],fxOn=false;const coinImg=new Image();
function burst(n=60,y=460){for(let i=0;i<n;i++)parts.push({x:rnd(60,480),y:y+rnd(-40,40),vx:rnd(-5,5),vy:rnd(-17,-6),r:rnd(9,17),a:rnd(0,6),va:rnd(.1,.3),l:rnd(70,120)});if(!fxOn){fxOn=true;requestAnimationFrame(fxLoop)}}
function fxLoop(){fxX.setTransform(2,0,0,2,0,0);fxX.clearRect(0,0,540,STH);
  parts=parts.filter(p=>p.l>0&&p.y<STH+40);
  for(const p of parts){p.x+=p.vx;p.y+=p.vy;p.vy+=.5;p.a+=p.va;p.l--;const w=Math.abs(Math.cos(p.a));fxX.save();fxX.translate(p.x,p.y);fxX.scale(Math.max(.08,w),1);fxX.drawImage(coinImg,-p.r,-p.r,p.r*2,p.r*2);fxX.restore()}
  if(parts.length)requestAnimationFrame(fxLoop);else{fxOn=false;fxX.clearRect(0,0,540,STH)}}
function cellXY(p){const [c,r]=p.split(',').map(Number);return [RX+c*CW+CW/2,RY+r*CH+CH/2]}
function flyCoins(cells,total){
  const list=[...cells];if(!list.length)return;const n=Math.min(16,Math.max(5,list.length*2));const tx=27,ty=756+150+21;
  for(let i=0;i<n;i++){const [sx,sy]=cellXY(list[i%list.length]);const im=document.createElement('img');im.src=COIN_URL;im.className='fly';
    im.style.cssText+=`left:${sx-16}px;top:${sy-16}px;width:32px;height:32px`;stage.appendChild(im);
    const dx=tx-sx,dy=ty-sy,mx=dx*.3+rnd(-60,60),my=dy*.2-rnd(60,140),dl=i*55+rnd(0,40);
    im.animate([{transform:'translate(0,0) scale(.4)',opacity:0},{transform:`translate(${mx*.5}px,${my*.5}px) scale(1.1)`,opacity:1,offset:.15},{transform:`translate(${mx}px,${my}px) scale(1)`,offset:.5},{transform:`translate(${dx}px,${dy}px) scale(.6)`,opacity:1}],{duration:850,delay:dl,easing:'ease-in',fill:'both'}).onfinish=()=>{im.remove();SFX.coin();$('bal').classList.remove('bump');void $('bal').offsetWidth;$('bal').classList.add('bump')}}
}
function flyWheels(cells){
  return Promise.all(cells.map((p,i)=>new Promise(res=>{const [sx,sy]=cellXY(p);const im=document.createElement('img');im.src=URL_[SH];im.className='fly';
    im.style.cssText+=`left:${sx-52}px;top:${sy-65}px;width:104px;height:130px`;stage.appendChild(im);
    const dx=492-sx,dy=335-sy;
    im.animate([{transform:'translate(0,0) scale(1)'},{transform:`translate(${dx*.2}px,${dy*.2-30}px) scale(1.15)`,offset:.25},{transform:`translate(${dx}px,${dy}px) scale(.3)`}],{duration:750,delay:i*120,easing:'ease-in',fill:'both'}).onfinish=()=>{im.remove();SFX.collect();$('progi').classList.remove('bump');void $('progi').offsetWidth;$('progi').classList.add('bump');res()}})));
}

/* =====================================================================
   OYUN AKIŞI
   ===================================================================== */
let busy=false,freeMode=false,lastR=null;
const AUTO={on:false,left:0,loss:0,single:0,stopFree:true,start:0};
const plOdo=new Odo($('plOdo')),bigOdo=new Odo($('bigOdo')),jpOdo=new Odo($('jpOdo')),feOdo=new Odo($('feOdo'));
const turboOn=()=>S.turbo&&S.admin.turboOn;
function setSpinBtn(stop){ART.spinText($('spinTxt'),stop?'STOP':'SPIN',stop);$('spin').classList.toggle('stop',stop)}
function autoUI(){const a=$('auto');a.classList.toggle('on',AUTO.on);a.innerHTML=AUTO.on?`STOP<small>${AUTO.left<0?'∞':AUTO.left}</small>`:'AUTO'}
function stopAuto(msg){if(!AUTO.on)return;AUTO.on=false;autoUI();if(msg)toast(msg,2200)}
function sessUI(){const m=Math.floor((Date.now()-SES.t0)/60000),net=SES.won-SES.wag;$('sess').textContent=`Oturum ${m} dk · ${SES.spins} spin · Net ${net>=0?'+':''}${fmt(net)}`}
let gAvail=0;
async function spin(){
  if(busy||gmb)return;
  hideInfo();
  const isFree=S.free.left>0;
  const lb=isFree?S.free.bet:BETS[S.betIdx],total=lb*NL;
  if(!isFree&&S.bal<total){toast('Yetersiz bakiye');stopAuto();return}
  busy=true;quick=false;anims=[];SKIP=false;gAvail=0;$('gbtn').style.display='none';
  stopCycle();clearFx();const pl=$('plaque');pl.style.display='none';pl.classList.remove('quiet');$('winv').textContent='0';
  setSpinBtn(!AUTO.on);
  const res=await api('/spin',{betIdx:S.betIdx});
  if(!res.ok){busy=false;setSpinBtn(false);stopAuto();toast(res.msg||'Spin yapılamadı',2400);hud();return}
  if(!isFree){SES.wag+=total;SES.spins++;S.stats.wag+=total}else{S.free.left--;freeMode=true}
  S.stats.spins++;
  S.bal=res.balance-res.win;setBal(S.bal);
  hud();pools();SFX.spin();
  const R=res.R;R.cells=new Set(R.cells);
  const o={g:res.g,stops:res.stops,R};
  await spinReels(o);
  cur=o.g;S.stops=o.stops.slice();S.cur=cur;
  setSpinBtn(false);$('spin').classList.add('dim');
  const T=turboOn();
  if(R.win>0)S.stats.wins++;
  const jp=res.jp?{k:res.jp.k,amt:res.jp.amt}:null;
  if(jp){S.stats.jps++;S.stats.jpPaid+=jp.amt}
  const win=res.win;
  S.bal=res.balance;HOST.emit('spin',{bet:isFree?0:total,win:win,free:isFree,jackpot:jp?jp.k:null,balance:S.bal});
  S.stats.paid+=R.win;S.stats.maxWin=Math.max(S.stats.maxWin,win);if(isFree)S.free.total+=win;SES.won+=win;
  // koleksiyon (sunucudan)
  const prevT=S.tickets;S.prog=res.prog;S.tickets=res.tickets;S.ticketBets=res.ticketBets;const ticket=res.tickets>prevT;
  if(res.pool!=null){S.jp.total=res.pool;pools()}
  S.hist.unshift({t:Date.now(),bet:isFree?0:total,win,f:isFree?1:0});if(S.hist.length>100)S.hist.length=100;
  sessUI();
  /* ---- sunum ---- */
  const wheelP=R.wheel.length?flyWheels(R.wheel).then(()=>hud()):Promise.resolve();
  if(R.win>0){
    const quiet=S.admin.ldwQuiet&&!isFree&&R.win<total; // bahisten düşük kazanç kutlanmaz
    drawLines(R.lines);light(R.cells);setBal(S.bal-(jp?jp.amt:0),quiet?300:1300);
    if(quiet){SFX.tick();pl.classList.add('quiet')}else{SFX.win(R.lines.length);flyCoins(R.cells,R.win)}
    if(R.win>=total*S.admin.bigX){await bigWin(R.win,total)}
    else{pl.style.display='block';pl.animate([{transform:'scale(.6)',opacity:0},{transform:'scale(1)',opacity:1}],{duration:220,easing:'ease-out'});
      await plOdo.run(R.win,T||quiet?350:R.win>=total*3?1400:800);$('winv').textContent=fmt(R.win);await sleep(T?150:AUTO.on||isFree?450:650)}
    $('winv').textContent=fmt(R.win);
  }else setBal(S.bal-(jp?jp.amt:0));
  if(jp){R.jpCells.forEach(p=>cellEl(p)&&cellEl(p).classList.add('win'));drawLines([{li:R.jp}]);await sleep(800);await jackpotWin(jp);setBal(S.bal,800);$('winv').textContent=fmt(win)}
  await wheelP;
  if(ticket){toast('Çılgın Slot kazandın! (x'+S.tickets+')',2200);SFX.free()}
  if(R.free>0){
    R.scat.forEach(p=>{const e=cellEl(p);if(e){e.classList.remove('dim');e.classList.add('scat')}});SFX.stop(true);await sleep(900);
    if(!isFree){S.free.total=0;S.free.bet=lb}
    S.free.left+=R.free;S.stats.frees++;await freeIntro(R.free,isFree);hud();
  }
  S.free.left=res.free.left;S.free.bet=res.free.bet;
  busy=false;$('spin').classList.remove('dim');hud();lastR=R;
  if(isFree&&S.free.left===0){await freeOutro(res.free.total);S.free.total=0;freeMode=false;hud()}
  if(S.free.left>0){await sleep(T?250:600);return spin()}
  // otomatik oyun durma koşulları
  if(AUTO.on){
    if(AUTO.left>0)AUTO.left--;
    const net=S.bal-AUTO.start;
    if(AUTO.left===0)stopAuto('Otomatik oyun tamamlandı');
    else if(AUTO.loss&&-net>=AUTO.loss)stopAuto('Kayıp limitine ulaşıldı');
    else if(AUTO.single&&win>=AUTO.single)stopAuto('Tek kazanç limitine ulaşıldı');
    else if(jp)stopAuto('Jackpot kazandın!');
    else if(R.free>0&&AUTO.stopFree)stopAuto('Free spin geldi');
    else if(S.bal<BETS[S.betIdx]*NL)stopAuto('Yetersiz bakiye');
    autoUI();
    if(AUTO.on){await sleep(T?120:R.win>0?700:350);if(AUTO.on&&!busy)return spin()}
  }
  // kart kumarı fırsatı (sunucu karar verir)
  if(res.gambleAvail>0){gAvail=res.gambleAvail;const gb=$('gbtn');gb.style.display='block';$('plaque').style.display='block'}
  else if(R.win>0)setTimeout(()=>{if(!busy&&!gAvail)$('plaque').style.display='none'},1200);
  startCycle(R);
}
async function bigWin(amt,total){
  const ov=$('ovBig'),x=amt/total;ART.bigTitle($('bigC'),x>=S.admin.superX?'SÜPER WIN':x>=S.admin.megaX?'MEGA WIN':'BIG WIN');
  bigOdo.show(0,amt);ov.classList.add('show');SFX.big();burst(90);const ci=setInterval(()=>burst(28),650);
  SKIP=false;const sk=()=>SKIP=true;ov.addEventListener('pointerdown',sk);
  await bigOdo.run(amt,x>=S.admin.megaX?5000:3500);clearInterval(ci);ov.removeEventListener('pointerdown',sk);burst(60);
  await waitTap(1800,ov);ov.classList.remove('show');SKIP=false;
}
async function jackpotWin(jp){
  const ov=$('ovJp');ART.jpOverlay($('jpC'),TLABEL[jp.k],TGRAD[jp.k]);jpOdo.show(0,jp.amt);$('jpSub').textContent=TLABEL[jp.k]+' havuzundan kazandınız!';
  ov.classList.add('show');SFX.jp();burst(120);const ci=setInterval(()=>burst(34),600);SKIP=false;const sk=()=>SKIP=true;ov.addEventListener('pointerdown',sk);
  await jpOdo.run(jp.amt,5000);clearInterval(ci);ov.removeEventListener('pointerdown',sk);await waitTap(2600,ov);ov.classList.remove('show');SKIP=false;
}
async function freeIntro(n,re){
  const ov=$('ovFree');ART.freeIntro($('freeC'),n,re);ov.classList.add('show');SFX.free();burst(40);await waitTap(1700,ov);ov.classList.remove('show');
}
async function freeOutro(t){
  const ov=$('ovFreeEnd');ART.freeEnd($('freeEC'));feOdo.show(0,t);ov.classList.add('show');SFX.big();burst(60);
  SKIP=false;const sk=()=>SKIP=true;ov.addEventListener('pointerdown',sk);await feOdo.run(t,2000);ov.removeEventListener('pointerdown',sk);await waitTap(1800,ov);ov.classList.remove('show');SKIP=false;
}

/* =====================================================================
   ÇILGIN SLOT (koleksiyon bonusu)
   ===================================================================== */
let crz=null;
async function openCrazy(){
  if(busy||S.tickets<=0||AUTO.on||S.free.left>0){if(S.tickets<=0)toast(S.admin.collectNeed+' çark sembolü topla, Çılgın Slot açılsın');return}
  busy=true;
  const r=await api('/crazy/open',{});
  if(!r.ok){busy=false;toast(r.msg||'Açılamadı',2200);return}
  showCrazy(r);
}
function showCrazy(r){
  S.tickets=r.tickets;S.ticketBets=r.ticketBets;hud();
  crz={lives:r.lives,base:r.base,win:r.win||0,cur:r.cur};busy=true;
  $('crzReels').innerHTML=[0,1,2].map(i=>`<div class="cr"><div class="st"><div><img src="${CRZ_URL[crz.cur[i]]}" style="width:110px;height:110px"></div></div></div>`).join('');
  $('crzL').textContent=crz.lives;$('crzB').textContent=fmt(crz.base);$('crzW').textContent=fmt(crz.win);$('crzMsg').textContent='3 aynı çarpan = baz × çarpan · +1 = ekstra şans';
  $('crzBtn').disabled=false;$('crzBtn').textContent='ÇEVİR';$('crz').classList.add('show');
}
async function crazySpin(){
  if(!crz||crz.spinning)return;
  if(crz.lives<=0){$('crz').classList.remove('show');busy=false;crz=null;hud();return}
  crz.spinning=true;$('crzBtn').disabled=true;
  const r=await api('/crazy/spin',{});
  if(!r.ok){crz.spinning=false;$('crzBtn').disabled=false;toast(r.msg||'Çevrilemedi',2200);return}
  crz.lives=r.lives-r.extra;$('crzL').textContent=crz.lives;SFX.spin();
  const res=r.res;
  const reels=[...$('crzReels').children];
  await Promise.all(reels.map((rl,i)=>new Promise(ok=>{const st=rl.firstChild;const seq=[res[i]];for(let k=0;k<14+i*6;k++)seq.push(CRZ_SYMS[R_(CRZ_SYMS.length)]);seq.push(crz.cur[i]);
    st.innerHTML=seq.map(k=>`<div><img src="${CRZ_URL[k]}" style="width:110px;height:110px"></div>`).join('');
    const d=(seq.length-1)*120;const a=st.animate([{transform:`translateY(${-d}px)`},{transform:'translateY(10px)',offset:.94},{transform:'translateY(0)'}],{duration:900+i*350,easing:'cubic-bezier(.3,0,.3,1)',fill:'forwards'});
    a.onfinish=()=>{st.innerHTML=`<div><img src="${CRZ_URL[res[i]]}" style="width:110px;height:110px"></div>`;a.cancel();SFX.stop(false);ok()}})));
  crz.cur=res;
  const gain=r.gain,extra=r.extra;
  crz.lives=r.lives;crz.win=r.win;$('crzL').textContent=crz.lives;
  if(gain>0){SFX.win(4);burst(40);await new Odo($('crzW')).run(crz.win,700);$('crzW').textContent=fmt(crz.win);$('crzMsg').textContent='+'+fmt(gain)+(extra?' · +'+extra+' şans':'')}
  else $('crzMsg').textContent=extra?'+'+extra+' şans!':'Bu sefer olmadı';
  crz.spinning=false;
  if(r.done){
    S.bal=r.balance;setBal(S.bal,900);
    $('crzMsg').textContent='Toplam kazanç: '+fmt(crz.win);$('crzBtn').textContent='TAMAM';$('crzBtn').disabled=false;crz.lives=0;
  }else $('crzBtn').disabled=false;
}

/* =====================================================================
   MODALLAR
   ===================================================================== */
function lineSVG(l){let s='<svg viewBox="0 0 52 32">';for(let c=0;c<5;c++)for(let r=0;r<3;r++)s+=`<rect x="${c*10.4+.6}" y="${r*10.4+.6}" width="9.2" height="9.2" rx="1" fill="${l[c]===r?'#ffcc33':'#2e2e2e'}" stroke="#4a3a10" stroke-width=".5"/>`;return s+'</svg>'}
function openRules(){
  const im=s=>`<img src="${URL_[s]}" alt="">`;
  const ex=(a,t)=>`<div class="ex">${a.map(im).join('')}<span>${t}</span></div>`;
  const pay=i=>`5-${PAY[i][2]}<br>4-${PAY[i][1]}<br>3-${PAY[i][0]}`;
  const A=S.admin,J=S.jp,ft=A.freeTbl;
  $('rulesB').innerHTML=`<b>Kurallar</b>
  ${ex([SA,SA,SA,SQ,SQ],'Kazandın')}${ex([SQ,SQ,SA,SA,SA],'Kazanmadın')}${ex([SA,SA,SQ,SA,SA],'Kazanmadın')}
  <p style="font-size:13px">1. Soldaki ilk makaradan başlayarak, aynı ödeme çizgisi üzerinde art arda 3 veya daha fazla aynı sembol gelirse kazanırsınız.<br>
  2. Varsayılan olarak, aynı anda 50 bahis çizgisi üzerine bahis oynarsınız.<br>3. Tek çizgi ödülü = belirli çizginin bahsi × desenin oranı.<br>4. Birden fazla çizgi kazanılırsa, ödüller birikecektir.</p>
  <div class="lg">${LINES.map((l,i)=>`<div>${i+1}${lineSVG(l)}</div>`).join('')}</div>
  <p><b>Bahis oranlarının listesi (Desen sayısı - Oranlar)</b></p>
  <div class="pt">${[0,1,2,3,4,5,6,7,8].map(i=>`<div>${im(i)}<span>${pay(i)}</span></div>`).join('')}<div>${im(SF)}<span>5-${ft[5]} FREE<br>4-${ft[4]} FREE<br>3-${ft[3]} FREE</span></div></div>
  <div class="ds">${im(SW)}<div>WILD sembolü, FREE, JACKPOT ve çark sembolleri hariç diğer tüm sembollerin yerine geçebilir.</div></div>
  <div class="ds">${im(SF)}<div>Herhangi bir yerde 3 veya daha fazla FREE sembolü ücretsiz döndürme kazandırır. Ücretsiz döndürmeler sırasında yeniden tetiklenebilir${A.freeMult>1?`; tüm kazançlar ×${A.freeMult}`:''}.</div></div>
  <div class="ds">${im(SH)}<div>Koleksiyon sayısı ${A.collectNeed} hedefine ulaştığında Çılgın Slot oyununun kilidi açılır. Çılgın Slot'ta kazanmak size daha fazla coin veya bir sonraki tura devam etmek için daha fazla şans kazandırabilir.</div></div>
  <div class="ds">${im(SP)}<div>Tanımlı 50 ödeme çizgisinden herhangi biri üzerinde art arda 5 Jackpot sembolü gelirse Jackpot havuzundan ödül kazanabilirsiniz.</div></div>
  ${A.gambleOn?`<p><b>Kart kumarı:</b> Toplam bahse eşit ya da daha yüksek bir çizgi kazancından sonra ×2 düğmesine basarak kartın rengini (kırmızı/siyah) tahmin edebilirsiniz. Bilirseniz kazanç ikiye katlanır, bilemezseniz o kazanç kaybedilir. En fazla ${A.gambleMax} tur.</p>`:''}
  <p><b>Otomatik oyun:</b> Döndürme sayısı, kayıp limiti ve tek kazanç limiti seçilebilir; jackpot gelirse otomatik oyun her zaman durur.</p>
  <p><b>Sembol bilgisi:</b> Makaradaki bir sembole dokunarak o sembolün mevcut bahisteki ödemelerini görebilirsiniz.</p>
  <p>Bir havuz kazandığınızda, oynadığınız bahse bağlı olarak size farklı ödüller gönderilecektir.</p>
  <p>Mini havuz: minimum toplam bahis ${fmt(J.mins.mini)} coin.<br>Big havuz: minimum toplam bahis ${fmt(J.mins.big)} coin.<br>Mega havuz: minimum toplam bahis ${fmt(J.mins.mega)} coin.<br>Colossal havuz: minimum toplam bahis ${fmt(J.mins.colossal)} coin.</p>
  <p>Jackpot kazandığınızda, havuz tutarının %${A.jpMinR} ile %${A.jpMaxR}'ü arasında rastgele belirlenen bir oran size ödül olarak verilecektir. Havuz yalnızca oyuncuların bahislerinden oluşur.</p><p>Her döndürmenin sonucu sunucuda belirlenir. Hedef geri ödeme oranı yaklaşık %${S.rtp||''}.</p>`;
  $('rules').classList.add('show');$('rulesB').scrollTop=0;
}
function openHist(){
  const d=t=>{t=new Date(t);const p=n=>String(n).padStart(2,'0');return `${t.getFullYear()}-${p(t.getMonth()+1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}:${p(t.getSeconds())}`};
  const m=Math.floor((Date.now()-SES.t0)/60000),net=SES.won-SES.wag;
  $('histB').innerHTML=`<div class="sbox"><span>Oturum süresi</span><b>${m} dk</b><span>Spin</span><b>${SES.spins}</b><span>Bahis</span><b>${fmt(SES.wag)}</b><span>Net</span><b style="color:${net>=0?'#7dff7a':'#ff6a5a'}">${net>=0?'+':''}${fmt(net)}</b></div>`+(S.hist.length?S.hist.map(h=>`<div class="hi${h.win>0?' w':''}">${d(h.t)}<br>Bahis: ${h.f?'FREE':fmt(h.bet)}<br><b>Kazanç: ${fmt(h.win)}</b></div>`).join(''):'<p>Henüz kayıt yok.</p>');
  $('hist').classList.add('show');
}
function openJp(){
  const d=t=>{const m=Math.round((Date.now()-t)/60000);return m<1?'az önce':m<60?m+' dk önce':Math.round(m/60)+' sa önce'};
  $('jpB').innerHTML=`<p style="text-align:center;margin:0 0 6px;font-size:13px">Bahis çizgisi üzerinde art arda 5 jackpot belirirse, jackpot havuzundan kazanabilirsiniz! Farklı havuzların minimum bahisleri farklıdır.</p>`+
   TIERS.map(k=>{const w=S.jp.winners[k][0];return `<div class="jr"><div><span class="tn" style="background:${TCSS[k]};-webkit-background-clip:text;background-clip:text;color:transparent">${TLABEL[k]}</span><span class="mn">Minimum bahis ${fmt(S.jp.mins[k])}'dır · Havuz ${fmt(jpShare(k))}</span></div>
     <div class="ww">${w?`<div style="text-align:right">Yeni kazanan<br><b>${esc(w.n)}</b><br><span class="wv">${fmt(w.a)}</span> · ${d(w.t)}</div><div class="wa" style="background:${w.av?w.av.c:'#c8841a'}">${esc(w.av?w.av.i:'★')}</div>`:'<div style="text-align:right">Yeni kazanan</div><div class="wa">♛</div><div>Bekleniyor</div>'}</div></div>`}).join('');
  $('jpm').classList.add('show');
}
document.querySelectorAll('.md').forEach(m=>{m.querySelector('.x').onclick=()=>{m.classList.remove('show');SFX.click()};m.addEventListener('pointerdown',e=>{if(e.target===m)m.classList.remove('show')})});

/* =====================================================================
   SEMBOL BİLGİ KARTI (makarada sembole dokun)
   ===================================================================== */
function hideInfo(){$('sinfo').classList.remove('show')}
function showInfo(c,r){
  const s=cur[c][r],lb=BETS[S.betIdx],el=$('sinfo');$('siImg').src=URL_[s];
  let t=`<b>${SNAME[s]}</b><br>`;
  if(s<=SW)t+=`5 × = <b>${fmt(PAY[s][2]*lb)}</b><br>4 × = <b>${fmt(PAY[s][1]*lb)}</b><br>3 × = <b>${fmt(PAY[s][0]*lb)}</b>`+(s===SW?'<br><small>FREE, JACKPOT ve çark hariç her sembolün yerine geçer</small>':'');
  else if(s===SF)t+=`3 → ${S.admin.freeTbl[3]} · 4 → ${S.admin.freeTbl[4]} · 5 → ${S.admin.freeTbl[5]} ücretsiz döndürme<br><small>her yerde sayılır</small>`;
  else if(s===SP)t+=`Bir çizgide 5 tane = Jackpot havuzu<br><small>min. toplam bahis ${fmt(S.jp.mins.mini)}</small>`;
  else t+=`${S.admin.collectNeed} tane topla → Çılgın Slot<br><small>sayaç: ${S.prog}/${S.admin.collectNeed}</small>`;
  $('siTxt').innerHTML=t;
  const x0=RX+c*CW+CW/2,y0=RY+r*CH;let left=x0<270?x0+30:x0-250,top=Math.max(380,Math.min(620,y0+10));
  el.style.left=left+'px';el.style.top=top+'px';el.classList.add('show');SFX.click();
}
$('reels').addEventListener('click',e=>{if(busy||AUTO.on||S.free.left>0||gmb)return;const r=$('reels').getBoundingClientRect(),x=(e.clientX-r.left)/SC,y=(e.clientY-r.top)/SC;
  const c=Math.floor(x/CW),rw=Math.floor(y/CH);if(c<0||c>4||rw<0||rw>2)return;e.stopPropagation();if($('sinfo').classList.contains('show')&&showInfo.last===c+','+rw){hideInfo();showInfo.last='';return}showInfo.last=c+','+rw;showInfo(c,rw)});
stage.addEventListener('pointerdown',e=>{if(!e.target.closest('#reels')&&!e.target.closest('#sinfo'))hideInfo()});

/* =====================================================================
   AYARLAR
   ===================================================================== */
function openSettings(){
  const sw=(k,l,on)=>`<div class="opt"><span>${l}</span><button class="sw ${on?'on':''}" data-k="${k}"></button></div>`;
  const m=Math.floor((Date.now()-SES.t0)/60000),net=SES.won-SES.wag;
  $('setB').innerHTML=`${sw('music','Müzik',S.music)}${sw('sound','Ses efektleri',S.sound)}${S.admin.turboOn?sw('turbo','Turbo döndürme',S.turbo):''}
   <div class="ttl2" style="margin-top:14px">OTURUM</div>
   <div class="sbox"><span>Süre</span><b>${m} dk</b><span>Spin</span><b>${SES.spins}</b><span>Toplam bahis</span><b>${fmt(SES.wag)}</b><span>Toplam kazanç</span><b>${fmt(SES.won)}</b><span>Net</span><b style="color:${net>=0?'#7dff7a':'#ff6a5a'}">${net>=0?'+':''}${fmt(net)}</b></div>
   <p style="font-size:12px;color:#8a7a50;margin:0">İpucu: makaradaki bir sembole dokunarak ödemelerini görebilirsin. Bilgisayarda boşluk tuşu = SPIN.</p>`;
  $('setB').querySelectorAll('.sw').forEach(b=>b.onclick=()=>{const k=b.dataset.k;S[k]=!S[k];b.classList.toggle('on',S[k]);if(k==='music')musicSet(S.music);if(k==='sound'&&S.sound)ac();hud();save()});
  $('setm').classList.add('show');
}

/* =====================================================================
   OTOMATİK OYUN PANELİ
   ===================================================================== */
function openAuto(){
  const cf=S.autoCfg,tb=BETS[S.betIdx]*NL,need=S.admin.autoNeedLimit;
  const chips=(k,vals,lab)=>`<div class="chips" data-k="${k}">${vals.map(v=>`<button data-v="${v}" class="${cf[k]==v?'on':''}">${lab(v)}</button>`).join('')}</div>`;
  $('autoB').innerHTML=`<div class="ttl2">DÖNDÜRME SAYISI</div>${chips('n',[10,25,50,100,250,-1],v=>v<0?'∞':v)}
   <div class="ttl2">KAYIP LİMİTİ (toplam bahsin katı)</div>${chips('loss',need?[10,25,50,100]:[0,10,25,50,100],v=>v?v+'×':'Yok')}
   <div class="ttl2">TEK KAZANÇ LİMİTİ</div>${chips('single',[0,10,50,100],v=>v?v+'×':'Yok')}
   <div class="opt"><span>Free spin gelince dur</span><button class="sw ${cf.stopFree?'on':''}" id="aStopF"></button></div>
   <p style="font-size:12px;color:#8a7a50">Toplam bahis: ${fmt(tb)} · Jackpot gelirse her zaman durur.</p>
   <button class="big-btn" id="aGo">BAŞLAT</button>`;
  if(need&&!cf.loss)cf.loss=10;
  $('autoB').querySelectorAll('.chips').forEach(ch=>ch.querySelectorAll('button').forEach(b=>b.onclick=()=>{cf[ch.dataset.k]=+b.dataset.v;ch.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));SFX.click()}));
  $('aStopF').onclick=()=>{cf.stopFree=!cf.stopFree;$('aStopF').classList.toggle('on',cf.stopFree)};
  $('aGo').onclick=()=>{$('autom').classList.remove('show');save();
    AUTO.on=true;AUTO.left=cf.n;AUTO.loss=cf.loss*tb;AUTO.single=cf.single*tb;AUTO.stopFree=cf.stopFree;AUTO.start=S.bal;autoUI();if(!busy)spin()};
  $('autom').classList.add('show');
}

/* =====================================================================
   KART KUMARI (kırmızı / siyah ×2)
   ===================================================================== */
let gmb=null;
const SUITS={r:['♥','♦'],b:['♠','♣']},RANKS=['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
function drawCard(c,card,small){const x=c.getContext('2d'),W=c.width,H=c.height;x.clearRect(0,0,W,H);
  const r=W*.08,p=new Path2D();p.moveTo(r,0);p.arcTo(W,0,W,H,r);p.arcTo(W,H,0,H,r);p.arcTo(0,H,0,0,r);p.arcTo(0,0,W,0,r);p.closePath();
  if(!card){x.fillStyle=ART.lg(x,0,0,W,H,[[0,'#262626'],[1,'#050505']]);x.fill(p);x.strokeStyle='#ffd84a';x.lineWidth=W*.04;x.stroke(p);
    x.save();x.clip(p);x.strokeStyle='rgba(255,216,74,.25)';x.lineWidth=W*.012;for(let i=-H;i<W+H;i+=W*.09){x.beginPath();x.moveTo(i,0);x.lineTo(i+H,H);x.moveTo(i+H,0);x.lineTo(i,H);x.stroke()}x.restore();
    x.fillStyle='#000';x.beginPath();x.arc(W/2,H/2,W*.22,0,Math.PI*2);x.fill();x.strokeStyle='#ffd84a';x.lineWidth=W*.025;x.stroke();
    ART.gtext(x,'W',W/2,H/2+2,W*.24,ART.GOLD,{outline:'#000',ow:W*.04});return}
  x.fillStyle='#fffdf5';x.fill(p);x.strokeStyle='#c8b070';x.lineWidth=W*.03;x.stroke(p);
  const col=card.c==='r'?'#d0101a':'#111';x.fillStyle=col;x.textAlign='center';x.textBaseline='middle';
  x.font=`900 ${W*(small?.4:.22)}px Arial`;x.fillText(card.rk,W*(small?.5:.2),H*(small?.38:.14));
  x.font=`${W*(small?.42:.2)}px Arial`;x.fillText(card.s,W*(small?.5:.2),H*(small?.75:.27));
  if(!small){x.font=`${W*.55}px Arial`;x.fillText(card.s,W/2,H*.56);x.save();x.translate(W*.8,H*.86);x.rotate(Math.PI);x.font=`900 ${W*.22}px Arial`;x.fillText(card.rk,0,0);x.restore()}
}
function gUI(){$('gAmt').textContent=fmt(gmb.stake);$('gNext').textContent=fmt(gmb.stake*2);$('gRound').textContent=gmb.round+'/'+S.admin.gambleMax;
  $('ghist').innerHTML='';gmb.hist.slice(-6).forEach(cd=>{const c=document.createElement('canvas');c.width=60;c.height=84;drawCard(c,cd,true);$('ghist').appendChild(c)})}
async function openGamble(w){
  if(busy||gmb)return;stopCycle();
  const r=await api('/gamble/start',{});
  if(!r.ok){gAvail=0;$('gbtn').style.display='none';toast(r.msg||'Kumar açılamadı',2000);return}
  S.bal=r.balance;S.admin.gambleMax=r.max;SES.won-=w;setBal(S.bal);gAvail=0;$('gbtn').style.display='none';
  gmb={stake:r.stake,base:r.stake,round:0,hist:gmb&&gmb.hist||[],busy:false};drawCard($('gcv'),null);$('gcard').classList.remove('flip');
  $('gMsg').textContent='Rengi tahmin et: kazanırsan ikiye katlanır';$('gRed').disabled=$('gBlack').disabled=false;$('gTake').disabled=false;gUI();$('gmb').classList.add('show');SFX.click();
}
async function gGuess(colr){
  if(!gmb||gmb.busy)return;gmb.busy=true;$('gRed').disabled=$('gBlack').disabled=$('gTake').disabled=true;SFX.spin();
  const r=await api('/gamble/pick',{color:colr});
  if(!r.ok){gmb.busy=false;$('gRed').disabled=$('gBlack').disabled=$('gTake').disabled=false;toast(r.msg||'Hata',2000);return}
  const ok=r.win,card=r.card;
  const cv_=$('gcv');cv_.animate([{transform:'rotateY(0)'},{transform:'rotateY(90deg)'}],{duration:220}).onfinish=()=>{drawCard(cv_,card);cv_.animate([{transform:'rotateY(90deg)'},{transform:'rotateY(0)'}],{duration:220})};
  await sleep(520);gmb.hist.push(card);
  if(ok){gmb.stake=r.stake;gmb.round=r.round;SFX.win(3);burst(25);gUI();
    if(r.done){$('gMsg').textContent='En yüksek tura ulaştın!';await sleep(900);S.bal=r.balance;return gTake(true)}
    $('gMsg').textContent='Kazandın! Devam et ya da topla';await sleep(500);drawCard(cv_,null);gmb.busy=false;$('gRed').disabled=$('gBlack').disabled=$('gTake').disabled=false}
  else{SFX.stop(false);$('gMsg').textContent='Kaybettin';gmb.stake=0;gUI();await sleep(1300);S.bal=r.balance;gTake(true)}
}
async function gTake(closed){
  if(!gmb)return;const w=gmb.stake;
  if(!closed){const r=await api('/gamble/take',{});if(r.ok)S.bal=r.balance;else{toast(r.msg||'Hata',2000);return}}
  SES.won+=w;setBal(S.bal,600);$('winv').textContent=fmt(w);
  if(S.hist[0])S.hist[0].win=S.hist[0].win-gmb.base+w;sessUI();
  $('gmb').classList.remove('show');$('plaque').style.display='none';gmb=null;
}
$('gRed').onclick=()=>gGuess('r');$('gBlack').onclick=()=>gGuess('b');$('gTake').onclick=()=>{if(gmb&&!gmb.busy)gTake(false)};

/* =====================================================================
   KONTROLLER
   ===================================================================== */
document.addEventListener('pointerdown',()=>{if(S.music&&!MUS.on)musicSet(true)},{once:false,passive:true});
$('spin').onclick=()=>{ac();
  if(busy){if(!quick&&anims.length){quick=true;anims.forEach(a=>{try{a.finish()}catch(e){}})}return}
  if(crz||gmb)return;SFX.click();spin()};
document.addEventListener('keydown',e=>{if(e.code==='Space'&&!document.querySelector('.md.show')&&!$('crz').classList.contains('show')&&!gmb){e.preventDefault();$('spin').click()}});
function chBet(d){if(busy||S.free.left>0||AUTO.on||gmb)return;const n=Math.max(0,Math.min(BETS.length-1,S.betIdx+d));if(n===S.betIdx)return;S.betIdx=n;SFX.click();hud();save()}
$('bPlus').onclick=()=>chBet(1);$('bMinus').onclick=()=>chBet(-1);
$('max').onclick=()=>{if(busy||S.free.left>0||AUTO.on||gmb)return;let i=0;BETS.forEach((b,k)=>{if(b*NL<=S.bal)i=k});S.betIdx=i;SFX.click();hud();save()};
$('auto').onclick=()=>{ac();SFX.click();if(AUTO.on){stopAuto();return}if(busy||gmb)return;openAuto()};
$('bSet').onclick=()=>{SFX.click();openSettings()};
$('turbo').onclick=()=>{S.turbo=!S.turbo;SFX.click();hud();save();toast(S.turbo?'Turbo açık':'Turbo kapalı',1000)};
$('gbtn').onclick=e=>{e.stopPropagation();if(gAvail&&!busy)openGamble(gAvail)};
$('bRules').onclick=()=>{SFX.click();openRules()};$('bHist').onclick=()=>{SFX.click();openHist()};
$('jpbar').onclick=()=>{SFX.click();openJp()};
$('crazy').onclick=()=>{SFX.click();openCrazy()};
$('crzBtn').onclick=()=>crazySpin();
$('bal').onclick=()=>toast('Bakiyen uygulamadaki Coin bakiyendir',1800);

/* =====================================================================
   ZAMANLAYICILAR & BAŞLAT
   ===================================================================== */
async function pollPool(){if(busy||document.hidden)return;const j=await api('/pool');if(j.ok){applyPool(j);applyFeed(j.feed)}}
async function boot(){
  fit();
  let st=null;
  const steps=[()=>{ART.logo($('ldLogo'),S.admin.title)},makeArt,()=>buildStrips(S.admin.strips),()=>{
    cur=[[S10,SJ,SQ],[SK,SW,SA],[SE,SR,SA],[SF,ST,SK],[SQ,SP,S10]];
    buildReels();coinImg.src=COIN_URL;setBal(S.bal);setSpinBtn(false);hud();pools()}];
  const first=api('/state');
  for(let i=0;i<steps.length;i++){steps[i]();$('ldf').style.width=((i+1)/steps.length*100)+'%';await sleep(60)}
  st=await first;
  if(!st.ok){$('ldt').textContent=st.msg||'Oyuna girilemedi';$('ldt').style.color='#ff8a7a';return}
  applyServer(st);
  await sleep(250);$('loader').style.opacity=0;setTimeout(()=>$('loader').style.display='none',420);
  setInterval(pollPool,15000);setInterval(sessUI,30000);
  if(st.crazy)setTimeout(()=>{toast('Yarım kalan Çılgın Slot devam ediyor');showCrazy({tickets:S.tickets,ticketBets:S.ticketBets,lives:st.crazy.lives,base:st.crazy.base,win:st.crazy.win,cur:st.crazy.cur})},700);
  else if(S.free.left>0){freeMode=true;hud();setTimeout(()=>{toast('Kalan free spinler devam ediyor');spin()},900)}
}

/* =====================================================================
   UYGULAMA KÖPRÜSÜ (mobil uygulamaya entegrasyon)
   Dışarıya olay yollar, içeriye komut alır. Kanallar: ReactNativeWebView,
   iOS WKWebView (webkit.messageHandlers.wildking), Android WebView
   (WildKingHost.postMessage), iframe/parent, window 'wildking' olayı (Capacitor/Cordova).
   ===================================================================== */
const HOST=(()=>{
  const out=(t,d)=>{
    const m=JSON.stringify({src:'wildking',type:t,data:d||{}});
    try{if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(m)}catch(e){}
    try{if(window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.wildking)window.webkit.messageHandlers.wildking.postMessage(m)}catch(e){}
    try{if(window.WildKingHost&&window.WildKingHost.postMessage)window.WildKingHost.postMessage(m)}catch(e){}
    try{if(t==='exit'&&window.TrLiveBridge&&window.TrLiveBridge.postMessage)window.TrLiveBridge.postMessage(JSON.stringify({type:'close'}))}catch(e){}
    try{if(window.parent&&window.parent!==window)window.parent.postMessage(m,'*')}catch(e){}
    try{window.dispatchEvent(new CustomEvent('wildking',{detail:{type:t,data:d||{}}}))}catch(e){}
  };
  const snap=()=>({balance:S.bal,bet:BETS[S.betIdx]*NL,betIdx:S.betIdx,freeLeft:S.free.left,sound:S.sound,music:S.music,turbo:S.turbo,spins:S.stats.spins,session:{spins:SES.spins,wagered:SES.wag,won:SES.won}});
  const cmd=(c)=>{
    if(!c||typeof c!=='object')return;
    const a=c.data||{};
    switch(c.type){
      case'setBalance':break;
      case'addBalance':break;
      case'setBet':if(!busy&&BETS[a.index]!==undefined){S.betIdx=a.index;hud();save()}break;
      case'setSound':S.sound=!!a.value;hud();save();break;
      case'setMusic':S.music=!!a.value;musicSet(S.music);save();break;
      case'pause':pauseApp();break;
      case'resume':resumeApp();break;
      case'back':api.back();break;
      case'getState':out('state',snap());break;
    }
  };
  const pauseApp=()=>{try{musicSet(false)}catch(e){}try{if(AC&&AC.state==='running')AC.suspend()}catch(e){}save();out('pause',snap())};
  const resumeApp=()=>{try{if(AC&&AC.state==='suspended')AC.resume()}catch(e){}if(S.music)try{musicSet(true)}catch(e){}out('resume',snap())};
  const api={
    getState:snap,
    command:cmd,
    setBalance:v=>cmd({type:'setBalance',data:{value:v}}),
    addBalance:v=>cmd({type:'addBalance',data:{value:v}}),
    pause:pauseApp,resume:resumeApp,
    // Android geri tuşu: açık pencere varsa kapatır (true döner), yoksa 'exit' olayı yollar (false döner)
    back:()=>{const m=document.querySelector('.md.show');if(m){const x=m.querySelector('.x');if(x)x.click();return true}out('exit',snap());return false},
    emit:out
  };
  addEventListener('message',e=>{let c=e.data;if(typeof c==='string'){try{c=JSON.parse(c)}catch(x){return}}if(c&&c.dst==='wildking'||c&&c.src==='host')cmd(c)});
  document.addEventListener('message',e=>{let c=e.data;if(typeof c==='string'){try{c=JSON.parse(c)}catch(x){return}}cmd(c)});
  document.addEventListener('visibilitychange',()=>document.hidden?pauseApp():resumeApp());
  addEventListener('pagehide',pauseApp);
  addEventListener('contextmenu',e=>e.preventDefault());
  window['WildKing']=api;
  return api;
})();

boot();
