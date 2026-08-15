'use strict';

function qrSvg(nasa){
  const m=makeQrMatrixNumeric(nasa), border=4, size=m.length, total=size+border*2, paths=[];
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) if(m[y][x]) paths.push(`M${x+border},${y+border}h1v1h-1z`);
  return `<svg viewBox="0 0 ${total} ${total}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#fff"/><path d="${paths.join('')}" fill="#000"/></svg>`;
}

function makeQrMatrixNumeric(input){
  const text=String(input||'').replace(/\D/g,''); if(!text||text.length>41) throw Error('bad qr');
  const size=21,dataCodewords=19,ecCodewords=7,bits=[];
  const appendBits=(val,len)=>{for(let i=len-1;i>=0;i--)bits.push((val>>>i)&1)};
  appendBits(1,4); appendBits(text.length,10);
  for(let i=0;i<text.length;i+=3){const chunk=text.substring(i,i+3); appendBits(parseInt(chunk,10), chunk.length===3?10:chunk.length===2?7:4);}
  const cap=dataCodewords*8; appendBits(0,Math.min(4,cap-bits.length)); while(bits.length%8!==0)bits.push(0);
  const data=[]; for(let i=0;i<bits.length;i+=8){let b=0; for(let j=0;j<8;j++)b=(b<<1)|bits[i+j]; data.push(b);}
  for(let pad=0;data.length<dataCodewords;pad^=1)data.push(pad?0x11:0xEC);
  const full=data.concat(rsRemainder(data,ecCodewords));
  const modules=Array.from({length:size},()=>Array(size).fill(false)), isFunc=Array.from({length:size},()=>Array(size).fill(false));
  const setFunc=(x,y,dark)=>{if(x>=0&&x<size&&y>=0&&y<size){modules[y][x]=!!dark;isFunc[y][x]=true}};
  const finder=(cx,cy)=>{for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const x=cx+dx,y=cy+dy;if(x<0||x>=size||y<0||y>=size)continue;const dist=Math.max(Math.abs(dx),Math.abs(dy));setFunc(x,y,dist!==2&&dist!==4);}};
  finder(3,3); finder(size-4,3); finder(3,size-4);
  for(let i=8;i<size-8;i++){setFunc(i,6,i%2===0);setFunc(6,i,i%2===0);}
  setFunc(8,size-8,true);
  for(let i=0;i<9;i++){if(i!==6){setFunc(8,i,false);setFunc(i,8,false);}}
  for(let i=0;i<8;i++){setFunc(size-1-i,8,false);setFunc(8,size-1-i,false);}
  let bitIndex=0;
  for(let right=size-1;right>=1;right-=2){if(right===6)right--;for(let vert=0;vert<size;vert++){const y=((right+1)&2)===0?size-1-vert:vert;for(let j=0;j<2;j++){const x=right-j;if(!isFunc[y][x]){const bit=bitIndex<full.length*8?((full[bitIndex>>>3]>>>(7-(bitIndex&7)))&1):0;const mask=((x+y)&1)===0;modules[y][x]=!!(bit^(mask?1:0));bitIndex++;}}}}
  drawFormatBits(modules,isFunc,0); return modules;
}

function drawFormatBits(modules,isFunc,mask){
  const data=(1<<3)|mask; let rem=data; for(let i=0;i<10;i++)rem=(rem<<1)^(((rem>>>9)&1)*0x537);
  const bits=((data<<10)|rem)^0x5412, set=(x,y,i)=>{modules[y][x]=((bits>>>i)&1)!==0;isFunc[y][x]=true};
  for(let i=0;i<=5;i++)set(8,i,i); set(8,7,6); set(8,8,7); set(7,8,8);
  for(let i=9;i<15;i++)set(14-i,8,i); for(let i=0;i<8;i++)set(20-i,8,i); for(let i=8;i<15;i++)set(8,6+i,i); modules[13][8]=true; isFunc[13][8]=true;
}

function gfMul(x,y){let z=0;for(let i=7;i>=0;i--){z=(z<<1)^(((z>>>7)&1)*0x11D);z^=((y>>>i)&1)*x;}return z&255;}

function rsDivisor(degree){const result=Array(degree).fill(0); result[degree-1]=1; let root=1; for(let i=0;i<degree;i++){for(let j=0;j<degree;j++){result[j]=gfMul(result[j],root); if(j+1<degree)result[j]^=result[j+1];} root=gfMul(root,2);} return result;}

function rsRemainder(data,degree){const divisor=rsDivisor(degree), result=Array(degree).fill(0); data.forEach(b=>{const factor=b^result.shift(); result.push(0); for(let i=0;i<degree;i++)result[i]^=gfMul(divisor[i],factor);}); return result;}
