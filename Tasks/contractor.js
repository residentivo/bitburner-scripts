/**
 * contractor.js - In-process coding contract solver for Bitburner v3
 * Periodically scans all servers for coding contracts and solves them inline.
 * All solver functions are embedded (no external imports beyond helpers.js).
 */

import { getFilePath, getNsDataThroughFile, disableLogs, scanAllServers } from '../helpers.js';

// ---- SOLVERS (embedded from solver-functions.js) ----

const SOLVERS = [
    { name: 'Find Largest Prime Factor', fn: function(d) {
        if (typeof d === 'bigint') { var n=d,f=2n; while(n>(f-1n)*(f-1n)){while(n%f===0n)n=n/f;++f;} return (n===1n?f-1n:n).toString(); }
        var n=d,f=2; while(n>(f-1)*(f-1)){while(n%f===0)n=Math.round(n/f);++f;} return (n===1?f-1:n).toString();
    }},
    { name: 'Subarray with Maximum Sum', fn: function(d) { var a=d.slice(); for(var i=1;i<a.length;i++)a[i]=Math.max(a[i],a[i]+a[i-1]); return Math.max.apply(Math,a); }},
    { name: 'Total Ways to Sum', fn: function(d) { var w=[1]; w.length=d+1; w.fill(0,1); for(var i=1;i<d;i++)for(var j=i;j<=d;j++)w[j]+=w[j-i]; return w[d]; }},
    { name: 'Total Ways to Sum II', fn: function(d) { try{var n=Number(d[0]),a=d[1]; if(isNaN(n)||n<0)return null;if(!Array.isArray(a))return null;if(n===0)return 1;if(a.length===0)return 0;a=a.filter(function(x){return typeof x==='number'&&x>0&&x<=n;}).sort(function(x,y){return x-y;});if(a.length===0)return 0;var w=new Array(n+1).fill(0);w[0]=1;for(var i=0;i<a.length;i++)for(var j=a[i];j<=n;j++)w[j]+=w[j-a[i]];return w[n];}catch(e){return null;}}},
    { name: 'Spiralize Matrix', fn: function(d) { var s=[],m=d.length,n=d[0].length,u=0,df=m-1,l=0,r=n-1,k=0;while(true){for(var c=l;c<=r;c++){s[k]=d[u][c];k++;}if(++u>df)break;for(var row=u;row<=df;row++){s[k]=d[row][r];k++;}if(--r<l)break;for(var c=r;c>=l;c--){s[k]=d[df][c];k++;}if(--df<u)break;for(var row=df;row>=u;row--){s[k]=d[row][l];k++;}if(++l>r)break;}return s; }},
    { name: 'Array Jumping Game', fn: function(d) { var n=d.length,i=0,r=0;for(;i<n&&i<=r;i++)r=Math.max(i+d[i],r);return i===n?1:0; }},
    { name: 'Array Jumping Game II', fn: function(d) { var n=d.length;if(n<=1)return 0;if(d[0]===0)return-1;var j=0,ce=0,fa=0;for(var i=0;i<n-1;i++){fa=Math.max(fa,i+d[i]);if(i===ce){j++;ce=fa;if(ce>=n-1)break;}}return j; }},
    { name: 'Merge Overlapping Intervals', fn: function(d) { var iv=d.slice();iv.sort(function(a,b){return a[0]-b[0];});var res=[];var s2=iv[0][0],e=iv[0][1];for(var i=0;i<iv.length;i++){if(iv[i][0]<=e)e=Math.max(e,iv[i][1]);else{res.push([s2,e]);s2=iv[i][0];e=iv[i][1];}}res.push([s2,e]);var o=[];res.forEach(function(x){o.push('['+x.toString()+']');});return o.join(',').replace(/\s/g,''); }},
    { name: 'Generate IP Addresses', fn: function(d) { var ret=[];for(var a=1;a<=3;a++)for(var b=1;b<=3;b++)for(var c=1;c<=3;c++)for(var x=1;x<=3;x++){if(a+b+c+x===d.length){var A=parseInt(d.substring(0,a),10),B=parseInt(d.substring(a,a+b),10),C=parseInt(d.substring(a+b,a+b+c),10),D=parseInt(d.substring(a+b+c,a+b+c+x),10);if(A<=255&&B<=255&&C<=255&&D<=255){var ip=[A.toString(),'.',B.toString(),'.',C.toString(),'.',D.toString()].join('');if(ip.length===d.length+3)ret.push(ip);}}}return ret; }},
    { name: 'Algorithmic Stock Trader I', fn: function(d) { var p=d.map(Number);var mc=0,ms=0;for(var i=1;i<p.length;i++){mc=Math.max(0,mc+=p[i]-p[i-1]);ms=Math.max(mc,ms);}return ms.toString(); }},
    { name: 'Algorithmic Stock Trader II', fn: function(d) { var p=0;for(var i=1;i<d.length;i++)p+=Math.max(d[i]-d[i-1],0);return p.toString(); }},
    { name: 'Algorithmic Stock Trader III', fn: function(d) { var h1=-Infinity,h2=-Infinity,r1=0,r2=0;for(var i=0;i<d.length;i++){var price=d[i];r2=Math.max(r2,h2+price);h2=Math.max(h2,r1-price);r1=Math.max(r1,h1+price);h1=Math.max(h1,-price);}return r2.toString(); }},
    { name: 'Algorithmic Stock Trader IV', fn: function(d) { var k=Number(d[0]),pr=d[1],len=pr.length;if(len<2)return 0;if(k>len/2){var res=0;for(var i=1;i<len;i++)res+=Math.max(pr[i]-pr[i-1],0);return res;}var hold=[],rele=[];hold.length=k+1;rele.length=k+1;for(var i=0;i<=k;i++){hold[i]=-Infinity;rele[i]=0;}for(var i=0;i<len;i++){var cur=pr[i];for(var j=k;j>0;j--){rele[j]=Math.max(rele[j],hold[j]+cur);hold[j]=Math.max(hold[j],rele[j-1]-cur);}}return rele[k].toString(); }},
    { name: 'Minimum Path Sum in a Triangle', fn: function(d) { var n=d.length,dp=d[n-1].slice();for(var i=n-2;i>-1;i--)for(var j=0;j<d[i].length;j++)dp[j]=Math.min(dp[j],dp[j+1])+d[i][j];return dp[0]; }},
    { name: 'Unique Paths in a Grid I', fn: function(d) { var n=d[0],m=d[1],cr=[];cr.length=n;for(var i=0;i<n;i++)cr[i]=1;for(var row=1;row<m;row++)for(var i=1;i<n;i++)cr[i]+=cr[i-1];return cr[n-1]; }},
    { name: 'Unique Paths in a Grid II', fn: function(d) { var og=[];og.length=d.length;for(var i=0;i<og.length;i++)og[i]=d[i].slice();for(var i=0;i<og.length;i++)for(var j=0;j<og[0].length;j++){if(og[i][j]==1)og[i][j]=0;else if(i==0&&j==0)og[0][0]=1;else og[i][j]=(i>0?og[i-1][j]:0)+(j>0?og[i][j-1]:0);}return og[og.length-1][og[0].length-1]; }},
    { name: 'Sanitize Parentheses in Expression', fn: function(d) { var l=0,r=0,res=[];for(var i=0;i<d.length;i++){if(d[i]==='(')++l;else if(d[i]===')')l>0?--l:++r;}function dfs(p,idx,cl,cr,s,sol){if(s.length===idx){if(cl===0&&cr===0&&p===0){for(var i=0;i<res.length;i++)if(res[i]===sol)return;res.push(sol);}return;}if(s[idx]==='('){if(cl>0)dfs(p,idx+1,cl-1,cr,s,sol);dfs(p+1,idx+1,cl,cr,s,sol+s[idx]);}else if(s[idx]===')'){if(cr>0)dfs(p,idx+1,cl,cr-1,s,sol);if(p>0)dfs(p-1,idx+1,cl,cr,s,sol+s[idx]);}else{dfs(p,idx+1,cl,cr,s,sol+s[idx]);}}dfs(0,0,l,r,d,'');return res; }},
    { name: 'Find All Valid Math Expressions', fn: function(d) { var num=d[0],target=d[1];function helper(res,path,s,tar,pos,eval,mult){if(pos===s.length){if(tar===eval)res.push(path);return;}for(var i=pos;i<s.length;i++){if(i!=pos&&s[pos]==='0')break;var cur=parseInt(s.substring(pos,i+1));if(pos===0)helper(res,path+cur,s,tar,i+1,cur,cur);else{helper(res,path+'+'+cur,s,tar,i+1,eval+cur,cur);helper(res,path+'-'+cur,s,tar,i+1,eval-cur,-cur);helper(res,path+'*'+cur,s,tar,i+1,eval-mult+mult*cur,mult*cur);}}}if(!num||num.length===0)return[];var result=[];helper(result,'',num,target,0,0,0);return result; }},
    { name: 'Compression I: RLE Compression', fn: function(d) { if(!d||d.length===0)return'';var r='',c=1;for(var i=1;i<d.length;i++){if(d[i]===d[i-1])c++;else{r+=c+d[i-1];c=1;}}r+=c+d[d.length-1];return r; }},
    { name: 'Compression II: LZ Decompression', fn: function(d) { var p='',i=0;while(i<d.length){var ll=d.charCodeAt(i)-0x30;if(ll<0||ll>9||i+1+ll>d.length)return null;p+=d.substring(i+1,i+1+ll);i+=1+ll;if(i>=d.length)break;var bl=d.charCodeAt(i)-0x30;if(bl<0||bl>9)return null;if(bl===0){i++;continue;}if(i+1>=d.length)return null;var bo=d.charCodeAt(i+1)-0x30;if(bo<1||bo>9)return null;if(bo>p.length)return null;for(var j=0;j<bl;j++)p+=p[p.length-bo];i+=2;}return p; }},
    { name: 'Compression III: LZ Compression', fn: function(d) { if(!d||d.length===0)return'';var compressed='',decoded='',pos=0;while(pos<d.length){var litChars='',backLenFound=0,backOffFound=0;while(pos+litChars.length<d.length){var testDec=decoded+litChars,bestBL=0,bestBO=0,matchStart=pos+litChars.length;if(litChars.length>0){for(var off=1;off<=Math.min(9,testDec.length);off++){var fl=0;while(fl<9&&matchStart+fl<d.length){var si=testDec.length-off+(fl%off);if(si<0||si>=testDec.length)break;if(d[matchStart+fl]===testDec[si])fl++;else break;}if(fl>bestBL){bestBL=fl;bestBO=off;}}}if(bestBL>=3){backLenFound=bestBL;backOffFound=bestBO;break;}if(litChars.length>=9)break;litChars+=d[pos+litChars.length];}if(litChars.length===0)litChars=d[pos];pos+=litChars.length;decoded+=litChars;compressed+=String(litChars.length)+litChars;if(pos>=d.length)break;if(backLenFound>=3){var backref='';for(var j=0;j<backLenFound;j++)backref+=decoded[decoded.length-backOffFound+(j%backOffFound)];compressed+=String(backLenFound)+String(backOffFound);decoded+=backref;pos+=backLenFound;}else compressed+='0';}return compressed; }},
    { name: 'Encryption I: Caesar Cipher', fn: function(d) { var pt=d[0],sh=d[1],r='';for(var i=0;i<pt.length;i++){var a=pt.charCodeAt(i);if(a===32)r+=' ';else r+=String.fromCharCode(((a-65-sh+26)%26)+65);}return r; }},
    { name: 'Encryption II: Vigenère Cipher', fn: function(d) { var pt,key;if(Array.isArray(d)){pt=d[0];key=d[1];}else{var si=d.lastIndexOf(' ');pt=d.substring(0,si);key=d.substring(si+1);}if(!/^[A-Z]+$/.test(key))return null;var r='';for(var i=0;i<pt.length;i++){var a=pt.charCodeAt(i);if(a>=65&&a<=90)r+=String.fromCharCode(((a-2*65+key.charCodeAt(i%key.length))%26)+65);else r+=pt[i];}return r; }},
    { name: 'Proper 2-Coloring of a Graph', fn: function(d) { var nv,edges;if(Array.isArray(d[0])&&typeof d[0][0]==='number'&&!Array.isArray(d[0][0])){nv=d[0];edges=d[1];}else if(typeof d[0]==='number'&&Array.isArray(d[1])){nv=d[0];edges=d[1];}else{edges=d;nv=0;for(var i=0;i<edges.length;i++)nv=Math.max(nv,edges[i][0],edges[i][1]);nv++;}var adj=[];for(var i=0;i<nv;i++)adj[i]=[];for(var i=0;i<edges.length;i++){adj[edges[i][0]].push(edges[i][1]);adj[edges[i][1]].push(edges[i][0]);}var color=new Array(nv).fill(-1);for(var s=0;s<nv;s++){if(color[s]!==-1)continue;color[s]=0;var q=[s],h=0;while(h<q.length){var u=q[h++];for(var j=0;j<adj[u].length;j++){var v=adj[u][j];if(color[v]===-1){color[v]=1-color[u];q.push(v);}else if(color[v]===color[u])return[];}}}return color.slice(0,nv); }},
    { name: 'Largest Rectangle in a Matrix', fn: function(d) { var rows=d.length,cols=d[0].length,hist=[];for(var i=0;i<rows;i++){hist[i]=[];for(var j=0;j<cols;j++)hist[i][j]=0;}for(var i=0;i<cols;i++){var ct=0;for(var j=0;j<rows;j++){if(d[j][i]==0)ct++;else ct=0;hist[j][i]=ct;}}var maxA=0,maxL=0,maxR=0,maxU=0,maxD=0;for(var i=0;i<rows;i++){for(var j=0;j<cols;j++){if(hist[i][j]==0)continue;var l=j,r=j;while(l-1>=0&&hist[i][l-1]>=hist[i][j])l--;while(r+1<cols&&hist[i][r+1]>=hist[i][j])r++;if((r-l+1)*hist[i][j]>maxA){maxA=(r-l+1)*hist[i][j];maxL=l;maxR=r;maxU=i-hist[i][j]+1;maxD=i;}}}return [[maxU,maxL],[maxD,maxR]]; }},
    { name: 'Square Root', fn: function(d) { var n;if(typeof d==='bigint')n=d;else if(typeof d==='string'){var s=d.startsWith('__BIGINT__')?d.slice(10):d;try{n=BigInt(s);}catch(e){return null;}}else if(typeof d==='number'&&!isNaN(d)&&isFinite(d))return Math.floor(Math.sqrt(d)).toString();else return null;if(n<0n)return null;if(n<2n)return n.toString();var lo=1n,hi=n;while(lo<=hi){var mid=(lo+hi)/2n,ms=mid*mid;if(ms===n)return mid.toString();if(ms<n)lo=mid+1n;else hi=mid-1n;}return hi.toString(); }},
    { name: 'HammingCodes: Integer to Encoded Binary', fn: function(d) { var n=typeof d==='bigint'?d:BigInt(d);var bits=n.toString(2).split('').reverse().map(function(v){return parseInt(v);});var k=bits.length;var enc=[0];for(var i=1;k>0;i++){if((i&(i-1))!==0)enc[i]=bits[--k];else enc[i]=0;}var pn=0;for(var i=0;i<enc.length;i++)if(enc[i])pn^=i;var pa=pn.toString(2).split('').reverse().map(function(v){return parseInt(v);});for(var i=0;i<pa.length;i++)enc[Math.pow(2,i)]=pa[i]?1:0;pn=0;for(var i=0;i<enc.length;i++)if(enc[i])pn++;enc[0]=pn%2===0?0:1;return enc.join(''); }},
    { name: 'HammingCodes: Encoded Binary to Integer', fn: function(d) { var enc=d.split('').map(function(v){return parseInt(v);});var m=0,n2=enc.length;while(Math.pow(2,m)<m+n2+1)m++;var pn=0;for(var i=0;i<n2;i++){var expected=0;for(var j=0;j<m;j++)if(i&(1<<j))expected^=enc[Math.pow(2,j)];if(enc[i]!==expected)pn^=i;}if(pn!==0&&pn<n2)enc[pn]=1-enc[pn];var dataBits=[];for(var i=1;i<n2;i++)if((i&(i-1))!==0)dataBits.push(enc[i]);dataBits.reverse();return parseInt(dataBits.join(''),2); }},
    { name: 'Shortest Path in a Grid', fn: function(d) { var g=d,rows=g.length,cols=g[0].length;if(g[0][0]===1||g[rows-1][cols-1]===1)return'';var dist=[],parent=[];for(var i=0;i<rows;i++){dist[i]=new Array(cols).fill(-1);parent[i]=new Array(cols).fill(null);}dist[0][0]=0;var q=[[0,0]],h=0;var dirs=[['D',1,0],['R',0,1],['U',-1,0],['L',0,-1]];while(h<q.length){var cur=q[h++];if(cur[0]===rows-1&&cur[1]===cols-1)break;for(var x=0;x<dirs.length;x++){var nr=cur[0]+dirs[x][1],nc=cur[1]+dirs[x][2];if(nr>=0&&nr<rows&&nc>=0&&nc<cols&&g[nr][nc]===0&&dist[nr][nc]===-1){dist[nr][nc]=dist[cur[0]][cur[1]]+1;parent[nr][nc]=[cur[0],cur[1],dirs[x][0]];q.push([nr,nc]);}}}if(dist[rows-1][cols-1]===-1)return'';var path=[],cr=rows-1,cc=cols-1;while(cr!==0||cc!==0){var p=parent[cr][cc];path.push(p[2]);cr=p[0];cc=p[1];}path.reverse();return path.join(''); }},
    { name: 'Total Primes in Range', fn: function(d) {
        var low=Number(d[0]),high=Number(d[1]);
        if(high<2)return 0;
        if(low<2)low=2;
        if(high<=10000000){
            var s=new Array(high+1).fill(true);s[0]=s[1]=false;
            for(var i=2;i*i<=high;i++)if(s[i])for(var j=i*i;j<=high;j+=i)s[j]=false;
            var c=0;for(var i=low;i<=high;i++)if(s[i])c++;
            return c;
        }
        var sqH=Math.ceil(Math.sqrt(high)),sp=[],ss=new Array(sqH+1).fill(true);
        ss[0]=ss[1]=false;
        for(var i=2;i<=sqH;i++){if(ss[i]){sp.push(i);for(var j=i*i;j<=sqH;j+=i)ss[j]=false;}}
        var rs=high-low+1,seg=new Array(rs).fill(true);
        for(var p=0;p<sp.length;p++){var pr=sp[p],st=Math.max(pr,Math.ceil(low/pr))*pr;for(var j=st;j<=high;j+=pr)seg[j-low]=false;}
        var c=0;for(var i=0;i<rs;i++)if(seg[i])c++;
        return c;
    }},
    { name: 'Total Number of Primes', fn: function(d) {
        var low=Number(d[0]),high=Number(d[1]);
        if(high<2)return 0;
        if(low<2)low=2;
        if(high<=10000000){
            var s=new Array(high+1).fill(true);s[0]=s[1]=false;
            for(var i=2;i*i<=high;i++)if(s[i])for(var j=i*i;j<=high;j+=i)s[j]=false;
            var c=0;for(var i=low;i<=high;i++)if(s[i])c++;
            return c;
        }
        var sqH=Math.ceil(Math.sqrt(high)),sp=[],ss=new Array(sqH+1).fill(true);
        ss[0]=ss[1]=false;
        for(var i=2;i<=sqH;i++){if(ss[i]){sp.push(i);for(var j=i*i;j<=sqH;j+=i)ss[j]=false;}}
        var rs=high-low+1,seg=new Array(rs).fill(true);
        for(var p=0;p<sp.length;p++){var pr=sp[p],st=Math.max(pr,Math.ceil(low/pr))*pr;for(var j=st;j<=high;j+=pr)seg[j-low]=false;}
        var c=0;for(var i=0;i<rs;i++)if(seg[i])c++;
        return c;
    }},
];

function findAnswer(contract) {
    if (!contract || !contract.type || contract.data == null) return null;
    for (var i = 0; i < SOLVERS.length; i++) {
        if (SOLVERS[i].name === contract.type) {
            try { return SOLVERS[i].fn(contract.data); } catch(e) { return null; }
        }
    }
    return null;
}

// ---- MAIN ----

/** @param {NS} ns **/
export async function main(ns) {
    disableLogs(ns, ["scan", "run", "isRunning"]);
    ns.print("Getting server list...");
    const servers = scanAllServers(ns);
    ns.print(`Got ${servers.length} servers. Searching for contracts on each...`);
    const contractsDb = servers.map(hostname => ({ hostname, contracts: ns.ls(hostname, '.cct') }))
        .filter(o => o.contracts.length > 0)
        .map(o => o.contracts.map(contract => ({ contract, hostname: o.hostname }))).flat();
    if (contractsDb.length == 0)
        return ns.print("Found no contracts to solve.");

    ns.print(`Found ${contractsDb.length} contracts. Gathering types and data...`);

    // Get all types in one shot
    let contractsDictCommand = command => `Object.fromEntries(${JSON.stringify(contractsDb)}.map(c => [c.contract, ${command}]))`;
    let dictContractTypes = await getNsDataThroughFile(ns, contractsDictCommand('ns.codingcontract.getContractType(c.contract, c.hostname)'), '/Temp/contract-types.txt');

    // Get data per-contract
    const getDataCommand = `JSON.stringify(ns.codingcontract.getData(ns.args[0], ns.args[1]), (k, v) => typeof v === 'bigint' ? '__BIGINT__' + v.toString() : v)`;
    let dictContractData = {};
    for (const c of contractsDb) {
        try {
            const safeName = c.contract.replace(/[^a-zA-Z0-9]/g, '_');
            const raw = await getNsDataThroughFile(ns, getDataCommand, `/Temp/contract-data-${safeName}.txt`, [c.contract, c.hostname]);
            if (raw !== undefined && raw !== null && raw !== "" && raw !== "undefined" && raw !== "null") {
                dictContractData[c.contract] = raw;
            } else {
                ns.tprint(`WARN: getData returned "${raw}" for ${c.contract} on ${c.hostname}`);
            }
        } catch (e) {
            ns.tprint(`WARN: getData exception for ${c.contract} on ${c.hostname}: ${e}`);
        }
    }

    // Parse data into contracts
    let dataCount = 0;
    contractsDb.forEach(c => {
        c.type = dictContractTypes[c.contract];
        const raw = dictContractData[c.contract];
        if (raw) {
            try { c.data = JSON.parse(raw, (k, v) => typeof v === 'string' && v.startsWith('__BIGINT__') ? BigInt(v.slice(10)) : v); }
            catch (e) {
                ns.tprint(`WARN: Failed to parse data for ${c.contract} (${c.type}): ${e}. Raw: ${raw.substring(0, 200)}`);
                try { c.data = JSON.parse(raw); } catch (e2) { ns.tprint(`WARN: Fallback parse also failed: ${e2}`); }
            }
        }
        if (c.data !== undefined && c.data !== null) {
            dataCount++;
        } else {
            ns.tprint(`WARN: No data for ${c.contract} (${c.type})`);
        }
    });

    ns.tprint(`${dataCount}/${contractsDb.length} contracts have data.`);
    if (dataCount == 0)
        return ns.tprint("ERROR: No contract data available. Aborting.");

    // Filter contracts with data
    const allContracts = contractsDb.filter(c => c.data !== undefined && c.data !== null);

    // Summary log
    allContracts.forEach(c => {
        var dataStr;
        if (typeof c.data === 'bigint') dataStr = '__BIGINT__(' + c.data.toString().substring(0, 20) + '...)';
        else if (typeof c.data === 'string' && c.data.length > 40) dataStr = JSON.stringify(c.data.substring(0, 40)) + '...';
        else dataStr = JSON.stringify(c.data);
        ns.tprint(`  ${c.contract} @ ${c.hostname}: ${c.type} | data=${dataStr}`);
    });

    // Solve all contracts in-process
    ns.tprint(`Solving ${dataCount} contracts in-process...`);
    let totalSolved = 0, totalFailed = 0, totalSkipped = 0;
    for (const c of allContracts) {
        const answer = findAnswer(c);
        if (answer == null) { totalSkipped++; continue; }
        try {
            const ok = ns.codingcontract.attempt(answer, c.contract, c.hostname, { returnReward: true });
            if (ok) {
                totalSolved++;
                ns.tprint(`  SOLVED: ${c.contract} on ${c.hostname} (${c.type})`);
            } else {
                totalFailed++;
                ns.tprint(`  WRONG:  ${c.contract} on ${c.hostname} (${c.type}) -> ${JSON.stringify(answer).substring(0,60)}`);
            }
        } catch (e) {
            totalFailed++;
            ns.tprint(`  ERROR:  ${c.contract}: ${e.toString().substring(0,60)}`);
        }
        await ns.sleep(10);
    }
    ns.tprint(`Done: ${totalSolved} solved, ${totalFailed} wrong, ${totalSkipped} skipped`);
}
