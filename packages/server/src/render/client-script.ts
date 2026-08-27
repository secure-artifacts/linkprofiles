/**
 * 公开页上唯一的客户端脚本。
 *
 * 公开页零 hydration：浏览器不下载也不解析 React runtime。这一小段原生 JS
 * 内联在文档尾部，只做两件事：
 *
 * 1. 首屏画完之后才开始下载并播放头像位的视频 —— 封面图先渲染，
 *    **视频不得成为 LCP 元素**。
 * 2. 点击埋点（12 接上），以及把地址上的来源参数透传给开了这个开关的
 *    按钮（13 接上）。
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
})();`;
