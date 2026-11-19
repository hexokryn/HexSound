const fs=require('node:fs'),path=require('node:path');
const dir=path.resolve(__dirname,'../src/vendor');fs.mkdirSync(dir,{recursive:true});
fs.copyFileSync(require.resolve('hls.js/dist/hls.min.js'),path.join(dir,'hls.min.js'));
const root=path.dirname(require.resolve('hls.js/package.json'));fs.copyFileSync(path.join(root,'LICENSE'),path.join(dir,'hls.LICENSE'));
