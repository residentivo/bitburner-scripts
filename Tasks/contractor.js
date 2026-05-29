/** @param {NS} ns */
export async function main(ns) {
    // Scan all servers
    const home = "home";
    const servers = new Set([home]);
    const queue = [home];
    while (queue.length > 0) {
        const srv = queue.shift();
        for (const s of ns.scan(srv)) {
            if (!servers.has(s)) { servers.add(s); queue.push(s); }
        }
    }

    ns.tprint("contractor.js v2 starting, scanning " + servers.size + " servers...");

    // Find contracts
    const allContracts = [];
    for (const srv of servers) {
        for (const ct of ns.ls(srv, '.cct')) {
            try {
                const type = ns.codingcontract.getContractType(ct, srv);
                const data = ns.codingcontract.getData(ct, srv);
                if (data !== undefined && data !== null) {
                    allContracts.push({ contract: ct, hostname: srv, type: type, data: data });
                }
            } catch (e) { /* skip */ }
        }
    }

    if (allContracts.length === 0) return ns.tprint("No contracts found.");
    ns.tprint("Found " + allContracts.length + " contracts with data.");

    // Solve
    let solved = 0, failed = 0, skipped = 0;
    for (const c of allContracts) {
        const answer = solve(c.type, c.data);
        if (answer == null) { skipped++; continue; }
        try {
            const ok = ns.codingcontract.attempt(answer, c.contract, c.hostname, { returnReward: true });
            if (ok) { solved++; ns.tprint("SOLVED: " + c.contract + " (" + c.type + ")"); }
            else { failed++; ns.tprint("WRONG: " + c.contract + " (" + c.type + ") -> " + String(answer).substring(0, 80)); }
        } catch (e) { failed++; ns.tprint("ERROR: " + c.contract + ": " + String(e).substring(0, 80)); }
        await ns.sleep(10);
    }
    ns.tprint("Done: " + solved + " solved, " + failed + " wrong, " + skipped + " skipped");
}

function solve(type, data) {
    // Find Largest Prime Factor
    if (type === 'Find Largest Prime Factor') {
        if (typeof data === 'bigint') { var n=data,f=2n; while(n>(f-1n)*(f-1n)){while(n%f===0n)n=n/f;++f;} return (n===1n?f-1n:n).toString(); }
        var n=data,f=2; while(n>(f-1)*(f-1)){while(n%f===0)n=Math.round(n/f);++f;} return (n===1?f-1:n).toString();
    }
    // Subarray with Maximum Sum
    if (type === 'Subarray with Maximum Sum') {
        var a=data.slice(); for(var i=1;i<a.length;i++)a[i]=Math.max(a[i],a[i]+a[i-1]); return Math.max.apply(Math,a);
    }
    // Total Ways to Sum
    if (type === 'Total Ways to Sum') {
        var w=[1]; w.length=data+1; w.fill(0,1); for(var i=1;i<data;i++)for(var j=i;j<=data;j++)w[j]+=w[j-i]; return w[data];
    }
    // Total Ways to Sum II
    if (type === 'Total Ways to Sum II') {
        try{var n=Number(data[0]),a=data[1]; if(isNaN(n)||n<0)return null;if(!Array.isArray(a))return null;if(n===0)return 1;if(a.length===0)return 0;a=a.filter(function(x){return typeof x==='number'&&x>0&&x<=n;}).sort(function(x,y){return x-y;});if(a.length===0)return 0;var w=new Array(n+1).fill(0);w[0]=1;for(var i=0;i<a.length;i++)for(var j=a[i];j<=n;j++)w[j]+=w[j-a[i]];return w[n];}catch(e){return null;}
    }
    // Spiralize Matrix
    if (type === 'Spiralize Matrix') {
        var s=[],m=data.length,n=data[0].length,u=0,df=m-1,l=0,r=n-1,k=0;while(true){for(var c=l;c<=r;c++){s[k]=data[u][c];k++;}if(++u>df)break;for(var row=u;row<=df;row++){s[k]=data[row][r];k++;}if(--r<l)break;for(var c=r;c>=l;c--){s[k]=data[df][c];k++;}if(--df<u)break;for(var row=df;row>=u;row--){s[k]=data[row][l];k++;}if(++l>r)break;}return s;
    }
    // Array Jumping Game
    if (type === 'Array Jumping Game') {
        var n=data.length,i=0,r=0;for(;i<n&&i<=r;i++)r=Math.max(i+data[i],r);return i===n?1:0;
    }
    // Array Jumping Game II
    if (type === 'Array Jumping Game II') {
        var n=data.length;if(n<=1)return 0;if(data[0]===0)return-1;var j=0,ce=0,fa=0;for(var i=0;i<n-1;i++){fa=Math.max(fa,i+data[i]);if(i===ce){j++;ce=fa;if(ce>=n-1)break;}}return j;
    }
    // Merge Overlapping Intervals
    if (type === 'Merge Overlapping Intervals') {
        var iv=data.slice();iv.sort(function(a,b){return a[0]-b[0];});var res=[];var s2=iv[0][0],e=iv[0][1];for(var i=0;i<iv.length;i++){if(iv[i][0]<=e)e=Math.max(e,iv[i][1]);else{res.push([s2,e]);s2=iv[i][0];e=iv[i][1];}}res.push([s2,e]);var o=[];res.forEach(function(x){o.push('['+x.toString()+']');});return o.join(',').replace(/\s/g,'');
    }
    // Generate IP Addresses
    if (type === 'Generate IP Addresses') {
        var ret=[];for(var a=1;a<=3;a++)for(var b=1;b<=3;b++)for(var c=1;c<=3;c++)for(var x=1;x<=3;x++){if(a+b+c+x===data.length){var A=parseInt(data.substring(0,a),10),B=parseInt(data.substring(a,a+b),10),C=parseInt(data.substring(a+b,a+b+c),10),D=parseInt(data.substring(a+b+c,a+b+c+x),10);if(A<=255&&B<=255&&C<=255&&D<=255){var ip=[A.toString(),'.',B.toString(),'.',C.toString(),'.',D.toString()].join('');if(ip.length===data.length+3)ret.push(ip);}}}return ret;
    }
    // Algorithmic Stock Trader I
    if (type === 'Algorithmic Stock Trader I') {
        var p=data.map(Number);var mc=0,ms=0;for(var i=1;i<p.length;i++){mc=Math.max(0,mc+=p[i]-p[i-1]);ms=Math.max(mc,ms);}return ms.toString();
    }
    // Algorithmic Stock Trader II
    if (type === 'Algorithmic Stock Trader II') {
        var p=0;for(var i=1;i<data.length;i++)p+=Math.max(data[i]-data[i-1],0);return p.toString();
    }
    // Algorithmic Stock Trader III
    if (type === 'Algorithmic Stock Trader III') {
        var h1=-Infinity,h2=-Infinity,r1=0,r2=0;for(var i=0;i<data.length;i++){var price=data[i];r2=Math.max(r2,h2+price);h2=Math.max(h2,r1-price);r1=Math.max(r1,h1+price);h1=Math.max(h1,-price);}return r2.toString();
    }
    // Algorithmic Stock Trader IV
    if (type === 'Algorithmic Stock Trader IV') {
        var k=Number(data[0]),pr=data[1],len=pr.length;if(len<2)return 0;if(k>len/2){var res=0;for(var i=1;i<len;i++)res+=Math.max(pr[i]-pr[i-1],0);return res;}var hold=[],rele=[];hold.length=k+1;rele.length=k+1;for(var i=0;i<=k;i++){hold[i]=-Infinity;rele[i]=0;}for(var i=0;i<len;i++){var cur=pr[i];for(var j=k;j>0;j--){rele[j]=Math.max(rele[j],hold[j]+cur);hold[j]=Math.max(hold[j],rele[j-1]-cur);}}return rele[k].toString();
    }
    // Minimum Path Sum in a Triangle
    if (type === 'Minimum Path Sum in a Triangle') {
        var n=data.length,dp=data[n-1].slice();for(var i=n-2;i>-1;i--)for(var j=0;j<data[i].length;j++)dp[j]=Math.min(dp[j],dp[j+1])+data[i][j];return dp[0];
    }
    // Unique Paths in a Grid I
    if (type === 'Unique Paths in a Grid I') {
        var n=data[0],m=data[1],cr=[];cr.length=n;for(var i=0;i<n;i++)cr[i]=1;for(var row=1;row<m;row++)for(var i=1;i<n;i++)cr[i]+=cr[i-1];return cr[n-1];
    }
    // Unique Paths in a Grid II
    if (type === 'Unique Paths in a Grid II') {
        var og=[];og.length=data.length;for(var i=0;i<og.length;i++)og[i]=data[i].slice();for(var i=0;i<og.length;i++)for(var j=0;j<og[0].length;j++){if(og[i][j]==1)og[i][j]=0;else if(i==0&&j==0)og[0][0]=1;else og[i][j]=(i>0?og[i-1][j]:0)+(j>0?og[i][j-1]:0);}return og[og.length-1][og[0].length-1];
    }
    // Sanitize Parentheses in Expression
    if (type === 'Sanitize Parentheses in Expression') {
        var l=0,r=0,res=[];for(var i=0;i<data.length;i++){if(data[i]==='(')++l;else if(data[i]===')')l>0?--l:++r;}function dfs(p,idx,cl,cr,s,sol){if(s.length===idx){if(cl===0&&cr===0&&p===0){for(var i=0;i<res.length;i++)if(res[i]===sol)return;res.push(sol);}return;}if(s[idx]==='('){if(cl>0)dfs(p,idx+1,cl-1,cr,s,sol);dfs(p+1,idx+1,cl,cr,s,sol+s[idx]);}else if(s[idx]===')'){if(cr>0)dfs(p,idx+1,cl,cr-1,s,sol);if(p>0)dfs(p-1,idx+1,cl,cr,s,sol+s[idx]);}else{dfs(p,idx+1,cl,cr,s,sol+s[idx]);}}dfs(0,0,l,r,data,'');return res;
    }
    // Find All Valid Math Expressions
    if (type === 'Find All Valid Math Expressions') {
        var num=data[0],target=data[1];function helper(res,path,s,tar,pos,eval,mult){if(pos===s.length){if(tar===eval)res.push(path);return;}for(var i=pos;i<s.length;i++){if(i!=pos&&s[pos]==='0')break;var cur=parseInt(s.substring(pos,i+1));if(pos===0)helper(res,path+cur,s,tar,i+1,cur,cur);else{helper(res,path+'+'+cur,s,tar,i+1,eval+cur,cur);helper(res,path+'-'+cur,s,tar,i+1,eval-cur,-cur);helper(res,path+'*'+cur,s,tar,i+1,eval-mult+mult*cur,mult*cur);}}}if(!num||num.length===0)return[];var result=[];helper(result,'',num,target,0,0,0);return result;
    }
    // Compression I: RLE Compression
    if (type === 'Compression I: RLE Compression') {
        if(!data||data.length===0)return'';var r='',c=1;for(var i=1;i<data.length;i++){if(data[i]===data[i-1])c++;else{r+=c+data[i-1];c=1;}}r+=c+data[data.length-1];return r;
    }
    // Compression II: LZ Decompression
    if (type === 'Compression II: LZ Decompression') {
        var p='',i=0;while(i<data.length){var ll=data.charCodeAt(i)-0x30;if(ll<0||ll>9||i+1+ll>data.length)return null;p+=data.substring(i+1,i+1+ll);i+=1+ll;if(i>=data.length)break;var bl=data.charCodeAt(i)-0x30;if(bl<0||bl>9)return null;if(bl===0){i++;continue;}if(i+1>=data.length)return null;var bo=data.charCodeAt(i+1)-0x30;if(bo<1||bo>9)return null;if(bo>p.length)return null;for(var j=0;j<bl;j++)p+=p[p.length-bo];i+=2;}return p;
    }
    // Compression III: LZ Compression
    if (type === 'Compression III: LZ Compression') {
        if(!data||data.length===0)return'';var compressed='',decoded='',pos=0;while(pos<data.length){var lit='',bl=0,bo=0;while(pos+lit.length<data.length){var td=decoded+lit,bestBL=0,bestBO=0,ms=pos+lit.length;if(lit.length>0){for(var off=1;off<=Math.min(9,td.length);off++){var fl=0;while(fl<9&&ms+fl<data.length){var si=td.length-off+(fl%off);if(si<0||si>=td.length)break;if(data[ms+fl]===td[si])fl++;else break;}if(fl>bestBL){bestBL=fl;bestBO=off;}}}if(bestBL>=3){bl=bestBL;bo=bestBO;break;}if(lit.length>=9)break;lit+=data[pos+lit.length];}if(lit.length===0)lit=data[pos];pos+=lit.length;decoded+=lit;compressed+=String(lit.length)+lit;if(pos>=data.length)break;if(bl>=3){var br='';for(var j=0;j<bl;j++)br+=decoded[decoded.length-bo+(j%bo)];compressed+=String(bl)+String(bo);decoded+=br;pos+=bl;}else compressed+='0';}return compressed;
    }
    // Encryption I: Caesar Cipher
    if (type === 'Encryption I: Caesar Cipher') {
        var pt=data[0],sh=data[1],r='';for(var i=0;i<pt.length;i++){var a=pt.charCodeAt(i);if(a===32)r+=' ';else r+=String.fromCharCode(((a-65-sh+26)%26)+65);}return r;
    }
    // Encryption II: Vigenère Cipher
    if (type === 'Encryption II: Vigenère Cipher') {
        var pt,key;if(Array.isArray(data)){pt=data[0];key=data[1];}else{var si=data.lastIndexOf(' ');pt=data.substring(0,si);key=data.substring(si+1);}if(!/^[A-Z]+$/.test(key))return null;var r='';for(var i=0;i<pt.length;i++){var a=pt.charCodeAt(i);if(a>=65&&a<=90)r+=String.fromCharCode(((a-2*65+key.charCodeAt(i%key.length))%26)+65);else r+=pt[i];}return r;
    }
    // Proper 2-Coloring of a Graph
    if (type === 'Proper 2-Coloring of a Graph') {
        var nv,edges;if(Array.isArray(data[0])&&typeof data[0][0]==='number'&&!Array.isArray(data[0][0])){nv=data[0];edges=data[1];}else if(typeof data[0]==='number'&&Array.isArray(data[1])){nv=data[0];edges=data[1];}else{edges=data;nv=0;for(var i=0;i<edges.length;i++)nv=Math.max(nv,edges[i][0],edges[i][1]);nv++;}var adj=[];for(var i=0;i<nv;i++)adj[i]=[];for(var i=0;i<edges.length;i++){adj[edges[i][0]].push(edges[i][1]);adj[edges[i][1]].push(edges[i][0]);}var color=new Array(nv).fill(-1);for(var s=0;s<nv;s++){if(color[s]!==-1)continue;color[s]=0;var q=[s],h=0;while(h<q.length){var u=q[h++];for(var j=0;j<adj[u].length;j++){var v=adj[u][j];if(color[v]===-1){color[v]=1-color[u];q.push(v);}else if(color[v]===color[u])return[];}}}return color.slice(0,nv);
    }
    // Largest Rectangle in a Matrix
    if (type === 'Largest Rectangle in a Matrix') {
        var rows=data.length,cols=data[0].length,hist=[];for(var i=0;i<rows;i++){hist[i]=[];for(var j=0;j<cols;j++)hist[i][j]=0;}for(var i=0;i<cols;i++){var ct=0;for(var j=0;j<rows;j++){if(data[j][i]==0)ct++;else ct=0;hist[j][i]=ct;}}var maxA=0,maxL=0,maxR=0,maxU=0,maxD=0;for(var i=0;i<rows;i++){for(var j=0;j<cols;j++){if(hist[i][j]==0)continue;var l=j,r=j;while(l-1>=0&&hist[i][l-1]>=hist[i][j])l--;while(r+1<cols&&hist[i][r+1]>=hist[i][j])r++;if((r-l+1)*hist[i][j]>maxA){maxA=(r-l+1)*hist[i][j];maxL=l;maxR=r;maxU=i-hist[i][j]+1;maxD=i;}}}return [[maxU,maxL],[maxD,maxR]];
    }
    // Square Root
    if (type === 'Square Root') {
        var n;if(typeof data==='bigint')n=data;else if(typeof data==='string'){var s=data.startsWith('__BIGINT__')?data.slice(10):data;try{n=BigInt(s);}catch(e){return null;}}else if(typeof data==='number'&&!isNaN(data)&&isFinite(data))return Math.floor(Math.sqrt(data)).toString();else return null;if(n<0n)return null;if(n<2n)return n.toString();var lo=1n,hi=n;while(lo<=hi){var mid=(lo+hi)/2n,ms=mid*mid;if(ms===n)return mid.toString();if(ms<n)lo=mid+1n;else hi=mid-1n;}return hi.toString();
    }
    // HammingCodes: Integer to Encoded Binary
    if (type === 'HammingCodes: Integer to Encoded Binary') {
        var n=typeof data==='bigint'?data:BigInt(data);var bits=n.toString(2).split('').reverse().map(function(v){return parseInt(v);});var k=bits.length;var enc=[0];for(var i=1;k>0;i++){if((i&(i-1))!==0)enc[i]=bits[--k];else enc[i]=0;}var pn=0;for(var i=0;i<enc.length;i++)if(enc[i])pn^=i;var pa=pn.toString(2).split('').reverse().map(function(v){return parseInt(v);});for(var i=0;i<pa.length;i++)enc[Math.pow(2,i)]=pa[i]?1:0;pn=0;for(var i=0;i<enc.length;i++)if(enc[i])pn++;enc[0]=pn%2===0?0:1;return enc.join('');
    }
    // HammingCodes: Encoded Binary to Integer
    if (type === 'HammingCodes: Encoded Binary to Integer') {
        var enc=data.split('').map(function(v){return parseInt(v);});var m=0,n2=enc.length;while(Math.pow(2,m)<m+n2+1)m++;var pn=0;for(var i=0;i<n2;i++){var expected=0;for(var j=0;j<m;j++)if(i&(1<<j))expected^=enc[Math.pow(2,j)];if(enc[i]!==expected)pn^=i;}if(pn!==0&&pn<n2)enc[pn]=1-enc[pn];var dataBits=[];for(var i=1;i<n2;i++)if((i&(i-1))!==0)dataBits.push(enc[i]);dataBits.reverse();return parseInt(dataBits.join(''),2);
    }
    // Shortest Path in a Grid
    if (type === 'Shortest Path in a Grid') {
        var g=data,rows=g.length,cols=g[0].length;if(g[0][0]===1||g[rows-1][cols-1]===1)return'';var dist=[],parent=[];for(var i=0;i<rows;i++){dist[i]=new Array(cols).fill(-1);parent[i]=new Array(cols).fill(null);}dist[0][0]=0;var q=[[0,0]],h=0;var dirs=[['D',1,0],['R',0,1],['U',-1,0],['L',0,-1]];while(h<q.length){var cur=q[h++];if(cur[0]===rows-1&&cur[1]===cols-1)break;for(var x=0;x<dirs.length;x++){var nr=cur[0]+dirs[x][1],nc=cur[1]+dirs[x][2];if(nr>=0&&nr<rows&&nc>=0&&nc<cols&&g[nr][nc]===0&&dist[nr][nc]===-1){dist[nr][nc]=dist[cur[0]][cur[1]]+1;parent[nr][nc]=[cur[0],cur[1],dirs[x][0]];q.push([nr,nc]);}}}if(dist[rows-1][cols-1]===-1)return'';var path=[],cr=rows-1,cc=cols-1;while(cr!==0||cc!==0){var p=parent[cr][cc];path.push(p[2]);cr=p[0];cc=p[1];}path.reverse();return path.join('');
    }
    // Total Primes in Range / Total Number of Primes
    if (type === 'Total Primes in Range' || type === 'Total Number of Primes') {
        var low=Number(data[0]),high=Number(data[1]);if(high<2)return 0;if(low<2)low=2;if(high<=10000000){var s=new Array(high+1).fill(true);s[0]=s[1]=false;for(var i=2;i*i<=high;i++)if(s[i])for(var j=i*i;j<=high;j+=i)s[j]=false;var c=0;for(var i=low;i<=high;i++)if(s[i])c++;return c;}var sqH=Math.ceil(Math.sqrt(high)),sp=[],ss=new Array(sqH+1).fill(true);ss[0]=ss[1]=false;for(var i=2;i<=sqH;i++){if(ss[i]){sp.push(i);for(var j=i*i;j<=sqH;j+=i)ss[j]=false;}}var rs=high-low+1,seg=new Array(rs).fill(true);for(var p=0;p<sp.length;p++){var pr=sp[p],st=Math.max(pr,Math.ceil(low/pr))*pr;for(var j=st;j<=high;j+=pr)seg[j-low]=false;}var c=0;for(var i=0;i<rs;i++)if(seg[i])c++;return c;
    }

    return null; // Unknown contract type
}
