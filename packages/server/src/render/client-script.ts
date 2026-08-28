import { TYPEWRITER_STEP_MS } from '@link-profile/shared';

/**
 * 公开页上唯一的客户端脚本。
 *
 * 公开页零 hydration：浏览器不下载也不解析 React runtime。这一小段原生 JS
 * 内联在文档尾部，做四件事：
 *
 * 1. 首屏画完之后才开始下载并播放头像位的视频 —— 封面图先渲染，
 *    **视频不得成为 LCP 元素**。
 * 2. 点击埋点（12 接上），以及把地址上的来源参数透传给开了这个开关的
 *    按钮（13 接上）。
 * 3. 简介逐字打出。
 * 4. 视频头像的静音切换。
 *
 * 后三件的顺序有讲究：埋点是线索统计的唯一来源，必须最先注册；打字机与
 * 静音切换各自 try 起来，谁抛异常都不会连累前面已经装好的东西。
 *
 * 写成一个字符串常量而不是单独打包，是为了省掉一次网络往返：
 * 它只有几百字节，内联比再发一个请求快。
 */
export const CLIENT_SCRIPT = `(function(){
var v=document.querySelector('video[data-autoplay]');
if(v){
  var start=function(){
    v.preload='auto';
    v.load();
    v.addEventListener('canplay',function(){var p=v.play();if(p&&p.catch)p.catch(function(){});},{once:true});
  };
  // 等首屏画完再动手，避免和封面图抢带宽
  if('requestIdleCallback' in window){requestIdleCallback(start,{timeout:2000});}
  else{addEventListener('load',function(){setTimeout(start,200);});}
}

var src=new URLSearchParams(location.search).get('src');

document.addEventListener('click',function(e){
  var a=e.target.closest&&e.target.closest('a[data-track]');
  if(!a)return;
  var body=JSON.stringify({kind:a.getAttribute('data-track'),id:a.getAttribute('data-track-id'),src:src});
  // sendBeacon 在页面跳走之后仍然会把请求发出去，不拦截这次点击
  if(navigator.sendBeacon){
    navigator.sendBeacon('/_api/track/click',new Blob([body],{type:'application/json'}));
  }else{
    fetch('/_api/track/click',{method:'POST',headers:{'content-type':'application/json'},body:body,keepalive:true}).catch(function(){});
  }
},true);

/*
 * 简介打字机排在埋点之后，并且单独 try 起来。
 *
 * 它是纯装饰，而上面那个点击监听是线索统计的唯一来源。同一个 IIFE 里
 * 只要它抛一次（老 webview 没有 matchMedia 之类），后面的代码就再也
 * 注册不上 —— 装饰功能没有资格拖垮业务埋点。
 *
 * 全文本来就在 DOM 里，这里只是先清空再逐字放回去；没有 JS 时那段文字
 * 照常显示，SSR 输出的是完整内容。
 */
try{
  var tw=document.querySelector('.pp-bio[data-tw]');
  var still=!window.matchMedia||!matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(tw&&still){
    var full=tw.textContent;
    // 先把高度钉住：清空那一帧若塌陷，底下整列条目会往上跳一下（CLS）
    tw.style.minHeight=tw.offsetHeight+'px';
    tw.textContent='';
    var i=0;
    (function tick(){
      tw.textContent=full.slice(0,++i);
      if(i<full.length)setTimeout(tick,${TYPEWRITER_STEP_MS});
    })();
  }
}catch(e){}

/*
 * 视频头像的静音切换。同样单独 try 起来，理由同上。
 *
 * 按钮的两个图标 SSR 时都画好了，这里只翻 aria-pressed，显示哪一个交给
 * CSS —— 不碰 innerHTML，零 hydration 边界不破。
 */
try{
  var mb=document.querySelector('.pp-mute');
  if(mb&&v){
    mb.addEventListener('click',function(){
      var wasMuted=v.muted;
      v.muted=!wasMuted;
      mb.setAttribute('aria-pressed',wasMuted?'true':'false');
      mb.setAttribute('aria-label',wasMuted?'关闭声音':'开启声音');
      // 自动播放被浏览器拦下过的话，这次点击是用户手势，正好补一次
      if(wasMuted){var p=v.play();if(p&&p.catch)p.catch(function(){});}
    });
  }
}catch(e){}
})();`;
