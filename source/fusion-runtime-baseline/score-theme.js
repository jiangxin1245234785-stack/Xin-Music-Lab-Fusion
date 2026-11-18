// Theme the real, shared album controls; scene-scoped CSS restores the other scenes.
(()=>{'use strict';const stage=document.querySelector('.stage'),select=document.getElementById('scoreStyle');if(!stage||!select)return;
 function sync(){const style=window.XinScoreMood?.normalize(select.value)||'starry';if(stage.dataset.scoreStyle!==style)stage.dataset.scoreStyle=style;}
 select.addEventListener('change',sync);window.addEventListener('xin-score-ready',sync);stage.addEventListener('scorelayoutchange',sync);new MutationObserver(sync).observe(stage,{attributes:true,attributeFilter:['data-effect','class']});sync();
})();
